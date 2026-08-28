/**
 * Admin work queue — backend-driven section classification.
 * Each job belongs to exactly one primary queue bucket.
 */

export const WORK_QUEUE_SECTIONS = [
  { id: 'new_requests', label: 'New Requests' },
  { id: 'waiting_contractor_quote', label: 'Waiting Contractor Quote' },
  { id: 'needs_admin_pricing', label: 'Needs Admin Pricing' },
  { id: 'quote_sent', label: 'Quote Sent' },
  { id: 'homeowner_accepted', label: 'Homeowner Accepted' },
  { id: 'ready_to_dispatch', label: 'Ready to Dispatch' },
  { id: 'active', label: 'Active Jobs' },
  { id: 'payment_pending', label: 'Payment Pending' },
  { id: 'payout_ready', label: 'Payout Ready' },
  { id: 'attention_required', label: 'Attention Required' },
];

const TERMINAL = new Set(['closed', 'canceled', 'cancelled', 'refunded', 'paid_out']);

function urgency(row) {
  const a = row.ai_assessment;
  const parsed = typeof a === 'string' ? (() => { try { return JSON.parse(a); } catch { return {}; } })() : a || {};
  const u = String(parsed.urgency || '').toLowerCase();
  return u.includes('emerg') || u === 'critical';
}

/** Classify a managed_jobs row into one primary queue section. */
export function classifyWorkQueueJob(row) {
  const status = String(row.status || '').toLowerCase();
  const wqs = String(row.work_queue_status || '').toUpperCase();

  if (TERMINAL.has(status)) return null;

  const inviteOverdue =
    row.invite_deadline_at &&
    new Date(row.invite_deadline_at).getTime() < Date.now() &&
    ['awaiting_contractor', 'contractor_invited', 'awaiting_bid'].includes(status);

  if (inviteOverdue || (urgency(row) && !['paid_out', 'closed', 'payout_pending', 'admin_review_pending'].includes(status))) {
    return 'attention_required';
  }

  if (['draft', 'ai_review_complete', 'awaiting_service_payment'].includes(status)) return 'new_requests';
  if (status === 'paid_for_dispatch' || status === 'awaiting_contractor' || wqs === 'PAID_NEEDS_REVIEW') {
    return 'new_requests';
  }
  if (['contractor_invited', 'awaiting_bid', 'contractor_accepted'].includes(status)) {
    return 'waiting_contractor_quote';
  }
  if (status === 'bid_received') return 'needs_admin_pricing';
  if (['proposal_sent', 'awaiting_customer_approval'].includes(status)) return 'quote_sent';
  if (status === 'approved') return 'homeowner_accepted';
  if (status === 'scheduled') return 'ready_to_dispatch';
  if (['contractor_en_route', 'work_started', 'change_order_pending', 'diagnosing'].includes(status)) {
    return 'active';
  }
  if (['work_completed', 'customer_review_pending'].includes(status)) return 'payment_pending';
  if (['admin_review_pending', 'payout_pending'].includes(status)) return 'payout_ready';

  return 'attention_required';
}

export function buildWorkQueueSections(jobs) {
  const buckets = Object.fromEntries(WORK_QUEUE_SECTIONS.map((s) => [s.id, []]));
  for (const job of jobs) {
    const section = classifyWorkQueueJob(job);
    if (section && buckets[section]) buckets[section].push(job);
  }
  return WORK_QUEUE_SECTIONS.map((s) => ({
    ...s,
    count: buckets[s.id].length,
    jobs: buckets[s.id],
  }));
}
