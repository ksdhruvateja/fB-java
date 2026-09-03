/**
 * In-app notifications + messaging smoke tests.
 * Usage: node --env-file=.env scripts/smoke-inapp-communications.mjs [API_BASE]
 */
import { parseJsonResponse } from './smoke-assessment-poll.mjs';
import { resolveSmokeApiBase } from './smoke-api-base.mjs';

const API = resolveSmokeApiBase();
const stamp = Date.now();

let passed = 0;
let failed = 0;

function ok(label, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function login(role, email, password) {
  const res = await fetch(`${API}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, email, password }),
  }).then(parseJsonResponse);
  return res.token ? { Authorization: `Bearer ${res.token}`, 'Content-Type': 'application/json' } : null;
}

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function signupContractor(ts) {
  const email = `comms.ct.${ts}@example.com`;
  const password = 'SmokePass123!';
  const signup = await fetch(`${API}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'contractor',
      name: 'Comms Smoke Co',
      email,
      password,
      trade: 'Plumbing',
      contractorApplication: {
        legalBusinessName: 'Comms Smoke LLC',
        ein: '12-3456789',
        businessType: 'LLC',
        contactEmail: email,
        contactPhone: '555-0100',
        primaryServices: ['Plumbing'],
        serviceZips: '11201',
        companySize: 'solo',
        generalLiability: 'yes',
        workersComp: 'no',
        agreeTerms: true,
        agreeContractorAgreementV4: true,
        agreeAccurate: true,
      },
    }),
  }).then(parseJsonResponse);
  return { signup, email, password };
}

