# FixBridge

Homeowners, contractors, and ops on one platform — AI assessment (Fixera), dispatch, quotes, payments, and messaging.

## Migration status (Angular + Spring Boot)

The product is being migrated from **React + Vite + Express** to **Angular + Spring Boot** while keeping the same Neon PostgreSQL database and `/api/*` contracts.

| Layer | Legacy (still present) | Target (in progress) |
|-------|------------------------|----------------------|
| Frontend | `src/` React 18 + Vite | `frontend/` Angular 19 |
| Backend | `api/` Express 5 | `backend/` Spring Boot 3.3 / Java 21 |
| Database | Neon PostgreSQL | **Same** (no destructive migration) |

Canonical planning doc: [`docs/MIGRATION_MAP.md`](docs/MIGRATION_MAP.md)

**Do not delete** `api/` or `src/` until Angular ↔ Spring journeys pass smoke parity.

### What’s already on the new stack

- Auth: email/password, Google GIS, admin MFA, JWT Bearer, password reset
- Properties (owner isolation), managed jobs CRUD/cancel, public guest intake
- AI assessment (Fixera → Explabs), DIY projects + safety, quotes/change orders (homeowner subset)
- Stripe prepare-checkout / pay-dispatch / webhook / Connect onboard / payments mine
- Messaging, notifications, address/Geoapify autocomplete, service-area check
- Admin work-queue, invite/assign; contractor invitations + job status marks
- Angular portals (homeowner/contractor/admin) with report→AI→DIY/Hire shells

### Still on legacy / not fully ported yet

Large Express surfaces remain: full quote workspace, subscriptions/HomeCare billing, payouts v2, disputes, compliance docs matrix, referrals/partners admin, legal/marketing admin, support tickets depth, and full React visual parity for every panel. See the migration map for the backlog.

---

## New stack — local development

### Backend (Spring Boot)

```bash
cd backend
# Requires JDK 21 + Maven
mvn spring-boot:run
# listens on http://127.0.0.1:3001 by default
```

Set `NEON_DATABASE_URL`, `SESSION_SECRET`, and other secrets like `.env.example` (map JDBC URL for Spring if needed). Dev profile can use H2 for auth smoke only — **use Neon for real data**.

```bash
mvn -DskipTests package
java -jar target/fixbridge-api-0.0.1-SNAPSHOT.jar --spring.profiles.active=prod
```

### Frontend (Angular)

```bash
cd frontend
npm install
npm start
# proxy /api → http://127.0.0.1:3001 (see proxy.conf.json)
```

Production build:

```bash
cd frontend
npm run build
# output: frontend/dist/frontend
```

---

## Legacy stack — still runnable

```bash
npm install
cp .env.example .env
npm run dev
```

- Vite client: http://localhost:5000  
- Express API: http://localhost:3001  

Netlify config in `netlify.toml` still targets the legacy Vite + Functions deploy until cutover.

---

## Environment variables

See `.env.example` and `NETLIFY_ENV.md`. **Never** put Stripe secrets, Explabs keys, DB passwords, or Gmail app passwords in Angular `environment*.ts`.

| Variable | Used by |
|----------|---------|
| `SESSION_SECRET` | JWT (Express + Spring) |
| `NEON_DATABASE_URL` | Postgres |
| `EXPLABS_API_KEY` | Fixera / AI (server only) |
| `STRIPE_*` | Payments (server); publishable key only on client |
| `GOOGLE_CLIENT_ID` | GIS (server config + optional client) |
| `GEOAPIFY_API_KEY` | Address autocomplete (server proxy) |
| `GMAIL_*` / `FIXBRIDGE_*` | Email |

---

## Project structure

```
frontend/          Angular SPA (migration target)
backend/           Spring Boot API (migration target)
src/               Legacy React SPA
api/               Legacy Express API
docs/MIGRATION_MAP.md
schema.sql         Reference DDL (runtime schema is richer — api/schema-managed.js)
```

## License / attribution

See `ATTRIBUTIONS.md`.
