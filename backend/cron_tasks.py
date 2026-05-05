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

CRON_TOKEN_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cron_token")

def _get_cron_headers():
    token_path = CRON_TOKEN_PATH
    if not os.path.exists(token_path):
        logger.warning(f"Cron token file not found: {token_path}")
        return {}
    with open(token_path, "r") as f:
        token = f.read().strip()
    if not token:
        logger.warning("Cron token file is empty")
        return {}
    return {"Authorization": f"Bearer {token}"}

class CronManager:
    def __init__(self):
        self.scraper = MangaBuffScraper(use_proxy=False)
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
        cron_headers = _get_cron_headers()

        try:
            updates = self.scraper.get_latest_updates(limit=50)
            new_imports = 0
            processed_ids = set()

            for update in updates:
                try:
                    manga_slug = update['manga_id']
                    manga_url = update['manga_url']

                    if not manga_slug or not manga_url:
                        continue

                    if manga_url in processed_ids:
                        logger.debug(f"Skipping duplicate: {update['title']}")
                        continue
                    processed_ids.add(manga_url)

                    manga_id = hashlib.md5(manga_url.encode()).hexdigest()

                    from models import MangaItem
                    existing_manga = db.query(MangaItem).filter(MangaItem.manga_id == manga_id).first()

                    if not existing_manga:
                        if not update.get('latest_chapter'):
                            logger.info(f"Skipping {update['title']} — no chapters detected")
                            continue

                        logger.info(f"New manga found: {update['title']} - importing...")
                        try:
                            import requests
                            response = requests.post(
                                'http://localhost:8000/manga/mass-parse',
                                json={'urls': [manga_url]},
                                headers=cron_headers,
                                timeout=120
                            )
                            if response.status_code == 200:
                                result = response.json()
                                results = result.get('results', [])
                                ch_count = results[0].get('chapters_count', 0) if results else 0
                                if ch_count == 0:
                                    empty = db.query(MangaItem).filter(MangaItem.manga_id == manga_id).first()
                                    if empty:
                                        db.delete(empty)
                                        db.commit()
                                    logger.info(f"Removed {update['title']} — 0 chapters after import")
                                else:
                                    new_imports += 1
                                    logger.info(f"Successfully imported: {update['title']} ({ch_count} chapters)")
                            elif response.status_code == 401:
                                logger.error("Cron token is invalid (401). Regenerate .cron_token!")
                                self.stats['errors'] += 1
                            else:
                                logger.error(f"Failed to import {manga_id}: {response.status_code}")
                                self.stats['errors'] += 1
                        except Exception as e:
                            logger.error(f"Error importing {manga_id}: {e}")
                            self.stats['errors'] += 1
                    else:
                        latest_chapter = update.get('latest_chapter')
                        if latest_chapter:
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
                                pass

                        logger.info(f"Updating: {update['title']} (new chapter: {latest_chapter or 'unknown'})")
                        try:
                            import requests
                            response = requests.post(
                                f'http://localhost:8000/catalog/recrawl-manga/{manga_id}',
                                headers=cron_headers,
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
                            elif response.status_code == 401:
                                logger.error("Cron token is invalid (401). Regenerate .cron_token!")
                                self.stats['errors'] += 1
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
        logger.info("Cleaning up old sessions...")
        pass

    def run_scheduler(self):
        logger.info("Cron scheduler started")
        self.is_running = True

        while self.is_running:
            schedule.run_pending()
            time.sleep(60)

    def start(self):
        if self.is_running:
            logger.warning("Scheduler already running")
            return

        schedule.every(5).minutes.do(self.check_for_updates)
        schedule.every(30).minutes.do(self.prefetch_new_chapter_images)

        self.thread = threading.Thread(target=self.run_scheduler, daemon=True)
        self.thread.start()

        threading.Thread(target=self.check_for_updates, daemon=True).start()

        logger.info("Cron tasks scheduled (immediate + every 5 minutes)")

    def stop(self):
        self.is_running = False
        schedule.clear()
        logger.info("Cron scheduler stopped")

    def get_stats(self):
        return self.stats

    def prefetch_new_chapter_images(self):
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
        logger.info("Manual update triggered")
        threading.Thread(target=self.check_for_updates, daemon=True).start()


cron_manager = CronManager()


if __name__ == "__main__":
    manager = CronManager()
    manager.check_for_updates()
