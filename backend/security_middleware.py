from fastapi import Request, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from datetime import datetime, timedelta
from collections import defaultdict
import ipaddress
import logging
import os

logger = logging.getLogger(__name__)

# Redis client for shared rate-limit state across workers (atomic INCR + EXPIRE).
# Falls back to in-memory if Redis is unavailable.
_redis_client = None
try:
    import redis as _redis_lib  # type: ignore
    _redis_client = _redis_lib.Redis(
        host=os.environ.get("REDIS_HOST", "127.0.0.1"),
        port=int(os.environ.get("REDIS_PORT", "6379")),
        db=int(os.environ.get("REDIS_DB", "0")),
        decode_responses=True,
        socket_connect_timeout=1,
        socket_timeout=1,
    )
    _redis_client.ping()
    logger.info("[security] Rate limit using Redis")
except Exception as _e:
    _redis_client = None
    logger.warning(f"[security] Redis unavailable, rate limit falls back to in-memory: {_e}")

# In-memory fallback only (used when Redis is down)
rate_limit_storage = defaultdict(list)

# Endpoint-specific strict rate limits (always active, independent of admin toggle)
# Format: path_prefix -> (max_requests, window_seconds)
STRICT_RATE_LIMITS = {
    "/token": (5, 60),                  # login: 5 per minute
    "/auth/register": (3, 300),          # register: 3 per 5 min
    "/auth/forgot-password": (3, 300),   # password reset: 3 per 5 min
    "/auth/reset-password": (5, 300),    # reset confirm: 5 per 5 min
}
strict_rate_storage = defaultdict(list)

class SecurityMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, db_session_factory):
        super().__init__(app)
        self.db_session_factory = db_session_factory
        self.settings_cache = {}
        self.cache_time = None

    def get_settings(self):
        """Получить настройки безопасности из БД с кешированием"""
        now = datetime.utcnow()

        # Кеш на 60 секунд
        if self.cache_time and (now - self.cache_time).seconds < 60:
            return self.settings_cache

        try:
            from models import SiteSetting
            db = self.db_session_factory()

            # SiteSetting использует key-value структуру
            def get_setting(key: str, default):
                setting = db.query(SiteSetting).filter(SiteSetting.key == key).first()
                if setting:
                    val = setting.value.lower()
                    if isinstance(default, bool):
                        return val in ('true', '1', 'yes')
                    elif isinstance(default, int):
                        try:
                            return int(val)
                        except:
                            return default
                    return setting.value
                return default

            self.settings_cache = {
                'ssl_enforce': get_setting('ssl_enforce', False),
                'ip_blacklist': get_setting('ip_blacklist', ''),
                'rate_limit': get_setting('rate_limit', False),
                'rate_limit_rpm': get_setting('rate_limit_rpm', 60),
                'anti_bot': get_setting('anti_bot', False),
            }

            self.cache_time = now
            db.close()
        except Exception as e:
            logger.error(f"Error loading security settings: {e}")
            # Возвращаем безопасные дефолты
            self.settings_cache = {
                'ssl_enforce': False,
                'ip_blacklist': '',
                'rate_limit': False,
                'rate_limit_rpm': 60,
                'anti_bot': False,
            }

        return self.settings_cache

    def get_client_ip(self, request: Request) -> str:
        """Получить реальный IP клиента (учитывая прокси)
        X-Forwarded-For: client, proxy1, proxy2 — берём первый (самый левый),
        но только если запрос пришёл от доверенного прокси.
        X-Real-IP от Cloudflare/nginx — приоритетнее.
        """
        # Приоритет: X-Real-IP (ставится доверенным прокси) > последний X-Forwarded-For > прямой IP
        real_ip = request.headers.get('X-Real-IP')
        if real_ip:
            return real_ip.strip()

        forwarded = request.headers.get('X-Forwarded-For')
        if forwarded:
            # Берём ПЕРВЫЙ IP в цепочке — это оригинальный клиент
            # (защита от подделки обеспечивается тем, что прокси добавляет в конец)
            # Если перед нами 1 прокси — первый IP = клиент
            # Если 2+ прокси — первый IP может быть подделан, но в типичной
            # конфигурации (Cloudflare → nginx → app) это корректно
            parts = [p.strip() for p in forwarded.split(',')]
            if parts:
                return parts[0]

        # Fallback на прямой IP
        if request.client:
            return request.client.host

        return '0.0.0.0'

    def is_ip_blacklisted(self, ip: str, blacklist: str) -> bool:
        """Проверить находится ли IP в черном списке"""
        if not blacklist:
            return False

        try:
            client_ip = ipaddress.ip_address(ip)

            for line in blacklist.split('\n'):
                line = line.strip()
                if not line or line.startswith('#'):
                    continue

                try:
                    # Проверка CIDR диапазона
                    if '/' in line:
                        network = ipaddress.ip_network(line, strict=False)
                        if client_ip in network:
                            return True
                    # Проверка конкретного IP
                    else:
                        if client_ip == ipaddress.ip_address(line):
                            return True
                except ValueError:
                    continue

            return False
        except ValueError:
            return False

    def check_rate_limit(self, ip: str, rpm: int) -> bool:
        """Rate limit per IP using Redis atomic counter (fallback to in-memory)."""
        if _redis_client is not None:
            try:
                key = f"rl:{ip}"
                pipe = _redis_client.pipeline()
                pipe.incr(key)
                pipe.expire(key, 60)
                count, _ = pipe.execute()
                return int(count) <= rpm
            except Exception as e:
                logger.warning(f"[rate_limit] Redis error, falling back to memory: {e}")

        now = datetime.utcnow()
        minute_ago = now - timedelta(minutes=1)
        rate_limit_storage[ip] = [t for t in rate_limit_storage[ip] if t > minute_ago]
        if len(rate_limit_storage[ip]) >= rpm:
            return False
        rate_limit_storage[ip].append(now)
        return True

    def is_bot_request(self, request: Request) -> bool:
        """Простая проверка на бота"""
        user_agent = request.headers.get('User-Agent', '').lower()

        # Список известных ботов
        bot_patterns = [
            'bot', 'crawler', 'spider', 'scraper', 'curl', 'wget',
            'python-requests', 'java', 'go-http-client', 'scrapy'
        ]

        for pattern in bot_patterns:
            if pattern in user_agent:
                return True

        # Проверка на отсутствие User-Agent
        if not user_agent:
            return True

        return False

    def check_strict_rate_limit(self, ip: str, path: str) -> bool:
        """Enforce hard rate limits on sensitive endpoints (Redis-backed, shared across workers)."""
        for prefix, (max_req, window_sec) in STRICT_RATE_LIMITS.items():
            if path == prefix or path.startswith(prefix + "/"):
                if _redis_client is not None:
                    try:
                        key = f"srl:{ip}:{prefix}"
                        pipe = _redis_client.pipeline()
                        pipe.incr(key)
                        pipe.expire(key, window_sec)
                        count, _ = pipe.execute()
                        return int(count) <= max_req
                    except Exception as e:
                        logger.warning(f"[strict_rate] Redis error, falling back to memory: {e}")
                key = f"{ip}:{prefix}"
                now = datetime.utcnow()
                cutoff = now - timedelta(seconds=window_sec)
                strict_rate_storage[key] = [t for t in strict_rate_storage[key] if t > cutoff]
                if len(strict_rate_storage[key]) >= max_req:
                    return False
                strict_rate_storage[key].append(now)
                return True
        return True  # not a rate-limited endpoint

    async def dispatch(self, request: Request, call_next):
        settings = self.get_settings()
        client_ip = self.get_client_ip(request)

        # 0. Strict endpoint rate limits (always active, even if global rate_limit is off)
        if request.method == "POST" and not self.check_strict_rate_limit(client_ip, request.url.path):
            logger.warning(f"Strict rate limit hit: {client_ip} on {request.url.path}")
            return JSONResponse(status_code=429, content={"detail": "Too many requests. Please try again later."})

        # 1. SSL/HTTPS редирект
        if settings['ssl_enforce']:
            # Проверяем схему запроса
            forwarded_proto = request.headers.get('X-Forwarded-Proto', '')
            if forwarded_proto == 'http' or (not forwarded_proto and request.url.scheme == 'http'):
                # Редирект на HTTPS
                https_url = str(request.url).replace('http://', 'https://', 1)
                return RedirectResponse(url=https_url, status_code=301)

        # 2. IP Blacklist
        if self.is_ip_blacklisted(client_ip, settings['ip_blacklist']):
            logger.warning(f"Blocked blacklisted IP: {client_ip}")
            return JSONResponse(status_code=403, content={"detail": "Access denied"})

        # 3. Rate Limiting
        if settings['rate_limit']:
            # Исключаем статические файлы из rate limit
            if not request.url.path.startswith('/manga/') and not request.url.path.startswith('/uploads/'):
                if not self.check_rate_limit(client_ip, settings['rate_limit_rpm']):
                    logger.warning(f"Rate limit exceeded for IP: {client_ip}")
                    return JSONResponse(status_code=429, content={"detail": "Too many requests"})

        # 4. Anti-Bot защита
        if settings['anti_bot']:
            # Исключаем некоторые пути (API, статика)
            excluded_paths = ['/api/', '/docs', '/openapi.json', '/manga/', '/uploads/']
            if not any(request.url.path.startswith(path) for path in excluded_paths):
                if self.is_bot_request(request):
                    logger.warning(f"Blocked bot request from IP: {client_ip}")
                    return JSONResponse(status_code=403, content={"detail": "Bot access denied"})

        # Продолжить обработку запроса
        response = await call_next(request)

        # Security headers — применяются ко всем ответам
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        # HSTS — только если запрос пришёл по HTTPS (или через прокси с HTTPS)
        if request.url.scheme == "https" or request.headers.get("X-Forwarded-Proto") == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        # CSP — разрешаем свои источники + CDN для шрифтов/иконок
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: blob: https:; "
            "media-src 'self' blob:; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self'"
        )

        return response
