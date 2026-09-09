# FixBridge → Angular + Spring Boot Migration Map

**Status:** In progress (staged). Existing `api/` (Express) and `src/` (React+Vite) remain the functional specification until Java/Angular replacements are verified.

**Current stack:** React 18 + Vite 6 + Tailwind → Express 5 (Netlify Functions) → Neon PostgreSQL  
**Target stack:** Angular 19 + SCSS → Spring Boot 3.4 (Java 21) → same Neon PostgreSQL

---

## Architecture target

```
Angular SPA (frontend/)
    ↓ HTTP Bearer JWT /api/*
Spring Boot REST (backend/)
    ↓ controller → service → repository
PostgreSQL / Neon (unchanged schema)
```

Side-by-side layout (no blind deletes):

| Legacy (keep until cutover) | New |
|----------------------------|-----|
| `src/` React SPA | `frontend/` Angular |
| `api/` Express | `backend/` Spring Boot |
| `server.js` / Netlify functions | Spring Boot jar / container |
| Neon DB | Neon DB (same) |

---

## Phase checklist

| Phase | Deliverable | Status |
|-------|-------------|--------|
| 1 Audit | Repo understanding | Done |
| 2 Document | Migration map + architecture/API/security/deploy/cutover/env/parity docs | Done (ongoing refresh) |
| 3 Spring Boot scaffold | Layered package layout | Done |
| 4 Entities + APIs | Core domains + service catalog; admin/finance/HomeCare/payouts still thin | In progress — completion work ongoing |
| 5 AuthZ | JWT, roles, MFA, Google, RBAC constants | Done (fine-grained RBAC matrix still partial) |
| 6 Integrations | Stripe subset, Explabs, email, Geoapify, Google | In progress (payouts/subs/refunds depth remaining) |
| 7 Angular scaffold | Feature folders + router + portals | Done |
| 8 Port screens | Shells + report/AI/DIY/hire + catalog wiring; full React parity remaining | In progress — completion work ongoing |
| 9 Reconnect | Angular → Spring `/api` via proxy | In progress (most core services wired; stubs remain) |
| 10–11 Regression | Smoke journeys vs legacy | Pending |
| 12–14 Prod build/security/deploy | Angular build + Spring jar/Docker; cutover runbook written, flip pending | In progress |

### Milestone snapshot (current)

- **Backend:** Controllers for auth, Google, MFA, properties, managed jobs, public jobs, AI/DIY, quotes/COs, Stripe checkout/webhook, payments, messaging, notifications, address, service-area, **service catalog** (`/api/home-services`, admin services), admin work-queue/invite/assign, contractor invitations/status.
- **Frontend:** Marketing + three portals; homeowner report→assess→DIY/Hire; job detail pay/approve; NotificationBell polling; catalog API client for report/services.
- **Docs:** `FEATURE_PARITY`, `NEW_ARCHITECTURE`, `API_MAP`, `DEPLOYMENT`, `SECURITY`, `CUTOVER`, `ENVIRONMENT_VARIABLES` under `docs/`.
- **Verified:** Maven compile/tests and `ng build` used as gates during port.
- **Legacy `api/` + `src/`:** retained as functional specification until cutover — **do not delete**.

---

## Frontend mapping (React → Angular)

### Tech

| Current | Target |
|---------|--------|
| React 18 + Vite | Angular 19 standalone |
| Custom History page state (`App.tsx` / `navigation.ts`) | Angular Router + services mirroring nav frames |
| Tailwind v4 + CSS vars | Global SCSS preserving tokens (`theme.css` → `styles/`) |
| `fetch` + `*Api.ts` | Angular `HttpClient` + interceptors + services |
| `localStorage` JWT | Same keys: `fixbridge-auth-token`, `fixbridge-user-cache` |
| Controlled forms | Reactive Forms (same validation rules) |
| Motion / Radix shadcn | Angular animations + ported shared components |

### Route / portal map

| Current page key / URL | Angular route / area |
|------------------------|----------------------|
| `home` `/` | `''` → marketing home |
| `contractors` | `/contractors` |
| `about` | `/about` |
| `go-pro` `?go-pro=1` | `/go-pro` (+ query compat) |
| `homeowner-login` | `/auth/homeowner` |
| `contractor-login` | `/auth/contractor` |
| `admin-login` `?portal=admin` | `/auth/admin` |
| `partner` | `/partner` |
| `/reset-password` | `/reset-password` |
| `/legal/*` | `/legal/:slug` |
| `/marketing/unsubscribe` | `/marketing/unsubscribe` |
| `/start` | `/start` |
| `homeowner-dashboard` + tabs | `/homeowner/**` lazy |
| `contractor-dashboard` + tabs | `/contractor/**` lazy |
| `admin` + sidebar | `/admin/**` lazy |

**Preserve soft contracts:** Stripe return queries (`paid=dispatch`, `invoicePaid`, `paid=subscription`, `stripe=return`), referral/partner/discount query params, sessionStorage nav frames (`fixbridge-nav-frame-*`).

### Feature folder map

| React area | Angular |
|------------|---------|
| `auth.ts`, login screens | `core/auth`, `auth/` |
| `HomeownerDashboard` + panels | `homeowner/` |
| `ContractorDashboard` + panels | `contractor/` |
| `AdminPanel` + panels | `admin/` |
| `diy/` | `diy/` |
| `fixera/` | `ai/` |
| `managedJobs.ts` etc. | domain `services/` + feature services |
| `components/ui` | `shared/components` |
| layouts in App | `layouts/` |

---

## Backend mapping (Express → Spring Boot)

### Package layout

