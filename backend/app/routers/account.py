from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user
from ..models import Notification, Order, User
from ..security import hash_password, verify_password
from ..serializers import notification_out, user_full

router = APIRouter(tags=["account"])


# ---------- account settings ----------
class AccountIn(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=80)
    email: Optional[EmailStr] = None
    color: Optional[str] = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")
    avatar: Optional[str] = Field(None, max_length=300)


@router.put("/me/account")
def update_account(body: AccountIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.name:
        user.name = body.name.strip()
    if body.email and body.email.lower() != user.email:
        email = body.email.lower()
        if db.scalar(select(User).where(User.email == email)):
            raise HTTPException(409, "That email is already in use")
        user.email = email
    if body.color:
        user.color = body.color
    if body.avatar is not None:
        avatar = body.avatar.strip()
        if avatar and not (avatar.startswith("/") or avatar.startswith("https://") or avatar.startswith("http://")):
            raise HTTPException(422, "Avatar must be a URL")
        user.avatar = avatar
    db.commit()
    return user_full(user)


class PasswordIn(BaseModel):
    current: str
    new: str = Field(min_length=8, max_length=100)


@router.post("/me/password")
def change_password(body: PasswordIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current, user.password_hash):
        raise HTTPException(403, "Your current password is incorrect")
    if body.current == body.new:
        raise HTTPException(422, "Choose a password you have not used here")
    user.password_hash = hash_password(body.new)
    db.commit()
    return {"ok": True}


class PrefsIn(BaseModel):
    orders: bool = True
    proposals: bool = True
    messages: bool = True
    announcements: bool = True


@router.put("/me/preferences")
def update_prefs(body: PrefsIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.notify_prefs = body.model_dump()
    db.commit()
    return user.notify_prefs


class DeactivateIn(BaseModel):
    password: str


@router.post("/me/deactivate")
def deactivate(body: DeactivateIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role == "admin":
        raise HTTPException(403, "Admin accounts cannot be deactivated here")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(403, "Password is incorrect")
    col = Order.client_id if user.role == "client" else Order.freelancer_id
    live = db.scalar(select(func.count()).select_from(Order).where(
        col == user.id, Order.status.in_(["funded", "in_progress", "delivered", "revision"])))
    if live:
        raise HTTPException(409, "Finish or cancel your active orders before closing your account")
    user.is_active = False
    user.suspended_reason = "Closed by the account owner"
    db.commit()
    return {"ok": True}


# ---------- notifications ----------
@router.get("/notifications")
def notifications(unread: bool = False, limit: int = 30, before_id: int = 0,
                  user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread:
        stmt = stmt.where(Notification.read.is_(False))
    if before_id:
        stmt = stmt.where(Notification.id < before_id)
    rows = db.scalars(stmt.order_by(Notification.id.desc()).limit(min(limit, 100))).all()
    count = db.scalar(select(func.count()).select_from(Notification).where(
        Notification.user_id == user.id, Notification.read.is_(False)))
    return {"items": [notification_out(n) for n in rows], "unread": count or 0}


class ReadIn(BaseModel):
    ids: list[int] = []
    all: bool = False


@router.post("/notifications/read")
def mark_read(body: ReadIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Notification).where(Notification.user_id == user.id, Notification.read.is_(False))
    if not body.all:
        stmt = stmt.where(Notification.id.in_(body.ids or [0]))
    for n in db.scalars(stmt):
        n.read = True
    db.commit()
    return {"unread": db.scalar(select(func.count()).select_from(Notification).where(
        Notification.user_id == user.id, Notification.read.is_(False))) or 0}
