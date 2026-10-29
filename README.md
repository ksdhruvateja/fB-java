# FixBridge

React + Vite app that connects homeowners with local contractors. Auth, jobs, profiles, docs, and Google OAuth are served by an Express API.

## Stack

- **Frontend**: React 18 + Vite 6, Tailwind CSS v4, React Router 7
- **API**: Express (`api/app.js`) — local Node server or Netlify Function
- **Database**: Neon Postgres (`NEON_DATABASE_URL`), or in-memory fallback for local-only
- **AI**: Fixera is the central assistant. Experiential Labs GPT-6 Astra is the first connected provider (`EXPLABS_API_KEY` server-side). Features call Fixera, not a vendor SDK.

## Local development

```bash
pnpm install
cp .env.example .env   # then fill in values
pnpm run dev
```

- Vite client: http://localhost:5000  
- API: http://localhost:3001 (proxied from Vite as `/api/*`)

## Tests and type checks

```bash
npm run typecheck   # TypeScript check of src/
npm test            # unit tests; database tests are skipped without a database
```

The database tests (accounts, payments, MFA, password reset, …) need a disposable PostgreSQL database:

```bash
FIXERA_TEST_DATABASE_URL=postgres://user:pass@localhost/fixbridge_test npm test
```

Use a fresh database for each run (some tests are not re-runnable on the same data). For a local
Postgres with a self-signed certificate, also set `DB_SSL_REJECT_UNAUTHORIZED=false` (never in production).

## Railway hosting

`railway.json` builds with `npm run build` and starts `node server.js` (health check `/api/health`).
Add variables in Railway → your service → **Variables** (use the **Raw Editor** to paste several),
then let Railway redeploy. Account variables are applied on every start, and the deploy log prints a
line `Login variables: …` showing which ones the server can see (values are never printed).

Minimum for sign-in: `SESSION_SECRET`, `NEON_DATABASE_URL`, `PUBLIC_SITE_URL`, `GMAIL_USER`,
`GMAIL_APP_PASSWORD`, then `PRIMARY_ADMIN_EMAIL` / `PRIMARY_ADMIN_PASSWORD` and
`COMMERCIAL_ADMIN_EMAIL` / `COMMERCIAL_ADMIN_PASSWORD` (passwords 12+ characters). For testing,
`COMMERCIAL_TEMP_LOGIN_PASSWORD` creates temporary FixBridge Commercial logins (admin, owner, office,
technician; see `.env.example`). There are no temporary homeowner-side logins. In the Railway environment
named `production`, the app runs in production mode (no demo seed, no on-screen MFA codes).

## Netlify hosting

Config is in `netlify.toml`:

| Setting | Value |
|---|---|
| Build command | `pnpm build` |
| Publish directory | `dist` |
| Functions | `netlify/functions` |
| API rewrite | `/api/*` → `/.netlify/functions/api/:splat` |
| SPA fallback | `/*` → `/index.html` |

The Express app is wrapped with `serverless-http` in `netlify/functions/api.js`.
Dependencies are bundled with esbuild (do not mark `express` as an external module under pnpm — that caused production `Cannot find module 'express'` 502s).

### Environment variables (Netlify UI)

Set these under **Site settings → Environment variables** (and rebuild after changing `VITE_*` vars):

| Variable | Required | Notes |
|---|---|---|
| `SESSION_SECRET` | Yes | JWT signing secret (long random string). The API refuses to start on any hosted environment without it. |
| `NEON_DATABASE_URL` | Yes (for real data) | Neon connection string |
| `GMAIL_USER` | Yes for admin sign-in | Gmail address used for SMTP (password reset, notifications, admin MFA codes — in production admins cannot sign in without working email) |
| `GMAIL_APP_PASSWORD` | For email | Google App Password (not your normal Gmail password) |
| `FROM_EMAIL` | Optional | e.g. `FixBridge <you@gmail.com>` (defaults to `GMAIL_USER`) |
| `APP_URL` | Recommended | `https://YOUR-SITE.netlify.app` (reset-link base URL) |
| `VITE_GEMINI_API_KEY` | Optional | Build-time; AI assessment |

Do not commit `.env`. Use `.env.example` as the template.

### Deploy

1. Push this repo to GitHub and connect it in Netlify (or `netlify init`).
2. Set the env vars above.
3. Trigger a deploy; confirm `/api/jobs` responds and the SPA loads.

## Project structure

- `src/app/` — pages and features
- `api/app.js` — Express API (auth, jobs, profile, docs, admin)
- `server.js` — local API entry
- `netlify/functions/api.js` — Netlify Functions entry
- `netlify.toml` — build, redirects, functions

## License / attribution

See `ATTRIBUTIONS.md`.
