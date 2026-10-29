# FixBridge Quote Architecture

## AUTHORITATIVE QUOTE SYSTEM

**Quote Workspace** (`proposals` table + `/api/admin/quotes/*` + `AdminQuotesWorkspace.tsx`)

This is the single source of truth for customer-facing business quotes and invoices.

| Concern | Authority |
|--------|-----------|
| Quote number (`FBQ-*`) | `proposals.quote_number` |
| Version / revision | `proposals.version_number`, `parent_proposal_id` |
| Customer / property | `proposals` bill-to fields + linked `managed_jobs` |
| Contractor | `managed_jobs.assigned_contractor_user_id` |
| Line items | `proposals.customer_line_items` + `document_totals` |
| Discount / shipping / tax | `document_totals` (server recalculated on save) |
| Status lifecycle | `proposals.status`: draft → sent → viewed → accepted → converted |
| Acceptance | `quote_acceptance_snapshots` (immutable) |
| Lock after accept | `proposals.locked_at` → PUT returns 409 |
| Expiry | `proposals.quote_valid_until` → accept blocked when expired |
| Invoice conversion | `POST /api/admin/quotes/:id/convert-invoice` from accepted snapshot |
| Invoice record | `homeowner_invoices` linked via `proposal_id` |
| Payment | `processSuccessfulPayment()` via Stripe webhook or manual payment |

Frontend entry: **Admin → Quotes Workspace** (`AdminQuotesWorkspace.tsx`)  
Homeowner view: job detail + quote link (`?quote=FBQ-…`)

## LEGACY COMPATIBILITY

| Legacy path | Adapter behavior |
|-------------|------------------|
| `GET/POST /api/managed/jobs/:id/proposal` | Reads/writes latest `proposals` row for job; publish maps to workspace send |
| `POST /api/managed/jobs/:id/approve-proposal` | Creates `quote_acceptance_snapshots`, locks proposal — same as workspace accept |
| Admin job invoice HTML (`/api/admin/managed/jobs/:id/invoice`) | Delegates to workspace invoice when `homeowner_invoices` exists |
| Retail / AI estimate fields on job | **Not** included in business quote document — estimate is pre-quote only |

**Rule:** Never compute customer price from two independent systems. Legacy routes read/write the workspace `proposals` record.

## Removed / hidden

- Duplicate independent pricing on legacy publish without workspace save (blocked by lock + snapshot)
- Homeowner AI estimate inside Admin quote document (UI separates estimate from business quote)

## Status transitions (enforced server-side)

```
draft → sent → viewed → accepted → converted
sent → declined | expired
accepted → locked (immutable except admin revision → new version)
```

Invalid transitions return 409 with explicit codes (`quote_locked`, `quote_expired`, `acceptance_required`).
