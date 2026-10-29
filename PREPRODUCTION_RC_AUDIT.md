# Pre-Production Release Candidate Audit — FixBridge

**Date:** 2026-08-26 (updated)  
**Baseline:** P0 verified @ **78%** · P1 partial @ **84%**  
**After RC closure:** **89%**  
**After P1 closure pass:** **~91%** — see `P1_PRODUCTION_VERIFICATION.md` for blocker table

---

## Automated regression

| Suite | Result |
|-------|--------|
| `npm run smoke:rc` @ `API_BASE=http://127.0.0.1:3001` | **8/8 PASS** |
| `npm run smoke:p1` | **14/14 PASS** |
| `npm run smoke:stripe-e2e` | **15/15 PASS** |
| `npm run smoke:coupon` | **PASS** (atomic max-uses=1) |
| `npm run smoke:change-order` | **PASS** (submit → price → approve + lock) |

---

## Stripe Provider Verification

| Test | Result | Notes |
|------|--------|-------|
| Browser Checkout ($500 + $50) | **NOT RUN** | API checkout + settlement verified; full Playwright/browser card entry not executed this pass |
| Signed Webhook | **PASS** | `stripe.webhooks.generateTestHeaderString` against `/api/stripe/webhook` after API restart |
| Webhook replay dedupe | **PASS** | Single settlement/tip/payout rows on replay |
| Failure card (browser) | **NOT RUN** | Cancel/unpaid poll path verified at API level |
| Delayed webhook UX | **PASS** | `?invoicePaid=` → confirming; polls `/payment-status` |
| Stripe Connect onboarding | **NOT RUN** | Requires live Connect test account onboarding in dashboard |
| Real Connect transfer | **NOT RUN** | Payout dedupe/mutex verified with `ALLOW_SIMULATED_PAYOUTS` |
| Duplicate transfer (10×) | **PASS** | P0 module + mutex tests green |
| Stripe CLI forward | **N/A** | CLI not installed on host; programmatic signing used instead |

---

## Finance

| Area | Result |
|------|--------|
| Invoice settlement ($550) | **PASS** |
| Tips separate ($50) | **PASS** |
| Standard vs instant mutex | **PASS** |
| Coupon concurrency | **PASS** (`FOR UPDATE` claim) |
| $0 checkout path | **IMPLEMENTED** — live coupon 100% test not in RC suite yet |
| Change orders | **PASS** lifecycle + immutable `approved_snapshot` |
| Final invoice + CO | **IMPLEMENTED** — convert-invoice merges approved change orders |
| Refunds | **P0 PASS** (unchanged) |

---

## Security

| Area | Result |
|------|--------|
| IDOR | **P0 PASS** (unchanged) |
| Admin MFA | **PASS** |
| Admin RBAC | **PARTIAL** — matrix in `ADMIN_PERMISSION_MATRIX.md`; not every role × endpoint live-tested |
| Webhook signature | **PASS** when Stripe configured |
| Secrets in repo | **PASS** (`.env` gitignored) |

---

## Product Wiring

| Surface | Status |
|---------|--------|
| Homeowner invoice/tip/checkout UX | **PASS** |
| Contractor change orders | **PASS** (`ContractorJobsPanel`) |
| Admin change orders | **PASS** (`AdminJobDrawer`) |
| Admin work queue | **PASS** — backend `/api/admin/work-queue`; fake **Mine** filter removed |
| Quote workspace authority | **PASS** (documented) |
| Notifications | **PARTIAL** — durable `notifications` table + inserts on key events; not full event matrix verified |
| Messaging | **Option B** — `JobChatPanel` exists but is **not mounted**; admin “Message contractor” placeholder removed. Chat hidden for P1. |

---

## Mobile / Accessibility / Performance

| Area | Result |
|------|--------|
| Homeowner responsive (320–768) | **NOT RUN** this pass |
| Admin tablet (768–1024) | **NOT RUN** this pass |
| Accessibility pass | **NOT RUN** |
| Performance audit | **NOT RUN** |

---

## Placeholder cleanup

| Item | Status |
|------|--------|
| Hardcoded 4.8 ratings | **REMOVED** from contractor dashboard + marketing (`ContractorPage`, `HomeownerLogin`) |
| Admin messaging placeholder | **REMOVED** |
| SMS without Twilio | **BLOCKED** (P1) |

---

## Remaining intentional unfinished (post-P1)

- Live browser Stripe test card + failure card flows
- Stripe Connect real contractor onboarding + transfer
- Instant payout fee E2E against real Connect capabilities
- Full RBAC mutation test matrix per role
- Mobile QA matrix
- Job chat (deferred — hidden for P1)
- Contractor compliance doc expiry enforcement (P2)

---

## Readiness scoring

| Phase | Score |
|-------|-------|
| Before P0 | 48% |
| P0 verified | 78% |
| P1 partial (prior) | 84% |
| **After this RC pass** | **89%** |

Cannot claim 100% without production traffic, real Connect volume, chargebacks, and full mobile/accessibility sign-off.

---

## Final Decision

**P1 NOT VERIFIED — BLOCKERS REMAIN**

Remaining blockers before pre-production staging sign-off:

1. **Real browser** Stripe checkout + failure card (not API-only)
2. **Stripe Connect** test contractor onboarding + live transfer (no simulated payouts)
3. **Mobile QA** at required breakpoints
4. **RBAC** live mutation tests for read-only / operations / finance roles
5. **$0 checkout** live test with 100% coupon in RC suite

After these pass, run a **production launch audit** (monitoring, backups, production Stripe keys, domain/email/SMS, legal, rollback).
