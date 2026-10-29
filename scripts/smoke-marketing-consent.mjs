/**
 * Smoke checks for marketing consent APIs (run against local API).
 * Usage: node scripts/smoke-marketing-consent.mjs [baseUrl]
 */
const base = (process.argv[2] || process.env.APP_URL || "http://localhost:8888").replace(/\/$/, "");

async function get(path) {
  const res = await fetch(`${base}${path}`);
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

const checks = [];

async function run() {
  const cfg = await get("/api/auth/google/config");
  checks.push({
    name: "Google config endpoint",
    ok: cfg.status === 200 && cfg.body?.ok === true,
    detail: `configured=${cfg.body?.configured}`,
  });

  const unsub = await get("/api/marketing/unsubscribe");
  checks.push({
    name: "Unsubscribe rejects missing token",
    ok: unsub.status === 400,
    detail: String(unsub.body?.message || unsub.status),
  });

  const adminCustomers = await get("/api/admin/customers");
  checks.push({
    name: "Admin customers requires auth",
    ok: adminCustomers.status === 401 || adminCustomers.status === 403,
    detail: String(adminCustomers.status),
  });

  const prefs = await get("/api/homeowner/communication-preferences");
  checks.push({
    name: "Homeowner prefs requires auth",
    ok: prefs.status === 401 || prefs.status === 403,
    detail: String(prefs.status),
  });

  let failed = 0;
  for (const c of checks) {
    const mark = c.ok ? "PASS" : "FAIL";
    if (!c.ok) failed++;
    console.log(`${mark}  ${c.name} — ${c.detail}`);
  }
  process.exit(failed ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
