# Deploy

1. Vercel → Settings → General → **Root Directory = `web`**
2. Framework = Next.js  
3. Env: `DATABASE_URL` (Postgres) + `SECRET_KEY`
4. Redeploy

Homepage is static (`/spa.html` via rewrite). API is under `/api/*`.
