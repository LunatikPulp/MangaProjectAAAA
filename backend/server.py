import os
import re
import json
import requests
from urllib.parse import urljoin, urlparse
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
from concurrent.futures import ThreadPoolExecutor, as_completed
from time import sleep, time
from playwright.async_api import async_playwright
import sys
import asyncio
from tqdm import tqdm
import aiohttp
import aiofiles
from typing import List, Dict, Optional, Tuple
from bs4 import BeautifulSoup
from PIL import Image
from fastapi import FastAPI, HTTPException, Query, Body, BackgroundTasks, Depends, status, Request, UploadFile, File as FastAPIFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, HttpUrl
import uvicorn
from contextlib import asynccontextmanager
import hashlib
from fastapi.staticfiles import StaticFiles
from datetime import timedelta, datetime

# Local imports
from database import engine, SessionLocal, Base, get_db, DB_PATH
from models import User, ChapterView, ChapterLike, ChapterMeta, MangaItem, MangaView, MangaRating, MangaBookmark, ReadingHistory, Chapter, WallComment, MangaComment, CommentLike, Friendship, UserBlock, DirectMessage, WallCommentReply, UserNotification
import auth
from auth import get_current_user, get_optional_user, get_password_hash, verify_password, create_access_token

# Create DB tables
Base.metadata.create_all(bind=engine)

# Миграция: добавляем новые колонки в users если их нет
def migrate_users_table():
    import sqlite3
    db_path = DB_PATH
    if not os.path.exists(db_path):
        return
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(users)")
    columns = {row[1] for row in cursor.fetchall()}
    if "email" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN email TEXT")
        # Заполняем email из username для существующих записей
        cursor.execute("UPDATE users SET email = username WHERE email IS NULL")
        print("[MIGRATION] Добавлена колонка email в users")
    if "role" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'")
        print("[MIGRATION] Добавлена колонка role в users")
    if "status" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'")
        print("[MIGRATION] Добавлена колонка status в users")
    new_cols = {
        "avatar_url": "TEXT DEFAULT ''",
        "about": "TEXT DEFAULT ''",
        "birthday": "TEXT DEFAULT ''",
        "gender": "TEXT DEFAULT ''",
        "erotic_filter": "TEXT DEFAULT 'hide'",
        "private_profile": "INTEGER DEFAULT 0",
        "allow_trades": "INTEGER DEFAULT 1",
        "notify_email": "INTEGER DEFAULT 1",
        "notify_vk": "INTEGER DEFAULT 0",
        "notify_telegram": "INTEGER DEFAULT 0",
        "google_id": "TEXT DEFAULT ''",
    }
    for col_name, col_type in new_cols.items():
        if col_name not in columns:
            cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
            print(f"[MIGRATION] Добавлена колонка {col_name} в users")
    conn.commit()
    conn.close()

migrate_users_table()

# Миграция: добавляем колонку chapters в manga_items если её нет
def migrate_manga_items_table():
    import sqlite3
    db_path = DB_PATH
    if not os.path.exists(db_path):
        return
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    # Проверяем, существует ли таблица
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='manga_items'")
    if not cursor.fetchone():
        conn.close()
        return
    cursor.execute("PRAGMA table_info(manga_items)")
    columns = {row[1] for row in cursor.fetchall()}
    if "chapters" not in columns:
        cursor.execute("ALTER TABLE manga_items ADD COLUMN chapters TEXT DEFAULT '[]'")
        print("[MIGRATION] Добавлена колонка chapters в manga_items")
    conn.commit()
    conn.close()

migrate_manga_items_table()

# Миграция: переносим главы из JSON blob в отдельную таблицу chapters
def migrate_chapters_to_table():
    import sqlite3
    db_path = DB_PATH
    if not os.path.exists(db_path):
        return
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    # Проверяем: таблица chapters существует (создана SQLAlchemy выше) и пуста
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='chapters'")
    if not cursor.fetchone():
        conn.close()
        return
    cursor.execute("SELECT COUNT(*) FROM chapters")
    if cursor.fetchone()[0] > 0:
        conn.close()
        return  # Уже мигрировано
    # Читаем все manga_items с непустыми chapters
    cursor.execute("SELECT manga_id, chapters FROM manga_items WHERE chapters IS NOT NULL AND chapters != '[]' AND chapters != ''")
    rows = cursor.fetchall()
    if not rows:
        conn.close()
        return
    count = 0
    for manga_id, chapters_json in rows:
        try:
            chapters = json.loads(chapters_json)
        except (json.JSONDecodeError, TypeError):
            continue
        for ch in chapters:
            cid = str(ch.get("chapter_id", ch.get("id", "")))
            if not cid:
                continue
            pages = ch.get("pages", [])
            cursor.execute(
                "INSERT OR IGNORE INTO chapters (manga_id, chapter_id, title, chapter_number, date_added, pages, total_pages) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    manga_id,
                    cid,
                    ch.get("name", ch.get("title", "")),
                    str(ch.get("chapter_number", "")),
                    ch.get("date_added", ""),
                    json.dumps(pages, ensure_ascii=False) if isinstance(pages, list) else str(pages),
                    len(pages) if isinstance(pages, list) else 0,
                )
            )
            count += 1
    conn.commit()
    conn.close()
    print(f"[MIGRATION] Перенесено {count} глав в таблицу chapters")

migrate_chapters_to_table()


def fix_chapter_ids_and_titles():
    """Fix chapter_id containing '/' and duplicate 'Глава Глава' in titles"""
    import sqlite3
    if not os.path.exists(DB_PATH):
        return
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='chapters'")
    if not cursor.fetchone():
        conn.close()
        return

    # Fix chapter_id: replace "/" with "-"
    cursor.execute("SELECT id, chapter_id, title, chapter_number FROM chapters WHERE chapter_id LIKE '%/%' OR title LIKE '%Глава Глава%' OR chapter_number LIKE '%Глава%'")
    rows = cursor.fetchall()
    if not rows:
        conn.close()
        return
    count = 0
    for row_id, cid, title, ch_num in rows:
        new_cid = cid.replace("/", "-") if "/" in cid else cid
        new_title = title
        new_ch_num = ch_num or ""
        # Fix "Глава Глава5" -> extract number and rebuild
        if "Глава Глава" in (title or ""):
            num_m = re.search(r'[\d]+(?:\.[\d]+)?', title)
            num = num_m.group(0) if num_m else ""
            new_title = f"Глава {num}" if num else title
        # Fix chapter_number containing "Глава" prefix
        if "Глава" in (ch_num or "") or "глава" in (ch_num or ""):
            num_m = re.search(r'[\d]+(?:\.[\d]+)?', ch_num)
            new_ch_num = num_m.group(0) if num_m else ch_num
        cursor.execute("UPDATE chapters SET chapter_id=?, title=?, chapter_number=? WHERE id=?",
                       (new_cid, new_title, new_ch_num, row_id))
        count += 1
    conn.commit()
    conn.close()
    if count:
        print(f"[MIGRATION] Исправлено {count} глав (chapter_id, title, chapter_number)")

fix_chapter_ids_and_titles()


def upsert_chapters(db: Session, manga_id: str, chapters_list: list):
    """Upsert глав в таблицу chapters"""
    seen_ids = set()
    for ch in chapters_list:
        cid = str(ch.get("chapter_id", ch.get("id", "")))
        if not cid:
            continue
        # Дедупликация внутри одного батча
        key = f"{manga_id}:{cid}"
        if key in seen_ids:
            continue
        seen_ids.add(key)
        pages = ch.get("pages", [])
        existing = db.query(Chapter).filter(
            Chapter.manga_id == manga_id,
            Chapter.chapter_id == cid
        ).first()
        if existing:
            existing.title = ch.get("name", ch.get("title", existing.title))
            existing.chapter_number = str(ch.get("chapter_number", existing.chapter_number or ""))
            existing.date_added = ch.get("date_added", existing.date_added or "")
            existing.pages = json.dumps(pages, ensure_ascii=False) if isinstance(pages, list) else str(pages)
            existing.total_pages = len(pages) if isinstance(pages, list) else 0
        else:
            db.add(Chapter(
                manga_id=manga_id,
                chapter_id=cid,
                title=ch.get("name", ch.get("title", "")),
                chapter_number=str(ch.get("chapter_number", "")),
                date_added=ch.get("date_added", ""),
                pages=json.dumps(pages, ensure_ascii=False) if isinstance(pages, list) else str(pages),
                total_pages=len(pages) if isinstance(pages, list) else 0,
            ))
            db.flush()
    db.flush()


def chapters_from_db(db: Session, manga_id: str) -> list:
    """Читаем главы из таблицы chapters и возвращаем в формате JSON-совместимом с фронтом"""
    rows = db.query(Chapter).filter(Chapter.manga_id == manga_id).order_by(Chapter.id).all()
    result = []
    for r in rows:
        try:
            pages = json.loads(r.pages) if r.pages else []
        except (json.JSONDecodeError, TypeError):
            pages = []
        # Extract volume from chapter_id format "vol-ch" (e.g. "1-5")
        title = r.title or ""
        vol_match = re.match(r'^(\d+)-', r.chapter_id or "")
        vol = vol_match.group(1) if vol_match else ""
        # Build display title with volume if not already present
        if vol and "Том" not in title:
            display_title = f"Том {vol} {title}" if title else f"Том {vol}"
        else:
            display_title = title

        result.append({
            "chapter_id": r.chapter_id,
            "name": display_title,
            "title": display_title,
            "chapter_number": r.chapter_number,
            "date_added": r.date_added,
            "pages": pages,
            "total_pages": r.total_pages,
            "volume": vol,
        })
    return result


# Создаём аккаунт админа при первом запуске
def ensure_admin_exists():
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == "admin@example.com").first()
        if not admin:
            admin = User(
                username="admin",
                email="admin@example.com",
                hashed_password=get_password_hash("admin123"),
                role="admin",
                status="active",
            )
            db.add(admin)
            db.commit()
            print("[INIT] Создан аккаунт админа: admin@example.com / admin123")
        else:
            # Убедимся что роль — admin
            if admin.role != "admin":
                admin.role = "admin"
                db.commit()
                print("[INIT] Роль admin восстановлена для admin@example.com")
    finally:
        db.close()

ensure_admin_exists()

BASE_URL = "https://mangabuff.ru"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1"
}

# --- Mangabuff account credentials for 18+ content ---
MANGABUFF_EMAIL = os.environ.get("MANGABUFF_EMAIL", "basovroma765@gmail.com")
MANGABUFF_PASSWORD = os.environ.get("MANGABUFF_PASSWORD", "66625422")

# Cached auth cookies from mangabuff login
_mangabuff_auth_cookies: Optional[dict] = None

async def mangabuff_login() -> dict:
    """Login to mangabuff.ru and return session cookies for 18+ access."""
    global _mangabuff_auth_cookies
    if _mangabuff_auth_cookies:
        return _mangabuff_auth_cookies

    import aiohttp
    from bs4 import BeautifulSoup as BS

    jar = aiohttp.CookieJar()
    async with aiohttp.ClientSession(headers=HEADERS, cookie_jar=jar) as sess:
        # 1. GET /login → grab CSRF token
        async with sess.get(f"{BASE_URL}/login") as resp:
            html = await resp.text()
            soup = BS(html, "html.parser")
            meta = soup.select_one('meta[name="csrf-token"]')
            csrf_token = meta["content"] if meta else ""

        if not csrf_token:
            print("[mangabuff_login] WARNING: no CSRF token found")
            return {}

        # 2. POST /login
        async with sess.post(
            f"{BASE_URL}/login",
            headers={
                "X-CSRF-TOKEN": csrf_token,
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": f"{BASE_URL}/login",
                "X-Requested-With": "XMLHttpRequest",
            },
            data={
                "_token": csrf_token,
                "email": MANGABUFF_EMAIL,
                "password": MANGABUFF_PASSWORD,
            },
        ) as resp:
            body = await resp.json()
            if not body.get("status"):
                print(f"[mangabuff_login] Login failed: {body}")
                return {}

        # 3. Extract cookies
        from yarl import URL
        cookies = {}
        for cookie in sess.cookie_jar:
            cookies[cookie.key] = cookie.value

        _mangabuff_auth_cookies = cookies
        print(f"[mangabuff_login] Logged in successfully, got {len(cookies)} cookies")
        return cookies

# Глобальный кеш для хранения информации о манге
manga_cache = {}
browser_pool = None

class MangaRequest(BaseModel):
    url: HttpUrl
    max_chapters: Optional[int] = None

class Token(BaseModel):
    access_token: str
    token_type: str

class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class ProfileUpdate(BaseModel):
    username: Optional[str] = None
    about: Optional[str] = None
    birthday: Optional[str] = None
    gender: Optional[str] = None
    erotic_filter: Optional[str] = None
    private_profile: Optional[bool] = None
    allow_trades: Optional[bool] = None
    notify_email: Optional[bool] = None
    notify_vk: Optional[bool] = None
    notify_telegram: Optional[bool] = None
    bio: Optional[str] = None
    profile_theme: Optional[str] = None
    avatar_frame: Optional[str] = None
    showcase_manga_ids: Optional[str] = None

class PasswordChange(BaseModel):
    old_password: str
    new_password: str

class EmailChange(BaseModel):
    password: str
    new_email: str

class RoleUpdate(BaseModel):
    role: str

class StatusUpdate(BaseModel):
    status: str

class MangaResponse(BaseModel):
    title: str
    alternative_titles: Dict[str, str] = {}
    description: str
    genres: List[str] = []
    cover_url: Optional[str] = None
    local_cover_path: Optional[str] = None
    additional_info: Dict = {}
    chapters: List[Dict] = []
    total_chapters: int
    source_url: str
    manga_id: str

class ChapterResponse(BaseModel):
    chapter_id: str
    name: str
    pages: List[str] = []
    total_pages: int
    download_status: str
    date_added: Optional[str] = None
    views: int = 0
    likes: int = 0
    is_liked: bool = False

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global browser_pool
    print("🚀 Запуск сервера парсера манги...")
    browser_pool = await async_playwright().start()
    yield
    # Shutdown
    print("🛑 Остановка сервера...")
    if browser_pool:
        await browser_pool.stop()

app = FastAPI(
    title="Manga Parser API",
    description="API для парсинга манги с MangaBuff.ru",
    version="1.0.0",
    lifespan=lifespan
)

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
MANGA_DIR = os.path.join(BACKEND_DIR, "manga")
UPLOADS_DIR = os.path.join(BACKEND_DIR, "uploads")
AVATARS_DIR = os.path.join(UPLOADS_DIR, "avatars")
BANNERS_DIR = os.path.join(UPLOADS_DIR, "banners")
os.makedirs(MANGA_DIR, exist_ok=True)
os.makedirs(AVATARS_DIR, exist_ok=True)
os.makedirs(BANNERS_DIR, exist_ok=True)

