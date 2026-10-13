from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Literal
from sqlalchemy import String, cast, exists, func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..config import CATEGORIES, CATEGORY_IMAGES
from ..db import get_db
from ..deps import client_only, current_user, freelancer_only, member_only, optional_user
from ..services import get_settings
from ..models import ClientReview
from ..models import (
    ClientProfile, FreelancerProfile, Gig, GigPackage, Job, Order, Proposal, Review, User,
)
from ..serializers import client_review_out, gig_out, job_out, proposal_out, review_out, user_brief, user_full

router = APIRouter(tags=["catalog"])
VALID_CATS = {c for c, _ in CATEGORIES}


def _words(q: str | None):
    return [w for w in (q or "").lower().split() if w][:6]


@router.get("/meta")
def meta(db: Session = Depends(get_db)):
    cfg = get_settings(db)
    gig_counts = dict(db.execute(select(Gig.category, func.count()).group_by(Gig.category)).all())
    job_counts = dict(db.execute(select(Job.category, func.count()).where(Job.status == "open")
                                 .group_by(Job.category)).all())
    return {
        "fees": {"buyer": cfg["buyer_fee_pct"], "seller": cfg["seller_fee_pct"]},
        "signups_enabled": cfg["signups_enabled"],
        "categories": [{"id": c, "name": n, "gigs": gig_counts.get(c, 0), "jobs": job_counts.get(c, 0),
                        "image": CATEGORY_IMAGES.get(c, "")}
                       for c, n in CATEGORIES],
        "stats": {
            "freelancers": db.scalar(select(func.count()).select_from(FreelancerProfile)),
            "clients": db.scalar(select(func.count()).select_from(ClientProfile)),
            "gigs": db.scalar(select(func.count()).select_from(Gig)),
            "open_jobs": db.scalar(select(func.count()).select_from(Job).where(Job.status == "open")),
            "completed_orders": db.scalar(select(func.count()).select_from(Order).where(Order.status == "released")),
        },
    }


# ---------- freelancers ----------
@router.get("/freelancers")
def freelancers(q: Optional[str] = None, category: Optional[str] = None,
                sort: str = "rating", limit: int = Query(24, le=60), db: Session = Depends(get_db)):
    stmt = select(User).join(FreelancerProfile).options(selectinload(User.freelancer)).where(
        FreelancerProfile.visible.is_(True), User.is_active.is_(True))
    if category and category != "all":
        stmt = stmt.where(FreelancerProfile.category == category)
    for w in _words(q):
        like = f"%{w}%"
        stmt = stmt.where(or_(User.name.ilike(like), FreelancerProfile.headline.ilike(like),
                              cast(FreelancerProfile.skills, String).ilike(like)))
    stmt = stmt.order_by(FreelancerProfile.rating.desc(), FreelancerProfile.reviews_count.desc()) \
        if sort == "rating" else stmt.order_by(FreelancerProfile.hourly_rate.asc())
    rows = db.scalars(stmt.limit(limit)).all()
    return [{**user_brief(u), "skills": u.freelancer.skills, "hourly_rate": float(u.freelancer.hourly_rate),
             "jobs_completed": u.freelancer.jobs_completed, "category": u.freelancer.category,
             "available": u.freelancer.available} for u in rows]


@router.get("/freelancers/{uid}")
def freelancer_detail(uid: int, viewer: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.id == uid, User.role == "freelancer")
                  .options(selectinload(User.freelancer)))
    if not u or not u.is_active:
        raise HTTPException(404, "Freelancer not found")
    if not u.freelancer.visible and not (viewer and (viewer.id == uid or viewer.role == "admin")):
        raise HTTPException(404, "This profile is private")
    gigs = db.scalars(select(Gig).where(Gig.freelancer_id == uid, Gig.active.is_(True))
                      .options(selectinload(Gig.packages), selectinload(Gig.freelancer)
                               .selectinload(User.freelancer))).all()
    reviews = db.scalars(select(Review).where(Review.freelancer_id == uid)
                         .options(selectinload(Review.client).selectinload(User.client))
                         .order_by(Review.created_at.desc()).limit(10)).all()
    d = user_full(u)
    d.pop("email", None)
    return {**d, "gigs": [gig_out(g) for g in gigs], "reviews": [review_out(r) for r in reviews]}


