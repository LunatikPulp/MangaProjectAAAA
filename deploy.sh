#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# SpringManga — Full server deployment script
# Run as root on a fresh Ubuntu 24.04 server
# Usage: bash deploy.sh
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

DOMAIN="springmanga.duckdns.org"
APP_USER="manga"
APP_DIR="/opt/manga"
BACKEND_DIR="${APP_DIR}/backend"
FRONTEND_DIR="${APP_DIR}/frontend"
DIST_DIR="${FRONTEND_DIR}/dist"
PUBLIC_DIR="${FRONTEND_DIR}/public"

echo "═══════════════════════════════════════════════════════════"
echo " SpringManga Deploy Script"
echo " Domain: ${DOMAIN}"
echo "═══════════════════════════════════════════════════════════"

# ── 1. System packages ────────────────────────────────────────
echo "[1/10] Installing system packages..."
apt-get update
apt-get install -y \
    python3.12 python3.12-venv python3-pip \
    nginx sqlite3 \
    redis-server \
    certbot python3-certbot-nginx \
    libnginx-mod-http-brotli-filter libnginx-mod-http-brotli-static \
    webp \
    curl wget git

# ── 2. Create app user ────────────────────────────────────────
echo "[2/10] Creating app user..."
id -u ${APP_USER} &>/dev/null || useradd -r -s /bin/false ${APP_USER}

# ── 3. Directory structure ────────────────────────────────────
echo "[3/10] Creating directory structure..."
mkdir -p ${BACKEND_DIR}
mkdir -p ${BACKEND_DIR}/uploads/avatars
mkdir -p ${BACKEND_DIR}/uploads/banners
mkdir -p ${BACKEND_DIR}/uploads/backgrounds
mkdir -p ${BACKEND_DIR}/uploads/personalization
mkdir -p ${BACKEND_DIR}/uploads/shop
mkdir -p ${BACKEND_DIR}/image_cache
mkdir -p ${BACKEND_DIR}/manga
mkdir -p ${DIST_DIR}
mkdir -p ${PUBLIC_DIR}
mkdir -p /var/cache/nginx/proxy
mkdir -p /var/cache/nginx/api

# ── 4. Backend Python venv ───────────────────────────────────
echo "[4/10] Setting up Python venv..."
python3.12 -m venv ${BACKEND_DIR}/venv
${BACKEND_DIR}/venv/bin/pip install --upgrade pip
${BACKEND_DIR}/venv/bin/pip install -r ${BACKEND_DIR}/requirements.txt
${BACKEND_DIR}/venv/bin/playwright install --with-deps chromium 2>/dev/null || true

# ── 5. Backend .env ─────────────────────────────────────────
echo "[5/10] Checking .env..."
if [ ! -f ${BACKEND_DIR}/.env ]; then
    echo "ERROR: Copy your .env file to ${BACKEND_DIR}/.env before continuing!"
    echo "  See ${BACKEND_DIR}/.env.example for required variables"
    exit 1
fi
chmod 600 ${BACKEND_DIR}/.env

# ── 6. Database ──────────────────────────────────────────────
echo "[6/10] Setting up database..."
if [ -f ${BACKEND_DIR}/manga_app.db.gz ]; then
    echo "  Restoring from manga_app.db.gz..."
    gunzip -k ${BACKEND_DIR}/manga_app.db.gz 2>/dev/null || true
    mv ${BACKEND_DIR}/manga_app.db ${BACKEND_DIR}/manga_app.db 2>/dev/null || true
elif [ -f ${BACKEND_DIR}/manga_app.db ]; then
    echo "  Using existing manga_app.db"
else
    echo "  WARNING: No database file found. Tables will be created on first run."
fi

# Generate cron admin token
echo "[6b] Generating cron admin JWT token..."
${BACKEND_DIR}/venv/bin/python3 -c "
from jose import jwt
import datetime, os
SECRET_KEY = os.environ.get('SECRET_KEY', open('${BACKEND_DIR}/.env').read().split('SECRET_KEY=')[1].split('\n')[0].strip())
expire = datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=36500)
token = jwt.encode({'sub': 'admin@example.com', 'exp': expire}, SECRET_KEY, algorithm='HS256')
with open('${BACKEND_DIR}/.cron_token', 'w') as f:
    f.write(token)
print('Cron token saved.')
"

# ── 7. Nginx configuration ───────────────────────────────────
echo "[7/10] Configuring nginx..."
rm -f /etc/nginx/sites-enabled/default

