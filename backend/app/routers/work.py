import calendar
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..deps import client_only, current_user, freelancer_only, member_only
from ..models import (
    ClientReview, Gig, Job, Order, Proposal, Review, Transaction, User,
)
from ..serializers import money, order_out, proposal_out, tx_out
from ..services import (
    fund_order, get_or_create_conversation, notify, notify_admins, pay_out, post_message, q,
    refund, seller_net,
)

router = APIRouter(tags=["work"])
LIVE = ["funded", "in_progress", "delivered", "revision"]


def _utcnow():
    return datetime.now(timezone.utc)


# ---------- proposals ----------
class ProposalIn(BaseModel):
    bid: Decimal = Field(ge=5, le=100000)
    delivery_days: int = Field(ge=1, le=180)
    cover_letter: str = Field(min_length=30, max_length=2000)


@router.post("/jobs/{jid}/proposals", status_code=201)
def send_proposal(jid: int, body: ProposalIn, user: User = Depends(freelancer_only),
                  db: Session = Depends(get_db)):
    job = db.get(Job, jid)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "open":
        raise HTTPException(409, "This job is no longer accepting proposals")
    if db.scalar(select(Proposal).where(Proposal.job_id == jid, Proposal.freelancer_id == user.id)):
        raise HTTPException(409, "You already sent a proposal for this job")
    p = Proposal(job_id=jid, freelancer_id=user.id, bid=body.bid, delivery_days=body.delivery_days,
                 cover_letter=body.cover_letter.strip())
    db.add(p)
    conv = get_or_create_conversation(db, job.client_id, user.id)
    post_message(db, conv, user.id, f"Hi, I just sent a proposal for \"{job.title}\".")
    notify(db, job.client_id, "proposal", f"New proposal on \"{job.title}\"",
           f"{user.name} bid ${q(body.bid)} for {body.delivery_days} days.", f"/job/{jid}")
    db.commit()
    return {"id": p.id}


@router.get("/jobs/{jid}/proposals")
def job_proposals(jid: int, user: User = Depends(client_only), db: Session = Depends(get_db)):
    job = db.get(Job, jid)
    if not job or job.client_id != user.id:
        raise HTTPException(404, "Job not found")
    rows = db.scalars(select(Proposal).where(Proposal.job_id == jid, Proposal.status != "withdrawn")
                      .options(selectinload(Proposal.freelancer).selectinload(User.freelancer))
                      .order_by(Proposal.created_at.desc())).all()
    return [proposal_out(p) for p in rows]


@router.get("/me/proposals")
def my_proposals(user: User = Depends(freelancer_only), db: Session = Depends(get_db)):
    rows = db.scalars(select(Proposal).where(Proposal.freelancer_id == user.id).options(
        selectinload(Proposal.freelancer).selectinload(User.freelancer),
        selectinload(Proposal.job).selectinload(Job.client).selectinload(User.client))
        .order_by(Proposal.created_at.desc())).all()
    return [proposal_out(p, with_job=True) for p in rows]


@router.post("/proposals/{pid}/accept")
def accept_proposal(pid: int, user: User = Depends(client_only), db: Session = Depends(get_db)):
    p = db.scalar(select(Proposal).where(Proposal.id == pid)
                  .options(selectinload(Proposal.freelancer)).with_for_update())
    if not p or p.job.client_id != user.id:
        raise HTTPException(404, "Proposal not found")
    if p.status != "pending" or p.job.status != "open":
        raise HTTPException(409, "This proposal can no longer be accepted")
    order = fund_order(db, user, p.freelancer, p.job.title, p.bid, job_id=p.job_id,
                       delivery_days=p.delivery_days)
    p.status = "accepted"
    p.job.status = "in_progress"
    for other in db.scalars(select(Proposal).where(Proposal.job_id == p.job_id, Proposal.id != p.id,
                                                   Proposal.status == "pending")):
        other.status = "rejected"
        notify(db, other.freelancer_id, "proposal", "Proposal not selected",
               f"The client chose another freelancer for \"{p.job.title}\".", f"/job/{p.job_id}")
    conv = get_or_create_conversation(db, user.id, p.freelancer_id)
    post_message(db, conv, user.id, f"I accepted your proposal and funded escrow for \"{p.job.title}\". "
                                    "You can start whenever you are ready.")
    notify(db, p.freelancer_id, "proposal", "You were hired",
           f"{user.name} accepted your proposal for \"{p.job.title}\" and funded escrow.", f"/order/{order.id}")
    db.commit()
    return {"order_id": order.id}


