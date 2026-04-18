import schedule
import time
import threading
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from database import SessionLocal
from models import ChapterMeta, Chapter
from mangabuff_scraper import MangaBuffScraper
import hashlib
import json
import os
from sqlalchemy import func

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CronManager:
    def __init__(self):
        self.scraper = MangaBuffScraper(use_proxy=False)  # Отключаем прокси
        self.is_running = False
        self.thread = None
        self.stats = {
            'last_run': None,
            'chapters_found': 0,
            'errors': 0,
            'status': 'stopped'
        }

    def check_for_updates(self):
        """Проверка обновлений манги с mangabuff.ru"""
        logger.info("Starting manga update check...")
        self.stats['status'] = 'running'
        db: Session = SessionLocal()

        try:
            # Получаем последние обновления с главной страницы
            updates = self.scraper.get_latest_updates(limit=50)
            new_imports = 0
            processed_ids = set()  # Дедупликация — один manga_id за цикл

            for update in updates:
                try:
                    manga_slug = update['manga_id']  # slug из URL (не БД id!)
                    manga_url = update['manga_url']

                    if not manga_slug or not manga_url:
                        continue

                    # Пропускаем если уже обрабатывали в этом цикле
                    if manga_url in processed_ids:
                        logger.debug(f"Skipping duplicate: {update['title']}")
                        continue
                    processed_ids.add(manga_url)

                    # manga_id в БД = MD5 от URL (как в парсере server.py)
                    manga_id = hashlib.md5(manga_url.encode()).hexdigest()

                    # Проверяем есть ли уже эта манга в базе
                    from models import MangaItem
                    existing_manga = db.query(MangaItem).filter(MangaItem.manga_id == manga_id).first()

                    if not existing_manga:
                        # Пропускаем если в обновлениях нет номера главы (скорее всего 0 глав)
                        if not update.get('latest_chapter'):
                            logger.info(f"Skipping {update['title']} — no chapters detected")
                            continue

                        # Новая манга - импортируем её через API
                        logger.info(f"New manga found: {update['title']} - importing...")
                        try:
                            import requests
                            response = requests.post(
                                'http://localhost:8000/manga/mass-parse',
                                json={'urls': [manga_url]},
                                timeout=120
                            )
                            if response.status_code == 200:
                                result = response.json()
                                # Проверяем что главы реально есть
                                results = result.get('results', [])
                                ch_count = results[0].get('chapters_count', 0) if results else 0
                                if ch_count == 0:
                                    # Удаляем тайтл без глав
                                    empty = db.query(MangaItem).filter(MangaItem.manga_id == manga_id).first()
                                    if empty:
                                        db.delete(empty)
                                        db.commit()
                                    logger.info(f"Removed {update['title']} — 0 chapters after import")
                                else:
                                    new_imports += 1
                                    logger.info(f"Successfully imported: {update['title']} ({ch_count} chapters)")
                            else:
                                logger.error(f"Failed to import {manga_id}: {response.status_code}")
                                self.stats['errors'] += 1
                        except Exception as e:
                            logger.error(f"Error importing {manga_id}: {e}")
                            self.stats['errors'] += 1
                    else:
                        # Манга уже есть — проверяем нужно ли обновление
                        latest_chapter = update.get('latest_chapter')
                        if latest_chapter:
                            # Получаем все номера глав и находим макс числовым сравнением
                            # (chapter_number — строка, SQL MAX сравнивает посимвольно)
                            ch_numbers = [
                                row[0] for row in db.query(Chapter.chapter_number).filter(
                                    Chapter.manga_id == manga_id
                                ).all() if row[0]
                            ]
                            max_ch_num = 0
                            for cn in ch_numbers:
                                try:
                                    max_ch_num = max(max_ch_num, float(cn))
                                except (ValueError, TypeError):
                                    pass
                            try:
                                if max_ch_num >= float(latest_chapter):
                                    logger.info(f"Skipping {update['title']} — chapter {latest_chapter} already in DB (max: {max_ch_num})")
                                    continue
                            except (ValueError, TypeError):
                                pass  # Не удалось сравнить — обновляем на всякий случай

                        logger.info(f"Updating: {update['title']} (new chapter: {latest_chapter or 'unknown'})")
                        try:
                            import requests
                            response = requests.post(
                                f'http://localhost:8000/catalog/recrawl-manga/{manga_id}',
                                timeout=120
                            )
                            if response.status_code == 200:
                                result = response.json()
                                added = result.get('new_chapters', 0)
                                if added > 0:
                                    new_imports += 1
                                    logger.info(f"Added {added} new chapters for: {update['title']}")
                                else:
                                    logger.info(f"No new chapters for: {update['title']}")
                            else:
                                logger.warning(f"Could not update {manga_id}: {response.status_code}")
                        except Exception as e:
                            logger.error(f"Error updating {manga_id}: {e}")
                            self.stats['errors'] += 1

                except Exception as e:
                    logger.error(f"Error processing update: {e}")
                    self.stats['errors'] += 1
                    continue

            db.commit()

            self.stats['last_run'] = datetime.utcnow().isoformat()
            self.stats['chapters_found'] = new_imports
            self.stats['status'] = 'idle'

            logger.info(f"Update check completed. {new_imports} manga with new chapters (processed {len(processed_ids)} unique titles)")

        except Exception as e:
            logger.error(f"Error in update check: {e}")
            self.stats['errors'] += 1
            self.stats['status'] = 'error'
            db.rollback()
        finally:
            db.close()

    def cleanup_old_sessions(self):
        """Очистка старых сессий (пример дополнительной задачи)"""
        logger.info("Cleaning up old sessions...")
        # Здесь можно добавить логику очистки
        pass

    def run_scheduler(self):
        """Запуск планировщика в отдельном потоке"""
        logger.info("Cron scheduler started")
        self.is_running = True

        while self.is_running:
            schedule.run_pending()
            time.sleep(60)  # Проверка каждую минуту

    def start(self):
        """Запуск cron-задач"""
        if self.is_running:
            logger.warning("Scheduler already running")
            return

        # Настройка расписания
        schedule.every(5).minutes.do(self.check_for_updates)
        schedule.every(30).minutes.do(self.prefetch_new_chapter_images)

        # Запуск в отдельном потоке
        self.thread = threading.Thread(target=self.run_scheduler, daemon=True)
        self.thread.start()

        # Первая проверка сразу при старте (в фоне, чтобы не блокировать)
        threading.Thread(target=self.check_for_updates, daemon=True).start()

        logger.info("Cron tasks scheduled (immediate + every 10 minutes)")

    def stop(self):
        """Остановка cron-задач"""
        self.is_running = False
        schedule.clear()
        logger.info("Cron scheduler stopped")

    def get_stats(self):
        """Получить статистику работы"""
        return self.stats

    def prefetch_new_chapter_images(self):
        """Prefetch and cache images for recently added chapters"""
        logger.info("Starting image prefetch...")
        db: Session = SessionLocal()
        try:
            from models import Chapter
            recent_chapters = db.query(Chapter).order_by(Chapter.created_at.desc()).limit(15).all()
            prefetched = 0
            for ch in recent_chapters:
                try:
                    if not ch.pages:
                        continue
                    pages_data = ch.pages
                    if isinstance(pages_data, str):
                        try:
                            pages_data = json.loads(pages_data)
                        except Exception:
                            continue
                    if not isinstance(pages_data, list):
                        continue
                    for page_url in pages_data[:3]:
                        if not page_url or not page_url.startswith("http"):
                            continue
                        try:
                            from server import _cache_path, replace_watermark
                            wm = "both"
                            cp = _cache_path(page_url, wm)
                            if os.path.exists(cp):
                                continue
                            import requests as _requests
                            resp = _requests.get(page_url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://mangabuff.ru/"}, timeout=15)
                            if resp.status_code == 200:
                                processed = replace_watermark(resp.content, wm)
                                with open(cp, "wb") as f:
                                    f.write(processed)
                                prefetched += 1
                        except Exception:
                            continue
                except Exception:
                    continue
            logger.info(f"Image prefetch done: {prefetched} images cached")
        except Exception as e:
            logger.error(f"Image prefetch error: {e}")
        finally:
            db.close()

    def trigger_manual_update(self):
        """Ручной запуск проверки обновлений"""
        logger.info("Manual update triggered")
        threading.Thread(target=self.check_for_updates, daemon=True).start()


# Глобальный экземпляр менеджера
cron_manager = CronManager()


if __name__ == "__main__":
    # Тестовый запуск
    manager = CronManager()
    manager.check_for_updates()
