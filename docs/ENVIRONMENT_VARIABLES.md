# FixBridge Environment Variables (Angular + Spring)

Server secrets belong only on the Spring host (or secret manager). Angular may use public client ids / publishable keys only.

---

## Core / Spring

| Variable | Required | Description |
| --- | --- | --- |
| `SPRING_PROFILES_ACTIVE` | prod: yes | `dev` (H2) or `prod` (Neon) |
| `API_PORT` | no | HTTP port (default `3001`) |
| `NEON_DATABASE_URL` | prod: yes | JDBC URL for Neon Postgres |
| `DB_USER` | if needed | Datasource username (often embedded in URL) |
| `DB_PASSWORD` | if needed | Datasource password |
| `DB_DRIVER` | no | Dev override (default H2 / Postgres by profile) |
| `SESSION_SECRET` | **yes** | JWT HS256 secret (long random) |
| `APP_URL` | prod: yes | Canonical SPA origin, e.g. `https://fixbridge.us` |
| `CORS_ORIGINS` | recommended | Comma-separated extra origins (`https://www.fixbridge.us`) |
| `JSON_BODY_LIMIT` | no | Body size hint (default `20mb`) |
| `API_RATE_LIMIT_MAX` | no | General API rate (default `400`) |
| `SIGNIN_RATE_LIMIT_MAX` | no | Sign-in rate (default `30`) |
| `PRIMARY_ADMIN_EMAIL` | optional | Bootstrap / ops hint |

---

## Stripe

| Variable | Required | Description |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | payments | Secret key (`sk_…`) |
| `STRIPE_WEBHOOK_SECRET` | webhooks | Endpoint signing secret (`whsec_…`) |
| `STRIPE_PUBLISHABLE_KEY` | SPA checkout | Publishable (`pk_…`); also readable as `VITE_STRIPE_PUBLISHABLE_KEY` for migration |
| Angular env | SPA only | Publishable key in `environment.ts` — **never** secret/webhook |

---

## Google / maps

| Variable | Required | Description |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Google GIS | OAuth client id (server + optional SPA mirror) |
| `VITE_GOOGLE_CLIENT_ID` | legacy compat | Fallback for client id |
| `GOOGLE_MAPS_API_KEY` | optional | Server maps if used |

---

## Address / Geoapify

| Variable | Required | Description |
| --- | --- | --- |
| `GEOAPIFY_API_KEY` | address features | Server-only; exposed via `/api/address*` / public autocomplete |
| `GEOAPIFY_COUNTRY_FILTER` | no | Default `countrycode:us` |

---

## AI (Fixa / Explabs)

| Variable | Required | Description |
| --- | --- | --- |
| `EXPLABS_API_KEY` | assessment/chat | Experiential Labs API key |
| `AI_FETCH_TIMEOUT_MS` | no | Default `60000` |

---

## Email

| Variable | Required | Description |
| --- | --- | --- |
| `DISABLE_OUTBOUND_EMAIL` | no | `true` to suppress send |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | if Gmail SMTP | Dev/prod mail |
| `FIXBRIDGE_FROM_EMAIL` / `FROM_EMAIL` | no | From address |
| `FIXBRIDGE_FROM_NAME` | no | From display name |
| `FIXBRIDGE_REPLY_TO_EMAIL` | no | Reply-To |

---

## Media / attachments

| Variable | Required | Description |
| --- | --- | --- |
| `MAX_ATTACHMENT_SIZE_MB` | no | Default `2.5` |
| `MAX_ATTACHMENTS_PER_MESSAGE` | no | Default `5` |
| `ATTACHMENT_STORAGE_PROVIDER` | no | Default `database` |

---

## Angular (public)

| Setting | Notes |
| --- | --- |
| `apiUrl` / relative `/api` | Points at Spring (prod absolute or same-origin proxy) |
| Stripe publishable key | Client-safe |
| Google client id | Client-safe if GIS used in browser |

Do **not** embed: `SESSION_SECRET`, Stripe secret/webhook, Explabs, Geoapify, DB URL, SMTP passwords.

---

## Local H2 vs Neon

| Profile | DB | Schema |
| --- | --- | --- |
| `dev` | In-memory H2 (PostgreSQL mode) unless `NEON_DATABASE_URL` set | `classpath:schema-h2.sql` |
| `prod` | Neon | Pre-created tables; run `db/manual/*.sql` for additive creates; Flyway off |

Service catalog seed runs on startup when `service_offerings` is empty (`ServiceCatalogService` ApplicationRunner).