@router.post("/proposals/{pid}/withdraw")
def withdraw_proposal(pid: int, user: User = Depends(freelancer_only), db: Session = Depends(get_db)):
    p = db.get(Proposal, pid)
    if not p or p.freelancer_id != user.id:
        raise HTTPException(404, "Proposal not found")
    if p.status != "pending":
        raise HTTPException(409, "Only pending proposals can be withdrawn")
    p.status = "withdrawn"
    db.commit()
    return {"ok": True}


# ---------- orders ----------
class OrderIn(BaseModel):
    tier: Literal["basic", "standard", "premium"]
    requirements: str = Field("", max_length=2000)


@router.post("/gigs/{gid}/orders", status_code=201)
def buy_gig(gid: int, body: OrderIn, user: User = Depends(client_only), db: Session = Depends(get_db)):
    gig = db.scalar(select(Gig).where(Gig.id == gid, Gig.active.is_(True))
                    .options(selectinload(Gig.packages), selectinload(Gig.freelancer)))
    if not gig or not gig.freelancer.is_active:
        raise HTTPException(404, "Gig not found")
    pkg = next((p for p in gig.packages if p.tier == body.tier), None)
    if not pkg:
        raise HTTPException(422, "Unknown package")
    order = fund_order(db, user, gig.freelancer, f"{gig.title} ({pkg.tier.title()})", pkg.price,
                       gig_id=gig.id, package=pkg.tier, delivery_days=pkg.delivery_days)
    conv = get_or_create_conversation(db, user.id, gig.freelancer_id)
    note = body.requirements.strip()
    post_message(db, conv, user.id, f"I ordered \"{gig.title}\" ({pkg.tier})." + (f"\n\n{note}" if note else ""))
    notify(db, gig.freelancer_id, "order", "New order",
           f"{user.name} ordered \"{gig.title}\" ({pkg.tier}).", f"/order/{order.id}")
    db.commit()
    return {"order_id": order.id}


def _load_order(db: Session, oid: int, user: User) -> Order:
    o = db.scalar(select(Order).where(Order.id == oid).options(
        selectinload(Order.client).selectinload(User.client),
        selectinload(Order.freelancer).selectinload(User.freelancer),
        selectinload(Order.review).selectinload(Review.client)).with_for_update())
    if not o or user.id not in (o.client_id, o.freelancer_id):
        raise HTTPException(404, "Order not found")
    return o


def _no_dispute(o: Order):
    if o.disputed:
        raise HTTPException(409, "This order is under review by Crewline support")


@router.get("/me/orders")
def my_orders(status: Optional[str] = None, user: User = Depends(member_only), db: Session = Depends(get_db)):
    col = Order.client_id if user.role == "client" else Order.freelancer_id
    stmt = select(Order).where(col == user.id).options(
        selectinload(Order.client).selectinload(User.client),
        selectinload(Order.freelancer).selectinload(User.freelancer),
        selectinload(Order.review).selectinload(Review.client))
    if status == "active":
        stmt = stmt.where(Order.status.in_(LIVE))
    elif status:
        stmt = stmt.where(Order.status == status)
    rows = db.scalars(stmt.order_by(Order.created_at.desc())).all()
    return [order_out(o, user) for o in rows]


@router.get("/orders/{oid}")
def order_detail(oid: int, user: User = Depends(member_only), db: Session = Depends(get_db)):
    o = _load_order(db, oid, user)
    conv = get_or_create_conversation(db, o.client_id, o.freelancer_id)
    db.commit()
    return {**order_out(o, user), "conversation_id": conv.id}


