# FixBridge Security (new stack)

Applies to Spring Boot (`backend/`) + Angular (`frontend/`). Legacy Express rules remain authoritative for the live Netlify app until cutover.

---

## JWT

- Algorithm: HS256; secret from `SESSION_SECRET` (`fixbridge.jwt.secret`).
- Default session TTL: ~7 days; MFA-pending tokens shorter (`mfa-pending-expiration`, ~15m).
- Transport: `Authorization: Bearer <token>` only — never put secrets in query strings.
- Filter: `JwtAuthenticationFilter` → `UserPrincipal` (id, role, email, claims).
- Stateless sessions (`SessionCreationPolicy.STATELESS`); CSRF disabled for Bearer API.

**Angular:** store token in `localStorage` key `fixbridge-auth-token` (same as React). Logout is client-side clear only (no server revoke list yet).

---

## Roles

| Role claim | Typical access |
| --- | --- |
| `homeowner` | Own properties, jobs, DIY, payments mine, messaging |
| `contractor` | `/api/contractor/**`, invitations, job status marks, Connect onboard |
| `admin` | `/api/admin/**` (+ staff RBAC presets in `RbacPermissions`) |

Never trust client-sent `is_admin` alone — Spring uses JWT role / DB user. Fine-grained admin presets (`jobs.assign`, `payments.refund`, …) are defined; not every admin route is permission-tagged yet (**PARTIAL** vs legacy `api/rbac.js`).

---

## MFA

- Admin (and configured) flows can return `authStage: mfa_pending`.
- `POST /api/auth/mfa/start` → challenge stored hashed; `POST /api/auth/mfa/verify` upgrades to full session JWT.
- Angular MFA challenge UI is still incomplete — treat admin portal MFA as **PARTIAL** until UI lands.

---

## IDOR / ownership

Authorization is enforced in services, not only in the UI:

- Properties: owner scoped (`findByIdAndOwnerUserId`); admins may elevate.
- Managed jobs: participant / homeowner / assigned contractor / admin checks (`ManagedJobAccess`).
- Messaging / notifications: user-scoped queries.
- Admin catalog updates: role gate only (platform config).

When porting new endpoints, copy legacy ownership helpers 1:1 before exposing lists by raw id.

---

## Stripe webhooks

- `POST /api/stripe/webhook` is **public** but verified with `STRIPE_WEBHOOK_SECRET` (signature).
- Raw body required for verification — do not JSON-parse before signature check.
- Idempotency via `webhook_events` table (`provider` + `event_id`).
- Production must not silently “simulate” success when Stripe is unconfigured (hardened in legacy; keep the same rule in Spring).

---

## Secrets must not ship in Angular

| Secret | Server env only |
| --- | --- |
| `SESSION_SECRET` | JWT |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe |
| `EXPLABS_API_KEY` | AI |
| `GEOAPIFY_API_KEY` | Address proxy |
| `NEON_DATABASE_URL`, DB user/password | Datasource |
| `GMAIL_APP_PASSWORD` / SMTP | Mail |

SPA may hold **publishable** Stripe key and optional Google client id only. Proxy address autocomplete through `/api/...` so Geoapify keys stay server-side.

---

## CORS & network

- Explicit origins via `APP_URL` + `CORS_ORIGINS`.
- Prefer HTTPS everywhere in production.
- Rate limits configured via `fixbridge.rate-limit.*` (signin tighter than general API).

---

## Checklist

- [ ] Strong unique `SESSION_SECRET` in prod
- [ ] Neon credentials not in git
- [ ] Webhook secret matches Stripe dashboard endpoint
- [ ] Admin MFA enforced for privileged accounts
- [ ] New endpoints reviewed for IDOR
- [ ] Angular production build grepped for leaked secrets
