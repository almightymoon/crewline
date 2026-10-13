from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .security import decode_token

bearer = HTTPBearer(auto_error=False)


def current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    uid = decode_token(cred.credentials) if cred else None
    user = db.get(User, uid) if uid else None
    if not user:
        raise HTTPException(401, "Sign in to continue")
    if not user.is_active:
        raise HTTPException(403, "This account is suspended. Contact support for help.")
    return user


def optional_user(
    cred: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User | None:
    uid = decode_token(cred.credentials) if cred else None
    user = db.get(User, uid) if uid else None
    return user if user and user.is_active else None


def client_only(user: User = Depends(current_user)) -> User:
    if user.role != "client":
        raise HTTPException(403, "This action is for client accounts")
    return user


def freelancer_only(user: User = Depends(current_user)) -> User:
    if user.role != "freelancer":
        raise HTTPException(403, "This action is for freelancer accounts")
    return user


def admin_only(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Admin access required")
    return user


def member_only(user: User = Depends(current_user)) -> User:
    """Clients and freelancers (not admins)."""
    if user.role == "admin":
        raise HTTPException(403, "Not available for admin accounts")
    return user
