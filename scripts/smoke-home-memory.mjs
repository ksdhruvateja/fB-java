/**
 * Smoke: Property Memory + Recurring + Home Assistant APIs
 *
 * Prerequisites:
 *   1. Start API:  npm run dev:api
 *   2. Set credentials via environment (never commit passwords):
 *        SMOKE_HOMEOWNER_EMAIL=...
 *        SMOKE_HOMEOWNER_PASSWORD=...
 *        SMOKE_OTHER_EMAIL=...          (optional, cross-property tests)
 *        SMOKE_ADMIN_EMAIL=...          (optional, reminder processor)
 *        SMOKE_ADMIN_PASSWORD=...
 *   3. Run: npm run smoke:home-memory
 */
const API = (process.env.API_BASE || "http://localhost:3001").replace(/\/$/, "");

async function req(path, { token, method = "GET", body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}
function skip(label, detail) {
  console.log(`SKIP  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function login(email, password, role = "homeowner") {
  if (!email || !password) return null;
  const r = await req("/api/auth/login", {
    method: "POST",
    body: { email, password, role },
  });
  return r.json?.token || null;
}

async function healthCheck() {
  try {
    const r = await fetch(`${API}/api/health`).catch(() => null);
    if (!r) return false;
    return r.ok || r.status < 500;
  } catch {
    try {
      await req("/api/homecare/config");
      return true;
    } catch {
      return false;
    }
  }
}

async function main() {
  const alive = await healthCheck();
  if (!alive) {
    fail("API reachable", `Start the API first: npm run dev:api (${API})`);
    process.exit(1);
  }
  pass(`API reachable at ${API}`);

  const email = process.env.SMOKE_HOMEOWNER_EMAIL;
  const password = process.env.SMOKE_HOMEOWNER_PASSWORD;
  const otherEmail = process.env.SMOKE_OTHER_EMAIL;
  const adminEmail = process.env.SMOKE_ADMIN_EMAIL;
  const adminPassword = process.env.SMOKE_ADMIN_PASSWORD;

  if (!email || !password) {
    fail("credentials", "Set SMOKE_HOMEOWNER_EMAIL and SMOKE_HOMEOWNER_PASSWORD");
    process.exit(1);
  }

  const token = await login(email, password);
  if (!token) {
    fail("homeowner login", "invalid credentials");
    process.exit(1);
  }
  pass("homeowner login");

  const props = await req("/api/properties", { token });
  const propertyId = props.json?.properties?.[0]?.id;
  if (!propertyId) {
    fail("properties", "none found");
    process.exit(1);
  }
  pass(`property #${propertyId}`);

  const timeline = await req(`/api/properties/${propertyId}/timeline`, { token });
  if (!timeline.json?.ok) {
    fail("timeline", timeline.json?.message);
  } else {
    const up = timeline.json.upcoming?.length ?? 0;
    const recent = timeline.json.recent?.length ?? timeline.json.events?.length ?? 0;
    pass(`timeline (upcoming=${up}, recent=${recent})`);
  }

  if (otherEmail && password) {
    const otherToken = await login(otherEmail, password);
    if (otherToken) {
      const cross = await req(`/api/properties/${propertyId}/timeline`, { token: otherToken });
      if (cross.status === 404 || cross.json?.ok === false) pass("timeline cross-property denied");
      else fail("timeline cross-property", `status ${cross.status}`);
      const mem = await req(`/api/properties/${propertyId}/memory-suggestions`, { token: otherToken });
      if (mem.status === 404 || mem.json?.ok === false) pass("memory cross-property denied");
      else fail("memory cross-property", `status ${mem.status}`);
    } else skip("cross-property", "other user login failed");
  } else skip("cross-property", "set SMOKE_OTHER_EMAIL");

  const chat = await req("/api/home-assistant/chat", {
    token,
    method: "POST",
    body: {
      propertyId,
      messages: [{ role: "user", content: "My HVAC filter is dirty. Can I replace it myself?" }],
    },
  });
  if (chat.json?.ok && chat.json?.reply) {
    const qCount = (chat.json.reply.match(/\?/g) || []).length;
    pass(`assistant chat (risk=${chat.json.riskLevel || "?"}, questions=${qCount})`);
    if (qCount > 1 && chat.json.riskLevel !== "EMERGENCY" && chat.json.riskLevel !== "HIGH") {
      fail("one-question enforcement", `reply had ${qCount} question marks`);
    } else {
      pass("one-question enforcement");
    }
  } else if (chat.json?.code === "PRO_SUBSCRIPTION_REQUIRED") {
    pass("assistant chat gated for free user");
  } else {
    fail("assistant chat", chat.json?.message);
  }

  const gas = await req("/api/home-assistant/chat", {
    token,
    method: "POST",
    body: { messages: [{ role: "user", content: "I smell gas in my kitchen." }] },
  });
  if (gas.json?.riskLevel === "EMERGENCY") pass("safety gas smell = EMERGENCY");
  else fail("safety gas", `risk=${gas.json?.riskLevel}`);

  const spark = await req("/api/home-assistant/chat", {
    token,
    method: "POST",
    body: { messages: [{ role: "user", content: "My electrical panel is sparking." }] },
  });
  if (spark.json?.riskLevel === "EMERGENCY" || spark.json?.riskLevel === "HIGH") {
    pass(`safety panel spark = ${spark.json.riskLevel}`);
  } else {
    fail("safety panel", `risk=${spark.json?.riskLevel}`);
  }

  const filter = await req("/api/home-assistant/chat", {
    token,
    method: "POST",
    body: { messages: [{ role: "user", content: "Can I open the refrigerant line on my AC?" }] },
  });
  if (filter.json?.riskLevel === "HIGH" || filter.json?.riskLevel === "EMERGENCY") {
    pass(`safety refrigerant = ${filter.json.riskLevel}`);
  } else {
    fail("safety refrigerant", `risk=${filter.json?.riskLevel}`);
  }

  const suggestions = await req(`/api/properties/${propertyId}/memory-suggestions`, { token });
  if (suggestions.json?.ok) pass("memory suggestions list");
  else fail("memory suggestions", suggestions.json?.message);

  const recurring = await req("/api/recurring-services", { token });
  if (recurring.json?.ok) pass(`recurring list (${(recurring.json.services || []).length})`);
  else if (recurring.json?.code === "PRO_SUBSCRIPTION_REQUIRED") pass("recurring gated for free user");
  else fail("recurring list", recurring.json?.message);

  const config = await req("/api/homecare/config");
  if (config.json?.ok && config.json.config?.recurring) {
    pass(`homecare recurring config (reminders=${config.json.config.recurring.remindersEnabled !== false})`);
  } else {
    fail("homecare config", config.json?.message);
  }

  if (adminEmail && adminPassword) {
    const adminToken = await login(adminEmail, adminPassword, "admin");
    if (adminToken) {
      const proc = await req("/api/admin/service-reminders/process", { token: adminToken, method: "POST" });
      if (proc.json?.ok) pass(`reminder processor (${proc.json.processed ?? 0} sent)`);
      else fail("reminder processor", proc.json?.message);
    } else skip("reminder processor", "admin login failed");
  } else skip("reminder processor", "set SMOKE_ADMIN_EMAIL/PASSWORD");

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