@router.get("/clients/{uid}")
def client_detail(uid: int, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.id == uid, User.role == "client").options(selectinload(User.client)))
    if not u or not u.is_active:
        raise HTTPException(404, "Client not found")
    d = user_full(u)
    d.pop("email", None)
    jobs = db.scalars(select(Job).where(Job.client_id == uid).options(selectinload(Job.client).selectinload(User.client))
                      .order_by(Job.created_at.desc()).limit(12)).all()
    pc = _counts(db, [j.id for j in jobs])
    reviews = db.scalars(select(ClientReview).where(ClientReview.client_id == uid).options(
        selectinload(ClientReview.freelancer).selectinload(User.freelancer))
        .order_by(ClientReview.created_at.desc()).limit(10)).all()
    return {**d, "stats": client_stats(db, [uid])[uid],
            "open_jobs": [job_out(j, pc.get(j.id, 0)) for j in jobs if j.status == "open"],
            "past_jobs": [job_out(j, pc.get(j.id, 0)) for j in jobs if j.status != "open"],
            "reviews": [client_review_out(r) for r in reviews]}


class ExperienceItem(BaseModel):
    role: str = Field("", max_length=100)
    company: str = Field("", max_length=100)
    period: str = Field("", max_length=60)
    description: str = Field("", max_length=500)


class PortfolioItem(BaseModel):
    title: str = Field("", max_length=100)
    description: str = Field("", max_length=400)
    link: str = Field("", max_length=300)


class ProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=80)
    headline: Optional[str] = Field(None, max_length=140)
    bio: Optional[str] = Field(None, max_length=1500)
    location: Optional[str] = Field(None, max_length=120)
    category: Optional[str] = None
    skills: Optional[list[str]] = None
    languages: Optional[list[str]] = None
    experience: Optional[list[ExperienceItem]] = None
    portfolio: Optional[list[PortfolioItem]] = None
    hourly_rate: Optional[Decimal] = Field(None, ge=0, le=1000)
    available: Optional[bool] = None
    visible: Optional[bool] = None
    company: Optional[str] = Field(None, max_length=140)
    website: Optional[str] = Field(None, max_length=200)
    industry: Optional[str] = Field(None, max_length=80)


