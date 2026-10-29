/**
 * Smoke: service reminder eligibility + processor behavior
 *
 * Unit tests run without API. Integration tests need:
 *   npm run dev:api
 *   SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD (or SERVICE_REMINDER_CRON_SECRET)
 *
 * Run: npm run smoke:service-reminders
 */
import {
  isReminderDue,
  serviceAtFromJob,
  TERMINAL_JOB_STATUSES,
} from '../api/service-reminders.js';
import {
  localDateTimeToUtc,
  serviceAtFromLocalSlot,
  isValidIanaTimezone,
} from '../api/property-timezone.js';

const API = (process.env.API_BASE || 'http://localhost:3001').replace(/\/$/, '');

async function req(path, { token, method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { ok: false, message: text };
  }
  return { status: res.status, json };
}

function pass(label) {
  console.log(`PASS  ${label}`);
}
function fail(label, detail) {
  console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  process.exitCode = 1;
}
function skip(label, detail) {
  console.log(`SKIP  ${detail ? `${label} — ${detail}` : label}`);
}

function assert(cond, label, detail) {
  if (cond) pass(label);
  else fail(label, detail);
}

function unitTests() {
  const now = new Date('2026-08-28T12:00:00.000Z');

  const farFuture = new Date(now.getTime() + 48 * 3600 * 1000);
  assert(
    !isReminderDue({ status: 'pending', service_at: farFuture, reminder_lead_hours: 24 }, now),
    'normal 24h — not due when >24h away'
  );

  const shortNotice = new Date(now.getTime() + 6 * 3600 * 1000);
  assert(
    isReminderDue({ status: 'pending', service_at: shortNotice, reminder_lead_hours: 24 }, now),
    'short notice — due immediately inside lead window'
  );

  const past = new Date(now.getTime() - 3600 * 1000);
  assert(
    !isReminderDue({ status: 'pending', service_at: past, reminder_lead_hours: 24 }, now),
    'past service — never due'
  );

  assert(!isReminderDue({ status: 'cancelled', service_at: shortNotice, reminder_lead_hours: 24 }, now), 'cancelled — not due');

  const jobAt = serviceAtFromJob({ preferred_date: '2026-09-01', preferred_time_slot: '9-11' });
  assert(jobAt && jobAt.getUTCHours() === 9, 'serviceAtFromJob uses UTC slot hour');

  assert(TERMINAL_JOB_STATUSES.has('canceled'), 'terminal statuses include canceled');

  const nyMorning = localDateTimeToUtc('2026-03-08', 10, 0, 'America/New_York');
  const nyFall = localDateTimeToUtc('2026-11-01', 10, 0, 'America/New_York');
  assert(nyMorning && nyFall && nyMorning.getTime() !== nyFall.getTime(), 'DST — EDT vs EST offset differs');

  const chicago = serviceAtFromLocalSlot('2026-07-15', '9-11', 'America/Chicago');
  assert(chicago && isValidIanaTimezone('America/Chicago'), 'Chicago local slot converts to UTC');

  assert(isValidIanaTimezone('America/New_York'), 'IANA timezone validation');
  assert(!isValidIanaTimezone('EST'), 'rejects non-IANA EST abbreviation');
}

async function login(email, password, role = 'admin') {
  const r = await req('/api/auth/login', { method: 'POST', body: { email, password, role } });
  return r.json?.token || null;
}

async function integrationTests() {
  let alive = false;
  try {
    const h = await fetch(`${API}/api/health`);
    alive = h.ok;
  } catch {
    alive = false;
  }
  if (!alive) {
    skip('integration', 'API not running — unit tests only');
    return;
  }
  pass(`API reachable at ${API}`);

  const health = await req('/api/health');
  assert(health.json?.reminders != null, 'health exposes reminder scheduler status');
  assert(health.json?.ok !== false, 'health db connectivity');

  const cronSecret = process.env.SERVICE_REMINDER_CRON_SECRET?.trim();
  const adminEmail = process.env.SMOKE_ADMIN_EMAIL;
  const adminPassword = process.env.SMOKE_ADMIN_PASSWORD;

  if (cronSecret) {
    const proc = await req('/api/internal/service-reminders/process', {
      method: 'POST',
      headers: { 'X-Service-Reminder-Secret': cronSecret },
    });
    assert(proc.json?.ok, 'cron secret processor', proc.json?.message);
  } else if (adminEmail && adminPassword) {
    const token = await login(adminEmail, adminPassword);
    if (!token) {
      skip('admin processor', 'admin login failed');
    } else {
      const proc = await req('/api/admin/service-reminders/process', { token, method: 'POST' });
      assert(proc.json?.ok, 'admin reminder processor', proc.json?.message);
      const status = await req('/api/admin/service-reminders/status', { token });
      assert(status.json?.deliveryConfigured, 'admin reminder status');
    }
  } else {
    skip('processor integration', 'set SERVICE_REMINDER_CRON_SECRET or SMOKE_ADMIN_EMAIL/PASSWORD');
  }
}

async function main() {
  console.log('Service reminder smoke\n');
  unitTests();
  await integrationTests();
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
