import os
import re
import json
import shutil
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

import redis as _redis
import sqlite3
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
try:
    redis_client = _redis.from_url(REDIS_URL, decode_responses=True)
    redis_client.ping()
except Exception:
    redis_client = None
    print("[WARN] Redis недоступен — кэширование отключено")

# Local imports
from database import engine, SessionLocal, Base, get_db, DB_PATH
from badword_filter import check_comment, shadow_replace
from models import User, ChapterView, ChapterLike, ChapterMeta, MangaItem, MangaView, MangaRating, MangaBookmark, ReadingHistory, Chapter, WallComment, MangaComment, CommentLike, CommentReport, UserWarning, Friendship, UserBlock, DirectMessage, WallCommentReply, UserNotification, ShopItem, UserPurchase, PersonalizationRequest, PaymentTransaction, SiteSetting, AuditLog, ScrapTransaction, Promocode, LoginHistory, Report, PasswordResetToken
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
        "yandex_id": "TEXT DEFAULT ''",
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


# Миграция: новые колонки для геймификации (scrap, active_title, sound_enabled)
def migrate_gamification_columns():
    import sqlite3
    db_path = DB_PATH
    if not os.path.exists(db_path):
        return
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(users)")
    columns = {row[1] for row in cursor.fetchall()}
    new_cols = {
        "scrap": "INTEGER DEFAULT 0",
        "active_title": "TEXT DEFAULT ''",
        "sound_enabled": "INTEGER DEFAULT 0",
    }
    for col_name, col_type in new_cols.items():
        if col_name not in columns:
            cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
            print(f"[MIGRATION] Добавлена колонка {col_name} в users")
    conn.commit()
    conn.close()

migrate_gamification_columns()


# Миграция: колонки для заработка scrap
def migrate_scrap_earning_columns():
    import sqlite3
    db_path = DB_PATH
    if not os.path.exists(db_path):
        return
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(users)")
    columns = {row[1] for row in cursor.fetchall()}
    new_cols = {
        "last_scrap_daily": "DATE DEFAULT NULL",
        "scrap_comments_today": "INTEGER DEFAULT 0",
        "scrap_comments_date": "DATE DEFAULT NULL",
    }
    for col_name, col_type in new_cols.items():
        if col_name not in columns:
            cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
            print(f"[MIGRATION] Добавлена колонка {col_name} в users")
    conn.commit()
    conn.close()

migrate_scrap_earning_columns()


# Миграция: новые колонки для скинов (ShopItem + User)
def migrate_skin_columns():
    import sqlite3
    db_path = DB_PATH
    if not os.path.exists(db_path):
        return
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    # ShopItem columns
    cursor.execute("PRAGMA table_info(shop_items)")
    shop_cols = {row[1] for row in cursor.fetchall()}
    new_shop_cols = {
        "rarity": "TEXT DEFAULT 'common'",
        "css_variables": "TEXT DEFAULT '{}'",
        "block_style": "TEXT DEFAULT 'none'",
        "nickname_effect": "TEXT DEFAULT 'none'",
        "font_family": "TEXT DEFAULT ''",
        "owner_id": "INTEGER",
    }
    for col_name, col_type in new_shop_cols.items():
        if col_name not in shop_cols:
            cursor.execute(f"ALTER TABLE shop_items ADD COLUMN {col_name} {col_type}")
            print(f"[MIGRATION] Добавлена колонка {col_name} в shop_items")
    # User columns
    cursor.execute("PRAGMA table_info(users)")
    user_cols = {row[1] for row in cursor.fetchall()}
    new_user_cols = {
        "nickname_color": "TEXT DEFAULT ''",
        "nickname_font": "TEXT DEFAULT ''",
    }
    for col_name, col_type in new_user_cols.items():
        if col_name not in user_cols:
            cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
            print(f"[MIGRATION] Добавлена колонка {col_name} в users")
    conn.commit()
    conn.close()

migrate_skin_columns()


def migrate_subscription_columns():
    import sqlite3
    db_path = DB_PATH
    if not os.path.exists(db_path):
        return
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(users)")
    user_cols = {row[1] for row in cursor.fetchall()}
    new_cols = {
        "subscription_type": "TEXT DEFAULT ''",
        "subscription_expires_at": "DATETIME DEFAULT NULL",
    }
    for col_name, col_type in new_cols.items():
        if col_name not in user_cols:
            cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
            print(f"[MIGRATION] Добавлена колонка {col_name} в users")
    conn.commit()
    conn.close()

migrate_subscription_columns()


def migrate_donated_scrap_column():
    import sqlite3
    db_path = DB_PATH
    if not os.path.exists(db_path):
        return
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(users)")
    user_cols = {row[1] for row in cursor.fetchall()}
    if "donated_scrap" not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN donated_scrap INTEGER DEFAULT 0")
        print("[MIGRATION] Добавлена колонка donated_scrap в users")
    conn.commit()
    conn.close()

migrate_donated_scrap_column()

def migrate_payment_package_id_column():
    import sqlite3
    db_path = DB_PATH
    if not os.path.exists(db_path):
        return
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    # Check if table exists first
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='payment_transactions'")
    if not cursor.fetchone():
        conn.close()
        return
    cursor.execute("PRAGMA table_info(payment_transactions)")
    cols = {row[1] for row in cursor.fetchall()}
    if "package_id" not in cols:
        cursor.execute("ALTER TABLE payment_transactions ADD COLUMN package_id TEXT DEFAULT NULL")
        print("[MIGRATION] Добавлена колонка package_id в payment_transactions")
    conn.commit()
    conn.close()

migrate_payment_package_id_column()

def migrate_profile_background_url_column():
    import sqlite3
    db_path = DB_PATH
    if not os.path.exists(db_path):
        return
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(users)")
    user_cols = {row[1] for row in cursor.fetchall()}
    if "profile_background_url" not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN profile_background_url TEXT DEFAULT ''")
        print("[MIGRATION] Добавлена колонка profile_background_url в users")
    conn.commit()
    conn.close()

migrate_profile_background_url_column()

def migrate_telegram_columns():
    import sqlite3
    db_path = DB_PATH
    if not os.path.exists(db_path):
        return
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(users)")
    user_cols = {row[1] for row in cursor.fetchall()}
    if "telegram_id" not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN telegram_id TEXT DEFAULT ''")
        print("[MIGRATION] Добавлена колонка telegram_id в users")
    if "telegram_username" not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN telegram_username TEXT DEFAULT ''")
        print("[MIGRATION] Добавлена колонка telegram_username в users")
    conn.commit()
    conn.close()

migrate_telegram_columns()

def seed_telegram_bot_token():
    env_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not env_token:
        return
    try:
        db = SessionLocal()
        existing = db.query(SiteSetting).filter(SiteSetting.key == "telegram_bot_token").first()
        if existing:
            if not existing.value:
                existing.value = env_token
        else:
            db.add(SiteSetting(key="telegram_bot_token", value=env_token))
        db.commit()
        db.close()
    except:
        pass

seed_telegram_bot_token()

# Миграция: добавляем updated_at в manga_items + индексы для локальных метрик
def migrate_local_metrics():
    import sqlite3
    db_path = DB_PATH
    if not os.path.exists(db_path):
        return
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 1. Добавляем updated_at в manga_items
    cursor.execute("PRAGMA table_info(manga_items)")
    manga_cols = {row[1] for row in cursor.fetchall()}
    if "updated_at" not in manga_cols:
        cursor.execute("ALTER TABLE manga_items ADD COLUMN updated_at DATETIME")
        print("[MIGRATION] Добавлена колонка updated_at в manga_items")
        # Backfill: updated_at = MAX(chapters.created_at) или manga_items.created_at
        cursor.execute("""
            UPDATE manga_items SET updated_at = COALESCE(
                (SELECT MAX(chapters.created_at) FROM chapters WHERE chapters.manga_id = manga_items.manga_id),
                manga_items.created_at
            )
        """)
        print("[MIGRATION] Backfill updated_at из chapters.created_at завершён")

    # 2. Индексы для time-range запросов (локальные метрики)
    existing_indexes = {row[1] for row in cursor.execute("SELECT * FROM sqlite_master WHERE type='index'").fetchall()}
    index_definitions = {
        "ix_manga_views_created_at": "CREATE INDEX IF NOT EXISTS ix_manga_views_created_at ON manga_views(created_at)",
        "ix_manga_bookmarks_created_at": "CREATE INDEX IF NOT EXISTS ix_manga_bookmarks_created_at ON manga_bookmarks(created_at)",
        "ix_chapters_manga_created": "CREATE INDEX IF NOT EXISTS ix_chapters_manga_created ON chapters(manga_id, created_at)",
        "ix_manga_items_updated_at": "CREATE INDEX IF NOT EXISTS ix_manga_items_updated_at ON manga_items(updated_at)",
        "ix_manga_items_created_at": "CREATE INDEX IF NOT EXISTS ix_manga_items_created_at ON manga_items(created_at)",
    }
    for idx_name, idx_sql in index_definitions.items():
        if idx_name not in existing_indexes:
            cursor.execute(idx_sql)
            print(f"[MIGRATION] Создан индекс {idx_name}")

    conn.commit()
    conn.close()

migrate_local_metrics()

def migrate_manga_hidden_column():
    db = SessionLocal()
    cursor = db.connection().connection.cursor()
    try:
        cursor.execute("PRAGMA table_info(manga_items)")
        columns = [col[1] for col in cursor.fetchall()]
        if "hidden" not in columns:
            cursor.execute("ALTER TABLE manga_items ADD COLUMN hidden BOOLEAN DEFAULT 0")
            print("[MIGRATION] Добавлена колонка hidden в manga_items")
    finally:
        db.close()

migrate_manga_hidden_column()


# ── Slug generation ──────────────────────────────────────────────

_TRANSLIT = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
}

def generate_slug(title: str) -> str:
    """Transliterate title to URL-friendly slug."""
    result = []
    for ch in title.lower():
        if ch in _TRANSLIT:
            result.append(_TRANSLIT[ch])
        elif ch.isascii() and (ch.isalnum() or ch == '-'):
            result.append(ch)
        else:
            result.append('-')
    slug = re.sub(r'-+', '-', ''.join(result)).strip('-')
    return slug[:120]


def ensure_unique_slug(cursor, slug: str, manga_id: str) -> str:
    """Ensure slug uniqueness, append hash prefix if collision."""
    cursor.execute("SELECT manga_id FROM manga_items WHERE slug = ? AND manga_id != ?", (slug, manga_id))
    if cursor.fetchone():
        slug = f"{slug}-{manga_id[:8]}"
    return slug


def migrate_manga_slug_column():
    import sqlite3
    if not os.path.exists(DB_PATH):
        return
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(manga_items)")
    columns = {row[1] for row in cursor.fetchall()}
    if "slug" not in columns:
        cursor.execute("ALTER TABLE manga_items ADD COLUMN slug TEXT")
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_manga_items_slug ON manga_items(slug)")
        print("[MIGRATION] Добавлена колонка slug в manga_items")
    # Backfill slugs for rows that don't have one
    cursor.execute("SELECT id, manga_id, title FROM manga_items WHERE slug IS NULL OR slug = ''")
    rows = cursor.fetchall()
    if rows:
        print(f"[MIGRATION] Заполняю slug для {len(rows)} тайтлов...")
        for row_id, mid, title in rows:
            slug = generate_slug(title)
            if not slug:
                slug = mid[:16]
            slug = ensure_unique_slug(cursor, slug, mid)
            cursor.execute("UPDATE manga_items SET slug = ? WHERE id = ?", (slug, row_id))
        print(f"[MIGRATION] Slug заполнен для {len(rows)} тайтлов")
    conn.commit()
    conn.close()

migrate_manga_slug_column()


def resolve_manga(db, identifier: str):
    """Resolve MangaItem by manga_id (MD5 hex) or slug."""
    if re.fullmatch(r'[0-9a-f]{32}', identifier):
        return db.query(MangaItem).filter(MangaItem.manga_id == identifier).first()
    return db.query(MangaItem).filter(MangaItem.slug == identifier).first()


