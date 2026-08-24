const API = process.env.API_URL || 'http://localhost:3001';

async function req(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${data.message || text}`);
  }
  return data;
}

async function main() {
  const homeowner = await req('/api/auth/signin', {
    method: 'POST',
    body: { role: 'homeowner', email: 'maria@example.com', password: 'demo123' },
  });
  console.log('LOGIN_HO', homeowner.user.email, homeowner.user.role, 'id=' + homeowner.user.id);

  const admin = await req('/api/auth/signin', {
    method: 'POST',
    body: { role: 'admin', email: 'admin@fixbridge.local', password: 'admin123' },
  });
  console.log('LOGIN_ADMIN', admin.user.email, admin.user.role);

  const contractor = await req('/api/auth/signin', {
    method: 'POST',
    body: { role: 'contractor', email: 'james@yourcompany.com', password: 'demo123' },
  });
  console.log('LOGIN_CO', contractor.user.email, contractor.user.role);

  const me = await req('/api/auth/me', { token: homeowner.token });
  console.log('ME', me.user.email);

  const jobs = await req('/api/managed/jobs/my', { token: homeowner.token });
  console.log('JOBS', Array.isArray(jobs.jobs) ? jobs.jobs.length : Object.keys(jobs));

  const plans = await req('/api/platform/go-pro-plans');
  console.log(
    'GOPRO',
    plans.plans.map((p) => `${p.code}:${p.amount}`).join(',')
  );

  const adminPlans = await req('/api/admin/subscription-plans', { token: admin.token });
  const pro = adminPlans.plans.find((p) => p.code === 'pro_membership');
  console.log('ADMIN_PLANS', adminPlans.plans.length, 'proId=' + pro.id);

  const updated = await req(`/api/admin/subscription-plans/${pro.id}`, {
    method: 'PATCH',
    token: admin.token,
    body: { amount: 42 },
  });
  console.log('UPDATE_PRO', updated.plan.amount);

  const plans2 = await req('/api/platform/go-pro-plans');
  const pro2 = plans2.plans.find((p) => p.code === 'pro_membership');
  console.log('GOPRO_AFTER', pro2.amount);
  if (Number(pro2.amount) !== 42) throw new Error('Go Pro did not reflect Neon update');

  await req(`/api/admin/subscription-plans/${pro.id}`, {
    method: 'PATCH',
    token: admin.token,
    body: { amount: 39 },
  });
  console.log('RESTORED', 39);

  const ticket = await req('/api/support/tickets', {
    method: 'POST',
    token: homeowner.token,
    body: {
      channel: 'help',
      subject: 'Neon persistence check',
      message: 'Confirm ticket + deliveries persist in Neon',
    },
  });
  console.log('TICKET', ticket.ticket.ticketNumber, 'deliveries=' + ticket.deliveries.length);

  const listed = await req('/api/support/tickets', { token: homeowner.token });
  console.log('TICKETS_LIST', listed.tickets.length);

  const adminTickets = await req('/api/admin/support/tickets', { token: admin.token });
  console.log('ADMIN_TICKETS', adminTickets.tickets.length);

  const adminJobs = await req('/api/admin/managed/jobs', { token: admin.token });
  console.log('ADMIN_JOBS', Array.isArray(adminJobs.jobs) ? adminJobs.jobs.length : Object.keys(adminJobs));

  console.log('ALL_SMOKE_OK');
}

main().catch((e) => {
  console.error('SMOKE_FAIL', e.message);
  process.exit(1);
});