class NoteIn(BaseModel):
    note: str = Field("", max_length=1500)


def _note(db, o: Order, sender_id: int, text: str):
    conv = get_or_create_conversation(db, o.client_id, o.freelancer_id)
    post_message(db, conv, sender_id, text)


@router.post("/orders/{oid}/start")
def start_order(oid: int, user: User = Depends(freelancer_only), db: Session = Depends(get_db)):
    o = _load_order(db, oid, user)
    _no_dispute(o)
    if o.freelancer_id != user.id or o.status != "funded":
        raise HTTPException(409, "This order cannot be started")
    o.status = "in_progress"
    _note(db, o, user.id, f"I started work on \"{o.title}\".")
    notify(db, o.client_id, "order", "Work started", f"{user.name} started \"{o.title}\".", f"/order/{o.id}")
    db.commit()
    return order_out(o, user)


@router.post("/orders/{oid}/deliver")
def deliver_order(oid: int, body: NoteIn = NoteIn(), user: User = Depends(freelancer_only),
                  db: Session = Depends(get_db)):
    o = _load_order(db, oid, user)
    _no_dispute(o)
    if o.freelancer_id != user.id or o.status not in ("in_progress", "revision"):
        raise HTTPException(409, "This order cannot be delivered right now")
    o.status = "delivered"
    o.delivered_at = _utcnow()
    _note(db, o, user.id, f"I delivered \"{o.title}\"." + (f"\n\n{body.note.strip()}" if body.note.strip() else ""))
    notify(db, o.client_id, "order", "Work delivered", f"{user.name} delivered \"{o.title}\". Review it and release payment.", f"/order/{o.id}")
    db.commit()
    return order_out(o, user)


@router.post("/orders/{oid}/revise")
def revise_order(oid: int, body: NoteIn = NoteIn(), user: User = Depends(client_only),
                 db: Session = Depends(get_db)):
    o = _load_order(db, oid, user)
    _no_dispute(o)
    if o.client_id != user.id or o.status != "delivered":
        raise HTTPException(409, "You can only request a revision on delivered work")
    o.status = "revision"
    _note(db, o, user.id, "I requested a revision." + (f"\n\n{body.note.strip()}" if body.note.strip() else ""))
    notify(db, o.freelancer_id, "order", "Revision requested", f"{user.name} asked for changes on \"{o.title}\".", f"/order/{o.id}")
    db.commit()
    return order_out(o, user)


@router.post("/orders/{oid}/release")
def release_order(oid: int, user: User = Depends(client_only), db: Session = Depends(get_db)):
    o = _load_order(db, oid, user)
    _no_dispute(o)
    if o.client_id != user.id or o.status != "delivered":
        raise HTTPException(409, "You can only release payment for delivered work")
    net = pay_out(db, o)
    _note(db, o, user.id, "I approved the work and released the payment. Thank you!")
    notify(db, o.freelancer_id, "payment", f"You earned ${net}", f"Payment for \"{o.title}\" is in your wallet.", f"/order/{o.id}")
    db.commit()
    return order_out(o, user)


@router.post("/orders/{oid}/cancel")
def cancel_order(oid: int, user: User = Depends(client_only), db: Session = Depends(get_db)):
    o = _load_order(db, oid, user)
    _no_dispute(o)
    if o.client_id != user.id or o.status != "funded":
        raise HTTPException(409, "Only orders that have not started can be cancelled")
    refund(db, o)
    notify(db, o.freelancer_id, "order", "Order cancelled", f"{user.name} cancelled \"{o.title}\" before it started.", f"/order/{o.id}")
    db.commit()
    return order_out(o, user)


class DisputeIn(BaseModel):
    reason: str = Field(min_length=15, max_length=1500)