def migrate_comment_moderation():
    import sqlite3
    db_path = DB_PATH
    if not os.path.exists(db_path):
        return
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(manga_comments)")
    columns = {row[1] for row in cursor.fetchall()}
    if "status" not in columns:
        cursor.execute("ALTER TABLE manga_comments ADD COLUMN status TEXT DEFAULT 'approved'")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_manga_comments_status ON manga_comments(status)")
        print("[MIGRATION] Добавлена колонка status в manga_comments")
    cursor.execute("PRAGMA table_info(users)")
    columns = {row[1] for row in cursor.fetchall()}
    for col_name, col_type in [("warnings_count", "INTEGER DEFAULT 0"), ("warning_shown_at", "DATETIME DEFAULT NULL"), ("muted_until", "DATETIME DEFAULT NULL")]:
        if col_name not in columns:
            cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
            print(f"[MIGRATION] Добавлена колонка {col_name} в users")
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='comment_reports'")
    if not cursor.fetchone():
        cursor.execute("""
            CREATE TABLE comment_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                comment_id INTEGER NOT NULL,
                reporter_id INTEGER NOT NULL,
                reason TEXT DEFAULT 'spam',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(comment_id, reporter_id)
            )
        """)
        print("[MIGRATION] Создана таблица comment_reports")
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user_warnings'")
    if not cursor.fetchone():
        cursor.execute("""
            CREATE TABLE user_warnings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                admin_id INTEGER NOT NULL,
                reason TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("[MIGRATION] Создана таблица user_warnings")
    conn.commit()
    conn.close()

migrate_comment_moderation()

def migrate_add_indexes():
    """Add missing indexes for frequently queried columns."""
    import sqlite3
    db_path = DB_PATH
    if not os.path.exists(db_path):
        return
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    indexes = [
        ("ix_chapter_likes_user_id", "chapter_likes", "user_id"),
        ("ix_manga_ratings_user_id", "manga_ratings", "user_id"),
        ("ix_manga_bookmarks_user_id", "manga_bookmarks", "user_id"),
        ("ix_manga_comments_user_id", "manga_comments", "user_id"),
        ("ix_bookmark_user_created", "manga_bookmarks", "user_id, created_at"),
        ("ix_reading_history_user_read_at", "reading_history", "user_id, read_at"),
    ]
    for idx_name, table, columns in indexes:
        try:
            cursor.execute(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table}({columns})")
        except Exception as e:
            print(f"[INDEX] Skipped {idx_name}: {e}")
    conn.commit()
    conn.close()
    print("[MIGRATION] Database indexes checked/created")

migrate_add_indexes()

# Seed shop items
def seed_shop_items():
    db = SessionLocal()
    try:
        items = [
            # Рамки для аватара (разблокируются по уровням)
            ShopItem(key="frame_rusty_gear", name="Ржавая Шестерня", description="Разблокируется на 5 уровне", category="frame", price=0, preview="/Frames_lvl/Rusty_gear.png", rarity="common", required_level=5),
            ShopItem(key="frame_neon_wire", name="Неоновая Проволока", description="Разблокируется на 10 уровне", category="frame", price=0, preview="/Frames_lvl/Neon_wire.png", rarity="rare", required_level=10),
            ShopItem(key="frame_animatronic_jaw", name="Челюсть Аниматроника", description="Разблокируется на 15 уровне", category="frame", price=0, preview="/Frames_lvl/Animatronic_Jaw.png", rarity="rare", required_level=15),
            ShopItem(key="frame_golden_rule", name="Золотое Правило", description="Разблокируется на 25 уровне", category="frame", price=0, preview="/Frames_lvl/The_Golden_Rule.png", rarity="epic", required_level=25),
            ShopItem(key="frame_poisonous_vine", name="Ядовитая Лоза", description="Разблокируется на 35 уровне", category="frame", price=0, preview="/Frames_lvl/Poisonous_vine.png", rarity="epic", required_level=35),
            ShopItem(key="frame_system_glitch", name="Системный Глитч", description="Разблокируется на 50 уровне", category="frame", price=0, preview="/Frames_lvl/System_Glitch.png", rarity="mythic", required_level=50),
            # Стикеры
            ShopItem(key="sticker_kek", name="KEK", description="Классический стикер для стены", category="sticker", price=30, preview="😂"),
            ShopItem(key="sticker_rage", name="RAGE", description="Когда сюжет бесит", category="sticker", price=30, preview="😡"),
            ShopItem(key="sticker_uwu", name="UwU", description="Кавайный стикер", category="sticker", price=30, preview="🥺"),
            ShopItem(key="sticker_based", name="BASED", description="Основано и красно-пилюлено", category="sticker", price=50, preview="💊"),
            ShopItem(key="sticker_f", name="Press F", description="Почтить память павшего персонажа", category="sticker", price=40, preview="🪦"),
            # Статусы
            ShopItem(key="status_online_fire", name="Горит 🔥", description="Статус online с огнём", category="status", price=80, preview="🔥"),
            ShopItem(key="status_sleeping", name="Сплю 💤", description="Не беспокоить, читаю мангу", category="status", price=60, preview="💤"),
            ShopItem(key="status_hacking", name="Хакаю систему", description="Занят взломом SpringManga", category="status", price=100, preview="💻"),
            ShopItem(key="status_invisible", name="Невидимка", description="Скрыть онлайн-статус", category="status", price=150, preview="👤"),
            # ── RARE TIER: Системные аномалии (1 000 Scrap) ──
            ShopItem(key="skin_spring-locked", name="Пружинный Замок", description="Багровый скин с запёкшейся кровью. Блоки пульсируют тёмно-красным при наведении.", category="skin", price=1000, preview="#6B0000",
                     rarity="rare", css_variables='{"--profile-accent":"#6B0000","--profile-accent-rgb":"107 0 0","--profile-glow":"#CC1B1B","--profile-glow-rgb":"204 27 27","--profile-surface":"#1A0808","--profile-border":"rgba(139,0,0,0.3)","--profile-badge-bg":"rgba(139,0,0,0.1)"}',
                     block_style="spring-locked", nickname_effect="spring-locked"),
            ShopItem(key="skin_coolant-leak", name="Утечка Охладителя", description="Ледяной циан с эффектом инея. Блоки покрыты морозным блеском.", category="skin", price=1000, preview="#006B8F",
                     rarity="rare", css_variables='{"--profile-accent":"#006B8F","--profile-accent-rgb":"0 107 143","--profile-glow":"#00D4FF","--profile-glow-rgb":"0 212 255","--profile-surface":"#080F14","--profile-border":"rgba(0,180,230,0.2)","--profile-badge-bg":"rgba(0,180,230,0.06)"}',
                     block_style="coolant-leak", nickname_effect="coolant-leak"),
            ShopItem(key="skin_cyber-sakura", name="Кибер-Сакура", description="Кислотно-розовый киберпанк с VHS-помехами и неоновым шумом.", category="skin", price=1000, preview="#FF2D8A",
                     rarity="rare", css_variables='{"--profile-accent":"#FF2D8A","--profile-accent-rgb":"255 45 138","--profile-glow":"#FF69E0","--profile-glow-rgb":"255 105 224","--profile-surface":"#18081A","--profile-border":"rgba(255,45,138,0.25)","--profile-badge-bg":"rgba(255,45,138,0.08)"}',
                     block_style="cyber-sakura", nickname_effect="cyber-sakura"),
            # ── EPIC TIER: Критические угрозы (5 000 Scrap) ──
            ShopItem(key="skin_biohazard", name="Радиация", description="Ураново-жёлтый с дышащим свечением. Блоки пульсируют радиоактивным светом.", category="skin", price=5000, preview="#B8CC00",
                     rarity="epic", css_variables='{"--profile-accent":"#B8CC00","--profile-accent-rgb":"184 204 0","--profile-glow":"#DFFF00","--profile-glow-rgb":"223 255 0","--profile-surface":"#0D0E04","--profile-border":"rgba(184,204,0,0.2)","--profile-badge-bg":"rgba(184,204,0,0.06)"}',
                     block_style="biohazard", nickname_effect="biohazard"),
            ShopItem(key="skin_terminal", name="Терминал", description="Абсолютная тьма с зелёным консольным шрифтом. CRT-сканлайны бегут по экрану.", category="skin", price=5000, preview="#00FF41",
                     rarity="epic", css_variables='{"--profile-accent":"#00FF41","--profile-accent-rgb":"0 255 65","--profile-glow":"#00FF41","--profile-glow-rgb":"0 255 65","--profile-surface":"#000000","--profile-border":"rgba(0,255,65,0.12)","--profile-badge-bg":"rgba(0,255,65,0.04)"}',
                     block_style="terminal", nickname_effect="terminal"),
            ShopItem(key="skin_golden-era", name="Золотая Эра", description="Потускневшее золото с патиной времени. Текстура шума и зернистости.", category="skin", price=5000, preview="#B8860B",
                     rarity="epic", css_variables='{"--profile-accent":"#B8860B","--profile-accent-rgb":"184 134 11","--profile-glow":"#DAA520","--profile-glow-rgb":"218 165 32","--profile-surface":"#141008","--profile-border":"rgba(184,134,11,0.25)","--profile-badge-bg":"rgba(184,134,11,0.08)"}',
                     block_style="golden-era", nickname_effect="golden-era"),
            # ── LEGENDARY / MYTHIC TIER: Полное разрушение (15 000 Scrap) ──
            ShopItem(key="skin_system-crash", name="System.Crash()", description="BSOD — экран смерти. Жёсткий глитч-эффект раздваивает ник на красный и синий каналы.", category="skin", price=15000, preview="#0000AA",
                     rarity="mythic", css_variables='{"--profile-accent":"#0000AA","--profile-accent-rgb":"0 0 170","--profile-glow":"#FFFFFF","--profile-glow-rgb":"255 255 255","--profile-surface":"#000044","--profile-border":"rgba(0,0,170,0.4)","--profile-badge-bg":"rgba(0,0,170,0.15)"}',
                     block_style="system-crash", nickname_effect="system-crash", font_family="VT323"),
            ShopItem(key="skin_phantom", name="Фантом", description="Ghost in the Machine — аномалия в системе. Нестабильные голограммы, хроматическая аберрация, призрачные эхо.", category="skin", price=15000, preview="#00FFFF",
                     rarity="mythic", css_variables='{"--profile-accent":"#00FFFF","--profile-accent-rgb":"0 255 255","--profile-glow":"#00FFFF","--profile-glow-rgb":"0 255 255","--profile-surface":"#000000","--profile-border":"rgba(0,255,255,0.08)","--profile-badge-bg":"rgba(0,255,255,0.04)"}',
                     block_style="phantom", nickname_effect="phantom", font_family="Creeposter"),
            # SPRINGPRO подписка
            ShopItem(key="springpro_month", name="SPRINGPRO 1 мес", description="Все привилегии на 30 дней: без рекламы, эксклюзивные рамки, +50% Scrap", category="springpro", price=1200, preview="⭐"),
            ShopItem(key="springpro_3month", name="SPRINGPRO 3 мес", description="Всё то же, но выгоднее! Экономия ~17%", category="springpro", price=3000, preview="🌟"),
            ShopItem(key="springpro_year", name="SPRINGPRO 1 год", description="Максимальная выгода: экономия ~41%, эксклюзивный титул", category="springpro", price=8500, preview="👑"),
        ]
        import json as _json
        frames_json_path = os.path.join(os.path.dirname(__file__), '..', 'public', 'Frames_shop', 'frames_data.json')
        if os.path.exists(frames_json_path):
            with open(frames_json_path, 'r', encoding='utf-8') as f:
                steam_frames = _json.load(f)
            for sf in steam_frames:
                items.append(ShopItem(
                    key=sf['key'], name=sf.get('name', ''), description=sf.get('description', 'SPRINGSHOP FRAME'),
                    category='frame', price=sf.get('price', 1666),
                    preview=sf['preview'],
                    required_level=sf.get('required_level', 0),
                ))
            print(f"[SEED] Загружено {len(steam_frames)} Steam рамок из frames_data.json")

        for item in items:
            existing = db.query(ShopItem).filter(ShopItem.key == item.key).first()
            if existing:
                for col in ['name', 'description', 'category', 'price', 'preview', 'rarity', 'required_level', 'css_variables', 'block_style', 'nickname_effect', 'font_family']:
                    if getattr(item, col, None) is not None:
                        setattr(existing, col, getattr(item, col))
            else:
                db.add(item)
        db.commit()
        print(f"[SEED] Магазин обновлён ({len(items)} айтемов)")
    except Exception as e:
        print(f"[SEED] Ошибка: {e}")
        db.rollback()
    finally:
        db.close()

seed_shop_items()


def init_fts5():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("CREATE VIRTUAL TABLE IF NOT EXISTS manga_fts USING fts5(title, content='manga_items', content_rowid=rowid)")
    conn.execute("INSERT INTO manga_fts(manga_fts) VALUES('rebuild')")
    conn.commit()
    conn.close()
    print("[FTS5] Полнотекстовый индекс создан")

init_fts5()


def upsert_chapters(db: Session, manga_id: str, chapters_list: list):
    """Upsert глав в таблицу chapters. Возвращает количество НОВЫХ добавленных глав."""
    seen_ids = set()
    new_count = 0
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
            new_count += 1
            db.flush()
    db.flush()
    # Обновляем updated_at ТОЛЬКО если появились реально новые главы
    if new_count > 0:
        manga_item = db.query(MangaItem).filter(MangaItem.manga_id == manga_id).first()
        if manga_item:
            manga_item.updated_at = datetime.utcnow()
            db.flush()
    return new_count


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

# --- Russian proxy for mangabuff.ru (bypasses geo-block on foreign VPS) ---
MANGABUFF_PROXY = os.environ.get("MANGABUFF_PROXY", None)  # e.g. http://user:pass@host:port

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
        async with sess.get(f"{BASE_URL}/login", proxy=MANGABUFF_PROXY) as resp:
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
            proxy=MANGABUFF_PROXY,
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
    active_title: Optional[str] = None
    sound_enabled: Optional[bool] = None
    nickname_color: Optional[str] = None
    nickname_font: Optional[str] = None

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

class PromocodeCreate(BaseModel):
    code: str
    discount_percent: int = 0
    fixed_scrap: int = 0
    expires_at: Optional[str] = None
    usage_limit: int = 100
    active: bool = True

class ReportCreate(BaseModel):
    manga_id: str
    manga_title: str = ""
    reason: str = ""
    message: str = ""

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

    # Запуск cron-задач
    from cron_tasks import cron_manager
    cron_manager.start()
    print("⏰ Cron-задачи запущены")

    yield
    # Shutdown
    print("🛑 Остановка сервера...")
    cron_manager.stop()
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
BACKGROUNDS_DIR = os.path.join(UPLOADS_DIR, "backgrounds")
SHOP_UPLOADS_DIR = os.path.join(UPLOADS_DIR, "shop")
FRAMES_LVL_DIR = os.path.join(os.path.dirname(BACKEND_DIR), "public", "Frames_lvl")
FRAMES_SHOP_DIR = os.path.join(os.path.dirname(BACKEND_DIR), "public", "Frames_shop")
os.makedirs(MANGA_DIR, exist_ok=True)
os.makedirs(AVATARS_DIR, exist_ok=True)
os.makedirs(BANNERS_DIR, exist_ok=True)
os.makedirs(BACKGROUNDS_DIR, exist_ok=True)
os.makedirs(SHOP_UPLOADS_DIR, exist_ok=True)

PAYPALYCH_API_KEY = os.environ.get("PAYPALYCH_API_KEY", "")
PAYPALYCH_SHOP_ID = os.environ.get("PAYPALYCH_SHOP_ID", "")
PAYPALYCH_SECRET = os.environ.get("PAYPALYCH_SECRET", "")

@app.middleware("http")
async def redis_online_tracker(request: Request, call_next):
    ip = request.client.host if request.client else "unknown"
    now_ts = int(time())
    try:
        if redis_client:
            pipe = redis_client.pipeline()
            pipe.sadd("online_ips", ip)
            pipe.expire("online_ips", 300)
            pipe.execute()
    except Exception:
        pass
    response = await call_next(request)
    return response

def is_springpro_active(user: User) -> bool:
    if not user.subscription_expires_at:
        return False
    return user.subscription_expires_at > datetime.utcnow()


def apply_mute(author: User, db, reason_text: str, manga_title: str, comment_text: str, manga_id: str, admin_user=None):
    author.warnings_count = (author.warnings_count or 0) + 1
    author.warning_shown_at = datetime.utcnow()
    stages_raw = get_setting_value("mute_stages", "1,7,30,0")
    stages = [int(s.strip()) for s in stages_raw.split(",") if s.strip()]
    stage_idx = min(author.warnings_count - 1, len(stages) - 1)
    mute_days = stages[stage_idx] if stage_idx < len(stages) else 0

    if mute_days == 0:
        author.muted_until = datetime(2099, 1, 1)
        mute_label = "вечный мут"
    else:
        from datetime import timedelta as _td
        author.muted_until = datetime.utcnow() + _td(days=mute_days)
        mute_label = f"мут на {mute_days} дн."

    if author.warnings_count >= len(stages) and mute_days > 0:
        year_ago = datetime.utcnow() - __import__('datetime').timedelta(days=365)
        if author.warning_shown_at and any(
            w.created_at and w.created_at > year_ago
            for w in db.query(UserWarning).filter(UserWarning.user_id == author.id).all()
        ):
            author.muted_until = datetime(2099, 1, 1)
            mute_label = "вечный мут (повтор в течение года)"

    notif_msg = (
        f'<b>🔇 {mute_label}</b><br>'
        f'Причина: <span style="color:#ff4444">{reason_text}</span><br>'
        f'Тайтл: <a href="/manga/{manga_id}" style="color:#6cacff">{manga_title}</a><br>'
        f'Удалённый комментарий: <i>"{comment_text[:100]}{"..." if len(comment_text) > 100 else ""}"</i><br>'
        f'Предупреждение {author.warnings_count}/{len(stages)}<br>'
        f'<span style="color:#ff6666">При повторных нарушениях — более строгий мут</span>'
    )
    create_notification(db, author.id, notif_msg, f"/manga/{manga_id}", "warning")
    actor_label = admin_user.username if admin_user else "SYSTEM"
    log_admin_action(db, admin_user, f"МУТ {mute_label}", f"{author.username}: {reason_text} в {manga_title} ({author.warnings_count}/{len(stages)})")

# Раздаём файлы из папки "manga" по адресу /static
app.mount("/static", StaticFiles(directory=MANGA_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
app.mount("/Frames_lvl", StaticFiles(directory=FRAMES_LVL_DIR), name="frames_lvl")
app.mount("/Frames_shop", StaticFiles(directory=FRAMES_SHOP_DIR), name="frames_shop")

# 👇 Разрешаем фронту обращаться к API
_cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,https://springmanga.duckdns.org").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 👇 Security middleware (rate limiting, IP blacklist, SSL redirect)
from security_middleware import SecurityMiddleware
app.add_middleware(SecurityMiddleware, db_session_factory=SessionLocal)


def get_setting_value(key: str, default: str = "false") -> str:
    try:
        db = SessionLocal()
        s = db.query(SiteSetting).filter(SiteSetting.key == key).first()
        db.close()
        return s.value if s else default
    except:
        return default


MAINTENANCE_BYPASS_COOKIE = "mnt_bypass"

@app.middleware("http")
async def maintenance_middleware(request: Request, call_next):
    maintenance = get_setting_value("maintenance_mode", "false") == "true"
    if maintenance:
        allowed_paths = ["/auth/login", "/token", "/auth/me", "/admin/settings",
                         "/admin/maintenance-status", "/admin/maintenance-bypass",
                         "/docs", "/openapi.json"]
        is_admin = False
        # Проверяем bypass: cookie или query-параметр
        bypass_key = get_setting_value("maintenance_bypass_key", "")
        has_bypass = bypass_key and (
            request.cookies.get(MAINTENANCE_BYPASS_COOKIE) == bypass_key
            or request.query_params.get("mnt_bypass") == bypass_key
        )
        try:
            token = request.headers.get("authorization", "").replace("Bearer ", "")
            if token:
                payload = auth.decode_token(token)
                if payload:
                    db = SessionLocal()
                    email = payload.get("sub")
                    user = db.query(User).filter(User.email == email).first()
                    db.close()
                    is_admin = user and user.role == "admin"
        except:
            pass
        if not is_admin and not has_bypass and not any(request.url.path.startswith(p) for p in allowed_paths):
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=503, content={"detail": "Сайт на техническом обслуживании. Скоро вернёмся."})
    response = await call_next(request)
    return response


@app.get("/admin/maintenance-status", summary="Публичный статус тех. работ")
async def maintenance_status():
    """Без авторизации — нужен фронтенду для блокировки UI."""
    return {"maintenance": get_setting_value("maintenance_mode", "false") == "true"}


@app.get("/admin/maintenance-bypass", summary="Секретный bypass для админа")
async def maintenance_bypass(request: Request, key: str = Query("")):
    """Проверяет динамический ключ и редиректит на фронтенд с bypass-токеном в hash."""
    stored_key = get_setting_value("maintenance_bypass_key", "")
    if not stored_key or key != stored_key:
        raise HTTPException(status_code=404, detail="Not found")
    # Определяем URL фронтенда
    host = request.headers.get("host", "localhost:8000")
    if "localhost" in host or "127.0.0.1" in host:
        frontend_url = "http://localhost:5173"
    else:
        frontend_url = f"https://{host.split(':')[0]}"
    from fastapi.responses import RedirectResponse
    # Передаём ключ через hash — фронтенд прочитает и сохранит в sessionStorage
    return RedirectResponse(url=f"{frontend_url}/?mnt_bypass={stored_key}#/login", status_code=302)

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
                async with session.get(url, headers=headers, timeout=30, proxy=MANGABUFF_PROXY) as response:
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
                async with session.get(chapter_url, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=30), proxy=MANGABUFF_PROXY) as resp:
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
            async with session.get(BASE_URL, headers=HEADERS, proxy=MANGABUFF_PROXY) as resp:
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
            async with session.get(manga_page_url, headers=HEADERS, proxy=MANGABUFF_PROXY) as resp:
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
                            proxy=MANGABUFF_PROXY,
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
                    async with session.get(cover_url, headers={**HEADERS, "Referer": BASE_URL}, proxy=MANGABUFF_PROXY) as r:
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
                    r = requests.get(cover_url, headers={**HEADERS, "Referer": BASE_URL}, timeout=30, proxies={"http": MANGABUFF_PROXY, "https": MANGABUFF_PROXY} if MANGABUFF_PROXY else None)
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
    cache_key = f"manga_list:{page}:{limit}:{sort}:{manga_type}:{status}:{genre}:{year}:{search}:{age_rating}:{category}:{rating_min}:{rating_max}:{year_min}:{year_max}:{chapters_min}:{chapters_max}"
    if redis_client:
        cached = redis_client.get(cache_key)
        if cached:
            return json.loads(cached)

    from sqlalchemy import func
    from collections import Counter

    query = db.query(MangaItem)

    if not (current_user and current_user.role == "admin"):
        query = query.filter(MangaItem.hidden != True)

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
        _conn = sqlite3.connect(DB_PATH)
        try:
            _rows = _conn.execute("SELECT rowid FROM manga_fts WHERE manga_fts MATCH ? ORDER BY rank LIMIT 5000", (search,)).fetchall()
            _ids = [str(r[0]) for r in _rows]
        except Exception:
            _ids = []
        _conn.close()
        if _ids:
            query = query.filter(MangaItem.id.in_([int(i) for i in _ids]))
        else:
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

    # Сортировка (на основе локальных метрик пользователей)
    from sqlalchemy import case as sa_case, desc as sa_desc
    if sort == "year":
        query = query.order_by(MangaItem.year.desc(), MangaItem.created_at.desc())
    elif sort in ("popularity", "views"):
        # Популярность / просмотры = количество локальных просмотров (all-time)
        views_sq = db.query(MangaView.manga_id, func.count(MangaView.id).label("v_cnt")).group_by(MangaView.manga_id).subquery()
        query = query.outerjoin(views_sq, MangaItem.manga_id == views_sq.c.manga_id)
        query = query.order_by(func.coalesce(views_sq.c.v_cnt, 0).desc())
    elif sort == "chapters":
        from sqlalchemy import func as sa_fn
        if not (chapters_min or chapters_max):
            ch_count_sq2 = db.query(Chapter.manga_id, sa_fn.count(Chapter.id).label("ch_cnt")).group_by(Chapter.manga_id).subquery()
            query = query.outerjoin(ch_count_sq2, MangaItem.manga_id == ch_count_sq2.c.manga_id)
            query = query.order_by(sa_fn.coalesce(ch_count_sq2.c.ch_cnt, 0).desc())
        else:
            query = query.order_by(sa_fn.coalesce(ch_count_sq.c.ch_cnt, 0).desc())
    elif sort == "updated":
        query = query.order_by(sa_case((MangaItem.updated_at == None, datetime.min), else_=MangaItem.updated_at).desc())
    elif sort == "newest":
        query = query.order_by(MangaItem.created_at.desc())
    elif sort == "rating":
        # Средний рейтинг локальных пользователей, порог >= 20 голосов
        rat_sort_sq = db.query(
            MangaRating.manga_id,
            func.avg(MangaRating.rating).label("avg_r"),
            func.count(MangaRating.id).label("r_cnt")
        ).group_by(MangaRating.manga_id).subquery()
        query = query.outerjoin(rat_sort_sq, MangaItem.manga_id == rat_sort_sq.c.manga_id)
        # Тайтлы с >= 20 голосами показываются первыми, отсортированные по avg_r desc
        query = query.order_by(
            sa_case((func.coalesce(rat_sort_sq.c.r_cnt, 0) >= 20, 0), else_=1).asc(),
            func.coalesce(rat_sort_sq.c.avg_r, 0).desc()
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
            "slug": item.slug or manga_id,
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
            "hidden": item.hidden or False,
        })
    response = {
        "items": result,
        "total": total_count,
        "page": page,
        "limit": limit,
        "pages": (total_count + limit - 1) // limit,
    }
    if redis_client:
        redis_client.setex(cache_key, 90, json.dumps(response, default=str))
    return response


@app.get("/manga/{manga_id}/detail", summary="Получить одну мангу по ID")
async def get_manga_detail(
    manga_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    from sqlalchemy import func
    from collections import Counter
    item = resolve_manga(db, manga_id)
    if not item:
        raise HTTPException(status_code=404, detail="Манга не найдена")
    real_id = item.manga_id

    manga_ratings = db.query(MangaRating).filter(MangaRating.manga_id == real_id).all()
    avg_rating = round(sum(r.rating for r in manga_ratings) / len(manga_ratings), 2) if manga_ratings else 0
    rating_distribution = {}
    for r in manga_ratings:
        rating_distribution[str(r.rating)] = rating_distribution.get(str(r.rating), 0) + 1
    user_rating = None
    if current_user:
        ur = db.query(MangaRating).filter(MangaRating.manga_id == real_id, MangaRating.user_id == current_user.id).first()
        if ur: user_rating = ur.rating

    bookmarks = db.query(MangaBookmark).filter(MangaBookmark.manga_id == real_id).all()
    bookmark_counts = Counter(b.status for b in bookmarks)
    user_bookmark = None
    if current_user:
        ub = db.query(MangaBookmark).filter(MangaBookmark.manga_id == real_id, MangaBookmark.user_id == current_user.id).first()
        if ub: user_bookmark = ub.status

    views_count = db.query(func.count(MangaView.id)).filter(MangaView.manga_id == real_id).scalar() or 0
    chapter_count = db.query(func.count(Chapter.id)).filter(Chapter.manga_id == real_id).scalar() or 0

    return {
        "manga_id": real_id,
        "slug": item.slug or real_id,
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
    item = resolve_manga(db, manga_id)
    real_id = item.manga_id if item else manga_id
    chapters = chapters_from_db(db, real_id)
    if not chapters and item:
        chapters = safe_json_load(item.chapters, [])

    # Обогащаем views/likes
    likes = db.query(ChapterLike.chapter_id).filter(ChapterLike.manga_id == real_id).all()
    views = db.query(ChapterView.chapter_id).filter(ChapterView.manga_id == real_id).all()
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
    item = resolve_manga(db, manga_id)
    if not item:
        raise HTTPException(status_code=404, detail="Манга не найдена")
    manga_id = item.manga_id
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


@app.patch("/admin/manga/{manga_id}/visibility", summary="Переключить видимость манги")
async def toggle_manga_visibility(manga_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Только для администраторов")
    item = resolve_manga(db, manga_id)
    if not item:
        raise HTTPException(status_code=404, detail="Манга не найдена")
    manga_id = item.manga_id
    item.hidden = not (item.hidden or False)
    db.commit()
    action = "СКРЫТИЕ МАНГИ" if item.hidden else "ПОКАЗ МАНГИ"
    log_admin_action(db, current_user, action, f"{item.title} ({manga_id})")
    return {"manga_id": manga_id, "hidden": item.hidden}


@app.delete("/admin/manga/bulk", summary="Массовое удаление манг")
async def bulk_delete_manga(ids: list[str] = Body(..., embed=True), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Только для администраторов")
    for manga_id in ids:
        item = db.query(MangaItem).filter(MangaItem.manga_id == manga_id).first()
        if item:
            db.query(ChapterLike).filter(ChapterLike.manga_id == manga_id).delete()
            db.query(ChapterView).filter(ChapterView.manga_id == manga_id).delete()
            db.query(ChapterMeta).filter(ChapterMeta.manga_id == manga_id).delete()
            db.query(MangaView).filter(MangaView.manga_id == manga_id).delete()
            db.query(MangaRating).filter(MangaRating.manga_id == manga_id).delete()
            db.query(MangaBookmark).filter(MangaBookmark.manga_id == manga_id).delete()
            db.query(ReadingHistory).filter(ReadingHistory.manga_id == manga_id).delete()
            db.query(Chapter).filter(Chapter.manga_id == manga_id).delete()
            db.delete(item)
    db.commit()
    log_admin_action(db, current_user, "УДАЛЕНИЕ МАНГИ", f"{len(ids)} шт.")
    return {"status": "deleted", "count": len(ids)}

@app.post("/manga/{manga_id}/view", summary="Засчитать просмотр тайтла")
async def add_manga_view(
    manga_id: str,
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    _item = resolve_manga(db, manga_id)
    if _item: manga_id = _item.manga_id
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
    if ok_count > 0:
        titles = [r.get("title", "?") for r in results if r["status"] == "ok"]
        preview = ", ".join(titles[:3]) + ("..." if len(titles) > 3 else "")
        notify_telegram_event(db, "new_chapter", f"📚 <b>Импорт завершён</b>\nУспешно: {ok_count} из {len(all_urls)}\n{preview}")
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
    """Replace mangabuff.ru watermark strips and convert to WebP.
    wm_mode: 'top' = text top only, 'bottom' = text bottom only, 'both' = text both. '' = convert to WebP only."""
    try:
        img = Image.open(io.BytesIO(image_bytes))
        width, height = img.size

        if width < 100 or height < 200:
            return image_bytes

        WEBP_MAX = 16383
        if width > WEBP_MAX or height > WEBP_MAX:
            ratio = min(WEBP_MAX / width, WEBP_MAX / height)
            img = img.resize((int(width * ratio), int(height * ratio)), Image.LANCZOS)
            width, height = img.size

        if img.mode == "RGBA":
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[3])
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")

        if wm_mode:
            from PIL import ImageDraw, ImageFont

            draw = ImageDraw.Draw(img)

            do_top = wm_mode in ("top", "both")
            do_bot = wm_mode in ("bottom", "both")

            strip_h = max(WATERMARK_TOP_STRIP, WATERMARK_BOT_STRIP)
            font_size = max(18, min(strip_h - 10, width // 18, 44))
            font = None
            for fp in [
                "C:/Windows/Fonts/impact.ttf", "impact.ttf", "C:/Windows/Fonts/arialbd.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            ]:
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
        img.save(buf, format="WEBP", quality=85, method=4)
        return buf.getvalue()
    except Exception as e:
        print(f"[WARN] Watermark replacement failed: {e}")
        return image_bytes


import hashlib as _hashlib

CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "image_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

def _cache_key(url: str, wm: str) -> str:
    h = _hashlib.md5((url + "|" + wm).encode()).hexdigest()
    return h + ".webp"

def _cache_path(url: str, wm: str) -> str:
    return os.path.join(CACHE_DIR, _cache_key(url, wm))


@app.get("/proxy/image", summary="Проксирование изображений с заменой watermark")
async def proxy_image(url: str = Query(..., description="URL изображения"), wm: str = Query("", description="Watermark mode: top, bottom, both, or empty")):
    from fastapi.responses import Response, FileResponse

    if not url.startswith("http"):
        raise HTTPException(status_code=400, detail="Invalid URL")

    cpath = _cache_path(url, wm)
    if os.path.exists(cpath):
        return FileResponse(cpath, media_type="image/webp", headers={"Cache-Control": "public, max-age=604800", "X-Cache": "HIT"})

    try:
        session = await get_chapter_session()
        async with session.get(url, headers={**HEADERS, "Referer": BASE_URL}, proxy=MANGABUFF_PROXY) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=resp.status, detail="Failed to fetch image")
            content_type = resp.content_type or "image/jpeg"
            image_bytes = await resp.read()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error fetching image: {e}")

    processed = await asyncio.get_event_loop().run_in_executor(None, lambda: replace_watermark(image_bytes, wm))

    is_webp = processed[:4] == b"RIFF" if processed else False
    ct = "image/webp" if is_webp else content_type

    try:
        if is_webp:
            with open(cpath, "wb") as f:
                f.write(processed)
    except Exception:
        pass

    return Response(
        content=processed,
        media_type=ct,
        headers={"Cache-Control": "public, max-age=604800", "X-Cache": "MISS"},
    )


@app.get("/img/{filename}", summary="Чистый URL для картинок")
async def serve_cached_image(filename: str, url: str = Query(""), wm: str = Query("")):
    """Clean URL: /img/<hash>.webp?url=...&wm=...
    Если файл уже в кэше — отдаёт мгновенно. Если нет — скачивает, конвертирует, кэширует."""
    from fastapi.responses import FileResponse, Response
    if not filename.endswith(".webp") or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    fpath = os.path.join(CACHE_DIR, filename)
    if os.path.exists(fpath):
        return FileResponse(fpath, media_type="image/webp", headers={"Cache-Control": "public, max-age=604800", "X-Cache": "HIT"})

    # Not cached yet — need original URL to fetch
    if not url or not url.startswith("http"):
        raise HTTPException(status_code=404, detail="Image not cached and no source URL provided")

    try:
        session = await get_chapter_session()
        async with session.get(url, headers={**HEADERS, "Referer": BASE_URL}, proxy=MANGABUFF_PROXY) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=resp.status, detail="Failed to fetch image")
            image_bytes = await resp.read()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error fetching image: {e}")

    processed = await asyncio.get_event_loop().run_in_executor(None, lambda: replace_watermark(image_bytes, wm))
    is_webp = processed[:4] == b"RIFF" if processed else False

    try:
        if is_webp:
            with open(fpath, "wb") as f:
                f.write(processed)
    except Exception:
        pass

    return Response(
        content=processed,
        media_type="image/webp" if is_webp else "image/jpeg",
        headers={"Cache-Control": "public, max-age=604800", "X-Cache": "MISS"},
    )


@app.post("/auth/register", summary="Регистрация пользователя")
async def register(user: UserCreate, db: Session = Depends(get_db)):
    reg_open = get_setting_value("registration_open", "true")
    if reg_open != "true":
        raise HTTPException(status_code=403, detail="Регистрация временно закрыта")
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
async def login_for_access_token(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    # Ищем по email (username в форме = email)
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        db.add(LoginHistory(user_id=None, username=form_data.username or "-", ip=ip, status="FAIL"))
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user.status == "banned":
        db.add(LoginHistory(user_id=user.id, username=user.username, ip=ip, status="BANNED"))
        db.commit()
        raise HTTPException(status_code=403, detail="Account is banned")
    if user.status == "frozen":
        db.add(LoginHistory(user_id=user.id, username=user.username, ip=ip, status="FROZEN"))
        db.commit()
        raise HTTPException(status_code=403, detail="Account is frozen — contact admin")
    db.add(LoginHistory(user_id=user.id, username=user.username, ip=ip, status="OK"))
    db.commit()
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    from fastapi.responses import JSONResponse
    response = JSONResponse({"access_token": access_token, "token_type": "bearer"})
    response.set_cookie(
        key=auth.COOKIE_NAME,
        value=access_token,
        max_age=auth.COOKIE_MAX_AGE,
        httponly=True,
        secure=auth.COOKIE_SECURE,
        samesite="lax",
        path="/",
        domain=auth.COOKIE_DOMAIN,
    )
    return response

@app.post("/auth/logout", summary="Выход из системы")
async def logout():
    from fastapi.responses import JSONResponse
    response = JSONResponse({"detail": "Logged out"})
    response.delete_cookie(key=auth.COOKIE_NAME, path="/", domain=auth.COOKIE_DOMAIN)
    return response

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
        "profile_background_url": current_user.profile_background_url or "",
        "profile_theme": current_user.profile_theme or "base",
        "avatar_frame": current_user.avatar_frame or "none",
        "badge_ids": current_user.badge_ids or "[]",
        "showcase_manga_ids": current_user.showcase_manga_ids or "[]",
        "xp": current_user.xp or 0,
        "level": current_user.level or 1,
        "scrap": current_user.scrap or 0,
        "active_title": current_user.active_title or "",
        "sound_enabled": bool(current_user.sound_enabled),
        "subscription_active": is_springpro_active(current_user),
        "subscription_expires_at": current_user.subscription_expires_at.isoformat() if current_user.subscription_expires_at else None,
        "telegram_id": current_user.telegram_id or "",
        "telegram_username": current_user.telegram_username or "",
        "google_id": current_user.google_id or "",
        "yandex_id": current_user.yandex_id or "",
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
        FREE_THEMES = {"base", "neon", "corroded"}
        if data.profile_theme not in FREE_THEMES:
            purchase = db.query(UserPurchase).filter(
                UserPurchase.user_id == current_user.id,
                UserPurchase.item_key == f"skin_{data.profile_theme}"
            ).first()
            if not purchase:
                raise HTTPException(400, "У вас нет доступа к этому скину")
        current_user.profile_theme = data.profile_theme
        # Auto-reset mythic controls when switching to non-mythic skin
        new_skin = db.query(ShopItem).filter(ShopItem.key == f"skin_{data.profile_theme}").first()
        if not (new_skin and new_skin.rarity == "mythic"):
            current_user.nickname_color = ""
            current_user.nickname_font = ""
    if data.avatar_frame is not None:
        current_user.avatar_frame = data.avatar_frame
    if data.showcase_manga_ids is not None:
        current_user.showcase_manga_ids = data.showcase_manga_ids
    if data.active_title is not None:
        current_user.active_title = data.active_title
    if data.sound_enabled is not None:
        current_user.sound_enabled = data.sound_enabled
    if data.nickname_color is not None:
        # Validate: only mythic skin owners can set custom nickname color
        theme = data.profile_theme or current_user.profile_theme or "base"
        skin_item = db.query(ShopItem).filter(ShopItem.key == f"skin_{theme}").first()
        if skin_item and skin_item.rarity == "mythic":
            current_user.nickname_color = data.nickname_color
        elif not data.nickname_color:
            current_user.nickname_color = ""
    if data.nickname_font is not None:
        theme = data.profile_theme or current_user.profile_theme or "base"
        skin_item = db.query(ShopItem).filter(ShopItem.key == f"skin_{theme}").first()
        if skin_item and skin_item.rarity == "mythic":
            current_user.nickname_font = data.nickname_font
        elif not data.nickname_font:
            current_user.nickname_font = ""
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


def _send_smtp_email(to_email: str, subject: str, html_body: str) -> bool:
    try:
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        db = SessionLocal()
        settings = {}
        for s in db.query(SiteSetting).all():
            settings[s.key] = s.value
        db.close()
        smtp_host = settings.get("smtp_host", "")
        smtp_port = int(settings.get("smtp_port", "587"))
        smtp_user = settings.get("smtp_user", "")
        smtp_pass = settings.get("smtp_password", "")
        smtp_from = settings.get("smtp_from", "")
        use_tls = settings.get("smtp_tls", "true") == "true"
        if not smtp_host or not smtp_user:
            return False
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = smtp_from or smtp_user
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html", "utf-8"))
        if use_tls:
            server = smtplib.SMTP(smtp_host, smtp_port)
            server.starttls()
        else:
            server = smtplib.SMTP(smtp_host, smtp_port)
        server.login(smtp_user, smtp_pass)
        server.sendmail(msg["From"], to_email, msg.as_string())
        server.quit()
        return True
    except Exception as e:
        print(f"[SMTP ERROR] {e}")
        return False


@app.post("/auth/forgot-password", summary="Запросить сброс пароля")
async def forgot_password(data: dict = Body(...), db: Session = Depends(get_db)):
    email = data.get("email", "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Введите email")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return {"ok": True}
    import secrets as _secrets
    reset_token = _secrets.token_urlsafe(32)
    db.add(PasswordResetToken(user_id=user.id, token=reset_token))
    db.commit()
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")
    reset_link = f"{frontend_url}/#/reset-password?token={reset_token}"
    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0908;font-family:monospace,sans-serif;color:#d4c8b0;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0908;padding:40px 20px;">
<tr><td align="center">
<table width="500" cellpadding="0" cellspacing="0" style="background:#141210;border:1px solid #2a2420;">
<tr><td style="background:#1a1815;padding:24px 30px;border-bottom:1px solid #2a2420;">
<h1 style="margin:0;font-size:22px;color:#9b8c3b;letter-spacing:3px;">SPRINGMANGA</h1>
<p style="margin:6px 0 0;font-size:11px;color:#5a5040;">СБРОС ПАРОЛЯ</p>
</td></tr>
<tr><td style="padding:30px;">
<p style="margin:0 0 16px;font-size:14px;color:#d4c8b0;">Привет, <strong style="color:#39ff14">{user.username}</strong>.</p>
<p style="margin:0 0 16px;font-size:13px;color:#8a8070;">Поступил запрос на сброс пароля от вашего аккаунта. Если это не вы — просто проигнорируйте это письмо.</p>
<table cellpadding="0" cellspacing="0" style="margin:24px 0;">
<tr><td style="background:#9b8c3b;border-radius:4px;">
<a href="{reset_link}" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:bold;color:#0a0908;text-decoration:none;letter-spacing:1px;">СБРОСИТЬ ПАРОЛЬ</a>
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:11px;color:#5a5040;">Или скопируйте ссылку в браузер:</p>
<p style="margin:4px 0 0;font-size:11px;color:#6cacff;word-break:break-all;">{reset_link}</p>
</td></tr>
<tr><td style="padding:16px 30px;border-top:1px solid #2a2420;">
<p style="margin:0;font-size:10px;color:#5a5040;">Ссылка действительна 1 час. SpringManga — springtrap@afton</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""
    _send_smtp_email(email, "SpringManga — Сброс пароля", html)
    return {"ok": True}


@app.post("/auth/reset-password", summary="Сбросить пароль по токену")
async def reset_password(data: dict = Body(...), db: Session = Depends(get_db)):
    token_val = data.get("token", "")
    new_pass = data.get("new_password", "")
    if not token_val or not new_pass:
        raise HTTPException(status_code=400, detail="Токен и новый пароль обязательны")
    if len(new_pass) < 6:
        raise HTTPException(status_code=400, detail="Пароль минимум 6 символов")
    reset_entry = db.query(PasswordResetToken).filter(PasswordResetToken.token == token_val, PasswordResetToken.used == False).first()
    if not reset_entry:
        raise HTTPException(status_code=400, detail="Токен недействителен или истёк")
    if reset_entry.created_at and (datetime.utcnow() - reset_entry.created_at).total_seconds() > 3600:
        raise HTTPException(status_code=400, detail="Токен истёк. Запросите новый.")
    user = db.query(User).filter(User.id == reset_entry.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    user.hashed_password = get_password_hash(new_pass)
    reset_entry.used = True
    db.commit()
    return {"ok": True}


@app.post("/auth/avatar", summary="Загрузить аватарку")
async def upload_avatar(file: UploadFile = FastAPIFile(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ext = os.path.splitext(file.filename or "img.png")[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
        raise HTTPException(status_code=400, detail="Недопустимый формат файла")
    # GIF avatars restricted to admin + SPRINGPRO
    if ext == ".gif" and current_user.role != "admin" and not is_springpro_active(current_user):
        raise HTTPException(status_code=403, detail="GIF-аватар доступен только для ADMIN и SPRINGPRO")
    filename = f"{current_user.id}{ext}"
    filepath = os.path.join(AVATARS_DIR, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    import time as _time
    current_user.avatar_url = f"/uploads/avatars/{filename}?v={int(_time.time())}"
    db.commit()
    return {"avatar_url": current_user.avatar_url}

@app.post("/auth/banner", summary="Загрузить баннер профиля")
async def upload_banner(file: UploadFile = FastAPIFile(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    allowed = current_user.role == "admin" or is_springpro_active(current_user)
    if not allowed:
        raise HTTPException(403, "Загрузка доступна с подпиской SPRINGPRO")
    ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm"}
    MIME_TO_EXT = {"image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp", "video/mp4": ".mp4", "video/webm": ".webm"}
    ext = os.path.splitext(file.filename or "")[1].lower()
    if not ext or ext not in ALLOWED_EXTS:
        ext = MIME_TO_EXT.get(file.content_type or "", "")
    if ext not in ALLOWED_EXTS:
        raise HTTPException(status_code=400, detail=f"Недопустимый формат: {ext or 'неизвестный'} (файл: {file.filename}, тип: {file.content_type})")
    import time
    ts = int(time.time())
    filename = f"{current_user.id}_banner_{ts}{ext}"
    filepath = os.path.join(BANNERS_DIR, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    current_user.profile_banner_url = f"/uploads/banners/{filename}"
    db.commit()
    return {"banner_url": current_user.profile_banner_url}

@app.post("/auth/background", summary="Загрузить фон профиля (админ)")
async def upload_background(file: UploadFile = FastAPIFile(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(403, "Только для администраторов")
    ext = os.path.splitext(file.filename or "img.png")[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm"):
        raise HTTPException(status_code=400, detail="Недопустимый формат файла")
    import time
    ts = int(time.time())
    filename = f"{current_user.id}_bg_{ts}{ext}"
    filepath = os.path.join(BACKGROUNDS_DIR, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    current_user.profile_background_url = f"/uploads/backgrounds/{filename}"
    db.commit()
    return {"background_url": current_user.profile_background_url}

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
    if current_user.muted_until and current_user.muted_until > datetime.utcnow():
        remaining = current_user.muted_until - datetime.utcnow()
        raise HTTPException(status_code=403, detail=f"Вы замьючены. Мут снимется через {remaining.days}д {remaining.seconds // 3600}ч")
    if not data.text or not data.text.strip():
        raise HTTPException(status_code=400, detail="Пустой комментарий")
    if len(data.text) > 500:
        raise HTTPException(status_code=400, detail="Слишком длинный комментарий (макс. 500)")
    cleaned_text = data.text.strip()
    bw_result = check_comment(cleaned_text, extra_banned=[w.strip().lower() for w in get_setting_value("banned_words", "").split(",") if w.strip()], word_overrides={
        "badwords_shadow": get_setting_value("badwords_shadow", ""),
        "badwords_warn_links": get_setting_value("badwords_warn_links", ""),
        "badwords_warn_scam": get_setting_value("badwords_warn_scam", ""),
        "badwords_freeze": get_setting_value("badwords_freeze", ""),
    })
    if bw_result:
        if bw_result['severity'] == 'shadow':
            cleaned_text = shadow_replace(cleaned_text, word_overrides={
                "badwords_shadow": get_setting_value("badwords_shadow", ""),
            })
        elif bw_result['severity'] in ('warn', 'freeze'):
            raise HTTPException(status_code=400, detail=f"Комментарий отклонён: {bw_result['reason']}")
    comment = WallComment(profile_user_id=user_id, author_id=current_user.id, text=cleaned_text)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    # Notify profile owner
    if user_id != current_user.id:
        notif_msg = f'<a href="/user/{current_user.id}" class="text-brand-accent hover:underline font-bold">{current_user.username}</a> оставил комментарий в вашем <a href="/user/{user_id}" class="text-brand-accent hover:underline">профиле</a>'
        create_notification(db, user_id, notif_msg, f"/user/{user_id}", "social")
    # ── Scrap for comment (max 5/day) ──
    from datetime import date as _date
    today = _date.today()
    scrap_earned = 0
    if current_user.scrap_comments_date is None or current_user.scrap_comments_date != today:
        current_user.scrap_comments_today = 0
        current_user.scrap_comments_date = today
    if (current_user.scrap_comments_today or 0) < 5:
        scrap_earned = int(10 * (1.5 if is_springpro_active(current_user) else 1.0))
        current_user.scrap = (current_user.scrap or 0) + scrap_earned
        current_user.scrap_comments_today = (current_user.scrap_comments_today or 0) + 1
        db.commit()
    return {
        "id": comment.id,
        "author_id": current_user.id,
        "author": current_user.username,
        "author_avatar": current_user.avatar_url or "",
        "author_avatar_frame": current_user.avatar_frame,
        "text": comment.text,
        "timestamp": comment.created_at.strftime("%d.%m.%y %H:%M") if comment.created_at else "",
        "scrap_earned": scrap_earned,
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
    
    # Build heatmap via SQL GROUP BY (instead of loading all rows into Python)
    from sqlalchemy import func as sa_func
    heatmap = {}
    heatmap_rows = db.query(
        sa_func.date(ReadingHistory.read_at).label('day'),
        sa_func.count().label('cnt')
    ).filter(ReadingHistory.user_id == current_user.id).group_by('day').all()
    for row in heatmap_rows:
        if row.day:
            heatmap[str(row.day)] = row.cnt

    chapters_read = db.query(ReadingHistory).filter(ReadingHistory.user_id == current_user.id).count()
    total_likes = db.query(ChapterLike).filter(ChapterLike.user_id == current_user.id).count()
    total_ratings = db.query(MangaRating).filter(MangaRating.user_id == current_user.id).count()
    total_bookmarks = db.query(MangaBookmark).filter(MangaBookmark.user_id == current_user.id).count()
    
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
            "scrap": current_user.scrap or 0,
            "donated_scrap": current_user.donated_scrap or 0,
        },
        "active_title": current_user.active_title or "",
        "sound_enabled": bool(current_user.sound_enabled),
        "profile_theme": current_user.profile_theme or "base",
        "avatar_frame": current_user.avatar_frame or "none",
        "avatar_url": current_user.avatar_url or "",
        "profile_banner_url": current_user.profile_banner_url or "",
        "profile_background_url": current_user.profile_background_url or "",
        "bio": current_user.bio or "",
        "nickname_color": current_user.nickname_color or "",
        "nickname_font": current_user.nickname_font or "",
        "subscription_active": is_springpro_active(current_user),
        "subscription_expires_at": current_user.subscription_expires_at.isoformat() if current_user.subscription_expires_at else None,
    }

@app.get("/auth/my-comments", summary="Мои комментарии")
async def get_my_comments(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(MangaComment, MangaItem.title, MangaItem.slug, MangaItem.cover_url)
        .outerjoin(MangaItem, MangaComment.manga_id == MangaItem.manga_id)
        .filter(MangaComment.user_id == current_user.id, MangaComment.status == "approved")
        .order_by(MangaComment.created_at.desc())
        .limit(50)
        .all()
    )
    return [{
        "id": c.id, "mangaId": c.manga_id, "chapterId": c.chapter_id,
        "text": c.text, "timestamp": c.created_at.isoformat() if c.created_at else "",
        "mangaTitle": title or c.manga_id,
        "mangaSlug": slug or c.manga_id,
        "coverUrl": cover_url or "",
    } for c, title, slug, cover_url in rows]


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

    # Easter egg achievements (checked via frontend flags)
    # These are NOT auto-unlocked, frontend must explicitly request via /auth/unlock-achievement

    if new_badges:
        current_user.badge_ids = json.dumps(existing)
        db.commit()
    
    return {"badges": existing, "new_badges": new_badges}

@app.post("/auth/unlock-achievement", summary="Разблокировать специальную ачивку")
async def unlock_achievement(
    achievement_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Разблокировать специальную ачивку (easter eggs, секретные достижения)"""
    import json

    # Список разрешённых специальных ачивок
    allowed_achievements = ["konami_master", "horror_discoverer"]

    if achievement_id not in allowed_achievements:
        raise HTTPException(status_code=400, detail="Invalid achievement ID")

    try:
        existing = json.loads(current_user.badge_ids or "[]")
    except:
        existing = []

    # Проверяем, не разблокирована ли уже
    if achievement_id in existing:
        return {"success": False, "message": "Achievement already unlocked"}

    # Добавляем ачивку
    existing.append(achievement_id)
    current_user.badge_ids = json.dumps(existing)
    db.commit()

    return {"success": True, "achievement": achievement_id, "badges": existing}

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

    # ── Auto-unlock frames based on level ──
    if level_up:
        frames = db.query(ShopItem).filter(
            ShopItem.category == "frame",
            ShopItem.required_level > 0,
            ShopItem.required_level <= lvl,
            ShopItem.required_level > old_level
        ).all()
        for frame in frames:
            existing = db.query(UserPurchase).filter(
                UserPurchase.user_id == current_user.id,
                UserPurchase.item_key == frame.key
            ).first()
            if not existing:
                purchase = UserPurchase(user_id=current_user.id, item_key=frame.key)
                db.add(purchase)

    # ── Scrap earning: daily login & level-up ──
    from datetime import date as _date
    today = _date.today()
    daily_scrap = 0
    level_scrap = 0

    springpro_mult = 1.5 if is_springpro_active(current_user) else 1.0

    if current_user.last_scrap_daily is None or current_user.last_scrap_daily != today:
        daily_scrap = int(25 * springpro_mult)
        current_user.scrap = (current_user.scrap or 0) + daily_scrap
        current_user.last_scrap_daily = today

    if level_up:
        level_scrap = int(lvl * 25 * springpro_mult)
        current_user.scrap = (current_user.scrap or 0) + level_scrap

    db.commit()

    return {"xp": xp, "level": lvl, "level_up": level_up, "scrap": current_user.scrap or 0, "daily_scrap": daily_scrap, "level_scrap": level_scrap}

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
async def admin_get_users(search: str = "", current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    q = db.query(User)
    if search:
        q = q.filter((User.username.contains(search)) | (User.email.contains(search)))
    users = q.order_by(User.id.desc()).limit(100).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "role": u.role,
            "status": u.status,
            "avatar_url": u.avatar_url or "",
            "last_seen": u.last_seen.isoformat() if u.last_seen else None,
            "scrap": u.scrap or 0,
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
    old_role = target.role
    target.role = data.role
    db.commit()
    log_admin_action(db, current_user, "СМЕНА РОЛИ", f"{target.username} ({old_role} → {data.role})")
    return {"ok": True}

# ===== ADMIN SETTINGS =====

SETTINGS_DEFAULTS = {
    "site_name": "SPRINGMANGA",
    "maintenance_mode": "false",
    "registration_open": "true",
    "max_upload_mb": "10",
    "scrap_rate": "1",
    "allow_comments": "true",
    "allow_ratings": "true",
    "auto_ban_after_reports": "3",
    "mute_stages": "1,7,30,0",
    "max_scrap_daily": "500",
    "cdn_provider": "local",
    "cdn_url": "",
    "max_file_size_mb": "50",
    "allowed_formats": "png,jpg,gif,webp,mp4,zip",
    "auto_convert_webp": "false",
    "image_quality": "85",
    "storage_type": "local",
    "s3_endpoint": "",
    "s3_bucket": "",
    "s3_access_key": "",
    "s3_secret_key": "",
    "backup_media": "false",
    "backup_interval": "daily",
    "backup_destination": "local",
    "backup_retention": "7",
    "backup_s3_endpoint": "",
    "backup_s3_bucket": "",
    "lazy_load": "true",
    "preload_next": "true",
    "anti_download": "false",
    "chapter_no_reload": "true",
    "comment_provider": "builtin",
    "disqus_shortname": "",
    "pre_moderation": "false",
    "auto_moderation": "false",
    "spam_filter": "true",
    "banned_words": "",
    "badwords_shadow": "хуй,хуе,хуя,хую,пизда,пизде,пизды,пизду,ебать,ебан,ебуч,ебал,ебли,ёбан,блядь,бля,шлюха,шлюх,мудак,ублюдок,сука,сук,пидор,пидар,гандон,гондон,чмо,шмара,залупа,хер,ху,пзд,блть,ебт,аху,оху,хуе,хуи,пезд,ебик,ебну,ёб,ебл,пидр,уёб,уеб,хуё,заеб,заёб,отъеб,нигер,nigger,негр,хохол,русня,жид,даун,аутист,инвалид,мамку,мамаша,сынш",
    "badwords_warn_links": "впрофиле,переходипо,ссылкавбио,подпишисьнамой,вшапкепрофиля,тгканал,tgканал,телеграмканал,вкгруппа,ссылканамой,переходимвмойпрофиль,переходивпрофиль,ссылкавпрофиле,ссылканабусти,подпишись,подписывайся,бусти,busty,boosty",
    "badwords_warn_scam": "казино,casino,рулетка,ставки,1xbet,melbet,вулкан,vulkan,фриспины,слоты,азино,букмекер,заработок,безвложений,крипта,биткоин,bitcoin,binance,пассивныйдоход,трейдинг,заработатьонлайн,инвестиции,накрутка,подписчики,лайки,промокод,скидка,халява,купить,продаю,onlyfans,сливы",
    "badwords_freeze": "мефедрон,соль,спайс,закладка,шишки,гашыш,экстази,марки,кладмен,травка,суицид,вскрытьвены,расчлененка,цп,даркнет,сваттинг,доксинг,снафф,снаф,педофил,childporn,детскаяпорнография",
    "warn_before_ban": "true",
    "ssl_enforce": "false",
    "ip_blacklist": "",
    "rate_limit": "true",
    "rate_limit_rpm": "60",
    "anti_bot": "false",
    "captcha_register": "false",
    "captcha_login": "false",
    "suspicious_alerts": "true",
    "dmca_email": "",
    "dmca_auto_takedown": "3",
    "hotlink_protection": "false",
    "email_notifications": "false",
    "smtp_host": "",
    "smtp_port": "587",
    "smtp_user": "",
    "smtp_password": "",
    "smtp_from": "",
    "smtp_tls": "true",
    "push_notifications": "false",
    "push_new_chapter": "true",
    "push_comment_reply": "true",
    "email_on_register": "true",
    "email_on_reset": "true",
    "adsense_client_id": "",
    "direct_ad_html": "",
    "donation_url": "",
    "premium_price": "",
    "ad_cpm_rub": "50",
    "telegram_enabled": "false",
    "telegram_bot_token": "",
    "telegram_chat_id": "",
    "telegram_new_chapter": "true",
    "telegram_report": "true",
    "telegram_error": "false",
}

@app.get("/admin/settings", summary="Получить настройки сайта (админ)")
async def admin_get_settings(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    settings = db.query(SiteSetting).all()
    result = dict(SETTINGS_DEFAULTS)
    for s in settings:
        result[s.key] = s.value
    return {k: v for k, v in result.items()}

@app.put("/admin/settings", summary="Сохранить настройки сайта (админ)")
async def admin_save_settings(data: dict = Body(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещён")

    bypass_key = None

    for key, value in data.items():
        if key.startswith("_"):
            continue
        str_val = str(value) if not isinstance(value, bool) else ("true" if value else "false")
        existing = db.query(SiteSetting).filter(SiteSetting.key == key).first()
        if existing:
            existing.value = str_val
        else:
            db.add(SiteSetting(key=key, value=str_val))

    # Генерация / удаление bypass-ключа при переключении maintenance_mode
    if "maintenance_mode" in data:
        import secrets
        is_on = str(data["maintenance_mode"]).lower() in ("true", "1")
        bypass_setting = db.query(SiteSetting).filter(SiteSetting.key == "maintenance_bypass_key").first()
        if is_on:
            bypass_key = secrets.token_urlsafe(16)
            if bypass_setting:
                bypass_setting.value = bypass_key
            else:
                db.add(SiteSetting(key="maintenance_bypass_key", value=bypass_key))
        else:
            if bypass_setting:
                bypass_setting.value = ""

    db.commit()
    return {"ok": True, "bypass_key": bypass_key}


# ─── Бэкапы базы данных ───
BACKUP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backups")

@app.post("/admin/backup", summary="Создать бэкап БД")
async def admin_create_backup(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    from datetime import datetime
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"manga_app_{timestamp}.db"
    backup_path = os.path.join(BACKUP_DIR, backup_name)
    shutil.copy2(DB_PATH, backup_path)
    size = os.path.getsize(backup_path)
    log_admin_action(db, current_user, "СОЗДАНИЕ БЭКАПА", backup_name)
    return {"ok": True, "filename": backup_name, "size": size}

@app.get("/admin/backups", summary="Список бэкапов")
async def admin_list_backups(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    if not os.path.isdir(BACKUP_DIR):
        return []
    files = []
    for f in sorted(os.listdir(BACKUP_DIR), reverse=True):
        if f.endswith(".db"):
            fpath = os.path.join(BACKUP_DIR, f)
            files.append({
                "filename": f,
                "size": os.path.getsize(fpath),
                "created": os.path.getmtime(fpath),
            })
    return files

@app.post("/admin/backup/restore", summary="Восстановить БД из бэкапа")
async def admin_restore_backup(data: dict = Body(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    filename = data.get("filename", "")
    if not filename or ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Неверное имя файла")
    backup_path = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(backup_path):
        raise HTTPException(status_code=404, detail="Бэкап не найден")
    # Create safety backup before restore
    from datetime import datetime
    safety = os.path.join(BACKUP_DIR, f"pre_restore_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    shutil.copy2(DB_PATH, safety)
    shutil.copy2(backup_path, DB_PATH)
    log_admin_action(db, current_user, "ВОССТАНОВЛЕНИЕ ИЗ БЭКАПА", filename)
    return {"ok": True, "restored_from": filename, "safety_backup": os.path.basename(safety)}

@app.delete("/admin/backup/{filename}", summary="Удалить бэкап")
async def admin_delete_backup(filename: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Неверное имя файла")
    backup_path = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(backup_path):
        raise HTTPException(status_code=404, detail="Бэкап не найден")
    os.remove(backup_path)
    log_admin_action(db, current_user, "УДАЛЕНИЕ БЭКАПА", filename)
    return {"ok": True}


# ─── Telegram-уведомления ───
def send_telegram_message(text: str, db: Session):
    """Отправить сообщение в Telegram, если бот настроен и включён."""
    try:
        enabled = db.query(SiteSetting).filter(SiteSetting.key == "telegram_enabled").first()
        if not enabled or enabled.value != "true":
            return False
        bot_token_row = db.query(SiteSetting).filter(SiteSetting.key == "telegram_bot_token").first()
        chat_id_row = db.query(SiteSetting).filter(SiteSetting.key == "telegram_chat_id").first()
        if not bot_token_row or not chat_id_row or not bot_token_row.value or not chat_id_row.value:
            return False
        url = f"https://api.telegram.org/bot{bot_token_row.value}/sendMessage"
        requests.post(url, json={"chat_id": chat_id_row.value, "text": text, "parse_mode": "HTML"}, timeout=10)
        return True
    except Exception:
        return False


def notify_telegram_event(db: Session, event_type: str, text: str):
    """Отправить уведомление если соответствующий тип события включён."""
    setting_key = f"telegram_{event_type}"
    row = db.query(SiteSetting).filter(SiteSetting.key == setting_key).first()
    if row and row.value == "false":
        return
    send_telegram_message(text, db)


@app.post("/admin/test-telegram", summary="Тест Telegram-бота")
async def admin_test_telegram(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    ok = send_telegram_message("🟢 <b>SpringOS</b>: Тестовое сообщение — бот работает!", db)
    if ok:
        return {"ok": True, "message": "Сообщение отправлено"}
    raise HTTPException(status_code=400, detail="Не удалось отправить. Проверьте токен и chat_id.")


@app.get("/admin/stats", summary="Общая статистика для аналитики (админ)")
async def admin_stats(period: str = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    from sqlalchemy import func as sa_fn
    total_users = db.query(sa_fn.count(User.id)).scalar()
    total_manga = db.query(sa_fn.count(MangaItem.manga_id)).scalar()
    total_views = db.query(sa_fn.count(MangaView.id)).scalar()
    total_chapter_views = db.query(sa_fn.count(ChapterView.id)).scalar()
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    dau = db.query(sa_fn.count(User.id)).filter(User.last_seen >= seven_days_ago).scalar()
    mau = db.query(sa_fn.count(User.id)).filter(User.last_seen >= thirty_days_ago).scalar()
    # Time-filtered top queries
    period_filter = None
    if period == "day":
        period_filter = datetime.utcnow() - timedelta(days=1)
    elif period == "week":
        period_filter = datetime.utcnow() - timedelta(days=7)
    elif period == "month":
        period_filter = datetime.utcnow() - timedelta(days=30)
    # else: all time (no filter)
    manga_q = db.query(MangaView.manga_id, sa_fn.count(MangaView.id).label("views"))
    if period_filter:
        manga_q = manga_q.filter(MangaView.created_at >= period_filter)
    top_manga = manga_q.group_by(MangaView.manga_id).order_by(sa_fn.count(MangaView.id).desc()).limit(10).all()
    top_manga_list = []
    for mv in top_manga:
        item = db.query(MangaItem).filter(MangaItem.manga_id == mv[0]).first()
        top_manga_list.append({"manga_id": mv[0], "title": item.title if item else mv[0], "views": mv[1]})
    chapter_q = db.query(ChapterView.chapter_id, ChapterView.manga_id, sa_fn.count(ChapterView.id).label("views"))
    if period_filter:
        chapter_q = chapter_q.filter(ChapterView.created_at >= period_filter)
    top_chapters = chapter_q.group_by(ChapterView.chapter_id).order_by(sa_fn.count(ChapterView.id).desc()).limit(10).all()
    top_chapters_list = []
    for tc in top_chapters:
        ch = db.query(Chapter).filter(Chapter.chapter_id == tc[0], Chapter.manga_id == tc[1]).first()
        mi = db.query(MangaItem).filter(MangaItem.manga_id == tc[1]).first()
        top_chapters_list.append({
            "chapter_id": tc[0],
            "manga": mi.title if mi else tc[1],
            "chapter": ch.title if ch else tc[0],
            "views": tc[2],
        })
    genre_counts = {}
    all_manga = db.query(MangaItem.genres).all()
    for g_str in all_manga:
        try:
            genres = json.loads(g_str[0]) if g_str[0] else []
            for g in genres:
                genre_counts[g] = genre_counts.get(g, 0) + 1
        except:
            pass
    sorted_genres = sorted(genre_counts.items(), key=lambda x: x[1], reverse=True)[:15]
    total_purchases = db.query(sa_fn.count(UserPurchase.id)).scalar()
    total_scrap = db.query(sa_fn.coalesce(sa_fn.sum(PaymentTransaction.scrap_amount), 0)).scalar()
    # Дополнительные метрики
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    fifteen_min_ago = datetime.utcnow() - timedelta(minutes=15)
    new_chapters_today = db.query(sa_fn.count(Chapter.id)).filter(Chapter.created_at >= today_start).scalar()
    premium_count = db.query(sa_fn.count(User.id)).filter(User.subscription_type == "springpro").scalar()
    banned_count = db.query(sa_fn.count(User.id)).filter(User.status == "banned").scalar()
    online_now = (redis_client.scard("online_ips") if redis_client else 0) or db.query(sa_fn.count(User.id)).filter(User.last_seen >= fifteen_min_ago).scalar()
    transactions_today = db.query(sa_fn.count(ScrapTransaction.id)).filter(ScrapTransaction.created_at >= today_start).scalar()
    payments_today_rub = db.query(sa_fn.coalesce(sa_fn.sum(PaymentTransaction.amount_rub), 0)).filter(PaymentTransaction.status == "completed", PaymentTransaction.created_at >= today_start).scalar()
    total_scrap_circulation = db.query(sa_fn.coalesce(sa_fn.sum(User.scrap), 0)).scalar() + db.query(sa_fn.coalesce(sa_fn.sum(User.donated_scrap), 0)).scalar()
    pending_reports = db.query(sa_fn.count(Report.id)).filter(Report.status == "pending").scalar()

    # Storage and system stats
    import shutil
    storage_total = 0
    storage_used = 0
    storage_percent = 0
    try:
        stat = shutil.disk_usage(".")
        storage_total = stat.total
        storage_used = stat.used
        storage_percent = int((stat.used / stat.total) * 100) if stat.total > 0 else 0
    except:
        pass

    # Shop purchases today
    shop_purchases_today = db.query(sa_fn.count(UserPurchase.id)).filter(UserPurchase.purchased_at >= today_start).scalar()
    scrap_spent_today = db.query(sa_fn.coalesce(sa_fn.sum(ScrapTransaction.amount), 0)).filter(
        ScrapTransaction.created_at >= today_start,
        ScrapTransaction.reason == "purchase"
    ).scalar()

    # Broken pages reports (reports with type "broken_page" or similar)
    broken_reports = db.query(sa_fn.count(Report.id)).filter(
        Report.status == "pending",
        Report.reason.in_(["broken_page", "missing_chapter", "image_error"])
    ).scalar()

    # DMCA requests (reports with type "copyright")
    dmca_reports = db.query(sa_fn.count(Report.id)).filter(
        Report.status == "pending",
        Report.reason == "copyright"
    ).scalar()

    # Последние комментарии
    recent_comments_raw = db.query(MangaComment).order_by(MangaComment.created_at.desc()).limit(5).all()
    recent_comments_list = []
    for c in recent_comments_raw:
        u = db.query(User).filter(User.id == c.user_id).first()
        m = db.query(MangaItem).filter(MangaItem.manga_id == c.manga_id).first()
        recent_comments_list.append({
            "id": c.id,
            "text": c.text[:80] + ("..." if len(c.text) > 80 else ""),
            "username": u.username if u else "Unknown",
            "avatar_url": u.avatar_url if u else "",
            "manga_title": m.title if m else c.manga_id,
            "manga_id": c.manga_id,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })
    comments_today = db.query(sa_fn.count(MangaComment.id)).filter(
        MangaComment.created_at >= today_start
    ).scalar()

    # Traffic sources — computed from view data
    auth_manga_views_q = db.query(sa_fn.count(MangaView.id)).filter(MangaView.user_id != None)
    anon_manga_views_q = db.query(sa_fn.count(MangaView.id)).filter(MangaView.user_id == None)
    auth_chapter_views_q = db.query(sa_fn.count(ChapterView.id)).filter(ChapterView.user_id != None)
    anon_chapter_views_q = db.query(sa_fn.count(ChapterView.id)).filter(ChapterView.user_id == None)
    if period_filter:
        auth_manga_views_q = auth_manga_views_q.filter(MangaView.created_at >= period_filter)
        anon_manga_views_q = anon_manga_views_q.filter(MangaView.created_at >= period_filter)
        auth_chapter_views_q = auth_chapter_views_q.filter(ChapterView.created_at >= period_filter)
        anon_chapter_views_q = anon_chapter_views_q.filter(ChapterView.created_at >= period_filter)
    auth_views = (auth_manga_views_q.scalar() or 0) + (auth_chapter_views_q.scalar() or 0)
    anon_views = (anon_manga_views_q.scalar() or 0) + (anon_chapter_views_q.scalar() or 0)

    bookmark_manga_q = db.query(sa_fn.count(MangaBookmark.id))
    if period_filter:
        bookmark_manga_q = bookmark_manga_q.filter(MangaBookmark.created_at >= period_filter)
    bookmark_views = bookmark_manga_q.scalar() or 0

    total_traffic = auth_views + anon_views or 1
    traffic_sources_list = [
        {"source": "Авторизованные", "visits": auth_views, "percent": round(auth_views / total_traffic * 100, 1)},
        {"source": "Гости (анонимы)", "visits": anon_views, "percent": round(anon_views / total_traffic * 100, 1)},
    ]
    if bookmark_views > 0:
        traffic_sources_list.append({"source": "Из закладок", "visits": bookmark_views, "percent": round(bookmark_views / total_traffic * 100, 1)})

    # Ad revenue — estimated from total views * CPM
    ad_cpm_rub = float(get_setting_value("ad_cpm_rub", "50"))
    ad_revenue_rub = round(total_views * ad_cpm_rub / 1000, 2)

    # Frozen accounts count
    frozen_count = db.query(sa_fn.count(User.id)).filter(User.status == "frozen").scalar()

    return {
        "total_users": total_users,
        "total_manga": total_manga,
        "total_views": total_views,
        "total_chapter_views": total_chapter_views,
        "dau": dau,
        "mau": mau,
        "top_manga": top_manga_list,
        "top_chapters": top_chapters_list,
        "popular_genres": [{"genre": g, "tag": g, "count": c} for g, c in sorted_genres],
        "traffic_sources": traffic_sources_list,
        "total_purchases": total_purchases,
        "total_scrap_earned": total_scrap,
        "ad_revenue_rub": ad_revenue_rub,
        "new_chapters_today": new_chapters_today,
        "premium_count": premium_count,
        "banned_count": banned_count,
        "frozen_count": frozen_count,
        "online_now": online_now,
        "transactions_today": transactions_today,
        "payments_today_rub": float(payments_today_rub),
        "total_scrap_circulation": total_scrap_circulation,
        "pending_reports": pending_reports,
        "recent_errors": [],
        "storage_total_bytes": storage_total,
        "storage_used_bytes": storage_used,
        "storage_percent": storage_percent,
        "shop_purchases_today": shop_purchases_today,
        "scrap_spent_today": abs(int(scrap_spent_today)),
        "broken_reports": broken_reports,
        "dmca_reports": dmca_reports,
        "recent_comments": recent_comments_list,
        "comments_today": comments_today,
    }


@app.post("/admin/test-email", summary="Тестовая отправка email (админ)")
async def admin_test_email(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    try:
        import smtplib
        from email.mime.text import MIMEText
        settings = {}
        db = SessionLocal()
        for s in db.query(SiteSetting).all():
            settings[s.key] = s.value
        db.close()
        smtp_host = settings.get("smtp_host", "")
        smtp_port = int(settings.get("smtp_port", "587"))
        smtp_user = settings.get("smtp_user", "")
        smtp_pass = settings.get("smtp_password", "")
        smtp_from = settings.get("smtp_from", "")
        use_tls = settings.get("smtp_tls", "true") == "true"
        if not smtp_host or not smtp_user:
            return {"ok": False, "detail": "SMTP не настроен"}
        msg = MIMEText("SPRINGOS TEST — Если вы видите это письмо, SMTP работает корректно.\n\n— Afton Robotics")
        msg["Subject"] = "SPRINGOS :: Тестовое письмо"
        msg["From"] = smtp_from or smtp_user
        msg["To"] = current_user.email
        if use_tls:
            server = smtplib.SMTP(smtp_host, smtp_port)
            server.starttls()
        else:
            server = smtplib.SMTP(smtp_host, smtp_port)
        server.login(smtp_user, smtp_pass)
        server.sendmail(msg["From"], current_user.email, msg.as_string())
        server.quit()
        return {"ok": True, "detail": f"Письмо отправлено на {current_user.email}"}
    except Exception as e:
        return {"ok": False, "detail": str(e)}


@app.get("/admin/stats/visits", summary="Статистика посещений за 30 дней (админ)")
async def admin_stats_visits(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    from sqlalchemy import func
    import sqlite3
    now = datetime.utcnow()
    start = now - timedelta(days=29)
    start_str = start.strftime("%Y-%m-%d")
    # Используем raw SQL для SQLite — cast(Date) не работает с SQLite
    day_map: dict = {}
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        # Просмотры манги по дням
        cursor.execute(
            "SELECT date(created_at) as day, COUNT(*) as cnt FROM manga_views WHERE date(created_at) >= ? GROUP BY day ORDER BY day",
            (start_str,)
        )
        for row in cursor.fetchall():
            if row[0]:
                day_map[row[0]] = day_map.get(row[0], 0) + row[1]
        # Просмотры глав по дням
        cursor.execute(
            "SELECT date(created_at) as day, COUNT(*) as cnt FROM chapter_views WHERE date(created_at) >= ? GROUP BY day ORDER BY day",
            (start_str,)
        )
        for row in cursor.fetchall():
            if row[0]:
                day_map[row[0]] = day_map.get(row[0], 0) + row[1]
        conn.close()
    except Exception:
        pass
    # Заполняем все 30 дней (даже пустые)
    result = []
    for i in range(30):
        d = (start + timedelta(days=i)).strftime("%Y-%m-%d")
        result.append({"date": d, "visits": day_map.get(d, 0)})
    return result

@app.post("/admin/clear-cache", summary="Очистить кеш (админ)")
async def admin_clear_cache(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    if redis_client:
        redis_client.flushdb()
    import glob as _glob
    for f in _glob.glob(os.path.join(CACHE_DIR, "*")):
        try: os.remove(f)
        except: pass
    return {"ok": True, "redis": "flushed", "image_cache": "cleared"}

@app.get("/admin/cron/status", summary="Статус cron-задач (админ)")
async def admin_cron_status(current_user: User = Depends(get_current_user)):
    if current_user.role not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    from cron_tasks import cron_manager
    stats = cron_manager.get_stats()
    return {
        "status": stats['status'],
        "is_running": cron_manager.is_running,
        "last_run": stats['last_run'],
        "chapters_found": stats['chapters_found'],
        "errors": stats['errors']
    }

@app.post("/admin/cron/trigger", summary="Запустить проверку обновлений вручную (админ)")
async def admin_cron_trigger(current_user: User = Depends(get_current_user)):
    if current_user.role not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    from cron_tasks import cron_manager
    cron_manager.trigger_manual_update()
    log_admin_action(SessionLocal(), current_user, "ЗАПУСК ПАРСЕРА", "Ручной запуск проверки обновлений")
    return {"ok": True, "message": "Проверка обновлений запущена"}

@app.post("/admin/cron/start", summary="Запустить cron-задачи (админ)")
async def admin_cron_start(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    from cron_tasks import cron_manager
    cron_manager.start()
    return {"ok": True, "message": "Cron-задачи запущены"}

@app.post("/admin/cron/stop", summary="Остановить cron-задачи (админ)")
async def admin_cron_stop(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    from cron_tasks import cron_manager
    cron_manager.stop()
    return {"ok": True, "message": "Cron-задачи остановлены"}


# ─── Хелпер аудита ───
def log_admin_action(db: Session, admin: User, action: str, target: str = ""):
    entry = AuditLog(admin_id=admin.id, admin_username=admin.username, action=action, target=target)
    db.add(entry)
    db.commit()


# ─── Аудит-лог ───
@app.get("/admin/audit-log", summary="Лог действий админов")
async def admin_audit_log(limit: int = 200, offset: int = 0, target: str = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    q = db.query(AuditLog)
    if target:
        q = q.filter(AuditLog.target.contains(target))
    rows = q.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()
    return [{"id": r.id, "admin": r.admin_username, "action": r.action, "target": r.target, "timestamp": r.created_at.isoformat() if r.created_at else ""} for r in rows]


# ─── Транзакции скрапа ───
@app.get("/admin/transactions", summary="История транзакций скрапа")
async def admin_transactions(limit: int = 200, offset: int = 0, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    rows = db.query(ScrapTransaction).order_by(ScrapTransaction.created_at.desc()).offset(offset).limit(limit).all()
    return [{"id": r.id, "username": r.username, "amount": r.amount, "reason": r.reason, "created_at": r.created_at.isoformat() if r.created_at else ""} for r in rows]


# ─── Промокоды CRUD ───
@app.get("/admin/promocodes", summary="Список промокодов")
async def admin_get_promocodes(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    rows = db.query(Promocode).order_by(Promocode.created_at.desc()).all()
    return [{"id": r.id, "code": r.code, "discount_percent": r.discount_percent, "fixed_scrap": r.fixed_scrap, "expires_at": r.expires_at or "", "usage_limit": r.usage_limit, "usage_count": r.usage_count, "active": r.active} for r in rows]

@app.post("/admin/promocodes", summary="Создать промокод")
async def admin_create_promocode(data: PromocodeCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    existing = db.query(Promocode).filter(Promocode.code == data.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Промокод с таким кодом уже существует")
    promo = Promocode(code=data.code, discount_percent=data.discount_percent, fixed_scrap=data.fixed_scrap, expires_at=data.expires_at, usage_limit=data.usage_limit, active=data.active)
    db.add(promo)
    db.commit()
    db.refresh(promo)
    log_admin_action(db, current_user, "СОЗДАНИЕ ПРОМОКОДА", f"{data.code}")
    return {"ok": True, "id": promo.id}

@app.delete("/admin/promocodes/{promo_id}", summary="Удалить промокод")
async def admin_delete_promocode(promo_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    promo = db.query(Promocode).filter(Promocode.id == promo_id).first()
    if not promo:
        raise HTTPException(status_code=404, detail="Промокод не найден")
    code = promo.code
    db.delete(promo)
    db.commit()
    log_admin_action(db, current_user, "УДАЛЕНИЕ ПРОМОКОДА", code)
    return {"ok": True}


# ─── История входов ───
@app.get("/admin/logins", summary="История входов")
async def admin_logins(limit: int = 20, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    rows = db.query(LoginHistory).order_by(LoginHistory.created_at.desc()).limit(limit).all()
    return [{"id": r.id, "ip": r.ip, "username": r.username, "time": r.created_at.strftime("%Y-%m-%d %H:%M") if r.created_at else "", "status": r.status} for r in rows]


# ─── Жалобы ───
@app.post("/reports", summary="Отправить жалобу")
async def create_report(data: ReportCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    report = Report(user_id=current_user.id, user_email=current_user.email, manga_id=data.manga_id, manga_title=data.manga_title, reason=data.reason, message=data.message)
    db.add(report)
    db.commit()
    db.refresh(report)
    notify_telegram_event(db, "report", f"⚠️ <b>Новая жалоба</b>\nТайтл: {data.manga_title}\nПричина: {data.reason}\nОт: {current_user.email}")
    return {"ok": True, "id": report.id}

@app.get("/admin/reports", summary="Список жалоб (админ)")
async def admin_get_reports(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    rows = db.query(Report).order_by(Report.created_at.desc()).all()
    return [{"id": r.id, "mangaId": r.manga_id, "mangaTitle": r.manga_title, "reportedBy": r.user_email, "timestamp": r.created_at.isoformat() if r.created_at else "", "status": r.status, "reason": r.reason or "", "message": r.message or ""} for r in rows]

@app.put("/admin/reports/{report_id}/resolve", summary="Закрыть жалобу")
async def admin_resolve_report(report_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Жалоба не найдена")
    report.status = "resolved"
    db.commit()
    log_admin_action(db, current_user, "ЗАКРЫТИЕ ЖАЛОБЫ", f"#{report_id} на {report.manga_title}")
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
    action_map = {"banned": "БЛОКИРОВКА", "frozen": "ЗАМОРОЗКА", "active": "РАЗБЛОКИРОВКА"}
    action = action_map.get(data.status, f"СТАТУС → {data.status}")
    log_admin_action(db, current_user, action, f"{target.username} (id={target.id})")
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
    from fastapi.responses import JSONResponse as _JSONResponse
    response = _JSONResponse({"access_token": access_token, "token_type": "bearer"})
    response.set_cookie(
        key=auth.COOKIE_NAME, value=access_token,
        max_age=auth.COOKIE_MAX_AGE, httponly=True,
        secure=auth.COOKIE_SECURE, samesite="lax",
        path="/", domain=auth.COOKIE_DOMAIN,
    )
    return response

# --- Yandex OAuth ---
YANDEX_CLIENT_ID = os.environ.get("YANDEX_CLIENT_ID", "")
YANDEX_CLIENT_SECRET = os.environ.get("YANDEX_CLIENT_SECRET", "")
YANDEX_REDIRECT_URI = os.environ.get("YANDEX_REDIRECT_URI", "http://localhost:5173")
if YANDEX_CLIENT_ID.startswith("YOUR_"):
    YANDEX_CLIENT_ID = ""
if YANDEX_CLIENT_SECRET.startswith("YOUR_"):
    YANDEX_CLIENT_SECRET = ""

@app.get("/auth/yandex", summary="Yandex OAuth redirect")
async def yandex_auth():
    if not YANDEX_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Yandex OAuth не настроен")
    params = {
        "client_id": YANDEX_CLIENT_ID,
        "redirect_uri": YANDEX_REDIRECT_URI,
        "response_type": "code",
        "scope": "login:email login:info login:avatar",
    }
    from urllib.parse import urlencode
    url = f"https://oauth.yandex.ru/authorize?{urlencode(params)}"
    return RedirectResponse(url)

class YandexCodeRequest(BaseModel):
    code: str

@app.post("/auth/yandex/callback", summary="Yandex OAuth callback")
async def yandex_callback(data: YandexCodeRequest, db: Session = Depends(get_db)):
    if not YANDEX_CLIENT_ID or not YANDEX_CLIENT_SECRET:
        raise HTTPException(status_code=501, detail="Yandex OAuth не настроен")
    token_resp = requests.post("https://oauth.yandex.ru/token", data={
        "code": data.code,
        "client_id": YANDEX_CLIENT_ID,
        "client_secret": YANDEX_CLIENT_SECRET,
        "redirect_uri": YANDEX_REDIRECT_URI,
        "grant_type": "authorization_code",
    })
    if token_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Ошибка получения токена Яндекс")
    token_data = token_resp.json()
    userinfo_resp = requests.get("https://login.yandex.ru/info", headers={
        "Authorization": f"OAuth {token_data['access_token']}"
    })
    if userinfo_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Ошибка получения данных пользователя Яндекс")
    yandex_user = userinfo_resp.json()
    yandex_id = str(yandex_user.get("id", ""))
    email = yandex_user.get("default_email", "") or (yandex_user.get("emails", [""])[0] if yandex_user.get("emails") else "")
    login_name = yandex_user.get("login", "")
    first_name = yandex_user.get("first_name", "")
    last_name = yandex_user.get("last_name", "")
    if first_name or last_name:
        name = f"{first_name} {last_name}".strip()
    elif login_name:
        name = login_name
    else:
        name = email.split("@")[0] if email else f"yandex_{yandex_id}"
    avatar_id = yandex_user.get("default_avatar_id", "")
    picture = ""
    if avatar_id and not yandex_user.get("is_avatar_empty", True):
        picture = f"https://avatars.yandex.net/get-yapic/{avatar_id}/islands-200"
    user = db.query(User).filter(User.yandex_id == yandex_id).first()
    if not user:
        user = db.query(User).filter(User.email == email).first() if email else None
    if user:
        if not user.yandex_id:
            user.yandex_id = yandex_id
        if picture and not user.avatar_url:
            user.avatar_url = picture
        db.commit()
    else:
        user = User(
            username=name,
            email=email or f"yandex_{yandex_id}@yandex.placeholder",
            hashed_password="",
            yandex_id=yandex_id,
            avatar_url=picture,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    from fastapi.responses import JSONResponse as _JSONResponse
    response = _JSONResponse({"access_token": access_token, "token_type": "bearer"})
    response.set_cookie(
        key=auth.COOKIE_NAME, value=access_token,
        max_age=auth.COOKIE_MAX_AGE, httponly=True,
        secure=auth.COOKIE_SECURE, samesite="lax",
        path="/", domain=auth.COOKIE_DOMAIN,
    )
    return response
import hmac as _hmac
import hashlib as _hashlib


def _get_bot_token() -> str:
    env_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if env_token:
        return env_token
    return get_setting_value("telegram_bot_token", "")


def _verify_telegram_hash(auth_data: dict, bot_token: str) -> bool:
    check_hash = auth_data.get("hash", "")
    if not check_hash:
        return False
    data_check = []
    for key in sorted(auth_data.keys()):
        if key == "hash":
            continue
        val = auth_data[key]
        if isinstance(val, bool):
            val = str(val).lower()
        data_check.append(f"{key}={val}")
    data_check_string = "\n".join(data_check)
    secret_key = _hashlib.sha256(bot_token.encode()).digest()
    computed = _hmac.new(secret_key, data_check_string.encode(), _hashlib.sha256).hexdigest()
    return _hmac.compare_digest(computed, check_hash)


@app.get("/auth/telegram/info", summary="Инфо о TG боте для Login Widget")
async def telegram_bot_info():
    token = _get_bot_token()
    if not token:
        return {"configured": False, "bot_id": "", "bot_username": ""}
    try:
        resp = requests.get(f"https://api.telegram.org/bot{token}/getMe", timeout=5)
        if resp.ok:
            r = resp.json().get("result", {})
            return {"configured": True, "bot_id": str(r.get("id", "")), "bot_username": r.get("username", "")}
    except:
        pass
    bot_id = token.split(":")[0] if ":" in token else ""
    return {"configured": bool(bot_id), "bot_id": bot_id, "bot_username": ""}


@app.post("/auth/telegram/callback", summary="Telegram Login Widget — верификация и вход")
async def telegram_auth_callback(data: dict = Body(...), db: Session = Depends(get_db)):
    bot_token = _get_bot_token()
    if not bot_token:
        raise HTTPException(status_code=501, detail="Telegram Login не настроен")
    if not _verify_telegram_hash(data, bot_token):
        raise HTTPException(status_code=401, detail="Неверная подпись Telegram")
    auth_date = data.get("auth_date", 0)
    try:
        if time() - int(auth_date) > 86400:
            raise HTTPException(status_code=401, detail="Сессия Telegram истекла")
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Некорректная дата авторизации")
    tg_id = str(data.get("id", ""))
    tg_username = data.get("username", "")
    tg_first = data.get("first_name", "")
    tg_last = data.get("last_name", "")
    tg_photo = data.get("photo_url", "")
    if not tg_id:
        raise HTTPException(status_code=400, detail="Нет Telegram ID")
    user = db.query(User).filter(User.telegram_id == tg_id).first()
    if user:
        if user.status == "banned":
            raise HTTPException(status_code=403, detail="Аккаунт заблокирован")
        if user.status == "frozen":
            raise HTTPException(status_code=403, detail="Аккаунт заморожен")
        if tg_username and user.telegram_username != tg_username:
            user.telegram_username = tg_username
        if tg_photo and not user.avatar_url:
            user.avatar_url = tg_photo
        user.last_seen = datetime.utcnow()
        db.commit()
    else:
        name = tg_username or f"{tg_first} {tg_last}".strip() or f"User{tg_id}"
        email = f"tg_{tg_id}@telegram.springmanga"
        user = User(
            username=name,
            email=email,
            hashed_password="",
            telegram_id=tg_id,
            telegram_username=tg_username,
            avatar_url=tg_photo or "",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    from fastapi.responses import JSONResponse as _JSONResponse
    response = _JSONResponse({"access_token": access_token, "token_type": "bearer"})
    response.set_cookie(
        key=auth.COOKIE_NAME, value=access_token,
        max_age=auth.COOKIE_MAX_AGE, httponly=True,
        secure=auth.COOKIE_SECURE, samesite="lax",
        path="/", domain=auth.COOKIE_DOMAIN,
    )
    return response


@app.post("/auth/telegram/link", summary="Привязать Telegram к текущему аккаунту")
async def telegram_link_account(data: dict = Body(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    bot_token = _get_bot_token()
    if not bot_token:
        raise HTTPException(status_code=501, detail="Telegram Login не настроен")
    if not _verify_telegram_hash(data, bot_token):
        raise HTTPException(status_code=401, detail="Неверная подпись Telegram")
    tg_id = str(data.get("id", ""))
    tg_username = data.get("username", "")
    tg_photo = data.get("photo_url", "")
    if not tg_id:
        raise HTTPException(status_code=400, detail="Нет Telegram ID")
    existing = db.query(User).filter(User.telegram_id == tg_id, User.id != current_user.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Этот Telegram уже привязан к другому аккаунту")
    current_user.telegram_id = tg_id
    current_user.telegram_username = tg_username
    if tg_photo and not current_user.avatar_url:
        current_user.avatar_url = tg_photo
    db.commit()
    return {"ok": True, "telegram_username": tg_username}


@app.post("/auth/telegram/unlink", summary="Отвязать Telegram от аккаунта")
async def telegram_unlink_account(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.telegram_id and not current_user.google_id and not current_user.yandex_id and not current_user.hashed_password:
        raise HTTPException(status_code=400, detail="Нельзя отвязать единственный способ входа")
    current_user.telegram_id = ""
    current_user.telegram_username = ""
    db.commit()
    return {"ok": True}


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
    _item = resolve_manga(db, manga_id)
    if _item: manga_id = _item.manga_id
    if get_setting_value("allow_ratings", "true") != "true":
        raise HTTPException(status_code=403, detail="Оценки временно отключены")
    existing = db.query(MangaRating).filter(
        MangaRating.manga_id == manga_id,
        MangaRating.user_id == current_user.id
    ).first()
    scrap_earned = 0
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
    return {"status": "ok", "average": round(avg, 2), "total": len(all_ratings), "distribution": distribution, "scrap_earned": scrap_earned}

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
    _item = resolve_manga(db, manga_id)
    if _item: manga_id = _item.manga_id
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
    _item = resolve_manga(db, manga_id)
    if _item: manga_id = _item.manga_id
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
async def get_quiz_question(mode: str = Query("cover", pattern="^(cover|genre|character)$"), db: Session = Depends(get_db)):
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
            "status": getattr(c, 'status', 'approved'),
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
    current_user: User = Depends(get_optional_user),
):
    _item = resolve_manga(db, manga_id)
    if _item: manga_id = _item.manga_id
    q = db.query(MangaComment).filter(MangaComment.manga_id == manga_id)
    if current_user and current_user.role in ("admin", "moderator"):
        pass
    else:
        q = q.filter(MangaComment.status == "approved")
    if chapter_id:
        q = q.filter(MangaComment.chapter_id == chapter_id)
    else:
        q = q.filter(MangaComment.chapter_id == None)
    comments = q.order_by(MangaComment.created_at.asc()).all()

    comment_ids = [c.id for c in comments]
    likes = db.query(CommentLike).filter(CommentLike.comment_id.in_(comment_ids)).all() if comment_ids else []
    likes_map = {}
    for lk in likes:
        u = db.query(User).filter(User.id == lk.user_id).first()
        if u:
            likes_map.setdefault(lk.comment_id, []).append(u.email)

    tree = _build_comment_tree(comments, likes_map, current_user_id=current_user.id if current_user else None, db=db)
    if current_user and current_user.role in ("admin", "moderator"):
        pending_count = db.query(MangaComment).filter(MangaComment.manga_id == manga_id, MangaComment.status == "pending").count()
        tree = {"comments": tree if isinstance(tree, list) else tree, "pending_count": pending_count}
    return tree


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
    _item = resolve_manga(db, manga_id)
    if _item: manga_id = _item.manga_id
    if current_user.status == "frozen":
        raise HTTPException(status_code=403, detail="Аккаунт заморожен")
    if current_user.muted_until and current_user.muted_until > datetime.utcnow():
        remaining = current_user.muted_until - datetime.utcnow()
        days = remaining.days
        hours = remaining.seconds // 3600
        raise HTTPException(status_code=403, detail=f"Вы замьючены. Мут снимется через {days}д {hours}ч")
    if get_setting_value("allow_comments", "true") != "true":
        raise HTTPException(status_code=403, detail="Комментарии временно отключены")
    if not data.text.strip():
        raise HTTPException(status_code=400, detail="Текст не может быть пустым")

    if get_setting_value("spam_filter", "true") == "true":
        if len(data.text.strip()) < 2:
            raise HTTPException(status_code=400, detail="Комментарий слишком короткий")

    bw_result = check_comment(data.text, extra_banned=[w.strip().lower() for w in get_setting_value("banned_words", "").split(",") if w.strip()], word_overrides={
        "badwords_shadow": get_setting_value("badwords_shadow", ""),
        "badwords_warn_links": get_setting_value("badwords_warn_links", ""),
        "badwords_warn_scam": get_setting_value("badwords_warn_scam", ""),
        "badwords_freeze": get_setting_value("badwords_freeze", ""),
    })
    if bw_result:
        severity = bw_result['severity']
        if severity == 'freeze':
            current_user.status = "frozen"
            current_user.warnings_count = (current_user.warnings_count or 0) + 1
            current_user.warning_shown_at = datetime.utcnow()
            log_admin_action(db, None, "АВТО-ЗАМОРОЗКА", f"{current_user.username}: {bw_result['reason']} ({bw_result['matched']})")
            db.commit()
            raise HTTPException(status_code=403, detail="Аккаунт заморожен за нарушение правил")
        elif severity == 'warn':
            current_user.warnings_count = (current_user.warnings_count or 0) + 1
            current_user.warning_shown_at = datetime.utcnow()
            if current_user.warnings_count >= 3:
                current_user.status = "banned"
                log_admin_action(db, None, "АВТО-БАН", f"{current_user.username}: {current_user.warnings_count} предупреждений")
                db.commit()
                raise HTTPException(status_code=403, detail="Аккаунт заблокирован")
            log_admin_action(db, None, "ПРЕДУПРЕЖДЕНИЕ", f"{current_user.username}: {bw_result['reason']} ({bw_result['matched']})")
            db.commit()
            raise HTTPException(status_code=400, detail=f"Комментарий отклонён: {bw_result['reason']} (предупреждение {current_user.warnings_count}/3)")
        elif severity == 'shadow':
            data.text = shadow_replace(data.text, word_overrides={
                "badwords_shadow": get_setting_value("badwords_shadow", ""),
            })

    if data.parent_id:
        parent = db.query(MangaComment).filter(MangaComment.id == data.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Родительский комментарий не найден")

    is_admin_or_mod = current_user.role in ("admin", "moderator")
    pre_moderation = get_setting_value("pre_moderation", "false") == "true"
    comment_status = "approved" if (is_admin_or_mod or not pre_moderation) else "pending"

    comment = MangaComment(
        manga_id=manga_id,
        chapter_id=data.chapter_id,
        parent_id=data.parent_id,
        user_id=current_user.id,
        text=data.text.strip(),
        status=comment_status,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    if data.parent_id and comment_status == "approved":
        parent = db.query(MangaComment).filter(MangaComment.id == data.parent_id).first()
        if parent and parent.user_id != current_user.id:
            notif_msg = f'<a href="/user/{current_user.id}" class="text-brand-accent hover:underline font-bold">{current_user.username}</a> ответил на ваш <a href="/manga/{manga_id}" class="text-brand-accent hover:underline">комментарий</a>'
            create_notification(db, parent.user_id, notif_msg, f"/manga/{manga_id}", "social")

    from datetime import date as _date
    today = _date.today()
    scrap_earned = 0
    if comment_status == "approved":
        if current_user.scrap_comments_date is None or current_user.scrap_comments_date != today:
            current_user.scrap_comments_today = 0
            current_user.scrap_comments_date = today
        if (current_user.scrap_comments_today or 0) < 5:
            scrap_earned = int(10 * (1.5 if is_springpro_active(current_user) else 1.0))
            current_user.scrap = (current_user.scrap or 0) + scrap_earned
            current_user.scrap_comments_today = (current_user.scrap_comments_today or 0) + 1
            db.commit()

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
        "status": comment.status,
        "scrap_earned": scrap_earned,
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


class ReportCreate(BaseModel):
    reason: str = "spam"
    message: str = ""


AUTO_VERIFIABLE_REASONS = {"profanity", "ads", "spam"}


@app.post("/manga/comments/{comment_id}/report", summary="Пожаловаться на комментарий")
async def report_comment(
    comment_id: int,
    data: ReportCreate = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data is None:
        data = ReportCreate()
    comment = db.query(MangaComment).filter(MangaComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Комментарий не найден")
    if comment.status in ("rejected", "under_review"):
        raise HTTPException(status_code=400, detail="Комментарий уже на рассмотрении")
    existing = db.query(CommentReport).filter(
        CommentReport.comment_id == comment_id,
        CommentReport.reporter_id == current_user.id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Вы уже пожаловались на этот комментарий")
    db.add(CommentReport(comment_id=comment_id, reporter_id=current_user.id, reason=data.reason))
    db.commit()

    report_count = db.query(CommentReport).filter(CommentReport.comment_id == comment_id).count()
    auto_threshold = int(get_setting_value("auto_ban_after_reports", "3") or "3")
    if auto_threshold == 0 or report_count < auto_threshold:
        return {"status": "reported", "report_count": report_count, "comment_deleted": False, "under_review": False}

    author = db.query(User).filter(User.id == comment.user_id).first()
    if not author or author.role in ("admin", "moderator"):
        return {"status": "reported", "report_count": report_count, "comment_deleted": False, "under_review": False}

    manga = db.query(MangaItem).filter(MangaItem.manga_id == comment.manga_id).first()
    manga_title = manga.title if manga else comment.manga_id
    reason_labels = {
        "profanity": "Маты", "illegal": "Нарушение законов РФ",
        "suicide": "Призыв к суициду", "ads": "Реклама",
        "spam": "Спам", "spoiler": "Спойлер",
    }
    reason_text = reason_labels.get(data.reason, data.reason)

    auto_verified = False
    if data.reason in AUTO_VERIFIABLE_REASONS:
        from badword_filter import check_comment
        bw = check_comment(comment.text, word_overrides={
            "badwords_shadow": get_setting_value("badwords_shadow", ""),
            "badwords_warn_links": get_setting_value("badwords_warn_links", ""),
            "badwords_warn_scam": get_setting_value("badwords_warn_scam", ""),
            "badwords_freeze": get_setting_value("badwords_freeze", ""),
        })
        if data.reason == "profanity" and bw and bw.get('severity') == 'shadow':
            auto_verified = True
        elif data.reason in ("ads", "spam") and bw and bw.get('severity') in ('warn', 'freeze'):
            auto_verified = True

    if auto_verified:
        db.query(CommentLike).filter(CommentLike.comment_id == comment_id).delete()
        def _del_children(pid):
            for ch in db.query(MangaComment).filter(MangaComment.parent_id == pid).all():
                db.query(CommentLike).filter(CommentLike.comment_id == ch.id).delete()
                _del_children(ch.id)
                db.delete(ch)
        _del_children(comment_id)
        db.delete(comment)

        apply_mute(author, db, reason_text, manga_title, comment.text, comment.manga_id)
        db.commit()
        return {"status": "reported", "report_count": report_count, "comment_deleted": True, "under_review": False}
    else:
        comment.status = "under_review"
        db.commit()
        return {"status": "reported", "report_count": report_count, "comment_deleted": False, "under_review": True}


@app.put("/admin/comments/{comment_id}/moderate", summary="Модерация комментария")
async def moderate_comment(
    comment_id: int,
    action: str = Query(..., description="approve или reject"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Нет прав")
    comment = db.query(MangaComment).filter(MangaComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Комментарий не найден")
    if action == "approve":
        comment.status = "approved"
    elif action == "reject":
        comment.status = "rejected"
    else:
        raise HTTPException(status_code=400, detail="Действие: approve или reject")
    db.commit()
    return {"ok": True, "status": comment.status}


@app.get("/admin/comments/pending", summary="Комментарии, ожидающие модерации")
async def get_pending_comments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Нет прав")
    comments = db.query(MangaComment).filter(MangaComment.status == "pending").order_by(MangaComment.created_at.desc()).limit(100).all()
    result = []
    for c in comments:
        u = db.query(User).filter(User.id == c.user_id).first()
        manga = db.query(MangaItem).filter(MangaItem.manga_id == c.manga_id).first()
        result.append({
            "id": c.id,
            "text": c.text,
            "status": c.status,
            "manga_id": c.manga_id,
            "manga_title": manga.title if manga else c.manga_id,
            "user_id": c.user_id,
            "username": u.username if u else "Удалён",
            "created_at": c.created_at.strftime("%d.%m.%Y %H:%M") if c.created_at else "",
        })
    return result


@app.get("/admin/comments/reports", summary="Жалобы на модерации")
async def get_reported_comments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Нет прав")
    comments = db.query(MangaComment).filter(MangaComment.status == "under_review").order_by(MangaComment.created_at.desc()).limit(100).all()
    result = []
    for c in comments:
        u = db.query(User).filter(User.id == c.user_id).first()
        manga = db.query(MangaItem).filter(MangaItem.manga_id == c.manga_id).first()
        reports = db.query(CommentReport).filter(CommentReport.comment_id == c.id).all()
        report_reasons = [r.reason for r in reports]
        reason_labels = {
            "profanity": "Маты", "illegal": "Нарушение законов РФ",
            "suicide": "Призыв к суициду", "ads": "Реклама",
            "spam": "Спам", "spoiler": "Спойлер",
        }
        result.append({
            "id": c.id,
            "text": c.text,
            "status": c.status,
            "manga_id": c.manga_id,
            "manga_title": manga.title if manga else c.manga_id,
            "user_id": c.user_id,
            "username": u.username if u else "Удалён",
            "warnings_count": u.warnings_count if u else 0,
            "report_count": len(reports),
            "report_reasons": [reason_labels.get(r, r) for r in report_reasons],
            "created_at": c.created_at.strftime("%d.%m.%Y %H:%M") if c.created_at else "",
        })
    return result


@app.put("/admin/comments/{comment_id}/review", summary="Рассмотреть жалобу (админ)")
async def review_reported_comment(
    comment_id: int,
    action: str = Query(..., description="approve — отклонить жалобу, reject — удалить коммент + предупредить"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Нет прав")
    comment = db.query(MangaComment).filter(MangaComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Комментарий не найден")

    if action == "approve":
        comment.status = "approved"
        db.query(CommentReport).filter(CommentReport.comment_id == comment_id).delete()
        log_admin_action(db, current_user, "ЖАЛОБА ОТКЛОНЕНА", f"Комментарий #{comment_id} восстановлен")
        db.commit()
        return {"ok": True, "action": "approved"}

    elif action == "reject":
        reports = db.query(CommentReport).filter(CommentReport.comment_id == comment_id).all()
        report_reasons = [r.reason for r in reports]
        reason_labels = {
            "profanity": "Маты", "illegal": "Нарушение законов РФ",
            "suicide": "Призыв к суициду", "ads": "Реклама",
            "spam": "Спам", "spoiler": "Спойлер",
        }
        reason_text = ", ".join(set(reason_labels.get(r, r) for r in report_reasons))

        author = db.query(User).filter(User.id == comment.user_id).first()
        manga = db.query(MangaItem).filter(MangaItem.manga_id == comment.manga_id).first()
        manga_title = manga.title if manga else comment.manga_id

        db.query(CommentLike).filter(CommentLike.comment_id == comment_id).delete()
        def _del_children(pid):
            for ch in db.query(MangaComment).filter(MangaComment.parent_id == pid).all():
                db.query(CommentLike).filter(CommentLike.comment_id == ch.id).delete()
                _del_children(ch.id)
                db.delete(ch)
        _del_children(comment_id)
        db.delete(comment)
        db.query(CommentReport).filter(CommentReport.comment_id == comment_id).delete()

        if author and author.role not in ("admin", "moderator"):
            apply_mute(author, db, reason_text, manga_title, comment.text, comment.manga_id, current_user)

        db.commit()
        return {"ok": True, "action": "rejected"}

    raise HTTPException(status_code=400, detail="Действие: approve или reject")
async def warn_user(
    user_id: int,
    reason: str = Query("", description="Причина предупреждения"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Нет прав")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if target.role in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Нельзя предупредить админа/модератора")
    target.warnings_count = (target.warnings_count or 0) + 1
    target.warning_shown_at = datetime.utcnow()
    db.add(UserWarning(user_id=user_id, admin_id=current_user.id, reason=reason))

    stages_raw = get_setting_value("mute_stages", "1,7,30,0")
    stages = [int(s.strip()) for s in stages_raw.split(",") if s.strip()]
    stage_idx = min(target.warnings_count - 1, len(stages) - 1)
    mute_days = stages[stage_idx] if stage_idx < len(stages) else 0
    if mute_days == 0:
        from datetime import timedelta as _td
        target.muted_until = datetime(2099, 1, 1)
        mute_label = "вечный мут"
    else:
        from datetime import timedelta as _td
        target.muted_until = datetime.utcnow() + _td(days=mute_days)
        mute_label = f"мут на {mute_days} дн."
    log_admin_action(db, current_user, f"МУТ {mute_label}", f"{target.username}: {target.warnings_count}/{len(stages)} (причина: {reason})")
    db.commit()
    return {"ok": True, "warnings": target.warnings_count, "mute_label": mute_label}


@app.put("/admin/users/{user_id}/freeze", summary="Заморозить/разморозить аккаунт")
async def freeze_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Только админ")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if target.status == "frozen":
        target.status = "active"
        log_admin_action(db, current_user, "РАЗМОРОЗКА", target.username)
    else:
        target.status = "frozen"
        log_admin_action(db, current_user, "ЗАМОРОЗКА", target.username)
    db.commit()
    return {"ok": True, "status": target.status}


@app.get("/auth/warning", summary="Получить активное предупреждение")
async def get_active_warning(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.warning_shown_at:
        return {"active": False}
    elapsed = (datetime.utcnow() - current_user.warning_shown_at).total_seconds()
    if elapsed < 300:
        latest = db.query(UserWarning).filter(UserWarning.user_id == current_user.id).order_by(UserWarning.created_at.desc()).first()
        return {
            "active": True,
            "reason": latest.reason if latest else "Нарушение правил сообщества",
            "warnings_count": current_user.warnings_count,
            "dismiss_after": int(300 - elapsed),
        }
    return {"active": False}


@app.post("/auth/warning/dismiss", summary="Скрыть предупреждение")
async def dismiss_warning(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user.warning_shown_at = None
    db.commit()
    return {"ok": True}


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
        return {"status": "updated", "scrap_earned": 0}
    entry = ReadingHistory(
        user_id=current_user.id,
        manga_id=data.manga_id,
        chapter_id=data.chapter_id
    )
    db.add(entry)
    db.commit()

    # ── Scrap for every 5th chapter ──
    scrap_earned = 0
    total_chapters = db.query(ReadingHistory).filter(ReadingHistory.user_id == current_user.id).count()
    if total_chapters % 5 == 0:
        scrap_earned = 5
        current_user.scrap = (current_user.scrap or 0) + scrap_earned
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

    return {"status": "created", "card_dropped": card_dropped, "scrap_earned": scrap_earned}

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
            async with _chapter_session.get(f"{BASE_URL}/login", proxy=MANGABUFF_PROXY) as resp:
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
                    proxy=MANGABUFF_PROXY,
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
                async with session.get(catalog_page_url, proxy=MANGABUFF_PROXY) as resp:
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

        total_found = len(all_items)

        # Фильтруем: оставляем только те, которых ещё нет в БД
        existing_ids = set(
            mid for (mid,) in db.query(MangaItem.manga_id).all()
        )
        new_items = []
        skipped = 0
        for slug, name in all_items:
            manga_page_url = f"{BASE_URL}/manga/{slug}"
            manga_id = hashlib.md5(manga_page_url.encode()).hexdigest()
            if manga_id in existing_ids:
                skipped += 1
            else:
                new_items.append((slug, name))
        all_items = new_items
        total = len(all_items)
        print(f"[CATALOG] Found {total_found} on mangabuff, {skipped} already in DB, {total} new to import")

        # 2. Для каждого slug парсим страницу манги
        async def fetch_and_save(slug: str, name: str):
            nonlocal imported, errors
            manga_page_url = f"{BASE_URL}/manga/{slug}"
            source_url = manga_page_url
            manga_id = hashlib.md5(source_url.encode()).hexdigest()

            try:
                async with sem:
                    async with session.get(manga_page_url, proxy=MANGABUFF_PROXY) as resp:
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
                    if not existing.slug and title:
                        new_slug = generate_slug(title)
                        if new_slug and not db.query(MangaItem).filter(MangaItem.slug == new_slug, MangaItem.manga_id != manga_id).first():
                            existing.slug = new_slug
                else:
                    # Новый тайтл — скачиваем обложку
                    local_cover_url = cover
                    if cover and not cover.startswith("data:"):
                        covers_dir = os.path.join(MANGA_DIR, manga_id, "covers")
                        os.makedirs(covers_dir, exist_ok=True)
                        cover_path = os.path.join(covers_dir, "main_cover.jpg")
                        try:
                            async with sem:
                                async with session.get(cover, headers={**HEADERS, "Referer": BASE_URL}, proxy=MANGABUFF_PROXY) as r:
                                    if r.status == 200:
                                        content = await r.read()
                                        async with aiofiles.open(cover_path, 'wb') as f:
                                            await f.write(content)
                                        relative = os.path.relpath(cover_path, MANGA_DIR).replace("\\", "/")
                                        local_cover_url = f"/static/{relative}"
                                        print(f"[CATALOG] Обложка сохранена: {slug}")
                        except Exception as e:
                            print(f"[CATALOG] Не удалось скачать обложку {slug}: {e}")
                    new_slug = generate_slug(title)
                    if not new_slug:
                        new_slug = manga_id[:16]
                    # Check uniqueness
                    if db.query(MangaItem).filter(MangaItem.slug == new_slug).first():
                        new_slug = f"{new_slug}-{manga_id[:8]}"
                    db.add(MangaItem(
                        manga_id=manga_id,
                        slug=new_slug,
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
                _fts_conn = sqlite3.connect(DB_PATH)
                _fts_conn.execute("INSERT INTO manga_fts(rowid, title) VALUES(?, ?)", (db.query(MangaItem).filter(MangaItem.manga_id == manga_id).first().id, title))
                _fts_conn.commit()
                _fts_conn.close()
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


async def background_chapter_crawler(force: bool = False, update: bool = False):
    """Фоновый краулер: берёт манги без глав (или все при force/update) и загружает их с mangabuff.
    force=True: удаляет старые главы и парсит заново.
    update=True: проходит ВСЕ тайтлы, но НЕ удаляет старые главы — только добавляет новые.
    """
    global crawler_status
    crawler_status = {"running": True, "processed": 0, "total": 0, "current_title": "", "errors": 0}

    db = SessionLocal()
    try:
        from sqlalchemy import func
        if force or update:
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
                async with session.get(BASE_URL, proxy=MANGABUFF_PROXY) as resp:
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
                            async with session.get(manga_page_url, proxy=MANGABUFF_PROXY) as resp:
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
                                    proxy=MANGABUFF_PROXY,
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
                        if force and not update:
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
        processed = crawler_status['processed']
        errors = crawler_status['errors']
        try:
            notify_telegram_event(db, "new_chapter", f"📦 <b>Краулер завершён</b>\nОбработано: {processed}\nОшибок: {errors}")
        except Exception:
            pass
        db.close()
        crawler_status["running"] = False
        crawler_status["current_title"] = ""
        print(f"[CRAWLER] Done. Processed: {processed}, Errors: {errors}")


@app.post("/catalog/crawl-chapters", summary="Запустить фоновый краулер глав")
async def start_chapter_crawler(
    force: bool = Query(False, description="Перепарсить ВСЕ манги, УДАЛИВ старые главы"),
    update: bool = Query(False, description="Проверить ВСЕ манги и добавить только НОВЫЕ главы (без удаления)")
):
    global crawler_status
    if crawler_status.get("running"):
        return {"status": "already_running", **crawler_status}
    asyncio.create_task(background_chapter_crawler(force=force, update=update))
    return {"status": "started", "force": force, "update": update}


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

        async with session.get(manga_page_url, proxy=MANGABUFF_PROXY) as resp:
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
                        proxy=MANGABUFF_PROXY,
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

        # Upsert chapters (add new, update existing — no delete)
        new_count = upsert_chapters(db, manga_id, formatted)
        db.commit()

    return {
        "status": "ok",
        "manga_id": manga_id,
        "year": year,
        "chapters_count": len(formatted),
        "new_chapters": new_count,
    }


@app.get("/catalog/crawler-status", summary="Статус краулера глав")
async def get_crawler_status():
    return crawler_status


@app.get("/catalog/chapter-pages/{chapter_slug:path}", summary="Lazy-load страниц главы по slug")
async def get_chapter_pages(chapter_slug: str, manga_id: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """Подгружает страницы главы через HTML-парсинг mangabuff, кеширует в БД."""
    # Resolve slug to real manga_id if needed
    if manga_id:
        resolved = resolve_manga(db, manga_id)
        if resolved:
            manga_id = resolved.manga_id
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
            async with session.get(chapter_url, proxy=MANGABUFF_PROXY) as resp:
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
                launch_opts = {"headless": True}
                if MANGABUFF_PROXY:
                    # Parse proxy URL for Playwright format
                    from urllib.parse import urlparse as _urlparse
                    _pp = _urlparse(MANGABUFF_PROXY)
                    launch_opts["proxy"] = {"server": f"{_pp.scheme}://{_pp.hostname}:{_pp.port}"}
                    if _pp.username:
                        launch_opts["proxy"]["username"] = _pp.username
                    if _pp.password:
                        launch_opts["proxy"]["password"] = _pp.password
                browser = await pw.chromium.launch(**launch_opts)
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
                async with session.get(first_url, headers={"User-Agent": "Mozilla/5.0"}, proxy=MANGABUFF_PROXY) as resp:
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
                            async with session.get(page_url, headers={"User-Agent": "Mozilla/5.0"}, proxy=MANGABUFF_PROXY) as resp:
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
                async with session.get(f"{BASE_URL}/login", proxy=MANGABUFF_PROXY) as resp:
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
                }, proxy=MANGABUFF_PROXY) as resp:
                    body = await resp.json()
                    print(f"[SCRAPE-VIEWS] Login: {body}")
            except Exception as e:
                print(f"[SCRAPE-VIEWS] Login error: {e}")

        async def fetch_one(session, manga_id, source_url, title):
            try:
                async with session.get(source_url, headers={"User-Agent": "Mozilla/5.0"}, proxy=MANGABUFF_PROXY) as resp:
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
    if redis_client:
        cached = redis_client.get("home_sections")
        if cached:
            return json.loads(cached)
    try:
        return await _get_home_sections_inner(db)
    except Exception as e:
        print(f"[HOME_SECTIONS] Fatal error: {e}")
        raise

async def _get_home_sections_inner(db: Session):
    from sqlalchemy import func as sa_fn, desc as sa_desc, case as sa_case
    from collections import defaultdict

    now = datetime.utcnow()
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)
    forty_eight_hours_ago = now - timedelta(hours=48)
    twenty_four_hours_ago = now - timedelta(hours=24)

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
    # Локальные просмотры (all-time)
    real_views_map = dict(
        db.query(MangaView.manga_id, sa_fn.count(MangaView.id))
        .group_by(MangaView.manga_id)
        .all()
    )

    def build_section_from_items(items, limit=10):
        result = []
        for item in items[:limit]:
            avg_user = user_ratings_agg.get(item.manga_id)
            user_avg = round(float(avg_user), 2) if avg_user else None
            user_total = user_ratings_count.get(item.manga_id, 0)
            result.append({
                "manga_id": item.manga_id,
                "slug": item.slug or item.manga_id,
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

    def build_section(query, limit=10):
        return build_section_from_items(query.limit(limit).all(), limit)

    # === Subqueries для локальных метрик ===

    # Просмотры за 7 дней
    views_7d_sq = db.query(
        MangaView.manga_id, sa_fn.count(MangaView.id).label("v7")
    ).filter(MangaView.created_at >= seven_days_ago).group_by(MangaView.manga_id).subquery()

    # Закладки за 7 дней
    bookmarks_7d_sq = db.query(
        MangaBookmark.manga_id, sa_fn.count(MangaBookmark.id).label("b7")
    ).filter(MangaBookmark.created_at >= seven_days_ago).group_by(MangaBookmark.manga_id).subquery()

    # All-time просмотры (для горячих новинок)
    views_all_sq = db.query(
        MangaView.manga_id, sa_fn.count(MangaView.id).label("v_all")
    ).group_by(MangaView.manga_id).subquery()

    # Рейтинг с порогом >= 20 голосов
    rating_sq = db.query(
        MangaRating.manga_id,
        sa_fn.avg(MangaRating.rating).label("avg_r"),
        sa_fn.count(MangaRating.id).label("r_cnt")
    ).group_by(MangaRating.manga_id).having(sa_fn.count(MangaRating.id) >= 20).subquery()

    # Просмотры за 48 часов (для "В тренде")
    views_48h_sq = db.query(
        MangaView.manga_id, sa_fn.count(MangaView.id).label("v48")
    ).filter(MangaView.created_at >= forty_eight_hours_ago).group_by(MangaView.manga_id).subquery()

    # Закладки за 48 часов
    bookmarks_48h_sq = db.query(
        MangaBookmark.manga_id, sa_fn.count(MangaBookmark.id).label("b48")
    ).filter(MangaBookmark.created_at >= forty_eight_hours_ago).group_by(MangaBookmark.manga_id).subquery()

    # Просмотры за 24 часа (для "Популярно сегодня")
    views_24h_sq = db.query(
        MangaView.manga_id, sa_fn.count(MangaView.id).label("v24")
    ).filter(MangaView.created_at >= twenty_four_hours_ago).group_by(MangaView.manga_id).subquery()

    # Закладки за 24 часа
    bookmarks_24h_sq = db.query(
        MangaBookmark.manga_id, sa_fn.count(MangaBookmark.id).label("b24")
    ).filter(MangaBookmark.created_at >= twenty_four_hours_ago).group_by(MangaBookmark.manga_id).subquery()

    # --- "Горячие новинки": добавлены за 7 дней, по скачку интереса (7d views + bookmarks) ---
    hot_new_items = db.query(MangaItem).outerjoin(
        views_7d_sq, MangaItem.manga_id == views_7d_sq.c.manga_id
    ).outerjoin(
        bookmarks_7d_sq, MangaItem.manga_id == bookmarks_7d_sq.c.manga_id
    ).filter(
        MangaItem.created_at >= seven_days_ago
    ).order_by(
        (sa_fn.coalesce(views_7d_sq.c.v7, 0) + sa_fn.coalesce(bookmarks_7d_sq.c.b7, 0)).desc()
    ).limit(10).all()

    # --- "Популярное": активность за 7 дней (просмотры + закладки) ---
    popular_q = db.query(MangaItem).outerjoin(
        views_7d_sq, MangaItem.manga_id == views_7d_sq.c.manga_id
    ).outerjoin(
        bookmarks_7d_sq, MangaItem.manga_id == bookmarks_7d_sq.c.manga_id
    ).order_by(
        (sa_fn.coalesce(views_7d_sq.c.v7, 0) + sa_fn.coalesce(bookmarks_7d_sq.c.b7, 0)).desc()
    )

    # --- "Топ по рейтингу": средний рейтинг с порогом >= 20 голосов ---
    top_rated_items = db.query(MangaItem).join(
        rating_sq, MangaItem.manga_id == rating_sq.c.manga_id
    ).order_by(rating_sq.c.avg_r.desc()).limit(10).all()

    # --- "Новинки": по дате добавления в БД ---
    newest_q = db.query(MangaItem).order_by(MangaItem.created_at.desc())

    # --- "Последние обновления": по updated_at, только тайтлы с главами ---
    # Subquery: manga_id у которых есть хотя бы 1 глава
    manga_with_chapters_sq = db.query(Chapter.manga_id).distinct().subquery()
    updated_items = db.query(MangaItem).filter(
        MangaItem.updated_at != None,
        MangaItem.manga_id.in_(db.query(manga_with_chapters_sq.c.manga_id))
    ).order_by(MangaItem.updated_at.desc()).limit(30).all()

    updated_manga_ids = [item.manga_id for item in updated_items]

    chapters_raw = db.query(Chapter).filter(
        Chapter.manga_id.in_(updated_manga_ids)
    ).order_by(Chapter.created_at.desc()).all() if updated_manga_ids else []

    chapters_by_manga = defaultdict(list)
    for ch in chapters_raw:
        chapters_by_manga[ch.manga_id].append(ch)

    def _ch_sort_key(c):
        """Сортировка глав: сначала по дате добавления, потом по номеру главы (desc)."""
        try:
            num = float(c.chapter_number) if c.chapter_number else 0
        except (ValueError, TypeError):
            num = 0
        return (c.created_at or datetime.min, num)

    latest_updates = []
    for item in updated_items:
        manga_chapters = chapters_by_manga.get(item.manga_id, [])
        manga_chapters.sort(key=_ch_sort_key, reverse=True)

        latest_chapter = None
        recent_count = 0
        if manga_chapters:
            latest_chapter = manga_chapters[0]
            if latest_chapter.created_at:
                cutoff = now - timedelta(hours=24)
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

    # --- "Новый сезон": обновлённые за 30 дней онгоинги, по активности за 7 дней ---
    new_season_q = db.query(MangaItem).outerjoin(
        views_7d_sq, MangaItem.manga_id == views_7d_sq.c.manga_id
    ).outerjoin(
        bookmarks_7d_sq, MangaItem.manga_id == bookmarks_7d_sq.c.manga_id
    ).filter(
        MangaItem.updated_at >= thirty_days_ago,
        MangaItem.status == "В процессе",
    ).order_by(
        (sa_fn.coalesce(views_7d_sq.c.v7, 0) + sa_fn.coalesce(bookmarks_7d_sq.c.b7, 0)).desc()
    )

    # --- "Свежие главы" = то же что "обновления" ---
    fresh_q = db.query(MangaItem).filter(
        MangaItem.updated_at != None
    ).order_by(MangaItem.updated_at.desc())

    # --- "В тренде": быстрый рост за 48 часов ---
    trending_q = db.query(MangaItem).outerjoin(
        views_48h_sq, MangaItem.manga_id == views_48h_sq.c.manga_id
    ).outerjoin(
        bookmarks_48h_sq, MangaItem.manga_id == bookmarks_48h_sq.c.manga_id
    ).order_by(
        (sa_fn.coalesce(views_48h_sq.c.v48, 0) + sa_fn.coalesce(bookmarks_48h_sq.c.b48, 0)).desc()
    )

    # --- "Популярно сегодня": активность за 24 часа ---
    popular_today_q = db.query(MangaItem).outerjoin(
        views_24h_sq, MangaItem.manga_id == views_24h_sq.c.manga_id
    ).outerjoin(
        bookmarks_24h_sq, MangaItem.manga_id == bookmarks_24h_sq.c.manga_id
    ).order_by(
        (sa_fn.coalesce(views_24h_sq.c.v24, 0) + sa_fn.coalesce(bookmarks_24h_sq.c.b24, 0)).desc()
    )

    # --- Топ по типам: средний рейтинг с порогом >= 20 голосов ---
    def top_by_type(manga_type, limit=5):
        items = db.query(MangaItem).join(
            rating_sq, MangaItem.manga_id == rating_sq.c.manga_id
        ).filter(
            MangaItem.manga_type == manga_type
        ).order_by(rating_sq.c.avg_r.desc()).limit(limit).all()
        return build_section_from_items(items, limit)

    result = {
        "popular": build_section(popular_q, 10),
        "top_rated": build_section_from_items(top_rated_items, 10),
        "newest": build_section(newest_q, 10),
        "updated": latest_updates,
        "hot_new": build_section_from_items(hot_new_items, 10),
        "new_season": build_section(new_season_q, 5),
        "trending": build_section(trending_q, 5),
        "popular_today": build_section(popular_today_q, 5),
        "fresh_chapters": build_section(fresh_q, 10),
        "featured": build_section(popular_q, 5),
        "top_manhwa": top_by_type("Manhwa", 5),
        "top_manga": top_by_type("Manga", 5),
        "top_manhua": top_by_type("Manhua", 5),
    }

    try:
        if redis_client:
            serialized = json.dumps(result, default=str)
            redis_client.setex("home_sections", 120, serialized)
    except Exception as e:
        print(f"[HOME_SECTIONS] Redis cache error: {e}")
    return result


@app.get("/manga/section/{section_key}", summary="Данные секции для страницы списка")
async def get_section_list(section_key: str, db: Session = Depends(get_db)):
    """Возвращает 20 тайтлов для конкретной секции, отсортированных по локальным метрикам."""
    from sqlalchemy import func as sa_fn, desc as sa_desc
    LIMIT = 20

    now = datetime.utcnow()
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)
    forty_eight_hours_ago = now - timedelta(hours=48)
    twenty_four_hours_ago = now - timedelta(hours=24)

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

    # Локальные просмотры
    real_views_map = dict(
        db.query(MangaView.manga_id, sa_fn.count(MangaView.id))
        .group_by(MangaView.manga_id)
        .all()
    )

    def build_items(items, limit=LIMIT):
        result = []
        for item in items[:limit]:
            avg_user = user_ratings_agg.get(item.manga_id)
            user_avg = round(float(avg_user), 2) if avg_user else None
            user_total = user_ratings_count.get(item.manga_id, 0)
            result.append({
                "manga_id": item.manga_id,
                "slug": item.slug or item.manga_id,
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

    # Subqueries
    views_7d_sq = db.query(
        MangaView.manga_id, sa_fn.count(MangaView.id).label("v7")
    ).filter(MangaView.created_at >= seven_days_ago).group_by(MangaView.manga_id).subquery()

    bookmarks_7d_sq = db.query(
        MangaBookmark.manga_id, sa_fn.count(MangaBookmark.id).label("b7")
    ).filter(MangaBookmark.created_at >= seven_days_ago).group_by(MangaBookmark.manga_id).subquery()

    views_all_sq = db.query(
        MangaView.manga_id, sa_fn.count(MangaView.id).label("v_all")
    ).group_by(MangaView.manga_id).subquery()

    rating_sq = db.query(
        MangaRating.manga_id,
        sa_fn.avg(MangaRating.rating).label("avg_r"),
        sa_fn.count(MangaRating.id).label("r_cnt")
    ).group_by(MangaRating.manga_id).having(sa_fn.count(MangaRating.id) >= 20).subquery()

    views_48h_sq = db.query(
        MangaView.manga_id, sa_fn.count(MangaView.id).label("v48")
    ).filter(MangaView.created_at >= forty_eight_hours_ago).group_by(MangaView.manga_id).subquery()

    bookmarks_48h_sq = db.query(
        MangaBookmark.manga_id, sa_fn.count(MangaBookmark.id).label("b48")
    ).filter(MangaBookmark.created_at >= forty_eight_hours_ago).group_by(MangaBookmark.manga_id).subquery()

    views_24h_sq = db.query(
        MangaView.manga_id, sa_fn.count(MangaView.id).label("v24")
    ).filter(MangaView.created_at >= twenty_four_hours_ago).group_by(MangaView.manga_id).subquery()

    bookmarks_24h_sq = db.query(
        MangaBookmark.manga_id, sa_fn.count(MangaBookmark.id).label("b24")
    ).filter(MangaBookmark.created_at >= twenty_four_hours_ago).group_by(MangaBookmark.manga_id).subquery()

    def popular_7d_query():
        return db.query(MangaItem).outerjoin(
            views_7d_sq, MangaItem.manga_id == views_7d_sq.c.manga_id
        ).outerjoin(
            bookmarks_7d_sq, MangaItem.manga_id == bookmarks_7d_sq.c.manga_id
        ).order_by(
            (sa_fn.coalesce(views_7d_sq.c.v7, 0) + sa_fn.coalesce(bookmarks_7d_sq.c.b7, 0)).desc()
        ).limit(LIMIT).all()

    def top_by_type_query(manga_type):
        return db.query(MangaItem).join(
            rating_sq, MangaItem.manga_id == rating_sq.c.manga_id
        ).filter(
            MangaItem.manga_type == manga_type
        ).order_by(rating_sq.c.avg_r.desc()).limit(LIMIT).all()

    section_map = {
        "hot": lambda: build_items(
            db.query(MangaItem).outerjoin(
                views_7d_sq, MangaItem.manga_id == views_7d_sq.c.manga_id
            ).outerjoin(
                bookmarks_7d_sq, MangaItem.manga_id == bookmarks_7d_sq.c.manga_id
            ).filter(
                MangaItem.created_at >= seven_days_ago
            ).order_by(
                (sa_fn.coalesce(views_7d_sq.c.v7, 0) + sa_fn.coalesce(bookmarks_7d_sq.c.b7, 0)).desc()
            ).limit(LIMIT).all()
        ),
        "fresh": lambda: build_items(
            db.query(MangaItem).filter(
                MangaItem.updated_at != None
            ).order_by(MangaItem.updated_at.desc()).limit(LIMIT).all()
        ),
        "popular": lambda: build_items(popular_7d_query()),
        "new-season": lambda: build_items(
            db.query(MangaItem).outerjoin(
                views_7d_sq, MangaItem.manga_id == views_7d_sq.c.manga_id
            ).outerjoin(
                bookmarks_7d_sq, MangaItem.manga_id == bookmarks_7d_sq.c.manga_id
            ).filter(
                MangaItem.updated_at >= thirty_days_ago,
                MangaItem.status == "В процессе",
            ).order_by(
                (sa_fn.coalesce(views_7d_sq.c.v7, 0) + sa_fn.coalesce(bookmarks_7d_sq.c.b7, 0)).desc()
            ).limit(LIMIT).all()
        ),
        "trending": lambda: build_items(
            db.query(MangaItem).outerjoin(
                views_48h_sq, MangaItem.manga_id == views_48h_sq.c.manga_id
            ).outerjoin(
                bookmarks_48h_sq, MangaItem.manga_id == bookmarks_48h_sq.c.manga_id
            ).order_by(
                (sa_fn.coalesce(views_48h_sq.c.v48, 0) + sa_fn.coalesce(bookmarks_48h_sq.c.b48, 0)).desc()
            ).limit(LIMIT).all()
        ),
        "popular-today": lambda: build_items(
            db.query(MangaItem).outerjoin(
                views_24h_sq, MangaItem.manga_id == views_24h_sq.c.manga_id
            ).outerjoin(
                bookmarks_24h_sq, MangaItem.manga_id == bookmarks_24h_sq.c.manga_id
            ).order_by(
                (sa_fn.coalesce(views_24h_sq.c.v24, 0) + sa_fn.coalesce(bookmarks_24h_sq.c.b24, 0)).desc()
            ).limit(LIMIT).all()
        ),
        "top-manhwa": lambda: build_items(top_by_type_query("Manhwa")),
        "top-manga": lambda: build_items(top_by_type_query("Manga")),
        "top-manhua": lambda: build_items(top_by_type_query("Manhua")),
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
        "profile_background_url": u.profile_background_url or "",
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
async def get_wall_comments_with_replies(user_id: int, offset: int = 0, limit: int = 10, db: Session = Depends(get_db)):
    total = db.query(WallComment).filter(WallComment.profile_user_id == user_id).count()
    comments = db.query(WallComment).filter(WallComment.profile_user_id == user_id).order_by(WallComment.created_at.desc()).offset(offset).limit(limit).all()
    if not comments:
        return {"comments": [], "total": total, "has_more": offset + limit < total}

    comment_ids = [c.id for c in comments]
    # Batch load all replies for these comments
    all_replies = (
        db.query(WallCommentReply)
        .filter(WallCommentReply.wall_comment_id.in_(comment_ids))
        .order_by(WallCommentReply.created_at.asc())
        .all()
    )
    # Collect all author IDs and batch load users
    author_ids = set(c.author_id for c in comments)
    for r in all_replies:
        author_ids.add(r.author_id)
    authors_map = {u.id: u for u in db.query(User).filter(User.id.in_(author_ids)).all()}

    # Group replies by comment
    replies_by_comment = {}
    for r in all_replies:
        replies_by_comment.setdefault(r.wall_comment_id, []).append(r)

    result = []
    for c in comments:
        author = authors_map.get(c.author_id)
        replies = []
        for r in replies_by_comment.get(c.id, []):
            r_author = authors_map.get(r.author_id)
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
    return {"comments": result, "total": total, "has_more": offset + limit < total}


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

    # Recent comments (single JOIN instead of N+1)
    recent_comments_raw = (
        db.query(MangaComment, MangaItem.title, MangaItem.cover_url)
        .outerjoin(MangaItem, MangaComment.manga_id == MangaItem.manga_id)
        .filter(MangaComment.user_id == u.id)
        .order_by(MangaComment.created_at.desc())
        .limit(5)
        .all()
    )
    comments_data = [{
        "text": c.text[:200],
        "manga_id": c.manga_id,
        "manga_title": title or c.manga_id,
        "manga_cover": cover or "",
        "timestamp": c.created_at.strftime("%d.%m.%y %H:%M") if c.created_at else "",
    } for c, title, cover in recent_comments_raw]

    # Bookmarks (single JOIN instead of N+1)
    bookmarks_raw = (
        db.query(MangaBookmark, MangaItem.title, MangaItem.cover_url)
        .join(MangaItem, MangaBookmark.manga_id == MangaItem.manga_id)
        .filter(MangaBookmark.user_id == u.id)
        .order_by(MangaBookmark.created_at.desc())
        .limit(10)
        .all()
    )
    bookmarks_data = [{
        "manga_id": b.manga_id,
        "title": title,
        "cover": cover or "",
        "status": b.status,
    } for b, title, cover in bookmarks_raw]

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

    # Corruption (single JOIN instead of N+1)
    dark_genres = ['Хоррор', 'Ужасы', 'Трагедия', 'Психология', 'Триллер', 'Драма', 'Тёмное фэнтези', 'Мистика', 'Детектив']
    light_genres = ['Комедия', 'Повседневность', 'Романтика', 'Сёнэн', 'Школа', 'Спорт']
    dark_count = 0
    light_count = 0
    total_genres = 0
    corruption_rows = (
        db.query(MangaItem.genres)
        .join(MangaBookmark, MangaBookmark.manga_id == MangaItem.manga_id)
        .filter(MangaBookmark.user_id == u.id)
        .all()
    )
    for (genres_str,) in corruption_rows:
        try:
            genres = json.loads(genres_str) if isinstance(genres_str, str) else (genres_str or [])
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
        "profile_background_url": u.profile_background_url or "",
        "private_profile": bool(u.private_profile),
        "role": u.role or "user",
        "badge_ids": badge_list,
        "corruption": corruption,
        "active_title": u.active_title or "",
        "nickname_color": u.nickname_color or "",
        "nickname_font": u.nickname_font or "",
        "subscription_active": u.subscription_type == "springpro" and u.subscription_expires_at and u.subscription_expires_at > datetime.utcnow(),
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


# ═══════════════════════════════════════════════════════════
# SHOP & SCRAP
# ═══════════════════════════════════════════════════════════

@app.get("/shop/items", summary="Список товаров магазина")
async def get_shop_items(current_user: User = Depends(get_optional_user), db: Session = Depends(get_db)):
    from sqlalchemy import or_
    query = db.query(ShopItem).filter(
        or_(ShopItem.owner_id == None, ShopItem.owner_id == (current_user.id if current_user else -1))
    )
    items = query.all()
    user_level = current_user.level if current_user else 1
    return [
        {
            "key": i.key,
            "name": i.name,
            "description": i.description,
            "category": i.category,
            "price": i.price,
            "preview": i.preview,
            "rarity": i.rarity or "common",
            "css_variables": i.css_variables or "{}",
            "block_style": i.block_style or "none",
            "nickname_effect": i.nickname_effect or "none",
            "font_family": i.font_family or "",
            "required_level": i.required_level or 0,
            "locked": (i.required_level or 0) > user_level,
        }
        for i in items
    ]

@app.post("/shop/buy/{item_key}", summary="Купить предмет за Scrap")
async def buy_shop_item(item_key: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.query(ShopItem).filter(ShopItem.key == item_key).first()
    if not item:
        raise HTTPException(404, "Товар не найден")
    # Check level requirement for frames
    if item.category == "frame" and (item.required_level or 0) > 0:
        if current_user.level < item.required_level:
            raise HTTPException(400, f"Требуется {item.required_level} уровень")
    existing = db.query(UserPurchase).filter(UserPurchase.user_id == current_user.id, UserPurchase.item_key == item_key).first()
    if existing:
        raise HTTPException(400, "Уже куплено")
    earned = current_user.scrap or 0
    donated = current_user.donated_scrap or 0
    # SpringPro can only be purchased with donated scrap
    if item.category == "springpro":
        if donated < item.price:
            raise HTTPException(400, f"Недостаточно донатных Scrap (нужно {item.price}, есть {donated})")
        current_user.donated_scrap = donated - item.price
    else:
        total = earned + donated
        if total < item.price:
            raise HTTPException(400, f"Недостаточно Scrap (нужно {item.price}, есть {total})")
        # Deduct earned first, overflow from donated
        remaining_cost = item.price
        if earned >= remaining_cost:
            current_user.scrap = earned - remaining_cost
        else:
            current_user.scrap = 0
            remaining_cost -= earned
            current_user.donated_scrap = donated - remaining_cost
    purchase = UserPurchase(user_id=current_user.id, item_key=item_key)
    db.add(purchase)
    # Auto-activate springpro subscription on purchase
    if item.category == "springpro":
        days = 30
        if "3month" in item_key:
            days = 90
        elif "year" in item_key:
            days = 365
        current_user.subscription_type = "springpro"
        base = current_user.subscription_expires_at if (current_user.subscription_expires_at and current_user.subscription_expires_at > datetime.utcnow()) else datetime.utcnow()
        current_user.subscription_expires_at = base + timedelta(days=days)
    db.commit()
    result = {"ok": True, "scrap": (current_user.scrap or 0) + (current_user.donated_scrap or 0), "earned_scrap": current_user.scrap or 0, "donated_scrap": current_user.donated_scrap or 0}
    if item.category == "springpro":
        result["subscription_active"] = True
        result["subscription_expires_at"] = current_user.subscription_expires_at.isoformat() if current_user.subscription_expires_at else None
    return result

@app.get("/auth/my-purchases", summary="Мои покупки")
async def get_my_purchases(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    purchases = db.query(UserPurchase).filter(UserPurchase.user_id == current_user.id).all()
    return [p.item_key for p in purchases]

@app.post("/shop/activate/{item_key}", summary="Применить купленный предмет")
async def activate_shop_item(item_key: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.query(ShopItem).filter(ShopItem.key == item_key).first()
    if not item:
        raise HTTPException(404, "Товар не найден")
    # Check level requirement for frames
    if item.category == "frame" and (item.required_level or 0) > 0:
        if current_user.level < item.required_level:
            raise HTTPException(400, f"Требуется {item.required_level} уровень")
    purchase = db.query(UserPurchase).filter(UserPurchase.user_id == current_user.id, UserPurchase.item_key == item_key).first()
    if not purchase:
        raise HTTPException(400, "Предмет не куплен")
    cat = item.category
    if cat == "skin":
        current_user.profile_theme = item.key.replace("skin_", "", 1)
        # Сбрасываем настройки ника для немифических скинов
        if item.rarity != "mythic":
            current_user.nickname_color = None
            current_user.nickname_font = None
    elif cat == "frame":
        current_user.avatar_frame = item.key
    elif cat == "cover":
        current_user.profile_banner_url = item.preview
    elif cat == "avatar":
        current_user.avatar_url = item.preview
    elif cat == "background":
        current_user.profile_background_url = item.preview
    elif cat == "status":
        current_user.bio = item.name
    elif cat == "springpro":
        # Activate subscription
        days = 30
        if "3month" in item.key:
            days = 90
        elif "year" in item.key:
            days = 365
        current_user.subscription_type = "springpro"
        base = current_user.subscription_expires_at if (current_user.subscription_expires_at and current_user.subscription_expires_at > datetime.utcnow()) else datetime.utcnow()
        current_user.subscription_expires_at = base + timedelta(days=days)
    else:
        raise HTTPException(400, "Этот предмет нельзя применить")
    db.commit()
    return {"ok": True, "applied": item_key}


class SubscribeScrapRequest(BaseModel):
    plan: str = "springpro_month"  # springpro_month | springpro_3month | springpro_year

@app.post("/shop/subscribe-springpro", summary="Подписка SPRINGPRO за донатный Scrap")
async def subscribe_springpro_scrap(data: SubscribeScrapRequest = SubscribeScrapRequest(), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Buy SPRINGPRO subscription using ONLY donated scrap (purchased with real money)."""
    PLAN_MAP = {
        "springpro_month": {"days": 30},
        "springpro_3month": {"days": 90},
        "springpro_year": {"days": 365},
    }
    plan_info = PLAN_MAP.get(data.plan)
    if not plan_info:
        raise HTTPException(400, "Неизвестный план подписки")
    item = db.query(ShopItem).filter(ShopItem.key == data.plan).first()
    if not item:
        raise HTTPException(404, "Подписка не найдена")
    price = item.price
    donated = current_user.donated_scrap or 0
    if donated < price:
        raise HTTPException(400, f"Недостаточно донатных Scrap (нужно {price}, есть {donated})")
    current_user.donated_scrap = donated - price
    # Activate subscription
    current_user.subscription_type = "springpro"
    base = current_user.subscription_expires_at if (current_user.subscription_expires_at and current_user.subscription_expires_at > datetime.utcnow()) else datetime.utcnow()
    current_user.subscription_expires_at = base + timedelta(days=plan_info["days"])
    db.commit()
    return {
        "ok": True,
        "donated_scrap": current_user.donated_scrap or 0,
        "earned_scrap": current_user.scrap or 0,
        "subscription_active": True,
        "subscription_expires_at": current_user.subscription_expires_at.isoformat() if current_user.subscription_expires_at else None,
    }


# ═══════════════════════════════════════════════════════════
# PROFILE COMPATIBILITY
# ═══════════════════════════════════════════════════════════

@app.get("/users/{user_id}/compatibility", summary="Совместимость профилей")
async def get_profile_compatibility(user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    my_bookmarks = set(b.manga_id for b in db.query(MangaBookmark).filter(MangaBookmark.user_id == current_user.id).all())
    their_bookmarks = set(b.manga_id for b in db.query(MangaBookmark).filter(MangaBookmark.user_id == user_id).all())
    if not my_bookmarks and not their_bookmarks:
        return {"compatibility": 0, "common": 0, "total": 0}
    union = my_bookmarks | their_bookmarks
    intersection = my_bookmarks & their_bookmarks
    compatibility = round(len(intersection) / len(union) * 100) if union else 0
    return {"compatibility": compatibility, "common": len(intersection), "total": len(union)}


# ═══════════════════════════════════════════════════════════
# ADMIN SHOP CRUD
# ═══════════════════════════════════════════════════════════

class ShopItemCreate(BaseModel):
    key: str
    name: str
    description: str = ""
    category: str = "sticker"
    price: int = 0
    preview: str = ""
    rarity: str = "common"
    css_variables: str = "{}"
    block_style: str = "none"
    nickname_effect: str = "none"
    font_family: str = ""

class ShopItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    price: Optional[int] = None
    preview: Optional[str] = None
    rarity: Optional[str] = None
    css_variables: Optional[str] = None
    block_style: Optional[str] = None
    nickname_effect: Optional[str] = None
    font_family: Optional[str] = None

class ScrapGrant(BaseModel):
    amount: int
    reason: str = ""

@app.post("/admin/shop/items", summary="Создать товар (админ)")
async def admin_create_shop_item(data: ShopItemCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(403, "Доступ запрещён")
    existing = db.query(ShopItem).filter(ShopItem.key == data.key).first()
    if existing:
        raise HTTPException(400, "Товар с таким ключом уже существует")
    item = ShopItem(key=data.key, name=data.name, description=data.description, category=data.category, price=data.price, preview=data.preview,
                    rarity=data.rarity, css_variables=data.css_variables, block_style=data.block_style, nickname_effect=data.nickname_effect, font_family=data.font_family)
    db.add(item)
    db.commit()
    return {"ok": True, "id": item.id}

@app.put("/admin/shop/items/{item_key}", summary="Обновить товар (админ)")
async def admin_update_shop_item(item_key: str, data: ShopItemUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(403, "Доступ запрещён")
    item = db.query(ShopItem).filter(ShopItem.key == item_key).first()
    if not item:
        raise HTTPException(404, "Товар не найден")
    if data.name is not None: item.name = data.name
    if data.description is not None: item.description = data.description
    if data.category is not None: item.category = data.category
    if data.price is not None: item.price = data.price
    if data.preview is not None: item.preview = data.preview
    if data.rarity is not None: item.rarity = data.rarity
    if data.css_variables is not None: item.css_variables = data.css_variables
    if data.block_style is not None: item.block_style = data.block_style
    if data.nickname_effect is not None: item.nickname_effect = data.nickname_effect
    if data.font_family is not None: item.font_family = data.font_family
    db.commit()
    return {"ok": True}

@app.delete("/admin/shop/items/{item_key}", summary="Удалить товар (админ)")
async def admin_delete_shop_item(item_key: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(403, "Доступ запрещён")
    item = db.query(ShopItem).filter(ShopItem.key == item_key).first()
    if not item:
        raise HTTPException(404, "Товар не найден")
    db.delete(item)
    db.commit()
    return {"ok": True}

@app.post("/admin/users/{user_id}/scrap", summary="Начислить/списать Scrap (админ)")
async def admin_grant_scrap(user_id: int, data: ScrapGrant, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(403, "Доступ запрещён")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, "Пользователь не найден")
    target.donated_scrap = max(0, (target.donated_scrap or 0) + data.amount)
    tx = ScrapTransaction(user_id=target.id, username=target.username, amount=data.amount, reason=data.reason, admin_id=current_user.id)
    db.add(tx)
    db.commit()
    log_admin_action(db, current_user, "НАЧИСЛЕНИЕ SCRAP" if data.amount >= 0 else "СПИСАНИЕ SCRAP", f"{target.username}: {data.amount:+d}")
    return {"ok": True, "donated_scrap": target.donated_scrap}


# ═══════════════════════════════════════════════════════════
# PERSONALIZATION REQUESTS
# ═══════════════════════════════════════════════════════════

PERSONALIZATION_DIR = os.path.join(UPLOADS_DIR, "personalization")
os.makedirs(PERSONALIZATION_DIR, exist_ok=True)

PERSONALIZATION_PRICE = 5000
REFUND_WINDOW_MINUTES = 10

@app.post("/auth/personalization/request", summary="Заявка на персонализацию")
async def create_personalization_request(
    type: str = Query(..., pattern="^(background)$"),
    file: UploadFile = FastAPIFile(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    earned = current_user.scrap or 0
    donated = current_user.donated_scrap or 0
    total = earned + donated
    if total < PERSONALIZATION_PRICE:
        raise HTTPException(400, f"Недостаточно Scrap (нужно {PERSONALIZATION_PRICE}, есть {total})")

    file_url = ""
    if not file:
        raise HTTPException(400, "Загрузите файл")
    ext = os.path.splitext(file.filename or "file.png")[1].lower()
    allowed = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm")
    if ext not in allowed:
        raise HTTPException(400, f"Недопустимый формат: {ext}")
    filename = f"{current_user.id}_{type}_{int(datetime.utcnow().timestamp())}{ext}"
    filepath = os.path.join(PERSONALIZATION_DIR, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    file_url = f"/uploads/personalization/{filename}"

    # Deduct earned first, overflow from donated
    remaining_cost = PERSONALIZATION_PRICE
    if earned >= remaining_cost:
        current_user.scrap = earned - remaining_cost
    else:
        current_user.scrap = 0
        remaining_cost -= earned
        current_user.donated_scrap = donated - remaining_cost
    req = PersonalizationRequest(
        user_id=current_user.id,
        type=type,
        file_url=file_url,
        text_value="",
        price=PERSONALIZATION_PRICE,
    )
    db.add(req)
    db.commit()
    return {"ok": True, "id": req.id, "scrap": current_user.scrap}

@app.get("/auth/personalization/my-requests", summary="Мои заявки на персонализацию")
async def get_my_personalization_requests(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    reqs = db.query(PersonalizationRequest).filter(PersonalizationRequest.user_id == current_user.id).order_by(PersonalizationRequest.created_at.desc()).all()
    return [{
        "id": r.id,
        "type": r.type,
        "file_url": r.file_url,
        "text_value": r.text_value,
        "status": r.status,
        "price": r.price,
        "created_at": r.created_at.isoformat() if r.created_at else "",
        "refundable": r.status == "pending" and r.created_at and (datetime.utcnow() - r.created_at).total_seconds() < REFUND_WINDOW_MINUTES * 60,
    } for r in reqs]

@app.delete("/auth/personalization/{req_id}/refund", summary="Возврат Scrap за заявку")
async def refund_personalization(req_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    req = db.query(PersonalizationRequest).filter(PersonalizationRequest.id == req_id, PersonalizationRequest.user_id == current_user.id).first()
    if not req:
        raise HTTPException(404, "Заявка не найдена")
    if req.status != "pending":
        raise HTTPException(400, "Заявка уже обработана")
    if not req.created_at or (datetime.utcnow() - req.created_at).total_seconds() > REFUND_WINDOW_MINUTES * 60:
        raise HTTPException(400, "Время возврата истекло (10 мин)")
    current_user.scrap = (current_user.scrap or 0) + req.price
    db.delete(req)
    db.commit()
    return {"ok": True, "scrap": current_user.scrap}

@app.get("/admin/personalization/pending", summary="Заявки на модерацию (админ)")
async def admin_get_pending_personalization(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ("admin", "moderator"):
        raise HTTPException(403, "Доступ запрещён")
    reqs = db.query(PersonalizationRequest).filter(PersonalizationRequest.status == "pending").order_by(PersonalizationRequest.created_at.asc()).all()
    result = []
    for r in reqs:
        u = db.query(User).filter(User.id == r.user_id).first()
        result.append({
            "id": r.id,
            "user_id": r.user_id,
            "username": u.username if u else "?",
            "avatar_url": u.avatar_url if u else "",
            "type": r.type,
            "file_url": r.file_url,
            "text_value": r.text_value,
            "price": r.price,
            "created_at": r.created_at.isoformat() if r.created_at else "",
        })
    return result

@app.put("/admin/personalization/{req_id}/approve", summary="Одобрить заявку (админ)")
async def admin_approve_personalization(req_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ("admin", "moderator"):
        raise HTTPException(403, "Доступ запрещён")
    req = db.query(PersonalizationRequest).filter(PersonalizationRequest.id == req_id).first()
    if not req:
        raise HTTPException(404, "Заявка не найдена")
    if req.status != "pending":
        raise HTTPException(400, "Заявка уже обработана")
    req.status = "approved"
    req.reviewed_at = datetime.utcnow()
    # Apply personalization
    target = db.query(User).filter(User.id == req.user_id).first()
    if target:
        if req.type == "background":
            target.profile_background_url = req.file_url
        # Create a personal shop item so user can re-activate it later
        import time
        item_key = f"pers_{req.type}_{req.user_id}_{int(time.time())}"
        cat = "background" if req.type == "background" else "cover"
        shop_item = ShopItem(
            key=item_key,
            name=f"Мой {('фон' if req.type == 'background' else 'обложка')}",
            description="Одобренная персонализация",
            category=cat,
            price=0,
            preview=req.file_url,
            rarity="common",
            owner_id=req.user_id,
        )
        db.add(shop_item)
        db.flush()
        # Grant the item to the user as purchased
        purchase = UserPurchase(user_id=req.user_id, item_key=item_key)
        db.add(purchase)
    db.commit()
    log_admin_action(db, current_user, "ОДОБРЕНИЕ ЗАЯВКИ", f"#{req_id} ({req.type}) для user_id={req.user_id}")
    return {"ok": True}

@app.put("/admin/personalization/{req_id}/reject", summary="Отклонить заявку (админ)")
async def admin_reject_personalization(req_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ("admin", "moderator"):
        raise HTTPException(403, "Доступ запрещён")
    req = db.query(PersonalizationRequest).filter(PersonalizationRequest.id == req_id).first()
    if not req:
        raise HTTPException(404, "Заявка не найдена")
    if req.status != "pending":
        raise HTTPException(400, "Заявка уже обработана")
    req.status = "rejected"
    req.reviewed_at = datetime.utcnow()
    # Refund scrap
    target = db.query(User).filter(User.id == req.user_id).first()
    if target:
        target.scrap = (target.scrap or 0) + req.price
    db.commit()
    log_admin_action(db, current_user, "ОТКЛОНЕНИЕ ЗАЯВКИ", f"#{req_id} ({req.type}) для user_id={req.user_id}")
    return {"ok": True}


# ═══ PAYMENTS (PAYPALYCH) ═══

SCRAP_PACKAGES = [
    {"id": "scrap_600", "scrap": 600, "price_rub": 99, "label": "", "first_buy_x2": True},
    {"id": "scrap_1600", "scrap": 1600, "price_rub": 249, "label": "", "first_buy_x2": True},
    {"id": "scrap_3500", "scrap": 3500, "price_rub": 499, "label": "popular", "first_buy_x2": True},
    {"id": "scrap_8000", "scrap": 8000, "price_rub": 999, "label": "discount_30", "first_buy_x2": True},
    {"id": "scrap_18000", "scrap": 18000, "price_rub": 1990, "label": "discount_40", "first_buy_x2": True},
    {"id": "scrap_50000", "scrap": 50000, "price_rub": 4990, "label": "vip", "first_buy_x2": True},
    {"id": "scrap_120000", "scrap": 120000, "price_rub": 9990, "label": "elite", "first_buy_x2": True},
]
SPRINGPRO_PLANS_RUB = [
    {"id": "springpro_1m", "months": 1, "price_rub": 159, "label": ""},
    {"id": "springpro_3m", "months": 3, "price_rub": 419, "label": "economy_5"},
    {"id": "springpro_12m", "months": 12, "price_rub": 1490, "label": "economy_20"},
]
SPRINGPRO_PRICE_RUB = 159

@app.get("/payments/packages", summary="Доступные пакеты для покупки")
async def get_payment_packages():
    return {
        "scrap_packages": SCRAP_PACKAGES,
        "springpro_price": SPRINGPRO_PRICE_RUB,
        "springpro_plans": SPRINGPRO_PLANS_RUB,
    }

class CreatePaymentRequest(BaseModel):
    type: str  # "scrap" | "springpro"
    package_id: Optional[str] = None  # for scrap packages

@app.post("/payments/create", summary="Создать платёж через PAYPALYCH")
async def create_payment(data: CreatePaymentRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    import uuid

    if data.type == "scrap":
        pkg = next((p for p in SCRAP_PACKAGES if p["id"] == data.package_id), None)
        if not pkg:
            raise HTTPException(400, "Неизвестный пакет")
        amount_rub = pkg["price_rub"]
        scrap_amount = pkg["scrap"]
        description = f"{scrap_amount} SCRAP для {current_user.username}"
    elif data.type == "springpro":
        plan = next((p for p in SPRINGPRO_PLANS_RUB if p["id"] == data.package_id), None) if data.package_id else None
        amount_rub = plan["price_rub"] if plan else SPRINGPRO_PRICE_RUB
        scrap_amount = 0
        months = plan["months"] if plan else 1
        description = f"SPRINGPRO подписка ({months} мес) для {current_user.username}"
    else:
        raise HTTPException(400, "Неизвестный тип платежа")

    payment_id = str(uuid.uuid4())

    txn = PaymentTransaction(
        user_id=current_user.id,
        payment_id=payment_id,
        type=data.type,
        amount_rub=amount_rub,
        scrap_amount=scrap_amount,
        package_id=data.package_id,
        status="pending",
        created_at=datetime.utcnow(),
    )
    db.add(txn)
    db.commit()

    if not PAYPALYCH_API_KEY:
        raise HTTPException(500, "Платежная система не настроена")

    try:
        resp = requests.post(
            "https://paypalych.com/api/v1/bill/create",
            json={
                "amount": amount_rub,
                "order_id": payment_id,
                "description": description,
                "type": "normal",
                "shop_id": PAYPALYCH_SHOP_ID,
                "custom_fields": json.dumps({"user_id": current_user.id, "type": data.type}),
            },
            headers={"Authorization": f"Bearer {PAYPALYCH_API_KEY}"},
            timeout=15,
        )
        resp_data = resp.json()
        if resp.status_code == 200 and resp_data.get("link_page_url"):
            return {"payment_url": resp_data["link_page_url"], "payment_id": payment_id}
        else:
            txn.status = "failed"
            db.commit()
            raise HTTPException(502, f"Ошибка платежной системы: {resp_data.get('message', 'unknown')}")
    except requests.RequestException as e:
        txn.status = "failed"
        db.commit()
        raise HTTPException(502, f"Ошибка связи с платежной системой: {str(e)}")

@app.post("/payments/webhook", summary="Webhook от PAYPALYCH")
async def payment_webhook(request: Request, db: Session = Depends(get_db)):
    try:
        body = await request.json()
    except:
        raise HTTPException(400, "Invalid JSON")

    order_id = body.get("order_id") or body.get("InvId")
    status = body.get("status", "").lower()
    sign = body.get("sign") or body.get("SignatureValue")

    if not order_id:
        raise HTTPException(400, "Missing order_id")

    # Verify signature if secret is configured
    if PAYPALYCH_SECRET and sign:
        import hmac as _hmac
        expected = _hmac.new(PAYPALYCH_SECRET.encode(), order_id.encode(), hashlib.sha256).hexdigest()
        if sign.lower() != expected.lower():
            raise HTTPException(403, "Invalid signature")

    txn = db.query(PaymentTransaction).filter(PaymentTransaction.payment_id == order_id).first()
    if not txn:
        raise HTTPException(404, "Transaction not found")

    if txn.status == "completed":
        return {"ok": True}

    if status in ("paid", "success", "completed"):
        txn.status = "completed"
        txn.completed_at = datetime.utcnow()

        user = db.query(User).filter(User.id == txn.user_id).first()
        if user:
            if txn.type == "scrap":
                scrap_to_add = txn.scrap_amount
                user.donated_scrap = (user.donated_scrap or 0) + scrap_to_add
                # First purchase x2 bonus: give same amount as earned (free) scrap
                if txn.package_id:
                    prev = db.query(PaymentTransaction).filter(
                        PaymentTransaction.user_id == txn.user_id,
                        PaymentTransaction.type == "scrap",
                        PaymentTransaction.package_id == txn.package_id,
                        PaymentTransaction.status == "completed",
                        PaymentTransaction.id != txn.id,
                    ).first()
                    if not prev:
                        user.scrap = (user.scrap or 0) + txn.scrap_amount
            elif txn.type == "springpro":
                user.subscription_type = "springpro"
                plan = next((p for p in SPRINGPRO_PLANS_RUB if p["id"] == txn.package_id), None) if txn.package_id else None
                months = plan["months"] if plan else 1
                base = user.subscription_expires_at if (user.subscription_expires_at and user.subscription_expires_at > datetime.utcnow()) else datetime.utcnow()
                user.subscription_expires_at = base + timedelta(days=30 * months)

        db.commit()
        return {"ok": True}
    elif status in ("failed", "cancelled", "expired"):
        txn.status = "failed"
        db.commit()
        return {"ok": True}

    return {"ok": True}

@app.get("/payments/status/{payment_id}", summary="Статус платежа")
async def get_payment_status(payment_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    txn = db.query(PaymentTransaction).filter(
        PaymentTransaction.payment_id == payment_id,
        PaymentTransaction.user_id == current_user.id,
    ).first()
    if not txn:
        raise HTTPException(404, "Платёж не найден")
    return {
        "status": txn.status,
        "type": txn.type,
        "scrap_amount": txn.scrap_amount,
        "amount_rub": txn.amount_rub,
    }

# ═══ ADMIN: SHOP FILE UPLOAD ═══

@app.post("/admin/shop/upload", summary="Загрузить файл для товара магазина")
async def admin_shop_upload(file: UploadFile = FastAPIFile(...), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(403, "Только для админов")
    ext = os.path.splitext(file.filename or "file.png")[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm"):
        raise HTTPException(400, "Недопустимый формат. Допустимы: jpg, png, gif, webp, mp4, webm")
    import uuid
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(SHOP_UPLOADS_DIR, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    return {"url": f"/uploads/shop/{filename}"}


if __name__ == "__main__":
    print("[SERVER] Zapusk FastAPI servera")
    print("Swagger UI: http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000)
