# FixBridge Angular migration notes

Preserved behavior contracts from the React app (`src/`) while the UI is ported. React `src/` remains untouched.

## Auth storage

- `localStorage` key `fixbridge-auth-token` — JWT bearer token
- `localStorage` key `fixbridge-user-cache` — cached `AuthUser` JSON
- `localStorage` key `fixbridge-selected-property` — selected homeowner `propertyId` (isolation filter)
- API base is relative `/api` (dev proxy → `http://127.0.0.1:3001`)

## HTTP layer

- `authInterceptor` — attaches Bearer token
- `errorInterceptor` — friendly error messages; **401 → logout** and route to role login (skips signin/signup/mfa)

## Shared UI

- `LoadingSkeletonComponent`, `EmptyStateComponent`
- `AiAssessmentAckModalComponent` — only for AI assessment path
- `compressImageFile()` — canvas max dimension **1600** before upload
- Brand primary `#FF4D1C`

## Auth screens

| Flow | Status |
| --- | --- |
| Homeowner / contractor signup toggle → `AuthService.signUp` | **Done** — password min 6 + field messages |
| Admin MFA after sign-in → `/api/auth/mfa/start` + `verify` | **Done** — admin-login `requireMfa` end-to-end |
| Forgot password modal on login → `/api/auth/forgot-password` | **Done** |
| Reset password route | **Done** |

## Portal tab ID map (Angular routes)

### Homeowner — `/homeowner/:tab`

| Angular route | Notes |
| --- | --- |
| `overview` | Properties + jobs filtered by selected property |
| `services` | Catalog cards with DIY / AI / Subscribe / Pro actions |
| `jobs` | Segments active/quotes/upcoming/history; delete when deletable |
| `jobs/:id` | Hire path: `request-professional` + dispatch pricing + pay |
| `report` | Ack modal only on AI path; poll with 1–5 min progress UI |
| `diy?jobId=` | DIY safety + steps |
| `inbox` | Messages + notifications |
| `property-care` / `passport` | Property picker context + systems + job media |
| `properties` | List + create |
| `payments` | History + outstanding from jobs |
| `go-pro` | Plans from API + checkout |
| `help` | Support tickets create/list/reply |
| `legal` | Consent status + accept |
| `refer-earn` | `/api/referrals/me` (graceful if missing) |
| `documents` | Property docs via `/api/properties/:id/documents` (+ job media fallback) |
| `profile` | Profile + logout |
| `more` | Shortcuts |

**Property isolation:** shell switcher writes `fixbridge-selected-property`; jobs/overview/payments (job-linked)/documents/property-care/DIY entry filter by `propertyId`.

### Contractor — `/contractor/:tab`

| Route | Notes |
| --- | --- |
| `dashboard` | Counts |
| `invites` | Accept / decline |
| `jobs` | mark-travel / arrived / started / complete + technician assign if employees API |
| `team` | Employees CRUD (graceful if API missing) |
| `compliance` | Status + document upload via profile |
| `availability` | Weekly toggles → profile |
| `areas` | ZIP list → `serviceZips` profile |
| `payouts` | List |
| `performance` | `/api/contractor/performance` |
| `messages` | Full messaging panel |
| `settings` | Logout |

### Admin — `/admin/:tab`

| Route | Notes |
| --- | --- |
| `overview` | Queue / jobs / Fixera snapshot |
| `work-queue` | Load API, filter, invite/assign |
| `quotes` | List + quote builder form |
| `finance` | Payouts approve/adjust + manual payment |
| `disputes` | List + resolve |
| `support-tickets` | Admin queue + reply |
| `homeowners` / `contractors` | `GET /api/admin/users?role=homeowner\|contractor` (+ job fallback) |
| `services` | Edit capability flags |
| `settings` | HomeCare settings, activation fee, subscription plans, Fixera status |
| `messages` | Messaging panel |

**Admin search:** shell search bar → `GET /api/admin/search?q=`

## Homeowner report → AI → DIY / Hire

| Step | Status |
| --- | --- |
| Intake | **Done** |
| Path choice (AI vs Hire) | **Done** |
| `AiAssessmentAckModal` only on AI | **Done** — closes on accept, scrolls to analysis |
| Assess + poll (3s × 50) with progress copy | **Done** — no white screen |
| Image compression before upload | **Done** |
| Hire: request-professional + dispatch pricing + pay | **Done** — coupon apply/clear via prepare-checkout |
| Tip on completed jobs with invoice | **Done** — `/api/homeowner/invoices/:id/checkout` when invoiceId present |

## API services (HttpClient)

| Service | Key paths |
| --- | --- |
| `AuthService` | signin/signup/me/profile/forgot/mfa |
| `PropertyApiService` | `/api/properties*` + documents upload/list/delete |
| `PropertyContextService` | selected property isolation (jobs, payments, DIY) |
| `ManagedJobsApiService` | jobs CRUD-ish, cancel/delete, hire, contractor marks, invites |
| `ContractorApiService` | employees (+ graceful), assign-technician, compliance upload |
| `AiApiService` | assess, status, Fixera chat |
| `DiyApiService` | DIY projects + safety |
| `QuoteApiService` | proposal / options / change orders |
| `PaymentApiService` | prepare-checkout (coupon), pay-dispatch, payments/mine, tip checkout |
| `SubscriptionApiService` | go-pro plans + checkout |
| `SupportApiService` | tickets create/list/reply |
| `LegalApiService` | consent status/accept |
| `ReferralsApiService` | `/api/referrals/me` |
| `AdminApiService` | work-queue, quotes, finance, disputes, support, services, users, search |
| `AddressApiService` | public autocomplete |
| `MessagingApiService` / `NotificationsApiService` | inbox |
| `ServiceCatalogApiService` | home + admin services |

## Query params (from React `App.tsx`) — still to polish

Stripe/subscription return handling, partner/ref codes, and `?go-pro=1` deep links remain partially on marketing pages; core portal tabs above are API-wired.

## Session storage keys used by Stripe / partner flows

- `fixbridge-stripe-active-job-id`
- `fixbridge-dispatch-confirming` / `fixbridge-dispatch-canceled`
- `fixbridge-invoice-confirming` / `fixbridge-invoice-canceled`
- `fixbridge-upgrade-return`
- `fixbridge-partner-code` / `fixbridge-partner-intake`
- `fixbridge-discount-code`
- `fixbridge-selected-property`
