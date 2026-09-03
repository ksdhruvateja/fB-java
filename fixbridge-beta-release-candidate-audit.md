# FIXBRIDGE BETA RELEASE CANDIDATE

Git commit:
`44e6e36e` — `feat: complete FixBridge operations, messaging, dispatch and quote workflows`

Working tree:
RC gap-close on top of that commit (not yet committed / not yet on Netlify).

Build:
PASS

RBAC:
PASS (10/10)

IDOR:
PASS

P0:
PASS (20/20)

P1:
PASS (14/14)

---

## Phase 1 — current-state audit (before this pass)

| Area | Status |
|------|--------|
| Notification deep links | PARTIAL — resolver existed; dashboards did not fully consume structured targets |
| Admin quote alternatives UX | PARTIAL — backend + homeowner panel; admin builder incomplete |
| Attachment storage architecture | PARTIAL — Neon/base64 worked; abstraction/limits incomplete |
| Netlify production configuration | BLOCKED_EXTERNAL_CONFIG — UI env cannot be read from this repo |
| Neon production configuration | BLOCKED_EXTERNAL_CONFIG until live `/api/health` (now verified neon) |
| Stripe production/test configuration | BLOCKED_EXTERNAL_CONFIG until live health (now `stripeConfigured: true`) |
| Email sender configuration | BLOCKED_EXTERNAL_CONFIG until live health (now Gmail configured) |
| Google OAuth configuration | BLOCKED_EXTERNAL_CONFIG — public config exists; value is not a valid GIS client ID |
| USPS configuration | BLOCKED_EXTERNAL_CONFIG — deployed `uspsConfigured: false` |
| APP_URL / frontend route configuration | BLOCKED_EXTERNAL_CONFIG — `/api/admin/production-config` is 401 without admin session |

---

## What this pass closed

1. **Notification deep links** — producers write `entity_type` / `entity_id` / `action_url` / `metadata`. Homeowner, contractor, and admin dashboards route from that metadata. Opening a notification marks that item read; opening the dropdown does not. Missing targets show `This item is no longer available.` Server RBAC/IDOR is unchanged (URLs are not trusted).
2. **Admin Option A/B builder** — add / duplicate / remove draft, customer titles, per-option contractor amount, comparison table, customer preview (no contractor/margin), grouped send. Revision isolation: Option A v2 does not supersede Option B (`supersedeSiblingQuotes` matches option letter). Smoke: Option B remained `sent` after Option A revision resend.
3. **Attachment storage** — `ATTACHMENT_STORAGE_PROVIDER=database` (object not implemented; misconfig cannot drop files). Limits default `MAX_ATTACHMENT_SIZE_MB=2.5` (cap 10) and `MAX_ATTACHMENTS_PER_MESSAGE=5`. Auth-gated download. Diagnostic: `npm run attachment:stats` (counts/bytes only).

---

## HOMEOWNER

Signup/Login:
PASS (password; local smokes)

Google OAuth:
BLOCKED (deployed `GOOGLE_CLIENT_ID` is not a valid GIS web client ID; live Google signup/login not proven)

USPS:
FAIL (deployed `uspsConfigured: false`; local smoke skipped OAuth)

AI Assessment:
PASS (local async/ack path)

AI Acknowledgment:
PASS (7/7; `AI_ASSESSMENT_ACK_REQUIRED` enforced)

Professional Request:
PASS (local request + admin job create)

Tracking:
PASS (local timeline; dispatch assign skipped when contractor is not dispatch-eligible)

Who to Expect:
PASS (wired to tracking/job focus; not re-proven on Netlify browser)

Quotes:
PASS (local send/revise)

Quote Alternatives:
PASS (local grouped send + select-one model; Option A revision did not supersede Option B)

Invoice:
PASS (local P0/P1 settlement path)

Payment:
PASS (local `smoke:stripe-e2e` 14/14, Stripe test mode) — deployed checkout **not** driven in this pass

Messages:
PASS (21/21 in-app; IDOR blocked)

Notifications:
PASS (unread count, per-item mark-read)

Deep Links:
PASS (structured metadata + dashboard handlers; stale state)

Completion:
PASS (local complete + homeowner completion panel)

Dispute:
PASS (local report-problem, admin workspace, payout state)

---

## CONTRACTOR

Login:
PASS

Team:
PASS (create employee; peer isolation skipped — no second contractor login)

Availability:
PASS

Job Accept:
PASS (invitation path exists; live assign skipped when not dispatch-eligible)

Technician Assignment:
PARTIAL (blocked when contractor is not dispatch-eligible)

Travel:
PASS (lifecycle start-travel/dispatch events)

Arrival:
PASS

Start Job:
PASS

Complete Job:
PASS

Messages:
PASS

Payout:
PASS (ledger, duplicate key, dispute hold in P0; live Connect transfer not re-run on Netlify)

---

## ADMIN

Overview:
PASS

Exceptions:
PASS (attention/work-queue)

Universal Search:
PASS

Dispatch:
PARTIAL (create/start/complete/timeline PASS; assign/tech blocked on ineligible demo contractor)

Contractor Team:
PASS

Quote Builder:
PASS

Option A/B Builder:
PASS

Invoice:
PASS (local)

Payments:
PASS (local Stripe e2e)

Payouts:
PASS (P0 dual-payout eliminated, hold, unique job index)

Messaging:
PASS

Disputes:
PASS

---

## COMMUNICATION

