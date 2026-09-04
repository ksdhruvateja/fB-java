/**
 * Availability API smoke tests.
 */
import { resolveSmokeApiBase } from './smoke-api-base.mjs';

const API = resolveSmokeApiBase();

async function json(res) {
  const text = await res.text();
  try {
    return { status: res.status, ...(JSON.parse(text) || {}) };
  } catch {
    return { status: res.status, raw: text };
  }
}

function ok(label, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!pass) process.exitCode = 1;
}

async function login(role, email, password) {
  let last = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(`${API}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, email, password }),
    }).then(json);
    last = r;
    if (r.status === 429) {
      await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
      continue;
    }
    if (!r.ok || !r.token) throw new Error(`login failed: ${r.message}`);
    if (role === 'admin') {
      const mfaStart = await fetch(`${API}/api/auth/mfa/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${r.token}`, 'Content-Type': 'application/json' },
        body: '{}',
      }).then(json);
      if (mfaStart.ok && mfaStart.demoCode) {
        const mfaVerify = await fetch(`${API}/api/auth/mfa/verify`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${r.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: String(mfaStart.demoCode) }),
        }).then(json);
        if (mfaVerify.ok && mfaVerify.token) return { ...r, token: mfaVerify.token };
      }
    }
    return r;
  }
  throw new Error(`login failed: ${last?.message || 'rate limited'}`);
}

async function main() {
  console.log(`\nFixBridge availability smoke @ ${API}\n`);
  const contractorEmail = process.env.SMOKE_CONTRACTOR_EMAIL || process.env.TEST_CONTRACTOR_EMAIL;
  const contractorPass =
    process.env.SMOKE_CONTRACTOR_PASSWORD || process.env.TEST_CONTRACTOR_PASSWORD;
  const adminEmail =
    process.env.SMOKE_ADMIN_EMAIL || process.env.TEST_ADMIN_EMAIL || 'admin@fixbridge.us';
  const adminPass =
    process.env.SMOKE_ADMIN_PASSWORD ||
    process.env.TEST_ADMIN_PASSWORD ||
    process.env.PRIMARY_ADMIN_PASSWORD;
  if (!contractorEmail || !contractorPass) {
    throw new Error('Set SMOKE_CONTRACTOR_EMAIL/PASSWORD or TEST_CONTRACTOR_* in .env');
  }
  if (!adminPass) {
    throw new Error('Set SMOKE_ADMIN_PASSWORD or TEST_ADMIN_PASSWORD in .env');
  }
  const contractor = await login('contractor', contractorEmail, contractorPass);
  const admin = await login('admin', adminEmail, adminPass);
  const cH = { Authorization: `Bearer ${contractor.token}`, 'Content-Type': 'application/json' };
  const aH = { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' };

  const get0 = await fetch(`${API}/api/contractor/availability`, { headers: cH }).then(json);
  ok('GET contractor availability', get0.ok && get0.availability);

  const put = await fetch(`${API}/api/contractor/availability`, {
    method: 'PUT',
    headers: cH,
    body: JSON.stringify({
      timezone: 'America/New_York',
      sameDayAvailable: true,
      emergencyAvailable: false,
      workingDays: {
        mon: { enabled: true, start: '08:00', end: '17:00' },
        tue: { enabled: true, start: '08:00', end: '17:00' },
        wed: { enabled: true, start: '08:00', end: '17:00' },
        thu: { enabled: true, start: '08:00', end: '17:00' },
        fri: { enabled: true, start: '08:00', end: '17:00' },
        sat: { enabled: false, start: '09:00', end: '13:00' },
        sun: { enabled: false, start: '09:00', end: '13:00' },
      },
    }),
  }).then(json);
  ok('PUT contractor availability', put.ok, put.message);

  const dispatch = await fetch(
    `${API}/api/admin/dispatch/availability?contractorUserId=${contractor.user?.id || contractor.id}`,
    { headers: aH },
  ).then(json);
  ok('Admin dispatch availability', dispatch.ok && dispatch.contractor?.label, dispatch.contractor?.label);

  const emp = await fetch(`${API}/api/contractor/employees`, { headers: cH }).then(json);
  const employeeId = emp.employees?.[0]?.id;
  if (employeeId) {
    const ePut = await fetch(`${API}/api/contractor/employees/${employeeId}/availability`, {
      method: 'PUT',
      headers: cH,
      body: JSON.stringify({ temporaryUnavailable: false, unavailableDates: [] }),
    }).then(json);
    ok('PUT employee availability', ePut.ok, ePut.message);
  } else {
    ok('PUT employee availability', true, 'skipped — no employees');
  }

  console.log('\nDone.\n');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
