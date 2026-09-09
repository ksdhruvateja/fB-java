# FixBridge Deployment (Angular + Spring)

Suggested production hosts:

| Role | Host | Artifact |
| --- | --- | --- |
| Marketing + portals SPA | `https://fixbridge.us` (+ `www`) | Angular production build from `frontend/` |
| REST API | `https://api.fixbridge.us` | Spring Boot jar or Docker image from `backend/` |
| Database | Neon | PostgreSQL (`NEON_DATABASE_URL`) |

Legacy Netlify (React + Functions) remains the live stack until cutover — see `docs/CUTOVER.md`.

---

## Build artifacts

### Angular SPA

```bash
cd frontend
npm ci
npm run build
# output: frontend/dist/… (serve as static site)
```

- Configure environment / `apiUrl` so browser calls `https://api.fixbridge.us` **or** same-origin `/api` reverse-proxied to Spring.
- Dev: `proxy.conf.json` forwards `/api` → `http://127.0.0.1:3001`.

### Spring Boot API

```bash
cd backend
mvn -DskipTests package
# jar: target/fixbridge-api-*.jar
java -jar target/fixbridge-api-*.jar
```

**Docker** (`backend/Dockerfile`):

```bash
cd backend
docker build -t fixbridge-api .
docker run -p 3001:3001 --env-file .env fixbridge-api
```

Image defaults: `SPRING_PROFILES_ACTIVE=prod`, port `3001`.

---

## Environment (summary)

Required in production:

- `SPRING_PROFILES_ACTIVE=prod`
- `NEON_DATABASE_URL` (JDBC URL for Neon)
- `SESSION_SECRET` (JWT HS256, long random)
- `APP_URL=https://fixbridge.us`
- `CORS_ORIGINS=https://fixbridge.us,https://www.fixbridge.us`
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, publishable key for SPA only
- AI: `EXPLABS_API_KEY`
- Optional: `GOOGLE_CLIENT_ID`, `GEOAPIFY_API_KEY`, mail (`GMAIL_*` / `FIXBRIDGE_*`)

Full list: `docs/ENVIRONMENT_VARIABLES.md`.

### Neon DDL for service catalog

Flyway is **disabled**. On Neon, run once (additive):

`backend/src/main/resources/db/manual/001_service_offerings.sql`

H2 local/dev already creates `service_offerings` via `schema-h2.sql`.

---

## CORS

`CorsConfig` allows:

1. `APP_URL` (trimmed, no trailing slash)
2. Comma-separated `CORS_ORIGINS`
3. Dev fallback: `http://localhost:5000`, `:5173`, `127.0.0.1:5000`

Methods: GET/POST/PUT/PATCH/DELETE/OPTIONS. Credentials allowed. Set production origins explicitly — do not rely on localhost defaults in prod.

---

## Reverse proxy / TLS

Typical pattern:

1. TLS terminator (Cloudflare / ALB / nginx) → SPA static bucket or CDN for `fixbridge.us`.
2. Same terminator or separate host → Spring on private port for `api.fixbridge.us`.
3. Stripe webhook endpoint must reach Spring raw body: `POST https://api.fixbridge.us/api/stripe/webhook`.
4. Health: `GET /api/health` and `/actuator/health`.

If SPA and API share one domain, proxy `/api` → Spring and keep relative `/api` in Angular.

---

## Ops checks after deploy

- [ ] `GET https://api.fixbridge.us/api/health` → `{ ok: true }`
- [ ] SPA loads; CORS preflight succeeds for login
- [ ] Sign-in returns JWT; `/api/auth/me` works
- [ ] Stripe webhook signature verifies (test event)
- [ ] `GET /api/home-services` returns seeded offerings (after manual SQL + restart seed)
- [ ] No secrets in Angular bundles (search build for `SECRET`, `sk_live`, Explabs key)
