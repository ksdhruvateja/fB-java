# FixBridge

React + Vite app that connects homeowners with local contractors. Auth, jobs, profiles, docs, and Google OAuth are served by an Express API.

## Stack

- **Frontend**: React 18 + Vite 6, Tailwind CSS v4, React Router 7
- **API**: Express (`api/app.js`) — local Node server or Netlify Function
- **Database**: Neon Postgres (`NEON_DATABASE_URL`), or in-memory fallback for local-only
- **AI**: Google Gemini (`VITE_GEMINI_API_KEY`) for job assessment

## Local development

```bash
pnpm install
cp .env.example .env   # then fill in values
pnpm run dev
```

- Vite client: http://localhost:5000  
- API: http://localhost:3001 (proxied from Vite as `/api/*`)

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

### Environment variables (Netlify UI)

Set these under **Site settings → Environment variables** (and rebuild after changing `VITE_*` vars):

| Variable | Required | Notes |
|---|---|---|
| `SESSION_SECRET` | Yes | JWT signing secret (long random string) |
| `NEON_DATABASE_URL` | Yes (for real data) | Neon connection string |
| `VITE_GOOGLE_CLIENT_ID` | For Google Sign-In | Build-time + runtime; add your Netlify URL to Google OAuth **Authorized JavaScript origins** |
| `VITE_GEMINI_API_KEY` | Optional | Build-time; AI assessment |
| `GOOGLE_CLIENT_ID` | Optional | Alias if you prefer not to rely on `VITE_` in Functions |
| `RESEND_API_KEY` | Optional | Password-reset emails |
| `FROM_EMAIL` | Optional | Resend from address |
| `APP_URL` | Recommended | `https://YOUR-SITE.netlify.app` (reset-link fallback) |

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
