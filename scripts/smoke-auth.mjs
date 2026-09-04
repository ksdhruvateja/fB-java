/**
 * Shared smoke auth — uses TEST_ / SMOKE_ env credentials (never hardcode secrets).
 */
import { resolveSmokeApiBase } from './smoke-api-base.mjs';

const API = resolveSmokeApiBase();

export async function json(res) {
  const text = await res.text();
  try {
    return { status: res.status, ...(JSON.parse(text) || {}) };
  } catch {
    return { status: res.status, raw: text };
  }
}

export function authH(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export function login(role, email, password) {
  return (async () => {
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
      if (!r.ok || !r.token) throw new Error(r.message || 'login failed');
      return r;
    }
    throw new Error(last?.message || 'login failed (rate limited)');
  })();
}

function envCred(keys) {
  for (const key of keys) {
    const v = String(process.env[key] || '').trim();
    if (v) return v;
  }
  return '';
}

export async function loginAdminWithMfa() {
  const email =
    envCred(['SMOKE_ADMIN_EMAIL', 'TEST_ADMIN_EMAIL', 'PRIMARY_ADMIN_EMAIL']) ||
    'admin@fixbridge.us';
  const password = envCred([
    'SMOKE_ADMIN_PASSWORD',
    'TEST_ADMIN_PASSWORD',
    'PRIMARY_ADMIN_PASSWORD',
  ]);
  if (!password) throw new Error('Set SMOKE_ADMIN_PASSWORD or TEST_ADMIN_PASSWORD in .env');

  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const a = await login('admin', email, password);
      const mfa = await fetch(`${API}/api/auth/mfa/start`, {
        method: 'POST',
        headers: authH(a.token),
        body: JSON.stringify({}),
      }).then(json);
      if (!mfa.ok || !mfa.demoCode) return a;
      await new Promise((r) => setTimeout(r, 200));
      const v = await fetch(`${API}/api/auth/mfa/verify`, {
        method: 'POST',
        headers: authH(a.token),
        body: JSON.stringify({ code: String(mfa.demoCode) }),
      }).then(json);
      if (v.ok && v.token) return { ...a, token: v.token };
    } catch (e) {
      lastErr = e;
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 400));
  }
  throw lastErr || new Error('admin login failed');
}

export async function loginHomeowner() {
  const email = envCred(['SMOKE_HOMEOWNER_EMAIL', 'TEST_HOMEOWNER_EMAIL']);
  const password = envCred(['SMOKE_HOMEOWNER_PASSWORD', 'TEST_HOMEOWNER_PASSWORD']);
  if (!email || !password) {
    throw new Error('Set SMOKE_HOMEOWNER_EMAIL/PASSWORD or TEST_HOMEOWNER_* in .env');
  }
  return login('homeowner', email, password);
}

export async function loginContractor() {
  const email = envCred(['SMOKE_CONTRACTOR_EMAIL', 'TEST_CONTRACTOR_EMAIL']);
  const password = envCred(['SMOKE_CONTRACTOR_PASSWORD', 'TEST_CONTRACTOR_PASSWORD']);
  if (!email || !password) {
    throw new Error('Set SMOKE_CONTRACTOR_EMAIL/PASSWORD or TEST_CONTRACTOR_* in .env');
  }
  return login('contractor', email, password);
}

export { API };