@router.put("/me/profile")
def update_profile(body: ProfileUpdate, user: User = Depends(member_only), db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        user.name = data["name"].strip()
    if user.freelancer:
        f = user.freelancer
        for k in ("headline", "bio", "location", "hourly_rate", "available", "visible"):
            if data.get(k) is not None:
                setattr(f, k, data[k])
        if data.get("category") in VALID_CATS:
            f.category = data["category"]
        for k in ("skills", "languages"):
            if data.get(k) is not None:
                setattr(f, k, [s.strip() for s in data[k] if s.strip()][:15])
        if data.get("experience") is not None:
            f.experience = [e for e in data["experience"] if e["role"].strip() or e["company"].strip()][:10]
        if data.get("portfolio") is not None:
            f.portfolio = [p for p in data["portfolio"] if p["title"].strip()][:12]
    elif user.client:
        c = user.client
        for k in ("company", "bio", "location", "website", "industry"):
            if data.get(k) is not None:
                setattr(c, k, data[k])
    db.commit()
    return user_full(user)


# ---------- gigs ----------
@router.get("/gigs")
def gigs(q: Optional[str] = None, category: Optional[str] = None, max_price: Optional[int] = None,
         max_days: Optional[int] = None, sort: str = "recommended", limit: int = Query(48, le=100),
         db: Session = Depends(get_db)):
    pk = select(GigPackage.gig_id, func.min(GigPackage.price).label("minp"),
                func.min(GigPackage.delivery_days).label("mind")).group_by(GigPackage.gig_id).subquery()
    stmt = (select(Gig).join(pk, pk.c.gig_id == Gig.id).join(User, User.id == Gig.freelancer_id)
            .join(FreelancerProfile, FreelancerProfile.user_id == User.id)
            .where(Gig.active.is_(True), User.is_active.is_(True))
            .options(selectinload(Gig.packages),
                     selectinload(Gig.freelancer).selectinload(User.freelancer)))
    if category and category != "all":
        stmt = stmt.where(Gig.category == category)
    if max_price:
        stmt = stmt.where(pk.c.minp <= max_price)
    if max_days:
        stmt = stmt.where(pk.c.mind <= max_days)
    for w in _words(q):
        like = f"%{w}%"
        stmt = stmt.where(or_(Gig.title.ilike(like), Gig.description.ilike(like),
                              cast(Gig.tags, String).ilike(like), User.name.ilike(like)))
    order = {"price_low": pk.c.minp.asc(), "price_high": pk.c.minp.desc(),
             "newest": Gig.created_at.desc()}.get(sort)
    stmt = stmt.order_by(order if order is not None else FreelancerProfile.rating.desc(),
                         Gig.id.desc())
    return [gig_out(g) for g in db.scalars(stmt.limit(limit)).all()]


@router.get("/gigs/{gid}")
def gig_detail(gid: int, db: Session = Depends(get_db)):
    g = db.scalar(select(Gig).where(Gig.id == gid).options(
        selectinload(Gig.packages), selectinload(Gig.freelancer).selectinload(User.freelancer)))
    if not g:
        raise HTTPException(404, "Gig not found")
    return gig_out(g, detail=True)


class PackageIn(BaseModel):
    price: Decimal = Field(ge=5, le=50000)
    delivery_days: int = Field(ge=1, le=120)
    revisions: int = Field(1, ge=-1, le=20)
    features: list[str] = []


class GigIn(BaseModel):
    title: str = Field(min_length=10, max_length=160)
    category: str
    description: str = Field(min_length=30, max_length=3000)
    tags: list[str] = []
    image: str = Field("", max_length=300)
    basic: PackageIn
    standard: PackageIn
    premium: PackageIn


@router.post("/gigs", status_code=201)
def create_gig(body: GigIn, user: User = Depends(freelancer_only), db: Session = Depends(get_db)):
    if body.category not in VALID_CATS:
        raise HTTPException(422, "Unknown category")
    image = (body.image or "").strip()
    if image and not (image.startswith("/") or image.startswith("https://") or image.startswith("http://")):
        raise HTTPException(422, "Image must be a URL")
    g = Gig(freelancer_id=user.id, title=body.title.strip(), category=body.category,
            description=body.description.strip(), tags=[t.strip() for t in body.tags if t.strip()][:8],
            image=image)
    for tier in ("basic", "standard", "premium"):
        p = getattr(body, tier)
        g.packages.append(GigPackage(tier=tier, price=p.price, delivery_days=p.delivery_days,
                                     revisions=p.revisions, features=[f for f in p.features if f.strip()]))
    db.add(g)
    db.commit()
    db.refresh(g)
    return {"id": g.id}


@router.delete("/gigs/{gid}")
def delete_gig(gid: int, user: User = Depends(freelancer_only), db: Session = Depends(get_db)):
    g = db.get(Gig, gid)
    if not g or g.freelancer_id != user.id:
        raise HTTPException(404, "Gig not found")
    g.active = False
    db.commit()
    return {"ok": True}


@router.get("/me/gigs")
def my_gigs(user: User = Depends(freelancer_only), db: Session = Depends(get_db)):
    rows = db.scalars(select(Gig).where(Gig.freelancer_id == user.id, Gig.active.is_(True))
                      .options(selectinload(Gig.packages), selectinload(Gig.freelancer)
                               .selectinload(User.freelancer)).order_by(Gig.id.desc())).all()
    return [gig_out(g) for g in rows]


# ---------- jobs ----------
def _counts(db: Session, ids: list[int]) -> dict[int, int]:
    if not ids:
        return {}
    return dict(db.execute(select(Proposal.job_id, func.count()).where(
        Proposal.job_id.in_(ids), Proposal.status != "withdrawn").group_by(Proposal.job_id)).all())


def client_stats(db: Session, ids: list[int]) -> dict[int, dict]:
    """Upwork-style client history: rating, jobs posted, hire rate, total spent, member since."""
    ids = list(set(ids))
    out = {i: {"rating": 0.0, "reviews_count": 0, "jobs_posted": 0, "hires": 0, "hire_rate": 0,
               "total_spent": 0.0, "verified": False, "location": "", "member_since": None} for i in ids}
    if not ids:
        return out
    for cid, avg, n in db.execute(select(ClientReview.client_id, func.avg(ClientReview.rating), func.count())
                                  .where(ClientReview.client_id.in_(ids)).group_by(ClientReview.client_id)):
        out[cid]["rating"], out[cid]["reviews_count"] = round(float(avg), 1), n
    for cid, n in db.execute(select(Job.client_id, func.count()).where(Job.client_id.in_(ids)).group_by(Job.client_id)):
        out[cid]["jobs_posted"] = n
    for cid, n in db.execute(select(Job.client_id, func.count(func.distinct(Order.job_id)))
                             .join(Order, Order.job_id == Job.id)
                             .where(Job.client_id.in_(ids), Order.status != "cancelled").group_by(Job.client_id)):
        out[cid]["hires"] = n
    for uid, spent, verified, loc, created in db.execute(
            select(ClientProfile.user_id, ClientProfile.total_spent, ClientProfile.verified,
                   ClientProfile.location, User.created_at).join(User, User.id == ClientProfile.user_id)
            .where(ClientProfile.user_id.in_(ids))):
        out[uid].update(total_spent=float(spent), verified=verified, location=loc,
                        member_since=created.isoformat() if created else None)
    for st in out.values():
        st["hire_rate"] = min(100, round(st["hires"] / st["jobs_posted"] * 100)) if st["jobs_posted"] else 0
    return out


def _csv(v: Optional[str]) -> list[str]:
    return [x.strip() for x in (v or "").split(",") if x.strip()][:12]


@router.get("/jobs")
def jobs(q: Optional[str] = None, category: Optional[str] = None, min_budget: Optional[int] = None,
         status: str = "open", limit: int = Query(50, le=100), db: Session = Depends(get_db)):
    stmt = select(Job).options(selectinload(Job.client).selectinload(User.client))
    if status != "any":
        stmt = stmt.where(Job.status == status)
    if category and category != "all":
        stmt = stmt.where(Job.category == category)
    if min_budget:
        stmt = stmt.where(Job.budget >= min_budget)
    for w in _words(q):
        like = f"%{w}%"
        stmt = stmt.where(or_(Job.title.ilike(like), Job.description.ilike(like),
                              cast(Job.skills, String).ilike(like)))
    rows = db.scalars(stmt.order_by(Job.created_at.desc()).limit(limit)).all()
    c = _counts(db, [j.id for j in rows])
    return [job_out(j, c.get(j.id, 0)) for j in rows]


@router.get("/jobs/search")
def search_jobs(q: Optional[str] = None, category: Optional[str] = None, experience: Optional[str] = None,
                duration: Optional[str] = None, skills: Optional[str] = None,
                min_budget: Optional[int] = None, max_budget: Optional[int] = None,
                verified: bool = False, min_rating: Optional[float] = None, min_spent: Optional[int] = None,
                min_proposals: Optional[int] = None, max_proposals: Optional[int] = None,
                posted_within: Optional[int] = None, applied: Optional[Literal["hide", "only"]] = None,
                sort: str = "newest", limit: int = Query(20, le=50), offset: int = 0,
                viewer: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    """Find Jobs: advanced filters, sorting and facet counts (Upwork-style)."""
    pc = (select(Proposal.job_id.label("jid"), func.count().label("n")).where(Proposal.status != "withdrawn")
          .group_by(Proposal.job_id).subquery())
    cr = (select(ClientReview.client_id.label("cid"), func.avg(ClientReview.rating).label("avg"))
          .group_by(ClientReview.client_id).subquery())
    pcount = func.coalesce(pc.c.n, 0)
    crating = func.coalesce(cr.c.avg, 0)

    def base(*, skip: str = ""):
        stmt = (select(Job).join(ClientProfile, ClientProfile.user_id == Job.client_id)
                .outerjoin(pc, pc.c.jid == Job.id).outerjoin(cr, cr.c.cid == Job.client_id)
                .where(Job.status == "open"))
        for w in _words(q):
            like = f"%{w}%"
            stmt = stmt.where(or_(Job.title.ilike(like), Job.description.ilike(like),
                                  cast(Job.skills, String).ilike(like)))
        if skip != "category" and _csv(category):
            stmt = stmt.where(Job.category.in_(_csv(category)))
        if skip != "experience" and _csv(experience):
            stmt = stmt.where(Job.experience_level.in_(_csv(experience)))
        if skip != "duration" and _csv(duration):
            stmt = stmt.where(Job.duration.in_(_csv(duration)))
        if _csv(skills):
            stmt = stmt.where(or_(*[cast(Job.skills, String).ilike(f"%{x}%") for x in _csv(skills)]))
        if min_budget:
            stmt = stmt.where(Job.budget >= min_budget)
        if max_budget:
            stmt = stmt.where(Job.budget <= max_budget)
        if verified:
            stmt = stmt.where(ClientProfile.verified.is_(True))
        if min_rating:
            stmt = stmt.where(crating >= min_rating)
        if min_spent:
            stmt = stmt.where(ClientProfile.total_spent >= min_spent)
        if min_proposals is not None:
            stmt = stmt.where(pcount >= min_proposals)
        if max_proposals is not None:
            stmt = stmt.where(pcount <= max_proposals)
        if posted_within:
            stmt = stmt.where(Job.created_at >= datetime.now(timezone.utc) - timedelta(hours=posted_within))
        if applied and viewer and viewer.role == "freelancer":
            mine = exists().where(Proposal.job_id == Job.id, Proposal.freelancer_id == viewer.id,
                                  Proposal.status != "withdrawn")
            stmt = stmt.where(mine if applied == "only" else ~mine)
        return stmt

    stmt = base().options(selectinload(Job.client).selectinload(User.client))
    total = db.scalar(select(func.count()).select_from(base().order_by(None).subquery())) or 0
    order = {"newest": [Job.created_at.desc()], "budget_high": [Job.budget.desc()], "budget_low": [Job.budget.asc()],
             "fewest_proposals": [pcount.asc(), Job.created_at.desc()],
             "client_rating": [crating.desc(), Job.created_at.desc()],
             "client_spent": [ClientProfile.total_spent.desc(), Job.created_at.desc()]}
    my_skills = {x.lower() for x in (viewer.freelancer.skills if viewer and viewer.freelancer else [])}
    if sort == "best_match" and my_skills:
        rows = db.scalars(stmt.order_by(Job.created_at.desc()).limit(300)).all()
        rows.sort(key=lambda j: (-len(my_skills & {s.lower() for s in j.skills}) - (1 if viewer.freelancer.category == j.category else 0) * 0.5,
                                 -j.created_at.timestamp()))
        rows = rows[offset:offset + limit]
    else:
        rows = db.scalars(stmt.order_by(*order.get(sort, order["newest"])).limit(limit).offset(offset)).all()

    ids = [j.id for j in rows]
    counts, stats = _counts(db, ids), client_stats(db, [j.client_id for j in rows])
    mine = {}
    if viewer and viewer.role == "freelancer" and ids:
        mine = dict(db.execute(select(Proposal.job_id, Proposal.status).where(
            Proposal.job_id.in_(ids), Proposal.freelancer_id == viewer.id, Proposal.status != "withdrawn")).all())
    items = []
    for j in rows:
        d = job_out(j, counts.get(j.id, 0), stats[j.client_id], mine.get(j.id))
        d["match"] = sorted(my_skills & {s.lower() for s in j.skills}) if my_skills else []
        items.append(d)

    def facet(col, skip):
        sub = base(skip=skip).order_by(None).subquery()
        return dict(db.execute(select(sub.c[col.key], func.count()).group_by(sub.c[col.key])).all())
    return {"items": items, "total": total, "offset": offset,
            "facets": {"category": facet(Job.category, "category"), "experience": facet(Job.experience_level, "experience"),
                       "duration": facet(Job.duration, "duration")}}


@router.get("/jobs/{jid}")
def job_detail(jid: int, user: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    j = db.scalar(select(Job).where(Job.id == jid).options(selectinload(Job.client).selectinload(User.client)))
    if not j:
        raise HTTPException(404, "Job not found")
    stats = client_stats(db, [j.client_id])[j.client_id]
    out = job_out(j, _counts(db, [j.id]).get(j.id, 0), stats)
    bids = [float(b) for (b,) in db.execute(select(Proposal.bid).where(Proposal.job_id == jid, Proposal.status != "withdrawn"))]
    out["bids"] = {"avg": round(sum(bids) / len(bids), 2), "low": min(bids), "high": max(bids)} if bids else None
    reviews = db.scalars(select(ClientReview).where(ClientReview.client_id == j.client_id).options(
        selectinload(ClientReview.freelancer).selectinload(User.freelancer))
        .order_by(ClientReview.created_at.desc()).limit(6)).all()
    out["client_reviews"] = [client_review_out(r) for r in reviews]
    past = db.scalars(select(Job).where(Job.client_id == j.client_id, Job.id != jid)
                      .options(selectinload(Job.client).selectinload(User.client))
                      .order_by(Job.created_at.desc()).limit(5)).all()
    pc = _counts(db, [p.id for p in past])
    out["client_jobs"] = [job_out(p, pc.get(p.id, 0)) for p in past]
    sim = db.scalars(select(Job).where(Job.category == j.category, Job.id != jid, Job.status == "open")
                     .options(selectinload(Job.client).selectinload(User.client))
                     .order_by(Job.created_at.desc()).limit(3)).all()
    sc = _counts(db, [p.id for p in sim])
    out["similar"] = [job_out(p, sc.get(p.id, 0)) for p in sim]
    if user and user.role == "freelancer":
        p = db.scalar(select(Proposal).where(Proposal.job_id == jid, Proposal.freelancer_id == user.id)
                      .options(selectinload(Proposal.freelancer).selectinload(User.freelancer)))
        out["my_proposal_status"] = p.status if p else None
        out["my_proposal"] = proposal_out(p) if p and p.status != "withdrawn" else None
        my = {x.lower() for x in (user.freelancer.skills if user.freelancer else [])}
        out["match"] = sorted(my & {s.lower() for s in j.skills})
    return out


class JobIn(BaseModel):
    title: str = Field(min_length=8, max_length=160)
    category: str
    description: str = Field(min_length=40, max_length=4000)
    skills: list[str] = []
    budget: Decimal = Field(ge=20, le=100000)
    experience_level: Literal["entry", "intermediate", "expert"] = "intermediate"
    duration: Literal["week", "month", "quarter", "long"] = "month"


@router.post("/jobs", status_code=201)
def create_job(body: JobIn, user: User = Depends(client_only), db: Session = Depends(get_db)):
    if body.category not in VALID_CATS:
        raise HTTPException(422, "Unknown category")
    skills = [s.strip() for s in body.skills if s.strip()][:8]
    j = Job(client_id=user.id, title=body.title.strip(), category=body.category,
            description=body.description.strip(), skills=skills, budget=body.budget,
            experience_level=body.experience_level, duration=body.duration)
    db.add(j)
    db.commit()
    return {"id": j.id}


@router.get("/me/jobs")
def my_jobs(user: User = Depends(client_only), db: Session = Depends(get_db)):
    rows = db.scalars(select(Job).where(Job.client_id == user.id).options(
        selectinload(Job.client).selectinload(User.client)).order_by(Job.created_at.desc())).all()
    c = _counts(db, [j.id for j in rows])
    return [job_out(j, c.get(j.id, 0)) for j in rows]


@router.post("/jobs/{jid}/close")
def close_job(jid: int, user: User = Depends(client_only), db: Session = Depends(get_db)):
    j = db.get(Job, jid)
    if not j or j.client_id != user.id:
        raise HTTPException(404, "Job not found")
    if j.status != "open":
        raise HTTPException(409, "Only open jobs can be closed")
    j.status = "closed"
    for p in db.scalars(select(Proposal).where(Proposal.job_id == jid, Proposal.status == "pending")):
        p.status = "rejected"
    db.commit()
    return {"ok": True}
