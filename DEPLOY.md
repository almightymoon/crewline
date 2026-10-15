# Deploy on Vercel

## Required setting

**Settings → General → Root Directory = `web`**

Framework: Next.js

## Environment variables

| Name | Value |
|------|--------|
| `DATABASE_URL` | Neon/Vercel Postgres (`postgresql://…?sslmode=require`) |
| `SECRET_KEY` | long random string |

Build auto-switches Prisma to Postgres when `DATABASE_URL` starts with `postgresql://`.

## After first successful deploy

```bash
cd web
DATABASE_URL="postgresql://…" npx prisma db push
DATABASE_URL="postgresql://…" npm run db:seed
```

## Local

```bash
cd web
npm install
npm run db:push && npm run db:seed
npm run dev
```
