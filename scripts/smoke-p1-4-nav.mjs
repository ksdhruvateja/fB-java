/**
 * P1-4 homeowner profile related-record navigation API checks.
 * Does not modify production logic — verification only.
 */
import { API, authH, json, loginAdminWithMfa } from "./smoke-auth.mjs";

function pass(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) process.exitCode = 1;
}

async function loginHomeowner() {
  const signin = await fetch(`${API}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "homeowner", email: "maria@example.com", password: "demo123" }),
  }).then(json);
  if (!signin.ok || !signin.token) throw new Error(`homeowner login: ${signin.message}`);
  return signin.token;
}

async function main() {
  const adminSession = await loginAdminWithMfa();
  const admin = adminSession.token || adminSession;
  const hoSession = await loginHomeowner();
  const ho = hoSession.token || hoSession;

  const me = await fetch(`${API}/api/auth/me`, { headers: authH(ho) }).then(json);
  const uid = me.user?.id || me.id;
  pass("homeowner session", Boolean(uid), `id=${uid}`);

  const profile = await fetch(`${API}/api/admin/homeowners/${uid}/profile`, {
    headers: authH(admin),
  }).then(json);
  pass("admin profile load", profile.ok === true);

  const addresses = profile.addresses || [];
  const quotes = profile.quotes || [];
  const invoices = profile.invoices || [];
  const payments = profile.transactions || profile.payments || [];
  const jobs = profile.serviceHistory || [];

  pass("properties present or empty list", Array.isArray(addresses), `n=${addresses.length}`);
  pass("quotes array", Array.isArray(quotes), `n=${quotes.length}`);
  pass("invoices array", Array.isArray(invoices), `n=${invoices.length}`);
  pass("payments array", Array.isArray(payments), `n=${payments.length}`);
  pass("jobs array", Array.isArray(jobs), `n=${jobs.length}`);

  if (addresses.length >= 1) {
    const p1 = addresses[0];
    pass("property id numeric", Number(p1.propertyId) > 0, `propertyId=${p1.propertyId}`);
  }
  if (addresses.length >= 2) {
    pass(
      "distinct property ids",
      Number(addresses[0].propertyId) !== Number(addresses[1].propertyId),
      `${addresses[0].propertyId} vs ${addresses[1].propertyId}`
    );
  }

  if (quotes[0]) {
    const qw = await fetch(`${API}/api/admin/quotes/${quotes[0].id}/workspace`, {
      headers: authH(admin),
    }).then(json);
    pass(
      "quote workspace opens by proposal id",
      qw.ok === true && Number(qw.quote?.id) === Number(quotes[0].id),
      `${quotes[0].quoteNumber}`
    );
    if (quotes[1]) {
      const qw2 = await fetch(`${API}/api/admin/quotes/${quotes[1].id}/workspace`, {
        headers: authH(admin),
      }).then(json);
      pass(
        "second quote distinct",
        qw2.ok === true && Number(qw2.quote?.id) === Number(quotes[1].id),
        `${quotes[1].quoteNumber}`
      );
    }
  } else {
    pass("quote navigation sample", true, "no quotes on maria — skipped");
  }

  if (invoices[0]) {
    pass("invoice has proposalId field", "proposalId" in invoices[0], `proposalId=${invoices[0].proposalId}`);
    const inv = await fetch(`${API}/api/admin/invoices/${invoices[0].id}`, {
      headers: authH(admin),
    }).then(json);
    pass(
      "invoice get by invoice id",
      inv.ok === true && Number(inv.invoice?.id) === Number(invoices[0].id),
      invoices[0].invoiceNumber
    );
    pass(
      "invoice belongs to homeowner",
      inv.invoice?.homeownerUserId == null || Number(inv.invoice.homeownerUserId) === Number(uid),
      `homeownerUserId=${inv.invoice?.homeownerUserId}`
    );
  } else {
    pass("invoice navigation sample", true, "no invoices on maria — skipped");
  }

  if (payments[0]) {
    pass("payment id numeric", Number(payments[0].id) > 0, `id=${payments[0].id} txn=${payments[0].transactionId}`);
  }

  if (jobs[0]) {
    pass("job id numeric", Number(jobs[0].id) > 0, `jobId=${jobs[0].id}`);
  }

  // Non-admin blocked
  if (quotes[0]) {
    const blocked = await fetch(`${API}/api/admin/quotes/${quotes[0].id}/workspace`, {
      headers: authH(ho),
    });
    const bj = await blocked.json().catch(() => ({}));
    pass("non-admin quote workspace blocked", blocked.status === 403 || blocked.status === 401, `status=${blocked.status} ${bj.message || ""}`);
  }
  if (invoices[0]) {
    const blocked = await fetch(`${API}/api/admin/invoices/${invoices[0].id}`, {
      headers: authH(ho),
    });
    const bj = await blocked.json().catch(() => ({}));
    pass("non-admin invoice get blocked", blocked.status === 403 || blocked.status === 401, `status=${blocked.status} ${bj.message || ""}`);
  }

  const missQ = await fetch(`${API}/api/admin/quotes/999999999/workspace`, { headers: authH(admin) });
  const missQj = await missQ.json().catch(() => ({}));
  pass("missing quote not found", missQ.status === 404 || missQj.ok === false, `status=${missQ.status}`);

  const missI = await fetch(`${API}/api/admin/invoices/999999999`, { headers: authH(admin) });
  const missIj = await missI.json().catch(() => ({}));
  pass("missing invoice not found", missI.status === 404 || missIj.ok === false, `status=${missI.status}`);

  console.log("\nP1-4 nav API checks complete.");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
