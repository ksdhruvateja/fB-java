---
name: DB & API architecture
description: How the Express API server, Neon DB, and Netlify Functions are wired together.
---

## Rule
- `api/app.js` — single source of truth for all Express routes and DB init. Export `default app` and named `initDb`.
- `server.js` — Replit dev entry; imports `api/app.js`, calls `initDb()`, listens on port 3001.
- `netlify/functions/api.js` — Netlify serverless entry; wraps same `api/app.js` with `serverless-http`.
- Vite proxies `/api/*` → `http://localhost:3001` in dev (`vite.config.ts`).
- `netlify.toml` redirects `/api/*` → `/.netlify/functions/api/:splat` in production.
- `pnpm run dev` runs both processes via `concurrently`.

**Why:** One code path for dev and prod avoids drift; serverless-http wraps Express transparently.

**How to apply:** `api/app.js` creates the app and registers route modules (`managed-routes.js`, `platform-routes.js`, `payout-routes.js`, …). Add new routes to the module for that area, or a new `register*Routes(app, deps)` module wired up in `app.js`. DB schema changes go in `initDb()` using `CREATE TABLE IF NOT EXISTS` (idempotent).
