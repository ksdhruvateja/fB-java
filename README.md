# FixBridge

React + Vite app that connects homeowners with local contractors. Auth, jobs, profiles, docs, and Google OAuth are served by an Express API.

## Stack

- **Frontend**: React 18 + Vite 6, Tailwind CSS v4, React Router 7
- **API**: Express (`api/app.js`) — local Node server, or Railway (`node server.js`) serving the same SPA
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

## Railway hosting (production)

Production is one Node service on Railway. Source of truth: `ksdhruvateja/fB-java` `main`. Checklist: `RAILWAY.md`.

- Public URL: https://fb-java-production.up.railway.app
- Build: `npm run build`
- Start: `npm start` (`node server.js` on `0.0.0.0:$PORT`)
- Health: `/api/health`

The SPA and API are same-origin (`/api/*`). Do not use `https://fixbridge.netlify.app` as production.

## Netlify hosting (legacy)

`https://fixbridge.netlify.app` is a leftover second deploy. It is **not** production.

`netlify.toml` and `public/_redirects` 301 every path to Railway so a future Netlify publish from this repo cannot keep serving a stale frontend. Until that Netlify site is republished from this repo, the old hostname can still show old UI.

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
| `SESSION_SECRET` | Yes | JWT signing secret (long random string) |
| `NEON_DATABASE_URL` | Yes (for real data) | Neon connection string |
| `GMAIL_USER` | For email | Gmail address used for SMTP (password reset + notifications) |
| `GMAIL_APP_PASSWORD` | For email | Google App Password (not your normal Gmail password) |
| `FROM_EMAIL` | Optional | e.g. `FixBridge <you@gmail.com>` (defaults to `GMAIL_USER`) |
| `APP_URL` | Recommended | `https://fb-java-production.up.railway.app` |
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
