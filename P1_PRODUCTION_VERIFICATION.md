# P1 Production Verification — FixBridge

**Date:** 2026-08-26 (final closure pass)  
**Baseline:** P0 verified @ **78%**  
**Prior P1 RC readiness:** **89%**  
**After this pass:** **~91%** (evidence-based; not a target)

---

## Regression suites (this pass)

| Suite | Result |
|-------|--------|
| `npm run smoke:rc` @ API **3001** | **8/8 PASS** |
| `npm run smoke:p1` | **14/14 PASS** |
| `npm run smoke:stripe-e2e` | **15/15 PASS** |
| `npm run smoke:coupon` | **PASS** |
| `npm run smoke:change-order` | **PASS** |
| `npm run smoke:zero-dollar` | **PASS** |
| `npm run smoke:rbac` | **10/10 PASS** |
| `npm run smoke:idor` | **PASS** |
| `npm run smoke:browser-stripe` | **FAIL** (Stripe Checkout UI timing; see below) |
| `npm run smoke:connect` | **BLOCKED** (Connect not enabled on Stripe test account) |
| `npm run smoke:mobile-qa` | **8/16 PASS** (overflow OK; dashboard render timing) |

**Note:** Run smokes with `API_BASE=http://127.0.0.1:3001` when multiple API instances are running.

---

## Final P1 Closure

| Blocker | Result | Evidence |
|---------|--------|----------|
| Browser Stripe success | **PARTIAL / NOT VERIFIED** | Headed probe completed real $550 Hosted Checkout → redirect to `localhost:5000/homeowner?invoicePaid=…`. Automated `smoke-browser-stripe.mjs` intermittently fails expanding Stripe card accordion (`#cardNumber` timeout). |
| Browser Stripe failure | **NOT VERIFIED** | Blocked on reliable success automation. Decline path (`4000…0002`) not completed in CI this pass. |
| Delayed webhook browser UX | **PARTIAL** | API poll path **PASS** (`smoke-stripe-e2e`). Browser shows `Confirming your payment…` via `invoicePaid` → sessionStorage → backend poll (code verified). Full browser timing test not stable. Localhost requires signed webhook replay when Stripe CLI forward unavailable. |
| Connect onboarding | **BLOCKED** | Stripe error: *"You can only create new accounts if you've signed up for Connect"* — enable at https://dashboard.stripe.com/connect |
| Connect transfer | **BLOCKED** | Depends on Connect onboarding |
| Connect duplicate payout | **PASS (API/logic)** | Mutex + 10× release covered in `smoke-stripe-e2e` / `payout-db` (simulated transfer when Connect unavailable) |
| $0 checkout | **PASS** | No Stripe session; single settlement + coupon redemption (`smoke-zero-dollar`) |
| RBAC runtime matrix | **PASS (core)** | Super Admin / Operations / Read Only via HTTP; privilege escalation blocked (`smoke-rbac`). Not every `/api/admin/*` mutation enumerated. |
| Homeowner mobile | **PARTIAL** | Viewport overflow **PASS** at 320–1024. Full workflow parity not manually exercised this pass. |
| Admin tablet | **PARTIAL** | 768/1024 overflow **PASS**; quote/invoice modals not manually exercised. |
| Accessibility | **NOT VERIFIED** | No automated axe pass this session |
| Performance | **NOT VERIFIED** | No API timing / N+1 / index audit this session |

---

## Verified this pass (non-blocker)

- **$500 + $50 tip checkout** via API + signed webhook settlement (`smoke-stripe-e2e`)
- **Zero-dollar checkout** fix: `invoice.total <= 0` path, single redemption (`smoke-zero-dollar`)
- **Coupon concurrency** atomic claim (`smoke-coupon-concurrency`)
- **Change order lifecycle** + financial lock (`smoke-change-order`)
- **RBAC** core mutations + self-elevation blocked (`smoke-rbac`)
- **Job invoice fields** exposed on managed jobs API (`invoiceId`, `invoiceStatus`, etc.)
- **Removed fake 4.9★ technician fallback** when no real rating
- **Instant payout UI** gated on `account.instantPayoutsEligible` (not faked when Connect inactive)

---

## Instant payout

```text
Instant payout: SUPPORTED (architecture) / DISABLED (this Stripe test account)

Reason: Connect not enabled; instant eligibility requires connected account with
transfers capability. UI shows instant option only when instantPayoutsEligible=true.
```

---

## Browser Stripe — what was actually verified

Manual headed probe (`scripts/_stripe-pay-probe.mjs`) on 2026-08-26:

1. Hosted Checkout opened for **$550** ($500 service + $50 tip line items visible)
2. Test card **4242…4242** entered on Stripe page (card accordion + phone/country)
3. Redirect to FixBridge success URL with `invoicePaid=<invoiceNumber>`
4. Settlement requires webhook — localhost does not receive Stripe webhooks without CLI forward; `smoke-browser-stripe` replays signed `checkout.session.completed` after Stripe reports `payment_status=paid`

---

## Environment blockers (must resolve for P1 sign-off)

1. **Enable Stripe Connect** on test platform account → re-run `npm run smoke:connect`
2. **Stabilize browser Stripe automation** (headed default, Stripe CLI webhook forward, or CI with reliable Checkout selectors)
3. **Complete decline-card browser test** after success path stable
4. **Mobile/tablet manual QA matrix** (items 16–27 in P1 checklist)
5. **Accessibility + performance audits** (items 28–35)

---

## npm scripts added

```bash
npm run smoke:browser-stripe   # Playwright + real Hosted Checkout
npm run smoke:zero-dollar
npm run smoke:rbac
npm run smoke:connect
npm run smoke:p1-final         # Aggregates all suites
```

Browser Stripe: defaults to **headed** Chromium; set `SMOKE_HEADLESS=1` for headless (often fails on Stripe accordion).

---

## Readiness score

| Phase | Score |
|-------|-------|
| After P0 | 78% |
| After initial P1 | 84% |
| After RC closure | 89% |
| **After this pass** | **~91%** |

Score increased only for **runtime-verified** items ($0 checkout, RBAC, RC 8/8). Browser Connect and full mobile/a11y/perf remain open.

---

## Final Decision

**P1 NOT VERIFIED — BLOCKERS REMAIN**

Production launch audit (**Phase I**) was **not started** — prerequisite P1 sign-off not met.

### Required before P1 verified

- Real browser Stripe success + failure + delayed webhook (stable automated or signed manual runbook)
- Stripe Connect onboarding + real transfer + duplicate stress on Connect (not simulated)
- Mobile/tablet QA sign-off
- Accessibility critical fixes
- Performance baseline

### Required before production candidate

- All of the above, plus Phase I deployment/ops audit (env, webhooks, backups, monitoring, rollback)

---

**NOT READY FOR PRODUCTION — LAUNCH BLOCKERS REMAIN**
