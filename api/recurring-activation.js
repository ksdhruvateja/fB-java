import { notifyAdmins } from './in-app-notifications.js';

import { addRecurrenceDays, calendarDate } from './recurring-calendar.js';

function readMeta(row) {
  try {
    return typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {};
  } catch {
    return {};
  }
}

export async function createRecurringAdminJob(pool, { recurring, homeowner }) {
  const meta = readMeta(recurring);
  if (meta.adminJobId) return { jobId: Number(meta.adminJobId), created: false };
  const { rows: props } = await pool.query(
    `SELECT address_line1, city, state, zip FROM properties WHERE id=$1`,
    [recurring.property_id]
  );
  const prop = props[0] || {};
  const label = meta.serviceName || recurring.service_type;
  const description = [
    `NEW RECURRING SERVICE REQUEST`,
    `Service: ${label}`,
    `Frequency: ${meta.frequencyLabel || recurring.recurrence}`,
    `Preferred day: ${recurring.preferred_day || 'Flexible'}`,
    `Preferred time: ${recurring.preferred_time_window || 'Flexible'}`,
    `Commitment: ${meta.commitmentLabel || 'Month-to-month'}`,
    `Activation fee: ${meta.activationFeeStatus || 'pending'}`,
    `Pricing: Pending contractor pricing`,
    recurring.notes || '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 2000);
  const { rows } = await pool.query(
    `INSERT INTO managed_jobs
      (homeowner_user_id, property_id, job_mode, status, category, title, description,
       full_address, city_state_zip, preferred_date, preferred_time_slot, source_recurring_service_id)
     VALUES ($1,$2,'managed','awaiting_contractor',$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id`,
    [
      recurring.owner_user_id,
      recurring.property_id,
      meta.category || recurring.service_type,
      `Recurring: ${label}`.slice(0, 180),
      description,
      prop.address_line1 || null,
      [prop.city, prop.state, prop.zip].filter(Boolean).join(', ') || null,
      recurring.start_date ? calendarDate(recurring.start_date) : null,
      recurring.preferred_time_window || null,
      recurring.id,
    ]
  );
  const jobId = Number(rows[0].id);
  meta.adminJobId = jobId;
  meta.pricingStatus = 'pending';
  meta.pipelineStatus = 'pricing_required';
  await pool.query(
    `UPDATE recurring_services
       SET metadata=$2, status='pricing_required', next_service_date=COALESCE(next_service_date, start_date), updated_at=NOW()
     WHERE id=$1`,
    [recurring.id, JSON.stringify(meta)]
  );
  try {
    await notifyAdmins(pool, {
      type: 'new_recurring_service',
      title: 'New Recurring Service Request',
      message: `New ${meta.frequencyLabel || recurring.recurrence} ${label} request submitted. Activation fee ${meta.activationFeeStatus === 'paid' ? 'paid' : 'recorded'}. Contractor pricing required.`,
      jobId,
      entityType: 'recurring_service',
      entityId: Number(recurring.id),
      actionUrl: `/admin?job=${jobId}`,
      metadata: { recurringServiceId: Number(recurring.id) },
    });
  } catch (e) {
    console.error('notifyAdmins recurring:', e);
  }
  return { jobId, created: true, homeownerName: homeowner?.name || null };
}

export async function fulfillRecurringActivation(pool, { recurringServiceId, paymentId = null, amountCents = null }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const recurring = (await client.query('SELECT * FROM recurring_services WHERE id=$1 FOR UPDATE', [recurringServiceId])).rows[0];
    if (!recurring) { await client.query('COMMIT'); return { ok:false, message:'Recurring service not found.' }; }
    if (['cancelled','paused'].includes(recurring.status)) { await client.query('COMMIT'); return { ok:false, message:'Recurring service is not active.' }; }
    const meta = readMeta(recurring);
    meta.activationFeeStatus = 'paid';
    if (amountCents != null) meta.activationFeeAmountCents = amountCents;
    if (paymentId) meta.activationPaymentId = paymentId;
    await client.query('UPDATE recurring_services SET metadata=$2, updated_at=NOW() WHERE id=$1',[recurring.id,JSON.stringify(meta)]);
    const refreshed = (await client.query('SELECT * FROM recurring_services WHERE id=$1',[recurring.id])).rows[0];
    const homeowner = (await client.query('SELECT id,name FROM users WHERE id=$1',[recurring.owner_user_id])).rows[0];
    const result = await createRecurringAdminJob(client,{recurring:refreshed,homeowner});
    await client.query('COMMIT');
    return { ok:true,...result };
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export { addRecurrenceDays };
