# FixBridge Feature Parity — Updated Snapshot

**Updated:** 2026-09-09 (local working tree; no git commit)  
**Stacks:** Legacy `src/`+`api/` vs New `frontend/`+`backend/`

## Overall

The new Angular + Spring Boot stack now covers the **majority of production domains** as working APIs + portal UIs. Legacy remains the behavioral specification and is **not deleted**. Pixel-perfect React visual parity and some deep Express edge routes remain **PARTIAL**.

| Domain | Status |
|--------|--------|
| Auth (email, Google, MFA, reset) | **DONE** (core) |
| Properties + documents + switcher isolation | **DONE** (core) |
| Service catalog + admin flags | **DONE** |
| Managed jobs lifecycle + hire/dispatch pay | **DONE** (core) |
| Fixa AI + DIY safety | **DONE** (core; theater UI lighter than React) |
| Quotes homeowner + admin builder/send | **DONE** (core; PDF document gen PARTIAL) |
| Change orders | **DONE** (core) |
| Stripe checkout/webhook/Connect + amount integrity | **DONE** (core) |
| Coupons + tips | **DONE** (core) |
| Payouts v2 approve/adjust | **DONE** (core) |
| Disputes + refunds + manual payments | **DONE** (core) |
| HomeCare plans/checkout/recurring + activation fee | **DONE** (core) |
| Compliance + dispatch gate | **DONE** (core) |
| Employees + availability | **DONE** (core) |
| Messaging + notifications | **DONE** (core) |
| Support tickets | **DONE** (core) |
| Referrals + partners | **DONE** (core) |
| Legal consent | **DONE** (core) |
| Admin work-queue, finance, directories, search, staff, audit | **DONE** (core) |
| HighLevel client abstraction | **DONE** (no-op without key) |
| Full React marketing/DIY motion theater | **PARTIAL** |
| Quote PDF / invoice email templates | **PARTIAL** / **MISSING** depth |
| Places Google Maps scan-zips | **MISSING** |
| Netlify scheduled reminder twin | **MISSING** (use Spring `@Scheduled` next) |
| Full smoke script suite retargeted | **PARTIAL** |
| Pixel-identical every React panel | **PARTIAL** |

## Acceptance checklist (honest)

- [x] Homeowner core parity (signup/login/Google/properties/jobs/AI/DIY/hire/pay)
- [x] Contractor core (invites, status, team, compliance, payouts list, Connect)
- [x] Admin core modules (queue, quotes, finance, disputes, tickets, services, settings)
- [x] Property isolation via switcher + ownership APIs
- [x] Fixa provider router (Explabs + OpenRouter fallback)
- [x] Stripe amount integrity snapshots
- [x] Payouts adjust/approve
- [x] Subscriptions + activation fee config
- [x] Compliance dispatch gate
- [x] Support tickets
- [x] Messaging + notifications
- [x] Google login + Admin MFA
- [x] Geoapify
- [x] Backend `mvn clean test` + `package`
- [x] Frontend `ng build`
- [ ] Full legacy smoke suite against Spring (not all scripts retargeted)
- [ ] Production DNS/OAuth client IDs configured on live domains
- [ ] Pixel-perfect React UI clone
- [ ] Cutover executed (documented only)
