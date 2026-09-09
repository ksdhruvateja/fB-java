# FixBridge New Architecture

**Target stack:** Angular 19 SPA → Spring Boot 3.4 (Java 21) REST → Neon PostgreSQL  
**Legacy (retained until cutover):** React 18 + Vite (`src/`) → Express / Netlify Functions (`api/`) → same Neon DB

---

## High-level flow

```
Browser (fixbridge.us)
    │
    ▼
Angular SPA (frontend/ dist)
    │  Authorization: Bearer <JWT>
    │  HTTP /api/*
    ▼
Spring Boot API (api.fixbridge.us)
    │  controller → service → repository
    ▼
Neon PostgreSQL (shared schema with legacy)
```

Side-by-side during migration — **do not delete** `api/` or `src/` until smoke parity passes.

| Layer | Legacy (keep) | New |
| --- | --- | --- |
| SPA | `src/` React + Vite + Tailwind | `frontend/` Angular 19 + SCSS |
| API | `api/` Express + Netlify Functions | `backend/` Spring Boot jar / Docker |
| Process | `server.js` / Netlify | JVM on host or container |
| Database | Neon PostgreSQL | Neon PostgreSQL (same) |
| Local API port | often `:8888` / Netlify | `:3001` (`API_PORT`) |
| Local SPA | Vite `:5173` / `:5000` | `ng serve` + `proxy.conf.json` → `:3001` |

---

## Package layout (Spring)

```
com.fixbridge
  FixbridgeApiApplication
  config/          # CORS, async, properties, MVC
  security/        # JWT filter, RBAC, principals
  controller/      # HTTP /api/*
  service/         # business logic
  repository/      # Spring Data JPA
  entity/          # tables
  dto/ + mapper/
  exception/
  integration/     # stripe, geoapify, email, ai
  util/
```

---

## AI / Fixa layer

Angular (and legacy React) call assessment/chat under `/api/fixera/*`, `/api/fixa/*`, or `/api/ai/*`.

```
Client
  → AiController (/api/fixera|fixa|ai/*)
    → FixaService
      → AiProvider (ExplabsProvider default)
```

- Production path: **Experiential Labs** via `EXPLABS_API_KEY`.
- Assessment jobs: `@Async` worker + client poll of `assessment-status` (same contract as Netlify background function).
- Secrets stay on the server; Angular never holds AI keys.

---

## Auth path

1. `POST /api/auth/signin|signup` or `POST /api/auth/google` → JWT (HS256, ~7d).
2. Admin may receive `authStage: mfa_pending` → `POST /api/auth/mfa/start|verify`.
3. `JwtAuthenticationFilter` loads `UserPrincipal`; role routes gated (`ADMIN`, `CONTRACTOR`, authenticated homeowner).
4. Ownership / IDOR checks live in services (e.g. property owner, job participant), not only in the UI.

---

## Data access rules

- JPA `ddl-auto: none` (dev H2) / `validate` (prod Neon).
- Flyway **disabled**; additive DDL for new tables is applied manually (see `backend/src/main/resources/db/manual/`).
- H2 local schema: `schema-h2.sql` (PostgreSQL mode).
- Money: `BigDecimal` / integer cents — no floating-point money math.

---

## Frontend architecture (Angular)

- Standalone components, feature folders: `homeowner/`, `contractor/`, `admin/`, `marketing/`, `auth/`, `diy/`, `ai/`.
- `HttpClient` + auth interceptor; API base relative `/api` (dev proxy).
- Auth storage keys unchanged: `fixbridge-auth-token`, `fixbridge-user-cache`.
- Polling (e.g. notifications/messages ~15s) preserved; no WebSocket requirement for cutover.

---

## Deployment shape (suggested)

| Host | Artifact |
| --- | --- |
| `https://fixbridge.us` | Angular production build (`frontend/dist`) behind CDN/static host |
| `https://api.fixbridge.us` | Spring Boot jar or Docker image |
| Neon | Managed Postgres URL in `NEON_DATABASE_URL` |

CORS: `APP_URL` + `CORS_ORIGINS` must include the SPA origin(s). Details in `docs/DEPLOYMENT.md`.

---

## Related docs

- `docs/MIGRATION_MAP.md` — phase checklist and domain maps  
- `docs/API_MAP.md` — implemented Spring routes  
- `docs/FEATURE_PARITY.md` — DONE / PARTIAL / MISSING vs legacy  
- `docs/CUTOVER.md` — switch from Netlify Functions  
- `docs/SECURITY.md` — JWT, MFA, webhooks, secrets  
