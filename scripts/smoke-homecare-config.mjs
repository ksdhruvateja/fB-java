/**
 * HomeCare admin configuration smoke tests.
 * Usage: node --env-file=.env scripts/smoke-homecare-config.mjs
 */
const API = process.env.API_BASE || 'http://127.0.0.1:3001';

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
  const r = await fetch(`${API}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, email, password }),
  }).then(json);
  if (!r.ok || !r.token) throw new Error(`login failed: ${email} ${r.message}`);
  return r;
}

async function main() {
  console.log(`\nHomeCare config smoke @ ${API}\n`);
  const maria = await login('homeowner', 'maria@example.com', 'demo123');
  const admin = await login('admin', 'ksdt2702@gmail.com', 'admin123');
  const freeH = { Authorization: `Bearer ${maria.token}`, 'Content-Type': 'application/json' };
  const adminH = { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' };

  const publicCfg = await fetch(`${API}/api/homecare/config`).then(json);
  ok('public config loads', publicCfg.ok && publicCfg.config?.features, `status=${publicCfg.status}`);

  const adminGet = await fetch(`${API}/api/admin/homecare/settings`, { headers: adminH }).then(json);
  ok('admin settings GET', adminGet.ok && adminGet.config?.features, `status=${adminGet.status}`);

  const origFee = adminGet.pricing?.standardCoordinationFee ?? 125;
  const newFee = origFee === 145 ? 146 : 145;
  const feeTry = await fetch(`${API}/api/admin/homecare/pricing`, {
    method: 'PATCH',
    headers: adminH,
    body: JSON.stringify({ standardCoordinationFee: newFee, homecareProCoordinationFee: 99, confirmImpact: false }),
  }).then(json);
  ok('pricing requires confirmation', feeTry.code === 'CONFIRMATION_REQUIRED', `status=${feeTry.status}`);

  await fetch(`${API}/api/admin/homecare/pricing`, {
    method: 'PATCH',
    headers: adminH,
    body: JSON.stringify({ standardCoordinationFee: newFee, homecareProCoordinationFee: 99, confirmImpact: true }),
  }).then(json);

  const disableMaint = {
    ...adminGet.config,
    features: {
      ...adminGet.config.features,
      maintenance_calendar: {
        ...adminGet.config.features.maintenance_calendar,
        enabled: false,
      },
    },
  };
  await fetch(`${API}/api/admin/homecare/settings`, {
    method: 'PATCH',
    headers: adminH,
    body: JSON.stringify({ config: disableMaint, confirmImpact: true }),
  }).then(json);

  await fetch(`${API}/api/admin/subscriptions/update`, {
    method: 'POST',
    headers: adminH,
    body: JSON.stringify({ homeownerUserId: maria.user?.id, planCode: 'homecare_pro', staffName: 'Config Smoke' }),
  }).then(json);

  const pro = await login('homeowner', 'maria@example.com', 'demo123');
  const proH = { Authorization: `Bearer ${pro.token}`, 'Content-Type': 'application/json' };
  const props = await fetch(`${API}/api/properties`, { headers: proH }).then(json);
  const pid = props.properties?.[0]?.id;

  const maint = await fetch(`${API}/api/properties/${pid}/maintenance`, {
    method: 'PUT',
    headers: proH,
    body: JSON.stringify({ maintenance: [{ label: 'Test', dueDate: '2026-01-01' }] }),
  }).then(json);
  ok('disabled maintenance → FEATURE_DISABLED', maint.code === 'FEATURE_DISABLED', `status=${maint.status}`);

  const enableMaint = {
    ...disableMaint,
    features: {
      ...disableMaint.features,
      maintenance_calendar: { ...disableMaint.features.maintenance_calendar, enabled: true },
    },
  };
  await fetch(`${API}/api/admin/homecare/settings`, {
    method: 'PATCH',
    headers: adminH,
    body: JSON.stringify({ config: enableMaint, confirmImpact: true }),
  }).then(json);

  const maint2 = await fetch(`${API}/api/properties/${pid}/maintenance`, {
    method: 'PUT',
    headers: proH,
    body: JSON.stringify({ maintenance: [{ label: 'Test', dueDate: '2026-01-01' }] }),
  }).then(json);
  ok('re-enabled maintenance allowed for Pro', maint2.status !== 403 || maint2.code !== 'FEATURE_DISABLED', `status=${maint2.status}`);

  const contractor = await login('contractor', 'contractor@example.com', 'demo123');
  const denied = await fetch(`${API}/api/admin/homecare/settings`, {
    headers: { Authorization: `Bearer ${contractor.token}` },
  }).then(json);
  ok('contractor cannot read admin settings', denied.status === 401 || denied.status === 403, `status=${denied.status}`);

  await fetch(`${API}/api/admin/homecare/pricing`, {
    method: 'PATCH',
    headers: adminH,
    body: JSON.stringify({ standardCoordinationFee: origFee, homecareProCoordinationFee: 99, confirmImpact: true }),
  }).then(json);

  await fetch(`${API}/api/admin/subscriptions/update`, {
    method: 'POST',
    headers: adminH,
    body: JSON.stringify({ homeownerUserId: maria.user?.id, planCode: 'free', staffName: 'Config Smoke' }),
  }).then(json);

  console.log('\nDone.\n');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
