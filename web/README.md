# Crewline (Next.js)

Freelance marketplace SPA + API, ready to deploy on [Vercel](https://vercel.com).

The existing hash-router UI lives under `public/` and talks to Next.js Route Handlers at `/api/*`. Data is stored with Prisma (SQLite locally, Postgres on Vercel).

## Local

```bash
cd web
cp .env.example .env
npm install
npm run db:push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Demo logins (password `password123`):

- Client: `helen@crewline.dev`
- Freelancer: `amara@crewline.dev`
- Admin: `admin@crewline.dev` / `admin12345`

## Deploy on Vercel

1. Create a Postgres database (Neon, Vercel Postgres, or Supabase).
2. In `prisma/schema.prisma`, set:

   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

3. Push the `web` folder as the Vercel project root (or set Root Directory to `web`).
4. Set environment variables:

   | Name | Value |
   |------|--------|
   | `DATABASE_URL` | your Postgres connection string |
   | `SECRET_KEY` | long random string |
   | `ADMIN_EMAIL` | optional |
   | `ADMIN_PASSWORD` | optional |

5. After the first deploy, seed once (Vercel CLI or a one-off script):

   ```bash
   npx prisma db push
   npm run db:seed
   ```

WebSockets are not available on Vercel; the SPA already falls back to polling for messages.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Generate Prisma client + production build |
| `npm run db:push` | Sync schema to the database |
| `npm run db:seed` | Load demo users, gigs, jobs, orders |
