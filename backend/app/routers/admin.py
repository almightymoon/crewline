from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..deps import admin_only
from ..models import AdminLog, Gig, Job, Order, Review, Transaction, User
from ..realtime import manager
from ..serializers import iso, money, order_out, user_brief, user_full
from ..services import get_settings, notify, pay_out, q, refund, set_setting

router = APIRouter(prefix="/admin", tags=["admin"])
LIVE = ["funded", "in_progress", "delivered", "revision"]


def log(db: Session, admin: User, action: str, target: str = "", detail: str = ""):
    db.add(AdminLog(admin_id=admin.id, action=action, target=target[:80], detail=detail[:400]))


def _order_loads(stmt):
    return stmt.options(
        selectinload(Order.client).selectinload(User.client),
        selectinload(Order.freelancer).selectinload(User.freelancer),
        selectinload(Order.review).selectinload(Review.client))


# ---------- overview ----------
@router.get("/stats")
def stats(admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=29)
    count = lambda stmt: db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    users = lambda *w: count(select(User.id).where(*w))
    released = db.scalars(select(Order).where(Order.status == "released")).all()
    live = db.scalars(select(Order).where(Order.status.in_(LIVE))).all()
    gmv = sum(o.amount for o in released)
    revenue = sum(o.buyer_fee + q(o.amount * o.seller_fee_pct) for o in released)

    days = [(since + timedelta(days=i)).date() for i in range(30)]
    gmv_by = {d: 0.0 for d in days}
    orders_by = {d: 0 for d in days}
    signups_by = {d: 0 for d in days}
    for o in released:
        if o.released_at and o.released_at.date() in gmv_by:
            gmv_by[o.released_at.date()] += float(o.amount)
    for o in db.scalars(select(Order).where(Order.created_at >= since)):
        if o.created_at.date() in orders_by:
            orders_by[o.created_at.date()] += 1
    for u in db.scalars(select(User).where(User.created_at >= since, User.role != "admin")):
        if u.created_at.date() in signups_by:
            signups_by[u.created_at.date()] += 1

    recent = db.scalars(select(User).where(User.role != "admin").options(
        selectinload(User.freelancer), selectinload(User.client)).order_by(User.id.desc()).limit(6)).all()
    disputes = db.scalars(_order_loads(select(Order).where(Order.disputed.is_(True))
                                       .order_by(Order.dispute_opened_at.desc()).limit(5))).all()
    return {
        "users": {"total": users(User.role != "admin"), "clients": users(User.role == "client"),
                  "freelancers": users(User.role == "freelancer"), "suspended": users(User.is_active.is_(False)),
                  "new_7d": users(User.role != "admin", User.created_at >= now - timedelta(days=7))},
        "gigs": count(select(Gig.id).where(Gig.active.is_(True))),
        "open_jobs": count(select(Job.id).where(Job.status == "open")),
        "orders": {"live": len(live), "released": len(released),
                   "cancelled": count(select(Order.id).where(Order.status == "cancelled")),
                   "disputed": count(select(Order.id).where(Order.disputed.is_(True)))},
        "gmv": money(gmv), "revenue": money(revenue),
        "escrow_held": money(sum(o.amount + o.buyer_fee for o in live)),
        "series": [{"date": d.isoformat(), "gmv": round(gmv_by[d], 2), "orders": orders_by[d],
                    "signups": signups_by[d]} for d in days],
        "recent_users": [user_brief(u) for u in recent],
        "disputes": [order_out(o, admin) for o in disputes],
    }


# ---------- users ----------
def _user_row(u: User, orders: int = 0) -> dict:
    return {**user_brief(u), "email": u.email, "is_active": u.is_active,
            "suspended_reason": u.suspended_reason, "balance": money(u.balance), "orders": orders,
            "created_at": iso(u.created_at), "last_login_at": iso(u.last_login_at)}


@router.get("/users")
def users(q_: Optional[str] = Query(None, alias="q"), role: Optional[str] = None, status: Optional[str] = None,
          limit: int = Query(25, le=100), offset: int = 0, admin: User = Depends(admin_only),
          db: Session = Depends(get_db)):
    stmt = select(User).options(selectinload(User.freelancer), selectinload(User.client))
    if role in ("client", "freelancer", "admin"):
        stmt = stmt.where(User.role == role)
    if status == "suspended":
        stmt = stmt.where(User.is_active.is_(False))
    elif status == "active":
        stmt = stmt.where(User.is_active.is_(True))
    for w in (q_ or "").lower().split()[:5]:
        stmt = stmt.where(or_(User.name.ilike(f"%{w}%"), User.email.ilike(f"%{w}%")))
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    rows = db.scalars(stmt.order_by(User.id.desc()).limit(limit).offset(offset)).all()
    counts = {}
    if rows:
        ids = [u.id for u in rows]
        for col in (Order.client_id, Order.freelancer_id):
            for uid, n in db.execute(select(col, func.count()).where(col.in_(ids)).group_by(col)):
                counts[uid] = counts.get(uid, 0) + n
    return {"total": total, "items": [_user_row(u, counts.get(u.id, 0)) for u in rows]}


