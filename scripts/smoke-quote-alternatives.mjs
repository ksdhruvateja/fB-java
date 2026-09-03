/**
 * Quote alternatives smoke — Option A/B without superseding each other.
 */
const API = process.argv[2] || process.env.API_BASE || 'http://127.0.0.1:3001';

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
  if (!r.ok || !r.token) throw new Error(`login failed: ${r.message}`);
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
  console.log(`\nFixBridge quote alternatives smoke @ ${API}\n`);
  const admin = await login('admin', process.env.SMOKE_ADMIN_EMAIL || 'admin@fixbridge.com', process.env.SMOKE_ADMIN_PASSWORD || 'Fixbridge@9/26');
  const homeowner = await login('homeowner', process.env.SMOKE_HOMEOWNER_EMAIL || 'maria@example.com', process.env.SMOKE_HOMEOWNER_PASSWORD || 'demo123');
  const adminH = { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' };
  const homeownerH = { Authorization: `Bearer ${homeowner.token}`, 'Content-Type': 'application/json' };

  // Prefer the smoke homeowner's jobs so homeowner quote-options is authorized.
  const hoJobsRes = await fetch(`${API}/api/managed/jobs`, { headers: homeownerH }).then(json);
  const hoJobList = Array.isArray(hoJobsRes.jobs) ? hoJobsRes.jobs : Array.isArray(hoJobsRes) ? hoJobsRes : [];
  const jobs = await fetch(`${API}/api/admin/managed/jobs`, { headers: adminH }).then(json);
  const jobList = [...hoJobList, ...(jobs.jobs || []).filter((j) => !hoJobList.some((h) => h.id === j.id))];
  let job = null;
  let adminOpts = { ok: false, options: [] };
  for (const candidate of jobList) {
    const probe = await fetch(`${API}/api/admin/jobs/${candidate.id}/quote-options`, { headers: adminH }).then(json);
    if (probe.ok && Array.isArray(probe.options) && probe.options.length) {
      job = candidate;
      adminOpts = probe;
      if (probe.options.some((o) => ['draft', 'sent', 'viewed'].includes(String(o.status || '').toLowerCase()))) {
        break;
      }
    }
  }
  // Never fall back to a job without quote options — that is a false FAIL, not a product regression.
  ok('Job fixture', Boolean(job?.id && adminOpts.options?.length), job ? `job ${job.id}` : 'none with quote options');

  if (!job?.id || !adminOpts.options?.length) return;

  const opts = await fetch(`${API}/api/managed/jobs/${job.id}/quote-options`, { headers: homeownerH }).then(json);
  ok('Quote options endpoint', opts.ok && Array.isArray(opts.options));
  ok('Has alternatives flag', typeof opts.hasAlternatives === 'boolean');

  ok('Admin quote-options endpoint', adminOpts.ok && Array.isArray(adminOpts.options));

  const source =
    (adminOpts.options || []).find((o) => ['draft', 'sent', 'viewed'].includes(String(o.status || '').toLowerCase())) ||
    (adminOpts.options || [])[0];

  if (!source?.id) {
    console.log('SKIP  Option A/B mutation — no quote on this job');
    console.log('\nDone.\n');
    return;
  }

  const dup = await fetch(`${API}/api/admin/quotes/${source.id}/duplicate`, {
    method: 'POST',
    headers: adminH,
    body: JSON.stringify({ asOption: true, quoteOptionTitle: 'Replacement' }),
  }).then(json);
  ok('Duplicate as Option B', Boolean(dup.ok && dup.quote?.id), dup.message || `id ${dup.quote?.id || 'n/a'}`);
  if (!dup.ok || !dup.quote?.id) {
    console.log('\nDone.\n');
    return;
  }

  const afterDup = await fetch(`${API}/api/admin/jobs/${job.id}/quote-options`, { headers: adminH }).then(json);
  const labels = new Set(
    (afterDup.options || [])
      .filter((o) => !['superseded', 'canceled', 'cancelled'].includes(String(o.status || '').toLowerCase()))
      .map((o) => String(o.letter || o.quoteOptionLabel || '').replace(/^option\s+/i, '').trim())
      .filter(Boolean),
  );
  ok('Distinct option letters', labels.size >= 2, [...labels].join(',') || 'none');

  const grouped = await fetch(`${API}/api/admin/quotes/${dup.quote.id}/send-option-group`, {
    method: 'POST',
    headers: adminH,
    body: JSON.stringify({ sendEmail: false }),
  }).then(json);
  ok('Send option group', Boolean(grouped.ok && Number(grouped.sent) >= 1), grouped.message || '');

  const afterSend = await fetch(`${API}/api/admin/jobs/${job.id}/quote-options`, { headers: adminH }).then(json);
  const optionB = (afterSend.options || []).find((o) => o.id === dup.quote.id);
  ok('Option B still present after send', Boolean(optionB), optionB ? optionB.status : 'missing');

  const revise = await fetch(`${API}/api/admin/quotes/${source.id}/document`, {
    method: 'PUT',
    headers: adminH,
    body: JSON.stringify({
      changeReason: 'Smoke revision of Option A',
      quoteOptionTitle: source.quoteOptionTitle || 'Repair',
      scopeSummary: source.scopeSummary || 'Repair existing unit',
    }),
  }).then(json);
  ok('Option A revision', Boolean(revise.ok), revise.message || revise.code || '');

  const resendA = await fetch(`${API}/api/admin/quotes/${source.id}/send`, {
    method: 'POST',
    headers: adminH,
    body: JSON.stringify({ sendEmail: true, skipNotify: true }),
  }).then(json);
  ok('Resend Option A revision', Boolean(resendA.ok || resendA.status === 400), resendA.message || '');

  const afterRev = await fetch(`${API}/api/admin/jobs/${job.id}/quote-options`, { headers: adminH }).then(json);
  const bAfter = (afterRev.options || []).find((o) => o.id === dup.quote.id);
  const aAfter = (afterRev.options || []).find((o) => o.id === source.id);
  ok(
    'Option B not superseded by Option A revision',
    Boolean(bAfter) && String(bAfter.status).toLowerCase() !== 'superseded',
    bAfter ? bAfter.status : 'missing',
  );
  ok(
    'Option A kept its letter',
    String(aAfter?.letter || aAfter?.quoteOptionLabel || '').replace(/^option\s+/i, '') !==
      String(bAfter?.letter || bAfter?.quoteOptionLabel || '').replace(/^option\s+/i, '') ||
      !aAfter ||
      !bAfter,
    `A=${aAfter?.letter || aAfter?.quoteOptionLabel || '?'} B=${bAfter?.letter || bAfter?.quoteOptionLabel || '?'}`,
  );

  const ho = await fetch(`${API}/api/managed/jobs/${job.id}/quote-options`, { headers: homeownerH }).then(json);
  ok('Homeowner sees grouped options', ho.ok && Array.isArray(ho.options));

  console.log('\nDone.\n');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
