/**
 * Security smoke: IDOR + guest account hardening + partner auth.
 * Usage: node --env-file=.env scripts/smoke-security-idor.mjs
 */
import { loginAdminWithMfa } from './smoke-auth.mjs';

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
  if (!r.ok || !r.token) throw new Error(`login failed for ${email}: ${r.message || r.status}`);
  return r;
}

async function main() {
  console.log(`\nFixBridge security IDOR smoke @ ${API}\n`);

  const maria = await login('homeowner', 'maria@example.com', 'demo123');
  const admin = await loginAdminWithMfa();
  const homeH = { Authorization: `Bearer ${maria.token}`, 'Content-Type': 'application/json' };
  const adminH = { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' };

  // Create a job as Maria so we have a known id, then probe as unauthorized peer.
  const created = await fetch(`${API}/api/managed/jobs`, {
    method: 'POST',
    headers: homeH,
    body: JSON.stringify({
      category: 'Plumbing',
      title: 'IDOR probe job',
      description: 'Security smoke job for ownership checks.',
      contactName: 'Maria Santos',
      contactPhone: '555-0100',
      fullAddress: '12 Oak St',
      cityStateZip: 'Brooklyn, NY 11201',
    }),
  }).then(json);
  ok('create probe job', created.ok && created.job?.id, created.message);
  const jobId = created.job?.id;

  // Second homeowner (or create ephemeral if signup works)
  let peerToken = null;
  const peerEmail = `idor.peer.${Date.now()}@example.com`;
  const signup = await fetch(`${API}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'homeowner',
      name: 'IDOR Peer',
      email: peerEmail,
      password: 'PeerPass123!',
      consents: { ACCOUNT_TERMS: true, PRIVACY_POLICY: true },
    }),
  }).then(json);
  if (signup.ok && signup.token) {
    peerToken = signup.token;
  } else {
    // Fallback: try signin if signup path differs
    const alt = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'homeowner',
        name: 'IDOR Peer',
        email: peerEmail,
        password: 'PeerPass123!',
        consents: { ACCOUNT_TERMS: true, PRIVACY_POLICY: true },
      }),
    }).then(json);
    peerToken = alt.token;
  }
  ok('peer homeowner session', Boolean(peerToken), signup.message || peerEmail);
  const peerH = { Authorization: `Bearer ${peerToken}`, 'Content-Type': 'application/json' };

  const coPeer = await fetch(`${API}/api/managed/jobs/${jobId}/change-orders`, { headers: peerH }).then(json);
  ok('peer blocked from change-orders', coPeer.status === 403, `status=${coPeer.status}`);

  const schedPeer = await fetch(`${API}/api/managed/jobs/${jobId}/payment-schedule`, { headers: peerH }).then(json);
  ok('peer blocked from payment-schedule', schedPeer.status === 403, `status=${schedPeer.status}`);

  const coOwner = await fetch(`${API}/api/managed/jobs/${jobId}/change-orders`, { headers: homeH }).then(json);
  ok('owner can list change-orders', coOwner.ok === true, coOwner.message);

  const schedOwner = await fetch(`${API}/api/managed/jobs/${jobId}/payment-schedule`, { headers: homeH }).then(json);
  ok('owner can list payment-schedule', schedOwner.ok === true, schedOwner.message);

  // Property units + Property Passport IDOR
  const props = await fetch(`${API}/api/properties`, { headers: homeH }).then(json);
  const propId = (props.properties || props || [])[0]?.id || props.properties?.[0]?.id;
  if (propId) {
    const unitsPeer = await fetch(`${API}/api/properties/${propId}/units`, { headers: peerH }).then(json);
    ok('peer blocked from property units', unitsPeer.status === 403, `status=${unitsPeer.status}`);

    const healthPeer = await fetch(`${API}/api/properties/${propId}/health`, {
      method: 'PUT',
      headers: peerH,
      body: JSON.stringify({ healthProfile: { systems: [], maintenance: [] } }),
    }).then(json);
    ok('peer blocked from property health update', healthPeer.status === 404, `status=${healthPeer.status}`);

    const healthOwner = await fetch(`${API}/api/properties/${propId}/health`, {
      method: 'PUT',
      headers: homeH,
      body: JSON.stringify({
        healthProfile: {
          systems: [],
          maintenance: [],
        },
      }),
    }).then(json);
    ok('owner can update property health', healthOwner.ok === true, healthOwner.message);

    const docPeer = await fetch(`${API}/api/properties/${propId}/documents`, {
      method: 'POST',
      headers: peerH,
      body: JSON.stringify({ dataUrl: 'data:text/plain;base64,dGVzdA==', category: 'other' }),
    }).then(json);
    ok('peer blocked from property document upload', docPeer.status === 404 || docPeer.status === 403, `status=${docPeer.status}`);
  } else {
    ok('property IDOR checks skipped (no property)', true);
  }

  // Guest public job must not use password123 / must not attach to existing email
  const guestExisting = await fetch(`${API}/api/public/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'maria@example.com',
      contactName: 'Maria',
      contactPhone: '555-0100',
      category: 'Plumbing',
      description: 'Should require sign-in for existing account',
      streetAddress: '12 Oak St',
      city: 'Brooklyn',
      state: 'NY',
      zip: '11201',
      consents: { ACCOUNT_TERMS: true, PRIVACY_POLICY: true },
    }),
  }).then(json);
  ok(
    'guest cannot hijack existing email',
    guestExisting.status === 409 || guestExisting.code === 'ACCOUNT_EXISTS',
    `status=${guestExisting.status} code=${guestExisting.code}`
  );

  const guestEmail = `guest.secure.${Date.now()}@example.com`;
  const guestNew = await fetch(`${API}/api/public/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: guestEmail,
      contactName: 'Guest Secure',
      contactPhone: '555-0199',
      category: 'Plumbing',
      description: 'New guest with random password should get session token',
      streetAddress: '99 Test Ave',
      city: 'Brooklyn',
      state: 'NY',
      zip: '11201',
      consents: { ACCOUNT_TERMS: true, PRIVACY_POLICY: true },
    }),
  }).then(json);
  ok('guest new account creates session', guestNew.ok && guestNew.token, guestNew.message);

  const weakLogin = await fetch(`${API}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'homeowner', email: guestEmail, password: 'password123' }),
  }).then(json);
  ok('guest password123 does not work', weakLogin.ok !== true && (weakLogin.status === 401 || weakLogin.status === 400), `status=${weakLogin.status}`);

  // Partner referrals require auth
  const openRef = await fetch(`${API}/api/partner/DEMO/referrals`).then(json);
  ok('partner referrals unauthenticated blocked', openRef.status === 401, `status=${openRef.status}`);

  // Admin still works for change-orders
  const coAdmin = await fetch(`${API}/api/managed/jobs/${jobId}/change-orders`, { headers: adminH }).then(json);
  ok('admin can list change-orders', coAdmin.ok === true, coAdmin.message);

  console.log(process.exitCode ? '\nSECURITY_SMOKE_FAILED\n' : '\nSECURITY_SMOKE_OK\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
