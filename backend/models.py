from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, DateTime, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="user")  # user, moderator, admin
    status = Column(String, default="active")  # active, banned
    avatar_url = Column(String, default="")
    about = Column(Text, default="")
    birthday = Column(String, default="")
    gender = Column(String, default="")  # "", "male", "female"
    erotic_filter = Column(String, default="hide")  # show, hide, hentai_only
    private_profile = Column(Boolean, default=False)
    allow_trades = Column(Boolean, default=True)
    notify_email = Column(Boolean, default=True)
    notify_vk = Column(Boolean, default=False)
    notify_telegram = Column(Boolean, default=False)
    google_id = Column(String, default="")
    bio = Column(Text, default="")
    profile_banner_url = Column(String, default="")
    profile_theme = Column(String, default="base")
    avatar_frame = Column(String, default="none")
    badge_ids = Column(Text, default="[]")
    showcase_manga_ids = Column(Text, default="[]")
    xp = Column(Integer, default=0)
    level = Column(Integer, default=1)
    last_seen = Column(DateTime, default=None, nullable=True)

    likes = relationship("ChapterLike", back_populates="user")
    views = relationship("ChapterView", back_populates="user")

class ChapterLike(Base):
    __tablename__ = "chapter_likes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    manga_id = Column(String, index=True)
    chapter_id = Column(String, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="likes")

    # Уникальность лайка (один пользователь может лайкнуть главу только один раз)
    __table_args__ = (UniqueConstraint('user_id', 'manga_id', 'chapter_id', name='unique_user_chapter_like'),)

class ChapterView(Base):
    __tablename__ = "chapter_views"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True) # Может быть NULL для анонимов
    ip_address = Column(String, nullable=True) # Для анонимов
    manga_id = Column(String, index=True)
    chapter_id = Column(String, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="views")

    # Уникальность просмотра (по ip для анонимов или по user_id для залогиненных)
    # Здесь сложнее сделать UniqueConstraint в БД, так как user_id может быть null.
    # Будем проверять логикой в коде.

class ChapterMeta(Base):
    __tablename__ = "chapter_meta"
    
    id = Column(Integer, primary_key=True, index=True)
    manga_id = Column(String, index=True)
    chapter_id = Column(String, index=True)
    parsed_date = Column(String) # Дата с сайта (текстом или datetime)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    __table_args__ = (UniqueConstraint('manga_id', 'chapter_id', name='unique_chapter_meta'),)