# Раздаём файлы из папки "manga" по адресу /static
app.mount("/static", StaticFiles(directory=MANGA_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# 👇 Разрешаем фронту обращаться к API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # для отладки — можно потом ограничить ["http://localhost:5173"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class FastMangaParser:
    def __init__(self, max_workers: int = 10):
        self.max_workers = max_workers
        
    def sanitize_filename(self, name: str) -> str:
        """Очистка имени файла от недопустимых символов"""
        return re.sub(r'[\\/*?:"<>|]', "_", name).strip()[:100]
    
    def get_manga_id(self, url: str) -> str:
        """Генерируем уникальный ID для манги на основе URL"""
        return hashlib.md5(url.encode()).hexdigest()
    
    async def download_image_async(self, session: aiohttp.ClientSession, url: str, path: str, retries: int = 3) -> bool:
        """Асинхронное скачивание изображения"""
        if os.path.exists(path):
            return True
        if url.startswith("/"):
             url = urljoin(BASE_URL, url)
        
        headers = {
            **HEADERS,
            "Referer": BASE_URL,
            "Accept": "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
        }
        
        for attempt in range(retries):
            try:
                async with session.get(url, headers=headers, timeout=30) as response:
                    if response.status == 200:
                        content = await response.read()
                        os.makedirs(os.path.dirname(path), exist_ok=True)
                        async with aiofiles.open(path, 'wb') as f:
                            await f.write(content)
                        return True
            except Exception as e:
                if attempt == retries - 1:
                    print(f"[WARN] Не удалось скачать {url}: {e}")
                await asyncio.sleep(0.5)
        return False
    
    async def download_images_batch(self, img_urls: List[Tuple[str, str]]) -> int:
        """Пакетная загрузка изображений"""
        connector = aiohttp.TCPConnector(limit=self.max_workers, force_close=True)
        timeout = aiohttp.ClientTimeout(total=300)
        
        async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
            tasks = []
            for url, path in img_urls:
                task = self.download_image_async(session, url, path)
                tasks.append(task)
            
            results = await asyncio.gather(*tasks)
            return sum(results)

    def slice_long_image(self, image_path: str, max_ratio: float = 2.2, overlap: int = 30) -> List[str]:
        """Нарезает длинное изображение на части, если height/width > max_ratio"""
        try:
            # Увеличиваем лимит для очень больших изображений (защита PIL)
            Image.MAX_IMAGE_PIXELS = None
            
            with Image.open(image_path) as img:
                width, height = img.size
                
                # Если изображение не открылось или размеры странные
                if width == 0 or height == 0:
                    return [image_path]

                ratio = height / width
                
                # Если соотношение нормальное, не режем
                # Увеличили порог до 3.5, чтобы обычные длинные страницы не резались
                if ratio <= max_ratio:
                    return [image_path]
                
                # Рассчитываем высоту фрагмента
                # Оптимально для экранов: ~1.5 ширины (формат 2:3, как стандартное фото/книга)
                # Это гарантирует, что фрагмент влезет в экран целиком без прокрутки
                target_height = int(width * 1.2)
                
                # Защита от слишком маленьких фрагментов (чтобы не было вечного цикла с overlap)
                if target_height < 700:
                    target_height = 900
                
                # Ограничиваем максимальную высоту в пикселях (чтобы точно влезло в 4K экран по вертикали)
                if target_height > 3000:
                    target_height = 3000
                
                slices = []
                base_name = os.path.splitext(image_path)[0]
                ext = os.path.splitext(image_path)[1]
                
                current_y = 0
                part_idx = 1
                
                # Защита от бесконечного цикла
                max_parts = 100 
                
                while current_y < height and part_idx <= max_parts:
                    # Определяем высоту текущего куска
                    slice_height = target_height
                    
                    # Если остаток меньше минимального размера (например, 20% от целевого),
                    # то лучше приклеить его к предыдущему куску или просто оставить как есть
                    # Но здесь мы просто берем остаток
                    if current_y + slice_height >= height:
                        slice_height = height - current_y
                    
                    # Координаты обрезки (left, top, right, bottom)
                    box = (0, current_y, width, current_y + slice_height)
                    
                    # Нарезаем
                    slice_img = img.crop(box)
                    
                    # Сохраняем
                    slice_filename = f"{base_name}_part{part_idx:03d}{ext}"
                    # Используем качество 85 (золотая середина размер/качество)
                    if ext.lower() in ['.jpg', '.jpeg']:
                        slice_img.save(slice_filename, quality=85, optimize=True)
                    else:
                        slice_img.save(slice_filename)
                        
                    slices.append(slice_filename)
                    
                    # Сдвигаем курсор
                    current_y += slice_height
                    
                    # Если достигли конца - выходим
                    if current_y >= height:
                        break
                    
                    # Делаем нахлест назад
                    current_y -= overlap
                    
                    # Защита: если после вычитания overlap мы не продвинулись вперед (или ушли назад),
                    # принудительно двигаем вперед, чтобы избежать зацикливания
                    # Это может случиться, если slice_height <= overlap (маловероятно при наших проверках, но всё же)
                    if slice_height <= overlap:
                         current_y += (overlap + 1)
                        
                    part_idx += 1
            
            # Удаляем оригинал только если нарезка прошла успешно и создано > 1 файла
            if len(slices) > 1:
                try:
                    os.remove(image_path)
                except:
                    pass
                return slices
            
            return [image_path]
            
        except Exception as e:
            print(f"[WARN] Не удалось нарезать изображение {image_path}: {e}")
            return [image_path]
    
    async def get_full_manga_info(self, page) -> Dict:
        """Получаем полную информацию о манге"""
        print("Извлекаем полную информацию о манге...")
        
        # Ждем появления основного контента
        try:
            await page.wait_for_selector('h1, [data-testid="title"], .title, .manga-title', timeout=10000)
            await asyncio.sleep(2)
        except:
            print("Предупреждение: не удалось дождаться полной загрузки, продолжаем...")
            await asyncio.sleep(1)
        
        # Пробуем развернуть все теги
        try:
            print("Разворачиваем все теги...")
            await page.evaluate("""
                () => {
                    const showMoreButtons = document.querySelectorAll('button, span, div');
                    showMoreButtons.forEach(element => {
                        const text = element.textContent || '';
                        if (text.includes('Показать все') || 
                            text.includes('...') || 
                            element.className.includes('show-more') ||
                            element.className.includes('expand')) {
                            try {
                                element.click();
                            } catch(e) {}
                        }
                    });
                    
                    const badges = document.querySelectorAll('.badge');
                    badges.forEach(badge => {
                        if (badge.textContent && badge.textContent.includes('Показать все')) {
                            try {
                                badge.click();
                            } catch(e) {}
                        }
                    });
                }
            """)
            await asyncio.sleep(1)
        except:
            print("Не удалось развернуть теги, продолжаем...")
        
        # Извлекаем данные
        info = await page.evaluate(r"""
            () => {
                const data = {};
                
                // Название на русском
                const titleEl = document.querySelector('h1, [data-testid="title"], .title, .manga-title');
                data.title = titleEl ? titleEl.textContent.trim() : 'Без названия';
                
                // Альтернативные названия
                data.alternative_titles = {};
                
                // Ищем блок с альтернативными названиями
                const infoBlocks = document.querySelectorAll('.publication-info > div, .manga-info > div, .info-block, div');
                infoBlocks.forEach(block => {
                    const text = block.textContent || '';
                    
                    if (text.includes('Английское название:') || text.includes('English:')) {
                        const match = text.match(/(?:Английское название:|English:)\s*(.+?)(?:\n|$)/);
                        if (match) data.alternative_titles.english = match[1].trim();
                    }
                    
                    if (text.includes('Корейское название:') || text.includes('Korean:')) {
                        const match = text.match(/(?:Корейское название:|Korean:)\s*(.+?)(?:\n|$)/);
                        if (match) data.alternative_titles.korean = match[1].trim();
                    }
                    
                    if (text.includes('Японское название:') || text.includes('Japanese:')) {
                        const match = text.match(/(?:Японское название:|Japanese:)\s*(.+?)(?:\n|$)/);
                        if (match) data.alternative_titles.japanese = match[1].trim();
                    }
                });

                // Специальный парсинг альтернативных названий (структура WebFandom)
                const altCandidates = Array.from(document.querySelectorAll('[class*="text-wf-light"]'));
                let altNamesDiv = document.querySelector('.flex.flex-wrap.gap-1.text-sm.text-wf-light');
                if (!altNamesDiv) {
                    altNamesDiv = altCandidates.find(el => {
                        const text = (el.textContent || '').trim();
                        const hasTruncate = el.querySelectorAll('.truncate').length > 0;
                        return (hasTruncate || text.includes('/')) && text.length < 200;
                    }) || null;
                }
                if (altNamesDiv) {
                    const rawParts = altNamesDiv.querySelectorAll('.truncate');
                    let names = [];
                    if (rawParts.length > 0) {
                        rawParts.forEach(p => {
                            let t = (p.textContent || '').replace(/\s+/g, ' ').trim();
                            t = t.replace(/^[\s\/]+/, '').trim();
                            if (t && t !== '/' && t !== '—') names.push(t);
                        });
                    } else {
                        const text = altNamesDiv.textContent || '';
                        names = text
                            .split('/')
                            .map(t => t.replace(/\s+/g, ' ').trim())
                            .filter(t => t && t !== '—');
                    }
                    if (names.length > 0) {
                        data.additional_info_alt_names = names; 
                    }
                }
                
                // Поиск обложки
                let coverUrl = null;
                
                const pictureElement = document.querySelector('picture');
                if (pictureElement) {
                    const imgInPicture = pictureElement.querySelector('img');
                    if (imgInPicture && imgInPicture.src && !imgInPicture.src.startsWith('data:')) {
                        coverUrl = imgInPicture.src;
                    }
                }
                
                if (!coverUrl) {
                    const imgSelectors = [
                        'img[class*="object-cover"]',
                        'img[src*="catalog/publication"]',
                        'img[alt*="обложка"]',
                        'img[alt*="cover"]',
                        '.cover img',
                        '.manga-cover img',
                        '.publication-cover img',
                        'img.w-full'
                    ];

                    for (const sel of imgSelectors) {
                        try {
                            const el = document.querySelector(sel);
                            if (el && el.src &&
                                !el.src.startsWith('data:') &&
                                !el.src.includes('avatar') &&
                                !el.src.includes('user_photo') &&
                                !el.src.includes('logo') &&
                                !el.src.includes('icon')) {
                                coverUrl = el.src;
                                break;
                            }
                        } catch(e) {}
                    }
                }
                
                if (!coverUrl) {
                    const imgs = Array.from(document.querySelectorAll('img'));
                    const bigImg = imgs.find(img => 
                        img.src && 
                        !img.src.startsWith('data:') &&
                        img.naturalWidth > 200 && 
                        img.naturalHeight > 300 &&
                        !img.src.includes('avatar') &&
                        !img.src.includes('logo')
                    );
                    if (bigImg) coverUrl = bigImg.src;
                }
                
                data.cover_url = coverUrl;
                
                // Описание
                let description = '';
                const descSelectors = [
                    '.publication-description',
                    '.whitespace-pre-wrap',
                    '.description',
                    '.manga-description',
                    '[class*="description"]',
                    'div.font-light'
                ];
                
                for (const sel of descSelectors) {
                    try {
                        const el = document.querySelector(sel);
                        if (el && el.textContent && el.textContent.length > 50) {
                            description = el.textContent.trim();
                            break;
                        }
                    } catch(e) {}
                }
                
                data.description = description || 'Описание отсутствует';
                
                // Собираем ВСЕ теги
                const allTags = new Set();
                
                const tagSelectors = [
                    'a .badge.text-wf-yellow',
                    'a .badge',
                    '.badge',
                    '.genre',
                    '.tag',
                    'a[href*="/catalog?genres"]',
                    'a[href*="/catalog?tags"]',
                    '.genres a',
                    '.tags a',
                    '[class*="badge"]:not([class*="show"])'
                ];
                
                tagSelectors.forEach(sel => {
                    try {
                        document.querySelectorAll(sel).forEach(el => {
                            let text = el.textContent.trim();
                            
                            if (text && 
                                text.length > 1 && 
                                text !== '...' && 
                                !text.includes('Показать все') &&
                                !text.includes('Скрыть') &&
                                !text.includes('Свернуть')) {
                                
                                const parentLink = el.closest('a');
                                if (parentLink && parentLink.href && parentLink.href.includes('/catalog')) {
                                    text = parentLink.textContent.trim();
                                }
                                
                                if (text && !text.includes('Показать')) {
                                    allTags.add(text);
                                }
                            }
                        });
                    } catch(e) {}
                });
                
                try {
                    document.querySelectorAll('a[href*="/catalog"]').forEach(link => {
                        const badge = link.querySelector('.badge');
                        if (badge) {
                            const text = badge.textContent.trim();
                            if (text && !text.includes('Показать') && text !== '...') {
                                allTags.add(text);
                            }
                        }
                    });
                } catch(e) {}
                
                data.genres = Array.from(allTags);
                
                // Дополнительная информация
                data.additional_info = {};
                if (data.additional_info_alt_names) {
                     data.additional_info.alternative_names = data.additional_info_alt_names;
                }

                const findTextValue = (labelList) => {
                    const nodes = Array.from(document.querySelectorAll('*'));
                    for (const node of nodes) {
                        const text = node.textContent || '';
                        for (const label of labelList) {
                            if (text.includes(label)) {
                                const match = text.match(new RegExp(label + '\\\\s*[:]?\\\\s*(.+?)(?:\\\\n|$)'));
                                if (match && match[1]) return match[1].trim();
                            }
                        }
                    }
                    return null;
                };

                const yearText = findTextValue(['Год выпуска', 'Выпуск', 'Год']);
                if (yearText) {
                    const yearMatch = yearText.match(/\d{4}/);
                    if (yearMatch) data.additional_info.year = parseInt(yearMatch[0]);
                }

                const statusText = findTextValue(['Статус перевода', 'Статус']);
                if (statusText) {
                    data.additional_info.status = statusText;
                }

                const ageText = findTextValue(['Возрастное ограничение', 'Возрастной рейтинг', 'Возраст']);
                if (ageText) {
                    const ageMatch = ageText.match(/\d+\+?/);
                    if (ageMatch) {
                        const rawAge = ageMatch[0].replace(/\s/g, '');
                        data.additional_info.age_rating = rawAge === '18+' ? '18' : rawAge;
                    }
                }
                if (!data.additional_info.age_rating) {
                    const ageTag = data.genres.find(t => /^\d+\+$/.test(t));
                    if (ageTag) {
                        data.additional_info.age_rating = ageTag.replace('+', '') === '18' ? '18' : ageTag;
                    }
                }

                // Статистика
                const stats = {
                    status_counts: {}
                };

                const statusKeywords = ['Читаю', 'Буду читать', 'Прочитано', 'Отложено', 'Не интересно', 'Любимое', 'Брошено', 'Другое'];
                statusKeywords.forEach(keyword => {
                    const els = Array.from(document.querySelectorAll('*')).filter(el => 
                        el.textContent && el.textContent.trim() === keyword && el.children.length === 0
                    );
                    
                    els.forEach(el => {
                        let count = null;
                        // Проверяем соседа
                        let sibling = el.nextElementSibling;
                        if (sibling && sibling.textContent.match(/^[\d\.]+K?M?$/)) {
                             count = sibling.textContent.trim();
                        } else if (el.parentElement) {
                             // Проверяем соседние элементы в родителе
                             const parent = el.parentElement;
                             const countEl = Array.from(parent.children).find(c => c !== el && c.textContent.match(/^[\d\.]+K?M?$/));
                             if (countEl) count = countEl.textContent.trim();
                        }
                        if (count) stats.status_counts[keyword] = count;
                    });
                });
                
                // Пытаемся найти рейтинг
                // Ищем "Рейтинг за последнее время:"
                const ratingLabel = Array.from(document.querySelectorAll('*')).find(el => el.textContent.includes('Рейтинг за последнее время'));
                if (ratingLabel) {
                    const ratingValue = ratingLabel.parentElement.querySelector('.font-bold');
                    if (ratingValue) stats.rating = ratingValue.textContent.trim();
                }

                data.additional_info.statistics = stats;
                
                try {
                    const allElements = document.querySelectorAll('*');
                    allElements.forEach(el => {
                        const text = el.textContent || '';
                        if (text.includes('Автор')) {
                            const authorMatch = text.match(/Автор[:\s]+(.+?)(?:\n|$)/);
                            if (authorMatch) data.additional_info.author = authorMatch[1].trim();
                        }
                        
                        if (text.includes('Художник')) {
                            const artistMatch = text.match(/Художник[:\s]+(.+?)(?:\n|$)/);
                            if (artistMatch) data.additional_info.artist = artistMatch[1].trim();
                        }
                    });
                } catch(e) {}
                
                if (data.alternative_titles && Array.isArray(data.alternative_titles.other)) {
                    data.alternative_titles.other = data.alternative_titles.other.join(', ');
                }
                return data;
            }
        """)
        
        return info

    async def extract_images_from_chapter(self, page) -> List[str]:
        """Извлекаем ВСЕ картинки из главы (Nuxt + img + data-* + scroll)"""
        img_urls = await page.evaluate(r"""
            () => {
                const images = [];

                // Проверяем глобальные переменные
                if (window.images) return window.images;
                if (window.chapterImages) return window.chapterImages;
                if (window.pageImages) return window.pageImages;

                // Ищем изображения в Nuxt data
                if (window.__NUXT__ && window.__NUXT__.data) {
                    const findImages = (obj, depth = 0) => {
                        if (depth > 10) return [];
                        const imgs = [];
                        if (typeof obj === 'string' && obj.match(/\.(jpg|jpeg|png|webp)/i)) {
                            imgs.push(obj);
                        } else if (Array.isArray(obj)) {
                            obj.forEach(item => imgs.push(...findImages(item, depth + 1)));
                        } else if (typeof obj === 'object' && obj !== null) {
                            Object.values(obj).forEach(val => imgs.push(...findImages(val, depth + 1)));
                        }
                        return imgs;
                    };
                    const nuxtImages = findImages(window.__NUXT__.data);
                    if (nuxtImages.length > 0) return nuxtImages;
                }

                // Парсим <script> для поиска JSON с картинками
                const scripts = document.querySelectorAll('script');
                for (const script of scripts) {
                    const text = script.textContent;
                    if (!text) continue;
                    const urlMatches = text.matchAll(/https?:\/\/[^"'\s,\]]+\.(?:jpg|jpeg|png|webp)/gi);
                    for (const match of urlMatches) {
                        images.push(match[0]);
                    }
                }

                // Собираем из DOM (src и data-атрибуты)
                document.querySelectorAll('img').forEach(img => {
                    if (img.src && !img.src.startsWith('data:')) images.push(img.src);
                    ['data-src', 'data-original', 'data-lazy-src'].forEach(attr => {
                        const val = img.getAttribute(attr);
                        if (val) images.push(val);
                    });
                });

                // Убираем дубликаты и системные иконки
                return [...new Set(images)].filter(url =>
                    !url.includes('avatar') &&
                    !url.includes('logo') &&
                    !url.includes('icon') &&
                    !url.includes('button')
                );
            }
        """)

        # ⚡ Прокрутка, чтобы подгрузились ленивые картинки
        if not img_urls or len(img_urls) < 2:
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await asyncio.sleep(2)
            img_urls = await page.evaluate("""
                () => Array.from(document.querySelectorAll('img'))
                    .map(img => img.src)
                    .filter(u => u && !u.startsWith('data:'))
            """)

        return img_urls
    
    async def process_chapter_async(self, browser, chapter: Dict, ch_idx: int, manga_dir: str, download_images: bool = True) -> Dict:
        """Асинхронная обработка главы"""
        context = await browser.new_context(user_agent=HEADERS["User-Agent"])
        page = await context.new_page()
        page.set_default_timeout(30000)
        
        try:
            await page.goto(chapter['url'], wait_until='domcontentloaded')
            await asyncio.sleep(1)
            
            # Быстрое извлечение изображений
            img_urls = await self.extract_images_from_chapter(page)
            
            chapter_result = {
                **chapter,
                "chapter_id": chapter.get("chapter_id", f"{ch_idx}"),
                "total_pages": len(img_urls),
                "pages": [],
                "download_status": "pending"
            }
            
            if not img_urls:
                chapter_result["download_status"] = "no_images"
                await context.close()
                return chapter_result
            
            # Создаем папку для главы
            ch_dir = os.path.join(manga_dir, f"chapter_{ch_idx:03d}_{self.sanitize_filename(chapter['name'])}")
            
            if download_images:
                os.makedirs(ch_dir, exist_ok=True)
                
                # Подготавливаем список для загрузки
                download_list = []
                
                for idx, img_url in enumerate(img_urls, 1):
                    ext = "jpg"
                    if any(x in img_url.lower() for x in ['.png', '.webp', '.jpeg']):
                        ext = img_url.split('.')[-1].split('?')[0].lower()[:4]
                    
                    filename = os.path.join(ch_dir, f"page_{idx:03d}.{ext}")
                    # делаем относительный путь от папки manga
                    relative_path = os.path.relpath(filename, "manga").replace("\\", "/")
                    # теперь фронт будет получать /static/...
                    chapter_result["pages"].append(f"/static/{relative_path}")
                    download_list.append((img_url, filename))

                # Загружаем изображения асинхронно
                downloaded = await self.download_images_batch(download_list)
                
                # После загрузки - нарезаем длинные картинки
                if downloaded > 0:
                    final_pages = []
                    # download_list содержит (url, local_path)
                    
                    # Сортируем download_list по индексу страницы, чтобы порядок был верным
                    download_list.sort(key=lambda x: x[1])
                    
                    for _, filename in download_list:
                        if os.path.exists(filename):
                            # ОТКЛЮЧЕНО: Нарезка длинных изображений
                            # Фронтенд теперь сам умеет обрабатывать длинные картинки (виртуализация)
                            # Поэтому просто отдаем оригинальный файл
                            
                            # Очищаем старые нарезанные части, если они есть, чтобы не занимали место
                            try:
                                base_name = os.path.splitext(filename)[0]
                                ext = os.path.splitext(filename)[1]
                                import glob
                                old_parts = glob.glob(f"{base_name}_part*{ext}")
                                for p in old_parts:
                                    try:
                                        os.remove(p)
                                    except:
                                        pass
                            except:
                                pass
                                
                            slices = [filename]
                            
                            # Преобразуем локальные пути в URL для фронтенда
                            for slice_path in slices:
                                relative_path = os.path.relpath(slice_path, "manga").replace("\\", "/")
                                final_pages.append(f"/static/{relative_path}")
                    
                    # Обновляем список страниц в результате
                    chapter_result["pages"] = final_pages
                    chapter_result["total_pages"] = len(final_pages)
                
                chapter_result["download_status"] = "completed" if downloaded > 0 else "failed"
            else:
                # Просто сохраняем URL изображений
                chapter_result["pages"] = img_urls
                chapter_result["download_status"] = "urls_only"
            
            await context.close()
            return chapter_result
            
        except Exception as e:
            print(f"[ERROR] Ошибка при обработке главы {chapter['name']}: {e}")
            chapter_result["download_status"] = "error"
            chapter_result["error"] = str(e)
            await context.close()
            return chapter_result
    
    # ─── API-based methods (no Playwright) ───

    def extract_slug_from_url(self, url: str) -> str:
        """Извлекает slug из URL вида https://mangabuff.ru/manga/solo-leveling → solo-leveling"""
        parsed = urlparse(str(url))
        path = parsed.path.strip("/")
        parts = path.split("/")
        if len(parts) >= 2 and parts[0] == "manga":
            return parts[1]
        return parts[-1] if parts else path

    async def fetch_chapter_images_api(
        self, session: aiohttp.ClientSession, sem: asyncio.Semaphore, chapter_url: str
    ) -> List[str]:
        """Получает список URL картинок главы через HTML-парсинг reader-страницы mangabuff"""
        if not chapter_url.startswith("http"):
            chapter_url = f"{BASE_URL}{chapter_url}"
        async with sem:
            try:
                async with session.get(chapter_url, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status != 200:
                        print(f"[WARN] Chapter page {chapter_url} returned {resp.status}")
                        return []
                    html = await resp.text()
                    soup = BeautifulSoup(html, "html.parser")
                    images = []
                    for img in soup.select(".reader__pages img"):
                        src = img.get("data-src") or img.get("src") or ""
                        if src and not src.startswith("data:"):
                            if src.startswith("/"):
                                src = f"{BASE_URL}{src}"
                            images.append(src)
                    return images
            except Exception as e:
                print(f"[WARN] Ошибка при получении картинок главы {chapter_url}: {e}")
                return []

    async def get_csrf_token(self, session: aiohttp.ClientSession) -> str:
        """Получает CSRF-токен с mangabuff.ru"""
        try:
            async with session.get(BASE_URL, headers=HEADERS) as resp:
                html = await resp.text()
                soup = BeautifulSoup(html, "html.parser")
                meta = soup.select_one('meta[name*="csrf-token"]')
                return meta["content"] if meta else ""
        except Exception as e:
            print(f"[WARN] Не удалось получить CSRF-токен: {e}")
            return ""

    async def get_manga_info_api(self, url: str, max_chapters: Optional[int] = None) -> Dict:
        """Получение информации о манге через HTML-парсинг mangabuff.ru"""
        slug = self.extract_slug_from_url(url)
        manga_page_url = f"{BASE_URL}/manga/{slug}"

        connector = aiohttp.TCPConnector(limit=30, force_close=True)
        timeout = aiohttp.ClientTimeout(total=120)

        async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
            # Загружаем страницу манги
            async with session.get(manga_page_url, headers=HEADERS) as resp:
                if resp.status != 200:
                    raise Exception(f"mangabuff вернул {resp.status} для {manga_page_url}")
                html = await resp.text()

            soup = BeautifulSoup(html, "html.parser")

            # --- Извлечение данных из HTML ---
            # Название
            h1 = soup.select_one("h1")
            title = h1.get_text(strip=True) if h1 else "Без названия"

            # Описание
            desc_el = soup.select_one(".manga__description")
            description = desc_el.get_text(strip=True) if desc_el else "Описание отсутствует"

            # Обложка
            cover_url = ""
            cover_img = soup.select_one(".manga__img img")
            if cover_img:
                cover_url = cover_img.get("src") or cover_img.get("data-src") or ""
            if not cover_url:
                cover_url = f"{BASE_URL}/img/manga/posters/{slug}.jpg"
            if cover_url and cover_url.startswith("/"):
                cover_url = f"{BASE_URL}{cover_url}"

            # Жанры — ссылки в .manga__middle-links кроме последней (статус)
            genre_links = soup.select(".manga__middle-links > a")
            genres = []
            status_text = ""
            if genre_links:
                for a in genre_links[:-1]:
                    g = a.get_text(strip=True)
                    if g:
                        genres.append(g)
                status_text = genre_links[-1].get_text(strip=True) if genre_links else ""

            # Теги
            tags = []
            for tag_el in soup.select(".tags > .tags__item"):
                t = tag_el.get_text(strip=True)
                if t:
                    tags.append(t)

            # Альтернативные названия
            alt_names = []
            for span in soup.select(".manga__name-alt > span"):
                n = span.get_text(strip=True)
                if n:
                    alt_names.append(n)

            # manga data-id (для POST /chapters/load)
            manga_el = soup.select_one(".manga[data-id]") or soup.select_one("[data-id]")
            manga_data_id = manga_el.get("data-id", "") if manga_el else ""

            # Рейтинг
            rating_el = soup.select_one(".manga__rating")
            rating_text = rating_el.get_text(strip=True) if rating_el else ""

            # Дополнительная информация
            additional_info = {}
            if status_text:
                additional_info["status"] = status_text
            if tags:
                additional_info["tags"] = tags
            if alt_names:
                additional_info["alternative_names"] = alt_names

            # Определяем тип по жанрам
            all_genres_lower = [g.lower() for g in genres]

            # Пропускаем синглы
            if any("сингл" in g for g in all_genres_lower):
                return None

            if any("oel-манга" in g for g in all_genres_lower):
                additional_info["type"] = "OEL-Manga"
            elif any("руманга" in g for g in all_genres_lower):
                additional_info["type"] = "Rukomiks"
            elif any("комикс западный" in g for g in all_genres_lower):
                additional_info["type"] = "Western"
            elif any("маньхуа" in g for g in all_genres_lower):
                additional_info["type"] = "Manhua"
            elif any("манхва" in g for g in all_genres_lower):
                additional_info["type"] = "Manhwa"
            else:
                additional_info["type"] = "Manga"

            # Извлекаем возрастной рейтинг из жанров
            for g in genres:
                if g in ('+18', '18+'):
                    additional_info["age_rating"] = "18+"
                    break
                elif g in ('16+', '16'):
                    additional_info["age_rating"] = "16+"
                    break
                elif g in ('14+', '12+'):
                    additional_info["age_rating"] = g if g.endswith('+') else g + '+'
                    break

            alternative_titles = {}
            if alt_names:
                for i, name in enumerate(alt_names):
                    if i == 0:
                        alternative_titles["english"] = name
                    elif i == 1:
                        alternative_titles["original"] = name

            # --- Парсинг глав ---
            def simple_hash(s: str) -> str:
                h = 0
                for c in s:
                    h = ((h << 5) - h + ord(c)) & 0xFFFFFFFF
                return format(h, 'x')

            chapters = []
            for a in soup.select("a.chapters__item"):
                href = a.get("href", "")
                ch_url = f"{BASE_URL}{href}" if href.startswith("/") else href

                vol_el = a.select_one(".chapters__volume")
                val_el = a.select_one(".chapters__value")
                name_el = a.select_one(".chapters__name")
                date_el = a.select_one(".chapters__add-date")

                vol_raw = vol_el.get_text(strip=True) if vol_el else ""
                num_raw = val_el.get_text(strip=True) if val_el else ""
                ch_name = name_el.get_text(strip=True) if name_el else ""
                date_added = date_el.get_text(strip=True) if date_el else ""

                # Убираем префиксы "Том"/"Глава" если они уже в тексте
                vol = re.sub(r'^(?:Том|Vol\.?)\s*', '', vol_raw, flags=re.IGNORECASE).strip()
                num = re.sub(r'^(?:Глава|Chapter|Ch\.?)\s*', '', num_raw, flags=re.IGNORECASE).strip()

                if vol and num:
                    label = f"Том {vol} Глава {num}"
                elif num:
                    label = f"Глава {num}"
                elif num_raw:
                    label = num_raw  # если после очистки пусто, берём как есть
                else:
                    label = ch_name or "Глава"

                ch_slug = href.strip("/").split("/")[-1] if href else ""

                chapters.append({
                    "name": label,
                    "url": ch_url,
                    "chapter_id": simple_hash(ch_url),
                    "chapter_slug": ch_slug,
                    "date_added": date_added,
                    "views": 0,
                    "likes": 0,
                })

            # Подгрузка остальных глав через POST /chapters/load с пагинацией
            load_trigger = soup.select_one(".load-chapters-trigger")
            if load_trigger and manga_data_id:
                print(f"[PARSE] Подгрузка дополнительных глав (data-id={manga_data_id})...")
                try:
                    csrf_token = await self.get_csrf_token(session)
                    load_headers = {
                        **HEADERS,
                        "X-CSRF-TOKEN": csrf_token,
                        "X-Requested-With": "XMLHttpRequest",
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Referer": manga_page_url,
                    }
                    # Пагинация: offset начинаем с кол-ва уже имеющихся глав
                    offset = len(chapters)
                    max_pages = 30  # защита от бесконечного цикла
                    for page_i in range(max_pages):
                        post_data = {"manga_id": manga_data_id, "offset": str(offset)}
                        print(f"[PARSE] POST /chapters/load data={post_data}")
                        async with session.post(
                            f"{BASE_URL}/chapters/load",
                            headers=load_headers,
                            data=post_data,
                            timeout=aiohttp.ClientTimeout(total=30),
                        ) as load_resp:
                            print(f"[PARSE] /chapters/load status={load_resp.status}")
                            if load_resp.status != 200:
                                print(f"[WARN] /chapters/load вернул {load_resp.status}")
                                break
                            load_raw = await load_resp.text()
                            # Ответ может быть JSON с HTML внутри
                            load_html = load_raw
                            try:
                                import json as _json
                                parsed_json = _json.loads(load_raw)
                                if isinstance(parsed_json, str):
                                    load_html = parsed_json
                                elif isinstance(parsed_json, dict):
                                    # Берём первое строковое значение (обычно HTML)
                                    for v in parsed_json.values():
                                        if isinstance(v, str) and len(v) > 100:
                                            load_html = v
                                            break
                            except (ValueError, TypeError):
                                pass  # не JSON — используем как есть
                            load_soup = BeautifulSoup(load_html, "html.parser")
                            new_items = load_soup.select("a.chapters__item")
                            print(f"[PARSE] /chapters/load: {len(new_items)} chapters found")
                            if not new_items:
                                break
                            added = 0
                            for a in new_items:
                                href = a.get("href", "")
                                if href.startswith("http"):
                                    ch_url = href
                                elif href.startswith("/"):
                                    ch_url = f"{BASE_URL}{href}"
                                else:
                                    continue
                                if any(c["url"] == ch_url for c in chapters):
                                    continue

                                vol_el = a.select_one(".chapters__volume")
                                val_el = a.select_one(".chapters__value")
                                name_el = a.select_one(".chapters__name")
                                date_el = a.select_one(".chapters__add-date")

                                vol_raw = vol_el.get_text(strip=True) if vol_el else ""
                                num_raw = val_el.get_text(strip=True) if val_el else ""
                                ch_name = name_el.get_text(strip=True) if name_el else ""
                                date_added = date_el.get_text(strip=True) if date_el else ""

                                vol = re.sub(r'^(?:Том|Vol\.?)\s*', '', vol_raw, flags=re.IGNORECASE).strip()
                                num = re.sub(r'^(?:Глава|Chapter|Ch\.?)\s*', '', num_raw, flags=re.IGNORECASE).strip()

                                if vol and num:
                                    label = f"Том {vol} Глава {num}"
                                elif num:
                                    label = f"Глава {num}"
                                elif num_raw:
                                    label = num_raw
                                else:
                                    label = ch_name or "Глава"

                                ch_slug = href.strip("/").split("/")[-1] if href else ""

                                chapters.append({
                                    "name": label,
                                    "url": ch_url,
                                    "chapter_id": simple_hash(ch_url),
                                    "chapter_slug": ch_slug,
                                    "date_added": date_added,
                                    "views": 0,
                                    "likes": 0,
                                })
                                added += 1
                            print(f"[PARSE] offset={offset}: получено {len(new_items)} элементов, новых {added}")
                            if added == 0:
                                break
                            offset += len(new_items)
                except Exception as e:
                    print(f"[WARN] Не удалось подгрузить дополнительные главы: {e}")

            # Сортировка глав по номеру (от 1 к последней)
            def extract_sort_key(ch):
                m = re.search(r'(\d+(?:\.\d+)?)', ch.get("name", ""))
                return float(m.group(1)) if m else 999999
            chapters.sort(key=extract_sort_key)
            print(f"[PARSE] Итого глав: {len(chapters)}")

            if max_chapters:
                chapters = chapters[:max_chapters]

            # --- Получаем картинки для каждой главы параллельно ---
            sem = asyncio.Semaphore(5)
            print(f"[PARSE] Загружаем картинки для {len(chapters)} глав...")

            async def fetch_for_chapter(ch: Dict) -> Dict:
                ch_url = ch.get("url", "")
                if not ch_url:
                    ch["pages"] = []
                    ch["total_pages"] = 0
                    return ch
                images = await self.fetch_chapter_images_api(session, sem, ch_url)
                ch["pages"] = images
                ch["total_pages"] = len(images)
                ch["download_status"] = "urls_only"
                return ch

            chapters = await asyncio.gather(*[fetch_for_chapter(ch) for ch in chapters])
            chapters = list(chapters)

            manga_id = self.get_manga_id(url)

            # Чистим жанры от типов, годов, возрастных рейтингов, мусора
            _skip_genres = {'манга', 'манхва', 'маньхуа', 'oel-манга', 'сингл', 'руманга',
                            'комикс западный', '+18', '12+', '14+', '16', '16+', '18+',
                            '1', '2', 'нет', 'япония'}
            clean_genres = [g for g in (genres + tags)
                           if g.strip() and g.strip().lower() not in _skip_genres
                           and not re.match(r'^\d{4}$', g.strip())]

            manga_info = {
                "title": title,
                "alternative_titles": alternative_titles,
                "description": description,
                "genres": clean_genres,
                "cover_url": cover_url,
                "additional_info": additional_info,
                "chapters": chapters,
                "total_chapters": len(chapters),
                "source_url": str(url),
                "manga_id": manga_id,
            }

            # Скачиваем обложку
            if cover_url and not cover_url.startswith("data:"):
                manga_dir = os.path.join("manga", self.sanitize_filename(title))
                covers_dir = os.path.join(manga_dir, "covers")
                os.makedirs(covers_dir, exist_ok=True)
                cover_path = os.path.join(covers_dir, "main_cover.jpg")
                try:
                    async with session.get(cover_url, headers={**HEADERS, "Referer": BASE_URL}) as r:
                        if r.status == 200:
                            content = await r.read()
                            async with aiofiles.open(cover_path, 'wb') as f:
                                await f.write(content)
                            manga_info["local_cover_path"] = cover_path
                            print(f"[PARSE] Обложка сохранена: {cover_path}")
                except Exception as e:
                    print(f"[WARN] Не удалось скачать обложку: {e}")

            print(f"[PARSE] Готово: {title}, {len(chapters)} глав")
            return manga_info

    async def get_manga_info(self, url: str, max_chapters: Optional[int] = None) -> Dict:
        """Получение информации о манге с загрузкой первых глав и картинок (Playwright fallback)"""
        browser = await browser_pool.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
            ]
        )

        def fix_page_url(page_url: str) -> str:
            """Исправляем относительные пути на полные ссылки"""
            if page_url.startswith("http"):
                return page_url
            return f"{BASE_URL}{page_url}"

        try:
            context = await browser.new_context(
                user_agent=HEADERS["User-Agent"],
                viewport={"width": 1920, "height": 1080}
            )

            page = await context.new_page()
            page.set_default_timeout(30000)

            print(f"Переходим на страницу: {url}")

            try:
                await page.goto(url, wait_until='domcontentloaded')
            except Exception as e:
                print(f"Предупреждение при загрузке страницы: {e}")

            # Получаем метаданные манги
            manga_info = await self.get_full_manga_info(page)
            manga_info["source_url"] = url
            manga_info["manga_id"] = self.get_manga_id(url)

            # Определяем тип и чистим жанры (Playwright path)
            raw_genres = manga_info.get("genres", [])
            raw_genres_lower = [g.lower() for g in raw_genres]

            # Пропускаем синглы
            if any("сингл" in g for g in raw_genres_lower):
                await context.close()
                return None

            additional = manga_info.get("additional_info", {})
            if any("oel-манга" in g for g in raw_genres_lower):
                additional["type"] = "OEL-Manga"
            elif any("руманга" in g for g in raw_genres_lower):
                additional["type"] = "Rukomiks"
            elif any("комикс западный" in g for g in raw_genres_lower):
                additional["type"] = "Western"
            elif any("маньхуа" in g for g in raw_genres_lower):
                additional["type"] = "Manhua"
            elif any("манхва" in g for g in raw_genres_lower):
                additional["type"] = "Manhwa"
            elif not additional.get("type"):
                additional["type"] = "Manga"

            # Извлекаем возрастной рейтинг
            for g in raw_genres:
                if g in ('+18', '18+'):
                    additional["age_rating"] = "18+"
                    break
                elif g in ('16+', '16'):
                    additional["age_rating"] = "16+"
                    break
                elif g in ('14+', '12+'):
                    additional["age_rating"] = g if g.endswith('+') else g + '+'
                    break

            manga_info["additional_info"] = additional

            # Чистим жанры
            _skip = {'манга', 'манхва', 'маньхуа', 'oel-манга', 'сингл', 'руманга',
                     'комикс западный', '+18', '12+', '14+', '16', '16+', '18+',
                     '1', '2', 'нет', 'япония'}
            manga_info["genres"] = [g for g in raw_genres
                                     if g.strip() and g.strip().lower() not in _skip
                                     and not re.match(r'^\d{4}$', g.strip())]

            # Создаём структуру папок
            manga_dir = os.path.join("manga", self.sanitize_filename(manga_info["title"]))
            covers_dir = os.path.join(manga_dir, "covers")
            os.makedirs(covers_dir, exist_ok=True)

            # Скачиваем обложку
            if manga_info.get("cover_url") and not manga_info["cover_url"].startswith("data:"):
                cover_path = os.path.join(covers_dir, "main_cover.jpg")
                cover_url = urljoin(BASE_URL, manga_info["cover_url"]) if manga_info["cover_url"].startswith("/") else manga_info["cover_url"]

                try:
                    print(f"Скачиваем обложку: {cover_url}")
                    r = requests.get(cover_url, headers={**HEADERS, "Referer": BASE_URL}, timeout=30)
                    r.raise_for_status()
                    with open(cover_path, "wb") as f:
                        f.write(r.content)
                    manga_info["local_cover_path"] = cover_path
                    print(f"✅ Обложка сохранена: {cover_path}")
                except Exception as e:
                    print(f"[WARN] Не удалось скачать обложку: {e}")

            # Получаем список глав
            chapters = await page.evaluate("""
                () => {
                    const chapters = [];
                    const links = document.querySelectorAll('a[href*="/reader/"]');
                    
                    // Хелпер для хеширования (простой для JS)
                    const simpleHash = (str) => {
                        let hash = 0;
                        for (let i = 0; i < str.length; i++) {
                            const char = str.charCodeAt(i);
                            hash = (hash << 5) - hash + char;
                            hash = hash & hash;
                        }
                        return Math.abs(hash).toString(16);
                    };

                    links.forEach((link, index) => {
                        const href = link.getAttribute('href');
                        if (href && href.includes('/reader/')) {
                            const fullUrl = href.startsWith('http') ? href : window.location.origin + href;
                            
                            // Пытаемся найти дату
                            let date = null;
                            // Ищем в родительских элементах (строка таблицы, элемент списка)
                            const container = link.closest('tr') || link.closest('li') || link.closest('.chapter-item') || link.parentElement;
                            
                            if (container) {
                                // Ищем явные даты (dd.mm.yyyy или yyyy-mm-dd)
                                const dateRegex = /(\d{2}\.\d{2}\.\d{4})|(\d{4}-\d{2}-\d{2})/;
                                const match = container.textContent.match(dateRegex);
                                if (match) {
                                    date = match[0];
                                } else {
                                    // Ищем относительные даты (сегодня, вчера)
                                    const relMatch = container.textContent.match(/(сегодня|вчера|\d+\s+(?:час|мин|дн)\.?\s+назад)/i);
                                    if (relMatch) date = relMatch[0];
                                }
                                
                                // Специальная проверка для таблиц: ищем в соседних ячейках
                                if (!date && container.tagName === 'TR') {
                                    const tds = container.querySelectorAll('td');
                                    tds.forEach(td => {
                                        const text = td.textContent.trim();
                                        if (text.match(dateRegex)) {
                                            date = text.match(dateRegex)[0];
                                        } else if (text.match(/(сегодня|вчера)/i)) {
                                            date = text;
                                        }
                                    });
                                }
                            }
                            
                            // Если не нашли, пробуем соседние элементы
                            if (!date) {
                                // Поиск по конкретному классу font-roboto (как указал пользователь)
                                // Ищем внутри ссылки или рядом
                                const robotoDate = link.querySelector('.font-roboto') || 
                                                   (container ? container.querySelector('.font-roboto') : null);
                                if (robotoDate && robotoDate.textContent.match(/\d{2}\.\d{2}\.\d{4}/)) {
                                    date = robotoDate.textContent.trim();
                                }
                                
                                if (!date) {
                                    let sibling = link.nextElementSibling;
                                    if (sibling && (sibling.textContent.match(/\d/) || sibling.textContent.match(/(сегодня|вчера)/))) {
                                        date = sibling.textContent.trim();
                                    }
                                }
                            }

                            chapters.push({
                                name: link.textContent.trim() || 'Глава без названия',
                                url: fullUrl,
                                // Используем стабильный ID на основе URL, чтобы лайки/просмотры сохранялись
                                chapter_id: simpleHash(fullUrl), 
                                date_added: date || new Date().toISOString() // Используем ISO, если не нашли дату
                            });
                        }
                    });
                    return chapters;
                }
            """)

            print(f"📚 Найдено {len(chapters)} глав")

            if max_chapters:
                chapters = chapters[:max_chapters]
                print(f"📖 Обрабатываем первые {max_chapters} глав")

            # Обрабатываем главы (с картинками)
            manga_info["chapters"] = []
            for idx, chapter in enumerate(chapters, start=1):
                try:
                    chapter_result = await self.process_chapter_async(
                        browser,
                        chapter,
                        idx,
                        manga_dir,
                        download_images=False   # ⚡ только ссылки, без сохранения
                    )

                    # ✅ фиксируем ссылки картинок
                    chapter_result["pages"] = [fix_page_url(p) for p in chapter_result["pages"]]

                    manga_info["chapters"].append(chapter_result)
                    print(f"✅ Глава {chapter_result['name']} загружена ({chapter_result['total_pages']} стр.)")
                except Exception as e:
                    print(f"[ERROR] Не удалось обработать главу {chapter['name']}: {e}")

            manga_info["total_chapters"] = len(manga_info["chapters"])

            await context.close()
            return manga_info

        finally:
            await browser.close()

# Создаем экземпляр парсера
parser = FastMangaParser(max_workers=10)

@app.get("/", summary="Главная страница")
async def root():
    return {
        "message": "Manga Parser API",
        "endpoints": {
            "manga_info": "/manga?url=<manga_url>&max_chapters=<number>",
            "chapter_download": "/chapters/{chapter_id}?manga_url=<url>"
        },
        "example": {
            "manga_info": "/manga?url=https://mangabuff.ru/manga/solo-leveling",
            "chapter_download": "/chapters/1?manga_url=https://mangabuff.ru/manga/solo-leveling"
        }
    }

@app.get("/covers/{manga_id}", summary="Получить обложку манги")
async def get_manga_cover(manga_id: str, db: Session = Depends(get_db)):
    from fastapi.responses import FileResponse
    
    # Находим мангу по ID
    manga = db.query(MangaItem).filter(MangaItem.manga_id == manga_id).first()
    if not manga:
        raise HTTPException(status_code=404, detail="Manga not found")
    
    # Путь к обложке
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cover_path = os.path.join(base_dir, "manga", manga.title, "covers", "main_cover.jpg")
    
    if os.path.exists(cover_path):
        return FileResponse(
            cover_path, 
            media_type="image/jpeg",
            headers={
                "Cache-Control": "public, max-age=3600",
                "Content-Disposition": "inline"
            }
        )
    else:
        raise HTTPException(status_code=404, detail="Cover not found")

def safe_json_load(data, default=None):
    """Безопасный парсинг JSON из БД"""
    if not data:
        return default if default is not None else []
    try:
        return json.loads(data)
    except (json.JSONDecodeError, TypeError):
        return default if default is not None else []

# === Manga Library (CRUD) ===

class MangaSaveRequest(BaseModel):
    manga_id: str
    title: str
    description: str = ""
    cover_url: str = ""
    source_url: str = ""
    genres: List[str] = []
    manga_type: str = "Manga"
    year: int = 0
    status: str = "В процессе"
    additional_info: Dict = {}
    chapters: List[Dict] = []

@app.get("/manga/list", summary="Получить список сохранённых манг")
async def get_manga_list(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
    sort: str = Query("rating"),
    manga_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    genre: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    age_rating: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    rating_min: Optional[float] = Query(None),
    rating_max: Optional[float] = Query(None),
    year_min: Optional[int] = Query(None),
    year_max: Optional[int] = Query(None),
    chapters_min: Optional[int] = Query(None),
    chapters_max: Optional[int] = Query(None),
):
    from sqlalchemy import func
    from collections import Counter

    query = db.query(MangaItem)

    # Фильтры
    if manga_type and manga_type != "all":
        query = query.filter(MangaItem.manga_type == manga_type)
    if status and status != "all":
        query = query.filter(MangaItem.status == status)
    if year:
        query = query.filter(MangaItem.year == year)
    if genre:
        query = query.filter(MangaItem.genres.contains(genre))
    if search:
        query = query.filter(MangaItem.title.ilike(f"%{search}%"))
    if age_rating and age_rating != "all":
        query = query.filter(MangaItem.additional_info.contains(age_rating))
    if category and category != "all":
        query = query.filter(MangaItem.genres.contains(category))
    if year_min:
        query = query.filter(MangaItem.year >= year_min)
    if year_max:
        query = query.filter(MangaItem.year <= year_max)

    # Filter by chapter count using subquery
    if chapters_min or chapters_max:
        from sqlalchemy import func as sa_fn
        ch_count_sq = db.query(Chapter.manga_id, sa_fn.count(Chapter.id).label("ch_cnt")).group_by(Chapter.manga_id).subquery()
        query = query.outerjoin(ch_count_sq, MangaItem.manga_id == ch_count_sq.c.manga_id)
        if chapters_min:
            query = query.filter(sa_fn.coalesce(ch_count_sq.c.ch_cnt, 0) >= chapters_min)
        if chapters_max:
            query = query.filter(sa_fn.coalesce(ch_count_sq.c.ch_cnt, 0) <= chapters_max)

    # Filter by rating using subquery
    if rating_min is not None or rating_max is not None:
        from sqlalchemy import func as sa_fn
        rat_sq = db.query(MangaRating.manga_id, sa_fn.avg(MangaRating.rating).label("avg_rat")).group_by(MangaRating.manga_id).subquery()
        query = query.outerjoin(rat_sq, MangaItem.manga_id == rat_sq.c.manga_id)
        if rating_min is not None:
            query = query.filter(sa_fn.coalesce(rat_sq.c.avg_rat, 0) >= rating_min)
        if rating_max is not None:
            query = query.filter(sa_fn.coalesce(rat_sq.c.avg_rat, 0) <= rating_max)

    total_count = query.count()

    # Сортировка
    from sqlalchemy import case as sa_case
    if sort == "year":
        query = query.order_by(MangaItem.year.desc(), MangaItem.mangabuff_newest_rank.asc())
    elif sort == "popularity":
        query = query.order_by(
            sa_case((MangaItem.mangabuff_popularity_rank == 0, 999999), else_=MangaItem.mangabuff_popularity_rank).asc()
        )
    elif sort == "views":
        query = query.order_by(MangaItem.mangabuff_views.desc())
    elif sort == "chapters":
        from sqlalchemy import func as sa_fn
        if not (chapters_min or chapters_max):
            ch_count_sq2 = db.query(Chapter.manga_id, sa_fn.count(Chapter.id).label("ch_cnt")).group_by(Chapter.manga_id).subquery()
            query = query.outerjoin(ch_count_sq2, MangaItem.manga_id == ch_count_sq2.c.manga_id)
            query = query.order_by(sa_fn.coalesce(ch_count_sq2.c.ch_cnt, 0).desc())
        else:
            query = query.order_by(sa_fn.coalesce(ch_count_sq.c.ch_cnt, 0).desc())
    elif sort == "updated":
        query = query.order_by(
            sa_case((MangaItem.mangabuff_updated_rank == 0, 999999), else_=MangaItem.mangabuff_updated_rank).asc()
        )
    elif sort == "newest":
        query = query.order_by(
            sa_case((MangaItem.mangabuff_newest_rank == 0, 999999), else_=MangaItem.mangabuff_newest_rank).asc()
        )
    elif sort == "rating":
        query = query.order_by(
            sa_case((MangaItem.mangabuff_rating_rank == 0, 999999), else_=MangaItem.mangabuff_rating_rank).asc()
        )
    else:
        query = query.order_by(MangaItem.created_at.desc())

    items = query.offset((page - 1) * limit).limit(limit).all()

    # Подсчёт просмотров тайтлов
    manga_views_counts = dict(
        db.query(MangaView.manga_id, func.count(MangaView.id))
        .group_by(MangaView.manga_id)
        .all()
    )

    # Подсчёт лайков и просмотров глав — одним запросом для всех манг
    all_chapter_likes = db.query(ChapterLike.manga_id, ChapterLike.chapter_id).all()
    all_chapter_views = db.query(ChapterView.manga_id, ChapterView.chapter_id).all()

    # Группируем: {manga_id: {chapter_id: count}}
    chapter_likes_map: Dict[str, Counter] = {}
    for manga_id, chapter_id in all_chapter_likes:
        if manga_id not in chapter_likes_map:
            chapter_likes_map[manga_id] = Counter()
        chapter_likes_map[manga_id][chapter_id] += 1

    chapter_views_map: Dict[str, Counter] = {}
    for manga_id, chapter_id in all_chapter_views:
        if manga_id not in chapter_views_map:
            chapter_views_map[manga_id] = Counter()
        chapter_views_map[manga_id][chapter_id] += 1

    # Лайки текущего пользователя (чтобы отметить is_liked)
    user_liked: set = set()
    if current_user:
        user_likes = db.query(ChapterLike.manga_id, ChapterLike.chapter_id).filter(
            ChapterLike.user_id == current_user.id
        ).all()
        user_liked = {(m, c) for m, c in user_likes}

    # Агрегированные оценки: {manga_id: {avg, total, distribution, user_rating}}
    all_ratings = db.query(MangaRating).all()
    ratings_map: Dict[str, list] = {}
    user_ratings_map: Dict[str, int] = {}
    for r in all_ratings:
        ratings_map.setdefault(r.manga_id, []).append(r.rating)
        if current_user and r.user_id == current_user.id:
            user_ratings_map[r.manga_id] = r.rating

    # Агрегированные закладки: {manga_id: {status: count}}
    all_bookmarks = db.query(MangaBookmark).all()
    bookmarks_map: Dict[str, Counter] = {}
    user_bookmarks_map: Dict[str, str] = {}
    for b in all_bookmarks:
        bookmarks_map.setdefault(b.manga_id, Counter())[b.status] += 1
        if current_user and b.user_id == current_user.id:
            user_bookmarks_map[b.manga_id] = b.status

    result = []
    # Подсчёт глав одним запросом вместо загрузки всех глав
    from sqlalchemy import func as sa_func
    chapter_counts = dict(
        db.query(Chapter.manga_id, sa_func.count(Chapter.id))
        .group_by(Chapter.manga_id)
        .all()
    )

    for item in items:
        manga_id = item.manga_id
        likes_counter = chapter_likes_map.get(manga_id, Counter())
        views_counter = chapter_views_map.get(manga_id, Counter())

        # Рейтинг
        manga_ratings = ratings_map.get(manga_id, [])
        avg_rating = round(sum(manga_ratings) / len(manga_ratings), 2) if manga_ratings else 0
        rating_distribution = {}
        for r in manga_ratings:
            rating_distribution[str(r)] = rating_distribution.get(str(r), 0) + 1

        # Закладки
        bookmark_counts = dict(bookmarks_map.get(manga_id, Counter()))

        cover_url = item.cover_url

        result.append({
            "manga_id": manga_id,
            "title": item.title,
            "description": item.description,
            "cover_url": cover_url,
            "source_url": item.source_url,
            "genres": safe_json_load(item.genres, []),
            "manga_type": item.manga_type,
            "year": item.year,
            "status": item.status,
            "additional_info": safe_json_load(item.additional_info, {}),
            "chapters": [],
            "chapter_count": chapter_counts.get(manga_id, 0),
            "views": manga_views_counts.get(manga_id, 0),
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "rating_info": {
                "average": avg_rating,
                "total": len(manga_ratings),
                "distribution": rating_distribution,
                "user_rating": user_ratings_map.get(manga_id),
            },
            "bookmark_counts": bookmark_counts,
            "user_bookmark": user_bookmarks_map.get(manga_id),
        })
    return {
        "items": result,
        "total": total_count,
        "page": page,
        "limit": limit,
        "pages": (total_count + limit - 1) // limit,
    }


@app.get("/manga/{manga_id}/detail", summary="Получить одну мангу по ID")
async def get_manga_detail(
    manga_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    from sqlalchemy import func
    from collections import Counter
    item = db.query(MangaItem).filter(MangaItem.manga_id == manga_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Манга не найдена")

    manga_ratings = db.query(MangaRating).filter(MangaRating.manga_id == manga_id).all()
    avg_rating = round(sum(r.rating for r in manga_ratings) / len(manga_ratings), 2) if manga_ratings else 0
    rating_distribution = {}
    for r in manga_ratings:
        rating_distribution[str(r.rating)] = rating_distribution.get(str(r.rating), 0) + 1
    user_rating = None
    if current_user:
        ur = db.query(MangaRating).filter(MangaRating.manga_id == manga_id, MangaRating.user_id == current_user.id).first()
        if ur: user_rating = ur.rating

    bookmarks = db.query(MangaBookmark).filter(MangaBookmark.manga_id == manga_id).all()
    bookmark_counts = Counter(b.status for b in bookmarks)
    user_bookmark = None
    if current_user:
        ub = db.query(MangaBookmark).filter(MangaBookmark.manga_id == manga_id, MangaBookmark.user_id == current_user.id).first()
        if ub: user_bookmark = ub.status

    views_count = db.query(func.count(MangaView.id)).filter(MangaView.manga_id == manga_id).scalar() or 0
    chapter_count = db.query(func.count(Chapter.id)).filter(Chapter.manga_id == manga_id).scalar() or 0

    return {
        "manga_id": manga_id,
        "title": item.title,
        "description": item.description,
        "cover_url": item.cover_url,
        "source_url": item.source_url,
        "genres": safe_json_load(item.genres, []),
        "manga_type": item.manga_type,
        "year": item.year,
        "status": item.status,
        "additional_info": safe_json_load(item.additional_info, {}),
        "chapters": [],
        "chapter_count": chapter_count,
        "views": views_count,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "rating_info": {
            "average": avg_rating,
            "total": len(manga_ratings),
            "distribution": rating_distribution,
            "user_rating": user_rating,
        },
        "bookmark_counts": dict(bookmark_counts),
        "user_bookmark": user_bookmark,
    }


@app.get("/manga/{manga_id}/chapters", summary="Получить главы конкретной манги")
async def get_manga_chapters(
    manga_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    from collections import Counter
    chapters = chapters_from_db(db, manga_id)
    if not chapters:
        item = db.query(MangaItem).filter(MangaItem.manga_id == manga_id).first()
        if item:
            chapters = safe_json_load(item.chapters, [])

    # Обогащаем views/likes
    likes = db.query(ChapterLike.chapter_id).filter(ChapterLike.manga_id == manga_id).all()
    views = db.query(ChapterView.chapter_id).filter(ChapterView.manga_id == manga_id).all()
    likes_counter = Counter(cid for (cid,) in likes)
    views_counter = Counter(cid for (cid,) in views)

    user_liked = set()
    if current_user:
        ul = db.query(ChapterLike.chapter_id).filter(
            ChapterLike.manga_id == manga_id, ChapterLike.user_id == current_user.id
        ).all()
        user_liked = {cid for (cid,) in ul}

    for ch in chapters:
        cid = str(ch.get("chapter_id", ch.get("id", "")))
        ch["views"] = views_counter.get(cid, 0)
        ch["likes"] = likes_counter.get(cid, 0)
        ch["is_liked"] = cid in user_liked

    return chapters


@app.post("/manga/save", summary="Сохранить мангу в библиотеку")
async def save_manga(data: MangaSaveRequest, db: Session = Depends(get_db)):
    existing = db.query(MangaItem).filter(MangaItem.manga_id == data.manga_id).first()
    if existing:
        # Обновляем существующую запись
        existing.title = data.title
        existing.description = data.description
        existing.cover_url = data.cover_url
        existing.source_url = data.source_url
        existing.genres = json.dumps(data.genres, ensure_ascii=False)
        existing.manga_type = data.manga_type
        existing.year = data.year
        existing.status = data.status
        # Мержим additional_info чтобы не затирать данные парсера
        old_additional = safe_json_load(existing.additional_info, {})
        new_additional = data.additional_info or {}
        merged = {**old_additional, **{k: v for k, v in new_additional.items() if v}}
        existing.additional_info = json.dumps(merged, ensure_ascii=False)
        if data.chapters:
            existing.chapters = json.dumps(data.chapters, ensure_ascii=False)
            upsert_chapters(db, data.manga_id, data.chapters)
        db.commit()
        return {"status": "updated", "manga_id": data.manga_id}

    new_item = MangaItem(
        manga_id=data.manga_id,
        title=data.title,
        description=data.description,
        cover_url=data.cover_url,
        source_url=data.source_url,
        genres=json.dumps(data.genres, ensure_ascii=False),
        manga_type=data.manga_type,
        year=data.year,
        status=data.status,
        additional_info=json.dumps(data.additional_info, ensure_ascii=False),
        chapters=json.dumps(data.chapters, ensure_ascii=False),
    )
    db.add(new_item)
    if data.chapters:
        upsert_chapters(db, data.manga_id, data.chapters)
    db.commit()
    return {"status": "created", "manga_id": data.manga_id}

@app.delete("/manga/{manga_id}", summary="Удалить мангу из библиотеки")
async def delete_manga(manga_id: str, db: Session = Depends(get_db)):
    item = db.query(MangaItem).filter(MangaItem.manga_id == manga_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Манга не найдена")
    # Каскадное удаление всех связанных данных
    db.query(ChapterLike).filter(ChapterLike.manga_id == manga_id).delete()
    db.query(ChapterView).filter(ChapterView.manga_id == manga_id).delete()
    db.query(ChapterMeta).filter(ChapterMeta.manga_id == manga_id).delete()
    db.query(MangaView).filter(MangaView.manga_id == manga_id).delete()
    db.query(MangaRating).filter(MangaRating.manga_id == manga_id).delete()
    db.query(MangaBookmark).filter(MangaBookmark.manga_id == manga_id).delete()
    db.query(ReadingHistory).filter(ReadingHistory.manga_id == manga_id).delete()
    db.query(Chapter).filter(Chapter.manga_id == manga_id).delete()

    # Удаляем файлы: папка по manga_id и по title
    import shutil
    for folder_name in [manga_id, item.title]:
        if folder_name:
            folder_path = os.path.join(MANGA_DIR, folder_name)
            if os.path.isdir(folder_path):
                try:
                    shutil.rmtree(folder_path)
                    print(f"[DELETE] Папка удалена: {folder_path}")
                except Exception as e:
                    print(f"[DELETE] Ошибка удаления папки {folder_path}: {e}")

    db.delete(item)
    db.commit()
    return {"status": "deleted", "manga_id": manga_id}

@app.post("/manga/{manga_id}/view", summary="Засчитать просмотр тайтла")
async def add_manga_view(
    manga_id: str,
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    ip = request.client.host if request else "0.0.0.0"

    if current_user:
        existing = db.query(MangaView).filter(
            MangaView.manga_id == manga_id,
            MangaView.user_id == current_user.id
        ).first()
        if existing:
            return {"status": "already_viewed"}
        new_view = MangaView(manga_id=manga_id, user_id=current_user.id, ip_address=ip)
    else:
        existing = db.query(MangaView).filter(
            MangaView.manga_id == manga_id,
            MangaView.ip_address == ip,
            MangaView.user_id == None
        ).first()
        if existing:
            return {"status": "already_viewed"}
        new_view = MangaView(manga_id=manga_id, ip_address=ip)

    db.add(new_view)
    db.commit()
    count = db.query(MangaView).filter(MangaView.manga_id == manga_id).count()
    return {"status": "viewed", "views": count}

@app.get("/manga", response_model=MangaResponse, summary="Получить информацию о манге")
async def get_manga_info_endpoint(
    url: str = Query(..., description="URL манги с mangabuff.ru"),
    max_chapters: Optional[int] = Query(None, description="Максимальное количество глав для обработки"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    """
    Получает метаданные манги по URL:
    - Название и альтернативные названия
    - Описание, жанры, теги
    - Список всех глав (с датами, просмотрами и лайками)
    - Обложка
    - Дополнительная информация
    """
    if not url.startswith("https://mangabuff.ru"):
        raise HTTPException(status_code=400, detail="URL должен быть с сайта mangabuff.ru")
    
    manga_id = parser.get_manga_id(url)
    
    # Проверяем кеш
    manga_info = None
    if manga_id in manga_cache:
        manga_info = manga_cache[manga_id]
        print(f"📋 Возвращаем данные из кеша для {manga_info['title']}")
    else:
        # Сначала пробуем быстрый API, потом Playwright как fallback
        try:
            print(f"[API] Получение информации о манге: {url}")
            manga_info = await parser.get_manga_info_api(url, max_chapters)
            if manga_info is None:
                raise HTTPException(status_code=400, detail="Этот тайтл (сингл) не поддерживается для импорта")
            manga_cache[manga_id] = manga_info
        except HTTPException:
            raise
        except Exception as api_err:
            print(f"[WARN] API не сработал: {api_err}, пробуем Playwright...")
            try:
                manga_info = await parser.get_manga_info(url, max_chapters)
                if manga_info is None:
                    raise HTTPException(status_code=400, detail="Этот тайтл (сингл) не поддерживается для импорта")
                manga_cache[manga_id] = manga_info
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Ошибка при парсинге: {str(e)}")

    # Автоматически сохраняем/обновляем мангу в БД (включая главы)
    try:
        chapters_json = json.dumps(manga_info.get("chapters", []), ensure_ascii=False)
        additional = manga_info.get("additional_info", {})
        print(f"[DEBUG] additional_info type: {additional.get('type')}, alt_names: {additional.get('alternative_names')}")
        existing = db.query(MangaItem).filter(MangaItem.manga_id == manga_id).first()
        if existing:
            # Обновляем главы при каждом парсинге
            existing.chapters = chapters_json
            existing.title = manga_info.get("title", existing.title)
            existing.description = manga_info.get("description", existing.description)
            existing.cover_url = manga_info.get("cover_url", existing.cover_url)
            existing.genres = json.dumps(manga_info.get("genres", []), ensure_ascii=False)
            existing.manga_type = additional.get("type", existing.manga_type)
            existing.year = int(additional.get("year", existing.year or 0) or 0)
            existing.status = additional.get("status", existing.status or "В процессе")
            existing.additional_info = json.dumps(additional, ensure_ascii=False)
            upsert_chapters(db, manga_id, manga_info.get("chapters", []))
            db.commit()
            print(f"💾 Главы обновлены в БД для: {manga_info.get('title')}")
        else:
            new_item = MangaItem(
                manga_id=manga_id,
                title=manga_info.get("title", ""),
                description=manga_info.get("description", ""),
                cover_url=manga_info.get("cover_url", ""),
                source_url=str(url),
                genres=json.dumps(manga_info.get("genres", []), ensure_ascii=False),
                manga_type=additional.get("type", "Manga"),
                year=int(additional.get("year", 0) or 0),
                status=additional.get("status", "В процессе"),
                additional_info=json.dumps(additional, ensure_ascii=False),
                chapters=chapters_json,
            )
            db.add(new_item)
            upsert_chapters(db, manga_id, manga_info.get("chapters", []))
            db.commit()
            print(f"💾 Манга сохранена в БД: {manga_info.get('title')}")
    except Exception as e:
        print(f"[WARN] Ошибка при автосохранении манги в БД: {e}")

    # Обогащаем данными из БД (лайки, просмотры)
    try:
        from collections import Counter

        # Получаем лайки текущего пользователя
        user_liked_chapters = set()
        if current_user:
            user_likes = db.query(ChapterLike.chapter_id).filter(
                ChapterLike.manga_id == manga_id,
                ChapterLike.user_id == current_user.id
            ).all()
            user_liked_chapters = {l[0] for l in user_likes}

        # Получаем статистику (оптимизация: загружаем все записи для манги и считаем в Python)
        # В продакшене лучше использовать GROUP BY запросы
        all_likes = db.query(ChapterLike.chapter_id).filter(ChapterLike.manga_id == manga_id).all()
        all_views = db.query(ChapterView.chapter_id).filter(ChapterView.manga_id == manga_id).all()
        
        likes_count = Counter([l[0] for l in all_likes])
        views_count = Counter([v[0] for v in all_views])

        print(f"[DEBUG] Статистика для манги {manga_id}: Лайки={len(all_likes)}, Просмотры={len(all_views)}")

        for chapter in manga_info["chapters"]:
            cid = str(chapter.get("chapter_id")) # Приводим к строке для надежности
            chapter["views"] = views_count.get(cid, 0)
            chapter["likes"] = likes_count.get(cid, 0)
            chapter["is_liked"] = cid in user_liked_chapters
            
            # Отладка для конкретной главы
            # if chapter["views"] > 0 or chapter["likes"] > 0:
            #     print(f"[DEBUG] Глава {cid}: views={chapter['views']}, likes={chapter['likes']}")
            
            if "date_added" not in chapter:
                chapter["date_added"] = "Неизвестно"
                
    except Exception as e:
        print(f"[WARN] Ошибка при получении статистики из БД: {e}")

    return manga_info

class MassParseRequest(BaseModel):
    urls: List[str] = []
    slugs: List[str] = []
    max_chapters: Optional[int] = None

@app.post("/manga/mass-parse", summary="Массовый парсинг манг через API")
async def mass_parse_manga(
    body: MassParseRequest = Body(...),
    db: Session = Depends(get_db),
):
    """
    Массовый парсинг нескольких манг параллельно с MangaBuff.ru.
    Принимает список URL или slug. Возвращает результаты для каждой манги.
    """
    # Собираем все URL
    all_urls = list(body.urls)
    for slug in body.slugs:
        all_urls.append(f"{BASE_URL}/manga/{slug}")

    if not all_urls:
        raise HTTPException(status_code=400, detail="Нужно указать хотя бы один URL или slug")

    if len(all_urls) > 500:
        raise HTTPException(status_code=400, detail="Максимум 500 манг за раз")

    sem = asyncio.Semaphore(5)  # не больше 5 манг одновременно
    results = []

    async def parse_one(url: str) -> Dict:
        async with sem:
            try:
                manga_info = await parser.get_manga_info_api(url, body.max_chapters)
                if manga_info is None:
                    return {"url": url, "status": "skipped", "error": "Сингл — пропущен"}
                manga_id = parser.get_manga_id(url)
                manga_cache[manga_id] = manga_info

                # Сохраняем в БД
                try:
                    chapters_json = json.dumps(manga_info.get("chapters", []), ensure_ascii=False)
                    additional = manga_info.get("additional_info", {})
                    existing = db.query(MangaItem).filter(MangaItem.manga_id == manga_id).first()
                    if existing:
                        existing.chapters = chapters_json
                        existing.title = manga_info.get("title", existing.title)
                        existing.description = manga_info.get("description", existing.description)
                        existing.cover_url = manga_info.get("cover_url", existing.cover_url)
                        existing.genres = json.dumps(manga_info.get("genres", []), ensure_ascii=False)
                        existing.manga_type = additional.get("type", existing.manga_type)
                        existing.year = int(additional.get("year", existing.year or 0) or 0)
                        existing.status = additional.get("status", existing.status or "В процессе")
                        existing.additional_info = json.dumps(additional, ensure_ascii=False)
                    else:
                        new_item = MangaItem(
                            manga_id=manga_id,
                            title=manga_info.get("title", ""),
                            description=manga_info.get("description", ""),
                            cover_url=manga_info.get("cover_url", ""),
                            source_url=str(url),
                            genres=json.dumps(manga_info.get("genres", []), ensure_ascii=False),
                            manga_type=additional.get("type", "Manga"),
                            year=int(additional.get("year", 0) or 0),
                            status=additional.get("status", "В процессе"),
                            additional_info=json.dumps(additional, ensure_ascii=False),
                            chapters=chapters_json,
                        )
                        db.add(new_item)
                    upsert_chapters(db, manga_id, manga_info.get("chapters", []))
                    db.commit()
                except Exception as e:
                    print(f"[WARN] Ошибка при сохранении в БД: {e}")

                return {"url": url, "status": "ok", "title": manga_info.get("title"), "chapters_count": len(manga_info.get("chapters", []))}
            except Exception as e:
                return {"url": url, "status": "error", "error": str(e)}

    tasks = [parse_one(u) for u in all_urls]
    results = await asyncio.gather(*tasks)

    ok_count = sum(1 for r in results if r["status"] == "ok")
    return {
        "total": len(all_urls),
        "success": ok_count,
        "failed": len(all_urls) - ok_count,
        "results": list(results),
    }

@app.get("/chapters/{chapter_id}", response_model=ChapterResponse, summary="Загрузить конкретную главу")
async def download_chapter(
    chapter_id: str,
    manga_url: str = Query(..., description="URL манги"),
    download_images: bool = Query(True, description="Загружать изображения или только URL"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    """
    Загружает конкретную главу по ID:
    - Получает все страницы главы
    - Опционально скачивает изображения на сервер
    - Возвращает пути к файлам или URL изображений
    """
    if not manga_url.startswith("https://mangabuff.ru"):
        raise HTTPException(status_code=400, detail="URL должен быть с сайта mangabuff.ru")
    
    manga_id = parser.get_manga_id(manga_url)

    def fix_page_url(page_url: str) -> str:
        """Исправляем относительные пути на полные ссылки"""
        if page_url.startswith("http"):
            return page_url
        return f"{BASE_URL}{page_url}"
    
    # Проверяем, есть ли информация о манге в кеше
    manga_info = manga_cache.get(manga_id)
    if not manga_info:
        # Если нет в кеше, получаем информацию
        try:
            manga_info = await parser.get_manga_info(manga_url)
            manga_cache[manga_id] = manga_info
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Ошибка при получении информации о манге: {str(e)}")
    
    # Находим главу по ID
    chapter_to_download = None
    for chapter in manga_info["chapters"]:
        if chapter.get("chapter_id") == chapter_id:
            chapter_to_download = chapter
            break
    
    if not chapter_to_download:
        raise HTTPException(status_code=404, detail=f"Глава с ID {chapter_id} не найдена")
    
    try:
        print(f"📖 Загрузка главы {chapter_id}: {chapter_to_download['name']}")
        
        manga_dir = os.path.join("manga", parser.sanitize_filename(manga_info["title"]))
        
        browser = await browser_pool.chromium.launch(headless=True, args=['--no-sandbox'])
        
        try:
            chapter_result = await parser.process_chapter_async(
                browser, 
                chapter_to_download, 
                int(chapter_id), 
                manga_dir, 
                download_images
            )

            # ✅ фиксируем все ссылки на страницы
            chapter_result["pages"] = [fix_page_url(p) for p in chapter_result["pages"]]
            
            # Получаем статистику для главы
            views_count = db.query(ChapterView).filter(ChapterView.chapter_id == chapter_id).count()
            likes_count = db.query(ChapterLike).filter(ChapterLike.chapter_id == chapter_id).count()
            is_liked = False
            if current_user:
                 is_liked = db.query(ChapterLike).filter(
                     ChapterLike.chapter_id == chapter_id, 
                     ChapterLike.user_id == current_user.id
                 ).first() is not None

            return ChapterResponse(
                chapter_id=chapter_result["chapter_id"],
                name=chapter_result["name"],
                pages=chapter_result["pages"],
                total_pages=chapter_result["total_pages"],
                download_status=chapter_result["download_status"],
                date_added=chapter_to_download.get("date_added", "Неизвестно"),
                views=views_count,
                likes=likes_count,
                is_liked=is_liked
            )
            
        finally:
            await browser.close()
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка при загрузке главы: {str(e)}")

@app.get("/health", summary="Проверка состояния сервера")
async def health_check():
    """Простая проверка состояния сервера"""
    return {
        "status": "healthy",
        "cached_manga": len(manga_cache),
        "message": "Сервер работает нормально"
    }

# ============ Image proxy with watermark replacement ============

# In-memory LRU cache for processed images (avoid re-downloading)
from functools import lru_cache
import io

WATERMARK_TEXT = "SPRINGMANGA"
WATERMARK_TOP_STRIP = 155  # mangabuff top watermark bar height (с запасом)
WATERMARK_BOT_STRIP = 75  # mangabuff bottom watermark bar height (с запасом)

def _is_uniform_strip(img, x0, y0, x1, y1, tolerance=40):
    """Check if a region is roughly uniform color (like a watermark bar).
    Returns (True, avg_color) or (False, None)."""
    strip = img.crop((x0, y0, x1, y1))
    w, h = strip.size
    if w == 0 or h == 0:
        return False, None

    # Sample several rows and compare to average
    avg_c = strip.resize((1, 1)).getpixel((0, 0))
    if isinstance(avg_c, int):
        avg_c = (avg_c, avg_c, avg_c)
    avg_c = avg_c[:3]

    # Check a few rows spread across the strip — if all similar to avg, it's uniform
    check_rows = [0, h // 4, h // 2, 3 * h // 4, h - 1]
    for row_y in check_rows:
        if row_y >= h:
            continue
        row = strip.crop((0, row_y, w, row_y + 1))
        rc = row.resize((1, 1)).getpixel((0, 0))
        if isinstance(rc, int):
            rc = (rc, rc, rc)
        rc = rc[:3]
        diff = max(abs(rc[i] - avg_c[i]) for i in range(3))
        if diff > tolerance:
            return False, None

    return True, avg_c

def replace_watermark(image_bytes: bytes, wm_mode: str = "") -> bytes:
    """Replace mangabuff.ru watermark strips.
    wm_mode: 'top' = text top only, 'bottom' = text bottom only, 'both' = text both. '' = do nothing."""
    if not wm_mode:
        return image_bytes

    try:
        img = Image.open(io.BytesIO(image_bytes))
        orig_format = img.format or "JPEG"
        width, height = img.size

        if width < 100 or height < 200:
            return image_bytes

        if img.mode == "RGBA":
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[3])
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")

        from PIL import ImageDraw, ImageFont

        draw = ImageDraw.Draw(img)

        do_top = wm_mode in ("top", "both")
        do_bot = wm_mode in ("bottom", "both")

        strip_h = max(WATERMARK_TOP_STRIP, WATERMARK_BOT_STRIP)
        font_size = max(18, min(strip_h - 10, width // 18, 44))
        font = None
        for fp in ["C:/Windows/Fonts/impact.ttf", "impact.ttf", "C:/Windows/Fonts/arialbd.ttf"]:
            try:
                font = ImageFont.truetype(fp, font_size)
                break
            except (IOError, OSError):
                continue
        if font is None:
            font = ImageFont.load_default()

        STRIP_BG = (35, 35, 40)
        TEXT_COLOR = (255, 255, 255)

        if do_top:
            h = WATERMARK_TOP_STRIP
            draw.rectangle([0, 0, width, h], fill=STRIP_BG)
            bbox = draw.textbbox((0, 0), WATERMARK_TEXT, font=font)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            draw.text(((width - tw) // 2, (h - th) // 2), WATERMARK_TEXT, fill=TEXT_COLOR, font=font)

        if do_bot:
            h = WATERMARK_BOT_STRIP
            draw.rectangle([0, height - h, width, height], fill=STRIP_BG)
            bbox = draw.textbbox((0, 0), WATERMARK_TEXT, font=font)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            draw.text(((width - tw) // 2, height - h + (h - th) // 2), WATERMARK_TEXT, fill=TEXT_COLOR, font=font)

        buf = io.BytesIO()
        if orig_format.upper() in ("JPEG", "JPG"):
            img.save(buf, format="JPEG", quality=90)
        else:
            img.save(buf, format="PNG")
        return buf.getvalue()
    except Exception as e:
        print(f"[WARN] Watermark replacement failed: {e}")
        return image_bytes


@app.get("/proxy/image", summary="Проксирование изображений с заменой watermark")
async def proxy_image(url: str = Query(..., description="URL изображения"), wm: str = Query("", description="Watermark mode: top, bottom, both, or empty")):
    """Скачивает изображение, заменяет watermark mangabuff → Springmanga, отдаёт клиенту."""
    from fastapi.responses import Response

    if not url.startswith("http"):
        raise HTTPException(status_code=400, detail="Invalid URL")

    try:
        session = await get_chapter_session()
        async with session.get(url, headers={**HEADERS, "Referer": BASE_URL}) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=resp.status, detail="Failed to fetch image")
            content_type = resp.content_type or "image/jpeg"
            image_bytes = await resp.read()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error fetching image: {e}")

    # Replace watermark
    processed = await asyncio.get_event_loop().run_in_executor(None, lambda: replace_watermark(image_bytes, wm))

    return Response(
        content=processed,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.post("/auth/register", summary="Регистрация пользователя")
async def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed_password = get_password_hash(user.password)
    db_user = User(username=user.username, email=user.email, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return {"username": db_user.username, "email": db_user.email, "id": db_user.id, "role": db_user.role}

@app.post("/token", response_model=Token, summary="Вход в систему")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # Ищем по email (username в форме = email)
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user.status == "banned":
        raise HTTPException(status_code=403, detail="Account is banned")
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/auth/me", summary="Получить текущего пользователя")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "role": current_user.role,
        "status": current_user.status,
        "avatar_url": current_user.avatar_url or "",
        "about": current_user.about or "",
        "birthday": current_user.birthday or "",
        "gender": current_user.gender or "",
        "erotic_filter": current_user.erotic_filter or "hide",
        "private_profile": bool(current_user.private_profile),
        "allow_trades": bool(current_user.allow_trades) if current_user.allow_trades is not None else True,
        "notify_email": bool(current_user.notify_email) if current_user.notify_email is not None else True,
        "notify_vk": bool(current_user.notify_vk),
        "notify_telegram": bool(current_user.notify_telegram),
        "bio": current_user.bio or "",
        "profile_banner_url": current_user.profile_banner_url or "",
        "profile_theme": current_user.profile_theme or "base",
        "avatar_frame": current_user.avatar_frame or "none",
        "badge_ids": current_user.badge_ids or "[]",
        "showcase_manga_ids": current_user.showcase_manga_ids or "[]",
        "xp": current_user.xp or 0,
        "level": current_user.level or 1,
    }

@app.put("/auth/profile", summary="Обновить профиль")
async def update_profile(data: ProfileUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if data.username is not None:
        current_user.username = data.username
    if data.about is not None:
        current_user.about = data.about
    if data.birthday is not None:
        current_user.birthday = data.birthday
    if data.gender is not None:
        current_user.gender = data.gender
    if data.erotic_filter is not None:
        current_user.erotic_filter = data.erotic_filter
    if data.private_profile is not None:
        current_user.private_profile = data.private_profile
    if data.allow_trades is not None:
        current_user.allow_trades = data.allow_trades
    if data.notify_email is not None:
        current_user.notify_email = data.notify_email
    if data.notify_vk is not None:
        current_user.notify_vk = data.notify_vk
    if data.notify_telegram is not None:
        current_user.notify_telegram = data.notify_telegram
    if data.bio is not None:
        current_user.bio = data.bio
    if data.profile_theme is not None:
        current_user.profile_theme = data.profile_theme
    if data.avatar_frame is not None:
        current_user.avatar_frame = data.avatar_frame
    if data.showcase_manga_ids is not None:
        current_user.showcase_manga_ids = data.showcase_manga_ids
    db.commit()
    return {"ok": True}

@app.put("/auth/password", summary="Сменить пароль")
async def change_password(data: PasswordChange, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.hashed_password or not verify_password(data.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Неверный текущий пароль")
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Пароль должен содержать минимум 6 символов")
    current_user.hashed_password = get_password_hash(data.new_password)
    db.commit()
    return {"ok": True}

@app.put("/auth/email", summary="Сменить email")
async def change_email(data: EmailChange, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(data.password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Неверный пароль")
    existing = db.query(User).filter(User.email == data.new_email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Этот email уже занят")
    current_user.email = data.new_email
    db.commit()
    return {"ok": True}

@app.post("/auth/avatar", summary="Загрузить аватарку")
async def upload_avatar(file: UploadFile = FastAPIFile(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ext = os.path.splitext(file.filename or "img.png")[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
        raise HTTPException(status_code=400, detail="Недопустимый формат файла")
    filename = f"{current_user.id}{ext}"
    filepath = os.path.join(AVATARS_DIR, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    current_user.avatar_url = f"/uploads/avatars/{filename}"
    db.commit()
    return {"avatar_url": current_user.avatar_url}

@app.post("/auth/banner", summary="Загрузить баннер профиля")
async def upload_banner(file: UploadFile = FastAPIFile(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ext = os.path.splitext(file.filename or "img.png")[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm", ".ogg"):
        raise HTTPException(status_code=400, detail="Недопустимый формат файла")
    filename = f"{current_user.id}_banner{ext}"
    filepath = os.path.join(BANNERS_DIR, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    current_user.profile_banner_url = f"/uploads/banners/{filename}"
    db.commit()
    return {"banner_url": current_user.profile_banner_url}

# ═══ WALL COMMENTS ═══

class WallCommentCreate(BaseModel):
    text: str

@app.get("/auth/wall-comments/{user_id}", summary="Получить комментарии на стене профиля")
async def get_wall_comments(user_id: int, db: Session = Depends(get_db)):
    comments = db.query(WallComment).filter(WallComment.profile_user_id == user_id).order_by(WallComment.created_at.desc()).limit(50).all()
    result = []
    for c in comments:
        author = db.query(User).filter(User.id == c.author_id).first()
        result.append({
            "id": c.id,
            "author_id": c.author_id,
            "author": author.username if author else "Unknown",
            "author_avatar": author.avatar_url or "" if author else "",
            "author_avatar_frame": author.avatar_frame if author else None,
            "text": c.text,
            "timestamp": c.created_at.strftime("%d.%m.%y %H:%M") if c.created_at else "",
        })
    return result

@app.post("/auth/wall-comments/{user_id}", summary="Добавить комментарий на стену профиля")
async def add_wall_comment(user_id: int, data: WallCommentCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not data.text or not data.text.strip():
        raise HTTPException(status_code=400, detail="Пустой комментарий")
    if len(data.text) > 500:
        raise HTTPException(status_code=400, detail="Слишком длинный комментарий (макс. 500)")
    comment = WallComment(profile_user_id=user_id, author_id=current_user.id, text=data.text.strip())
    db.add(comment)
    db.commit()
    db.refresh(comment)
    # Notify profile owner
    if user_id != current_user.id:
        notif_msg = f'<a href="/user/{current_user.id}" class="text-brand-accent hover:underline font-bold">{current_user.username}</a> оставил комментарий в вашем <a href="/user/{user_id}" class="text-brand-accent hover:underline">профиле</a>'
        create_notification(db, user_id, notif_msg, f"/user/{user_id}", "social")
    return {
        "id": comment.id,
        "author_id": current_user.id,
        "author": current_user.username,
        "author_avatar": current_user.avatar_url or "",
        "author_avatar_frame": current_user.avatar_frame,
        "text": comment.text,
        "timestamp": comment.created_at.strftime("%d.%m.%y %H:%M") if comment.created_at else "",
    }

@app.delete("/auth/wall-comments/{comment_id}", summary="Удалить комментарий со стены")
async def delete_wall_comment(comment_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    comment = db.query(WallComment).filter(WallComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Комментарий не найден")
    # Удалить может автор или владелец стены или админ
    if comment.author_id != current_user.id and comment.profile_user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Нет прав")
    db.delete(comment)
    db.commit()
    return {"ok": True}


@app.get("/auth/profile-full", summary="Полные данные профиля")
async def get_profile_full(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    import json
    try:
        badge_list = json.loads(current_user.badge_ids or "[]")
    except:
        badge_list = []
    try:
        showcase_list = json.loads(current_user.showcase_manga_ids or "[]")
    except:
        showcase_list = []
    
    # Build heatmap from reading history
    from collections import defaultdict
    heatmap = defaultdict(int)
    histories = db.query(ReadingHistory).filter(ReadingHistory.user_id == current_user.id).all()
    for h in histories:
        if h.read_at:
            day = h.read_at.strftime("%Y-%m-%d")
            heatmap[day] += 1
    
    total_likes = db.query(ChapterLike).filter(ChapterLike.user_id == current_user.id).count()
    total_ratings = db.query(MangaRating).filter(MangaRating.user_id == current_user.id).count()
    total_bookmarks = db.query(MangaBookmark).filter(MangaBookmark.user_id == current_user.id).count()
    chapters_read = len(histories)
    
    xp = current_user.xp or 0
    lvl = current_user.level or 1
    xp_for_level = lambda l: 50 * l * l
    xp_current_level = xp_for_level(lvl - 1) if lvl > 1 else 0
    xp_next_level = xp_for_level(lvl)
    
    return {
        "user": {
            "badge_ids": badge_list,
        },
        "showcase_manga_ids": showcase_list,
        "heatmap": dict(heatmap),
        "stats": {
            "chapters_read": chapters_read,
            "total_likes": total_likes,
            "total_ratings": total_ratings,
            "total_bookmarks": total_bookmarks,
        },
        "gamification": {
            "xp": xp,
            "level": lvl,
            "xp_current_level": xp_current_level,
            "xp_next_level": xp_next_level,
        },
    }

@app.post("/auth/check-achievements", summary="Проверить достижения")
async def check_achievements(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    import json
    try:
        existing = json.loads(current_user.badge_ids or "[]")
    except:
        existing = []
    
    new_badges = []
    
    # first_login — always
    if "first_login" not in existing:
        existing.append("first_login")
        new_badges.append("first_login")
    
    chapters_read = db.query(ReadingHistory).filter(ReadingHistory.user_id == current_user.id).count()
    for threshold, badge in [(10, "reader_10"), (50, "reader_50"), (100, "reader_100"), (500, "reader_500")]:
        if chapters_read >= threshold and badge not in existing:
            existing.append(badge)
            new_badges.append(badge)
    
    total_bookmarks = db.query(MangaBookmark).filter(MangaBookmark.user_id == current_user.id).count()
    if total_bookmarks >= 10 and "bookworm" not in existing:
        existing.append("bookworm")
        new_badges.append("bookworm")
    if total_bookmarks >= 50 and "collector" not in existing:
        existing.append("collector")
        new_badges.append("collector")
    
    total_ratings = db.query(MangaRating).filter(MangaRating.user_id == current_user.id).count()
    if total_ratings >= 5 and "critic" not in existing:
        existing.append("critic")
        new_badges.append("critic")
    if total_ratings >= 20 and "judge" not in existing:
        existing.append("judge")
        new_badges.append("judge")
    
    if current_user.bio and "social" not in existing:
        existing.append("social")
        new_badges.append("social")
    
    if current_user.profile_theme and current_user.profile_theme != "base" and "stylist" not in existing:
        existing.append("stylist")
        new_badges.append("stylist")
    
    if current_user.profile_banner_url and "decorator" not in existing:
        existing.append("decorator")
        new_badges.append("decorator")
    
    # Time-based achievements
    from datetime import datetime as dt
    now = dt.now()
    if 0 <= now.hour < 5 and "night_guard" not in existing:
        existing.append("night_guard")
        new_badges.append("night_guard")
    if 5 <= now.hour < 7 and "early_bird" not in existing:
        existing.append("early_bird")
        new_badges.append("early_bird")
    if now.month == 10 and now.day == 31 and "halloween" not in existing:
        existing.append("halloween")
        new_badges.append("halloween")
    if (now.month == 12 and now.day == 31) or (now.month == 1 and now.day == 1):
        if "new_year" not in existing:
            existing.append("new_year")
            new_badges.append("new_year")
    
    if new_badges:
        current_user.badge_ids = json.dumps(existing)
        db.commit()
    
    return {"badges": existing, "new_badges": new_badges}

@app.post("/auth/sync-xp", summary="Синхронизировать XP")
async def sync_xp(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chapters_read = db.query(ReadingHistory).filter(ReadingHistory.user_id == current_user.id).count()
    total_ratings = db.query(MangaRating).filter(MangaRating.user_id == current_user.id).count()
    total_bookmarks = db.query(MangaBookmark).filter(MangaBookmark.user_id == current_user.id).count()
    
    xp = chapters_read * 10 + total_ratings * 5 + total_bookmarks * 3
    
    xp_for_level = lambda l: 50 * l * l
    lvl = 1
    while xp >= xp_for_level(lvl):
        lvl += 1
    
    old_level = current_user.level or 1
    level_up = lvl > old_level
    
    current_user.xp = xp
    current_user.level = lvl
    db.commit()
    
    return {"xp": xp, "level": lvl, "level_up": level_up}

@app.delete("/auth/account", summary="Удалить аккаунт")
async def delete_account(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Delete related data
    db.query(ChapterLike).filter(ChapterLike.user_id == current_user.id).delete()
    db.query(ChapterView).filter(ChapterView.user_id == current_user.id).delete()
    db.query(MangaRating).filter(MangaRating.user_id == current_user.id).delete()
    db.query(MangaBookmark).filter(MangaBookmark.user_id == current_user.id).delete()
    db.query(ReadingHistory).filter(ReadingHistory.user_id == current_user.id).delete()
    db.query(MangaView).filter(MangaView.user_id == current_user.id).delete()
    db.delete(current_user)
    db.commit()
    return {"ok": True}

# --- Admin endpoints ---
@app.get("/admin/users", summary="Список пользователей (админ)")
async def admin_get_users(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    users = db.query(User).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "role": u.role,
            "status": u.status,
            "avatar_url": u.avatar_url or "",
        }
        for u in users
    ]

@app.put("/admin/users/{user_id}/role", summary="Сменить роль (админ)")
async def admin_update_role(user_id: int, data: RoleUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    target.role = data.role
    db.commit()
    return {"ok": True}

@app.put("/admin/users/{user_id}/status", summary="Бан/разбан (админ)")
async def admin_update_status(user_id: int, data: StatusUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if target.role == "admin":
        raise HTTPException(status_code=403, detail="Нельзя заблокировать администратора")
    target.status = data.status
    db.commit()
    return {"ok": True}

# --- Google OAuth ---
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI", "http://localhost:5173")
# Проверка что ключи не заглушки
if GOOGLE_CLIENT_ID.startswith("YOUR_"):
    GOOGLE_CLIENT_ID = ""
if GOOGLE_CLIENT_SECRET.startswith("YOUR_"):
    GOOGLE_CLIENT_SECRET = ""

@app.get("/auth/google", summary="Google OAuth redirect")
async def google_auth():
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth не настроен")
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
    }
    from urllib.parse import urlencode
    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return RedirectResponse(url)

class GoogleCodeRequest(BaseModel):
    code: str

@app.post("/auth/google/callback", summary="Google OAuth callback")
async def google_callback(data: GoogleCodeRequest, db: Session = Depends(get_db)):
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=501, detail="Google OAuth не настроен")
    # Exchange code for token
    token_resp = requests.post("https://oauth2.googleapis.com/token", data={
        "code": data.code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    })
    if token_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Ошибка получения токена Google")
    token_data = token_resp.json()
    # Get user info
    userinfo_resp = requests.get("https://www.googleapis.com/oauth2/v2/userinfo", headers={
        "Authorization": f"Bearer {token_data['access_token']}"
    })
    if userinfo_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Ошибка получения данных пользователя Google")
    google_user = userinfo_resp.json()
    google_id = google_user.get("id", "")
    email = google_user.get("email", "")
    name = google_user.get("name", email.split("@")[0])
    picture = google_user.get("picture", "")
    # Find or create user
    user = db.query(User).filter(User.google_id == google_id).first()
    if not user:
        user = db.query(User).filter(User.email == email).first()
    if user:
        if not user.google_id:
            user.google_id = google_id
        if picture and not user.avatar_url:
            user.avatar_url = picture
        db.commit()
    else:
        user = User(
            username=name,
            email=email,
            hashed_password="",
            google_id=google_id,
            avatar_url=picture,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    # Create JWT
    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/chapters/{chapter_id}/view", summary="Засчитать просмотр")
async def add_view(
    chapter_id: str,
    manga_id: str = Query(..., description="ID манги (MD5 от URL)"),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    # Определяем IP
    ip = request.client.host if request else "0.0.0.0"
    print(f"[DEBUG] Попытка просмотра: manga={manga_id}, chapter={chapter_id}, user={current_user.id if current_user else 'Anon'}, ip={ip}")
    
    # Проверяем уникальность
    if current_user:
        # Если залогинен - по UserID
        existing_view = db.query(ChapterView).filter(
            ChapterView.chapter_id == chapter_id,
            ChapterView.user_id == current_user.id
        ).first()
        if existing_view:
            return {"status": "already_viewed", "count": 0}
        
        new_view = ChapterView(chapter_id=chapter_id, manga_id=manga_id, user_id=current_user.id, ip_address=ip)
        db.add(new_view)
        db.commit()
        return {"status": "viewed", "by": "user"}
    
    else:
        # Если аноним - по IP (для данной главы)
        existing_view = db.query(ChapterView).filter(
            ChapterView.chapter_id == chapter_id,
            ChapterView.ip_address == ip,
            ChapterView.user_id == None
        ).first()
        if existing_view:
             return {"status": "already_viewed", "count": 0}
             
        new_view = ChapterView(chapter_id=chapter_id, manga_id=manga_id, ip_address=ip)
        db.add(new_view)
        db.commit()
        return {"status": "viewed", "by": "ip"}

@app.post("/chapters/{chapter_id}/like", summary="Поставить/Убрать лайк")
async def toggle_like(
    chapter_id: str,
    manga_id: str = Query(..., description="ID манги"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user) # Только авторизованные
):
    existing_like = db.query(ChapterLike).filter(
        ChapterLike.chapter_id == chapter_id,
        ChapterLike.user_id == current_user.id
    ).first()
    
    if existing_like:
        db.delete(existing_like)
        db.commit()
        return {"status": "unliked"}
    else:
        # Проверяем уникальность (на всякий случай, хотя constraints есть)
        try:
            new_like = ChapterLike(chapter_id=chapter_id, manga_id=manga_id, user_id=current_user.id)
            db.add(new_like)
            db.commit()
            return {"status": "liked"}
        except:
            db.rollback()
            return {"status": "error", "detail": "Already liked"}

# ─── Оценки манги ───────────────────────────────────────────────────
@app.post("/manga/{manga_id}/rate", summary="Оценить мангу")
async def rate_manga(
    manga_id: str,
    rating: int = Body(..., ge=1, le=10, embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing = db.query(MangaRating).filter(
        MangaRating.manga_id == manga_id,
        MangaRating.user_id == current_user.id
    ).first()
    if existing:
        existing.rating = rating
    else:
        db.add(MangaRating(manga_id=manga_id, user_id=current_user.id, rating=rating))
    db.commit()
    # Возвращаем агрегированные данные
    all_ratings = db.query(MangaRating).filter(MangaRating.manga_id == manga_id).all()
    avg = sum(r.rating for r in all_ratings) / len(all_ratings) if all_ratings else 0
    distribution = {}
    for r in all_ratings:
        distribution[str(r.rating)] = distribution.get(str(r.rating), 0) + 1
    return {"status": "ok", "average": round(avg, 2), "total": len(all_ratings), "distribution": distribution}

# ─── Закладки манги ─────────────────────────────────────────────────
@app.get("/auth/bookmarks", summary="Получить все закладки текущего пользователя")
async def get_user_bookmarks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    bookmarks = db.query(MangaBookmark).filter(MangaBookmark.user_id == current_user.id).all()
    return [
        {
            "mangaId": b.manga_id,
            "status": b.status,
            "addedAt": b.created_at.isoformat() if b.created_at else None,
        }
        for b in bookmarks
    ]

@app.post("/manga/{manga_id}/bookmark", summary="Добавить/обновить закладку")
async def set_bookmark(
    manga_id: str,
    status: str = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    valid_statuses = ['Читаю', 'Буду читать', 'Прочитано', 'Отложено', 'Не интересно', 'Брошено']
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Недопустимый статус. Допустимые: {valid_statuses}")
    existing = db.query(MangaBookmark).filter(
        MangaBookmark.manga_id == manga_id,
        MangaBookmark.user_id == current_user.id
    ).first()
    if existing:
        existing.status = status
    else:
        db.add(MangaBookmark(manga_id=manga_id, user_id=current_user.id, status=status))
    db.commit()
    return {"status": "ok"}

@app.delete("/manga/{manga_id}/bookmark", summary="Удалить закладку")
async def remove_bookmark(
    manga_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing = db.query(MangaBookmark).filter(
        MangaBookmark.manga_id == manga_id,
        MangaBookmark.user_id == current_user.id
    ).first()
    if existing:
        db.delete(existing)
        db.commit()
    return {"status": "ok"}

# ═══════════ Рандомайзер закладок ═══════════

@app.get("/auth/bookmarks/random", summary="Случайная давно не читанная закладка")
async def random_bookmark(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    import random
    from sqlalchemy import func

    # Get all bookmarks except "Не интересно" and "Брошено"
    bookmarks = db.query(MangaBookmark).filter(
        MangaBookmark.user_id == current_user.id,
        MangaBookmark.status.notin_(["Не интересно", "Брошено"])
    ).all()

    if not bookmarks:
        raise HTTPException(404, "У вас нет подходящих закладок")

    # For each bookmark, find last read time
    scored = []
    for b in bookmarks:
        last_read = db.query(func.max(ReadingHistory.read_at)).filter(
            ReadingHistory.user_id == current_user.id,
            ReadingHistory.manga_id == b.manga_id
        ).scalar()
        scored.append((b, last_read))

    # Sort by last_read ascending (None = never read = top priority)
    scored.sort(key=lambda x: (x[1] is not None, x[1] or datetime.min))

    # Take top 30% oldest, pick random from them
    pool_size = max(1, len(scored) // 3)
    pool = scored[:pool_size]
    chosen_bookmark, last_read_time = random.choice(pool)

    manga = db.query(MangaItem).filter(MangaItem.manga_id == chosen_bookmark.manga_id).first()
    return {
        "manga_id": chosen_bookmark.manga_id,
        "title": manga.title if manga else chosen_bookmark.manga_id,
        "cover_url": manga.cover_url if manga else "",
        "status": chosen_bookmark.status,
        "last_read": last_read_time.isoformat() if last_read_time else None,
    }

# ═══════════ Викторина (Quiz) ═══════════

@app.get("/quiz/question", summary="Получить вопрос викторины")
async def get_quiz_question(mode: str = Query("cover", regex="^(cover|genre|character)$"), db: Session = Depends(get_db)):
    """
    Генерирует вопрос викторины.
    mode=cover — Угадай мангу по обложке
    mode=genre — Угадай жанр манги
    """
    import random, json

    # Get manga with covers
    all_manga = db.query(MangaItem).filter(MangaItem.cover_url != "", MangaItem.cover_url != None, MangaItem.title != "").all()
    if len(all_manga) < 4:
        raise HTTPException(400, "Недостаточно манги для викторины")

    if mode == "cover":
        # Pick correct answer and 3 wrong
        correct = random.choice(all_manga)
        wrong_pool = [m for m in all_manga if m.manga_id != correct.manga_id]
        wrong = random.sample(wrong_pool, min(3, len(wrong_pool)))

        options = [{"manga_id": correct.manga_id, "title": correct.title}]
        for w in wrong:
            options.append({"manga_id": w.manga_id, "title": w.title})
        random.shuffle(options)

        return {
            "mode": "cover",
            "question": "Угадай мангу по обложке",
            "image_url": correct.cover_url,
            "correct_manga_id": correct.manga_id,
            "options": options,
        }

    elif mode == "genre":
        # Pick a manga, show title+cover, ask which genre it has
        manga_with_genres = [m for m in all_manga if m.genres and m.genres != "[]"]
        if len(manga_with_genres) < 4:
            raise HTTPException(400, "Недостаточно данных")

        correct = random.choice(manga_with_genres)
        try:
            genres = json.loads(correct.genres) if isinstance(correct.genres, str) else correct.genres
        except:
            genres = []
        genres = [g for g in genres if g and len(g) > 1]
        if not genres:
            correct = random.choice(manga_with_genres)
            genres = json.loads(correct.genres)

        correct_genre = random.choice(genres)

        # Collect all unique genres for wrong answers
        all_genres = set()
        for m in manga_with_genres:
            try:
                gs = json.loads(m.genres) if isinstance(m.genres, str) else m.genres
                for g in gs:
                    if g and len(g) > 1:
                        all_genres.add(g)
            except:
                pass
        wrong_genres = list(all_genres - set(genres))
        if len(wrong_genres) < 3:
            wrong_genres = list(all_genres - {correct_genre})
        wrong_genres = random.sample(wrong_genres, min(3, len(wrong_genres)))

        options = [correct_genre] + wrong_genres
        random.shuffle(options)

        return {
            "mode": "genre",
            "question": f"Какой жанр у манги «{correct.title}»?",
            "image_url": correct.cover_url,
            "manga_title": correct.title,
            "correct_answer": correct_genre,
            "options": options,
        }


@app.post("/quiz/answer", summary="Ответить на вопрос викторины")
async def answer_quiz(
    mode: str = Body(...),
    answer: str = Body(...),
    correct: str = Body(...),
    current_user: User = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    is_correct = answer == correct
    xp_gained = 0

    if is_correct and current_user:
        # Award XP for correct answer
        xp_gained = 5
        current_user.xp = (current_user.xp or 0) + xp_gained
        # Recalc level
        xp_for_level = lambda l: 50 * l * l
        lvl = 1
        while (current_user.xp or 0) >= xp_for_level(lvl):
            lvl += 1
        current_user.level = lvl
        db.commit()

    return {
        "correct": is_correct,
        "xp_gained": xp_gained,
    }


# ═══════════ Комментарии к манге/главам ═══════════

def _build_comment_tree(comments, likes_map, current_user_id=None, db=None):
    """Строит дерево комментариев из плоского списка."""
    # Pre-fetch chapters_read for all users in comments
    _chapters_cache = {}
    if db:
        user_ids = set(c.user_id for c in comments if c.user_id)
        if user_ids:
            for uid in user_ids:
                _chapters_cache[uid] = db.query(ReadingHistory).filter(ReadingHistory.user_id == uid).count()

    by_id = {}
    roots = []
    for c in comments:
        liked_by = likes_map.get(c.id, [])
        node = {
            "id": c.id,
            "userId": c.user.email if c.user else "",
            "userNumericId": c.user_id,
            "user": {
                "name": c.user.username if c.user else "Удалён",
                "avatar": c.user.avatar_url if c.user else "",
                "avatar_frame": c.user.avatar_frame if c.user else None,
                "chapters_read": _chapters_cache.get(c.user_id, 0),
            },
            "text": c.text,
            "timestamp": c.created_at.strftime("%d.%m.%Y %H:%M") if c.created_at else "",
            "likedBy": liked_by,
            "replies": [],
            "parentId": c.parent_id,
        }
        by_id[c.id] = node

    for c in comments:
        node = by_id[c.id]
        if c.parent_id and c.parent_id in by_id:
            by_id[c.parent_id]["replies"].append(node)
        else:
            roots.append(node)
    return roots


@app.get("/manga/{manga_id}/comments", summary="Получить комментарии к манге или главе")
async def get_manga_comments(
    manga_id: str,
    chapter_id: str = None,
    db: Session = Depends(get_db),
):
    q = db.query(MangaComment).filter(MangaComment.manga_id == manga_id)
    if chapter_id:
        q = q.filter(MangaComment.chapter_id == chapter_id)
    else:
        q = q.filter(MangaComment.chapter_id == None)
    comments = q.order_by(MangaComment.created_at.asc()).all()

    # Загружаем лайки
    comment_ids = [c.id for c in comments]
    likes = db.query(CommentLike).filter(CommentLike.comment_id.in_(comment_ids)).all() if comment_ids else []
    likes_map = {}
    for lk in likes:
        u = db.query(User).filter(User.id == lk.user_id).first()
        if u:
            likes_map.setdefault(lk.comment_id, []).append(u.email)

    return _build_comment_tree(comments, likes_map, db=db)


class CommentCreate(BaseModel):
    text: str
    parent_id: Optional[int] = None
    chapter_id: Optional[str] = None


@app.post("/manga/{manga_id}/comments", summary="Добавить комментарий")
async def add_manga_comment(
    manga_id: str,
    data: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not data.text.strip():
        raise HTTPException(status_code=400, detail="Текст не может быть пустым")

    # Проверяем parent если есть
    if data.parent_id:
        parent = db.query(MangaComment).filter(MangaComment.id == data.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Родительский комментарий не найден")

    comment = MangaComment(
        manga_id=manga_id,
        chapter_id=data.chapter_id,
        parent_id=data.parent_id,
        user_id=current_user.id,
        text=data.text.strip(),
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    # Notify parent comment author about reply
    if data.parent_id:
        parent = db.query(MangaComment).filter(MangaComment.id == data.parent_id).first()
        if parent and parent.user_id != current_user.id:
            notif_msg = f'<a href="/user/{current_user.id}" class="text-brand-accent hover:underline font-bold">{current_user.username}</a> ответил на ваш <a href="/manga/{manga_id}" class="text-brand-accent hover:underline">комментарий</a>'
            create_notification(db, parent.user_id, notif_msg, f"/manga/{manga_id}", "social")

    return {
        "id": comment.id,
        "userId": current_user.email,
        "userNumericId": current_user.id,
        "user": {"name": current_user.username, "avatar": current_user.avatar_url or "", "avatar_frame": current_user.avatar_frame},
        "text": comment.text,
        "timestamp": comment.created_at.strftime("%d.%m.%Y %H:%M") if comment.created_at else "Только что",
        "likedBy": [],
        "replies": [],
        "parentId": comment.parent_id,
    }


@app.delete("/manga/comments/{comment_id}", summary="Удалить комментарий")
async def delete_manga_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comment = db.query(MangaComment).filter(MangaComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Комментарий не найден")
    if comment.user_id != current_user.id and current_user.role not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Нет прав")

    # Удаляем лайки
    db.query(CommentLike).filter(CommentLike.comment_id == comment_id).delete()
    # Удаляем дочерние рекурсивно
    def delete_children(parent_id):
        children = db.query(MangaComment).filter(MangaComment.parent_id == parent_id).all()
        for child in children:
            delete_children(child.id)
            db.query(CommentLike).filter(CommentLike.comment_id == child.id).delete()
            db.delete(child)
    delete_children(comment_id)
    db.delete(comment)
    db.commit()
    return {"status": "ok"}


@app.post("/manga/comments/{comment_id}/like", summary="Лайк/анлайк комментария")
async def toggle_comment_like(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comment = db.query(MangaComment).filter(MangaComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Комментарий не найден")

    existing = db.query(CommentLike).filter(
        CommentLike.comment_id == comment_id,
        CommentLike.user_id == current_user.id,
    ).first()

    if existing:
        db.delete(existing)
        db.commit()
        return {"status": "unliked"}
    else:
        db.add(CommentLike(comment_id=comment_id, user_id=current_user.id))
        db.commit()
        return {"status": "liked"}


@app.get("/auth/my-comments", summary="Получить все комментарии текущего пользователя")
async def get_my_comments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comments = db.query(MangaComment).filter(
        MangaComment.user_id == current_user.id
    ).order_by(MangaComment.created_at.desc()).limit(50).all()

    result = []
    for c in comments:
        result.append({
            "id": c.id,
            "mangaId": c.manga_id,
            "chapterId": c.chapter_id,
            "text": c.text,
            "timestamp": c.created_at.strftime("%d.%m.%Y %H:%M") if c.created_at else "",
        })
    return result


# ========== Reading History ==========

class HistoryItemCreate(BaseModel):
    manga_id: str
    chapter_id: str

@app.get("/history", summary="Получить историю чтения")
async def get_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    items = db.query(ReadingHistory).filter(
        ReadingHistory.user_id == current_user.id
    ).order_by(ReadingHistory.read_at.desc()).limit(50).all()
    return [
        {"mangaId": item.manga_id, "chapterId": item.chapter_id, "readAt": item.read_at.isoformat()}
        for item in items
    ]

@app.post("/history", summary="Добавить запись в историю чтения")
async def add_history(
    data: HistoryItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing = db.query(ReadingHistory).filter(
        ReadingHistory.user_id == current_user.id,
        ReadingHistory.manga_id == data.manga_id,
        ReadingHistory.chapter_id == data.chapter_id
    ).first()
    if existing:
        from datetime import datetime
        existing.read_at = datetime.utcnow()
        db.commit()
        return {"status": "updated"}
    entry = ReadingHistory(
        user_id=current_user.id,
        manga_id=data.manga_id,
        chapter_id=data.chapter_id
    )
    db.add(entry)
    db.commit()

    # ── Card drop logic ──
    card_dropped = None
    try:
        from models import UserCard
        import random
        # Check if user already has card for this manga
        existing_card = db.query(UserCard).filter(
            UserCard.user_id == current_user.id,
            UserCard.manga_id == data.manga_id
        ).first()
        if not existing_card:
            # Count chapters read for this manga
            chapters_for_manga = db.query(ReadingHistory).filter(
                ReadingHistory.user_id == current_user.id,
                ReadingHistory.manga_id == data.manga_id
            ).count()
            # Card drops after reading 3+ chapters of a manga (with some RNG)
            if chapters_for_manga >= 3:
                drop_chance = min(0.8, 0.2 + chapters_for_manga * 0.05)
                if random.random() < drop_chance:
                    # Determine rarity
                    roll = random.random()
                    if roll < 0.50:
                        rarity = "common"
                    elif roll < 0.80:
                        rarity = "rare"
                    elif roll < 0.95:
                        rarity = "epic"
                    else:
                        rarity = "legendary"
                    new_card = UserCard(
                        user_id=current_user.id,
                        manga_id=data.manga_id,
                        rarity=rarity
                    )
                    db.add(new_card)
                    db.commit()
                    manga = db.query(MangaItem).filter(MangaItem.manga_id == data.manga_id).first()
                    card_dropped = {
                        "manga_id": data.manga_id,
                        "title": manga.title if manga else data.manga_id,
                        "cover_url": manga.cover_url if manga else "",
                        "rarity": rarity,
                    }
    except:
        pass

    return {"status": "created", "card_dropped": card_dropped}

@app.delete("/history", summary="Очистить историю чтения")
async def clear_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db.query(ReadingHistory).filter(ReadingHistory.user_id == current_user.id).delete()
    db.commit()
    return {"status": "ok"}

# ═══════════ Коллекционные карточки ═══════════

@app.get("/auth/cards", summary="Мои карточки")
async def get_my_cards(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models import UserCard
    cards = db.query(UserCard).filter(UserCard.user_id == current_user.id).order_by(UserCard.obtained_at.desc()).all()
    result = []
    for c in cards:
        manga = db.query(MangaItem).filter(MangaItem.manga_id == c.manga_id).first()
        result.append({
            "id": c.id,
            "manga_id": c.manga_id,
            "title": manga.title if manga else c.manga_id,
            "cover_url": manga.cover_url if manga else "",
            "rarity": c.rarity,
            "obtained_at": c.obtained_at.isoformat() if c.obtained_at else None,
        })
    return result


@app.get("/users/{user_id}/cards", summary="Карточки пользователя")
async def get_user_cards(user_id: int, db: Session = Depends(get_db)):
    from models import UserCard
    u = db.query(User).filter(User.id == user_id, User.status == "active").first()
    if not u:
        raise HTTPException(404, "Пользователь не найден")
    cards = db.query(UserCard).filter(UserCard.user_id == u.id).order_by(UserCard.obtained_at.desc()).all()
    result = []
    for c in cards:
        manga = db.query(MangaItem).filter(MangaItem.manga_id == c.manga_id).first()
        result.append({
            "id": c.id,
            "manga_id": c.manga_id,
            "title": manga.title if manga else c.manga_id,
            "cover_url": manga.cover_url if manga else "",
            "rarity": c.rarity,
            "obtained_at": c.obtained_at.isoformat() if c.obtained_at else None,
        })
    return {"username": u.username, "cards": result}


@app.get("/auth/cards/stats", summary="Статистика коллекции")
async def get_card_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models import UserCard
    cards = db.query(UserCard).filter(UserCard.user_id == current_user.id).all()
    total_manga = db.query(MangaItem).count()
    rarity_counts = {"common": 0, "rare": 0, "epic": 0, "legendary": 0}
    for c in cards:
        rarity_counts[c.rarity] = rarity_counts.get(c.rarity, 0) + 1
    return {
        "total_cards": len(cards),
        "total_manga": total_manga,
        "completion": round(len(cards) / max(total_manga, 1) * 100, 1),
        "rarity_counts": rarity_counts,
    }


# ============================================================
# Catalog import + Background chapter crawler
# ============================================================

crawler_status: Dict = {
    "running": False,
    "processed": 0,
    "total": 0,
    "current_title": "",
    "errors": 0,
}

CATALOG_URL = "https://mangabuff.ru/manga"

# Reusable aiohttp session for chapter page fetches
_chapter_session: Optional[aiohttp.ClientSession] = None

async def get_chapter_session() -> aiohttp.ClientSession:
    global _chapter_session
    if _chapter_session is None or _chapter_session.closed:
        connector = aiohttp.TCPConnector(limit=20, keepalive_timeout=60)
        jar = aiohttp.CookieJar()
        _chapter_session = aiohttp.ClientSession(
            headers=HEADERS,
            connector=connector,
            timeout=aiohttp.ClientTimeout(total=30),
            cookie_jar=jar,
        )
        # Login directly in this session for 18+ content access
        from yarl import URL
        base_url = URL(BASE_URL)
        try:
            # GET /login to grab CSRF token
            async with _chapter_session.get(f"{BASE_URL}/login") as resp:
                html = await resp.text()
                soup = BeautifulSoup(html, "html.parser")
                meta = soup.select_one('meta[name="csrf-token"]')
                csrf_token = meta["content"] if meta else ""

            if csrf_token:
                # POST /login
                async with _chapter_session.post(
                    f"{BASE_URL}/login",
                    headers={
                        "X-CSRF-TOKEN": csrf_token,
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Referer": f"{BASE_URL}/login",
                        "X-Requested-With": "XMLHttpRequest",
                    },
                    data={
                        "_token": csrf_token,
                        "email": MANGABUFF_EMAIL,
                        "password": MANGABUFF_PASSWORD,
                    },
                ) as resp:
                    body = await resp.json()
                    if body.get("status"):
                        print("[get_chapter_session] Logged in directly, session cookies set")
                    else:
                        print(f"[get_chapter_session] Login failed: {body}")
            else:
                print("[get_chapter_session] No CSRF token found")
        except Exception as e:
            print(f"[get_chapter_session] Login failed: {e}")
            _chapter_session.cookie_jar.update_cookies(
                {"confirmed": "1", "age_confirmed": "1", "adult": "1", "show_adult": "1"},
                base_url,
            )
    return _chapter_session


@app.post("/catalog/import", summary="Импорт каталога с mangabuff.ru")
async def import_catalog(db: Session = Depends(get_db)):
    """Пагинированно читает каталог mangabuff.ru (HTML), сохраняет в manga_items (без глав)."""
    import aiohttp, asyncio

    sem = asyncio.Semaphore(5)
    imported = 0
    errors = 0
    total = 0

    jar = aiohttp.CookieJar()
    async with aiohttp.ClientSession(headers=HEADERS, cookie_jar=jar) as session:
        # Login for 18+ content visibility in catalog
        try:
            from yarl import URL as YarlURL
            auth_cookies = await mangabuff_login()
            if auth_cookies:
                session.cookie_jar.update_cookies(auth_cookies, YarlURL(BASE_URL))
        except Exception:
            pass

        # 1. Собираем slug'и из всех страниц каталога
        all_items = []  # list of (slug, name)
        page_num = 1
        while True:
            catalog_page_url = f"{CATALOG_URL}?page={page_num}"
            try:
                async with session.get(catalog_page_url) as resp:
                    if resp.status != 200:
                        break
                    html = await resp.text()
            except Exception as e:
                print(f"[CATALOG] Error fetching page {page_num}: {e}")
                break

            soup = BeautifulSoup(html, "html.parser")
            cards = soup.select(".cards .cards__item")
            if not cards:
                break

            for card in cards:
                # Карточка сама является <a> тегом
                href = card.get("href", "")
                if "/manga/" not in href:
                    continue
                slug = href.strip("/").split("/")[-1] if href else ""
                if not slug:
                    continue
                name_el = card.select_one(".cards__name")
                name = name_el.get_text(strip=True) if name_el else slug
                all_items.append((slug, name))

            page_num += 1
            await asyncio.sleep(0.3)

        total = len(all_items)
        print(f"[CATALOG] Found {total} items to import")

        # 2. Для каждого slug парсим страницу манги
        async def fetch_and_save(slug: str, name: str):
            nonlocal imported, errors
            manga_page_url = f"{BASE_URL}/manga/{slug}"
            source_url = manga_page_url
            manga_id = hashlib.md5(source_url.encode()).hexdigest()

            try:
                async with sem:
                    async with session.get(manga_page_url) as resp:
                        if resp.status != 200:
                            errors += 1
                            return
                        html = await resp.text()
            except Exception as e:
                print(f"[CATALOG] Error fetching {slug}: {e}")
                errors += 1
                return

            soup = BeautifulSoup(html, "html.parser")

            h1 = soup.select_one("h1")
            title = h1.get_text(strip=True) if h1 else name

            desc_el = soup.select_one(".manga__description")
            description = desc_el.get_text(strip=True) if desc_el else ""

            cover_img = soup.select_one(".manga__img img")
            cover = ""
            if cover_img:
                cover = cover_img.get("src") or cover_img.get("data-src") or ""
            if not cover:
                cover = f"{BASE_URL}/img/manga/posters/{slug}.jpg"
            if cover and cover.startswith("/"):
                cover = f"{BASE_URL}{cover}"

            genre_links = soup.select(".manga__middle-links > a")
            genres = []
            status_text = ""
            year = 0
            if genre_links:
                for a in genre_links:
                    g = a.get_text(strip=True)
                    if not g:
                        continue
                    # Проверяем год (4 цифры)
                    if re.match(r'^\d{4}$', g):
                        year = int(g)
                    # Проверяем статус
                    elif any(kw in g.lower() for kw in ['заверш', 'продолж', 'процесс', 'заморож', 'брош', 'выход']):
                        status_text = g
                    else:
                        genres.append(g)

            # Fallback: try to find year in manga info sidebar
            if not year:
                for info_el in soup.select(".manga__info a, .manga__info span, .manga__middle a"):
                    txt = info_el.get_text(strip=True)
                    if re.match(r'^\d{4}$', txt):
                        year = int(txt)
                        break
            if not year:
                # Try from page text with pattern "Год: XXXX" or similar
                info_block = soup.select_one(".manga__info, .manga__middle")
                if info_block:
                    m = re.search(r'(\d{4})', info_block.get_text())
                    if m and 1900 <= int(m.group(1)) <= 2100:
                        year = int(m.group(1))

            tags = [t.get_text(strip=True) for t in soup.select(".tags > .tags__item") if t.get_text(strip=True)]

            alt_names = [s.get_text(strip=True) for s in soup.select(".manga__name-alt > span") if s.get_text(strip=True)]

            # Type
            all_genres_lower = [g.lower() for g in genres]

            # Пропускаем синглы
            if any("сингл" in g for g in all_genres_lower):
                print(f"[CATALOG] Пропуск сингла: {slug}")
                return

            manga_type = "Manga"
            if any("oel-манга" in g for g in all_genres_lower):
                manga_type = "OEL-Manga"
            elif any("руманга" in g for g in all_genres_lower):
                manga_type = "Rukomiks"
            elif any("комикс западный" in g for g in all_genres_lower):
                manga_type = "Western"
            elif any("маньхуа" in g for g in all_genres_lower):
                manga_type = "Manhua"
            elif any("манхва" in g for g in all_genres_lower):
                manga_type = "Manhwa"

            # Извлекаем возрастной рейтинг
            age_rating = None
            for g in genres:
                if g in ('+18', '18+'):
                    age_rating = "18+"
                    break
                elif g in ('16+', '16'):
                    age_rating = "16+"
                    break
                elif g in ('14+', '12+'):
                    age_rating = g if g.endswith('+') else g + '+'
                    break

            # Чистим жанры
            _skip = {'манга', 'манхва', 'маньхуа', 'oel-манга', 'сингл', 'руманга',
                     'комикс западный', '+18', '12+', '14+', '16', '16+', '18+',
                     '1', '2', 'нет', 'япония'}
            genres = [g for g in genres if g.strip() and g.strip().lower() not in _skip]
            tags = [t for t in tags if t.strip() and t.strip().lower() not in _skip]

            # Status
            status = "В процессе"
            if status_text:
                sl = status_text.lower()
                if "заверш" in sl:
                    status = "Завершено"
                elif "заморож" in sl:
                    status = "Заморожено"
                elif "брош" in sl:
                    status = "Брошено"

            additional = {
                "tags": tags,
                "alternative_names": alt_names,
                "status": status,
            }
            if age_rating:
                additional["age_rating"] = age_rating

            try:
                existing = db.query(MangaItem).filter(MangaItem.manga_id == manga_id).first()
                if existing:
                    # Только обновляем метаданные, обложку не перекачиваем
                    existing.title = title or existing.title
                    existing.description = description or existing.description
                    existing.source_url = source_url
                    existing.genres = json.dumps(genres + tags, ensure_ascii=False)
                    existing.manga_type = manga_type
                    existing.year = year or existing.year
                    existing.status = status
                    existing.additional_info = json.dumps(additional, ensure_ascii=False)
                else:
                    # Новый тайтл — скачиваем обложку
                    local_cover_url = cover
                    if cover and not cover.startswith("data:"):
                        covers_dir = os.path.join(MANGA_DIR, manga_id, "covers")
                        os.makedirs(covers_dir, exist_ok=True)
                        cover_path = os.path.join(covers_dir, "main_cover.jpg")
                        try:
                            async with sem:
                                async with session.get(cover, headers={**HEADERS, "Referer": BASE_URL}) as r:
                                    if r.status == 200:
                                        content = await r.read()
                                        async with aiofiles.open(cover_path, 'wb') as f:
                                            await f.write(content)
                                        relative = os.path.relpath(cover_path, MANGA_DIR).replace("\\", "/")
                                        local_cover_url = f"/static/{relative}"
                                        print(f"[CATALOG] Обложка сохранена: {slug}")
                        except Exception as e:
                            print(f"[CATALOG] Не удалось скачать обложку {slug}: {e}")
                    db.add(MangaItem(
                        manga_id=manga_id,
                        title=title,
                        description=description,
                        cover_url=local_cover_url,
                        source_url=source_url,
                        genres=json.dumps(genres + tags, ensure_ascii=False),
                        manga_type=manga_type,
                        year=year,
                        status=status,
                        additional_info=json.dumps(additional, ensure_ascii=False),
                        chapters="[]",
                    ))
                db.commit()
                imported += 1
            except Exception as e:
                db.rollback()
                print(f"[CATALOG] DB error for {slug}: {e}")
                errors += 1

        for batch_start in range(0, len(all_items), 5):
            batch = all_items[batch_start:batch_start + 5]
            await asyncio.gather(*[fetch_and_save(slug, name) for slug, name in batch])
            await asyncio.sleep(0.5)

    return {"imported": imported, "total": total, "errors": errors}


async def background_chapter_crawler(force: bool = False):
    """Фоновый краулер: берёт манги без глав (или все при force) и загружает их с mangabuff."""
    global crawler_status
    crawler_status = {"running": True, "processed": 0, "total": 0, "current_title": "", "errors": 0}

    db = SessionLocal()
    try:
        from sqlalchemy import func
        if force:
            items = db.query(MangaItem).all()
        else:
            manga_with_chapters = db.query(Chapter.manga_id).distinct().subquery()
            items = db.query(MangaItem).filter(
                ~MangaItem.manga_id.in_(db.query(manga_with_chapters.c.manga_id))
            ).all()
        crawler_status["total"] = len(items)
        print(f"[CRAWLER] {len(items)} mangas need chapters")

        sem = asyncio.Semaphore(3)

        jar = aiohttp.CookieJar()
        async with aiohttp.ClientSession(headers=HEADERS, cookie_jar=jar) as session:
            # Login to mangabuff for 18+ content
            try:
                from yarl import URL as YarlURL
                auth_cookies = await mangabuff_login()
                if auth_cookies:
                    session.cookie_jar.update_cookies(auth_cookies, YarlURL(BASE_URL))
                    print("[CRAWLER] Auth cookies applied")
            except Exception as e:
                print(f"[CRAWLER] Login failed: {e}")

            # Получаем CSRF-токен один раз
            csrf_token = ""
            try:
                async with session.get(BASE_URL) as resp:
                    html = await resp.text()
                    soup = BeautifulSoup(html, "html.parser")
                    meta = soup.select_one('meta[name*="csrf-token"]')
                    csrf_token = meta["content"] if meta else ""
            except Exception:
                pass

            for batch_start in range(0, len(items), 3):
                batch = items[batch_start:batch_start + 3]

                async def process_item(item):
                    slug = ""
                    if item.source_url:
                        slug = item.source_url.rstrip("/").split("/")[-1]
                    if not slug:
                        crawler_status["errors"] += 1
                        crawler_status["processed"] += 1
                        return

                    crawler_status["current_title"] = item.title or slug
                    manga_page_url = f"{BASE_URL}/manga/{slug}"
                    try:
                        async with sem:
                            async with session.get(manga_page_url) as resp:
                                if resp.status != 200:
                                    crawler_status["errors"] += 1
                                    crawler_status["processed"] += 1
                                    return
                                html = await resp.text()
                    except Exception as e:
                        print(f"[CRAWLER] Error fetching {slug}: {e}")
                        crawler_status["errors"] += 1
                        crawler_status["processed"] += 1
                        return

                    soup = BeautifulSoup(html, "html.parser")

                    # Parse year if missing
                    if not item.year:
                        for a in soup.select(".manga__middle-links > a"):
                            g = a.get_text(strip=True)
                            if re.match(r'^\d{4}$', g):
                                try:
                                    crawl_db2 = SessionLocal()
                                    db_item = crawl_db2.query(MangaItem).filter(MangaItem.manga_id == item.manga_id).first()
                                    if db_item:
                                        db_item.year = int(g)
                                        crawl_db2.commit()
                                except Exception:
                                    crawl_db2.rollback()
                                finally:
                                    crawl_db2.close()
                                break

                    # Парсим главы из HTML
                    chapters_elements = soup.select("a.chapters__item")

                    # Если есть кнопка подгрузки — пробуем POST
                    manga_el = soup.select_one("[data-id]")
                    manga_data_id = manga_el.get("data-id", "") if manga_el else ""
                    load_trigger = soup.select_one(".load-chapters-trigger")

                    # Get per-page CSRF (more reliable than global one)
                    page_csrf = csrf_token
                    page_csrf_meta = soup.select_one('meta[name*="csrf-token"]')
                    if page_csrf_meta:
                        page_csrf = page_csrf_meta.get("content", csrf_token)

                    extra_content_html = ""
                    if load_trigger and manga_data_id and page_csrf:
                        try:
                            load_headers = {
                                **HEADERS,
                                "X-CSRF-TOKEN": page_csrf,
                                "X-Requested-With": "XMLHttpRequest",
                                "Content-Type": "application/x-www-form-urlencoded",
                                "Referer": manga_page_url,
                            }
                            async with sem:
                                async with session.post(
                                    f"{BASE_URL}/chapters/load",
                                    headers=load_headers,
                                    data={"manga_id": manga_data_id},
                                    timeout=aiohttp.ClientTimeout(total=30),
                                ) as load_resp:
                                    if load_resp.status == 200:
                                        raw_text = await load_resp.text()
                                        # Response may be JSON with "content" field
                                        try:
                                            load_json = json.loads(raw_text)
                                            extra_content_html = load_json.get("content", "")
                                        except (json.JSONDecodeError, TypeError):
                                            extra_content_html = raw_text
                        except Exception:
                            pass

                    # Собираем все главы
                    all_chapter_els = list(chapters_elements)
                    if extra_content_html:
                        extra_soup = BeautifulSoup(extra_content_html, "html.parser")
                        all_chapter_els.extend(extra_soup.select("a.chapters__item"))

                    formatted = []
                    seen_urls = set()
                    for a in all_chapter_els:
                        href = a.get("href", "")
                        ch_url = f"{BASE_URL}{href}" if href.startswith("/") else href
                        if ch_url in seen_urls:
                            continue
                        seen_urls.add(ch_url)

                        val_el = a.select_one(".chapters__value")
                        name_el = a.select_one(".chapters__name")
                        date_el = a.select_one(".chapters__add-date")

                        raw_val = val_el.get_text(strip=True) if val_el else ""
                        # Extract number from "Глава111.32" -> "111.32"
                        num_match = re.search(r'[\d]+(?:\.[\d]+)?', raw_val)
                        ch_number = num_match.group(0) if num_match else raw_val
                        ch_name = name_el.get_text(strip=True) if name_el else ""
                        date_added = date_el.get_text(strip=True) if date_el else ""
                        ch_title = f"Глава {ch_number}" if ch_number else ch_name or "Глава"
                        # Store volume-chapter path from URL, e.g. "10-111.32"
                        ch_slug = ""
                        if href:
                            clean = href.replace(BASE_URL, "").strip("/")
                            parts = clean.split("/")
                            # /manga/slug/vol/ch -> take last 2 parts joined with "-"
                            if len(parts) >= 2:
                                ch_slug = "-".join(parts[-2:])
                            else:
                                ch_slug = parts[-1] if parts else ""

                        formatted.append({
                            "chapter_id": ch_slug or ch_url,
                            "name": ch_title,
                            "chapter_number": ch_number,
                            "date_added": date_added,
                            "pages": [],
                        })

                    try:
                        crawl_db = SessionLocal()
                        if force:
                            crawl_db.query(Chapter).filter(Chapter.manga_id == item.manga_id).delete()
                        upsert_chapters(crawl_db, item.manga_id, formatted)
                        crawl_db.commit()
                    except Exception as e:
                        crawl_db.rollback()
                        print(f"[CRAWLER] DB error for {slug}: {e}")
                        crawler_status["errors"] += 1
                    finally:
                        crawl_db.close()

                    crawler_status["processed"] += 1

                await asyncio.gather(*[process_item(it) for it in batch])
                await asyncio.sleep(0.5)

    except Exception as e:
        print(f"[CRAWLER] Fatal error: {e}")
    finally:
        db.close()
        crawler_status["running"] = False
        crawler_status["current_title"] = ""
        print(f"[CRAWLER] Done. Processed: {crawler_status['processed']}, Errors: {crawler_status['errors']}")


@app.post("/catalog/crawl-chapters", summary="Запустить фоновый краулер глав")
async def start_chapter_crawler(force: bool = Query(False, description="Перепарсить ВСЕ манги, включая уже имеющие главы")):
    global crawler_status
    if crawler_status.get("running"):
        return {"status": "already_running", **crawler_status}
    asyncio.create_task(background_chapter_crawler(force=force))
    return {"status": "started", "force": force}


@app.post("/catalog/recrawl-manga/{manga_id}", summary="Перепарсить главы и год для конкретной манги")
async def recrawl_single_manga(manga_id: str, db: Session = Depends(get_db)):
    """Удаляет старые главы, заново парсит страницу манги и сохраняет главы + год."""
    item = db.query(MangaItem).filter(MangaItem.manga_id == manga_id).first()
    if not item or not item.source_url:
        raise HTTPException(status_code=404, detail="Manga not found or no source_url")

    slug = item.source_url.rstrip("/").split("/")[-1]
    manga_page_url = f"{BASE_URL}/manga/{slug}"

    jar = aiohttp.CookieJar()
    async with aiohttp.ClientSession(headers=HEADERS, cookie_jar=jar) as session:
        # Login for 18+ access
        try:
            from yarl import URL as YarlURL
            auth_cookies = await mangabuff_login()
            if auth_cookies:
                session.cookie_jar.update_cookies(auth_cookies, YarlURL(BASE_URL))
        except Exception:
            pass

        async with session.get(manga_page_url) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=502, detail=f"Source returned {resp.status}")
            html = await resp.text()

        soup = BeautifulSoup(html, "html.parser")

        # Parse year
        year = 0
        for a in soup.select(".manga__middle-links > a"):
            g = a.get_text(strip=True)
            if re.match(r'^\d{4}$', g):
                year = int(g)
                break
        if not year:
            for info_el in soup.select(".manga__info a, .manga__info span, .manga__middle a"):
                txt = info_el.get_text(strip=True)
                if re.match(r'^\d{4}$', txt):
                    year = int(txt)
                    break

        if year:
            item.year = year

        # Parse chapters from HTML
        chapters_elements = soup.select("a.chapters__item")

        # Load extra chapters via POST
        manga_el = soup.select_one("[data-id]")
        manga_data_id = manga_el.get("data-id", "") if manga_el else ""
        load_trigger = soup.select_one(".load-chapters-trigger")

        if load_trigger and manga_data_id:
            csrf_meta = soup.select_one('meta[name*="csrf-token"]')
            csrf_token = csrf_meta["content"] if csrf_meta else ""
            if csrf_token:
                try:
                    load_headers = {
                        **HEADERS,
                        "X-CSRF-TOKEN": csrf_token,
                        "X-Requested-With": "XMLHttpRequest",
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Referer": manga_page_url,
                    }
                    async with session.post(
                        f"{BASE_URL}/chapters/load",
                        headers=load_headers,
                        data={"manga_id": manga_data_id},
                        timeout=aiohttp.ClientTimeout(total=30),
                    ) as load_resp:
                        if load_resp.status == 200:
                            raw_text = await load_resp.text()
                            try:
                                load_json = json.loads(raw_text)
                                extra_html = load_json.get("content", "")
                            except (json.JSONDecodeError, TypeError):
                                extra_html = raw_text
                            if extra_html:
                                extra_soup = BeautifulSoup(extra_html, "html.parser")
                                chapters_elements = list(chapters_elements) + extra_soup.select("a.chapters__item")
                except Exception:
                    pass

        formatted = []
        seen_urls = set()
        for a in chapters_elements:
            href = a.get("href", "")
            ch_url = f"{BASE_URL}{href}" if href.startswith("/") else href
            if ch_url in seen_urls:
                continue
            seen_urls.add(ch_url)

            val_el = a.select_one(".chapters__value")
            name_el = a.select_one(".chapters__name")
            date_el = a.select_one(".chapters__add-date")

            raw_number = val_el.get_text(strip=True) if val_el else ""
            ch_name = name_el.get_text(strip=True) if name_el else ""
            date_added = date_el.get_text(strip=True) if date_el else ""

            # Extract clean number from "Глава5" or "Глава 5" -> "5"
            num_match = re.search(r'[\d]+(?:\.[\d]+)?', raw_number)
            ch_number = num_match.group(0) if num_match else raw_number

            # Build volume info from URL (e.g. /manga/slug/1/5 -> vol=1)
            vol_el = a.select_one(".chapters__volume")
            vol_raw = vol_el.get_text(strip=True) if vol_el else ""
            vol = re.sub(r'^(?:Том|Vol\.?)\s*', '', vol_raw, flags=re.IGNORECASE).strip()

            if vol and ch_number:
                ch_title = f"Том {vol} Глава {ch_number}"
            elif ch_number:
                ch_title = f"Глава {ch_number}"
            else:
                ch_title = ch_name or "Глава"

            ch_slug = ""
            if href:
                clean = href.replace(BASE_URL, "").strip("/")
                parts = clean.split("/")
                if len(parts) >= 2:
                    ch_slug = "-".join(parts[-2:])
                else:
                    ch_slug = parts[-1] if parts else ""

            formatted.append({
                "chapter_id": ch_slug or ch_url,
                "name": ch_title,
                "chapter_number": ch_number,
                "date_added": date_added,
                "pages": [],
            })

        # Delete old chapters and insert new
        db.query(Chapter).filter(Chapter.manga_id == manga_id).delete()
        upsert_chapters(db, manga_id, formatted)
        db.commit()

    return {
        "status": "ok",
        "manga_id": manga_id,
        "year": year,
        "chapters_count": len(formatted),
    }


@app.get("/catalog/crawler-status", summary="Статус краулера глав")
async def get_crawler_status():
    return crawler_status


@app.get("/catalog/chapter-pages/{chapter_slug:path}", summary="Lazy-load страниц главы по slug")
async def get_chapter_pages(chapter_slug: str, manga_id: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """Подгружает страницы главы через HTML-парсинг mangabuff, кеширует в БД."""
    # Check if already cached in DB (try both dash and slash variants)
    if manga_id:
        existing = db.query(Chapter).filter(Chapter.chapter_id == chapter_slug, Chapter.manga_id == manga_id).first()
        if not existing:
            slug_alt = chapter_slug.replace("-", "/", 1) if re.match(r'^\d+-\d', chapter_slug) else chapter_slug.replace("/", "-", 1)
            existing = db.query(Chapter).filter(Chapter.chapter_id == slug_alt, Chapter.manga_id == manga_id).first()
    else:
        existing = db.query(Chapter).filter(Chapter.chapter_id == chapter_slug).first()
    if existing:
        pages = []
        try:
            pages = json.loads(existing.pages) if existing.pages else []
        except (json.JSONDecodeError, TypeError):
            pages = []
        if pages:
            return {"pages": pages, "total_pages": len(pages)}

    # Build candidate URLs from manga source_url + chapter_slug
    candidate_urls = []
    # chapter_slug may be "1-5" (vol-ch) stored with dash, restore to "1/5" for URL
    slug_with_slash = chapter_slug.replace("-", "/", 1) if re.match(r'^\d+-\d', chapter_slug) else chapter_slug
    if chapter_slug.startswith("http"):
        candidate_urls.append(chapter_slug)
    elif manga_id:
        item = db.query(MangaItem).filter(MangaItem.manga_id == manga_id).first()
        if item and item.source_url:
            # Try both dash and slash variants
            if "/" in slug_with_slash:
                candidate_urls.append(f"{item.source_url}/{slug_with_slash}")
            if "-" in chapter_slug:
                # Also try the dash version in case URL really has dashes
                candidate_urls.append(f"{item.source_url}/{chapter_slug}")
            if "/" not in slug_with_slash and "-" not in chapter_slug:
                # Old format: just "111.32", try vol1..vol20
                for vol in range(1, 21):
                    candidate_urls.append(f"{item.source_url}/{vol}/{chapter_slug}")
        else:
            candidate_urls.append(f"{BASE_URL}/{slug_with_slash}")
    else:
        candidate_urls.append(f"{BASE_URL}/{slug_with_slash}")

    pages = []
    session = await get_chapter_session()
    last_error = None
    tried_urls = []
    for chapter_url in candidate_urls:
        tried_urls.append(chapter_url)
        try:
            async with session.get(chapter_url) as resp:
                print(f"[chapter-pages] GET {chapter_url} -> {resp.status}")
                if resp.status != 200:
                    continue
                html = await resp.text()
                soup = BeautifulSoup(html, "html.parser")
                # Try multiple selectors for reader images
                img_elements = soup.select(".reader__pages img")
                if not img_elements:
                    img_elements = soup.select(".reader-pages img, .chapter-pages img, .manga-reader img, [class*=reader] img")
                print(f"[chapter-pages] Found {len(img_elements)} img elements")
                for img in img_elements:
                    src = img.get("data-src") or img.get("src") or ""
                    if src and not src.startswith("data:"):
                        if src.startswith("/"):
                            src = f"{BASE_URL}{src}"
                        pages.append(src)
                if pages:
                    break
                else:
                    # Debug: log page title and check for age gate
                    title_tag = soup.select_one("title")
                    print(f"[chapter-pages] No pages found. Title: {title_tag.text if title_tag else 'N/A'}")
                    if "confirm" in html.lower() or "возраст" in html.lower():
                        print("[chapter-pages] Age confirmation page detected!")
        except Exception as e:
            last_error = e
            continue

    # Fallback: use Playwright for 18+ restricted content
    if not pages and tried_urls:
        try:
            from playwright.async_api import async_playwright
            # Prepare auth cookies for Playwright
            pw_cookies = []
            try:
                auth_cookies = await mangabuff_login()
                for name, value in auth_cookies.items():
                    pw_cookies.append({"name": name, "value": value, "domain": ".mangabuff.ru", "path": "/"})
            except Exception:
                pass
            async with async_playwright() as pw:
                browser = await pw.chromium.launch(headless=True)
                context = await browser.new_context(user_agent=HEADERS["User-Agent"])
                if pw_cookies:
                    await context.add_cookies(pw_cookies)
                page = await context.new_page()
                for chapter_url in tried_urls:
                    try:
                        await page.goto(chapter_url, wait_until='domcontentloaded', timeout=15000)
                        # Click age confirmation button if present
                        try:
                            confirm_btn = page.locator('button:has-text("Подтвердить"), a:has-text("Подтвердить"), button:has-text("Да"), .age-confirm, .confirm-age')
                            if await confirm_btn.count() > 0:
                                await confirm_btn.first.click()
                                await page.wait_for_timeout(1500)
                        except Exception:
                            pass
                        # Wait for reader images
                        await page.wait_for_timeout(2000)
                        imgs = await page.evaluate("""() => {
                            const imgs = document.querySelectorAll('.reader__pages img');
                            return Array.from(imgs).map(img => img.dataset.src || img.src).filter(s => s && !s.startsWith('data:'));
                        }""")
                        if imgs:
                            for src in imgs:
                                if src.startswith("/"):
                                    src = f"{BASE_URL}{src}"
                                pages.append(src)
                            break
                    except Exception as e:
                        last_error = e
                        continue
                await browser.close()
        except Exception as e:
            print(f"[chapter-pages] Playwright fallback failed: {e}")

    if not pages and not candidate_urls:
        raise HTTPException(status_code=404, detail=f"Chapter {chapter_slug} not found")
    if not pages and last_error:
        raise HTTPException(status_code=502, detail=f"Error fetching chapter pages: {last_error}")
    if not pages:
        raise HTTPException(status_code=404, detail=f"Chapter {chapter_slug} not found on source (tried {len(candidate_urls)} URLs)")

    # Cache in DB — validate all pages come from same source (prevents cross-contamination)
    if existing and pages:
        # Check that all pages share the same CDN chapter path (same manga+chapter on CDN)
        from urllib.parse import urlparse
        first_path = "/".join(urlparse(pages[0]).path.split("/")[:-1])  # strip filename
        all_same = all(first_path in p for p in pages)
        if all_same:
            existing.pages = json.dumps(pages, ensure_ascii=False)
            existing.total_pages = len(pages)
            db.commit()
        else:
            print(f"[chapter-pages] WARNING: Mixed page sources detected, not caching.")

    return {"pages": pages, "total_pages": len(pages)}


@app.get("/manga/filters-meta", summary="Метаданные для фильтров каталога")
async def get_filters_meta(db: Session = Depends(get_db)):
    """Возвращает все уникальные типы, статусы, жанры и категории для фильтров."""
    items = db.query(MangaItem.manga_type, MangaItem.status, MangaItem.genres).all()

    types_set = set()
    statuses_set = set()
    genres_set = set()
    categories_set = set()

    # Демографические категории (отдельный фильтр)
    category_names = {'сёнэн', 'сёдзё', 'дзёсэй', 'сэйнэн', 'кодомо', 'додзинси'}

    skip_genres = {'манга', 'манхва', 'маньхуа', 'manga', 'manhwa', 'manhua',
                   'oel-манга', 'сингл', 'рукомикс', 'комикс западный', 'руманга',
                   '16+', '18+', '6+', '12+', '14+', '0+', '+18', '16', '1', '2',
                   'нет', 'япония', 'корея', 'китай', 'сша'}

    for mt, st, genres_json in items:
        if mt:
            types_set.add(mt)
        if st:
            statuses_set.add(st)
        try:
            genres_list = json.loads(genres_json) if genres_json else []
        except (json.JSONDecodeError, TypeError):
            genres_list = []
        for g in genres_list:
            gl = g.strip()
            if not gl:
                continue
            if re.match(r'^\d{4}$', gl):
                continue
            if gl.lower() in skip_genres:
                continue
            if gl.lower() in category_names:
                categories_set.add(gl)
            else:
                genres_set.add(gl)

    return {
        "types": sorted(types_set),
        "statuses": sorted(statuses_set),
        "genres": sorted(genres_set),
        "categories": sorted(categories_set),
    }


# ─── Скрапинг рангов с mangabuff ───────────────────────────────────

_scrape_ranks_running = False
_scrape_ranks_progress = {"status": "idle", "sort": "", "page": 0, "total_pages": 0, "updated": 0}

@app.post("/catalog/scrape-ranks", summary="Скрапинг рангов популярности/рейтинга с mangabuff")
async def scrape_mangabuff_ranks(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    global _scrape_ranks_running
    if _scrape_ranks_running:
        return {"status": "already_running", "progress": _scrape_ranks_progress}
    _scrape_ranks_running = True
    _scrape_ranks_progress.update({"status": "starting", "sort": "", "page": 0, "total_pages": 0, "updated": 0})
    background_tasks.add_task(_do_scrape_ranks)
    return {"status": "started"}


@app.get("/catalog/scrape-ranks-status", summary="Статус скрапинга рангов")
async def scrape_ranks_status():
    return _scrape_ranks_progress


async def _do_scrape_ranks():
    global _scrape_ranks_running
    import aiohttp
    from bs4 import BeautifulSoup
    import hashlib

    db = SessionLocal()
    try:
        # Build URL -> manga_id mapping
        all_manga = db.query(MangaItem.manga_id, MangaItem.source_url).all()
        url_to_id = {}
        for mid, surl in all_manga:
            if surl:
                url_to_id[surl.rstrip('/')] = mid

        sort_types = [
            ("popular", "mangabuff_popularity_rank"),
            ("rating", "mangabuff_rating_rank"),
            ("created_at", "mangabuff_newest_rank"),
            ("updated_at", "mangabuff_updated_rank"),
        ]

        connector = aiohttp.TCPConnector(limit=5, force_close=True)
        timeout = aiohttp.ClientTimeout(total=30)

        async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
            for sort_name, rank_field in sort_types:
                # Сбрасываем ранги перед скрапингом этого типа
                db.query(MangaItem).update({getattr(MangaItem, rank_field): 0})
                db.commit()

                _scrape_ranks_progress["sort"] = sort_name
                _scrape_ranks_progress["status"] = f"scraping {sort_name}"

                # First get total pages
                first_url = f"https://mangabuff.ru/manga?sort={sort_name}"
                async with session.get(first_url, headers={"User-Agent": "Mozilla/5.0"}) as resp:
                    html = await resp.text()
                soup = BeautifulSoup(html, "html.parser")

                # Find max page
                max_page = 1
                for a in soup.select('.pagination a'):
                    href = a.get('href', '')
                    if 'page=' in href:
                        try:
                            p = int(href.split('page=')[-1])
                            max_page = max(max_page, p)
                        except ValueError:
                            pass

                _scrape_ranks_progress["total_pages"] = max_page
                rank_counter = 0

                for page_num in range(1, max_page + 1):
                    _scrape_ranks_progress["page"] = page_num

                    if page_num == 1:
                        page_html = html  # Already fetched
                    else:
                        page_url = f"https://mangabuff.ru/manga?sort={sort_name}&page={page_num}"
                        try:
                            async with session.get(page_url, headers={"User-Agent": "Mozilla/5.0"}) as resp:
                                if resp.status != 200:
                                    continue
                                page_html = await resp.text()
                        except Exception as e:
                            print(f"[SCRAPE] Error fetching page {page_num} for {sort_name}: {e}")
                            continue

                    page_soup = BeautifulSoup(page_html, "html.parser")
                    left = page_soup.select_one('.catalog__left')
                    if not left:
                        continue

                    cards = left.select('a.cards__item')
                    for card in cards:
                        rank_counter += 1
                        href = card.get('href', '').rstrip('/')
                        rating_el = card.select_one('.cards__rating')
                        rating_val = rating_el.get_text(strip=True) if rating_el else "0"

                        manga_id = url_to_id.get(href)
                        if manga_id:
                            update_data = {rank_field: rank_counter}
                            if sort_name == "rating":
                                update_data["mangabuff_rating"] = rating_val
                            db.query(MangaItem).filter(MangaItem.manga_id == manga_id).update(update_data)
                            _scrape_ranks_progress["updated"] += 1

                    db.commit()

                    # Small delay to be nice to mangabuff
                    import asyncio
                    await asyncio.sleep(0.3)

        _scrape_ranks_progress["status"] = "done"
    except Exception as e:
        _scrape_ranks_progress["status"] = f"error: {str(e)}"
        print(f"[SCRAPE] Error: {e}")
    finally:
        db.close()
        _scrape_ranks_running = False


# ─── Скрапинг просмотров и рейтинга с каждой страницы манги ──────

_scrape_views_running = False
_scrape_views_progress = {"status": "idle", "current": 0, "total": 0, "updated": 0, "current_title": ""}

@app.post("/catalog/scrape-views", summary="Скрапинг просмотров с mangabuff (со страниц каждой манги)")
async def scrape_mangabuff_views(
    background_tasks: BackgroundTasks,
):
    global _scrape_views_running
    if _scrape_views_running:
        return {"status": "already_running", "progress": _scrape_views_progress}
    _scrape_views_running = True
    _scrape_views_progress.update({"status": "starting", "current": 0, "total": 0, "updated": 0, "current_title": ""})
    background_tasks.add_task(_do_scrape_views)
    return {"status": "started"}


@app.get("/catalog/scrape-views-status", summary="Статус скрапинга просмотров")
async def scrape_views_status():
    return _scrape_views_progress


async def _do_scrape_views():
    global _scrape_views_running
    import aiohttp
    from bs4 import BeautifulSoup
    import asyncio

    db = SessionLocal()
    try:
        all_manga = db.query(MangaItem.manga_id, MangaItem.source_url, MangaItem.title).filter(
            MangaItem.source_url != "",
            MangaItem.source_url != None
        ).all()
        # Пропускаем уже собранные (если перезапуск)
        already_done = {m.manga_id for m in db.query(MangaItem.manga_id).filter(MangaItem.mangabuff_views > 0).all()}
        remaining = [(mid, url, title) for mid, url, title in all_manga if mid not in already_done]
        _scrape_views_progress["total"] = len(all_manga)
        _scrape_views_progress["updated"] = len(already_done)
        _scrape_views_progress["current"] = len(already_done)

        BATCH_SIZE = 15

        connector = aiohttp.TCPConnector(limit=BATCH_SIZE, force_close=True)
        timeout = aiohttp.ClientTimeout(total=30)
        jar = aiohttp.CookieJar()

        async def do_login(session):
            """Логин в mangabuff через сессию с cookie_jar."""
            try:
                async with session.get(f"{BASE_URL}/login") as resp:
                    html = await resp.text()
                    login_soup = BeautifulSoup(html, "html.parser")
                    meta = login_soup.select_one('meta[name="csrf-token"]')
                    csrf = meta["content"] if meta else ""
                if not csrf:
                    print("[SCRAPE-VIEWS] No CSRF token for login")
                    return
                async with session.post(f"{BASE_URL}/login", headers={
                    "X-CSRF-TOKEN": csrf,
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer": f"{BASE_URL}/login",
                    "X-Requested-With": "XMLHttpRequest",
                }, data={
                    "_token": csrf,
                    "email": MANGABUFF_EMAIL,
                    "password": MANGABUFF_PASSWORD,
                }) as resp:
                    body = await resp.json()
                    print(f"[SCRAPE-VIEWS] Login: {body}")
            except Exception as e:
                print(f"[SCRAPE-VIEWS] Login error: {e}")

        async def fetch_one(session, manga_id, source_url, title):
            try:
                async with session.get(source_url, headers={"User-Agent": "Mozilla/5.0"}) as resp:
                    if resp.status != 200:
                        return None
                    html = await resp.text()

                soup = BeautifulSoup(html, "html.parser")

                views_el = soup.select_one('.manga__views')
                views_count = 0
                if views_el:
                    views_text = views_el.get_text(strip=True).replace('\xa0', '').replace(' ', '')
                    try:
                        views_count = int(views_text)
                    except ValueError:
                        pass

                rating_meta = soup.select_one('meta[itemprop="ratingValue"]')
                rating_val = rating_meta.get("content", "").strip() if rating_meta else None

                return (manga_id, views_count, rating_val)
            except Exception as e:
                print(f"[SCRAPE-VIEWS] Error for {title}: {e}")
                return None

        async with aiohttp.ClientSession(connector=connector, timeout=timeout, cookie_jar=jar, headers={"User-Agent": "Mozilla/5.0"}) as session:
            await do_login(session)
            for i in range(0, len(remaining), BATCH_SIZE):
                batch = remaining[i:i + BATCH_SIZE]
                _scrape_views_progress["status"] = "scraping"
                _scrape_views_progress["current_title"] = batch[0][2] if batch else ""

                tasks = [fetch_one(session, mid, url, title) for mid, url, title in batch]
                results = await asyncio.gather(*tasks, return_exceptions=True)

                for result in results:
                    if result is None or isinstance(result, Exception):
                        continue
                    manga_id, views_count, rating_val = result
                    update_data = {"mangabuff_views": views_count}
                    if rating_val:
                        update_data["mangabuff_rating"] = rating_val
                    db.query(MangaItem).filter(MangaItem.manga_id == manga_id).update(update_data)
                    _scrape_views_progress["updated"] += 1

                _scrape_views_progress["current"] = min(len(already_done) + i + BATCH_SIZE, len(all_manga))
                db.commit()
                await asyncio.sleep(0.5)

        _scrape_views_progress["status"] = "done"
    except Exception as e:
        _scrape_views_progress["status"] = f"error: {str(e)}"
        print(f"[SCRAPE-VIEWS] Error: {e}")
    finally:
        db.close()
        _scrape_views_running = False


# ─── Эндпоинт для главной страницы ────────────────────────────────

@app.get("/manga/home-sections", summary="Секции для главной страницы")
async def get_home_sections(db: Session = Depends(get_db)):
    """Возвращает тайтлы для секций главной страницы, отсортированные по данным mangabuff."""
    from sqlalchemy import func as sa_fn
    from collections import defaultdict

    # Предрасчёт пользовательских рейтингов для всех манг
    user_ratings_agg = dict(
        db.query(MangaRating.manga_id, sa_fn.avg(MangaRating.rating))
        .group_by(MangaRating.manga_id)
        .all()
    )
    user_ratings_count = dict(
        db.query(MangaRating.manga_id, sa_fn.count(MangaRating.id))
        .group_by(MangaRating.manga_id)
        .all()
    )
    # Реальные просмотры
    real_views_map = dict(
        db.query(MangaView.manga_id, sa_fn.count(MangaView.id))
        .group_by(MangaView.manga_id)
        .all()
    )

    def build_section(query, limit=10):
        items = query.limit(limit).all()
        result = []
        for item in items:
            avg_user = user_ratings_agg.get(item.manga_id)
            user_avg = round(float(avg_user), 2) if avg_user else None
            user_total = user_ratings_count.get(item.manga_id, 0)
            result.append({
                "manga_id": item.manga_id,
                "title": item.title,
                "cover_url": item.cover_url,
                "manga_type": item.manga_type,
                "year": item.year,
                "status": item.status,
                "mangabuff_rating": item.mangabuff_rating or "0",
                "mangabuff_views": item.mangabuff_views or 0,
                "real_views": real_views_map.get(item.manga_id, 0),
                "genres": safe_json_load(item.genres, []),
                "description": item.description or "",
                "user_rating_avg": user_avg,
                "user_rating_count": user_total,
            })
        return result

    # --- Секция "Последние обновления" с данными о главах ---
    updated_items = db.query(MangaItem).filter(
        MangaItem.mangabuff_updated_rank > 0
    ).order_by(MangaItem.mangabuff_updated_rank.asc()).limit(30).all()

    updated_manga_ids = [item.manga_id for item in updated_items]

    # Получаем главы для этих манг
    chapters_raw = db.query(Chapter).filter(
        Chapter.manga_id.in_(updated_manga_ids)
    ).order_by(Chapter.created_at.desc()).all()

    # Группируем главы по manga_id
    chapters_by_manga = defaultdict(list)
    for ch in chapters_raw:
        chapters_by_manga[ch.manga_id].append(ch)

    latest_updates = []
    for item in updated_items:
        manga_chapters = chapters_by_manga.get(item.manga_id, [])
        # Сортируем по дате (newest first)
        manga_chapters.sort(key=lambda c: c.created_at or datetime.min, reverse=True)

        latest_chapter = None
        recent_count = 0
        if manga_chapters:
            latest_chapter = manga_chapters[0]
            # Считаем главы добавленные за последние 24 часа
            if latest_chapter.created_at:
                cutoff = datetime.utcnow() - timedelta(hours=24)
                recent_count = sum(1 for c in manga_chapters if c.created_at and c.created_at > cutoff)

        avg_user = user_ratings_agg.get(item.manga_id)
        user_avg = round(float(avg_user), 2) if avg_user else None
        user_total = user_ratings_count.get(item.manga_id, 0)
        latest_updates.append({
            "manga_id": item.manga_id,
            "title": item.title,
            "cover_url": item.cover_url,
            "manga_type": item.manga_type,
            "year": item.year,
            "status": item.status,
            "mangabuff_rating": item.mangabuff_rating or "0",
            "genres": safe_json_load(item.genres, []),
            "description": item.description or "",
            "user_rating_avg": user_avg,
            "user_rating_count": user_total,
            "latest_chapter": {
                "chapter_id": latest_chapter.chapter_id,
                "chapter_number": latest_chapter.chapter_number,
                "title": latest_chapter.title,
                "date_added": latest_chapter.date_added,
                "created_at": latest_chapter.created_at.isoformat() if latest_chapter.created_at else None,
            } if latest_chapter else None,
            "recent_chapters_count": recent_count,
            "total_chapters": len(manga_chapters),
        })

    # --- Остальные секции ---
    popular_q = db.query(MangaItem).filter(MangaItem.mangabuff_popularity_rank > 0).order_by(MangaItem.mangabuff_popularity_rank.asc())
    top_rated_q = db.query(MangaItem).filter(MangaItem.mangabuff_rating_rank > 0).order_by(MangaItem.mangabuff_rating_rank.asc())
    newest_q = db.query(MangaItem).filter(MangaItem.mangabuff_newest_rank > 0).order_by(MangaItem.mangabuff_newest_rank.asc())

    # Горячие новинки = новинки с высоким рейтингом
    hot_new_q = db.query(MangaItem).filter(
        MangaItem.mangabuff_newest_rank > 0,
        MangaItem.mangabuff_newest_rank <= 100,
    ).order_by(MangaItem.mangabuff_popularity_rank.asc())

    # Новый сезон = год >= 2024, сортировка по популярности
    new_season_q = db.query(MangaItem).filter(
        MangaItem.year >= 2024,
        MangaItem.mangabuff_popularity_rank > 0,
    ).order_by(MangaItem.mangabuff_popularity_rank.asc())

    # Свежие главы = обновлённые
    fresh_q = db.query(MangaItem).filter(
        MangaItem.mangabuff_updated_rank > 0
    ).order_by(MangaItem.mangabuff_updated_rank.asc())

    # Топ по типам (по популярности)
    top_manhwa_q = db.query(MangaItem).filter(
        MangaItem.manga_type == "Manhwa",
        MangaItem.mangabuff_popularity_rank > 0,
    ).order_by(MangaItem.mangabuff_popularity_rank.asc())

    top_manga_q = db.query(MangaItem).filter(
        MangaItem.manga_type == "Manga",
        MangaItem.mangabuff_popularity_rank > 0,
    ).order_by(MangaItem.mangabuff_popularity_rank.asc())

    top_manhua_q = db.query(MangaItem).filter(
        MangaItem.manga_type == "Manhua",
        MangaItem.mangabuff_popularity_rank > 0,
    ).order_by(MangaItem.mangabuff_popularity_rank.asc())

    return {
        "popular": build_section(popular_q, 10),
        "top_rated": build_section(top_rated_q, 10),
        "newest": build_section(newest_q, 10),
        "updated": latest_updates,
        "hot_new": build_section(hot_new_q, 10),
        "new_season": build_section(new_season_q, 5),
        "popular_today": build_section(popular_q.offset(10), 5),
        "fresh_chapters": build_section(fresh_q, 10),
        "featured": build_section(popular_q, 5),
        "top_manhwa": build_section(top_manhwa_q, 5),
        "top_manga": build_section(top_manga_q, 5),
        "top_manhua": build_section(top_manhua_q, 5),
    }


@app.get("/manga/section/{section_key}", summary="Данные секции для страницы списка")
async def get_section_list(section_key: str, db: Session = Depends(get_db)):
    """Возвращает 20 тайтлов для конкретной секции (те же данные что на главной, но больше)."""
    from sqlalchemy import func as sa_fn
    LIMIT = 20

    # Пользовательские рейтинги
    user_ratings_agg = dict(
        db.query(MangaRating.manga_id, sa_fn.avg(MangaRating.rating))
        .group_by(MangaRating.manga_id)
        .all()
    )
    user_ratings_count = dict(
        db.query(MangaRating.manga_id, sa_fn.count(MangaRating.id))
        .group_by(MangaRating.manga_id)
        .all()
    )

    # Реальные просмотры
    real_views_map = dict(
        db.query(MangaView.manga_id, sa_fn.count(MangaView.id))
        .group_by(MangaView.manga_id)
        .all()
    )

    def build_items(query, limit=LIMIT):
        items = query.limit(limit).all()
        result = []
        for item in items:
            avg_user = user_ratings_agg.get(item.manga_id)
            user_avg = round(float(avg_user), 2) if avg_user else None
            user_total = user_ratings_count.get(item.manga_id, 0)
            result.append({
                "manga_id": item.manga_id,
                "title": item.title,
                "cover_url": item.cover_url,
                "manga_type": item.manga_type,
                "year": item.year,
                "status": item.status,
                "mangabuff_rating": item.mangabuff_rating or "0",
                "mangabuff_views": item.mangabuff_views or 0,
                "real_views": real_views_map.get(item.manga_id, 0),
                "genres": safe_json_load(item.genres, []),
                "description": item.description or "",
                "user_rating_avg": user_avg,
                "user_rating_count": user_total,
            })
        return result

    section_map = {
        "hot": lambda: build_items(
            db.query(MangaItem).filter(
                MangaItem.mangabuff_newest_rank > 0,
                MangaItem.mangabuff_newest_rank <= 100,
            ).order_by(MangaItem.mangabuff_popularity_rank.asc())
        ),
        "fresh": lambda: build_items(
            db.query(MangaItem).filter(
                MangaItem.mangabuff_updated_rank > 0
            ).order_by(MangaItem.mangabuff_updated_rank.asc())
        ),
        "popular": lambda: build_items(
            db.query(MangaItem).filter(
                MangaItem.mangabuff_popularity_rank > 0
            ).order_by(MangaItem.mangabuff_popularity_rank.asc())
        ),
        "new-season": lambda: build_items(
            db.query(MangaItem).filter(
                MangaItem.year >= 2024,
                MangaItem.mangabuff_popularity_rank > 0,
            ).order_by(MangaItem.mangabuff_popularity_rank.asc())
        ),
        "trending": lambda: build_items(
            db.query(MangaItem).filter(
                MangaItem.mangabuff_popularity_rank > 0
            ).order_by(MangaItem.mangabuff_popularity_rank.asc())
        ),
        "popular-today": lambda: build_items(
            db.query(MangaItem).filter(
                MangaItem.mangabuff_popularity_rank > 0
            ).order_by(MangaItem.mangabuff_popularity_rank.asc()).offset(10)
        ),
        "top-manhwa": lambda: build_items(
            db.query(MangaItem).filter(
                MangaItem.manga_type == "Manhwa",
                MangaItem.mangabuff_popularity_rank > 0,
            ).order_by(MangaItem.mangabuff_popularity_rank.asc())
        ),
        "top-manga": lambda: build_items(
            db.query(MangaItem).filter(
                MangaItem.manga_type == "Manga",
                MangaItem.mangabuff_popularity_rank > 0,
            ).order_by(MangaItem.mangabuff_popularity_rank.asc())
        ),
        "top-manhua": lambda: build_items(
            db.query(MangaItem).filter(
                MangaItem.manga_type == "Manhua",
                MangaItem.mangabuff_popularity_rank > 0,
            ).order_by(MangaItem.mangabuff_popularity_rank.asc())
        ),
    }

    builder = section_map.get(section_key)
    if not builder:
        return {"items": [], "title": "Список"}

    titles_map = {
        "hot": "Горячие новинки",
        "fresh": "Свежие главы",
        "popular": "Популярное",
        "new-season": "Новый сезон",
        "trending": "В тренде",
        "popular-today": "Популярно сегодня",
        "top-manhwa": "Топ Манхв",
        "top-manga": "Топ Манг",
        "top-manhua": "Топ Маньхуа",
    }

    return {
        "items": builder(),
        "title": titles_map.get(section_key, "Список"),
    }


# ═══════════════════════════════════════════════════════════
# PUBLIC USER PROFILE & FRIENDS
# ═══════════════════════════════════════════════════════════

@app.get("/users", summary="Список всех пользователей (публичный)")
async def get_all_users(
    q: str = Query("", description="Поиск по имени"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    query = db.query(User).filter(User.status == "active")
    if q:
        query = query.filter(User.username.ilike(f"%{q}%"))
    total = query.count()
    users = query.order_by(User.id).offset(offset).limit(limit).all()
    return {
        "total": total,
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "avatar_url": u.avatar_url or "",
                "avatar_frame": u.avatar_frame or "none",
                "level": u.level or 1,
                "bio": u.bio or "",
                "profile_theme": u.profile_theme or "base",
            }
            for u in users
        ],
    }


@app.get("/users/{user_id}", summary="Публичный профиль пользователя")
async def get_user_public_profile(user_id: int, db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user_id, User.status == "active").first()
    if not u:
        raise HTTPException(404, "Пользователь не найден")
    # Count stats
    bookmark_count = db.query(MangaBookmark).filter(MangaBookmark.user_id == u.id).count()
    history_count = db.query(ReadingHistory).filter(ReadingHistory.user_id == u.id).count()
    comment_count = db.query(MangaComment).filter(MangaComment.user_id == u.id).count()
    friend_count = db.query(Friendship).filter(
        (Friendship.user_id == u.id) | (Friendship.friend_id == u.id)
    ).count()
    return {
        "id": u.id,
        "username": u.username,
        "avatar_url": u.avatar_url or "",
        "avatar_frame": u.avatar_frame or "none",
        "level": u.level or 1,
        "xp": u.xp or 0,
        "bio": u.bio or "",
        "about": u.about or "",
        "profile_theme": u.profile_theme or "base",
        "profile_banner_url": u.profile_banner_url or "",
        "private_profile": bool(u.private_profile),
        "badge_ids": json.loads(u.badge_ids) if u.badge_ids else [],
        "showcase_manga_ids": json.loads(u.showcase_manga_ids) if u.showcase_manga_ids else [],
        "stats": {
            "bookmarks": bookmark_count,
            "chapters_read": history_count,
            "comments": comment_count,
            "friends": friend_count,
        },
        "is_online": bool(u.last_seen and (datetime.utcnow() - u.last_seen).total_seconds() < 300),
        "last_seen": u.last_seen.isoformat() if u.last_seen else None,
        "chapters_read": history_count,
    }


@app.get("/friends", summary="Мои друзья")
async def get_my_friends(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    friendships = db.query(Friendship).filter(
        (Friendship.user_id == current_user.id) | (Friendship.friend_id == current_user.id)
    ).all()
    friend_ids = set()
    for f in friendships:
        if f.user_id == current_user.id:
            friend_ids.add(f.friend_id)
        else:
            friend_ids.add(f.user_id)
    friends = db.query(User).filter(User.id.in_(friend_ids), User.status == "active").all() if friend_ids else []
    return [
        {
            "id": u.id,
            "username": u.username,
            "avatar_url": u.avatar_url or "",
            "avatar_frame": u.avatar_frame or "none",
            "level": u.level or 1,
            "bio": u.bio or "",
        }
        for u in friends
    ]


@app.get("/friends/check/{user_id}", summary="Проверить дружбу")
async def check_friendship(user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = db.query(Friendship).filter(
        ((Friendship.user_id == current_user.id) & (Friendship.friend_id == user_id)) |
        ((Friendship.user_id == user_id) & (Friendship.friend_id == current_user.id))
    ).first()
    return {"is_friend": existing is not None}


@app.post("/friends/{friend_id}", summary="Добавить в друзья")
async def add_friend(friend_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if friend_id == current_user.id:
        raise HTTPException(400, "Нельзя добавить себя")
    target = db.query(User).filter(User.id == friend_id, User.status == "active").first()
    if not target:
        raise HTTPException(404, "Пользователь не найден")
    existing = db.query(Friendship).filter(
        ((Friendship.user_id == current_user.id) & (Friendship.friend_id == friend_id)) |
        ((Friendship.user_id == friend_id) & (Friendship.friend_id == current_user.id))
    ).first()
    if existing:
        raise HTTPException(400, "Уже в друзьях")
    friendship = Friendship(user_id=current_user.id, friend_id=friend_id)
    db.add(friendship)
    db.commit()
    return {"ok": True, "message": "Друг добавлен"}


@app.delete("/friends/{friend_id}", summary="Удалить из друзей")
async def remove_friend(friend_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    friendship = db.query(Friendship).filter(
        ((Friendship.user_id == current_user.id) & (Friendship.friend_id == friend_id)) |
        ((Friendship.user_id == friend_id) & (Friendship.friend_id == current_user.id))
    ).first()
    if not friendship:
        raise HTTPException(404, "Не в друзьях")
    db.delete(friendship)
    db.commit()
    return {"ok": True, "message": "Друг удалён"}


# ═══════════════════════════════════════════════════════════
# BLOCK SYSTEM
# ═══════════════════════════════════════════════════════════

@app.get("/blocks", summary="Мои заблокированные")
async def get_my_blocks(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    blocks = db.query(UserBlock).filter(UserBlock.blocker_id == current_user.id).all()
    blocked_ids = [b.blocked_id for b in blocks]
    users = db.query(User).filter(User.id.in_(blocked_ids)).all() if blocked_ids else []
    return [{"id": u.id, "username": u.username, "avatar_url": u.avatar_url or "", "avatar_frame": u.avatar_frame or "none"} for u in users]


@app.post("/blocks/{user_id}", summary="Заблокировать пользователя")
async def block_user(user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user_id == current_user.id:
        raise HTTPException(400, "Нельзя заблокировать себя")
    existing = db.query(UserBlock).filter(UserBlock.blocker_id == current_user.id, UserBlock.blocked_id == user_id).first()
    if existing:
        raise HTTPException(400, "Уже заблокирован")
    db.add(UserBlock(blocker_id=current_user.id, blocked_id=user_id))
    # Also remove friendship if exists
    friendship = db.query(Friendship).filter(
        ((Friendship.user_id == current_user.id) & (Friendship.friend_id == user_id)) |
        ((Friendship.user_id == user_id) & (Friendship.friend_id == current_user.id))
    ).first()
    if friendship:
        db.delete(friendship)
    db.commit()
    return {"ok": True}


@app.delete("/blocks/{user_id}", summary="Разблокировать")
async def unblock_user(user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    block = db.query(UserBlock).filter(UserBlock.blocker_id == current_user.id, UserBlock.blocked_id == user_id).first()
    if not block:
        raise HTTPException(404, "Не заблокирован")
    db.delete(block)
    db.commit()
    return {"ok": True}


@app.get("/blocks/check/{user_id}", summary="Проверить блокировку")
async def check_block(user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    i_blocked = db.query(UserBlock).filter(UserBlock.blocker_id == current_user.id, UserBlock.blocked_id == user_id).first()
    they_blocked = db.query(UserBlock).filter(UserBlock.blocker_id == user_id, UserBlock.blocked_id == current_user.id).first()
    return {"i_blocked": i_blocked is not None, "they_blocked": they_blocked is not None}


# ═══════════════════════════════════════════════════════════
# DIRECT MESSAGES
# ═══════════════════════════════════════════════════════════

@app.get("/messages/unread/count", summary="Количество непрочитанных")
async def get_unread_count(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    count = db.query(DirectMessage).filter(DirectMessage.receiver_id == current_user.id, DirectMessage.is_read == False).count()
    return {"count": count}


@app.get("/messages/conversations", summary="Список диалогов")
async def get_conversations(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from sqlalchemy import or_, func, case
    # Get all users I've exchanged messages with
    msgs = db.query(DirectMessage).filter(
        or_(DirectMessage.sender_id == current_user.id, DirectMessage.receiver_id == current_user.id)
    ).order_by(DirectMessage.created_at.desc()).all()

    conversations = {}
    for m in msgs:
        other_id = m.receiver_id if m.sender_id == current_user.id else m.sender_id
        if other_id not in conversations:
            conversations[other_id] = {
                "last_message": m.text[:100],
                "last_time": m.created_at.strftime("%d.%m.%y %H:%M") if m.created_at else "",
                "unread": 0,
            }
        if m.receiver_id == current_user.id and not m.is_read:
            conversations[other_id]["unread"] += 1

    from datetime import datetime, timedelta
    now = datetime.utcnow()
    result = []
    for uid, conv in conversations.items():
        u = db.query(User).filter(User.id == uid).first()
        if u:
            is_online = u.last_seen and (now - u.last_seen).total_seconds() < 300
            chapters_read = db.query(ReadingHistory).filter(ReadingHistory.user_id == u.id).count()
            result.append({
                "user_id": u.id,
                "username": u.username,
                "avatar_url": u.avatar_url or "",
                "avatar_frame": u.avatar_frame or "none",
                "level": u.level or 1,
                "is_online": bool(is_online),
                "last_seen": u.last_seen.isoformat() if u.last_seen else None,
                "chapters_read": chapters_read,
                **conv,
            })
    return result


@app.get("/messages/{user_id}", summary="Получить сообщения с пользователем")
async def get_messages(user_id: int, limit: int = Query(50), offset: int = Query(0), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from sqlalchemy import or_, and_
    # Check block
    blocked = db.query(UserBlock).filter(
        or_(
            and_(UserBlock.blocker_id == current_user.id, UserBlock.blocked_id == user_id),
            and_(UserBlock.blocker_id == user_id, UserBlock.blocked_id == current_user.id),
        )
    ).first()
    if blocked:
        raise HTTPException(403, "Заблокировано")

    msgs = db.query(DirectMessage).filter(
        or_(
            and_(DirectMessage.sender_id == current_user.id, DirectMessage.receiver_id == user_id),
            and_(DirectMessage.sender_id == user_id, DirectMessage.receiver_id == current_user.id),
        )
    ).order_by(DirectMessage.created_at.desc()).offset(offset).limit(limit).all()

    # Mark as read
    db.query(DirectMessage).filter(
        DirectMessage.sender_id == user_id, DirectMessage.receiver_id == current_user.id, DirectMessage.is_read == False
    ).update({"is_read": True})
    db.commit()

    return [
        {
            "id": m.id,
            "sender_id": m.sender_id,
            "receiver_id": m.receiver_id,
            "text": m.text,
            "is_read": m.is_read,
            "timestamp": m.created_at.strftime("%d.%m.%y %H:%M") if m.created_at else "",
            "is_mine": m.sender_id == current_user.id,
        }
        for m in reversed(msgs)
    ]


class SendMessageBody(BaseModel):
    text: str

@app.post("/messages/{user_id}", summary="Отправить сообщение")
async def send_message(user_id: int, data: SendMessageBody, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from sqlalchemy import or_, and_
    if user_id == current_user.id:
        raise HTTPException(400, "Нельзя писать себе")
    if not data.text or not data.text.strip():
        raise HTTPException(400, "Пустое сообщение")
    if len(data.text) > 2000:
        raise HTTPException(400, "Слишком длинное сообщение")
    # Check block
    blocked = db.query(UserBlock).filter(
        or_(
            and_(UserBlock.blocker_id == current_user.id, UserBlock.blocked_id == user_id),
            and_(UserBlock.blocker_id == user_id, UserBlock.blocked_id == current_user.id),
        )
    ).first()
    if blocked:
        raise HTTPException(403, "Заблокировано")
    target = db.query(User).filter(User.id == user_id, User.status == "active").first()
    if not target:
        raise HTTPException(404, "Пользователь не найден")
    msg = DirectMessage(sender_id=current_user.id, receiver_id=user_id, text=data.text.strip())
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return {
        "id": msg.id,
        "sender_id": msg.sender_id,
        "receiver_id": msg.receiver_id,
        "text": msg.text,
        "is_read": msg.is_read,
        "timestamp": msg.created_at.strftime("%d.%m.%y %H:%M") if msg.created_at else "",
        "is_mine": True,
    }



# ═══════════════════════════════════════════════════════════
# WALL COMMENT REPLIES
# ═══════════════════════════════════════════════════════════

@app.get("/auth/wall-comments/{user_id}/with-replies", summary="Комментарии стены с ответами")
async def get_wall_comments_with_replies(user_id: int, db: Session = Depends(get_db)):
    comments = db.query(WallComment).filter(WallComment.profile_user_id == user_id).order_by(WallComment.created_at.desc()).limit(50).all()
    result = []
    for c in comments:
        author = db.query(User).filter(User.id == c.author_id).first()
        replies_db = db.query(WallCommentReply).filter(WallCommentReply.wall_comment_id == c.id).order_by(WallCommentReply.created_at.asc()).all()
        replies = []
        for r in replies_db:
            r_author = db.query(User).filter(User.id == r.author_id).first()
            replies.append({
                "id": r.id,
                "author_id": r.author_id,
                "author": r_author.username if r_author else "Unknown",
                "author_avatar": r_author.avatar_url or "" if r_author else "",
                "author_avatar_frame": r_author.avatar_frame if r_author else None,
                "text": r.text,
                "timestamp": r.created_at.strftime("%d.%m.%y %H:%M") if r.created_at else "",
            })
        result.append({
            "id": c.id,
            "author_id": c.author_id,
            "author": author.username if author else "Unknown",
            "author_avatar": author.avatar_url or "" if author else "",
            "author_avatar_frame": author.avatar_frame if author else None,
            "text": c.text,
            "timestamp": c.created_at.strftime("%d.%m.%y %H:%M") if c.created_at else "",
            "replies": replies,
        })
    return result


class WallReplyCreate(BaseModel):
    text: str

@app.post("/auth/wall-comments/{comment_id}/reply", summary="Ответить на комментарий стены")
async def reply_to_wall_comment(comment_id: int, data: WallReplyCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    comment = db.query(WallComment).filter(WallComment.id == comment_id).first()
    if not comment:
        raise HTTPException(404, "Комментарий не найден")
    if not data.text or not data.text.strip():
        raise HTTPException(400, "Пустой ответ")
    if len(data.text) > 500:
        raise HTTPException(400, "Слишком длинный ответ")
    reply = WallCommentReply(wall_comment_id=comment_id, author_id=current_user.id, text=data.text.strip())
    db.add(reply)
    db.commit()
    db.refresh(reply)
    # Notify the original comment author
    if comment.author_id != current_user.id:
        notif_msg = f'<a href="/user/{current_user.id}" class="text-brand-accent hover:underline font-bold">{current_user.username}</a> ответил на ваш <a href="/user/{comment.profile_user_id}" class="text-brand-accent hover:underline">комментарий</a>'
        create_notification(db, comment.author_id, notif_msg, f"/user/{comment.profile_user_id}", "social")
    return {
        "id": reply.id,
        "author_id": current_user.id,
        "author": current_user.username,
        "author_avatar": current_user.avatar_url or "",
        "author_avatar_frame": current_user.avatar_frame,
        "text": reply.text,
        "timestamp": reply.created_at.strftime("%d.%m.%y %H:%M") if reply.created_at else "",
    }


@app.delete("/auth/wall-replies/{reply_id}", summary="Удалить ответ на стене")
async def delete_wall_reply(reply_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    reply = db.query(WallCommentReply).filter(WallCommentReply.id == reply_id).first()
    if not reply:
        raise HTTPException(404, "Ответ не найден")
    # Get parent comment to check wall owner
    parent = db.query(WallComment).filter(WallComment.id == reply.wall_comment_id).first()
    if reply.author_id != current_user.id and (parent and parent.profile_user_id != current_user.id) and current_user.role != "admin":
        raise HTTPException(403, "Нет прав")
    db.delete(reply)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════
# PUBLIC USER PROFILE (extended)
# ═══════════════════════════════════════════════════════════

@app.get("/users/{user_id}/profile-full", summary="Полный публичный профиль")
async def get_user_profile_full(user_id: int, db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user_id, User.status == "active").first()
    if not u:
        raise HTTPException(404, "Пользователь не найден")

    # Stats
    bookmark_count = db.query(MangaBookmark).filter(MangaBookmark.user_id == u.id).count()
    history_count = db.query(ReadingHistory).filter(ReadingHistory.user_id == u.id).count()
    comment_count = db.query(MangaComment).filter(MangaComment.user_id == u.id).count()
    like_count = db.query(ChapterLike).filter(ChapterLike.user_id == u.id).count()
    rating_count = db.query(MangaRating).filter(MangaRating.user_id == u.id).count()
    friend_count = db.query(Friendship).filter(
        (Friendship.user_id == u.id) | (Friendship.friend_id == u.id)
    ).count()

    # Friends list
    friendships = db.query(Friendship).filter(
        (Friendship.user_id == u.id) | (Friendship.friend_id == u.id)
    ).all()
    friend_ids = set()
    for f in friendships:
        friend_ids.add(f.friend_id if f.user_id == u.id else f.user_id)
    friends_data = []
    if friend_ids:
        friends_users = db.query(User).filter(User.id.in_(friend_ids), User.status == "active").limit(10).all()
        for fu in friends_users:
            friends_data.append({
                "id": fu.id,
                "username": fu.username,
                "avatar_url": fu.avatar_url or "",
                "avatar_frame": fu.avatar_frame or "none",
                "level": fu.level or 1,
            })

    # Recent comments
    recent_comments = db.query(MangaComment).filter(MangaComment.user_id == u.id).order_by(MangaComment.created_at.desc()).limit(5).all()
    comments_data = []
    for c in recent_comments:
        manga = db.query(MangaItem).filter(MangaItem.manga_id == c.manga_id).first()
        comments_data.append({
            "text": c.text[:200],
            "manga_id": c.manga_id,
            "manga_title": manga.title if manga else c.manga_id,
            "manga_cover": manga.cover_url if manga else "",
            "timestamp": c.created_at.strftime("%d.%m.%y %H:%M") if c.created_at else "",
        })

    # Bookmarks
    bookmarks = db.query(MangaBookmark).filter(MangaBookmark.user_id == u.id).order_by(MangaBookmark.created_at.desc()).limit(10).all()
    bookmarks_data = []
    for b in bookmarks:
        manga = db.query(MangaItem).filter(MangaItem.manga_id == b.manga_id).first()
        if manga:
            bookmarks_data.append({
                "manga_id": b.manga_id,
                "title": manga.title,
                "cover": manga.cover_url or "",
                "status": b.status,
            })

    # Heatmap
    from sqlalchemy import func
    heatmap = {}
    rows = db.query(
        func.date(ReadingHistory.read_at).label('day'),
        func.count().label('cnt')
    ).filter(ReadingHistory.user_id == u.id).group_by('day').all()
    for row in rows:
        if row.day:
            heatmap[str(row.day)] = row.cnt

    # Badges
    try:
        badge_list = json.loads(u.badge_ids or "[]")
    except:
        badge_list = []

    # Gamification
    xp = u.xp or 0
    level = u.level or 1
    xp_current_level = 0
    for lv in range(1, level):
        xp_current_level += 50 * lv * lv
    xp_next_level = xp_current_level + 50 * level * level

    # Corruption
    from collections import Counter
    dark_genres = ['Хоррор', 'Ужасы', 'Трагедия', 'Психология', 'Триллер', 'Драма', 'Тёмное фэнтези', 'Мистика', 'Детектив']
    light_genres = ['Комедия', 'Повседневность', 'Романтика', 'Сёнэн', 'Школа', 'Спорт']
    dark_count = 0
    light_count = 0
    total_genres = 0
    user_bookmarks = db.query(MangaBookmark).filter(MangaBookmark.user_id == u.id).all()
    for bm in user_bookmarks:
        manga = db.query(MangaItem).filter(MangaItem.manga_id == bm.manga_id).first()
        if manga:
            try:
                genres = json.loads(manga.genres) if isinstance(manga.genres, str) else manga.genres
            except:
                genres = []
            for g in genres:
                total_genres += 1
                if any(dg.lower() in g.lower() for dg in dark_genres):
                    dark_count += 1
                if any(lg.lower() in g.lower() for lg in light_genres):
                    light_count += 1
    if total_genres > 0:
        ratio = (dark_count - light_count * 0.5) / max(total_genres, 1)
        corruption = max(0, min(100, round((ratio + 0.3) * 100)))
    else:
        corruption = 0

    return {
        "id": u.id,
        "username": u.username,
        "avatar_url": u.avatar_url or "",
        "avatar_frame": u.avatar_frame or "none",
        "level": level,
        "xp": xp,
        "xp_current_level": xp_current_level,
        "xp_next_level": xp_next_level,
        "bio": u.bio or "",
        "about": u.about or "",
        "gender": u.gender or "",
        "birthday": u.birthday or "",
        "profile_theme": u.profile_theme or "base",
        "profile_banner_url": u.profile_banner_url or "",
        "private_profile": bool(u.private_profile),
        "role": u.role or "user",
        "badge_ids": badge_list,
        "corruption": corruption,
        "stats": {
            "chapters_read": history_count,
            "total_likes": like_count,
            "total_ratings": rating_count,
            "total_bookmarks": bookmark_count,
            "comments": comment_count,
            "friends": friend_count,
            "badges": len(badge_list),
        },
        "friends": friends_data,
        "recent_comments": comments_data,
        "bookmarks": bookmarks_data,
        "heatmap": heatmap,
    }


# ═══════════════════════════════════════════════════
# PUBLIC USER BOOKMARKS API
# ═══════════════════════════════════════════════════

@app.get("/users/{user_id}/bookmarks", summary="Все закладки пользователя (публичные)")
async def get_user_bookmarks_public(user_id: int, db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user_id, User.status == "active").first()
    if not u:
        raise HTTPException(404, "Пользователь не найден")
    if u.private_profile:
        raise HTTPException(403, "Профиль скрыт")
    bookmarks = db.query(MangaBookmark).filter(MangaBookmark.user_id == u.id).order_by(MangaBookmark.created_at.desc()).all()
    result = []
    for b in bookmarks:
        manga = db.query(MangaItem).filter(MangaItem.manga_id == b.manga_id).first()
        if manga:
            result.append({
                "manga_id": b.manga_id,
                "title": manga.title,
                "cover": manga.cover_url or "",
                "status": b.status,
            })
    return result


# ═══════════════════════════════════════════════════
# NOTIFICATIONS API
# ═══════════════════════════════════════════════════

@app.get("/notifications", summary="Получить уведомления")
async def get_notifications(limit: int = Query(50), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    notifs = db.query(UserNotification).filter(UserNotification.user_id == current_user.id).order_by(UserNotification.created_at.desc()).limit(limit).all()
    return [{
        "id": n.id,
        "message": n.message,
        "link": n.link,
        "category": n.category or "social",
        "read": n.is_read,
        "timestamp": n.created_at.isoformat() if n.created_at else "",
    } for n in notifs]

@app.get("/notifications/unread/count", summary="Количество непрочитанных уведомлений")
async def get_unread_notifications_count(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    count = db.query(UserNotification).filter(UserNotification.user_id == current_user.id, UserNotification.is_read == False).count()
    return {"count": count}

@app.post("/notifications/mark-read", summary="Пометить все уведомления как прочитанные")
async def mark_notifications_read(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(UserNotification).filter(UserNotification.user_id == current_user.id, UserNotification.is_read == False).update({"is_read": True})
    db.commit()
    return {"ok": True}

@app.delete("/notifications", summary="Очистить все уведомления")
async def clear_notifications(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(UserNotification).filter(UserNotification.user_id == current_user.id).delete()
    db.commit()
    return {"ok": True}


def create_notification(db: Session, user_id: int, message: str, link: str = "", category: str = "social"):
    """Helper to create a notification for a user."""
    notif = UserNotification(user_id=user_id, message=message, link=link, category=category)
    db.add(notif)
    db.commit()


if __name__ == "__main__":
    print("[SERVER] Zapusk FastAPI servera")
    print("Swagger UI: http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000)
