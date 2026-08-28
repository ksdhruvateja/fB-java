# FixBridge Payment → Payout Flow Audit

**Date:** 2026-08-27  
**Scope:** Homeowner payments, admin payouts, contractor earnings, Stripe Connect, RBAC/IDOR, financial controls  
**Method:** Code inspection + live API/DB tests (not UI-only)

---

## Executive determination

```text
CURRENT PAYMENT/PAYOUT ARCHITECTURE: PARTIALLY CORRECT
```

**Correct core model:** Homeowner pays **FixBridge platform** via Stripe Checkout → server settlement → `contractor_payouts` ledger → admin release → `stripe.transfers.create` to Connect account.

**Gaps found (pre-fix):** client amount override on `payout-v2`, contractor API margin leak, change orders excluded from payout math, RBAC inconsistency on release routes, partial admin economics UI, Stripe processing fees not captured, standard transfer-only payouts stuck in `processing`, instant vs standard path conflict.

**Fixes applied in this audit:** see [Remediation](#remediation-applied).

---

## 1. Homeowner payment destination

| Check | Result |
|-------|--------|
| Pays FixBridge platform account | **YES** — `createCheckoutSession` in `api/stripe.js` has no `transfer_data` / destination charge |
| Server-side creation | **YES** — `POST /api/managed/jobs/:id/pay-dispatch`, `pay-retail`, `POST /api/homeowner/invoices/:id/checkout` |
| Success confirmed server-side | **YES** — Stripe webhook `checkout.session.completed` → `processSuccessfulPayment` (`api/payment-settlement.js`) |
| Homeowner cannot set `paid=true` | **YES** — no homeowner endpoint accepts paid flag; serializers gate proposal economics |
| Contractor not merchant of record | **YES** — Connect transfer is separate admin step |

**Architecture:** `platform charge + later contractor transfer` (separate charges and transfers).

---

## 2. Admin → Payouts financial control center

**Exists:** `AdminContractorPayoutsPanel.tsx`, `GET /api/admin/payouts`, `GET /api/admin/payouts/:id`

| Field | Status |
|-------|--------|
| Job / contract ID | **YES** — `jobRef`, `jobId` |
| Homeowner | **PARTIAL** — `customerLabel` only in list |
| Contractor | **YES** — name/email in list |
| Homeowner amount charged/paid | **PARTIAL** — added `economics.customerPaidCents` on detail API; list UI still shows contractor gross mislabeled historically |
| Contractor agreed amount | **YES** — `grossAmountCents` / `serviceContractorNetCents` |
| Contractor payable now | **YES** — `netAmountCents` |
| FixBridge gross margin | **YES** — `platformFeeCents` |
| Processing fees | **NOT AVAILABLE** — `PROCESSING_FEES_NOT_CURRENTLY_CAPTURED` |
| Visit-fee credit | **Indirect** — reduces homeowner checkout, not contractor payout |
| Refund adjustments | **PARTIAL** — hold/reversal flags, no amount recalculation |
| Reserve/hold | **YES** — `reserve_amount_cents` at release |
| FixBridge net | **NOT AVAILABLE** — no fee subtraction in API |
| Payout status | **YES** |
| Connect readiness | **PARTIAL** — `stripeAccountId` on list, not readiness pill |
| Standard/instant | **YES** — `payoutMethod` |
| Stripe transfer ID | **YES** — `stripeTransferId` |

---

## 3. Contractor agreed vs payable now

| Concept | DB / API field |
|---------|----------------|
| Contractor agreed (service + tip) | `gross_amount_cents` |
| Admin adjustment | `adjustments_cents` |
| Payable now | `net_amount_cents` (before release; reduced by instant fee if instant) |
| Already paid | inferred from `stripe_transfer_id` / status `processing`/`paid` |

**Server calculates** via `financial-calculations.js` → `ensurePayoutRecordForJob`. Browser does not author amounts.

**Partial payouts:** **NO** — `UNIQUE(job_id)` on `contractor_payouts`. Reserve holdback is the only split.

---

## 4. FixBridge margin

```text
platform_fee_cents = service_retail_cents - service_contractor_net_cents
```

Tips excluded from margin base (100% to contractor). Change orders now included in both retail and contractor net sums.

---

## 5. Homeowner privacy

**PASS** — `serializeProposal`, `serializeJob` redact `contractorNet`, `platformGross` for homeowners. Verified via `smoke:payout-flow`.

---

## 6. Contractor visibility

**PASS (after fix)** — `serializePayoutForContractor` strips `platformFeeCents`, `reserveAmountCents`. Shows earnings, adjustments, net, instant fee, status.

---

## 7. Payout amount server-authoritative

**PASS (after fix)** — `rejectClientMoneyFields()` blocks `amount`, `payoutAmount`, `contractorNet`, `netAmountCents`, `instantFee`, etc. on approve/release/instant routes. Removed `payout-v2` amount override.

---

## 8. Admin cannot overpay arbitrarily

**PASS (after fix)** — release uses DB `net_amount_cents` only. Adjustments via audited `/adjust` endpoint with required reason.

---

## 9. Payout eligibility (`validatePayoutEligibility`)

- Job + contractor assigned
- Homeowner payment succeeded (`payments` retail/invoice)
- No refunded/disputed/failed payment
- Stripe Connect ready (non-sim)
- Status in pending/approved set
- No existing `stripe_transfer_id`
- Not on hold / reversal required
- `net_amount_cents > 0`

---

## 10. Payout lifecycle

Statuses: `pending_job_completion` → `pending_approval` → `approved` → `processing` → (`paid` | `failed` | `reversed`)

**Gap:** Standard transfer path often stops at `processing` (no webhook to `paid` for transfer-only). Failed transfer does not always set `failed` on payout row.

---

## 11. Standard payout

```text
approveAndReleasePayout → createTransfer → contractor connected account
```

**PASS** architecturally. **BLOCKED** in test env until Connect onboarding complete (`acct_1U97dGEP9cZfuB1u` TOS past due).

Duplicate protection: **PASS** in `smoke:connect` when transfer runs; idempotent `alreadyPaid` + `FOR UPDATE`.

---

## 12. Instant payout

`requestInstantPayout` → `createConnectPayout(method:'instant')`. Fee server-calculated from `payout_settings`.

**Conflict:** Admin standard approve creates transfer immediately; instant path requires no prior transfer. Mutually exclusive by design (`INSTANT_PAYOUT_SELECTED` / `TRANSFER_ALREADY_EXISTS`).

**BLOCKED_STRIPE_ELIGIBILITY** for real contractor account.

---

## 13–14. Admin controls & detail

- Approve: `POST /api/admin/payouts/:id/approve`
- Adjust: `POST /api/admin/payouts/:id/adjust` (reason required when non-zero)
- Release via job: `POST /api/admin/managed/jobs/:id/payout-v2`
- Hold: via payment risk (`holdPayoutsForJob`)
- Detail includes `auditLogs` + `economics` (customer paid, invoice balance)

---

## 15–18. Partial payouts, refunds, visit fee, change orders

| Topic | Result |
|-------|--------|
| Partial payouts | **NO** — duplicate full payout prevented by unique job + transfer idempotency |
| Refunds pre-payout | **HOLD** — `on_hold` |
| Refunds post-payout | **FLAG** — `reversal_required`; no Stripe reversal execution |
| Visit fee | Credit reduces homeowner due only; contractor payout unchanged |
| Change orders | **FIXED** — approved CO amounts now roll into payout calculation |

---

## 19–20. Processing fees

`PROCESSING_FEES_NOT_CURRENTLY_CAPTURED` — no Balance Transaction fee ingestion. Do not use estimated 2.9%+30¢ as authoritative.

---

## 21. Payout settings

`payout_settings` table + `PUT /api/admin/payout-settings`. Instant fee %/fixed/min/max enforced in `calculateInstantPayoutFee` / `requestInstantPayout`.

---

## 22–23. RBAC & IDOR

| Check | Result |
|-------|--------|
| `payouts.approve` on release routes | **FIXED** — added to approve/adjust/payout-v2 |
| Homeowner release | **403** |
| Contractor cross-job payout | **403** — ownership checks |
| IDOR smoke | **PASS** — `smoke:idor` (payout-specific IDOR in `p0-final-e2e`) |

---

## 24–25. Failed transfer & auditability

Failed Stripe transfer: payout may remain `processing` without `failed` status — **PARTIAL**.

Audit: `payout_audit_logs` + `writeAudit` on release; adjustment reason stored in metadata.

---

## 26. Stripe metadata

Transfers include `payoutId`, `jobId` in metadata. Checkout sessions include `jobId`, `invoiceId`, `paymentType`.

---

## 27–28. Deterministic test case

```text
Proposal: retail $1,000 / contractor $700
Change order: retail +$300 / contractor +$200
Customer paid: $1,300

Expected:
  service_contractor_net = $900 (90000 cents)  ✓
  platform_fee = $400 (40000 cents)            ✓
```

Verified in `smoke:payout-flow`.

---

## Admin-controlled contractor pay (mandatory rules)

| Rule | Pre-audit | Post-fix |
|------|-----------|----------|
| Admin controls contractor compensation | PARTIAL | **PASS** |
| Editable before release | PASS | **PASS** |
| Edit audited | PARTIAL | **PASS** (reason required) |
| Locked after release | PARTIAL | **PASS** (`stripe_transfer_id` blocks adjust) |
| Instant settings admin-controlled | PASS | **PASS** |
| Instant fee server-calculated | PASS | **PASS** |
| Stripe fees visible to admin | FAIL | **PARTIAL** (not captured) |
| Complete economics in one view | PARTIAL | **PARTIAL** (API enriched; UI labels fixed) |

---

## Remediation applied

1. **`api/financial-calculations.js`** — sum approved change orders into payout amounts  
2. **`api/payout-db.js`** — refresh payout row from proposal+CO+tips when no transfer  
3. **`api/payout-service.js`** — `serializePayoutForContractor`, `serializePayoutAdmin`  
4. **`api/payout-routes.js`** — reject client money fields; RBAC `payouts.approve`; remove amount override; require adjustment reason; admin economics on detail  
5. **`src/app/AdminContractorPayoutsPanel.tsx`** — adjustment reason field; correct labels  
6. **`scripts/smoke-payout-flow-audit.mjs`** — regression suite (`npm run smoke:payout-flow`)

**Restart required:** `npm run dev` (or API process) to load route-layer fixes in running server.

---

## Remaining risks (not fixed in this pass)

1. Stripe Connect onboarding incomplete on real contractor (`tos_acceptance` past due) — blocks live transfer  
2. Standard payout status may not reach `paid` after transfer-only release  
3. Instant vs standard approve path architectural tension  
4. No actual Stripe processing fee capture for FixBridge net  
5. Post-payout refund clawback not automated (flag only)  
6. `finance-routes.js` may reference stale payout column names  

---

## Tests executed

| Suite | Result |
|-------|--------|
| `npm run build` | PASS |
| `npm run smoke:payout-flow` | **16/16 PASS** (2026-08-28, API restarted) |
| `npm run smoke:stripe-e2e` | 15/15 PASS |
| `npm run smoke:zero-dollar` | PASS |
| `npm run smoke:connect` | 11/13 (transfer BLOCKED — Stripe onboarding) |
| `npm run smoke:idor` | PASS |
| `npm run smoke:rbac` | 10/10 PASS |

---

# FIXBRIDGE FINAL PAYMENT → PAYOUT AUDIT

**Date:** 2026-08-28  
**API:** Restarted (`node --env-file=.env server.js` on `:3001`)  
**Evidence:** Code trace + DB smoke + live API + Stripe Connect probe

```text
FIXBRIDGE FINAL PAYMENT → PAYOUT AUDIT

Homeowner payment:                          PASS
Platform payment ownership:                 PASS
Job/payment association:                    PASS
Contractor agreed compensation:             PASS
Admin contractor adjustment:                PASS
Adjustment audit history:                   PASS
Post-release lock:                          PASS
Change orders:                              PASS
Visit fees:                                 PASS
Actual Stripe processing fees:              PARTIAL
FixBridge gross margin:                     PASS
FixBridge true net:                         PARTIAL
Refund accounting:                          PARTIAL
Financial ledger:                           PASS
Standard payout:                            BLOCKED
Instant payout:                             BLOCKED
Stripe Connect eligibility:                 BLOCKED
Duplicate payout protection:                PASS
Stripe idempotency:                         PASS
Webhook reconciliation:                     PARTIAL
RBAC:                                       PASS
IDOR:                                       PASS
Homeowner privacy:                          PASS
Contractor privacy:                         PASS

Tests:
  smoke:payout-flow   16/16 PASS
  smoke:rbac          10/10 PASS
  smoke:idor          PASS
  smoke:connect       11/13 (transfer + standard payout blocked by Stripe TOS)

LIVE BLOCKERS:
  1. Real contractor Connect account acct_1U97dGEP9cZfuB1u — TOS_NOT_ACCEPTED
     (details_submitted=false, transfers capability inactive)
  2. Stripe processing fees populate only after real charge balance_transaction
     (simulated settlements show "Pending" in admin economics)
  3. Post-payout refund reconciliation recorded but clawback not automated

FILES CHANGED:
  api/payment-settlement.js      — fee capture post-commit, reconcileRefundForJob
  api/financial-ledger.js        — append-only financial events (NEW)
  api/schema-managed.js          — stripe fee columns, ledger + reconciliation tables
  api/stripe.js                  — normalizeConnectAccountStatus, captureStripeProcessingFees
  api/payout-db.js               — Connect eligibility gate, ledger on transfer, funds cap
  api/payout-routes.js           — full admin economics, adjustment fix, ledger events
  api/payout-service.js          — contractor original amount from base net
  api/platform-routes.js         — admin refund → reconcileRefundForJob
  api/managed-routes.js          — webhook fee capture + refund reconciliation
  src/app/AdminContractorPayoutsPanel.tsx — full financial breakdown UI
  src/app/ContractorStripeConnectCard.tsx — blockedReason + requirements
  src/app/managedJobs.ts         — PayoutEconomics types, adminGetPayoutDetail
  scripts/smoke-payout-flow-audit.mjs — extended regression suite

FINAL VERDICT:
  PARTIALLY READY
```

## Production-gap remediation (2026-08-28)

### Stripe Connect diagnostics
- `normalizeConnectAccountStatus()` returns live Stripe fields: `accountId`, `detailsSubmitted`, `chargesEnabled`, `payoutsEnabled`, `capabilities`, `currentlyDue`, `eventuallyDue`, `pastDue`, `pendingVerification`, `disabledReason`, `blockedReason` (e.g. `TOS_NOT_ACCEPTED`).
- Exposed to contractor (`/api/contractor/payout-account`) and admin payout detail (`connectStatus`).
- `validatePayoutEligibility` blocks release until `transfersEligible` + `onboardingComplete`.
- UI: **Complete Stripe onboarding** CTA with Account Link; refresh on return.

### Stripe processing fees
- `captureStripeProcessingFees(pi)` → charge → balance_transaction → `stripe_processing_fee_cents`, `stripe_net_received_cents`, `stripe_charge_id`, `stripe_balance_transaction_id`.
- Triggered on `processSuccessfulPayment` (post-commit) and `payment_intent.succeeded` webhook.
- Admin economics shows **Pending** when fee not yet available (not `$0.00`).

### Admin payout breakdown
- `GET /api/admin/payouts/:id` returns `economics.homeowner`, `paymentCosts`, `contractor`, `fixbridge`, `refundReconciliations`, `auditLogs`.
- UI renders full JOB financial picture with separate Stripe fee vs instant fee vs FixBridge net.

### Contractor adjustment
- **Fixed:** adjustment now applies to base contractor payable (`net - prior_adjustments + delta`), not `gross - platform_fee`.
- Mandatory reason, audit metadata with `previousNetAmountCents`, ledger `CONTRACTOR_PAYABLE_ADJUSTED`.
- Locked after `stripe_transfer_id`.

### Refund accounting
- `reconcileRefundForJob`: holds payout pre-transfer; creates `refund_reconciliations` post-transfer with platform exposure.
- Wired to admin refund route and `charge.refunded` webhook.

### Financial ledger
- `financial_ledger_events` table; events: payment succeeded, fee captured, payable created/adjusted, transfer created, refund/reconciliation.

### Idempotency
- Transfer: `fixbridge-payout-{payoutId}`; refund: client `idempotencyKey`; settlement: `payment_settlements.idempotency_key`.

## Remaining risks

1. **Stripe Connect TOS** — external action required before live transfers  
2. **True FixBridge net** — requires captured Stripe fees on real payments  
3. **Standard payout `paid` status** — transfer-only path may remain `processing`  
4. **Post-payout refund** — reconciliation flag only; no automatic Stripe reversal  
5. **Instant vs standard** — mutually exclusive paths by design (preserved)
