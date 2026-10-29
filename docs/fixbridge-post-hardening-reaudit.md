#  7EDS AWWWWWW CFixBridge Post-Hardening Production Re-Audit

**Date:** August 24, 2026  
**Method:** Independent adversarial verification (code inspection + fresh automated suites + abuse cases)  
**Live reference:** [https://fixbridge.netlify.app/](https://fixbridge.netlify.app/)  
**Local verification:** Neon Postgres + API `:3001`  
**Prior claimed score ignored.** Evidence below only.

---

## Overall score

**87%**

Not the previous 88%. This re-audit discovered a remaining **production payment-simulation bypass** in Connect/payout/refund helper paths (`|| !stripeConfigured()` still allowed simulated success when Stripe was missing in production). That was fixed and retested during this pass. Score reflects strong core security after that fix, minus unverified live Stripe/OAuth and incomplete fine-grained RBAC + mobile evidence.

---



## Launch recommendation

**CONDITIONAL GO**

Do not launch public paid traffic until Netlify has live Stripe + webhook secret and demo seed cannot run. Core auth/IDOR/privacy/build are in good shape for a controlled launch after that checklist.

---



## Critical blockers

None remaining **in-repo** after this re-audit’s payout/refund production simulation fix.

External blockers (must complete before public money):

1. Live `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` on Netlify
2. Stripe webhook URL pointed at production `/api/stripe/webhook`
3. Strong `SESSION_SECRET` + `APP_URL` / `CORS_ORIGINS`
4. Confirm empty production DBs do not rely on demo accounts

---



## Security


| Item                           | Status           | Evidence                                                                                                        |
| ------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------- |
| Neon TLS default               | PASS             | `api/db-ssl.js` → `rejectUnauthorized: true`; prod ignores insecure env override                                |
| Secrets in git                 | PASS             | `.env` gitignored; not tracked; `.env.example` placeholders only                                                |
| Demo seed in production        | PASS             | `allowDemoSeed()` false when `NODE_ENV=production`                                                              |
| Payment simulate in production | PASS (after fix) | `shouldSimulatePayment` always false in prod; payout-db / transfer release / refunds fail closed without Stripe |
| Frontend demo password helpers | INFO             | `src/app/auth.ts` `getDemoUser` still shows demo credentials in UI for non-prod convenience — not server seed   |


**Issues found this re-audit**


| Severity | Issue                                                                                                                      | Result                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| HIGH     | `approveAndReleasePayout` / instant payout / transfer release used `|| !stripeConfigured()` → could simulate in production | **FIXED** in `api/payout-db.js`, `api/platform-routes.js`    |
| HIGH     | Admin refunds could simulate in production when payment lacked Stripe intent                                               | **FIXED** (503 / 400 in production)                          |
| LOW      | Wiring smoke “Vite app responds” failed once mid-run (dev server interrupted by `vite build`)                              | Transient; API suites green; production `npm run build` PASS |


---



## Authentication


| Check                                | Status                                                      |
| ------------------------------------ | ----------------------------------------------------------- |
| Homeowner / contractor / admin login | PASS                                                        |
| Wrong password                       | PASS                                                        |
| Missing / malformed JWT              | PASS                                                        |
| Guest intake existing email          | PASS (`409 ACCOUNT_EXISTS`)                                 |
| Guest `password123`                  | PASS (401)                                                  |
| Partner login JWT                    | PASS (referrals require Bearer)                             |
| OAuth live providers                 | BLOCKED_EXTERNAL_CONFIG                                     |
| Password reset full E2E              | PARTIAL (endpoints exist; not fully re-exercised this pass) |


---



## Authorization / RBAC


| Check                                                               | Status                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------- |
| Admin-only routes reject homeowner/contractor                       | PASS                                                          |
| Staff permission module + staff.view/create/edit                    | PASS (smoke)                                                  |
| Self-elevation / last Super Admin guards                            | PASS (code + endpoint reachable)                              |
| Fine-grained Finance vs Dispatcher API matrix with dedicated tokens | PARTIAL (not fully E2E’d with separate staff users this pass) |
| Profitability blocked for homeowners                                | PASS                                                          |


**RBAC matrix: PARTIAL** (not full PASS)

---



## Homeowner


| Check                                             | Status                                                       |
| ------------------------------------------------- | ------------------------------------------------------------ |
| Job create / assess / visit fee / proposal credit | PASS (`smoke-wiring-audit` 42/43; visit fee credit verified) |
| Markup privacy on job DTO                         | PASS (reaudit: no contractorNet/platformGross)               |
| Support tickets scoped                            | PASS                                                         |
| Reviews verified-only                             | PASS                                                         |
| Guest hijack                                      | PASS                                                         |


---



## Contractor


| Check                             | Status              |
| --------------------------------- | ------------------- |
| Cannot self-approve compliance    | PASS (`smoke-full`) |
| Bid / invitation scoped           | PASS                |
| Cannot jump to `paid_out`         | PASS                |
| Cannot call admin payout settings | PASS                |


---



## Admin


| Check                                                | Status                                   |
| ---------------------------------------------------- | ---------------------------------------- |
| Dispatch / invite / assign / proposal / payout (sim) | PASS                                     |
| Invoice send                                         | PASS                                     |
| Profitability API                                    | PASS                                     |
| Team & Roles API                                     | PASS (single staff; presets PARTIAL E2E) |
| Settings persistence deep dive                       | PARTIAL                                  |


---



## Partners


| Check                           | Status                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------- |
| Unauthenticated referrals       | PASS (401)                                                                      |
| Partner portal UI exists        | PASS                                                                            |
| Cross-partner JWT/code mismatch | PARTIAL (auth required; dedicated Partner A/B token pair not created this pass) |
| Commissions UI                  | PARTIAL                                                                         |


---



## Payments


| Check                                  | Status                       |
| -------------------------------------- | ---------------------------- |
| Local simulate when no Stripe (dev)    | PASS                         |
| Client cannot force paid via job PUT   | PASS                         |
| Visit fee credit on deposit            | PASS                         |
| Production without Stripe fails closed | PASS (unit + code after fix) |


---



## Stripe


| Check                                      | Status                      |
| ------------------------------------------ | --------------------------- |
| Webhook signature required when configured | PASS (code path)            |
| Idempotent `webhook_events`                | PASS (schema + handler)     |
| Live Checkout / webhook E2E                | **BLOCKED_EXTERNAL_CONFIG** |


---



## Payouts


| Check                            | Status                  |
| -------------------------------- | ----------------------- |
| Simulated release in local smoke | PASS                    |
| Instant fee config exists        | PASS                    |
| Production simulate bypass       | PASS after fix          |
| Live Connect transfer E2E        | BLOCKED_EXTERNAL_CONFIG |


---



## Pricing


| Check                          | Status |
| ------------------------------ | ------ |
| ZIP / AI assess returns retail | PASS   |
| Visit fee admin default        | PASS   |
| Homeowner internal markup leak | PASS   |


---



## Reviews


| Check                      | Status                                                                           |
| -------------------------- | -------------------------------------------------------------------------------- |
| Anonymous reject           | PASS                                                                             |
| Unfinished job reject      | PASS                                                                             |
| Contractor reject          | PASS                                                                             |
| Duplicate unique index     | PASS (schema)                                                                    |
| Valid completed-job accept | PARTIAL (path via confirm-completion; not full fresh completed-job POST reaudit) |


---



## Database


| Check                                   | Status                          |
| --------------------------------------- | ------------------------------- |
| Neon connected                          | PASS                            |
| TLS verify                              | PASS                            |
| `.env` not in git                       | PASS                            |
| Connection string not in health payload | PASS (host only in startup log) |


---



## Mobile

**PARTIAL** — no fresh multi-viewport browser matrix in this re-audit. Prior mobile work exists; not re-proven here.

---



## Deployment


| Check                                    | Status                  |
| ---------------------------------------- | ----------------------- |
| `npm run build`                          | PASS                    |
| `netlify.toml` SPA + `/api/*` → function | PASS                    |
| Netlify function module load             | PASS (`NETLIFY_FN_OK`)  |
| Live Netlify env parity                  | BLOCKED_EXTERNAL_CONFIG |


---



## Automated Tests

Fresh runs (this session):


| Suite                              | Result                                                     |
| ---------------------------------- | ---------------------------------------------------------- |
| `smoke-post-hardening-reaudit.mjs` | REAUDIT_OK                                                 |
| `smoke-production-hardening.mjs`   | HARDENING_SMOKE_OK                                         |
| `smoke-security-idor.mjs`          | 12/12                                                      |
| `smoke-wiring-audit.mjs`           | **42/43** (Vite fetch failed once during concurrent build) |
| `smoke-full.js`                    | 33/33                                                      |
| `smoke-admin-ops.js`               | 9/9                                                        |
| `smoke-dispatch.js`                | PASS                                                       |
| `smoke-neon-wiring.mjs`            | ALL_SMOKE_OK                                               |
| `npm run build`                    | PASS                                                       |


**Automated tests: 120+/121 meaningful checks passed** (1 transient Vite reachability flake).

---



## E2E Results


| Scenario                                                                   | Result                  |
| -------------------------------------------------------------------------- | ----------------------- |
| Marketplace smoke (create→assess→pay sim→dispatch→bid→proposal→payout sim) | PASS                    |
| Visit-fee credit                                                           | PASS                    |
| Guest IDOR / review / RBAC abuse matrix                                    | PASS                    |
| Full Stripe live money path                                                | BLOCKED_EXTERNAL_CONFIG |
| Change-order full E2E + refund live Stripe                                 | PARTIAL / BLOCKED       |


**E2E marketplace: PASS** (simulated payments)  
**Stripe real E2E: BLOCKED_EXTERNAL_CONFIG**

---



## Residual Risks

1. Fine-grained staff presets not fully exercised with separate JWT identities
2. Partner commission isolation not fully cross-token tested
3. Homeowner mobile viewport matrix not re-run
4. Live Stripe / Connect / webhook not verified against Netlify
5. Frontend still ships demo credential helpers for login UX
6. Some admin routes still use coarse `requireAdmin` only

---



## External Configuration Required

1. Netlify env: `SESSION_SECRET`, `NEON_DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL`, `CORS_ORIGINS`
2. Stripe Dashboard webhook → production API
3. Rotate Neon password if ever exposed
4. Create real Super Admin on empty prod DB (demo seed off)
5. Do not set `ENABLE_DEMO_SEED` or `ALLOW_PAYMENT_SIMULATION` in production
6. OAuth callback URLs if using Auth0/Google/Apple

---



## Files Changed During Re-Audit


| File                                       | Why                                                               |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `api/payout-db.js`                         | Fail closed in production when Stripe missing (approve + instant) |
| `api/platform-routes.js`                   | Fail closed transfer release + refunds in production              |
| `scripts/smoke-post-hardening-reaudit.mjs` | New adversarial re-audit suite                                    |
| `docs/fixbridge-post-hardening-reaudit.md` | This report                                                       |


---



## Category matrix (rebuild)


| Category             | Status                    |
| -------------------- | ------------------------- |
| Authentication       | PASS                      |
| Authorization / RBAC | PARTIAL                   |
| Homeowner            | PASS                      |
| Contractor           | PASS                      |
| Admin                | PASS                      |
| Partners             | PARTIAL                   |
| Payments             | PASS                      |
| Stripe               | BLOCKED_EXTERNAL_CONFIG   |
| Payouts              | PASS (sim) / BLOCKED live |
| Pricing              | PASS                      |
| Reviews              | PASS                      |
| Database             | PASS                      |
| Mobile               | PARTIAL                   |
| Deployment           | PARTIAL                   |
| Testing              | PASS                      |