@router.get("/users/{uid}")
def user_detail(uid: int, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.id == uid).options(selectinload(User.freelancer), selectinload(User.client)))
    if not u:
        raise HTTPException(404, "User not found")
    col = Order.client_id if u.role == "client" else Order.freelancer_id
    orders = db.scalars(_order_loads(select(Order).where(col == uid).order_by(Order.id.desc()).limit(8))).all() if u.role != "admin" else []
    return {**_user_row(u), "profile": user_full(u).get("profile"),
            "orders_list": [{"id": o.id, "title": o.title, "status": o.status, "amount": money(o.amount),
                             "disputed": o.disputed} for o in orders]}


class ReasonIn(BaseModel):
    reason: str = Field("", max_length=300)


def _target(db, uid, admin) -> User:
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "User not found")
    if u.role == "admin":
        raise HTTPException(403, "Admin accounts cannot be changed here")
    return u


@router.post("/users/{uid}/suspend")
def suspend(uid: int, body: ReasonIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    u = _target(db, uid, admin)
    u.is_active = False
    u.suspended_reason = body.reason.strip() or "Suspended by an administrator"
    log(db, admin, "suspend_user", f"user:{u.id} {u.name}", u.suspended_reason)
    db.commit()
    manager.push(u.id, {"t": "suspended"})
    return {"ok": True}


@router.post("/users/{uid}/reactivate")
def reactivate(uid: int, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    u = _target(db, uid, admin)
    u.is_active = True
    u.suspended_reason = ""
    log(db, admin, "reactivate_user", f"user:{u.id} {u.name}")
    db.commit()
    return {"ok": True}


class VerifyIn(BaseModel):
    verified: bool


@router.post("/users/{uid}/verify")
def verify(uid: int, body: VerifyIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    u = _target(db, uid, admin)
    if not u.client:
        raise HTTPException(422, "Only clients have payment verification")
    u.client.verified = body.verified
    log(db, admin, "verify_client" if body.verified else "unverify_client", f"user:{u.id} {u.name}")
    db.commit()
    return {"ok": True}


# ---------- gigs and jobs ----------
@router.get("/gigs")
def admin_gigs(q_: Optional[str] = Query(None, alias="q"), limit: int = Query(50, le=100),
               admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    stmt = select(Gig).options(selectinload(Gig.packages), selectinload(Gig.freelancer).selectinload(User.freelancer))
    for w in (q_ or "").lower().split()[:5]:
        stmt = stmt.where(Gig.title.ilike(f"%{w}%"))
    from ..serializers import gig_out
    return [gig_out(g) for g in db.scalars(stmt.order_by(Gig.id.desc()).limit(limit))]


@router.post("/gigs/{gid}/toggle")
def toggle_gig(gid: int, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    g = db.get(Gig, gid)
    if not g:
        raise HTTPException(404, "Gig not found")
    g.active = not g.active
    log(db, admin, "disable_gig" if not g.active else "enable_gig", f"gig:{g.id}", g.title)
    notify(db, g.freelancer_id, "system", "Your gig was " + ("removed by support" if not g.active else "restored"), g.title)
    db.commit()
    return {"active": g.active}


@router.get("/jobs")
def admin_jobs(q_: Optional[str] = Query(None, alias="q"), status: Optional[str] = None, limit: int = Query(50, le=100),
               admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    from ..serializers import job_out
    stmt = select(Job).options(selectinload(Job.client).selectinload(User.client))
    if status:
        stmt = stmt.where(Job.status == status)
    for w in (q_ or "").lower().split()[:5]:
        stmt = stmt.where(Job.title.ilike(f"%{w}%"))
    return [job_out(j) for j in db.scalars(stmt.order_by(Job.id.desc()).limit(limit))]


@router.post("/jobs/{jid}/close")
def close_job(jid: int, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    j = db.get(Job, jid)
    if not j:
        raise HTTPException(404, "Job not found")
    j.status = "closed"
    log(db, admin, "close_job", f"job:{j.id}", j.title)
    notify(db, j.client_id, "system", "Your job was closed by support", j.title, f"/job/{j.id}")
    db.commit()
    return {"ok": True}


# ---------- orders, disputes, money ----------
@router.get("/orders")
def admin_orders(status: Optional[str] = None, disputed: Optional[bool] = None, q_: Optional[str] = Query(None, alias="q"),
                 limit: int = Query(50, le=100), admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    stmt = _order_loads(select(Order))
    if status:
        stmt = stmt.where(Order.status == status)
    if disputed is not None:
        stmt = stmt.where(Order.disputed.is_(disputed))
    for w in (q_ or "").lower().split()[:5]:
        stmt = stmt.where(Order.title.ilike(f"%{w}%"))
    return [order_out(o, admin) for o in db.scalars(stmt.order_by(Order.id.desc()).limit(limit))]


class ResolveIn(BaseModel):
    decision: Literal["release", "refund"]
    note: str = Field(min_length=5, max_length=600)


@router.post("/orders/{oid}/resolve")
def resolve(oid: int, body: ResolveIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    o = db.scalar(_order_loads(select(Order).where(Order.id == oid)).with_for_update())
    if not o or not o.disputed:
        raise HTTPException(404, "No open dispute on that order")
    if body.decision == "release":
        net = pay_out(db, o)
        msg_c = f"Support released the payment to {o.freelancer.name}."
        msg_f = f"Support resolved the dispute in your favour. ${net} was added to your wallet."
    else:
        refund(db, o)
        msg_c = "Support resolved the dispute and refunded your payment in full."
        msg_f = "Support resolved the dispute and refunded the client."
    o.disputed = False
    o.resolution_note = body.note.strip()
    log(db, admin, "resolve_dispute", f"order:{o.id}", f"{body.decision}: {body.note}")
    notify(db, o.client_id, "dispute", "Dispute resolved", f"{msg_c} {body.note.strip()}"[:400], f"/order/{o.id}")
    notify(db, o.freelancer_id, "dispute", "Dispute resolved", f"{msg_f} {body.note.strip()}"[:400], f"/order/{o.id}")
    db.commit()
    return order_out(o, admin)


@router.post("/orders/{oid}/refund")
def force_refund(oid: int, body: ReasonIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    o = db.scalar(_order_loads(select(Order).where(Order.id == oid)).with_for_update())
    if not o or o.status not in LIVE:
        raise HTTPException(409, "Only active orders can be refunded")
    refund(db, o)
    o.disputed = False
    o.resolution_note = body.reason.strip() or "Refunded by an administrator"
    log(db, admin, "force_refund", f"order:{o.id}", o.resolution_note)
    notify(db, o.client_id, "system", "Order refunded", f"\"{o.title}\" was refunded by support.", f"/order/{o.id}")
    notify(db, o.freelancer_id, "system", "Order cancelled by support", f"\"{o.title}\" was refunded to the client.", f"/order/{o.id}")
    db.commit()
    return order_out(o, admin)


@router.get("/transactions")
def transactions(kind: Optional[str] = None, limit: int = Query(60, le=200), admin: User = Depends(admin_only),
                 db: Session = Depends(get_db)):
    stmt = select(Transaction, User.name).join(User, User.id == Transaction.user_id)
    if kind:
        stmt = stmt.where(Transaction.kind == kind)
    rows = db.execute(stmt.order_by(Transaction.id.desc()).limit(limit)).all()
    return [{"id": t.id, "kind": t.kind, "amount": money(t.amount), "description": t.description,
             "user": name, "order_id": t.order_id, "created_at": iso(t.created_at)} for t, name in rows]


# ---------- announcements, settings, logs ----------
class AnnounceIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    body: str = Field("", max_length=380)
    audience: Literal["all", "client", "freelancer"] = "all"


@router.post("/announcements")
def announce(body: AnnounceIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    stmt = select(User.id).where(User.role != "admin", User.is_active.is_(True))
    if body.audience != "all":
        stmt = stmt.where(User.role == body.audience)
    n = 0
    for uid in db.scalars(stmt).all():
        if notify(db, uid, "announcement", body.title, body.body):
            n += 1
    log(db, admin, "announcement", f"audience:{body.audience}", body.title)
    db.commit()
    return {"delivered": n}


class SettingsIn(BaseModel):
    buyer_fee_pct: float = Field(ge=0, le=30)
    seller_fee_pct: float = Field(ge=0, le=30)
    signups_enabled: bool


@router.get("/settings")
def get_platform_settings(admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    return get_settings(db)


@router.put("/settings")
def put_platform_settings(body: SettingsIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    before = get_settings(db)
    for k, v in body.model_dump().items():
        set_setting(db, k, v)
    log(db, admin, "update_settings", "platform", f"{before} -> {body.model_dump()}")
    db.commit()
    return get_settings(db)


@router.get("/logs")
def logs(limit: int = Query(100, le=300), admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    rows = db.scalars(select(AdminLog).options(selectinload(AdminLog.admin)).order_by(AdminLog.id.desc()).limit(limit)).all()
    return [{"id": r.id, "admin": r.admin.name if r.admin else "Deleted admin", "action": r.action,
             "target": r.target, "detail": r.detail, "created_at": iso(r.created_at)} for r in rows]
