from datetime import timezone
from decimal import Decimal

from .models import (
    Conversation, Gig, Job, Message, Notification, Order, Proposal, Review, Transaction, User,
)


def money(v) -> float:
    return float(Decimal(v or 0).quantize(Decimal("0.01")))


def iso(dt):
    if not dt:
        return None
    if dt.tzinfo is None:  # SQLite drops the timezone; everything is stored as UTC
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def user_brief(u: User) -> dict:
    d = {"id": u.id, "name": u.name, "role": u.role, "color": u.color, "avatar": u.avatar or ""}
    if u.freelancer:
        f = u.freelancer
        d.update(headline=f.headline, rating=f.rating, reviews_count=f.reviews_count,
                 location=f.location)
    if u.client:
        d.update(company=u.client.company, verified=u.client.verified, location=u.client.location)
    return d


def user_full(u: User) -> dict:
    d = user_brief(u)
    d["email"] = u.email
    d["created_at"] = iso(u.created_at)
    d["is_active"] = u.is_active
    d["notify_prefs"] = u.notify_prefs or {}
    if u.freelancer:
        f = u.freelancer
        d["profile"] = {
            "headline": f.headline, "bio": f.bio, "location": f.location,
            "category": f.category, "skills": f.skills, "hourly_rate": money(f.hourly_rate),
            "available": f.available, "rating": f.rating, "reviews_count": f.reviews_count,
            "jobs_completed": f.jobs_completed, "languages": f.languages or [],
            "experience": f.experience or [], "portfolio": f.portfolio or [], "visible": f.visible,
        }
    if u.client:
        c = u.client
        d["profile"] = {
            "company": c.company, "bio": c.bio, "location": c.location,
            "verified": c.verified, "total_spent": money(c.total_spent),
            "website": c.website, "industry": c.industry,
        }
    return d


def gig_out(g: Gig, detail: bool = False) -> dict:
    pk = [{"tier": p.tier, "price": money(p.price), "delivery_days": p.delivery_days,
           "revisions": p.revisions, "features": p.features} for p in g.packages]
    d = {
        "id": g.id, "title": g.title, "category": g.category, "tags": g.tags, "active": g.active,
        "image": g.image or "",
        "from_price": min((p["price"] for p in pk), default=0),
        "min_days": min((p["delivery_days"] for p in pk), default=0),
        "freelancer": user_brief(g.freelancer),
        "packages": pk,
    }
    if detail:
        d["description"] = g.description
        d["skills"] = g.freelancer.freelancer.skills if g.freelancer.freelancer else []
        d["bio"] = g.freelancer.freelancer.bio if g.freelancer.freelancer else ""
    return d


def job_out(j: Job, proposals_count: int = 0, stats: dict | None = None, applied: str | None = None) -> dict:
    d = {
        "id": j.id, "title": j.title, "category": j.category, "description": j.description,
        "skills": j.skills, "budget": money(j.budget), "status": j.status,
        "experience_level": j.experience_level, "duration": j.duration,
        "created_at": iso(j.created_at), "proposals_count": proposals_count,
        "client": user_brief(j.client),
    }
    if stats is not None:
        d["client_stats"] = stats
    if applied is not None:
        d["applied"] = applied
    return d


def client_review_out(r) -> dict:
    return {"id": r.id, "rating": r.rating, "comment": r.comment, "created_at": iso(r.created_at),
            "freelancer": user_brief(r.freelancer)}


def proposal_out(p: Proposal, with_job: bool = False) -> dict:
    d = {
        "id": p.id, "job_id": p.job_id, "bid": money(p.bid), "delivery_days": p.delivery_days,
        "cover_letter": p.cover_letter, "status": p.status, "created_at": iso(p.created_at),
        "freelancer": user_brief(p.freelancer),
    }
    if with_job:
        d["job"] = {"id": p.job.id, "title": p.job.title, "budget": money(p.job.budget),
                    "status": p.job.status, "client": user_brief(p.job.client)}
    return d


def review_out(r: Review) -> dict:
    return {"id": r.id, "rating": r.rating, "comment": r.comment,
            "created_at": iso(r.created_at), "client": user_brief(r.client)}


def order_out(o: Order, viewer: User) -> dict:
    other = o.freelancer if viewer.id == o.client_id else o.client
    return {
        "id": o.id, "title": o.title, "amount": money(o.amount), "buyer_fee": money(o.buyer_fee),
        "seller_fee_pct": float(o.seller_fee_pct), "status": o.status, "package": o.package,
        "delivery_days": o.delivery_days, "gig_id": o.gig_id, "job_id": o.job_id,
        "created_at": iso(o.created_at), "delivered_at": iso(o.delivered_at),
        "released_at": iso(o.released_at),
        "disputed": o.disputed, "dispute_reason": o.dispute_reason,
        "dispute_by": o.dispute_by, "dispute_opened_at": iso(o.dispute_opened_at),
        "resolution_note": o.resolution_note,
        "client": user_brief(o.client), "freelancer": user_brief(o.freelancer),
        "counterpart": user_brief(other),
        "review": review_out(o.review) if o.review else None,
        "client_review": client_review_out(o.client_review) if o.client_review else None,
    }


def tx_out(t: Transaction) -> dict:
    return {"id": t.id, "kind": t.kind, "amount": money(t.amount),
            "description": t.description, "order_id": t.order_id, "created_at": iso(t.created_at)}


def message_out(m: Message) -> dict:
    return {"id": m.id, "conversation_id": m.conversation_id, "sender_id": m.sender_id,
            "body": m.body, "read": m.read, "read_at": iso(m.read_at), "created_at": iso(m.created_at)}


def conversation_out(c: Conversation, viewer: User, last: Message | None, unread: int,
                     online: bool = False) -> dict:
    other = c.freelancer if viewer.id == c.client_id else c.client
    return {"id": c.id, "other": {**user_brief(other), "online": online}, "unread": unread,
            "last_message": message_out(last) if last else None}


def notification_out(n: Notification) -> dict:
    return {"id": n.id, "kind": n.kind, "title": n.title, "body": n.body, "link": n.link,
            "read": n.read, "created_at": iso(n.created_at)}
