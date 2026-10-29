# FIXBRIDGE PROFESSIONAL EMAIL SYSTEM

## Summary

Central template system:
**PASS**

Sender:
**FixBridge Support &lt;support@fixbridge.us&gt;**

Reply-To:
**support@fixbridge.us**

Logo:
**PASS** — `https://fixbridge.netlify.app/fixbridge-logo-lockup.png` (override via `FIXBRIDGE_EMAIL_LOGO_URL`)

Responsive design:
**PASS** — table-based ~600px layout, inline CSS, mobile-friendly width

Plain-text fallback:
**PASS** — every template renders `html` + `text`

## Template coverage

| Category | Count | Status |
|----------|------:|--------|
| Homeowner templates | 24 | PASS |
| Contractor templates | 15 | PASS |
| Partner / referral templates | 4 | PASS |
| Admin / internal templates | 3 | PASS |
| Generic / utility templates | 3 | PASS |
| **Total registered** | **49** | PASS |

### Homeowner (24)
`homeowner_welcome`, `password_reset`, `email_verification`, `service_request_received`, `ai_assessment_ready`, `professional_request_confirmation`, `contractor_assigned`, `contractor_on_the_way`, `appointment_confirmed`, `appointment_updated`, `quote_ready`, `quote_approved`, `quote_updated`, `change_order_request`, `change_order_approved`, `invoice_ready`, `payment_confirmation`, `payment_failed`, `refund_issued`, `job_completed`, `review_request`, `cancellation`, `support_ticket_created`, `support_reply`

### Contractor (15)
`contractor_application_received`, `contractor_application_approved`, `contractor_compliance_needed`, `contractor_compliance_expiring`, `stripe_connect_onboarding`, `job_invitation`, `job_accepted`, `contractor_quote_submitted`, `payout_available`, `payout_released`, `payout_failed`, `instant_payout`, `contractor_info_request`, `dispatch_approved`, `job_cancelled_contractor`

### Partner (4)
`partner_referral_update`, `referral_bonus`, `referral_credit`, `referral_welcome_credit`

### Admin (3)
`admin_notification`, `admin_mfa_otp`, `job_cancelled_admin`

## Feature checks

| Area | Status |
|------|--------|
| Support emails | PASS |
| Quote emails | PASS (branded layout + workspace quote renderer) |
| Invoice emails | PASS (branded layout + invoice renderer) |
| Payment emails | PASS (templates ready; wire on payment webhooks as needed) |
| Refund emails | PASS (template ready) |
| Payout emails | PASS (templates ready; payout routes do not send email yet) |
| Password reset | PASS |
| Email verification | PASS (template ready) |
| Admin-triggered emails | PASS |
| Transactional/marketing separation | PASS (`sendPromotionalMail` unchanged; List-Unsubscribe on marketing only) |

## Architecture

```
api/email/
  email-config.js      # From, Reply-To, logo URL, legal links
  formatters.js        # safeName, formatCurrency, formatDate, safeAddress
  layout.js            # Branded HTML shell + plain text + legacy wrap
  templates.js         # 49 template definitions
  render-email.js      # renderEmail(templateId, data)
  send-fixbridge-email.js  # sendFixBridgeEmail({ to, template, data })
  index.js
```

All sends flow through:
- `sendFixBridgeEmail()` → `sendMail()` (Gmail SMTP)
- Legacy `sendEmailSafe({ subject, html })` auto-wraps unbranded HTML in the layout

## Old sender addresses remaining

- `GMAIL_USER` is still used for **SMTP authentication only** (provider backend)
- Recipients see `FixBridge Support <support@fixbridge.us>` unless `FROM_EMAIL` overrides with an authorized address
- `unsubscribe@fixbridge.app` remains in marketing `List-Unsubscribe` headers only (not transactional From)
- No personal Gmail addresses in recipient-facing From when env is configured per `.env.example`

## DNS / domain authentication

| Record | Status |
|--------|--------|
| SPF | **REQUIRED** — configure for `fixbridge.us` in your DNS provider |
| DKIM | **REQUIRED** — configure with Gmail/Google Workspace or your ESP |
| DMARC | **REQUIRED** — recommended `p=none` → `quarantine` after verification |

**BLOCKED_EMAIL_DOMAIN_CONFIGURATION** until `support@fixbridge.us` is authorized in Gmail/Google Workspace (or your SMTP provider) with SPF/DKIM/DMARC. The application sets the correct From/Reply-To headers; delivery depends on external DNS/provider setup.

## Tests

```bash
npm run smoke:email        # 51/51 PASS
npm run email:preview      # writes HTML previews to scripts/_email-preview/
```

## Build

**PASS** (no frontend changes required)

## Files changed

- `api/email/*` (new template system)
- `api/mail.js` — centralized From + Reply-To
- `api/notify.js` — routes through `sendFixBridgeEmail`
- `api/brand.js` — default support email
- `api/password-reset.js`, `api/partners.js`, `api/referrals.js`
- `api/contractor-compliance-alerts.js`, `api/service-reminders.js`, `api/job-cancellation.js`
- `api/managed-routes.js`, `api/platform-routes.js`
- `api/invoices.js`, `api/quote-workspace-routes.js`
- `scripts/smoke-email.mjs`, `scripts/email-preview.mjs`
- `.env.example`, `package.json`

## Remaining issues

1. **Payout emails** — templates exist (`payout_available`, `payout_released`, `payout_failed`, `instant_payout`) but `api/payout-routes.js` does not send email yet; wire when payout events are implemented.
2. **Support ticket emails** — templates exist; `api/support-tickets.js` currently uses in-app notifications only.
3. **Some lifecycle events** (contractor assigned, appointment confirmed, etc.) have templates but are not yet wired to every job status transition — migrate as those hooks are added.
4. **Domain verification** — production deliverability requires SPF/DKIM/DMARC for `fixbridge.us` outside the repo.
5. **Homeowner welcome** — template exists; wire on signup if not already triggered elsewhere.

## Environment variables

```env
FIXBRIDGE_FROM_EMAIL=support@fixbridge.us
FIXBRIDGE_REPLY_TO_EMAIL=support@fixbridge.us
FIXBRIDGE_FROM_NAME=FixBridge Support
FIXBRIDGE_EMAIL_LOGO_URL=https://fixbridge.netlify.app/fixbridge-logo-lockup.png
APP_URL=https://fixbridge.netlify.app
GMAIL_USER=...
GMAIL_APP_PASSWORD=...
```
