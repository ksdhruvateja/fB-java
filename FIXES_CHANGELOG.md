# Bug-fix changelog

Verified with: `npm test` against a fresh PostgreSQL database (112/112 pass, including 7 new
regression tests in `api/security-fixes.test.js` that fail on the previous code), `vite build`, and
`npm run typecheck` (199 → 20 errors; the remaining ones are listed at the end).

## Security
- **MFA code exposure** — `/api/auth/mfa/start` never returns the code on production. If the email
  cannot be sent there, the challenge is withdrawn and a 503 is returned. (`api/platform-routes.js`)
- **MFA bypass** — `requireAuth` rejects MFA-pending tokens on every route except MFA start/verify;
  `requireAdminWrite`/`requireAdminRead` check it too. Partner and Google-pending tokens (`typ`
  claim) are no longer accepted as sessions. (`api/app.js`)
- **Known fallback secret** — new `api/runtime-env.js`; the API refuses to start on any hosted
  environment without `SESSION_SECRET`. Used by app, commercial auth, media links, partner and
  Google sign-up tokens. Production detection no longer depends on `NODE_ENV` alone.
- **MFA hardening** — `crypto.randomInt` codes, 5-attempt lockout, one active code per user,
  single-use codes.
- **Password reset** — ends all earlier sessions (`users.password_changed_at`), and the link is
  claimed atomically so it works only once.
- **Media upload link** — returns a real signed URL served by `/api/media/object/:id`.
- **Auth cache** — cleared immediately on block / access-level / email change.

## Payments
- Tips are recorded per payment, idempotent per Stripe payment intent (unique index), several tips
  per job add up, refunds cover all tips. (`api/tips.js`, `api/payment-settlement.js`)
- Rounded dollars→cents in the checkout-return path.

## Server
- Global error handler returns generic messages (no more "Google registration" errors everywhere).
- Removed dead request-ID middleware in `server.js`; lowercase header lookups; JSON-safe error
  handler for page routes.
- Reschedule "today or later" check uses the property's timezone.
- Admin user list returns `createdAt` and contractor rating (were always blank in the admin UI).

## Frontend
- Admin job drawer shows the real AI estimate; quote panel keeps its job check; quote saves send
  the job id; Send/Convert stop if the save failed (except for locked quotes).
- Accept/Approve quote buttons no longer pass the click event as consent data.
- Timezone-safe dates (`src/app/dateOnly.ts`) for date displays and the reschedule picker.
- Phone validation without the missing `libphonenumber-js`; `businessCountry` typed.
- Assessment in-flight guard keyed by record type + id; debug logs dev-only (`src/app/devLog.ts`).
- Google button listener cleanup; admin MFA screen shows server errors.
- Document-extraction modal shows the fields the API actually returns.
- Restored dashboard tab is validated; removed 4 permanently disabled admin tabs (~460 lines).

## Housekeeping
- `tsconfig.json`, `npm run typecheck`, `npm test`; `logs/` ignored and the committed debug log
  removed; README/agent notes updated.

## Remaining type-check errors (20, no known runtime impact)
Run `npm run typecheck` for the list. They are typing gaps in: AdminOrderLedgerPanel,
ContractorDashboard, ContractorPage, HomeownerPropertyPage, HomeownerServiceIntake,
ProfessionalServiceRequestBetaCard, geminiAssessment and AdminJobEvidencePanel.

## Round 2 — DIY repair ideas, back navigation, accessibility
- **Repair ideas shown automatically.** The DIY screen no longer has a "Repair ideas" button; the
  possible cause, recommended fix, tools and "when to call a pro" cards appear directly where the
  button was. Red-risk repairs keep their steps hidden (on the Ideas tab too, which previously
  showed them).
- **Back button could leave the dashboard.** The in-app Back button used `history.back()` whenever
  there was any earlier browser entry — after signing in (or reopening a saved screen) that entry
  was the login page or public site. Back now uses history only when the previous entry is the
  same dashboard, otherwise it goes to the logical parent screen. (`navigation.ts`,
  `useDashboardNavigation.ts`)
- **Admin MFA "Back"** clears the password-only session instead of leaving it stored.
- Screen-reader labels on 7 icon-only buttons (close/send) and `alt` text on 1 image that had none.

## Round 3 — UI/UX improvements
- **No more browser pop-ups.** All 35 `alert()` calls are now toasts and the 4 `confirm()` calls are
  an in-app confirmation dialog (`src/app/feedback.tsx`, mounted once in `main.tsx`).
- **Readable text.** 498 uses of 9–11px text raised to 12px (`text-xs`).
- **Consistent colors.** The brand orange (369 uses) now uses the theme `primary` color, and the
  DIY palette is named theme tokens (`text-diy-ink`, `bg-diy-sand`, `brand-hover`, …) in
  `src/styles/theme.css` — 522 hard-coded colors replaced, same look. What remains is mostly the
  separate commercial landing page and one-off shades.
