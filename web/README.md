# Crewline (Next.js)

## Fix Vercel “Application startup failed. Exiting.”

That log line is from **Python (uvicorn)**, not Next.js. Vercel deployed the repo root and picked up `backend/` instead of the Next app.

### Do this in the Vercel dashboard

1. Open the **crewline** project → **Settings → General**
2. **Root Directory** → Edit → set to `web` → Save
3. Under **Build & Development Settings**, framework should be **Next.js** (clear any Python overrides)
4. **Settings → Environment Variables** — add at least:

   | Name | Value |
   |------|--------|
   | `DATABASE_URL` | Neon/Vercel Postgres URL (`postgresql://…?sslmode=require`) |
   | `SECRET_KEY` | long random string |

5. **Deployments → … → Redeploy** (build auto-switches Prisma to Postgres when `DATABASE_URL` is `postgresql://…`)

After the first good deploy, seed production once from your machine:

```bash
cd web
DATABASE_URL="postgresql://…" npx prisma db push
DATABASE_URL="postgresql://…" npm run db:seed
```

## Local

```bash
cd web
cp .env.example .env
npm install
npm run db:push && npm run db:seed
npm run dev
```

http://localhost:3000 — demo password `password123` (`helen@crewline.dev`, `amara@crewline.dev`).
