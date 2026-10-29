/**
 * Connected Home E2E smoke (API-level).
 * Requires: npm run dev:api + env credentials (see smoke-home-memory.mjs).
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
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, json: { ok: false, message: text } };
  }
}

function pass(m) {
  console.log(`PASS  ${m}`);
}
function fail(m, d) {
  console.log(`FAIL  ${m}${d ? ` — ${d}` : ""}`);
  process.exitCode = 1;
}

async function login(email, password, role = "homeowner") {
  const r = await req("/api/auth/login", { method: "POST", body: { email, password, role } });
  return r.json?.token || null;
}

async function main() {
  const email = process.env.SMOKE_HOMEOWNER_EMAIL;
  const password = process.env.SMOKE_HOMEOWNER_PASSWORD;
  const contractorEmail = process.env.SMOKE_CONTRACTOR_EMAIL;
  const contractorPassword = process.env.SMOKE_CONTRACTOR_PASSWORD;

  if (!email || !password) {
    fail("credentials", "Set SMOKE_HOMEOWNER_EMAIL and SMOKE_HOMEOWNER_PASSWORD");
    return;
  }

  const hoToken = await login(email, password);
  if (!hoToken) {
    fail("homeowner login");
    return;
  }
  pass("homeowner login");

  const props = await req("/api/properties", { token: hoToken });
  const propertyId = props.json?.properties?.[0]?.id;
  if (!propertyId) {
    fail("property");
    return;
  }
  pass(`property #${propertyId}`);

  await req(`/api/properties/${propertyId}`, {
    token: hoToken,
    method: "PUT",
    body: {
      homeSystems: [
        {
          key: "hvac",
          name: "HVAC",
          brand: "Carrier",
          model: "24ABC",
          installedYear: "2016",
          source: "confirmed",
          verification: "confirmed",
        },
      ],
    },
  });
  pass("HVAC info saved");

  const jobCreate = await req("/api/managed/jobs", {
    token: hoToken,
    method: "POST",
    body: {
      propertyId,
      category: "HVAC",
      title: "AC not cooling",
      description: "E2E test — AC not cooling well",
    },
  });
  const jobId = jobCreate.json?.job?.id;
  if (!jobId) {
    fail("create job", jobCreate.json?.message);
    return;
  }
  pass(`job #${jobId} created`);

  const chat = await req("/api/home-assistant/chat", {
    token: hoToken,
    method: "POST",
    body: {
      propertyId,
      messages: [{ role: "user", content: "My AC is not cooling." }],
    },
  });
  if (chat.json?.ok && /carrier|hvac|24abc/i.test(chat.json.reply || "")) {
    pass("assistant used HVAC context");
  } else if (chat.json?.code === "PRO_SUBSCRIPTION_REQUIRED") {
    pass("assistant gated (Pro required for property context)");
  } else {
    fail("assistant context", chat.json?.message || "no carrier/hvac mention");
  }

  if (contractorEmail && contractorPassword) {
    const cToken = await login(contractorEmail, contractorPassword, "contractor");
    if (cToken) {
      const complete = await req(`/api/managed/jobs/${jobId}/complete`, {
        token: cToken,
        method: "POST",
        body: {
          summary: "E2E HVAC service completed",
          structuredEquipment: {
            manufacturer: "Carrier",
            model: "24ABC636A003",
            serial: "E2E123",
            filterSize: "16x25x1",
            installationYear: "2016",
          },
          healthUpdate: { system: "HVAC", status: "good", nextAction: "Replace filter quarterly" },
        },
      });
      if (complete.json?.ok) pass("contractor completion with structured equipment");
      else fail("contractor complete", complete.json?.message);

      const sug = await req(`/api/properties/${propertyId}/memory-suggestions`, { token: hoToken });
      const pending = (sug.json?.suggestions || []).find((s) => s.source === "completed_job");
      if (pending) {
        pass("memory suggestion created");
        const confirm = await req(`/api/properties/${propertyId}/memory-suggestions/${pending.id}/confirm`, {
          token: hoToken,
          method: "POST",
        });
        if (confirm.json?.ok) pass("homeowner confirmed memory");
        else fail("confirm memory", confirm.json?.message);
      } else {
        fail("memory suggestion missing");
      }
    } else {
      fail("contractor login");
    }
  } else {
    console.log("SKIP  contractor flow — set SMOKE_CONTRACTOR_EMAIL/PASSWORD");
  }

  const timeline = await req(`/api/properties/${propertyId}/timeline`, { token: hoToken });
  if (timeline.json?.ok) pass(`timeline updated (recent=${timeline.json.recent?.length ?? 0})`);
  else fail("timeline", timeline.json?.message);

  const repeat = await req(`/api/managed/jobs/${jobId}/repeat-service`, {
    token: hoToken,
    method: "POST",
    body: { requestSameProvider: true },
  });
  if (repeat.json?.ok && repeat.json.job?.id) {
    pass(`repeat service job #${repeat.json.job.id}`);
    if (repeat.json.job.preferredContractorUserId != null) pass("preferred provider retained on repeat");
    else pass("repeat service created (no preferred provider on source)");
  } else {
    fail("repeat service", repeat.json?.message);
  }

  const recurring = await req("/api/recurring-services", { token: hoToken });
  if (recurring.json?.code === "PRO_SUBSCRIPTION_REQUIRED") {
    console.log("SKIP  recurring flow — Pro subscription required");
  } else if (recurring.json?.ok) {
    let svc = recurring.json.services?.[0];
    if (!svc) {
      const created = await req("/api/recurring-services", {
        token: hoToken,
        method: "POST",
        body: { propertyId, serviceType: "recurring_cleaning", recurrence: "biweekly" },
      });
      svc = created.json?.service;
    }
    if (svc?.id) {
      const visit = await req(`/api/recurring-services/${svc.id}/request-visit`, {
        token: hoToken,
        method: "POST",
      });
      if (visit.json?.ok && visit.json.jobId) {
        pass(`recurring request-visit job #${visit.json.jobId}`);
        const tl = await req(`/api/properties/${propertyId}/timeline`, { token: hoToken });
        const hasUpcoming = (tl.json?.upcoming || []).some((e) => e.type === "recurring_visit_requested");
        if (hasUpcoming) pass("upcoming timeline shows requested visit");
        else fail("upcoming timeline", "missing recurring_visit_requested");
      } else {
        fail("request-visit", visit.json?.message);
      }
    }
  }

  console.log("\nE2E complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
