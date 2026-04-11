#!/usr/bin/env python3
"""
Импорт рамок из frames_data.json в базу данных
"""
import json
import sys
from pathlib import Path
from sqlalchemy.orm import Session
from database import SessionLocal
from models import ShopItem

def import_frames():
    # Путь к JSON файлу
    json_path = Path(__file__).parent.parent / "frontend" / "public" / "Frames_shop" / "frames_data.json"

    if not json_path.exists():
        print(f"Файл не найден: {json_path}")
        sys.exit(1)

    # Загружаем данные
    with open(json_path, 'r', encoding='utf-8') as f:
        frames_data = json.load(f)

    db: Session = SessionLocal()

    try:
        # Удаляем старые рамки из категории 'frame'
        deleted = db.query(ShopItem).filter(ShopItem.category == 'frame').delete()
        print(f"Удалено старых рамок: {deleted}")

        # Добавляем новые рамки
        added = 0
        for frame in frames_data:
            # Пропускаем рамки за уровни (если есть поле required_level > 0)
            if frame.get('required_level', 0) > 0:
                continue

            item = ShopItem(
                key=frame['key'],
                name=frame.get('name', ''),
                description=frame.get('description', 'SPRINGSHOP FRAME'),
                category='frame',
                price=frame.get('price', 1666),
                preview=frame['preview'],
                rarity=frame.get('rarity', 'common')
            )
            db.add(item)
            added += 1

        db.commit()
        print(f"Добавлено новых рамок: {added}")
        print("Импорт завершен успешно!")

    except Exception as e:
        db.rollback()
        print(f"Ошибка при импорте: {e}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    import_frames()
