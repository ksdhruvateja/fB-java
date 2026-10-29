# FixBridge Commercial

A separate product under `/commercial` for commercial service contractors, built from the
*Contractor Pricing Proposal* and *Contractor-First Development Plan*. It does not share
accounts, sign-in, data or admin screens with the homeowner/contractor marketplace.

| Area | Where |
| --- | --- |
| Public site, pricing, founding offer, pilot application | `/commercial` |
| Company sign-in / set password from invite | `/commercial/login`, `/commercial/set-password` |
| Company portal (Today, Jobs, Intake, Invoices, Exceptions, Customers & sites, Team, Settings) | `/commercial/app` |
| Commercial admin (applications, companies, plans) | `/commercial/admin` |
| API | `/api/commercial/*` (`api/commercial/`) |
| Frontend | `src/commercial/` (own lazy-loaded bundle) |

## Separation

- Tables are prefixed `commercial_` and are created on first use (`api/commercial/schema.js`),
  independent of the main schema version.
- Tokens are signed with a key derived for commercial use and carry a scope
  (`fixbridge-commercial-user` / `fixbridge-commercial-admin`). Marketplace tokens are refused,
  and commercial tokens are refused by the marketplace.
- Commercial admins live in `commercial_admins`. Create the first one with
  `COMMERCIAL_ADMIN_EMAIL` + `COMMERCIAL_ADMIN_PASSWORD`, or
  `COMMERCIAL_ADMIN_PASSWORD=... node scripts/create-commercial-admin.mjs <email> "<name>"`.

## Demo / test accounts

Set `COMMERCIAL_DEMO_PASSWORD` (10+ characters) to create "FixBridge Demo Services" with three users
that share that password: `demo.owner@fixbridge.us` (owner), `demo.office@fixbridge.us` (office) and
`demo.tech@fixbridge.us` (technician). Its customer uses example.com addresses, so nothing is emailed
to real people, and it never takes a founding spot. Removing the variable deactivates the demo users.
The Intake page has a "Use a sample email" button for trying dispatch intake.

## Workflow

Dispatch email → reviewed job record → acceptance & ETA → site visit → proposal / authorized
work → completion package → invoice submission → payment tracking.

- **Intake**: paste text or upload `.eml`/`.txt` (PDF/photo attachments are stored). The original
  email is kept verbatim. `dispatch-extract.js` reads WO#, PO#, dispatcher, billing customer,
  site, address, contacts, scope, trade, priority, due time + zone, NTE, approval, billing,
  access and check-in instructions. Missing, unclear or conflicting values become flags; blocking
  flags must be corrected or explained before the job can be marked reviewed.
- **Duplicates**: the same email again changes nothing; a new email for a known WO updates the job
  before acceptance, or opens a "dispatch changed" exception after acceptance.
- **Acceptance**: a received dispatch is not an accepted job. Acceptance needs review + ETA.
- **Visits**: On my way / Check in (optional location) / Check out with outcome (completed,
  diagnosis only, parts needed, return visit, no access, awaiting approval). Customer check-in and
  check-out (IVR / code / portal) are recorded separately, including failures with a note.
  Multiple technicians and return visits keep the full history. Field actions made offline are
  queued on the phone and replayed once with their original time (`client_action_id`).
- **Proposals & approvals**: technicians capture findings and quantities; the office prices,
  reviews and submits. Original NTE, requested amount, approved amount, approver and evidence are
  stored. Pending work blocks completion and invoicing; unclear replies go to the exception queue.
- **Completion package**: completed visit, work notes, after photos, customer check-in recorded,
  no pending authorizations (and sign-off if the customer requires it) before finalizing.
- **Invoices**: drafted from the approved proposal (or visit time × labor rate). Checks: recipient,
  WO#, within authorized amount, decided change orders, line items, completion finalized, service
  dates, not already billed. Sends once (resend needs a reason). Statuses: draft, sent,
  delivery failed, acknowledged, disputed, paid, void. Payments need a reference or evidence.
- **Exceptions** always have a responsible person (company default, else the owner).
- **Roles**: owner and office see everything; technicians see assigned jobs; prices and invoices
  are hidden from technicians unless the owner allows it.

## Pricing (as published)

Network free · Commercial Essentials $99/mo (3 users) · Commercial Team $199/mo (10 users) ·
additional users $15/user/mo. Founding offer for the first 10 companies: 30 days free starting
after intake is configured and a real job is processed, then $49/mo for 12 months, then $99/mo
with advance notice; no setup fee; cancel monthly. No percentage of invoices, no per-job fees,
nothing charged to facility customers, no requirement to collect payments through FixBridge.
The voice receptionist price is an internal hypothesis and is not published. The pilot is sign-up
only: no card is collected and nothing is charged through FixBridge yet.

## Not in this release

Automatic email forwarding into intake, AI extraction, voice receptionist, Stripe billing for
commercial plans.

## Tests

`api/commercial/commercial.test.js` covers the plan's pass criteria (duplicate dispatch, unclear
address/NTE, failed external check-in, return visit history, authorization before extra work,
missing completion evidence, bounced invoice assigned, cross-company isolation).
