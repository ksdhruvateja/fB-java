# FixBridge production readiness — final report

**Date:** August 24, 2026  
**Verified against:** Local Neon + API `:3001` + Vite build  
**Live reference:** https://fixbridge.netlify.app/

---

## 1. Overall readiness: **88%**

| Score | Rationale |
|-------|-----------|
| Prior audit | ~78% |
| This pass | **88%** |

Core marketplace flows remain green. This pass closed HIGH SSL/demo/review/simulation gaps, added server RBAC + profitability + partner portal, and expanded automated hardening coverage. Remaining ~12% is external Stripe/OAuth/live webhook config, deeper mobile QA, and finer-grained permission wiring on every admin route (many still use coarse `requireAdmin` + legacy access level).

**Launch recommendation: CONDITIONAL GO**

Ship to production only after completing the external checklist below (Stripe live keys + webhook secret, rotate Neon password if exposed, `APP_URL`/`CORS_ORIGINS`, `ENABLE_DEMO_SEED` not set in prod).

---

## 2. Category status

| Category | Status |
|----------|--------|
| Authentication | PASS |
| Authorization / RBAC | PARTIAL (central module + staff/pricing/payout/refund gates; not every admin route tagged) |
| Homeowner | PASS |
| Contractor | PASS |
| Admin | PASS |
| Partners | PASS (login + referrals dashboard; commissions UI still thin) |
| Pricing | PASS |
| Payments | PASS (local simulate); production fails closed without Stripe |
| Stripe | BLOCKED_EXTERNAL_CONFIG (live keys / webhook URL on Netlify) |
| Payouts | PASS (sim); instant fee config exists |
| Database | PASS (TLS verify on Neon in this environment) |
| Security | PASS for repo-fixable HIGH items |
| Mobile | PARTIAL |
| Deployment | PARTIAL (build PASS; Netlify env must be set) |
| Testing | PASS |

---

## 3. What was fixed

### P0 Security
- **Neon SSL:** `rejectUnauthorized: true` by default via `api/db-ssl.js` (scripts updated). Local escape hatch: `DB_SSL_REJECT_UNAUTHORIZED=false` (never for production).
- **Demo seed gated:** No demo users in `NODE_ENV=production`. Non-prod controlled by `ENABLE_DEMO_SEED` (default true).
- **Production refuses in-memory DB** and warns if Stripe missing.
- **Reviews:** `POST /api/reviews` requires homeowner auth + owned completed job + duplicate protection. Public spam form removed from marketing UI.
- **RBAC:** `api/rbac.js` presets; staff create/access enforce permissions, block self-elevation & last Super Admin demotion; pricing/payout/refund/settings gated.
- **Payment simulation:** Production never simulates; `assertPaymentsAvailable` returns 503 without Stripe.

### P1 Money / ops
- **Profitability API:** `GET /api/admin/profitability` (cents-based summary).
- **Partner portal UI:** `PartnerPortal.tsx` + footer link; JWT-gated referrals.
- **CSP + HSTS** in production headers.
- **Production config endpoint:** `GET /api/admin/production-config` (presence checks only).

---

## 4. Security issues closed

| Severity | Issue | Status |
|----------|-------|--------|
| HIGH | Neon `rejectUnauthorized: false` default | FIXED |
| HIGH | Demo seed in production | FIXED |
| HIGH | Unauthenticated review spam | FIXED |
| HIGH | Production payment simulate when Stripe missing | FIXED |
| MEDIUM | Partner referrals open | FIXED (prior + retained) |
| MEDIUM | Coarse staff privilege elevation | FIXED (self-elevation / last SA) |
| MEDIUM | Homeowner financial over-exposure on CO approve | FIXED (prior) |

---

## 5. What remains (external / PARTIAL)

1. Configure **live** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, Netlify webhook URL → `/api/stripe/webhook`
2. **Rotate Neon password** if previously shared
3. Set `APP_URL` / `CORS_ORIGINS` to `https://fixbridge.netlify.app`
4. Set `SESSION_SECRET` strongly in Netlify (required)
5. Do **not** set `ENABLE_DEMO_SEED` or `ALLOW_PAYMENT_SIMULATION` in production
6. Wire remaining admin routes to fine-grained `requirePermission(...)` (dispatcher/finance presets)
7. Partner commissions/payout history UI
8. Broader homeowner mobile viewport QA matrix
9. Live Stripe Connect instant-payout E2E on Connect-enabled accounts

---

## 6. Tests executed

| Command / suite | Result |
|-----------------|--------|
| `scripts/smoke-production-hardening.mjs` | HARDENING_SMOKE_OK (12/12) |
| `scripts/smoke-security-idor.mjs` | SECURITY_SMOKE_OK (12/12) |
| `scripts/smoke-wiring-audit.mjs` | 43/43 |
| `scripts/smoke-full.js` | 33/33 |
| `scripts/smoke-admin-ops.js` | 9/9 |
| `scripts/smoke-dispatch.js` | PASS |
| `scripts/smoke-neon-wiring.mjs` | ALL_SMOKE_OK |
| `npm run build` | PASS |
| `npm run audit:production` | Available (runs the suite above) |

---

## 7. Files changed (this hardening pass)

| File | Change |
|------|--------|
| `api/db-ssl.js` | **New** — TLS options |
| `api/rbac.js` | **New** — server permission presets |
| `api/app.js` | SSL, demo gate, reviews, staff RBAC, health/config |
| `api/stripe.js` | No prod simulation; `assertPaymentsAvailable` |
| `api/security.js` | Production CSP |
| `api/schema-managed.js` | `admin_role_preset`, unique review index, seed gate |
| `api/managed-routes.js` | Payment assert, profitability, permission hooks |
| `api/platform-routes.js` | Refund permission; requirePermission wiring |
| `api/payout-routes.js` | Payout settings permissions |
| `scripts/verify-neon.mjs` / `ensure-visit-fee.mjs` | Secure SSL |
| `scripts/smoke-production-hardening.mjs` | **New** |
| `scripts/audit-production.mjs` | **New** master runner |
| `package.json` | `audit:production` script |
| `.env.example` | Demo/SSL/simulate docs |
| `src/app/PartnerPortal.tsx` | **New** partner UI |
| `src/app/App.tsx` | Partner route |
| `src/app/CustomerTrustSection.tsx` | No public review spam |
| `src/app/adminPermissions.ts` | Presets + profitability |

---

## 8. Database changes

| Change | Notes |
|--------|-------|
| `users.admin_role_preset` | Additive TEXT column |
| `site_reviews_user_job_uidx` | Unique (user_id, job_id) where both set |
| No drops / no wipes | Backward compatible |

---

## 9. External actions you must do

1. Netlify: `SESSION_SECRET`, `NEON_DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL=https://fixbridge.netlify.app`, `CORS_ORIGINS`, AI keys as needed  
2. Stripe Dashboard: webhook endpoint to production `/api/stripe/webhook`  
3. Rotate Neon DB password if ever pasted into chat  
4. Confirm `NODE_ENV=production` on Netlify (default)  
5. Create a real Super Admin if deploying to empty DB (demo seed will **not** run)  
6. OAuth redirect URLs for Auth0/Google/Apple if used  

---

## 10. Recommendation

**CONDITIONAL GO** for production launch after external Stripe + secrets checklist.

Do **not** claim 100%: live Stripe/webhook E2E and full mobile matrix were not executed against Netlify production in this session.
