from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, DateTime, Date, Text, UniqueConstraint, Float
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
    status = Column(String, default="active")  # active, banned, frozen
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
    yandex_id = Column(String, default="")
    telegram_id = Column(String, default="")
    telegram_username = Column(String, default="")
    bio = Column(Text, default="")
    profile_banner_url = Column(String, default="")
    profile_background_url = Column(String, default="")
    profile_theme = Column(String, default="base")
    avatar_frame = Column(String, default="none")
    badge_ids = Column(Text, default="[]")
    showcase_manga_ids = Column(Text, default="[]")
    xp = Column(Integer, default=0)
    level = Column(Integer, default=1)
    last_seen = Column(DateTime, default=None, nullable=True)
    scrap = Column(Integer, default=0)
    donated_scrap = Column(Integer, default=0)
    active_title = Column(String, default="")
    sound_enabled = Column(Boolean, default=False)
    nickname_color = Column(String, default="")  # HEX color for mythic nickname
    nickname_font = Column(String, default="")  # Google Font for mythic nickname
    last_scrap_daily = Column(Date, default=None, nullable=True)
    scrap_comments_today = Column(Integer, default=0)
    scrap_comments_date = Column(Date, default=None, nullable=True)
    subscription_type = Column(String, default="")  # "" or "springpro"
    subscription_expires_at = Column(DateTime, nullable=True)
    warnings_count = Column(Integer, default=0)
    warning_shown_at = Column(DateTime, nullable=True)
    muted_until = Column(DateTime, nullable=True)

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
    chapter_id = Column(String, index=True, nullable=True)
    parent_id = Column(Integer, ForeignKey("manga_comments.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    text = Column(Text, nullable=False)
    status = Column(String, default="approved", index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")


class CommentLike(Base):
    __tablename__ = "comment_likes"

    id = Column(Integer, primary_key=True, index=True)
    comment_id = Column(Integer, ForeignKey("manga_comments.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    __table_args__ = (UniqueConstraint('comment_id', 'user_id', name='unique_comment_like'),)


class CommentReport(Base):
    __tablename__ = "comment_reports"

    id = Column(Integer, primary_key=True, index=True)
    comment_id = Column(Integer, ForeignKey("manga_comments.id", ondelete="CASCADE"), nullable=False, index=True)
    reporter_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    reason = Column(String, default="spam")
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint('comment_id', 'reporter_id', name='unique_comment_report'),)


class UserWarning(Base):
    __tablename__ = "user_warnings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    reason = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])
    admin = relationship("User", foreign_keys=[admin_id])


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
    slug = Column(String, unique=True, index=True, nullable=True)  # URL-friendly slug
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
    updated_at = Column(DateTime, default=datetime.utcnow)  # Обновляется при добавлении новых глав

    # Данные с mangabuff для сортировки
    mangabuff_rating = Column(String, default="0")  # Рейтинг с mangabuff (например "9.1")
    mangabuff_views = Column(Integer, default=0)  # Просмотры с mangabuff
    mangabuff_popularity_rank = Column(Integer, default=0)  # Позиция в сортировке "популярные"
    mangabuff_rating_rank = Column(Integer, default=0)  # Позиция в сортировке "по рейтингу"
    mangabuff_newest_rank = Column(Integer, default=0)  # Позиция в сортировке "по новинкам"
    mangabuff_updated_rank = Column(Integer, default=0)  # Позиция в сортировке "обновлённые"
    hidden = Column(Boolean, default=False)


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


class ShopItem(Base):
    __tablename__ = "shop_items"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    category = Column(String, default="sticker")  # avatar, frame, cover, background, sticker, status, skin, personalization, springpro
    price = Column(Integer, default=0)
    preview = Column(String, default="")  # preview image or color code
    rarity = Column(String, default="common")  # common, rare, epic, mythic
    css_variables = Column(Text, default="{}")  # JSON with CSS variables
    block_style = Column(String, default="none")  # none, neon-border, rusted-metal-bg, glassmorphism
    nickname_effect = Column(String, default="none")  # none, gradient-pulse, toxic-glitch, custom-color
    font_family = Column(String, default="")  # Google Font for mythic skins
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # NULL = global, set = personal item
    required_level = Column(Integer, default=0)  # Level requirement for frames


class UserPurchase(Base):
    __tablename__ = "user_purchases"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    item_key = Column(String, nullable=False, index=True)
    purchased_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    __table_args__ = (UniqueConstraint('user_id', 'item_key', name='unique_user_purchase'),)


class PersonalizationRequest(Base):
    __tablename__ = "personalization_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String, nullable=False)  # avatar, cover, video_cover, status
    file_url = Column(String, default="")
    text_value = Column(String, default="")  # for status type
    status = Column(String, default="pending")  # pending, approved, rejected
    price = Column(Integer, default=2000)
    created_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)

    user = relationship("User")


class SiteSetting(Base):
    __tablename__ = "site_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True, nullable=False)
    value = Column(Text, default="")


class PaymentTransaction(Base):
    __tablename__ = "payment_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    payment_id = Column(String, unique=True)
    type = Column(String)  # "scrap" | "springpro"
    amount_rub = Column(Float)
    scrap_amount = Column(Integer, default=0)
    package_id = Column(String, nullable=True)
    status = Column(String, default="pending")  # pending/completed/failed
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    user = relationship("User")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    admin_username = Column(String, nullable=False)
    action = Column(String, nullable=False)
    target = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class ScrapTransaction(Base):
    __tablename__ = "scrap_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    username = Column(String, nullable=False)
    amount = Column(Integer, nullable=False)
    reason = Column(String, default="")
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Promocode(Base):
    __tablename__ = "promocodes"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=False)
    discount_percent = Column(Integer, default=0)
    fixed_scrap = Column(Integer, default=0)
    expires_at = Column(String, nullable=True)
    usage_limit = Column(Integer, default=100)
    usage_count = Column(Integer, default=0)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class LoginHistory(Base):
    __tablename__ = "login_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    username = Column(String, default="-")
    ip = Column(String, nullable=False)
    status = Column(String, default="OK")
    created_at = Column(DateTime, default=datetime.utcnow)


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    user_email = Column(String, nullable=False)
    manga_id = Column(String, nullable=False)
    manga_title = Column(String, default="")
    reason = Column(String, default="")
    message = Column(Text, default="")
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String, unique=True, index=True)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
