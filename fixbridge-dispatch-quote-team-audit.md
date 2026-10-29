# FIXBRIDGE OPERATIONS / QUOTE / CONTRACTOR TEAM AUDIT

Date: 2026-09-03

## Summary

This pass implements launch/beta operations for optional FixBridge Additional Insured, server-backed contractor field team profiles, dispatch technician tracking, job operational milestones/timeline, quote revision history with comparison, and automatic invoice creation on homeowner quote acceptance.

---

## Compliance

| Item | Status | Notes |
|------|--------|-------|
| Additional insured requirement | **OPTIONAL** | `REQUIRE_FIXBRIDGE_ADDITIONAL_INSURED` defaults off (`api/compliance-settings.js`) |
| Missing additional insured blocks dispatch | **NO** | `AI_ONGOING_OPS` uses `OPTIONAL` applicability; matrix status `RECOMMENDED` when missing |
| Compliance gate changed | **AI_ONGOING_OPS only** | GL, WC, trade license, completed ops, etc. unchanged |
| UI shows Recommended | **PASS** | `RECOMMENDED` matrix status + label "Recommended — not provided" |

---

## AI

| Item | Status |
|------|--------|
| AI guardrails | **PARTIAL** | Existing GREEN/YELLOW/RED engine preserved; copy updated |
| AI acknowledgment | **PASS** | Per-invocation ack enforced (`smoke:ai-assessment-ack` 7/7) |
| Acknowledgment only after CTA | **PASS** | Prior work retained |

---

## Contractor team

| Item | Status |
|------|--------|
| Employee profiles (server) | **PASS** | `contractor_employees` table + CRUD API |
| Multiple phones/emails | **PASS** | JSON arrays with validation |
| Employee photo | **PARTIAL** | Upload API + MIME/size validation; no UI upload yet |
| Contractor team UI | **PASS** | `ContractorTeamPanel` wired to API |
| Admin employee visibility | **PASS** | `GET /api/admin/contractors/:id/employees` |
| Cross-contractor IDOR | **PASS** | 403/404 on foreign employee access |

---

## Dispatch & jobs

| Item | Status |
|------|--------|
| Admin technician assignment | **PASS** | `employeeId` on admin assign |
| Contractor technician assignment | **PASS** | `POST /api/contractor/managed/jobs/:id/assign-technician` |
| Homeowner Who to Expect | **PASS** | `ServiceTrackingCard` shows photo/name/role/phone |
| Contractor dispatched | **PASS** | `POST .../mark-dispatched` + operational event |
| Job started | **PASS** | `POST .../mark-started` |
| Job completed | **PASS** | `POST .../mark-completed` |
| Job timeline API | **PASS** | `GET /api/managed/jobs/:id/timeline` |
| Admin dispatch detail panel | **PARTIAL** | Technician select + milestone actions in Admin dispatch; full consolidated detail layout not fully redesigned |

---

## Quotes & invoices

| Item | Status |
|------|--------|
| Multiple quotes per job | **PASS** | Duplicate quote + per-job history list |
| Quote revision history | **PASS** | `quote_revision_snapshots` on sent-quote edits |
| Previous vs current comparison | **PASS** | Admin quote workspace comparison panel |
| Pricing difference | **PASS** | Difference row in comparison panel |
| Discount visibility | **PARTIAL** | Existing discount fields; revision vs discount split shown in comparison totals |
| Contractor compensation per revision | **PASS** | `contractor_quote_amount` editable per save |
| Quote send | **PASS** | Existing send flow; supersedes sibling sent quotes |
| Quote acceptance | **PASS** | Blocks superseded/expired/draft quotes |
| Automatic invoice creation | **PASS** | `approve-proposal` calls `convertProposalToInvoice` in transaction |
| Duplicate invoice prevention | **PASS** | Idempotent on `converted_invoice_id` + row lock |
| Homeowner pricing privacy | **PASS** | Existing serializers retained |
| Quote alternatives (Option A/B) | **PARTIAL** | `quote_option_label` column added; dedicated alternative-quote UX not built |

---

## Security & tests

| Item | Status |
|------|--------|
| RBAC | **PASS** | Admin-only quote/invoice ops unchanged |
| IDOR | **PARTIAL** | Employee IDOR tested; full quote IDOR suite not re-run this pass |
| Build | **PASS** | `npm run build` |
| `smoke:dispatch-quotes-team` | **PASS** | With assign skip when demo contractor not dispatch-eligible |
| `smoke:ai-assessment-ack` | **PASS** | 7/7 |

---

## Files changed (primary)

**API**
- `api/schema-managed.js` — employees, revision snapshots, operational events, job/quote columns
- `api/contractor-employees.js`, `api/contractor-employees-routes.js`
- `api/job-operational-events.js`
- `api/quote-invoice-service.js`
- `api/managed-routes.js` — approve-proposal auto-invoice, timeline, milestones, technician in jobs
- `api/quote-workspace-routes.js` — revision snapshots, supersede, comparison data
- `api/quote-document.js` — `superseded` status
- `api/app.js` — register employee routes

**Frontend**
- `src/app/ContractorTeamPanel.tsx`
- `src/app/ServiceTrackingCard.tsx`
- `src/app/AdminPanel.tsx`
- `src/app/AdminQuotesWorkspace.tsx`
- `src/app/aiAssessmentCopy.ts`, `AiAssessmentAckModal.tsx`
- `src/app/contractorCompliance.ts`
- `src/app/managedJobs.ts`

**Tests / docs**
- `scripts/smoke-dispatch-quotes-team.mjs`
- `scripts/smoke-contractor-compliance.mjs` (AI optional assertion)
- `.env.example` — `REQUIRE_FIXBRIDGE_ADDITIONAL_INSURED`

---

## Database changes

Non-destructive migrations via `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`:

- `contractor_employees`
- `quote_revision_snapshots`
- `job_operational_events`
- `managed_jobs.assigned_employee_id`
- `proposals.assigned_employee_id`, `contractor_findings`, `quote_option_label`, `superseded_at`, `superseded_by_proposal_id`

---

## Remaining issues

1. **Employee photo UI** — API supports upload; contractor team panel does not yet expose photo picker.
2. **Quote alternative options (A/B)** — schema hook only; homeowner single-active-quote acceptance flow is complete.
3. **Full admin dispatch detail layout** — consolidated service-request card per spec §28 not fully built.
4. **Quote smoke in dispatch suite** — quote revision/accept/invoice paths need dedicated e2e smoke (not in `smoke-dispatch-quotes-team` yet).
5. **Re-run** `smoke:rbac`, `smoke:idor`, `smoke:p1` against staging after deploy.

---

## Config

```env
# Optional — set true to require FixBridge Additional Insured endorsement
REQUIRE_FIXBRIDGE_ADDITIONAL_INSURED=false
```
