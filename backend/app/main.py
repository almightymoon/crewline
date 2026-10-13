import asyncio
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, or_, select
from starlette.concurrency import run_in_threadpool

from .config import ADMIN_EMAIL, ADMIN_PASSWORD, SEED_ON_START
from .db import Base, SessionLocal, engine, ensure_columns
from .models import Conversation, User
from .realtime import manager
from .routers import account, admin, auth, catalog, chat, work
from .security import decode_token, hash_password
from .services import post_message

def _static_dir() -> Path:
    """Front end lives in ../frontend (repo layout). STATIC_DIR overrides it, e.g. a Docker volume."""
    here = Path(__file__).resolve()
    for c in (os.getenv("STATIC_DIR"), here.parents[2] / "frontend", here.parents[1] / "static"):
        if c and Path(c, "index.html").exists():
            return Path(c)
    return here.parents[2] / "frontend"


STATIC = _static_dir()


def ensure_admin():
    """Create the super admin on first start. Credentials come from ADMIN_EMAIL / ADMIN_PASSWORD."""
    with SessionLocal() as db:
        if not db.scalar(select(User.id).where(User.role == "admin").limit(1)):
            db.add(User(email=ADMIN_EMAIL.lower(), password_hash=hash_password(ADMIN_PASSWORD),
                        name="Super Admin", role="admin", color="#1d1d1f",
                        avatar="/assets/avatars/admin.jpg"))
            db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    manager.loop = asyncio.get_running_loop()
    Base.metadata.create_all(engine)
    ensure_columns()
    if SEED_ON_START:
        with SessionLocal() as db:
            if not db.scalar(select(func.count()).select_from(User)):
                from .seed import seed
                seed(db)
    ensure_admin()
    yield


app = FastAPI(title="Crewline API", lifespan=lifespan)

api = APIRouter(prefix="/api")
for r in (auth.router, account.router, catalog.router, work.router, chat.router, admin.router):
    api.include_router(r)


@api.get("/health")
def health():
    return {"ok": True, "online": len(manager.conns)}


app.include_router(api)


# ---------- WebSocket: live messages, typing, read receipts, presence, notifications ----------
def _active_user(uid: int | None):
    if not uid:
        return None
    with SessionLocal() as db:
        u = db.get(User, uid)
        return (u.id, u.role) if u and u.is_active else None


def _partners(uid: int) -> list[int]:
    with SessionLocal() as db:
        rows = db.execute(select(Conversation.client_id, Conversation.freelancer_id).where(
            or_(Conversation.client_id == uid, Conversation.freelancer_id == uid))).all()
        return list({(c if c != uid else f) for c, f in rows})


def _handle(uid: int, data: dict):
    from .routers.chat import load_conv, mark_conversation_read
    t = data.get("t")
    if t not in ("send", "typing", "read"):
        return
    try:
        cid = int(data.get("conv"))
    except (TypeError, ValueError):
        return
    with SessionLocal() as db:
        user = db.get(User, uid)
        if not user or not user.is_active or user.role == "admin":
            return
        try:
            conv = load_conv(db, cid, user)
        except Exception:
            return
        if t == "send":
            body = str(data.get("body") or "").strip()[:4000]
            if body:
                post_message(db, conv, uid, body, cid=str(data.get("cid") or "")[:64] or None)
                db.commit()
        elif t == "typing":
            other = conv.freelancer_id if uid == conv.client_id else conv.client_id
            manager.push(other, {"t": "typing", "conv": conv.id, "user": uid})
        elif t == "read":
            mark_conversation_read(db, conv, uid)
            db.commit()


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket, token: str = ""):
    info = await run_in_threadpool(_active_user, decode_token(token))
    if not info:
        await websocket.close(code=4401)
        return
    uid = info[0]
    first = not manager.online(uid)
    partners = await run_in_threadpool(_partners, uid)
    await manager.connect(uid, websocket)
    if first:
        for p in partners:
            manager.push(p, {"t": "presence", "user": uid, "online": True})
    stamps: list[float] = []
    try:
        while True:
            data = await websocket.receive_json()
            if not isinstance(data, dict):
                continue
            if data.get("t") == "ping":
                await websocket.send_json({"t": "pong"})
                continue
            now = time.time()
            stamps[:] = [s for s in stamps if now - s < 10]
            if len(stamps) >= 60:  # crude flood guard: 60 events per 10 seconds
                continue
            stamps.append(now)
            await run_in_threadpool(_handle, uid, data)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        manager.disconnect(uid, websocket)
        if not manager.online(uid):  # no awaits here: this block must survive task cancellation
            for p in partners:
                manager.push(p, {"t": "presence", "user": uid, "online": False})


if STATIC.exists():
    app.mount("/assets", StaticFiles(directory=STATIC), name="assets")

    @app.get("/")
    def index():
        return FileResponse(STATIC / "index.html")
