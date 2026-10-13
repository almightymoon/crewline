# Crewline

A freelance marketplace in the style of Upwork, Fiverr and Freelancer.
FastAPI + PostgreSQL on the back end, a dependency-free single-page front end (light and dark mode) served by the same app.

## Run it in development (no Docker, no Postgres)

You only need **Python 3.10 or newer** (macOS ships 3.9; `brew install python@3.12` fixes that).

```bash
cd crewline
./dev.sh            # first run installs dependencies, creates a local SQLite database, loads sample data
./dev.sh --reset    # wipe the dev database and reseed
```

Open http://localhost:8000. Backend edits reload automatically; frontend edits (`frontend/`) only need a browser refresh.
API docs: http://localhost:8000/docs. The dev database is a file at `backend/crewline-dev.db` (SQLite, for development only).

**Use PostgreSQL in development** (what production uses):

```bash
brew install postgresql@16 && brew services start postgresql@16
createdb crewline
DATABASE_URL=postgresql+psycopg://$(whoami)@localhost:5432/crewline ./dev.sh
```

**Docker** (PostgreSQL included):

```bash
cp .env.example .env        # optional, but change the secrets before deploying
docker compose up --build
```

> Upgrading from an earlier build? The schema changed. Run `./dev.sh --reset`, or `docker compose down -v` once.

If something fails, the first lines of the terminal output usually say why. The usual causes are an old Python or a port already in use
(check with `lsof -i :8000`).

## Design

Two layers on one design system: the public site (landing, gigs, jobs, profiles) keeps the airy Apple-style look, while everything
behind sign-in (dashboards, orders, messages, settings, admin) uses a dense product layout: a grouped icon sidebar, page headers with
actions, KPI cards, earnings and spend charts, data tables with status badges, onboarding checklists and proper empty states.
All controls share one height scale, scrollbars are thin and theme-aware, and every page is checked for horizontal overflow at 390, 768 and 1440 px.
Light and dark mode switch from the header.

## Three separate sign-ins

| Portal | URL | Who | Demo credentials |
| --- | --- | --- | --- |
| Client | `/#/login/client` | People hiring | `helen@crewline.dev` / `password123` (also james, maya, luis, chloe) |
| Freelancer | `/#/login/freelancer` | People selling work | `tomas@crewline.dev` / `password123` (also sofia, amara, elise, daniyal, priya and more) |
| Super admin | `/#/admin/login` | Crewline staff | `admin@crewline.dev` / `admin12345` (set `ADMIN_EMAIL` and `ADMIN_PASSWORD`) |

An account can only sign in through the portal for its own role; the API rejects the wrong portal with a clear message.
Sign-up exists for clients and freelancers only. Admins are never self-registered.
Failed sign-ins are rate limited (8 per 15 minutes per IP and email).

## What each role gets

**Find Jobs (freelancers and guests):** an Upwork-style sidebar with filters for category, experience level, budget (inputs and presets), project length, number of proposals, posted date, client info (payment verified, rating, lifetime spend) and skills, with live counts. Plus sorting (newest, best match to your skills, budget, fewest proposals, client rating, client spend), removable filter chips, shareable URLs and paging. Freelancers also get a **My proposals** panel, an **Applied** badge on jobs, and a filter to hide or show only the jobs they applied to.

**Job page:** budget, level, length, activity (proposal range and average, low and high bids), skills with your matching ones highlighted, an **About the client** card (payment verified, rating, location, jobs posted, hire rate, total spent, member since), the client's recent job history, reviews from freelancers, and similar jobs. Freelancers apply or manage their proposal in place; clients manage proposals on their own job.

**Client reviews:** after payment is released the freelancer can rate the client. Those reviews feed the client's rating on every job post and on the public client profile.

**Client:** dashboard (wallet, escrow, orders, jobs, proposals), post jobs, hire from proposals, buy gigs, request revisions, approve and release payment, cancel unstarted orders for a full refund, reviews, report a problem (dispute), profile (company, industry, website) with a profile-strength meter, settings.

**Freelancer:** dashboard (earnings, pending earnings, active work, proposals, gigs), create and remove gigs with three packages, send proposals, start and deliver orders, withdrawals, public profile with headline, overview, skills, languages, work experience and portfolio, availability and visibility controls, settings.

**Super admin:** overview with volume, revenue, escrow and sign-up charts; user management (search, suspend and reactivate, verify clients); dispute queue with refund or pay decisions; all orders with forced refunds; gig and job moderation; money ledger; announcements to everyone, clients or freelancers; editable platform fees and a sign-up switch; a log of every admin action.

**Settings (all roles):** account (name, email, avatar colour), security (change password, close account), notification preferences, privacy for freelancers, billing for clients and payouts for freelancers.

## Messaging and notifications

- **WebSocket messaging** (`/ws`): messages appear instantly for both people, with typing indicators, read receipts ("Seen"), online presence dots, optimistic sending with retry, history paging, conversation search, and an unread badge in the header. If the socket drops it reconnects with backoff and falls back to polling.
- **Notifications:** a bell in the header with live updates, a full page, mark-as-read, and deep links. They are created for new proposals, being hired, new orders, delivery, revision requests, payments, reviews, disputes and admin announcements. Users can mute categories in Settings.
- Events are queued on the database session and sent only after the transaction commits, so nobody sees something that was rolled back.

## Escrow, fees and disputes

The client pays `price + service fee` into escrow; on release the freelancer receives `price - platform fee`.
Both percentages are editable by the admin and each order keeps the rate it was created with. All movements are in the
`transactions` ledger. A dispute freezes work and payment until an admin decides to refund the client or pay the freelancer.

## Run manually

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=postgresql+psycopg://USER:PASS@localhost:5432/crewline
uvicorn app.main:app --reload            # seeds an empty database and creates the admin
python -m app.seed --reset               # wipe and reseed at any time
```

## Tests

```bash
cd backend
python -m app.seed --reset
python -m tests.api_flow                  # API walkthrough incl. WebSockets, admin, disputes (needs DATABASE_URL)
python -m app.seed --reset && python -m tests.jobs_flow   # Find Jobs filters, sorts, facets, client history and reviews

# Browser-level run (jsdom) against a running server on :8000
cd tests/browser && npm install && node smoke.js && node jobs_smoke.js && node dashboard_smoke.js
```

## Layout

```
backend/app/
  models.py       users, profiles, gigs, jobs, proposals, orders, reviews, ledger, chat, notifications, admin log, settings
  routers/        auth (portals) · account (settings, notifications) · catalog · work · chat · admin
  realtime.py     WebSocket fan-out, delivered after commit
  services.py     escrow, fees, notifications, conversations
  seed.py         sample data
frontend/         index.html, styles.css, app.js (hash-routed SPA, no build step)
backend/tests/    api_flow.py, jobs_flow.py, browser/smoke.js, jobs_smoke.js, dashboard_smoke.js
```

## Before going to production

- **Payments:** top-ups and withdrawals are simulated. Replace with Stripe Connect and keep the ledger as the source of truth.
- **Migrations:** tables are created with `create_all`. Add Alembic before the schema changes again.
- **Scaling realtime:** the socket registry is in memory, so run one worker, or swap it for Redis pub/sub (the `queue()` call sites stay the same).
- **Auth hardening:** use a strong `SECRET_KEY` and admin password, move the token to an httpOnly cookie, add email verification, password reset, 2FA for admins, and a shared rate limiter.
- **Not built:** file attachments in chat and deliveries, email and push notifications, hourly contracts and milestones, multi-admin roles.
# crewline