```
com.fixbridge
  FixbridgeApiApplication
  config/
  security/
  controller/
  service/
  repository/
  entity/
  dto/
  mapper/
  exception/
  integration/  (stripe, geoapify, google, email, ghl, ai)
  validation/
  util/
```

### Endpoint domains (preserve `/api/...` paths)

| Domain | Legacy files | Spring target |
|--------|--------------|---------------|
| Auth | `app.js`, `google-auth-routes.js`, `password-reset.js` | `AuthController`, `GoogleAuthService`, `MfaService` |
| Managed jobs | `managed-routes.js` | `ManagedJobController` + services |
| Quotes/invoices | `quote-workspace-routes.js`, `invoices.js` | `QuoteController`, `InvoiceController` |
| Payments/Stripe | `stripe.js`, webhook in managed | `StripeWebhookController`, `PaymentService` |
| Payouts | `payout-routes.js`, `payout-service.js` | `PayoutController` |
| Properties | property routes in app/platform | `PropertyController` |
| Messaging | `messaging.js` | `MessageController` |
| Notifications | `in-app-notifications.js` | `NotificationController` |
| Support | `support-tickets.js` | `SupportTicketController` |
| AI / Fixera | `api/fixa/*`, `assessment-worker.js` | `FixaService` → `AiProvider` |
| Address | `address-routes.js`, `geoapify-address.js` | `AddressController` + Geoapify integration |
| Compliance | `contractor-compliance-*.js` | `ComplianceController` |
| HomeCare / subs | `platform-routes.js`, `homecare-*-routes.js` | `SubscriptionController`, `HomecareController` |
| Admin | many `admin-*` | `admin/` controllers + RBAC |
| Legal/marketing/referrals | respective routes | matching controllers |
| Health | `/api/health` | `HealthController` / Actuator |

### Auth / security map

| Behavior | Legacy | Spring |
|----------|--------|--------|
| JWT HS256, 7d, Bearer | `makeToken` / `SESSION_SECRET` | `JwtService` + Security filter |
| Roles | `homeowner`/`contractor`/`admin` | Same claims; never trust `is_admin` alone |
| Admin MFA | `authStage: mfa_pending` | Same token stage + MFA endpoints |
| Password | bcryptjs | BCryptPasswordEncoder |
| Google | GIS ID token → `/api/auth/google` | `GoogleTokenVerifier` |
| RBAC presets | `api/rbac.js` | `RbacService` + `@PreAuthorize` / permission checker |
| Rate limits | express-rate-limit | Bucket4j / Filter |
| CORS | `api/security.js` | `CorsConfigurationSource` |
| IDOR | ownership helpers | service-layer checks ported 1:1 |

### AI provider abstraction

```
Angular → /api/fixera|fixa|ai/* → FixaService → AiProviderRouter → ExplabsProvider (default)
                                                              → (OpenAI / OpenRouter / Gemini / Claude stubs only if wired)
```

Preserve Explabs as production path (`EXPLABS_API_KEY`).

### Money

All monetary math → `BigDecimal` (no float). Port formulas from `financial-calculations.js`, `pricing.js`, `tips.js`, payout services unchanged.

---

## Database

- **Keep Neon / existing data.** No destructive drops.
- Canonical runtime DDL: `api/schema-managed.js` (+ scattered inits). `schema.sql` is a subset.
- JPA: `ddl-auto: validate` (or `none`); Flyway **disabled**. Additive DDL lives in `backend/src/main/resources/db/manual/` (e.g. `001_service_offerings.sql` for Neon). H2 uses `schema-h2.sql`.
- Entities must match snake_case columns / JSONB fields.

### Core tables (non-exhaustive)

`users`, `properties`, `managed_jobs`, `job_invitations`, `bids`, `proposals`, `change_orders`, `payments`, `transfers`, `homeowner_invoices`, `subscriptions`, `diy_projects`, `notifications`, `conversations`, `messages`, `message_attachments`, `support_tickets`, `contractor_employees`, `contractor_compliance_*`, `pricing_rules`, `fixera_interactions`, `audit_logs`, … (90+ — see schema-managed).

---

## Integrations env map

| Concern | Env (server) | Angular (`VITE_*` → `environment.ts`) |
|---------|--------------|----------------------------------------|
| DB | `NEON_DATABASE_URL` | — |
| JWT | `SESSION_SECRET` | — |
| Stripe | `STRIPE_*` | publishable key only |
| Google GIS | `GOOGLE_CLIENT_ID` | optional client ID |
| Maps | `GOOGLE_MAPS_API_KEY` | `googleMapsApiKey` |
| Geoapify | `GEOAPIFY_API_KEY` | — (proxy) |
| AI | `EXPLABS_API_KEY` | — |
| Email | `GMAIL_*`, `FIXBRIDGE_*` | — |
| CORS/App | `APP_URL`, `CORS_ORIGINS` | `apiUrl` |

Never expose secrets to Angular.

---

## Background jobs

| Legacy | Spring approach |
|--------|-----------------|
| Netlify scheduled service reminders | `@Scheduled` or external cron hitting secured endpoint |
| Assessment background function | `@Async` + status polling (same API contract) |
| Compliance expiration poll | `@Scheduled` |
| Stripe webhooks | Same path `/api/stripe/webhook` raw body |

Realtime: none today (15s HTTP poll) — preserve polling; WebSocket optional later.

---

## Cutover rules

1. Do not delete `api/` or `src/` until Angular+Spring journeys pass smoke parity.
2. Preserve `/api/*` contracts so smoke scripts can retarget base URL.
3. No placeholder screens or mocked production APIs.
4. Logical git commits per phase/domain.
5. Existing app behavior = acceptance tests.
