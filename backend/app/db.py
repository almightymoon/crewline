import warnings

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import DATABASE_URL

IS_SQLITE = DATABASE_URL.startswith("sqlite")
if IS_SQLITE:
    # Zero-setup development database. Use PostgreSQL (DATABASE_URL) for anything real.
    warnings.filterwarnings("ignore", message=".*Decimal.*SQLite.*")
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False, "timeout": 30})

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(conn, _):
        cur = conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.close()
else:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_columns():
    """Add columns that create_all will not patch on an existing database."""
    insp = inspect(engine)
    if not insp.has_table("users"):
        return
    cols = {c["name"] for c in insp.get_columns("users")}
    if "avatar" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN avatar VARCHAR(300) DEFAULT ''"))
    if insp.has_table("gigs"):
        gcols = {c["name"] for c in insp.get_columns("gigs")}
        if "image" not in gcols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE gigs ADD COLUMN image VARCHAR(300) DEFAULT ''"))
