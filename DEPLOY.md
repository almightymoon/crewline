# Deploy Crewline on Vercel

The Next.js app is at the **repository root** (not `web/`).

## Vercel settings

1. **Root Directory** = `.` (repo root) — clear it if you previously set `web`
2. Framework: **Next.js**
3. Environment variables:

| Name | Value |
|------|--------|
| `DATABASE_URL` | Neon / Vercel Postgres URL (`postgresql://…?sslmode=require`) |
| `SECRET_KEY` | long random string |

Build auto-switches Prisma from SQLite → Postgres when `DATABASE_URL` is a Postgres URL.

## After first deploy

```bash
DATABASE_URL="postgresql://…" npx prisma db push
DATABASE_URL="postgresql://…" npm run db:seed
```

## Local

```bash
npm install
npm run db:push && npm run db:seed
npm run dev
```