async function main() {
  console.log(`\nFixBridge in-app communications @ ${API}\n`);

  const adminEmail = process.env.PRIMARY_ADMIN_EMAIL || 'admin@fixbridge.com';
  const adminPass = process.env.PRIMARY_ADMIN_PASSWORD || process.env.SMOKE_ADMIN_PASSWORD;
  const hoEmail = process.env.SMOKE_HOMEOWNER_EMAIL || 'maria@example.com';
  const hoPass = process.env.SMOKE_HOMEOWNER_PASSWORD || 'demo123';

  const ho = await login('homeowner', hoEmail, hoPass);
  const ctSignup = await signupContractor(stamp);
  const ct = ctSignup.signup?.token
    ? { Authorization: `Bearer ${ctSignup.signup.token}`, 'Content-Type': 'application/json' }
    : await login('contractor', ctSignup.email, ctSignup.password);
  const admin = adminPass ? await login('admin', adminEmail, adminPass) : null;

  ok('homeowner login', Boolean(ho));
  ok('contractor login', Boolean(ct));
  ok('admin login', Boolean(admin), admin ? '' : 'set PRIMARY_ADMIN_PASSWORD');

  if (!ho || !ct || !admin) {
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
  }

  console.log('\nIN-APP NOTIFICATIONS\n');

  const unread0 = await fetch(`${API}/api/notifications/unread-count`, { headers: ho }).then(parseJsonResponse);
  ok('unread count endpoint', unread0.ok === true && typeof unread0.count === 'number');

  // HOMEOWNER ↔ ADMIN
  console.log('\nHOMEOWNER ↔ ADMIN\n');

  const hoConv = await fetch(`${API}/api/messages/conversations`, {
    method: 'POST',
    headers: ho,
    body: JSON.stringify({ subject: `Smoke ${stamp}`, body: 'When will my plumber arrive?' }),
  }).then(parseJsonResponse);
  ok('homeowner create conversation', hoConv.ok && hoConv.conversation?.id);
  const hoConvId = hoConv.conversation?.id;

  const hoSend = await fetch(`${API}/api/messages/conversations/${hoConvId}/messages`, {
    method: 'POST',
    headers: ho,
    body: JSON.stringify({
      body: '<script>alert(1)</script>Hello FixBridge',
      attachments: [{ fileName: 'leak.png', mimeType: 'image/png', data: TINY_PNG }],
    }),
  }).then(parseJsonResponse);
  ok('homeowner send message + image', hoSend.ok && hoSend.message?.id);
  ok('XSS stored as text', hoSend.message?.body && !hoSend.message?.body?.includes('<script>'));

  const adminUnread = await fetch(`${API}/api/messages/unread-count`, { headers: admin }).then(parseJsonResponse);
  ok('admin unread messages', (adminUnread.count || 0) >= 1, `count=${adminUnread.count}`);

  await fetch(`${API}/api/messages/conversations/${hoConvId}/read`, { method: 'POST', headers: admin, body: '{}' });
  const adminReply = await fetch(`${API}/api/messages/conversations/${hoConvId}/messages`, {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({ body: 'Your technician is expected between 2–4 PM.' }),
  }).then(parseJsonResponse);
  ok('admin reply', adminReply.ok);
  ok('admin display name', adminReply.message?.senderDisplayName === 'FixBridge Support');

  const hoUnreadAfter = await fetch(`${API}/api/messages/unread-count`, { headers: ho }).then(parseJsonResponse);
  ok('homeowner unread after admin reply', (hoUnreadAfter.count || 0) >= 1);

  const hoNotif = await fetch(`${API}/api/notifications/unread-count`, { headers: ho }).then(parseJsonResponse);
  ok('homeowner notification for admin message', (hoNotif.count || 0) >= 1);

  await fetch(`${API}/api/messages/conversations/${hoConvId}/read`, { method: 'POST', headers: ho, body: '{}' });
  const hoUnreadCleared = await fetch(`${API}/api/messages/unread-count`, { headers: ho }).then(parseJsonResponse);
  ok('homeowner read clears unread', hoUnreadCleared.count === 0);

  // CONTRACTOR ↔ ADMIN
  console.log('\nCONTRACTOR ↔ ADMIN\n');

  const ctConv = await fetch(`${API}/api/messages/conversations`, {
    method: 'POST',
    headers: ct,
    body: JSON.stringify({ subject: 'Payout question', body: 'Need clarification on payout timing.' }),
  }).then(parseJsonResponse);
  ok('contractor create conversation', ctConv.ok && ctConv.conversation?.id);
  const ctConvId = ctConv.conversation?.id;

  const ctUnreadAdmin = await fetch(`${API}/api/messages/unread-count`, { headers: admin }).then(parseJsonResponse);
  ok('admin sees contractor message', (ctUnreadAdmin.count || 0) >= 1);

  // IDOR
  console.log('\nSECURITY\n');

  const ct2 = await signupContractor(stamp + 1);
  const ct2H = ct2.signup?.token
    ? { Authorization: `Bearer ${ct2.signup.token}`, 'Content-Type': 'application/json' }
    : await login('contractor', ct2.email, ct2.password);
  ok('second contractor login', Boolean(ct2H));

  const idor = await fetch(`${API}/api/messages/conversations/${hoConvId}`, { headers: ct2H || {} }).then(parseJsonResponse);
  ok('IDOR cross-user blocked', idor.ok === false || String(idor.message || '').includes('Not allowed'));

  const anon = await fetch(`${API}/api/messages/conversations`).then((r) => r.status);
  ok('anonymous rejected', anon === 401);

  const badFile = await fetch(`${API}/api/messages/conversations/${ctConvId}/messages`, {
    method: 'POST',
    headers: ct,
    body: JSON.stringify({
      body: 'bad file',
      attachments: [{ fileName: 'evil.exe', mimeType: 'application/x-msdownload', data: 'AAAA' }],
    }),
  }).then(parseJsonResponse);
  ok('invalid attachment rejected', badFile.ok === false);

  const attId = hoSend.message?.attachments?.[0]?.id;
  if (attId && ct2H) {
    const attHo2 = await fetch(`${API}/api/messages/attachments/${attId}`, { headers: ct2H });
    ok('attachment IDOR blocked', attHo2.status === 403 || attHo2.status === 404);
    const attAdmin = await fetch(`${API}/api/messages/attachments/${attId}`, { headers: admin });
    ok('admin attachment access', attAdmin.status === 200);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
