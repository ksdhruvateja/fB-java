/**
 * Shared smoke auth — tries primary admin email then legacy demo admin.
 */
const API = process.env.API_BASE || 'http://127.0.0.1:3001';

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

export async function login(role, email, password) {
  const r = await fetch(`${API}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, email, password }),
  }).then(json);
  if (!r.ok || !r.token) throw new Error(r.message || 'login failed');
  return r;
}

export async function loginAdminWithMfa() {
  const candidates = [
    ['ksdt2702@gmail.com', 'admin123'],
    ['admin@fixbridge.local', 'admin123'],
  ];
  let lastErr = null;
  for (const [email, password] of candidates) {
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
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
        if (attempt < 2) await new Promise((r) => setTimeout(r, 400));
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('admin login failed');
}

export async function loginHomeowner() {
  return login('homeowner', 'maria@example.com', 'demo123');
}

export async function loginContractor() {
  return login('contractor', 'james@yourcompany.com', 'demo123');
}

export { API };
