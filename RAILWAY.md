# Railway hosting

FixBridge on Railway is a single Node service: Vite builds `dist/`, then `npm start` (`node server.js`) serves the API and the SPA.

Project: [sublime-optimism / fB-java](https://railway.com/project/1d9eacd5-0eaf-41f3-9478-c426dc5e30dc)

Public URL: https://fb-java-production.up.railway.app

Repo: [ksdhruvateja/fB-java](https://github.com/ksdhruvateja/fB-java)

## How it runs

| Step | Command |
| --- | --- |
| Build | `npm run build` (Vite → `dist/`) |
| Start | `npm start` → `node server.js` |
| Listen | `0.0.0.0:$PORT` (Railway injects `PORT`) |
| Health | `GET /api/health` |
| Reminders | In-process poll (`ENABLE_SERVICE_REMINDER_POLL=true`) |
| AI assessments | In-process (not Netlify background functions) |

`RAILPACK_NO_SPA=true` keeps Railpack from serving Vite with Caddy. The Express process must own HTTP.

## Railway Variables

Set these on the **fB-java** service (Variables). Do not commit secrets.

### Required for a production process

| Variable | Notes |
| --- | --- |
| `SESSION_SECRET` | Long random string for JWT signing |
| `NEON_DATABASE_URL` or `DATABASE_URL` | Postgres. Neon is fine; Railway Postgres provides `DATABASE_URL` |
| `STRIPE_SECRET_KEY` | `sk_test_…` or `sk_live_…` — required unless `FIXBRIDGE_REQUIRE_PAYMENTS=false` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` — required unless `FIXBRIDGE_REQUIRE_PAYMENTS=false` |
| `APP_URL` | Public HTTPS origin, e.g. `https://YOUR-SERVICE.up.railway.app` |

### Hosting (already intended for this service)

| Variable | Value |
| --- | --- |
| `FIXBRIDGE_HOSTING` | `railway` |
| `ENABLE_SERVICE_REMINDER_POLL` | `true` |
| `RAILPACK_NO_SPA` | `true` |
| `RAILPACK_NODE_VERSION` | `22` |
| `NPM_CONFIG_PRODUCTION` | `false` (so `vite` is installed during build) |
| `FIXBRIDGE_REQUIRE_PAYMENTS` | `false` until Stripe keys are set (otherwise production will refuse to start) |

Do **not** set `NODE_ENV=production` in the Variables UI if that would apply to the **build**. Railpack should install devDependencies for `vite build`. Runtime production mode is fine.

### Recommended

| Variable | Notes |
| --- | --- |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Build-time; rebuild after changing |
| `GOOGLE_CLIENT_ID` | Sign in with Google |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Password reset + notifications |
| `FIXBRIDGE_FROM_EMAIL` | Branded sender |
| `EXPLABS_API_KEY` | Fixera / AI assessment |
| `GEOAPIFY_API_KEY` | Address autocomplete |
| `CORS_ORIGINS` | Extra origins (www, custom domain) |
| `VITE_GOOGLE_MAPS_API_KEY` | Maps JS (build-time) |

Add the Railway public origin to Google OAuth **Authorized JavaScript origins**.

Stripe webhook endpoint:

```text
https://YOUR-SERVICE.up.railway.app/api/stripe/webhook
```

(Confirm the exact path in `api/stripe` / app routes if you customize it.)

## After deploy

1. Confirm `GET https://YOUR-SERVICE.up.railway.app/api/health` returns `ok: true` and `database` is `neon` or `postgres`.
2. Hard-refresh the site and sign in.
3. Point `APP_URL` at the generated (or custom) domain if it was still localhost.