- **Faster first load.** The homeowner, contractor, admin and partner areas load on demand
  (`src/app/lazyScreen.tsx`). Main bundle: 2.6 MB → 0.88 MB.
- **"Ideas" tab removed** from the DIY bottom bar (its content is on Home).
- **One rule for Back.** The in-app Back button always goes one level up; the browser/phone back
  retraces history.
- **Contractor job details** are a real navigation step: Back closes the job before leaving Jobs,
  and notifications open jobs through navigation.
- **Protected admin account** is a database flag (`users.is_protected`, set on the primary admin)
  and enforced by the server. The old UI check used an email that no longer existed.
- **Type check clean: 0 errors.** Fixes included real bugs:
  - The beta-request checkbox ignored `disabled`.
  - Quote snapshots were labelled with the wrong ID.
  - The contractor Team tab passed settings that were never used.
- **Smaller files.** Module-level helpers moved out of the two largest files
  (`homeownerDashboardHelpers.tsx`, `adminPanelUi.tsx`).
- **Test fix.** The hire-pricing test can now run repeatedly on the same database.

## Round 4 — Admin and commercial sign-in
- **New columns now reach existing databases.** `SCHEMA_READY_VERSION` was bumped, and the new
  auth columns are added on both the fresh-database and existing-database startup paths.
  Before this, a database set up by the old code skipped them, so password reset failed there.
- **The primary admin is created from environment variables** (`PRIMARY_ADMIN_EMAIL`,
  `PRIMARY_ADMIN_PASSWORD`). Before this there was no way to create one in production.
  `scripts/seed-admin.mjs` no longer falls back to the password `admin123`.
- **Optional one-time password resets** for both admins (`*_RESET_PASSWORD=true`).
- **Clear startup warnings** when a commercial admin or demo password is too short. Before
  this, the account was silently not created.
- Tested:
  - Upgrading a database created by the original code.
  - Primary admin creation and sign-in.
  - Owner, office and technician sign-in, and the wrong-role message.
  - Commercial admin sign-in.

## Round 5 — Commercial self sign-up and admin approvals
- **Anyone can request an account** at `/commercial/signup/owner`, `/commercial/signup/office`
  or `/commercial/signup/technician`, linked from each sign-in page.
  - **Owners** register their company, which is created with status `pending`.
  - **Office staff and technicians** join with their company's **join code**. The code is shown
    on the owner's and office's Team page; owners can generate a new one.
- **Commercial admins approve everything.**
  - Every new account waits for approval: self sign-ups and staff invited by an owner.
  - The new admin page **Account approvals** (`/commercial/admin/accounts`) lists them with
    Approve / Reject, and the Overview has a count of waiting accounts.
  - Approving an owner activates their company. Seat limits are checked when approving.
  - Rejecting a self-signed-up owner cancels their pending company.
  - The person is emailed when approved, and the admin (`COMMERCIAL_ADMIN_EMAIL`) is emailed
    when a request arrives.
- **Sign-in messages:** pending accounts see "waiting for FixBridge approval"; rejected accounts
  see "not approved". Existing accounts are unaffected (they default to approved).
- **New database columns** (created automatically):
  - `commercial_users.approval_status`, `approval_note`, `approval_decided_at`,
    `approval_decided_by`, `signup_source`
  - `commercial_companies.join_code`
- **Tests:** a new end-to-end test covers owner sign-up, approval, join code, technician
  sign-up and approval, and office rejection.

## Round 6 — Railway, temporary logins, multiple commercial admins
- **Variables now take effect after every redeploy.** Before this, account variables were only
  read the first time the database was set up, so variables added later were ignored. The
  commercial setup now also runs at startup instead of on its first request.
- **Clearer deploy logs.** Each start logs which sign-in variables are set (never their values).
- **Railway's `production` environment is treated as production.**
- **`TEMP_LOGIN_PASSWORD`** creates one temporary login per role: homeowner, contractor, admin,
  commercial admin, company owner, office staff and technician. Removing it blocks them on the
  next start.
- **Multiple commercial admins.** The new **Admins** page (`/commercial/admin/admins`) lets an
  admin add admins, deactivate or reactivate them, and set another admin's password. Every admin
  can change their own password.
  - You can't deactivate yourself.
  - At least one admin always stays active.
- **Tests:** 115/115, including new tests for temporary logins and admin management.

## Round 7 — Temporary logins are commercial-only
- **Renamed variable.** Temporary logins now come only from `COMMERCIAL_TEMP_LOGIN_PASSWORD`.
  `TEMP_LOGIN_PASSWORD` is still accepted.
- **Commercial accounts only.** They cover the commercial admin, owner, office staff and
  technician. No homeowner, contractor or marketplace admin accounts are created.
- **Old accounts blocked.** Marketplace temporary accounts created by the previous version
  (`temp.homeowner@`, `temp.contractor@` and `temp.admin@fixbridge.us`) are blocked at startup.
