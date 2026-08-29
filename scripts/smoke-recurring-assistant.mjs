/**
 * Smoke: recurring services entitlement + assistant handoff helpers + IDOR spot checks
 *
 * Requires API at API_BASE (default http://localhost:3001).
 * Optional: SMOKE_PRO_HOMEOWNER_EMAIL/PASSWORD or SMOKE_HOMEOWNER_EMAIL/PASSWORD
 *           SMOKE_OTHER_EMAIL/PASSWORD for cross-property tests
 *
 * Run: node scripts/smoke-recurring-assistant.mjs
 */
const API = (process.env.API_BASE || 'http://localhost:3001').replace(/\/$/, '');

async function req(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
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

async function login(email, password) {
  const r = await req('/api/auth/login', { method: 'POST', body: { email, password } });
  if (!r.json?.token) return null;
  return r.json.token;
}

function pass(label) {
  console.log(`PASS  ${label}`);
}
function fail(label, detail) {
  console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  process.exitCode = 1;
}
function skip(label, reason) {
  console.log(`SKIP  ${label} — ${reason}`);
}

async function main() {
  console.log('\nRecurring + Assistant smoke\n');

  const health = await req('/api/health');
  if (!health.json?.ok) {
    fail('API health', `status=${health.status}`);
    return;
  }
  pass('API reachable');

  const proEmail = process.env.SMOKE_PRO_HOMEOWNER_EMAIL || process.env.SMOKE_HOMEOWNER_EMAIL;
  const proPass = process.env.SMOKE_PRO_HOMEOWNER_PASSWORD || process.env.SMOKE_HOMEOWNER_PASSWORD;
  const otherEmail = process.env.SMOKE_OTHER_EMAIL;
  const otherPass = process.env.SMOKE_OTHER_PASSWORD;

  if (!proEmail || !proPass) {
    skip('authenticated recurring tests', 'CREDENTIALS MISSING — set SMOKE_HOMEOWNER_EMAIL/PASSWORD');
    skip('cross-property IDOR', 'CREDENTIALS MISSING');
    return;
  }

  const tokenA = await login(proEmail, proPass);
  if (!tokenA) {
    fail('login homeowner A');
    return;
  }
  pass('login homeowner A');

  const list = await req('/api/recurring-services', { token: tokenA });
  if (list.status === 403 && list.json?.code === 'PRO_SUBSCRIPTION_REQUIRED') {
    skip('recurring list (pro)', 'account is not Pro — use SMOKE_PRO_HOMEOWNER_*');
  } else if (!list.json?.ok) {
    fail('GET /api/recurring-services', list.json?.message || String(list.status));
  } else {
    pass('GET /api/recurring-services');
    const hasLandscapingGate = Array.isArray(list.json.services);
    if (hasLandscapingGate) pass('recurring list returns services array');
  }

  const props = await req('/api/properties', { token: tokenA });
  const propertyId = props.json?.properties?.[0]?.id;
  if (!propertyId) {
    skip('recurring create flow', 'no properties on account');
  } else {
    const create = await req('/api/recurring-services', {
      token: tokenA,
      method: 'POST',
      body: {
        propertyId,
        serviceType: 'recurring_cleaning',
        recurrence: 'biweekly',
      },
    });
    if (create.status === 403) {
      skip('create recurring cleaning', create.json?.message || 'forbidden');
    } else if (!create.json?.ok || !create.json?.service?.id) {
      fail('create recurring cleaning', create.json?.message);
    } else {
      pass('create recurring cleaning');
      const svcId = create.json.service.id;

      const pause = await req(`/api/recurring-services/${svcId}`, {
        token: tokenA,
        method: 'PATCH',
        body: { status: 'paused' },
      });
      pause.json?.ok ? pass('pause recurring') : fail('pause recurring', pause.json?.message);

      const resume = await req(`/api/recurring-services/${svcId}`, {
        token: tokenA,
        method: 'PATCH',
        body: { status: 'active' },
      });
      resume.json?.ok ? pass('resume recurring') : fail('resume recurring', resume.json?.message);

      const skipVisit = await req(`/api/recurring-services/${svcId}/skip`, {
        token: tokenA,
        method: 'POST',
        body: {},
      });
      skipVisit.json?.ok ? pass('skip recurring visit') : fail('skip recurring visit', skipVisit.json?.message);

      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const resched = await req(`/api/recurring-services/${svcId}/reschedule`, {
        token: tokenA,
        method: 'POST',
        body: { newDate: tomorrow, preferredTimeWindow: '9-11' },
      });
      resched.json?.ok ? pass('reschedule recurring visit') : fail('reschedule recurring visit', resched.json?.message);

      const past = await req(`/api/recurring-services/${svcId}/reschedule`, {
        token: tokenA,
        method: 'POST',
        body: { newDate: '2020-01-01' },
      });
      past.status === 400 ? pass('reschedule rejects past date') : fail('reschedule rejects past date', `status=${past.status}`);

      const visit = await req(`/api/recurring-services/${svcId}/request-visit`, {
        token: tokenA,
        method: 'POST',
      });
      if (visit.json?.ok && visit.json?.jobId) {
        pass('request-visit creates managed job');
      } else {
        fail('request-visit', visit.json?.message);
      }

      await req(`/api/recurring-services/${svcId}`, {
        token: tokenA,
        method: 'PATCH',
        body: { status: 'cancelled' },
      });
      pass('cancel recurring (cleanup)');
    }
  }

  const landCreate = propertyId
    ? await req('/api/recurring-services', {
        token: tokenA,
        method: 'POST',
        body: { propertyId, serviceType: 'recurring_landscaping', recurrence: 'weekly' },
      })
    : null;
  if (landCreate?.status === 403) {
    skip('landscaping entitlement', landCreate.json?.message);
  } else if (landCreate?.json?.ok) {
    pass('create recurring landscaping (recurring_landscaping entitlement)');
    if (landCreate.json.service?.id) {
      await req(`/api/recurring-services/${landCreate.json.service.id}`, {
        token: tokenA,
        method: 'PATCH',
        body: { status: 'cancelled' },
      });
    }
  } else if (landCreate) {
    fail('create recurring landscaping', landCreate.json?.message);
  }

  if (otherEmail && otherPass) {
    const tokenB = await login(otherEmail, otherPass);
    if (!tokenB) {
      fail('login homeowner B');
    } else {
      pass('login homeowner B');
      const propsB = await req('/api/properties', { token: tokenB });
      const propB = propsB.json?.properties?.[0]?.id;
      if (propertyId && propB && propertyId !== propB) {
        const idor = await req(`/api/properties/${propertyId}/timeline`, { token: tokenB });
        idor.status === 404 || idor.status === 403
          ? pass('cross-property timeline denied')
          : fail('cross-property timeline', `status=${idor.status}`);
        const idor2 = await req(`/api/recurring-services`, { token: tokenB });
        if (idor2.json?.ok && Array.isArray(idor2.json.services)) {
          const leaked = idor2.json.services.some((s) => Number(s.propertyId) === Number(propertyId));
          leaked ? fail('cross-property recurring leak') : pass('recurring list scoped to owner');
        }
      } else {
        skip('cross-property IDOR', 'need two distinct properties on A and B');
      }
    }
  } else {
    skip('cross-property IDOR', 'CREDENTIALS MISSING — set SMOKE_OTHER_EMAIL/PASSWORD');
  }

  console.log('\nDone.\n');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
