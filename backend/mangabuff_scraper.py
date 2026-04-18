import requests
from bs4 import BeautifulSoup
import json
import os
from datetime import datetime
from typing import List, Dict, Optional
import logging
import re

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MangaBuffScraper:
    def __init__(self, use_proxy: bool = False):
        self.base_url = "https://mangabuff.ru"

        # Настройка HTTP прокси
        self.use_proxy = use_proxy
        self.proxy = None

        if use_proxy:
            # HTTP прокси с авторизацией
            self.proxy = {
                'http': 'http://tube_vpn:tube_vpn@95.85.242.196:53671',
                'https': 'http://tube_vpn:tube_vpn@95.85.242.196:53671'
            }
            logger.info("Using HTTP proxy: 95.85.242.196:53671")
        else:
            logger.info("Proxy disabled, direct connection")

        # Используем обычный requests вместо cloudscraper
        self.session = requests.Session()

        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }

    def get_latest_updates(self, limit: int = 20) -> List[Dict]:
        """Получить последние обновления из секции 'Обновления' на главной странице"""
        max_retries = 3
        for attempt in range(max_retries):
            try:
                url = f"{self.base_url}/"

                response = self.session.get(
                    url,
                    headers=self.headers,
                    timeout=60,
                    proxies=self.proxy if self.use_proxy else None
                )
                response.raise_for_status()

                soup = BeautifulSoup(response.text, 'lxml')
                updates = []

                # Ищем контейнер обновлений
                updates_container = soup.find('div', class_='updates')

                if updates_container:
                    logger.info("Found updates container")

                    # Находим все элементы обновлений
                    update_items = updates_container.find_all('div', class_='updates__item', limit=limit)

                    logger.info(f"Found {len(update_items)} update items")

                    for item in update_items:
                        try:
                            # Находим ссылку на мангу
                            name_link = item.find('a', class_='updates__name')

                            if not name_link:
                                continue

                            manga_url = name_link.get('href', '')
                            if not manga_url.startswith('http'):
                                manga_url = self.base_url + manga_url

                            manga_id = manga_url.rstrip('/').split('/')[-1]
                            title = name_link.get_text(strip=True)

                            # Извлекаем номер последней главы из updates__chapter
                            chapter_num = None
                            chapter_url = None
                            chapter_link = item.find('a', class_='updates__chapter')
                            if chapter_link:
                                chapter_url = chapter_link.get('href', '')
                                if not chapter_url.startswith('http'):
                                    chapter_url = self.base_url + chapter_url
                                # Номер главы из URL: /manga/slug/vol/chapter
                                ch_match = re.search(r'/(\d+(?:\.\d+)?)/?$', chapter_url)
                                if ch_match:
                                    chapter_num = ch_match.group(1)
                                else:
                                    # Из текста: "Том 1. Глава 129"
                                    ch_text = chapter_link.get_text(strip=True)
                                    ch_text_match = re.search(r'(?:Глава|Chapter)\s*(\d+(?:\.\d+)?)', ch_text, re.IGNORECASE)
                                    if ch_text_match:
                                        chapter_num = ch_text_match.group(1)

                            # Дата обновления
                            time_el = item.find('div', class_='updates__time')
                            update_date = time_el.get_text(strip=True) if time_el else None

                            updates.append({
                                'manga_id': manga_id,
                                'title': title,
                                'manga_url': manga_url,
                                'latest_chapter': chapter_num,
                                'chapter_url': chapter_url,
                                'update_date': update_date,
                                'scraped_at': datetime.utcnow().isoformat()
                            })

                        except Exception as e:
                            logger.error(f"Error parsing update item: {e}")
                            continue

                if not updates:
                    logger.warning("Could not find updates, falling back to all manga links")
                    # Fallback - берем первые ссылки на мангу
                    manga_links = soup.find_all('a', href=lambda x: x and '/manga/' in x, limit=limit)
                    seen = set()
                    for link in manga_links:
                        manga_url = link.get('href', '')
                        if not manga_url.startswith('http'):
                            manga_url = self.base_url + manga_url

                        manga_id = manga_url.rstrip('/').split('/')[-1]
                        if manga_id in seen:
                            continue
                        seen.add(manga_id)

                        title = link.get('title', '') or link.get_text(strip=True)
                        updates.append({
                            'manga_id': manga_id,
                            'title': title,
                            'manga_url': manga_url,
                            'latest_chapter': None,
                            'chapter_url': None,
                            'update_date': None,
                            'scraped_at': datetime.utcnow().isoformat()
                        })

                logger.info(f"Found {len(updates)} manga updates")
                return updates

            except Exception as e:
                logger.error(f"Error fetching updates (attempt {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    import time
                    time.sleep(5)
                    continue
                return []

    def get_manga_chapters(self, manga_id: str) -> List[Dict]:
        """Получить список всех глав конкретной манги"""
        try:
            url = f"{self.base_url}/manga/{manga_id}"
            response = self.session.get(
                url,
                headers=self.headers,
                timeout=30,
                proxies=self.proxy if self.use_proxy else None
            )
            response.raise_for_status()

            soup = BeautifulSoup(response.text, 'lxml')
            chapters = []

            # Ищем список глав
            chapter_items = soup.select('.chapter-item, .chapters-list li, .chapter-row')

            for item in chapter_items:
                try:
                    link = item.select_one('a')
                    if not link:
                        continue

                    chapter_url = link.get('href', '')
                    if not chapter_url.startswith('http'):
                        chapter_url = self.base_url + chapter_url

                    chapter_title = link.get_text(strip=True)

                    # Извлекаем номер главы
                    import re
                    match = re.search(r'(\d+(?:\.\d+)?)', chapter_title)
                    chapter_num = match.group(1) if match else None

                    # Дата
                    date_elem = item.select_one('.date, time')
                    chapter_date = date_elem.get_text(strip=True) if date_elem else None

                    chapters.append({
                        'chapter_num': chapter_num,
                        'chapter_title': chapter_title,
                        'chapter_url': chapter_url,
                        'chapter_date': chapter_date
                    })

                except Exception as e:
                    logger.error(f"Error parsing chapter: {e}")
                    continue

            logger.info(f"Found {len(chapters)} chapters for {manga_id}")
            return chapters

        except Exception as e:
            logger.error(f"Error fetching chapters for {manga_id}: {e}")
            return []

    def get_chapter_images(self, chapter_url: str) -> List[str]:
        """Получить список изображений главы"""
        try:
            response = self.scraper.get(
                chapter_url,
                headers=self.headers,
                timeout=30,
                proxies=self.proxy if self.use_proxy else None
            )
            response.raise_for_status()

            soup = BeautifulSoup(response.text, 'lxml')
            images = []

            # Ищем изображения страниц
            img_elements = soup.select('.page-image img, .reader-image img, #reader img')

            for img in img_elements:
                src = img.get('src') or img.get('data-src') or img.get('data-lazy')
                if src:
                    if not src.startswith('http'):
                        src = self.base_url + src
                    images.append(src)

            # Альтернативный способ: поиск в скриптах
            if not images:
                scripts = soup.find_all('script')
                for script in scripts:
                    if script.string and ('images' in script.string or 'pages' in script.string):
                        try:
                            import re
                            # Ищем массив изображений в JS
                            match = re.search(r'(?:images|pages)\s*[:=]\s*(\[.*?\])', script.string, re.DOTALL)
                            if match:
                                images_data = json.loads(match.group(1))
                                images = [img if isinstance(img, str) else img.get('url', '') for img in images_data]
                                break
                        except:
                            continue

            logger.info(f"Found {len(images)} images in chapter")
            return images

        except Exception as e:
            logger.error(f"Error fetching chapter images: {e}")
            return []


if __name__ == "__main__":
    # Тест парсера
    scraper = MangaBuffScraper()
    updates = scraper.get_latest_updates(limit=5)

    print(f"\n=== Latest {len(updates)} updates ===")
    for update in updates:
        print(f"\n{update['title']}")
        print(f"  ID: {update['manga_id']}")
        print(f"  Chapter: {update['chapter_num']}")
        print(f"  Date: {update['update_date']}")
        print(f"  URL: {update['manga_url']}")
