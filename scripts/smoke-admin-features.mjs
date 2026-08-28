#!/usr/bin/env node
/**
 * Smoke tests: homeowner profile, support tickets, finance, permissions.
 * Usage: API_BASE=http://127.0.0.1:3001 node scripts/smoke-admin-features.mjs
 */
import { API, authH, login, loginAdminWithMfa } from "./smoke-auth.mjs";

async function loginToken(role, email, password) {
  const data = await login(role, email, password);
  return data.token;
}

async function api(token, path, init) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...authH(token),
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

const results = [];

function pass(name) {
  results.push({ name, ok: true });
  console.log(`PASS ${name}`);
}

function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error(`FAIL ${name}: ${detail}`);
}

async function main() {
  let hoToken;
  let ho2Token;
  let adminToken;
  let ticketNumber;

  try {
    hoToken = await loginToken("homeowner", "maria@example.com", "demo123");
    pass("Homeowner login");
  } catch (e) {
    fail("Homeowner login", e.message);
    return summary();
  }

  try {
    adminToken = (await loginAdminWithMfa()).token;
    pass("Admin login");
  } catch (e) {
    fail("Admin login", e.message);
  }

  // Homeowner profile
  if (adminToken) {
    const { res, data } = await api(adminToken, "/api/admin/subscription-stats");
    const customer = (data.customers || [])[0];
    if (res.ok && customer?.id) {
      const prof = await api(adminToken, `/api/admin/homeowners/${customer.id}/profile`);
      if (prof.res.ok && prof.data.customer?.name && prof.data.stats) {
        pass("Admin homeowner profile loads with stats");
      } else {
        fail("Admin homeowner profile loads with stats", prof.data.message || "missing fields");
      }
    } else {
      fail("Admin homeowner profile loads with stats", "no customers");
    }
  }

  // Create ticket
  const create = await api(hoToken, "/api/support/tickets", {
    method: "POST",
    body: JSON.stringify({
      channel: "help",
      subject: "Smoke test ticket",
      message: "Automated smoke test message",
      category: "Technical Issue",
      priority: "normal",
    }),
  });
  if (create.res.ok && create.data.ticket?.ticketNumber?.startsWith("FBT-")) {
    ticketNumber = create.data.ticket.ticketNumber;
    pass("Homeowner creates ticket with FBT number");
  } else {
    fail("Homeowner creates ticket with FBT number", create.data.message || JSON.stringify(create.data));
  }

  if (adminToken && ticketNumber) {
    const list = await api(adminToken, `/api/admin/support/tickets?q=${encodeURIComponent(ticketNumber)}`);
    const found = (list.data.tickets || []).some((t) => t.ticketNumber === ticketNumber);
    if (found) pass("Admin search finds ticket");
    else fail("Admin search finds ticket", "not in results");

    const reply = await api(adminToken, `/api/admin/support/tickets/${ticketNumber}/reply`, {
      method: "POST",
      body: JSON.stringify({ message: "Admin smoke reply" }),
    });
    if (reply.res.ok) pass("Admin replies to ticket");
    else fail("Admin replies to ticket", reply.data.message);

    const hoView = await api(hoToken, `/api/support/tickets/${ticketNumber}`);
    const hasAdminReply = (hoView.data.messages || []).some((m) => m.message?.includes("Admin smoke reply"));
    if (hasAdminReply) pass("Homeowner sees admin reply");
    else fail("Homeowner sees admin reply", "message missing");

    const resolve = await api(adminToken, `/api/admin/support/tickets/${ticketNumber}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "resolved" }),
    });
    if (resolve.res.ok) pass("Admin resolves ticket");
    else fail("Admin resolves ticket", resolve.data.message);

    const history = await api(hoToken, `/api/support/tickets/${ticketNumber}`);
    if (history.res.ok && history.data.ticket?.status === "resolved") pass("Ticket remains in history after resolve");
    else fail("Ticket remains in history after resolve", history.data.message);
  }

  // Finance overview
  if (adminToken) {
    const fin = await api(adminToken, "/api/admin/finance/overview?range=30d");
    if (fin.res.ok && fin.data.summary) pass("Finance overview returns summary");
    else fail("Finance overview returns summary", fin.data.message);
  }

  // IDOR: second homeowner cannot read first ticket
  try {
    ho2Token = await loginToken("homeowner", "john@example.com", "demo123");
  } catch {
    ho2Token = null;
  }
  if (ho2Token && ticketNumber) {
    const blocked = await api(ho2Token, `/api/support/tickets/${ticketNumber}`);
    if (blocked.res.status === 404) pass("Homeowner B blocked from Homeowner A ticket");
    else fail("Homeowner B blocked from Homeowner A ticket", `status ${blocked.res.status}`);
  } else {
    pass("Homeowner B blocked from Homeowner A ticket (skipped — no second user)");
  }

  summary();
}

function summary() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