@router.post("/orders/{oid}/dispute")
def open_dispute(oid: int, body: DisputeIn, user: User = Depends(member_only), db: Session = Depends(get_db)):
    o = _load_order(db, oid, user)
    if o.disputed:
        raise HTTPException(409, "A dispute is already open on this order")
    if o.status not in LIVE:
        raise HTTPException(409, "Only active orders can be disputed")
    o.disputed = True
    o.dispute_reason = body.reason.strip()
    o.dispute_by = user.id
    o.dispute_opened_at = _utcnow()
    _note(db, o, user.id, "I opened a dispute on this order. Crewline support will review it.")
    other = o.freelancer_id if user.id == o.client_id else o.client_id
    notify(db, other, "dispute", "A dispute was opened", f"{user.name} reported a problem with \"{o.title}\". Support will review it.", f"/order/{o.id}")
    notify_admins(db, "dispute", "New dispute", f"\"{o.title}\" · opened by {user.name}", "/admin/disputes")
    db.commit()
    return order_out(o, user)


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field("", max_length=1000)


@router.post("/orders/{oid}/review", status_code=201)
def review_order(oid: int, body: ReviewIn, user: User = Depends(client_only), db: Session = Depends(get_db)):
    o = _load_order(db, oid, user)
    if o.client_id != user.id or o.status != "released":
        raise HTTPException(409, "You can review an order once payment is released")
    if o.review:
        raise HTTPException(409, "You already reviewed this order")
    db.add(Review(order_id=o.id, client_id=user.id, freelancer_id=o.freelancer_id,
                  rating=body.rating, comment=body.comment.strip()))
    f = o.freelancer.freelancer
    total = f.rating * f.reviews_count + body.rating
    f.reviews_count += 1
    f.rating = round(total / f.reviews_count, 2)
    notify(db, o.freelancer_id, "review", f"New {body.rating}-star review", body.comment.strip()[:160] or f"{user.name} reviewed \"{o.title}\".", f"/freelancer/{o.freelancer_id}")
    db.commit()
    return {"ok": True}


@router.post("/orders/{oid}/client-review", status_code=201)
def review_client(oid: int, body: ReviewIn, user: User = Depends(freelancer_only), db: Session = Depends(get_db)):
    """Freelancer feedback about the client; shown on the client's job posts and profile."""
    o = _load_order(db, oid, user)
    if o.freelancer_id != user.id or o.status != "released":
        raise HTTPException(409, "You can review a client once payment is released")
    if o.client_review:
        raise HTTPException(409, "You already reviewed this client")
    db.add(ClientReview(order_id=o.id, client_id=o.client_id, freelancer_id=user.id,
                        rating=body.rating, comment=body.comment.strip()))
    notify(db, o.client_id, "review", f"New {body.rating}-star review from {user.name}",
           body.comment.strip()[:160] or f"{user.name} reviewed working with you on \"{o.title}\".", f"/client/{o.client_id}")
    db.commit()
    return {"ok": True}


# ---------- wallet ----------
class AmountIn(BaseModel):
    amount: Decimal = Field(gt=0, le=10000)


@router.get("/wallet")
def wallet(user: User = Depends(member_only), db: Session = Depends(get_db)):
    tx = db.scalars(select(Transaction).where(Transaction.user_id == user.id)
                    .order_by(Transaction.created_at.desc(), Transaction.id.desc()).limit(50)).all()
    return {"balance": money(user.balance), "transactions": [tx_out(t) for t in tx]}


@router.post("/wallet/deposit")
def deposit(body: AmountIn, user: User = Depends(client_only), db: Session = Depends(get_db)):
    """Demo top-up. Replace with a Stripe Checkout / PaymentIntent flow in production."""
    amt = q(body.amount)
    user.balance = q(user.balance + amt)
    db.add(Transaction(user_id=user.id, kind="deposit", amount=amt, description="Added funds (demo)"))
    db.commit()
    return {"balance": money(user.balance)}


