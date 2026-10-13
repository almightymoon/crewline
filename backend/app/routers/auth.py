import random
import time
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user
from ..models import ClientProfile, FreelancerProfile, User
from ..security import create_token, hash_password, verify_password
from ..serializers import user_full
from ..services import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])
COLORS = ["#0071e3", "#5e5ce6", "#bf5af2", "#ff375f", "#ff9f0a", "#30b0c7", "#34c759", "#ac8e68"]
PORTAL_NAME = {"client": "client", "freelancer": "freelancer", "admin": "admin"}

# Simple in-memory brute-force guard: 8 failures per (ip, email) in 15 minutes.
_FAILS: dict[str, list[float]] = {}
WINDOW, LIMIT = 900, 8


def _throttle_key(request: Request, email: str) -> str:
    return f"{request.client.host if request.client else '?'}|{email}"


def _check_throttle(key: str):
    now = time.time()
    hits = [t for t in _FAILS.get(key, []) if now - t < WINDOW]
    _FAILS[key] = hits
    if len(hits) >= LIMIT:
        raise HTTPException(429, "Too many failed attempts. Try again in a few minutes.")


class Register(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=100)
    name: str = Field(min_length=2, max_length=80)
    role: Literal["client", "freelancer"]
    company: str = ""
    headline: str = ""


class Login(BaseModel):
    email: EmailStr
    password: str


@router.post("/register")
def register(body: Register, db: Session = Depends(get_db)):
    if not get_settings(db)["signups_enabled"]:
        raise HTTPException(403, "New sign-ups are paused right now.")
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists")
    user = User(email=email, password_hash=hash_password(body.password), name=body.name.strip(),
                role=body.role, color=random.choice(COLORS))
    if body.role == "freelancer":
        user.freelancer = FreelancerProfile(headline=body.headline.strip())
    else:
        user.client = ClientProfile(company=body.company.strip())
    user.last_login_at = datetime.now(timezone.utc)
    db.add(user)
    db.commit()
    return {"token": create_token(user.id), "user": user_full(user)}


@router.post("/login/{portal}")
def login(portal: Literal["client", "freelancer", "admin"], body: Login, request: Request,
          db: Session = Depends(get_db)):
    """Separate sign-in portals. An account can only sign in through the portal for its own role."""
    email = body.email.lower()
    key = _throttle_key(request, email)
    _check_throttle(key)
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(body.password, user.password_hash):
        _FAILS.setdefault(key, []).append(time.time())
        raise HTTPException(401, "Email or password is incorrect")
    if user.role != portal:
        if portal == "admin":
            _FAILS.setdefault(key, []).append(time.time())
            raise HTTPException(403, "This account does not have admin access")
        raise HTTPException(403, f"This is a {user.role} account. Use the {user.role} sign-in instead.")
    if not user.is_active:
        raise HTTPException(403, "This account is suspended. Contact support for help.")
    _FAILS.pop(key, None)
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    return {"token": create_token(user.id), "user": user_full(user)}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_full(user)
