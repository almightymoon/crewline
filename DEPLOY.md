# Deploy Crewline on Vercel

## Critical setting

**Settings → General → Root Directory must be empty / `.`**  
(Do **not** use `web` — the Next.js app is at the repo root.)

Framework Preset: **Next.js**

## Environment variables

| Name | Value |
|------|--------|
| `DATABASE_URL` | Neon / Vercel Postgres: `postgresql://…?sslmode=require` |
| `SECRET_KEY` | long random string |

## After first successful deploy

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