class MangaView(Base):
    __tablename__ = "manga_views"

    id = Column(Integer, primary_key=True, index=True)
    manga_id = Column(String, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    ip_address = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class MangaRating(Base):
    __tablename__ = "manga_ratings"

    id = Column(Integer, primary_key=True, index=True)
    manga_id = Column(String, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    rating = Column(Integer)  # 1-10
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    __table_args__ = (UniqueConstraint('user_id', 'manga_id', name='unique_user_manga_rating'),)

class MangaBookmark(Base):
    __tablename__ = "manga_bookmarks"

    id = Column(Integer, primary_key=True, index=True)
    manga_id = Column(String, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    status = Column(String)  # Читаю, Буду читать, Прочитано, Отложено, Не интересно, Брошено
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    __table_args__ = (UniqueConstraint('user_id', 'manga_id', name='unique_user_manga_bookmark'),)

class ReadingHistory(Base):
    __tablename__ = "reading_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    manga_id = Column(String, nullable=False, index=True)
    chapter_id = Column(String, nullable=False)
    read_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    __table_args__ = (UniqueConstraint('user_id', 'manga_id', 'chapter_id', name='unique_user_reading_history'),)

class Chapter(Base):
    __tablename__ = "chapters"

    id = Column(Integer, primary_key=True, index=True)
    manga_id = Column(String, index=True, nullable=False)
    chapter_id = Column(String, index=True, nullable=False)
    title = Column(String, default="")
    chapter_number = Column(String, default="")
    date_added = Column(String, default="")
    pages = Column(Text, default="[]")  # JSON array of page URLs
    total_pages = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint('manga_id', 'chapter_id', name='unique_manga_chapter'),)

class WallComment(Base):
    __tablename__ = "wall_comments"

    id = Column(Integer, primary_key=True, index=True)
    profile_user_id = Column(Integer, ForeignKey("users.id"), index=True)  # чья стена
    author_id = Column(Integer, ForeignKey("users.id"))  # кто написал
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    profile_user = relationship("User", foreign_keys=[profile_user_id])
    author = relationship("User", foreign_keys=[author_id])


class MangaComment(Base):
    __tablename__ = "manga_comments"

    id = Column(Integer, primary_key=True, index=True)
    manga_id = Column(String, index=True, nullable=False)
    chapter_id = Column(String, index=True, nullable=True)  # NULL = комментарий к манге, не к главе
    parent_id = Column(Integer, ForeignKey("manga_comments.id"), nullable=True)  # для ответов
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    # parent_comment relationship not needed - we build tree manually in the API


class CommentLike(Base):
    __tablename__ = "comment_likes"

    id = Column(Integer, primary_key=True, index=True)
    comment_id = Column(Integer, ForeignKey("manga_comments.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    __table_args__ = (UniqueConstraint('comment_id', 'user_id', name='unique_comment_like'),)


class Friendship(Base):
    __tablename__ = "friendships"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    friend_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])
    friend = relationship("User", foreign_keys=[friend_id])

    __table_args__ = (UniqueConstraint('user_id', 'friend_id', name='unique_friendship'),)


class UserBlock(Base):
    __tablename__ = "user_blocks"

    id = Column(Integer, primary_key=True, index=True)
    blocker_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    blocked_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    blocker = relationship("User", foreign_keys=[blocker_id])
    blocked = relationship("User", foreign_keys=[blocked_id])

    __table_args__ = (UniqueConstraint('blocker_id', 'blocked_id', name='unique_user_block'),)


class DirectMessage(Base):
    __tablename__ = "direct_messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    text = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    sender = relationship("User", foreign_keys=[sender_id])
    receiver = relationship("User", foreign_keys=[receiver_id])


class WallCommentReply(Base):
    __tablename__ = "wall_comment_replies"

    id = Column(Integer, primary_key=True, index=True)
    wall_comment_id = Column(Integer, ForeignKey("wall_comments.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    wall_comment = relationship("WallComment")
    author = relationship("User")


class MangaItem(Base):
    __tablename__ = "manga_items"

    id = Column(Integer, primary_key=True, index=True)
    manga_id = Column(String, unique=True, index=True)  # MD5 хеш URL
    title = Column(String, nullable=False)
    description = Column(Text, default="")
    cover_url = Column(String, default="")
    source_url = Column(String, default="")
    genres = Column(Text, default="[]")  # JSON-строка
    manga_type = Column(String, default="Manga")  # Manga, Manhwa, Manhua
    year = Column(Integer, default=0)
    status = Column(String, default="В процессе")
    additional_info = Column(Text, default="{}")  # JSON-строка
    chapters = Column(Text, default="[]")  # JSON-строка со списком глав
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Данные с mangabuff для сортировки
    mangabuff_rating = Column(String, default="0")  # Рейтинг с mangabuff (например "9.1")
    mangabuff_views = Column(Integer, default=0)  # Просмотры с mangabuff
    mangabuff_popularity_rank = Column(Integer, default=0)  # Позиция в сортировке "популярные"
    mangabuff_rating_rank = Column(Integer, default=0)  # Позиция в сортировке "по рейтингу"
    mangabuff_newest_rank = Column(Integer, default=0)  # Позиция в сортировке "по новинкам"
    mangabuff_updated_rank = Column(Integer, default=0)  # Позиция в сортировке "обновлённые"


class UserCard(Base):
    __tablename__ = "user_cards"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    manga_id = Column(String, nullable=False, index=True)
    rarity = Column(String, default="common")  # common, rare, epic, legendary
    obtained_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    __table_args__ = (UniqueConstraint('user_id', 'manga_id', name='unique_user_card'),)


class UserNotification(Base):
    __tablename__ = "user_notifications"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    message = Column(Text, nullable=False)
    link = Column(String, default="")
    category = Column(String, default="social")  # updates, social, important
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
