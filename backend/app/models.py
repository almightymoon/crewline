from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, Numeric, String,
    Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(12))  # 'client' | 'freelancer' | 'admin'
    color: Mapped[str] = mapped_column(String(9), default="#0071e3")
    avatar: Mapped[str] = mapped_column(String(300), default="")
    balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    suspended_reason: Mapped[str] = mapped_column(String(300), default="")
    notify_prefs: Mapped[dict] = mapped_column(JSON, default=lambda: {
        "orders": True, "proposals": True, "messages": True, "announcements": True})
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    freelancer: Mapped[Optional[FreelancerProfile]] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan")
    client: Mapped[Optional[ClientProfile]] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan")


class FreelancerProfile(Base):
    __tablename__ = "freelancer_profiles"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    headline: Mapped[str] = mapped_column(String(140), default="")
    bio: Mapped[str] = mapped_column(Text, default="")
    location: Mapped[str] = mapped_column(String(120), default="")
    category: Mapped[str] = mapped_column(String(20), default="dev")
    skills: Mapped[list] = mapped_column(JSON, default=list)
    hourly_rate: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("0"))
    available: Mapped[bool] = mapped_column(Boolean, default=True)
    rating: Mapped[float] = mapped_column(Float, default=0)
    reviews_count: Mapped[int] = mapped_column(Integer, default=0)
    jobs_completed: Mapped[int] = mapped_column(Integer, default=0)
    languages: Mapped[list] = mapped_column(JSON, default=list)
    experience: Mapped[list] = mapped_column(JSON, default=list)  # [{role, company, period, description}]
    portfolio: Mapped[list] = mapped_column(JSON, default=list)   # [{title, description, link}]
    visible: Mapped[bool] = mapped_column(Boolean, default=True)
    user: Mapped[User] = relationship(back_populates="freelancer")


class ClientProfile(Base):
    __tablename__ = "client_profiles"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    company: Mapped[str] = mapped_column(String(140), default="")
    bio: Mapped[str] = mapped_column(Text, default="")
    location: Mapped[str] = mapped_column(String(120), default="")
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    total_spent: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    website: Mapped[str] = mapped_column(String(200), default="")
    industry: Mapped[str] = mapped_column(String(80), default="")
    user: Mapped[User] = relationship(back_populates="client")


class Gig(Base):
    __tablename__ = "gigs"
    id: Mapped[int] = mapped_column(primary_key=True)
    freelancer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(20), index=True)
    description: Mapped[str] = mapped_column(Text)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    image: Mapped[str] = mapped_column(String(300), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    freelancer: Mapped[User] = relationship()
    packages: Mapped[list[GigPackage]] = relationship(
        back_populates="gig", cascade="all, delete-orphan", order_by="GigPackage.price")


class GigPackage(Base):
    __tablename__ = "gig_packages"
    id: Mapped[int] = mapped_column(primary_key=True)
    gig_id: Mapped[int] = mapped_column(ForeignKey("gigs.id", ondelete="CASCADE"), index=True)
    tier: Mapped[str] = mapped_column(String(12))  # basic | standard | premium
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    delivery_days: Mapped[int] = mapped_column(Integer)
    revisions: Mapped[int] = mapped_column(Integer, default=1)  # -1 = unlimited
    features: Mapped[list] = mapped_column(JSON, default=list)
    gig: Mapped[Gig] = relationship(back_populates="packages")
    __table_args__ = (UniqueConstraint("gig_id", "tier"),)


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(20), index=True)
    description: Mapped[str] = mapped_column(Text)
    skills: Mapped[list] = mapped_column(JSON, default=list)
    budget: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    status: Mapped[str] = mapped_column(String(12), default="open", index=True)  # open | in_progress | closed
    experience_level: Mapped[str] = mapped_column(String(12), default="intermediate")  # entry | intermediate | expert
    duration: Mapped[str] = mapped_column(String(12), default="month")  # week | month | quarter | long
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    client: Mapped[User] = relationship()


class Proposal(Base):
    __tablename__ = "proposals"
    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    freelancer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    bid: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    delivery_days: Mapped[int] = mapped_column(Integer)
    cover_letter: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(12), default="pending")  # pending | accepted | rejected | withdrawn
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    job: Mapped[Job] = relationship()
    freelancer: Mapped[User] = relationship()
    __table_args__ = (UniqueConstraint("job_id", "freelancer_id"),)


class Order(Base):
    """A funded contract. Created from a gig purchase or an accepted proposal."""
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    freelancer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    buyer_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    status: Mapped[str] = mapped_column(String(12), default="funded", index=True)
    # funded | in_progress | delivered | revision | released | cancelled
    gig_id: Mapped[Optional[int]] = mapped_column(ForeignKey("gigs.id", ondelete="SET NULL"))
    job_id: Mapped[Optional[int]] = mapped_column(ForeignKey("jobs.id", ondelete="SET NULL"))
    package: Mapped[Optional[str]] = mapped_column(String(12))
    seller_fee_pct: Mapped[Decimal] = mapped_column(Numeric(6, 4), default=Decimal("0.10"))
    disputed: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    dispute_reason: Mapped[str] = mapped_column(Text, default="")
    dispute_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    dispute_opened_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    resolution_note: Mapped[str] = mapped_column(Text, default="")
    delivery_days: Mapped[int] = mapped_column(Integer, default=7)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    delivered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    released_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    client: Mapped[User] = relationship(foreign_keys=[client_id])
    freelancer: Mapped[User] = relationship(foreign_keys=[freelancer_id])
    review: Mapped[Optional[Review]] = relationship(back_populates="order", uselist=False)
    client_review: Mapped[Optional[ClientReview]] = relationship(back_populates="order", uselist=False)


class Review(Base):
    __tablename__ = "reviews"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), unique=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    freelancer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    order: Mapped[Order] = relationship(back_populates="review")
    client: Mapped[User] = relationship(foreign_keys=[client_id])


class ClientReview(Base):
    """A freelancer's feedback about a client (shown on the client's job posts and profile)."""
    __tablename__ = "client_reviews"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[Optional[int]] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), unique=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    freelancer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    order: Mapped[Optional[Order]] = relationship(back_populates="client_review")
    freelancer: Mapped[User] = relationship(foreign_keys=[freelancer_id])


class Transaction(Base):
    """Wallet ledger. Amounts are signed from the owner's point of view."""
    __tablename__ = "transactions"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # deposit | escrow_hold | refund | earning | withdrawal
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    description: Mapped[str] = mapped_column(String(200), default="")
    order_id: Mapped[Optional[int]] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    freelancer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    client: Mapped[User] = relationship(foreign_keys=[client_id])
    freelancer: Mapped[User] = relationship(foreign_keys=[freelancer_id])
    __table_args__ = (UniqueConstraint("client_id", "freelancer_id"),)


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    body: Mapped[str] = mapped_column(Text)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    __table_args__ = (Index("ix_messages_conv_id", "conversation_id", "id"),)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(24))  # order | proposal | payment | review | dispute | announcement | system
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(String(400), default="")
    link: Mapped[str] = mapped_column(String(160), default="")
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    __table_args__ = (Index("ix_notifications_user", "user_id", "read", "id"),)


class AdminLog(Base):
    __tablename__ = "admin_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    admin_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(40))
    target: Mapped[str] = mapped_column(String(80), default="")
    detail: Mapped[str] = mapped_column(String(400), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    admin: Mapped[Optional[User]] = relationship()


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)
