"""In-process WebSocket fan-out.

Events are queued on the SQLAlchemy session and delivered only after the transaction commits,
so clients never see a message or notification that was rolled back. With more than one worker
process, replace the in-memory connection map with Redis pub/sub (the queue() call sites stay the same).
"""
import asyncio
from collections import defaultdict

from fastapi import WebSocket
from sqlalchemy import event
from sqlalchemy.orm import Session


class Manager:
    def __init__(self):
        self.conns: dict[int, set[WebSocket]] = defaultdict(set)
        self.loop: asyncio.AbstractEventLoop | None = None

    async def connect(self, uid: int, ws: WebSocket):
        await ws.accept()
        self.conns[uid].add(ws)

    def disconnect(self, uid: int, ws: WebSocket):
        self.conns[uid].discard(ws)
        if not self.conns[uid]:
            self.conns.pop(uid, None)

    def online(self, uid: int) -> bool:
        return uid in self.conns

    async def send(self, uid: int, payload: dict):
        for ws in list(self.conns.get(uid, ())):
            try:
                await ws.send_json(payload)
            except Exception:
                self.disconnect(uid, ws)

    def push(self, uid: int, payload: dict):
        """Thread-safe: callable from sync endpoints running in the threadpool."""
        if self.loop and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(self.send(uid, payload), self.loop)


manager = Manager()


def queue(db: Session, uid: int, payload: dict):
    db.info.setdefault("post_commit", []).append((uid, payload))


@event.listens_for(Session, "after_commit")
def _deliver(session: Session):
    for uid, payload in session.info.pop("post_commit", []):
        manager.push(uid, payload)


@event.listens_for(Session, "after_rollback")
def _drop(session: Session):
    session.info.pop("post_commit", None)