support@fixbridge.us sender:
PARTIAL — deployed health reports `FixBridge <support@fixbridge.us>` (Reply-To `support@fixbridge.us`). Desired display name is `FixBridge Support`. Local default header is correct when `FIXBRIDGE_FROM_NAME` is unset.

Branded email:
PASS (templates, logo HTTPS, no localhost in production logo helper; local send simulated because Gmail is not in local `.env`)

In-app communication:
PASS (21/21)

Unread badges:
PASS

Notification deep links:
PASS

---

## ATTACHMENTS

Current storage:
DATABASE

Security:
PASS (conversation-gated download; anonymous/IDOR blocked in smoke)

Scale risk:
LOW (current: 9 files, 630 bytes) for controlled beta; MEDIUM if photo volume grows on Neon

Object storage migration needed before:
PUBLIC SCALE

---

## STRIPE

Test Checkout:
PASS (local e2e)

Webhook:
PASS (local claim/processed path)

Invoice settlement:
PASS (shared settlement)

Connect:
PASS (code/smokes; live Netlify Connect onboard not re-run)

Standard payout:
PASS (ledger + idempotency key)

Duplicate protection:
PASS (`fixbridge-payout-` idempotency + unique job index)

Dispute payout hold:
PASS

---

## MOBILE

iPhone:
NOT TESTED (no device in this pass)

Android:
NOT TESTED

Homeowner option cards are stacked (`grid-cols-1`) to avoid overflow at 320–430.

---

## PRODUCTION ENVIRONMENT

Netlify:
PASS (`https://fixbridge.netlify.app/api/health` → `env: production`, service up)

Neon:
PASS (`database: neon`)

Stripe:
PASS (`stripeConfigured: true`; test vs live key not printed)

Email:
PASS (Gmail configured; from/reply-to domain `support@fixbridge.us`)

USPS:
FAIL (`uspsConfigured: false`)

OAuth:
BLOCKED — public `/api/auth/google/config` was returning a **client-secret-shaped** value (prefix `GOCSPX-`), not a GIS client ID. Treat that Netlify env var as compromised: **rotate the Google client secret**, put the **web client ID** in `GOOGLE_CLIENT_ID` only, never the secret. This RC refuses to expose non-client-ID values.

`/api/admin/production-config` on Netlify: HTTP 401 (admin session required). Presence flags therefore not fully enumerated from this pass. Do not print secrets.

---

## Indexes / polling

Indexes added only where query patterns exist: `payments(job_id)`, `managed_jobs` homeowner/contractor/status/employee, `proposals(job_id)`, `disputes(job_id)`. Notifications, messages, conversations, payouts already indexed.

In-app polling: 15s while visible (2 endpoints) ≈ **13 rps / 100 users**, **133 rps / 1,000**, **1,300+ rps / 10,000**. Acceptable for controlled beta. Scale risk at public volume — do not replace for beta.

DB migrations: additive `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`. Not reset. Applied on API boot (`Managed schema ready`).

---

## Smoke results (local API + Neon, this pass)

| Script | Result |
|--------|--------|
| `npm run build` | PASS |
| `smoke:p0-remediation` | PASS 20/20 |
| `smoke:rbac` | PASS 10/10 |
| `smoke:idor` | PASS |
| `smoke:p1` | PASS 14/14 |
| `smoke:dispatch-quotes-team` | PASS (assign skipped: contractor not dispatch-eligible) |
| `smoke:ai-assessment-ack` | PASS 7/7 |
| `smoke:inapp-communications` | PASS 21/21 |
| `smoke:dispatch-lifecycle` | PASS 6/6 suites |
| `smoke:disputes` | PASS |
| `smoke:availability` | PASS |
| `smoke:quote-alternatives` | PASS (revision isolation) |
| `smoke:universal-search` | PASS |

Deployed Netlify was **not** used as the smoke API host. Localhost results are not claimed as Netlify UI PASS.

---

Critical Issues:
1 (Google client-secret-shaped value exposed on public config until this RC is deployed **and** the secret is rotated)

High Issues:
3 (USPS missing on Netlify; Google OAuth unusable until a real client ID is set; deployed browser/payment/mobile lifecycle not executed here)

Medium Issues:
3 (email display name; 10k-user polling; Neon attachments before public scale)

Low Issues:
2 (dispatch-eligible contractor fixture; physical device QA)

External Blockers:
- Rotate Google OAuth client secret; set a real GIS **client ID**
- Configure USPS Addresses API on Netlify if verified ZIP/pricing is required for beta
- Set `FIXBRIDGE_FROM_NAME=FixBridge Support` if the From header must match the spec exactly
- Deploy this working tree; Netlify is still on the previous build until then

Production Readiness:
78%

Recommendation:
CONDITIONAL BETA GO

Controlled beta with **password** homeowners and contractors is reasonable after this RC is deployed, the Google secret is rotated, and one Stripe **test** checkout is confirmed on Netlify (webhook → paid invoice). Do not open Google signup, do not promise USPS-corrected addresses, and do not scale attachments or polling to public volume yet.

Not **BETA GO**: deployed Google config currently leaks a secret-shaped env value, USPS is off, and the live Netlify click-path (mobile + checkout) was not run in this pass.

Not **NO-GO**: auth, RBAC, IDOR, quote accept, invoice settlement, webhook claim, payout integrity, duplicate payout protection, AI ack gate, dispute payout hold, and cross-user messaging isolation all passed on the current codebase.