cat > /etc/nginx/sites-available/manga << 'NGINX_EOF'
server {
    server_name DOMAIN_PLACEHOLDER;

    client_max_body_size 50M;

    root FRONTEND_DIST_PLACEHOLDER;
    index index.html;

    # API image proxy - cache 7 days
    location /api/proxy/image {
        proxy_pass http://127.0.0.1:8000/proxy/image;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;

        proxy_cache imgcache;
        proxy_cache_valid 200 7d;
        proxy_cache_key "$uri?$args";
        add_header X-Cache-Status $upstream_cache_status;
        add_header Cache-Control "public, max-age=604800";
    }

    # API - home-sections (cache 2min)
    location /api/manga/home-sections {
        proxy_pass http://127.0.0.1:8000/manga/home-sections;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache apicache;
        proxy_cache_valid 200 2m;
        proxy_ignore_headers Set-Cookie Cache-Control;
        proxy_cache_key "$uri?$args";
        add_header X-Cache-Status $upstream_cache_status;
        add_header Cache-Control "public, max-age=120";
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }

    # API - manga list (cache 1min)
    location /api/manga/list {
        proxy_pass http://127.0.0.1:8000/manga/list;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache apicache;
        proxy_cache_valid 200 1m;
        proxy_ignore_headers Set-Cookie Cache-Control;
        proxy_cache_key "$uri?$args";
        add_header X-Cache-Status $upstream_cache_status;
        add_header Cache-Control "public, max-age=60";
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }

    # API - proxy to backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 60s;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }

    # Static uploads
    location /uploads/ {
        alias BACKEND_UPLOADS_PLACEHOLDER;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    location /static/ {
        alias BACKEND_MANGA_PLACEHOLDER;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /image_cache/ {
        alias BACKEND_CACHE_PLACEHOLDER;
        expires 30d;
        add_header Cache-Control "public, max-age=604800";
    }

    location /Frames/ {
        alias FRONTEND_DIST_PLACEHOLDER/Frames/;
        expires 30d;
    }

    location "/Achievement Icons/" {
        alias "FRONTEND_DIST_PLACEHOLDER/Achievement Icons/";
        expires 30d;
    }

    # Hashed JS/CSS chunks - cache forever
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Service Worker - no cache
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
    # index.html - always revalidate so deploys take effect immediately
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX_EOF

sed -i "s|DOMAIN_PLACEHOLDER|${DOMAIN}|g" /etc/nginx/sites-available/manga
sed -i "s|FRONTEND_DIST_PLACEHOLDER|${DIST_DIR}|g" /etc/nginx/sites-available/manga
sed -i "s|BACKEND_UPLOADS_PLACEHOLDER|${BACKEND_DIR}/uploads/|g" /etc/nginx/sites-available/manga
sed -i "s|BACKEND_MANGA_PLACEHOLDER|${BACKEND_DIR}/manga/|g" /etc/nginx/sites-available/manga
sed -i "s|BACKEND_CACHE_PLACEHOLDER|${BACKEND_DIR}/image_cache/|g" /etc/nginx/sites-available/manga

ln -sf /etc/nginx/sites-available/manga /etc/nginx/sites-enabled/manga

# Nginx main config — add proxy cache zones and brotli
if ! grep -q "proxy_cache_path" /etc/nginx/nginx.conf; then
    cat > /tmp/nginx_patch.py << 'PY_EOF'
import re
with open("/etc/nginx/nginx.conf", "r") as f:
    cfg = f.read()
insert = """
    # Proxy cache for images
    proxy_cache_path /var/cache/nginx/proxy levels=1:2 keys_zone=imgcache:10m
                     max_size=500m inactive=7d use_temp_path=off;

    # Proxy cache for API responses
    proxy_cache_path /var/cache/nginx/api levels=1:2 keys_zone=apicache:10m
                     max_size=200m inactive=5m use_temp_path=off;

    # Brotli static pre-compressed files
    brotli_static on;
"""
cfg = cfg.replace("    include /etc/nginx/conf.d/*.conf;", insert + "\n    include /etc/nginx/conf.d/*.conf;")
with open("/etc/nginx/nginx.conf", "w") as f:
    f.write(cfg)
print("nginx.conf patched")
PY_EOF
    python3 /tmp/nginx_patch.py
    rm -f /tmp/nginx_patch.py
fi

nginx -t

# ── 8. Redis configuration ───────────────────────────────────
echo "[8/10] Configuring Redis..."
sed -i 's/^# maxmemory/maxmemory 128mb/' /etc/redis/redis.conf
sed -i 's/^maxmemory.*/maxmemory 128mb/' /etc/redis/redis.conf
systemctl enable redis-server
systemctl restart redis-server

# ── 9. Systemd service ───────────────────────────────────────
echo "[9/10] Creating systemd service..."
cat > /etc/systemd/system/manga.service << EOF
[Unit]
Description=Manga Web App (FastAPI)
After=network.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${BACKEND_DIR}
EnvironmentFile=${BACKEND_DIR}/.env
ExecStart=${BACKEND_DIR}/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8000 --workers 2
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=${BACKEND_DIR} /tmp /home/${APP_USER}
Environment=PLAYWRIGHT_BROWSERS_PATH=${BACKEND_DIR}/venv/lib/python3.12/site-packages/playwright/driver/package/.local-browsers

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable manga

# ── 10. Permissions & SSL ────────────────────────────────────
echo "[10/10] Setting permissions..."
chown -R ${APP_USER}:${APP_USER} ${APP_DIR}
chmod 600 ${BACKEND_DIR}/.env
chmod 600 ${BACKEND_DIR}/.cron_token
chown -R www-data:www-data /var/cache/nginx

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " Setup complete! Next steps:"
echo ""
echo " 1. Copy frontend dist/ to ${DIST_DIR}/"
echo "    (excluding heavy assets, then copy from public/:"
echo "     cp -r public/Frames_shop public/Logo public/'Achievement Icons'"
echo "     public/Horror_design public/money dist/)"
echo ""
echo " 2. Copy backend *.py files to ${BACKEND_DIR}/"
echo ""
echo " 3. Get SSL certificate:"
echo "    certbot --nginx -d ${DOMAIN}"
echo ""
echo " 4. Start the app:"
echo "    systemctl start manga"
echo "    systemctl reload nginx"
echo ""
echo " 5. Verify:"
echo "    systemctl status manga"
echo "    curl -s http://localhost:8000/manga/home-sections | head -c 100"
echo "═══════════════════════════════════════════════════════════"
