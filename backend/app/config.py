import os

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+psycopg://crewline:crewline@localhost:5432/crewline"
)
SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-change-me")
TOKEN_HOURS = int(os.getenv("TOKEN_HOURS", str(24 * 7)))
SEED_ON_START = os.getenv("SEED", "true").lower() in ("1", "true", "yes")

# The super admin is created on first start if none exists. Change these in production.
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@crewline.dev")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin12345")

# Runtime-editable platform settings (Admin > Settings) fall back to these defaults.
DEFAULT_SETTINGS = {"buyer_fee_pct": 5, "seller_fee_pct": 10, "signups_enabled": True}

CATEGORIES = [
    ("design", "Design"),
    ("dev", "Development"),
    ("writing", "Writing"),
    ("video", "Video and motion"),
    ("marketing", "Marketing"),
    ("data", "Data and AI"),
    ("audio", "Audio"),
]
CATEGORY_IMAGES = {c: f"/assets/categories/{c}.jpg" for c, _ in CATEGORIES}
