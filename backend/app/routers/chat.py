from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..deps import current_user, member_only
from ..models import Conversation, Message, User
from ..realtime import manager, queue
from ..serializers import conversation_out, message_out, user_brief
from ..services import get_or_create_conversation, post_message

router = APIRouter(tags=["messages"])


def load_conv(db: Session, cid: int, user: User) -> Conversation:
    c = db.scalar(select(Conversation).where(Conversation.id == cid).options(
        selectinload(Conversation.client).selectinload(User.client),
        selectinload(Conversation.freelancer).selectinload(User.freelancer)))
    if not c or user.id not in (c.client_id, c.freelancer_id):
        raise HTTPException(404, "Conversation not found")
    return c


def unread_total(db: Session, uid: int) -> int:
    return db.scalar(select(func.count()).select_from(Message).join(
        Conversation, Conversation.id == Message.conversation_id).where(
        or_(Conversation.client_id == uid, Conversation.freelancer_id == uid),
        Message.sender_id != uid, Message.read.is_(False))) or 0


def mark_conversation_read(db: Session, c: Conversation, uid: int) -> int | None:
    """Mark the other person's messages read. Returns the highest id marked, or None."""
    ids = db.scalars(select(Message.id).where(
        Message.conversation_id == c.id, Message.sender_id != uid, Message.read.is_(False))).all()
    if not ids:
        return None
    now = datetime.now(timezone.utc)
    db.execute(update(Message).where(Message.id.in_(ids)).values(read=True, read_at=now))
    other = c.freelancer_id if uid == c.client_id else c.client_id
    queue(db, other, {"t": "read", "conv": c.id, "by": uid, "upto": max(ids)})
    queue(db, uid, {"t": "unread", "count": unread_total(db, uid)})
    return max(ids)


@router.get("/conversations")
def conversations(user: User = Depends(member_only), db: Session = Depends(get_db)):
    rows = db.scalars(select(Conversation).where(
        or_(Conversation.client_id == user.id, Conversation.freelancer_id == user.id)).options(
        selectinload(Conversation.client).selectinload(User.client),
        selectinload(Conversation.freelancer).selectinload(User.freelancer))).all()
    out = []
    for c in rows:
        last = db.scalar(select(Message).where(Message.conversation_id == c.id).order_by(Message.id.desc()).limit(1))
        unread = db.scalar(select(func.count()).select_from(Message).where(
            Message.conversation_id == c.id, Message.sender_id != user.id, Message.read.is_(False)))
        other_id = c.freelancer_id if user.id == c.client_id else c.client_id
        out.append(conversation_out(c, user, last, unread or 0, manager.online(other_id)))
    out.sort(key=lambda x: x["last_message"]["id"] if x["last_message"] else 0, reverse=True)
    return out


class StartIn(BaseModel):
    user_id: int
    message: str = Field("", max_length=2000)


@router.post("/conversations", status_code=201)
def start_conversation(body: StartIn, user: User = Depends(member_only), db: Session = Depends(get_db)):
    other = db.get(User, body.user_id)
    if not other or other.role == user.role or other.role == "admin" or not other.is_active:
        raise HTTPException(422, "Clients and freelancers can message each other")
    client_id, freelancer_id = (user.id, other.id) if user.role == "client" else (other.id, user.id)
    conv = get_or_create_conversation(db, client_id, freelancer_id)
    if body.message.strip():
        post_message(db, conv, user.id, body.message)
    db.commit()
    return {"id": conv.id}


@router.get("/conversations/{cid}/messages")
def messages(cid: int, after_id: int = 0, before_id: int = 0, limit: int = 50,
             user: User = Depends(member_only), db: Session = Depends(get_db)):
    """Latest page by default; `before_id` loads older history; `after_id` is the polling fallback."""
    c = load_conv(db, cid, user)
    limit = max(1, min(limit, 100))
    stmt = select(Message).where(Message.conversation_id == cid)
    if after_id:
        rows = db.scalars(stmt.where(Message.id > after_id).order_by(Message.id).limit(200)).all()
        more = False
    else:
        if before_id:
            stmt = stmt.where(Message.id < before_id)
        page = db.scalars(stmt.order_by(Message.id.desc()).limit(limit + 1)).all()
        more = len(page) > limit
        rows = list(reversed(page[:limit]))
    if not before_id:
        mark_conversation_read(db, c, user.id)
        db.commit()
    other = c.freelancer if user.id == c.client_id else c.client
    return {"other": {**user_brief(other), "online": manager.online(other.id)},
            "messages": [message_out(m) for m in rows], "has_more": more}


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


@router.post("/conversations/{cid}/messages", status_code=201)
def send(cid: int, body: MessageIn, user: User = Depends(member_only), db: Session = Depends(get_db)):
    c = load_conv(db, cid, user)
    if not body.body.strip():
        raise HTTPException(422, "Write a message first")
    m = post_message(db, c, user.id, body.body)
    db.commit()
    return message_out(m)


@router.post("/conversations/{cid}/read")
def read(cid: int, user: User = Depends(member_only), db: Session = Depends(get_db)):
    c = load_conv(db, cid, user)
    mark_conversation_read(db, c, user.id)
    db.commit()
    return {"unread": unread_total(db, user.id)}


@router.get("/messages/unread")
def unread(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {"count": 0 if user.role == "admin" else unread_total(db, user.id)}
