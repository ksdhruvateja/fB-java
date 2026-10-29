/**
 * Homeowner job cancellation smoke tests.
 * Usage: node scripts/smoke-job-cancel.mjs [baseUrl]
 */

const BASE = process.argv[2] || process.env.SMOKE_BASE_URL || "http://127.0.0.1:3001";

async function json(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, init);
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function login(email, password, role = "homeowner") {
  const { res, body } = await json("/api/auth/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, role }),
  });
  assert(res.ok && body.token, `login failed for ${email}`);
  return body.token;
}

async function main() {
  const results = [];
  const homeownerToken = await login("maria@example.com", "demo123");
  const H = { Authorization: `Bearer ${homeownerToken}`, "Content-Type": "application/json" };

  const create = await json("/api/managed/jobs", {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      category: "Plumbing",
      title: `Cancel smoke ${Date.now()}`,
      description: "Smoke test cancellation flow",
      serviceTiming: "weekday",
    }),
  });
  assert(create.res.ok && create.body.job?.id, "create job failed");
  const jobId = create.body.job.id;

  const cancel = await json(`/api/managed/jobs/${jobId}/cancel`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ reasonCode: "created_by_mistake", notes: "smoke test" }),
  });
  assert(cancel.res.ok && cancel.body.job?.status === "canceled", "cancel failed");
  assert(cancel.body.job.cancellationReasonCode === "created_by_mistake", "reason code missing");
  results.push("unassigned cancel");

  const dup = await json(`/api/managed/jobs/${jobId}/cancel`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ reasonCode: "other" }),
  });
  assert(dup.res.ok && dup.body.alreadyCancelled, "idempotent cancel failed");
  results.push("idempotent cancel");

  const otherEmail = `cancel.peer.${Date.now()}@example.com`;
  const signup = await json("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role: "homeowner",
      email: otherEmail,
      password: "demo123",
      name: "Cancel Peer",
    }),
  });
  assert(signup.res.ok && signup.body.token, "peer signup failed");
  const otherToken = signup.body.token;
  const forbidden = await json(`/api/managed/jobs/${jobId}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${otherToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ reasonCode: "other" }),
  });
  assert(forbidden.res.status === 403 || forbidden.res.status === 404, "cross-homeowner cancel should be denied");
  results.push("security cross-homeowner");

  const contractorToken = await login("james@yourcompany.com", "demo123", "contractor");
  const contractorDenied = await json(`/api/managed/jobs/${jobId}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${contractorToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ reasonCode: "other" }),
  });
  assert(contractorDenied.res.status === 403, "contractor cancel should be denied");
  results.push("security contractor");

  console.log(JSON.stringify({ ok: true, base: BASE, passed: results }, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }, null, 2));
  process.exit(1);
});
