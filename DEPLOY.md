# Deploy to Vercel (24/7 without your computer)

Deploy your Content App to Vercel so crons and publishing run 24/7.

## 1. Push to GitHub

```bash
git add .
git commit -m "Deploy to Vercel"
git push origin main
```

## 2. Connect to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (use your GitHub account).
2. **Add New Project** → import your Content App repo.
3. Set **Framework Preset** to Next.js and **Root Directory** if needed.
4. Deploy (Vercel will build and deploy automatically).

## 3. Environment Variables

In **Project → Settings → Environment Variables**, add all variables from `.env.local`:

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | For blog generation | Claude API key |
| `GEMINI_PRO_KEY` | For social/images | Gemini Pro key |
| `GEMINI_FLASH_KEY` | For social fallback | Gemini Flash key |
| `GITHUB_TOKEN` | Yes (for publishing) | GitHub PAT with `repo` scope |
| `GITHUB_OWNER` | Yes | GitHub org or username |
| `GITHUB_REPO` | Yes | Repo name |
| `GITHUB_BRANCH` | | Default: `main` |
| `CRON_SECRET` | For cron auth | Random string to protect cron routes |
| `IMAGE_GENERATION_URL` | Optional | Custom image API |
| `SITE_URL` | For social previews | e.g. `https://yoursite.com` |
| `NETLIFY_DEPLOY_HOOK` | Optional | Netlify build hook after publish |
| `TWITTER_*`, `LINKEDIN_*`, `META_*` | Optional | For social posting |

Create a strong `CRON_SECRET` (e.g. `openssl rand -hex 24`) and add it in Vercel. Vercel Cron will call your endpoints with the `x-vercel-cron` header, so cron routes will work without the secret; keep it for manual cron calls if needed.

## 4. Cron Jobs

Your `vercel.json` defines:

- **9:00 AM UTC** – `/api/cron` (content scheduling)
- **8:00 AM UTC** – `/api/cron/publish` (push approved posts to GitHub)

On Vercel Pro, these run automatically. On Hobby, crons require Pro; you can still use **Publish Now** manually.

## 5. Publish Now Button

On the Review page, use **Publish Now** to push all approved posts to GitHub immediately, without waiting for the daily cron.

## 6. Data Persistence (Turso)

When `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set in Vercel, the app stores Topics, Content, and Config in Turso. Add both env vars in Project → Settings → Environment Variables:

- `TURSO_DATABASE_URL` — e.g. `libsql://your-db.turso.io`
- `TURSO_AUTH_TOKEN` — Turso auth token (no spaces or typos; use exactly `TURSO_AUTH_TOKEN` as the key)

The schema (Config, Topics, Content) is created automatically on first run.

## 7. Redeploy After Changes

Each push to `main` triggers a new deployment. For env var changes, update them in Vercel and redeploy.
