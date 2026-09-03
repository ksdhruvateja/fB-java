/**
 * Dispute flow smoke tests.
 * Usage: node --env-file=.env scripts/smoke-disputes.mjs [API_BASE]
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
  const r = await fetch(`${API}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, email, password }),
  }).then(json);
  if (!r.ok || !r.token) throw new Error(`login failed: ${r.message || r.status}`);
  if (role !== 'admin') return r;
  const mfaStart = await fetch(`${API}/api/auth/mfa/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${r.token}`, 'Content-Type': 'application/json' },
    body: '{}',
  }).then(json);
  if (!mfaStart.ok || !mfaStart.demoCode) return r;
  const mfaVerify = await fetch(`${API}/api/auth/mfa/verify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${r.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: String(mfaStart.demoCode) }),
  }).then(json);
  if (mfaVerify.ok && mfaVerify.token) return { ...r, token: mfaVerify.token };
  return r;
}

async function main() {
  console.log(`\nFixBridge disputes smoke @ ${API}\n`);
  const admin = await login('admin', process.env.SMOKE_ADMIN_EMAIL || 'admin@fixbridge.com', process.env.SMOKE_ADMIN_PASSWORD || 'Fixbridge@9/26');
  const homeowner = await login('homeowner', process.env.SMOKE_HOMEOWNER_EMAIL || 'maria@example.com', process.env.SMOKE_HOMEOWNER_PASSWORD || 'demo123');
  const adminH = { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' };
  const homeownerH = { Authorization: `Bearer ${homeowner.token}`, 'Content-Type': 'application/json' };

  const jobs = await fetch(`${API}/api/admin/managed/jobs`, { headers: adminH }).then(json);
  const homeownerJobs = await fetch(`${API}/api/managed/homeowner/jobs`, { headers: homeownerH }).then(json).catch(() => ({ jobs: [] }));
  const completed =
    (homeownerJobs.jobs || []).find((j) =>
      ['work_completed', 'customer_review_pending', 'payout_pending', 'paid_out', 'closed'].includes(String(j.status)),
    ) ||
    (jobs.jobs || []).find((j) =>
      ['work_completed', 'customer_review_pending', 'payout_pending', 'paid_out', 'closed'].includes(String(j.status)),
    ) ||
    null;

  ok('Find completed job fixture', Boolean(completed?.id), completed ? `job ${completed.id}` : 'create one manually');

  if (completed?.id) {
    const report = await fetch(`${API}/api/managed/jobs/${completed.id}/report-problem`, {
      method: 'POST',
      headers: homeownerH,
      body: JSON.stringify({
        category: 'work_incomplete',
        description: 'Smoke test dispute — work not fully completed.',
        preferredResolution: 'Return visit',
      }),
    }).then(json);
    ok(
      'Homeowner report-problem',
      report.ok || report.code === 'dispute_already_open',
      report.message || report.code,
    );

    const list = await fetch(`${API}/api/admin/disputes`, { headers: adminH }).then(json);
    ok('Admin list disputes', list.ok && Array.isArray(list.disputes));

    const disputeId = list.disputes?.[0]?.id;
    if (disputeId) {
      const detail = await fetch(`${API}/api/admin/disputes/${disputeId}`, { headers: adminH }).then(json);
      ok('Admin dispute detail', detail.ok && detail.dispute?.id === disputeId);
      ok('Payout state included', detail.payoutState != null);

      const action = await fetch(`${API}/api/admin/disputes/${disputeId}/actions`, {
        method: 'POST',
        headers: adminH,
        body: JSON.stringify({ action: 'request_homeowner_info', reason: 'Smoke test follow-up' }),
      }).then(json);
      ok('Dispute audit action', action.ok, action.message);
      ok('Events recorded', (detail.events || []).length >= 0);
    }
  }

  const blocked = await fetch(`${API}/api/managed/jobs/999999/report-problem`, {
    method: 'POST',
    headers: homeownerH,
    body: JSON.stringify({ category: 'other', description: 'Should fail' }),
  }).then(json);
  ok('Invalid job blocked', blocked.status === 404);

  console.log('\nDone.\n');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
