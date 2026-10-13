from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import DEFAULT_SETTINGS
from .models import (
    Conversation, Job, Message, Notification, Order, Setting, Transaction, User,
)
from .realtime import queue
from .serializers import message_out, notification_out

CENT = Decimal("0.01")


def q(v) -> Decimal:
    return Decimal(v).quantize(CENT, rounding=ROUND_HALF_UP)


# ---------- platform settings ----------
def get_settings(db: Session) -> dict:
    out = dict(DEFAULT_SETTINGS)
    for row in db.scalars(select(Setting)):
        out[row.key] = row.value.get("v") if isinstance(row.value, dict) else row.value
    return out


def set_setting(db: Session, key: str, value) -> None:
    row = db.get(Setting, key)
    if row:
        row.value = {"v": value}
    else:
        db.add(Setting(key=key, value={"v": value}))


def fee_rates(db: Session) -> tuple[Decimal, Decimal]:
    s = get_settings(db)
    return Decimal(str(s["buyer_fee_pct"])) / 100, Decimal(str(s["seller_fee_pct"])) / 100


# ---------- notifications ----------
_CATEGORY = {"order": "orders", "payment": "orders", "review": "orders", "proposal": "proposals",
             "announcement": "announcements"}


def notify(db: Session, user_id: int, kind: str, title: str, body: str = "", link: str = ""):
    """Create an in-app notification (respecting the user's preferences) and push it live."""
    user = db.get(User, user_id)
    if not user or not user.is_active:
        return None
    cat = _CATEGORY.get(kind)
    if cat and not (user.notify_prefs or {}).get(cat, True):
        return None
    n = Notification(user_id=user_id, kind=kind, title=title[:160], body=body[:400], link=link)
    db.add(n)
    db.flush()
    queue(db, user_id, {"t": "notification", "notification": notification_out(n)})
    return n


def notify_admins(db: Session, kind: str, title: str, body: str = "", link: str = ""):
    for uid in db.scalars(select(User.id).where(User.role == "admin", User.is_active.is_(True))):
        notify(db, uid, kind, title, body, link)


# ---------- conversations ----------
def get_or_create_conversation(db: Session, client_id: int, freelancer_id: int) -> Conversation:
    conv = db.scalar(select(Conversation).where(
        Conversation.client_id == client_id, Conversation.freelancer_id == freelancer_id))
    if not conv:
        conv = Conversation(client_id=client_id, freelancer_id=freelancer_id)
        db.add(conv)
        db.flush()
    return conv


def post_message(db: Session, conv: Conversation, sender_id: int, body: str, cid: str | None = None) -> Message:
    msg = Message(conversation_id=conv.id, sender_id=sender_id, body=body.strip())
    db.add(msg)
    db.flush()
    payload = message_out(msg)
    other = conv.freelancer_id if sender_id == conv.client_id else conv.client_id
    queue(db, sender_id, {"t": "message", "conv": conv.id, "message": payload, "cid": cid})
    queue(db, other, {"t": "message", "conv": conv.id, "message": payload})
    return msg


# ---------- escrow ----------
def fund_order(db: Session, client: User, freelancer: User, title: str, amount: Decimal, *,
               gig_id=None, job_id=None, package=None, delivery_days=7) -> Order:
    """Move price + buyer fee out of the client's wallet and into escrow."""
    buyer_rate, seller_rate = fee_rates(db)
    amount = q(amount)
    fee = q(amount * buyer_rate)
    total = amount + fee
    if client.balance < total:
        raise HTTPException(402, f"Your wallet is ${total - client.balance} short. Add funds to continue.")
    client.balance = q(client.balance - total)
    order = Order(client_id=client.id, freelancer_id=freelancer.id, title=title, amount=amount,
                  buyer_fee=fee, seller_fee_pct=seller_rate, status="funded", gig_id=gig_id,
                  job_id=job_id, package=package, delivery_days=delivery_days)
    db.add(order)
    db.flush()
    db.add(Transaction(user_id=client.id, kind="escrow_hold", amount=-total, order_id=order.id,
                       description=f"Escrow for {title}"))
    return order


def seller_net(amount, pct=Decimal("0.10")) -> Decimal:
    return q(Decimal(amount) * (1 - Decimal(pct)))


def pay_out(db: Session, o: Order) -> Decimal:
    """Release escrow to the freelancer (client approval or admin resolution)."""
    freelancer = db.scalar(select(User).where(User.id == o.freelancer_id).with_for_update())
    client = db.get(User, o.client_id)
    net = seller_net(o.amount, o.seller_fee_pct)
    freelancer.balance = q(freelancer.balance + net)
    db.add(Transaction(user_id=freelancer.id, kind="earning", amount=net, order_id=o.id,
                       description=f"Payment for {o.title}"))
    if freelancer.freelancer:
        freelancer.freelancer.jobs_completed += 1
    if client.client:
        client.client.total_spent = q(client.client.total_spent + o.amount)
    o.status = "released"
    o.released_at = datetime.now(timezone.utc)
    return net


def refund(db: Session, o: Order) -> Decimal:
    """Return the full escrow (price + buyer fee) to the client."""
    client = db.scalar(select(User).where(User.id == o.client_id).with_for_update())
    amt = q(o.amount + o.buyer_fee)
    client.balance = q(client.balance + amt)
    db.add(Transaction(user_id=client.id, kind="refund", amount=amt, order_id=o.id,
                       description=f"Refund for {o.title}"))
    o.status = "cancelled"
    if o.job_id:
        job = db.get(Job, o.job_id)
        if job and job.status == "in_progress":
            job.status = "open"
    return amt
