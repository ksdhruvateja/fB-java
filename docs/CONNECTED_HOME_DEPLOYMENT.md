# FixBridge Connected Home — Production Deployment

## Architecture

- **Frontend:** Netlify static (`dist/`)
- **API:** Netlify serverless function `netlify/functions/api.js` (Express via serverless-http)
- **Database:** Neon Postgres (`NEON_DATABASE_URL`)
- **Reminders:** Netlify scheduled function `process-service-reminders` (every 15 minutes)

Netlify serverless **cannot** rely on in-process `setInterval` polling. Use the scheduled function or an external cron.

## Required backend environment

| Variable | Required | Notes |
|----------|----------|-------|
| `NEON_DATABASE_URL` | Yes (prod) | Persistent data |
| `SESSION_SECRET` | Yes (prod) | Auth |
| `APP_URL` | Yes (prod) | Email links |
| `SERVICE_REMINDER_CRON_SECRET` | Optional | For `POST /api/internal/service-reminders/process` from external cron |
| `ENABLE_SERVICE_REMINDER_POLL` | Local only | Persistent Node host (`server.js`); **not** for Netlify |
| `SERVICE_REMINDER_POLL_MS` | Optional | Default `900000` (15 min) when poll enabled |
| `ALLOW_REMINDER_TEST_CLOCK` | Test only | Allows `asOf` override in `processDueServiceReminders` |

## Scheduler modes

### Recommended (Netlify production)

Scheduled function in `netlify.toml`:

```toml
[functions."process-service-reminders"]
  schedule = "*/15 * * * *"
```

Invokes `processDueServiceReminders()` directly — no HTTP secret required.

### Alternative: external cron

```http
POST /api/internal/service-reminders/process
X-Service-Reminder-Secret: <SERVICE_REMINDER_CRON_SECRET>
```

### Local development

```bash
ENABLE_SERVICE_REMINDER_POLL=true npm run dev:api
```

### Manual (admin)

```http
POST /api/admin/service-reminders/process
Authorization: Bearer <admin JWT>
```

Requires `homecare.manage` permission.

## Reminder behavior

- Default lead time: **24 hours** (Admin → HomeCare → Recurring)
- **Short notice:** if a job is scheduled inside the lead window, one reminder is sent on the next processor run
- **Past / cancelled / completed jobs:** never reminded
- **Reschedule:** material time change resets eligibility (`schedule_version`); one reminder for the new time
- **Concurrency:** `FOR UPDATE SKIP LOCKED` claim per row
- **Channels:** `in_app_sent_at` and `email_sent_at` are authoritative; partial failure retries only the failed channel

## Timezone

Each property stores an IANA timezone (`America/New_York`, etc.) resolved via Google Time Zone API when coordinates are available from geocoding. Reminder `service_at` is stored as UTC. Jobs on properties without timezone use legacy UTC-slot behavior (logged).

Optional env fallback: `DEFAULT_PROPERTY_TIMEZONE` (only when geocode lookup fails).

## Email

Uses existing `sendEmailSafe` / notification email infrastructure. Configure Gmail or SMTP per main FixBridge deployment docs.

## Health check

```http
GET /api/health
```

Returns: API status, DB connectivity, build id, safe reminder scheduler metadata (no secrets).

## HomeCare configuration

Admin panel configures:

- Recurring reminders on/off
- Reminder lead hours
- Pro entitlements per feature

## Test commands

```bash
npm run build
npm run smoke:service-reminders
npm run smoke:home-memory
npm run smoke:connected-home-e2e
npm run smoke:entitlements
npm run smoke:entitlement-matrix
npm run smoke:homecare-config
```

### Smoke credentials (never commit)

```bash
SMOKE_HOMEOWNER_EMAIL=
SMOKE_HOMEOWNER_PASSWORD=
SMOKE_OTHER_EMAIL=
SMOKE_ADMIN_EMAIL=
SMOKE_ADMIN_PASSWORD=
SMOKE_CONTRACTOR_EMAIL=
SMOKE_CONTRACTOR_PASSWORD=
API_BASE=http://localhost:3001
```

## Production readiness checklist

- [ ] `npm run build` passes
- [ ] Neon connected in production
- [ ] Scheduled function deployed (`process-service-reminders`)
- [ ] Email provider configured and verified
- [ ] Smoke tests pass with real credentials
- [ ] `GET /api/health` shows `database: neon` and reminder status
