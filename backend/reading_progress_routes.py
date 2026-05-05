from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from database import SessionLocal
from models import ReadingProgress
from auth import get_current_user
from datetime import datetime

router = APIRouter(prefix="/reading-progress", tags=["reading-progress"])

class ProgressInput(BaseModel):
    manga_id: str
    chapter_id: str
    chapter_number: str = ""
    current_page: int = 1
    total_pages: int = 1

class ProgressOutput(BaseModel):
    manga_id: str
    chapter_id: str
    chapter_number: str
    current_page: int
    total_pages: int
    is_complete: bool
    last_read_at: str

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def _resolve_manga_ids(db, manga_id_param):
    ids = [manga_id_param]
    from sqlalchemy import text
    row = db.execute(text(
        "SELECT slug, manga_id FROM manga_items WHERE manga_id = :v OR slug = :v"
    ), {"v": manga_id_param}).first()
    if row:
        if row[0] and row[0] not in ids:
            ids.append(row[0])
        if row[1] and row[1] not in ids:
            ids.append(row[1])
    return ids

@router.get("", response_model=List[ProgressOutput])
def get_progress(manga_id: Optional[str] = None, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    q = db.query(ReadingProgress).filter(ReadingProgress.user_id == current_user.id)
    if manga_id:
        possible_ids = _resolve_manga_ids(db, manga_id)
        q = q.filter(ReadingProgress.manga_id.in_(possible_ids))
    rows = q.all()
    return [
        ProgressOutput(
            manga_id=r.manga_id,
            chapter_id=r.chapter_id,
            chapter_number=r.chapter_number or "",
            current_page=r.current_page or 1,
            total_pages=r.total_pages or 1,
            is_complete=r.is_complete or False,
            last_read_at=r.last_read_at.isoformat() if r.last_read_at else "",
        )
        for r in rows
    ]

@router.post("")
def upsert_progress(data: ProgressInput, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    is_complete = data.current_page >= data.total_pages
    from sqlalchemy import text
    effective_manga_id = data.manga_id
    row = db.execute(text(
        "SELECT slug FROM manga_items WHERE manga_id = :v OR slug = :v"
    ), {"v": data.manga_id}).first()
    if row and row[0]:
        effective_manga_id = row[0]

    existing = db.query(ReadingProgress).filter(
        ReadingProgress.user_id == current_user.id,
        ReadingProgress.manga_id == effective_manga_id,
        ReadingProgress.chapter_id == data.chapter_id,
    ).first()
    if existing:
        existing.chapter_number = data.chapter_number
        existing.current_page = data.current_page
        existing.total_pages = data.total_pages
        existing.is_complete = is_complete
        existing.last_read_at = datetime.utcnow()
    else:
        existing = ReadingProgress(
            user_id=current_user.id,
            manga_id=effective_manga_id,
            chapter_id=data.chapter_id,
            chapter_number=data.chapter_number,
            current_page=data.current_page,
            total_pages=data.total_pages,
            is_complete=is_complete,
            last_read_at=datetime.utcnow(),
        )
        db.add(existing)
    db.commit()
    return {"status": "ok"}