@router.post("/wallet/withdraw")
def withdraw(body: AmountIn, user: User = Depends(freelancer_only), db: Session = Depends(get_db)):
    """Demo payout. Replace with Stripe Connect transfers in production."""
    amt = q(body.amount)
    u = db.scalar(select(User).where(User.id == user.id).with_for_update())
    if u.balance < amt:
        raise HTTPException(402, "That is more than your available balance")
    u.balance = q(u.balance - amt)
    db.add(Transaction(user_id=u.id, kind="withdrawal", amount=-amt, description="Withdrawal to bank (demo)"))
    db.commit()
    return {"balance": money(u.balance)}


# ---------- dashboards ----------
def _month_series(db: Session, uid: int, kinds: list[str]) -> list[dict]:
    """Last six calendar months of ledger totals (earnings for freelancers, escrow spend for clients)."""
    now = datetime.now(timezone.utc)
    months = []
    for i in range(5, -1, -1):
        y, m = now.year, now.month - i
        while m <= 0:
            m, y = m + 12, y - 1
        months.append((y, m))
    start = datetime(months[0][0], months[0][1], 1, tzinfo=timezone.utc)
    totals = {k: 0.0 for k in months}
    for ts, amt in db.execute(select(Transaction.created_at, Transaction.amount).where(
            Transaction.user_id == uid, Transaction.kind.in_(kinds), Transaction.created_at >= start)):
        if (ts.year, ts.month) in totals:
            totals[(ts.year, ts.month)] += abs(float(amt))
    return [{"month": f"{y}-{m:02d}", "label": calendar.month_abbr[m], "amount": round(totals[(y, m)], 2)}
            for y, m in months]


@router.get("/dashboard")
def dashboard(user: User = Depends(member_only), db: Session = Depends(get_db)):
    col = Order.client_id if user.role == "client" else Order.freelancer_id
    orders = db.scalars(select(Order).where(col == user.id).options(
        selectinload(Order.client).selectinload(User.client),
        selectinload(Order.freelancer).selectinload(User.freelancer),
        selectinload(Order.review).selectinload(Review.client))
        .order_by(Order.created_at.desc())).all()
    live = [o for o in orders if o.status in LIVE]
    if user.role == "client":
        jobs = db.scalars(select(Job).where(Job.client_id == user.id)).all()
        open_ids = [j.id for j in jobs if j.status == "open"]
        pending = db.scalar(select(func.count()).select_from(Proposal).where(
            Proposal.job_id.in_(open_ids), Proposal.status == "pending")) if open_ids else 0
        return {
            "role": "client", "balance": money(user.balance),
            "in_escrow": money(sum(o.amount for o in live)),
            "total_spent": money(user.client.total_spent),
            "active_orders": len(live), "awaiting_review": sum(1 for o in orders if o.status == "delivered" and not o.disputed),
            "open_jobs": len(open_ids), "pending_proposals": pending or 0,
            "disputes": sum(1 for o in live if o.disputed),
            "series": _month_series(db, user.id, ["escrow_hold"]),
            "recent_orders": [order_out(o, user) for o in orders[:5]],
        }
    earned = db.scalar(select(func.coalesce(func.sum(Transaction.amount), 0)).where(
        Transaction.user_id == user.id, Transaction.kind == "earning"))
    pend = db.scalar(select(func.count()).select_from(Proposal).where(
        Proposal.freelancer_id == user.id, Proposal.status == "pending"))
    gigs = db.scalar(select(func.count()).select_from(Gig).where(Gig.freelancer_id == user.id, Gig.active.is_(True)))
    f = user.freelancer
    return {
        "role": "freelancer", "balance": money(user.balance),
        "pending_earnings": money(sum(seller_net(o.amount, o.seller_fee_pct) for o in live)),
        "total_earned": money(earned), "active_orders": len(live),
        "to_deliver": sum(1 for o in live if o.status in ("funded", "in_progress", "revision") and not o.disputed),
        "pending_proposals": pend or 0, "gigs": gigs or 0, "disputes": sum(1 for o in live if o.disputed),
        "rating": f.rating, "reviews_count": f.reviews_count, "jobs_completed": f.jobs_completed,
        "series": _month_series(db, user.id, ["earning"]),
        "recent_orders": [order_out(o, user) for o in orders[:5]],
    }
