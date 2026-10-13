#!/usr/bin/env bash
# Development mode: no Docker, no Postgres install needed.
#   ./dev.sh            start the app on http://localhost:8000 (auto-reload on backend changes)
#   ./dev.sh --reset    wipe the dev database and reseed the sample data first
#   DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/crewline ./dev.sh   use PostgreSQL instead
set -e
cd "$(dirname "$0")/backend"

PY=""
for p in python3.13 python3.12 python3.11 python3.10 python3 python; do
  if command -v "$p" >/dev/null 2>&1 && "$p" -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null; then PY="$p"; break; fi
done
if [ -z "$PY" ]; then
  echo "Crewline needs Python 3.10 or newer (macOS ships 3.9)."
  echo "Install it with:  brew install python@3.12     then run ./dev.sh again."
  exit 1
fi
echo "Using $($PY --version) ($PY)"

[ -d .venv ] || "$PY" -m venv .venv
# shellcheck disable=SC1091
. .venv/bin/activate
pip install -q --upgrade pip >/dev/null
pip install -q -r requirements.txt

export DATABASE_URL="${DATABASE_URL:-sqlite:///$(pwd)/crewline-dev.db}"
export SEED="${SEED:-true}"
case "$DATABASE_URL" in sqlite*) echo "Database: SQLite file backend/crewline-dev.db (dev only)";; *) echo "Database: $DATABASE_URL";; esac

if [ "${1:-}" = "--reset" ]; then python -m app.seed --reset; fi

echo
echo "  App:       http://localhost:8000"
echo "  API docs:  http://localhost:8000/docs"
echo "  Client:    http://localhost:8000/#/login/client      helen@crewline.dev / password123"
echo "  Freelancer http://localhost:8000/#/login/freelancer  tomas@crewline.dev / password123"
echo "  Admin:     http://localhost:8000/#/admin/login       admin@crewline.dev / admin12345"
echo
exec uvicorn app.main:app --reload --reload-dir app --port 8000
