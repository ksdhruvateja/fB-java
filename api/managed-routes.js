import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import {
  mergePricingRules,
  computePreliminaryRetail,
  retailFromBid,
  computeCustomerQuoteFromBid,
  getDispatchFee,
  applyAdminPriceAdjustment,
  DEFAULT_PRICING_RULES,
  buildZipMarketProfile,
  getLocationFactorByZip,
  getZipMarketLabel,
} from './pricing.js';
import { analyzeRepairStructured } from './ai.js';
import {
  stripeConfigured,
  shouldSimulatePayment,
  createCheckoutSession,
  createExpressAccount,
  createConnectAccountLink,
  createTransfer,
  constructWebhookEvent,
  capturePaymentIntent,
  cancelPaymentIntent,
} from './stripe.js';
import { brand } from './brand.js';
import { ensurePayoutRecordForJob, handlePayoutWebhookUpdate, syncContractorAccountFromUser } from './payout-db.js';
import { PAYOUT_STATUS } from './payout-service.js';
import {
  lookupPartnerByCode,
  publicPartnerView,
  syncPartnerReferralFromJob,
  intakeShareUrl,
  PARTNER_STATUS_LABELS,
} from './partners.js';
import {
  normalizeDiscountCode,
  lookupDiscountByCode,
  validateDiscountRow,
  publicDiscountView,
  applyDiscountToPricing,
  applyDiscountToAmount,
  incrementDiscountUse,
} from './discounts.js';
import { recordFinancialSnapshot, confidenceLabel, serializeFinancialSnapshot } from './financial-snapshots.js';
import {
  buildInvoiceForJob,
  renderInvoiceHtml,
  renderInvoiceSms,
  normalizePhone,
} from './invoices.js';
import { sendEmailSafe, sendSmsSafe } from './notify.js';

async function ensureUserReferralCodeInline(pool, r) {
  if (r.referral_code) return r.referral_code;
  const nameClean = String(r.name || 'user').toUpperCase().replace(/[^A-Z]/g, '');
  const prefix = nameClean.slice(0, 4) || 'USER';
  let referralCode = '';
  let attempts = 0;
  while (attempts < 10) {
    const random = Math.floor(1000 + Math.random() * 9000);
    referralCode = `REF-${prefix}-${random}`;
    try {
      await pool.query('UPDATE users SET referral_code=$1 WHERE id=$2', [referralCode, r.id]);
      r.referral_code = referralCode;
      break;
    } catch {
      attempts++;
    }
  }
  return referralCode;
}

async function processReferralAward(pool, newUser, partnerCode) {
  if (!partnerCode) return;
  const normalized = partnerCode.trim().toUpperCase();
  if (!normalized) return;

  // 1. Check if the code matches an existing user's referral_code
  const { rows: matches } = await pool.query(
    `SELECT id, name, referral_code, role FROM users WHERE LOWER(referral_code)=LOWER($1) AND id != $2`,
    [normalized, newUser.id]
  );
  if (matches.length === 0) return; // No matching user

  const referrer = matches[0];

  // 2. Save referred_by_code on the new user
  await pool.query(
    `UPDATE users SET referred_by_code=$1 WHERE id=$2`,
    [referrer.referral_code, newUser.id]
  );
  await audit(pool, newUser.id, 'referred_by_user', 'user', referrer.id, { referralCode: referrer.referral_code });
}

async function triggerReferralBookingReward(pool, jobId) {
  try {
    // 1. Get the job and user details
    const { rows: jobs } = await pool.query(
      `SELECT j.id, j.homeowner_user_id, u.referred_by_code, u.name AS homeowner_name
       FROM managed_jobs j
       JOIN users u ON u.id = j.homeowner_user_id
       WHERE j.id = $1`,
      [jobId]
    );
    if (!jobs[0] || !jobs[0].referred_by_code) return;

    const { referred_by_code, homeowner_user_id, homeowner_name } = jobs[0];

    // 2. Find the referrer
    const { rows: referrers } = await pool.query(
      `SELECT id, role, name, email FROM users WHERE LOWER(referral_code)=LOWER($1)`,
      [referred_by_code]
    );
    if (!referrers[0]) return;
    const referrer = referrers[0];

    // 3. Make sure we haven't already created a referral reward coupon linked to this user referral
    const rewardLabel = `Referral reward - referred ${homeowner_name} (User #${homeowner_user_id})`;
    const { rows: existingCoupons } = await pool.query(
      `SELECT id FROM discount_codes WHERE created_by=$1 AND label=$2`,
      [referrer.id, rewardLabel]
    );
    if (existingCoupons.length > 0) return; // Already rewarded

    // Load referral coupon value from pricing rules default
    let couponValue = 25.0;
    try {
      const { rows: ruleRows } = await pool.query(`SELECT rules FROM pricing_rules WHERE id='default'`);
      const rules = ruleRows[0]?.rules || {};
      if (rules.referral_coupon_value != null) {
        couponValue = Number(rules.referral_coupon_value);
      }
    } catch {
      // fallback
    }

    // Generate a random unique code for the coupon
    const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const rewardCode = `REWARD-${referrer.id}-${suffix}`;

    // Insert into discount_codes
    await pool.query(
      `INSERT INTO discount_codes (code, label, discount_type, value, active, max_uses, uses_count, created_by)
       VALUES ($1, $2, 'amount', $3, TRUE, 1, 0, $4)`,
      [rewardCode, rewardLabel, couponValue, referrer.id]
    );

    await audit(pool, referrer.id, 'referral_reward_created', 'user', homeowner_user_id, { rewardCode, couponValue });

    // Send email notification to referrer
    if (referrer.email) {
      try {
        await sendNotificationEmail({
          to: referrer.email,
          subject: `Your referral reward is here!`,
          html: `<p>Hi ${referrer.name || 'there'},</p>
                 <p>Great news! Your referral <strong>${homeowner_name}</strong> has just booked their first repair dispatch on ${brand.productName}.</p>
                 <p>Here is your <strong>$${Math.round(couponValue)} discount coupon code</strong> to use on your next booking:</p>
                 <p style="font-size: 18px; font-family: monospace; font-weight: bold; background: #f4f4f4; padding: 10px; text-align: center; border-radius: 4px; border: 1px dashed #ccc;">
                   ${rewardCode}
                 </p>
                 <p>Thank you for sharing ${brand.productName}!</p>`
        });
      } catch (_emailErr) {}
    }
  } catch (err) {
    console.error('Error in triggerReferralBookingReward:', err);
  }
}

async function applyAutoReferralDiscount(pool, jobId, partnerCode) {
  try {
    if (!partnerCode) return;
    const normalized = partnerCode.trim().toUpperCase();
    if (!normalized) return;

    // Check if it's a valid partner or user referral code
    const { rows: partners } = await pool.query(`SELECT id FROM partners WHERE LOWER(code)=LOWER($1) AND active=true LIMIT 1`, [normalized]);
    const { rows: users } = await pool.query(`SELECT id FROM users WHERE LOWER(referral_code)=LOWER($1) LIMIT 1`, [normalized]);

    if (partners.length > 0 || users.length > 0) {
      let referralDiscountValue = 25.0;
      try {
        const { rows: pr } = await pool.query(`SELECT rules FROM pricing_rules WHERE id='default'`);
        const rules = pr[0]?.rules || {};
        if (rules.referral_coupon_value != null) {
          referralDiscountValue = Number(rules.referral_coupon_value);
        }
      } catch {}

      await pool.query(
        `UPDATE managed_jobs SET
           discount_code=$1,
           discount_type='amount',
           discount_value=$2,
           discount_label=$3,
           updated_at=NOW()
         WHERE id=$4`,
        [normalized, referralDiscountValue, `Referral discount (${normalized})`, jobId]
      );
    }
  } catch (err) {
    console.error('Error in applyAutoReferralDiscount:', err);
  }
}

export const JOB_STATUSES = [
  'draft',
  'ai_review_complete',
  'awaiting_service_payment',
  'paid_for_dispatch',
  'awaiting_contractor',
  'contractor_invited',
  'contractor_accepted',
  'awaiting_bid',
  'diagnosing',
  'bid_received',
  'proposal_sent',
  'awaiting_customer_approval',
  'approved',
  'scheduled',
  'contractor_en_route',
  'work_started',
  'change_order_pending',
  'work_completed',
  'customer_review_pending',
  'admin_review_pending',
  'payout_pending',
  'paid_out',
  'closed',
  'canceled',
  'refunded',
  'disputed',
];

function formatBookingId(id, createdAt = new Date()) {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const stamp = Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10).replace(/-/g, '')
    : date.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = String(id).slice(-6).padStart(6, '0');
  return `FB-${stamp}-${suffix}`;
}

const JOB_WITH_TECH_SELECT = `
  SELECT j.*,
    u.name AS tech_name,
    u.company_name AS tech_company,
    u.phone AS tech_phone,
    u.compliance_status,
    u.insurance_document_name,
    u.insurance_document_data,
    u.insurance_details,
    u.trade AS tech_trade
  FROM managed_jobs j
  LEFT JOIN users u ON u.id = j.assigned_contractor_user_id
`;

async function fetchJobWithTech(pool, jobId) {
  const { rows } = await pool.query(`${JOB_WITH_TECH_SELECT} WHERE j.id=$1`, [jobId]);
  return rows[0] || null;
}

async function audit(pool, actorUserId, action, entityType, entityId, detail) {
  await pool.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, detail)
     VALUES ($1,$2,$3,$4,$5)`,
    [actorUserId || null, action, entityType || null, entityId != null ? String(entityId) : null, detail ? JSON.stringify(detail) : null]
  );
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendNotificationEmail({ to, subject, html }) {
  if (!to) return;
  try {
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key) return; // silently skip until RESEND_API_KEY is configured
    const { Resend } = await import('resend');
    const client = new Resend(key);
    const from = process.env.FROM_EMAIL || `${brand.productName} <onboarding@resend.dev>`;
    await client.emails.send({ from, to, subject, html });
  } catch (e) {
    console.error('[email notification]', e.message);
  }
}

async function pushStatus(pool, jobId, fromStatus, toStatus, actorUserId, note) {
  await pool.query(
    `UPDATE managed_jobs SET status=$1, updated_at=NOW() WHERE id=$2`,
    [toStatus, jobId]
  );
  await pool.query(
    `INSERT INTO job_status_history (job_id, from_status, to_status, actor_user_id, note)
     VALUES ($1,$2,$3,$4,$5)`,
    [jobId, fromStatus || null, toStatus, actorUserId || null, note || null]
  );
  try {
    await syncPartnerReferralFromJob(pool, jobId, toStatus);
  } catch (e) {
    console.error('[Partner sync]', e.message);
  }
}

async function loadPricingRules(pool) {
  const { rows } = await pool.query(`SELECT rules FROM pricing_rules WHERE id='default'`);
  return mergePricingRules(rows[0]?.rules);
}

function parseJson(val, fallback = null) {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

/** Role-aware job serializer */
function serializeJob(row, viewer) {
  if (!row) return null;
  const role = viewer?.role;
  const isAdmin = viewer?.isAdmin === true;
  const isOwner =
    viewer?.id != null && Number(viewer.id) === Number(row.homeowner_user_id);
  const isAssignedContractor =
    viewer?.id != null && Number(viewer.id) === Number(row.assigned_contractor_user_id);

  const base = {
    id: Number(row.id),
    bookingId: row.booking_id,
    jobMode: row.job_mode || 'managed',
    status: row.status,
    category: row.category,
    title: row.title,
    description: row.description,
    mediaDataUrl: row.media_data_url,
    mediaType: row.media_type,
    preferredDate: row.preferred_date,
    preferredTimeSlot: row.preferred_time_slot,
    serviceTiming: row.service_timing,
    cityStateZip: isAssignedContractor || isAdmin || isOwner ? row.city_state_zip : maskArea(row.city_state_zip),
    fullAddress: isAdmin || isOwner || (isAssignedContractor && addressUnlocked(row.status))
      ? row.full_address
      : null,
    contactName: isAdmin || isOwner || (isAssignedContractor && addressUnlocked(row.status))
      ? row.contact_name
      : null,
    contactPhone: isAdmin || isOwner || (isAssignedContractor && addressUnlocked(row.status))
      ? row.contact_phone
      : null,
    propertyId: row.property_id,
    homeownerUserId: isAdmin ? row.homeowner_user_id : undefined,
    aiAssessment: parseJson(row.ai_assessment),
    showRetailPrice: row.show_retail_price !== false,
    preferredTimeNote: 'Preferred service time — not confirmed until a contractor is scheduled.',
    partnerCode: row.partner_code,
    referringName: row.referring_name,
    referringCompany: row.referring_company,
    customerPartnerStatusConsent: row.customer_partner_status_consent === true,
    referralStatus: row.referral_status,
    propertyPurpose: row.property_purpose,
    transactionStage: row.transaction_stage,
    completionReport: parseJson(row.completion_report),
    discountCode: row.discount_code || null,
    discountLabel: row.discount_label || null,
    discountType: row.discount_type || null,
    discountValue: row.discount_value != null ? Number(row.discount_value) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assignedContractorUserId: row.assigned_contractor_user_id,
    activeProposalId: row.active_proposal_id,
    streetAddress: isAdmin || isOwner || (isAssignedContractor && addressUnlocked(row.status)) ? (row.street_address || null) : null,
    city: isAdmin || isOwner || isAssignedContractor || role === 'contractor' ? (row.city || null) : null,
    state: isAdmin || isOwner || isAssignedContractor || role === 'contractor' ? (row.state || null) : null,
    zip: isAdmin || isOwner || (isAssignedContractor && addressUnlocked(row.status)) ? (row.zip || null) : null,
    country: isAdmin || isOwner || (isAssignedContractor && addressUnlocked(row.status)) ? (row.country || null) : null,
  };

  if ((isOwner || isAdmin) && row.assigned_contractor_user_id) {
    const ratingRaw = row.tech_rating != null ? Number(row.tech_rating) : null;
    base.technician = {
      id: Number(row.assigned_contractor_user_id),
      name: row.tech_name || row.contractor_name || null,
      company: row.tech_company || row.company_name || null,
      phone: row.tech_phone || row.contractor_phone || null,
      rating: Number.isFinite(ratingRaw) ? ratingRaw : 4.9,
      verified: row.tech_verified === true || row.compliance_status === 'approved',
      insured: Boolean(
        row.tech_insured ||
          row.insurance_document_data ||
          row.insurance_document_name ||
          row.insurance_details
      ),
      trade: row.tech_trade || row.trade || null,
    };
  } else if (isOwner || isAdmin) {
    base.technician = null;
  }

  // Customer retail visibility — homeowners only see final FixBridge amounts
  if (isOwner || isAdmin) {
    base.customerRetailEstimateLow = row.customer_retail_estimate_low != null
      ? Number(row.customer_retail_estimate_low) : null;
    base.customerRetailEstimateHigh = row.customer_retail_estimate_high != null
      ? Number(row.customer_retail_estimate_high) : null;
    base.visitFeeAuthorized = row.visit_fee_authorized === true;
    base.visitFeeCaptured = row.visit_fee_captured === true;
    base.diyRiskLevel = row.diy_risk_level || 'green';
    base.pricingDisclaimer =
      'Estimated service range includes coordination, administration, payment handling and subcontracted delivery.';
    if (row.discount_code) {
      base.discountSummary =
        row.discount_type === 'amount'
          ? `$${Math.round(Number(row.discount_value) || 0)} off`
          : `${Math.round(Number(row.discount_value) || 0)}% off`;
      if (row.discount_amount_low != null) {
        base.discountAmountLow = Number(row.discount_amount_low);
        base.discountAmountHigh = Number(row.discount_amount_high);
      }
    }
  }

  // Full pricing engine blob (incl. AI raw + markup internals) — admin only
  if (isAdmin) {
    base.pricing = parseJson(row.pricing);
  } else if (isOwner) {
    base.pricing = {
      show_price: row.show_retail_price !== false,
      customer_retail_estimate_low: base.customerRetailEstimateLow,
      customer_retail_estimate_high: base.customerRetailEstimateHigh,
      disclaimer: base.pricingDisclaimer,
    };
  }

  // Contractor net visibility
  if (isAssignedContractor || isAdmin || role === 'contractor') {
    base.estimatedContractorNetLow = row.estimated_contractor_net_low != null
      ? Number(row.estimated_contractor_net_low) : null;
    base.estimatedContractorNetHigh = row.estimated_contractor_net_high != null
      ? Number(row.estimated_contractor_net_high) : null;
  }

  // Admin-only internals
  if (isAdmin) {
    base.homeownerUserId = row.homeowner_user_id;
    base.adminNotes = row.admin_notes;
    base.referralStatus = row.referral_status;
    base.referringName = row.referring_name;
    base.referringCompany = row.referring_company;
    base.estimateConfidence = row.estimate_confidence || null;
  }

  return base;
}

function maskArea(cityStateZip) {
  if (!cityStateZip) return null;
  const parts = String(cityStateZip).split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`.replace(/\d{5}(-\d{4})?/, '').trim();
  return 'Service area on file';
}

async function resolveJobDiscount(pool, jobOrCode) {
  const code =
    typeof jobOrCode === 'string'
      ? jobOrCode
      : jobOrCode?.discount_code || jobOrCode?.discountCode || '';
  const normalized = normalizeDiscountCode(code);
  if (!normalized) return null;
  // Prefer snapshot fields already on the job when present
  if (jobOrCode && typeof jobOrCode === 'object' && jobOrCode.discount_type && jobOrCode.discount_value != null) {
    return {
      code: normalized,
      label: jobOrCode.discount_label || null,
      discountType: String(jobOrCode.discount_type).toLowerCase() === 'amount' ? 'amount' : 'percent',
      value: Number(jobOrCode.discount_value),
      id: null,
    };
  }
  const row = await lookupDiscountByCode(pool, normalized);
  const checked = validateDiscountRow(row);
  if (!checked.ok) return null;
  return checked.discount;
}

async function persistJobDiscountFields(pool, jobId, discount, pricing) {
  await pool.query(
    `UPDATE managed_jobs SET
       discount_code=$1,
       discount_type=$2,
       discount_value=$3,
       discount_label=$4,
       discount_amount_low=$5,
       discount_amount_high=$6,
       updated_at=NOW()
     WHERE id=$7`,
    [
      discount?.code || null,
      discount?.discountType || null,
      discount?.value ?? null,
      discount?.label || null,
      pricing?.discount?.amountLow ?? null,
      pricing?.discount?.amountHigh ?? null,
      jobId,
    ]
  );
}

function addressUnlocked(status) {
  return [
    'approved', 'scheduled', 'contractor_en_route', 'work_started',
    'change_order_pending', 'work_completed', 'customer_review_pending',
    'admin_review_pending', 'payout_pending', 'paid_out', 'closed',
  ].includes(status);
}

function serializeBid(row, viewer) {
  const isAdmin = viewer?.isAdmin;
  const isOwnerBid = viewer?.id != null && Number(viewer.id) === Number(row.contractor_user_id);
  if (!isAdmin && !isOwnerBid) return null;
  return {
    id: Number(row.id),
    jobId: Number(row.job_id),
    contractorUserId: Number(row.contractor_user_id),
    labor: Number(row.labor || 0),
    materials: Number(row.materials || 0),
    equipment: Number(row.equipment || 0),
    travelDiagnostic: Number(row.travel_diagnostic || 0),
    permitCost: Number(row.permit_cost || 0),
    disposal: Number(row.disposal || 0),
    netTotal: Number(row.net_total),
    durationHours: row.duration_hours != null ? Number(row.duration_hours) : null,
    earliestStart: row.earliest_start,
    warranty: row.warranty,
    exclusions: row.exclusions,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
  };
}

function serializeProposal(row, viewer) {
  const isAdmin = viewer?.isAdmin;
  const isCustomer = viewer?.role === 'homeowner';
  const base = {
    id: Number(row.id),
    quoteNumber: row.quote_number || `FBQ-${String(row.id).padStart(5, '0')}`,
    jobId: Number(row.job_id),
    scopeSummary: row.scope_summary,
    retailAmount: Number(row.retail_amount),
    depositAmount: row.deposit_amount != null ? Number(row.deposit_amount) : null,
    timeline: row.timeline,
    warranty: row.warranty,
    exclusions: row.exclusions,
    status: row.status,
    publishedAt: row.published_at,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
  };
  if (isAdmin) {
    base.contractorNet = row.contractor_net != null ? Number(row.contractor_net) : null;
    base.platformGross = row.platform_gross != null ? Number(row.platform_gross) : null;
    base.processingCost = row.processing_cost != null ? Number(row.processing_cost) : null;
    base.bidId = row.bid_id;
    base.lineItems = row.line_items;
    base.pricingAdjustments = row.pricing_adjustments;
    base.adminDiscount = row.admin_discount != null ? Number(row.admin_discount) : null;
    base.adminDiscountReason = row.admin_discount_reason;
    base.couponCode = row.coupon_code;
    base.couponFundedBy = row.coupon_funded_by;
    base.quoteValidUntil = row.quote_valid_until;
    base.customerLineItems = row.customer_line_items;
    base.serviceCharge = row.service_charge != null ? Number(row.service_charge) : null;
    base.expectedMarginPct = row.expected_margin_pct != null ? Number(row.expected_margin_pct) : null;
    base.bookingId = row.booking_id || null;
    base.jobTitle = row.job_title || null;
    base.jobCategory = row.job_category || null;
    base.jobZip = row.job_zip || null;
    base.homeownerName = row.homeowner_name || null;
    base.homeownerEmail = row.homeowner_email || null;
    base.contractorName = row.contractor_name || null;
    base.aiEstimateLow = row.ai_estimate_low != null ? Number(row.ai_estimate_low) : null;
    base.aiEstimateHigh = row.ai_estimate_high != null ? Number(row.ai_estimate_high) : null;
  }
  if (isCustomer) {
    base.customerLineItems = row.customer_line_items;
    base.quoteValidUntil = row.quote_valid_until;
    base.couponCode = row.coupon_code;
  }
  if (!isAdmin && !isCustomer) {
    // Contractors must not see retail
    delete base.retailAmount;
    delete base.depositAmount;
  }
  return base;
}

async function ensureQuoteNumber(pool, proposalId) {
  const quoteNumber = `FBQ-${String(proposalId).padStart(5, '0')}`;
  await pool.query(
    `UPDATE proposals SET quote_number = COALESCE(quote_number, $1) WHERE id = $2`,
    [quoteNumber, proposalId]
  );
  return quoteNumber;
}

export function registerManagedRoutes(app, { pool, requireAuth, requireAdmin, requireAdminWrite, makeToken, rowToUser }) {
  // ── Brand ──────────────────────────────────────────────────────────────────
  app.get('/api/brand', (_req, res) => {
    res.json({ ok: true, brand });
  });

  // ── Pricing rules ──────────────────────────────────────────────────────────
  app.get('/api/pricing/rules', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const rules = await loadPricingRules(pool);
      res.json({ ok: true, rules });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.put('/api/pricing/rules', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const rules = mergePricingRules(req.body?.rules || req.body);
      await pool.query(
        `INSERT INTO pricing_rules (id, rules, updated_at, updated_by)
         VALUES ('default', $1, NOW(), $2)
         ON CONFLICT (id) DO UPDATE SET rules=$1, updated_at=NOW(), updated_by=$2`,
        [JSON.stringify(rules), req.authUser.id]
      );
      await audit(pool, req.authUser.id, 'pricing_rules_update', 'pricing_rules', 'default', rules);
      res.json({ ok: true, rules });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  /** Searchable quotes workspace — permanent FBQ numbers + internal vs customer amounts. */
  app.get('/api/admin/quotes', requireAuth, requireAdmin, async (req, res) => {
    try {
      const q = String(req.query.q || '').trim().toLowerCase();
      const status = String(req.query.status || '').trim().toLowerCase();
      const params = [];
      const where = [];
      if (status && status !== 'all') {
        params.push(status);
        where.push(`p.status = $${params.length}`);
      }
      if (q) {
        params.push(`%${q}%`);
        const i = params.length;
        where.push(`(
          LOWER(COALESCE(p.quote_number,'')) LIKE $${i}
          OR LOWER(COALESCE(j.booking_id,'')) LIKE $${i}
          OR LOWER(COALESCE(j.title,'')) LIKE $${i}
          OR LOWER(COALESCE(j.category,'')) LIKE $${i}
          OR LOWER(COALESCE(j.zip,'')) LIKE $${i}
          OR LOWER(COALESCE(hw.name,'')) LIKE $${i}
          OR LOWER(COALESCE(hw.email,'')) LIKE $${i}
          OR LOWER(COALESCE(ct.name,'')) LIKE $${i}
          OR CAST(p.retail_amount AS TEXT) LIKE $${i}
          OR CAST(p.id AS TEXT) LIKE $${i}
        )`);
      }
      const sql = `
        SELECT p.*,
               j.booking_id,
               j.title AS job_title,
               j.category AS job_category,
               j.zip AS job_zip,
               j.customer_retail_estimate_low AS ai_estimate_low,
               j.customer_retail_estimate_high AS ai_estimate_high,
               hw.name AS homeowner_name,
               hw.email AS homeowner_email,
               ct.name AS contractor_name
        FROM proposals p
        JOIN managed_jobs j ON j.id = p.job_id
        LEFT JOIN users hw ON hw.id = j.homeowner_user_id
        LEFT JOIN bids b ON b.id = p.bid_id
        LEFT JOIN users ct ON ct.id = b.contractor_user_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY p.created_at DESC NULLS LAST, p.id DESC
        LIMIT 100
      `;
      const { rows } = await pool.query(sql, params);
      for (const r of rows) {
        if (!r.quote_number) {
          r.quote_number = await ensureQuoteNumber(pool, r.id);
        }
      }
      res.json({
        ok: true,
        quotes: rows.map((r) => serializeProposal(r, { isAdmin: true, role: 'admin' })),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not load quotes.' });
    }
  });

  app.get('/api/admin/quotes/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const idOrNum = String(req.params.id || '').trim();
      const { rows } = await pool.query(
        `SELECT p.*,
                j.booking_id,
                j.title AS job_title,
                j.category AS job_category,
                j.zip AS job_zip,
                j.customer_retail_estimate_low AS ai_estimate_low,
                j.customer_retail_estimate_high AS ai_estimate_high,
                j.description AS job_description,
                j.full_address AS job_address,
                hw.name AS homeowner_name,
                hw.email AS homeowner_email,
                hw.phone AS homeowner_phone,
                ct.name AS contractor_name,
                ct.email AS contractor_email
         FROM proposals p
         JOIN managed_jobs j ON j.id = p.job_id
         LEFT JOIN users hw ON hw.id = j.homeowner_user_id
         LEFT JOIN bids b ON b.id = p.bid_id
         LEFT JOIN users ct ON ct.id = b.contractor_user_id
         WHERE p.id::text = $1 OR LOWER(COALESCE(p.quote_number,'')) = LOWER($1)
         LIMIT 1`,
        [idOrNum]
      );
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Quote not found.' });
      if (!rows[0].quote_number) {
        rows[0].quote_number = await ensureQuoteNumber(pool, rows[0].id);
      }
      res.json({ ok: true, quote: serializeProposal(rows[0], { isAdmin: true, role: 'admin' }) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load quote.' });
    }
  });

  /** ZIP + trade market intelligence for Admin. */
  app.get('/api/admin/market-intelligence', requireAuth, requireAdmin, async (req, res) => {
    try {
      const zip = String(req.query.zip || '').trim();
      const trade = String(req.query.trade || 'hvac').trim();
      if (!zip || zip.length < 3) {
        return res.status(400).json({ ok: false, message: 'Enter a ZIP code to analyze.' });
      }
      const rules = await loadPricingRules(pool);
      const prefix = zip.slice(0, 3);
      const { rows: jobs } = await pool.query(
        `SELECT id, zip, category, title, customer_retail_estimate_low, customer_retail_estimate_high, status, created_at
         FROM managed_jobs
         WHERE zip IS NOT NULL AND (zip = $1 OR zip LIKE $2)
         ORDER BY created_at DESC
         LIMIT 80`,
        [zip, `${prefix}%`]
      );
      const jobIds = jobs.map((j) => j.id);
      let bids = [];
      if (jobIds.length) {
        const { rows: bidRows } = await pool.query(
          `SELECT job_id, net_total, labor, materials, travel_diagnostic, created_at
           FROM bids
           WHERE job_id = ANY($1::bigint[])
           ORDER BY created_at DESC
           LIMIT 80`,
          [jobIds]
        );
        bids = bidRows;
      }
      const profile = buildZipMarketProfile({ zip, trade, rules, jobs, bids });
      res.json({
        ok: true,
        profile: {
          ...profile,
          locationFactor: getLocationFactorByZip(zip) || profile.locationFactor,
          market: getZipMarketLabel(zip),
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not analyze market.' });
    }
  });

  // ── Properties ─────────────────────────────────────────────────────────────
  function parseJsonSafe(value, fallback = null) {
    if (value == null) return fallback;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function serializeProperty(r, documents = []) {
    const healthProfile = parseJsonSafe(r.health_profile, null);
    const homeSystems = parseJsonSafe(r.home_systems, []) || [];
    return {
      id: Number(r.id),
      label: r.label,
      addressLine1: r.address_line1,
      addressLine2: r.address_line2,
      city: r.city,
      state: r.state,
      zip: r.zip,
      propertyType: r.property_type,
      accessNotes: r.access_notes,
      propertyPurpose: r.property_purpose,
      transactionStage: r.transaction_stage,
      country: r.country || 'US',
      streetAddress: r.street_address || r.address_line1,
      yearBuilt: r.year_built != null ? Number(r.year_built) : null,
      beds: r.beds != null ? Number(r.beds) : healthProfile?.beds ?? null,
      baths: r.baths != null ? Number(r.baths) : healthProfile?.baths ?? null,
      sqft: r.sqft != null ? Number(r.sqft) : healthProfile?.sqft ?? null,
      homeSystems: Array.isArray(homeSystems) ? homeSystems : [],
      documents: (documents || []).map((d) => ({
        id: Number(d.id),
        category: d.category,
        title: d.title,
        fileName: d.file_name,
        mimeType: d.mime_type,
        dataUrl: d.data_url,
        notes: d.notes,
        systemKey: d.system_key,
        createdAt: d.created_at,
      })),
      healthProfile,
    };
  }

  async function loadPropertyDocuments(propertyId, ownerUserId) {
    const { rows } = await pool.query(
      `SELECT * FROM property_documents
       WHERE property_id=$1 AND owner_user_id=$2
       ORDER BY created_at DESC`,
      [propertyId, ownerUserId]
    );
    return rows;
  }

  async function serializeOwnedProperty(row, ownerUserId) {
    const docs = await loadPropertyDocuments(row.id, ownerUserId);
    return serializeProperty(row, docs);
  }

  app.get('/api/properties', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM properties WHERE owner_user_id=$1 ORDER BY created_at ASC, id ASC`,
        [req.authUser.id]
      );
      const properties = [];
      for (const row of rows) {
        properties.push(await serializeOwnedProperty(row, req.authUser.id));
      }
      res.json({ ok: true, properties });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.post('/api/properties', requireAuth, async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.addressLine1) {
        return res.status(400).json({ ok: false, message: 'Address is required.' });
      }
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM properties WHERE owner_user_id=$1`,
        [req.authUser.id]
      );
      const homeNumber = (countRows[0]?.c || 0) + 1;
      const label = b.label || `My Home ${homeNumber}`;
      const defaultSystems = Array.isArray(b.homeSystems) ? b.homeSystems : [];
      const { rows } = await pool.query(
        `INSERT INTO properties
          (owner_user_id, label, address_line1, address_line2, city, state, zip, property_type, access_notes, property_purpose, transaction_stage, country, street_address, year_built, beds, baths, sqft, home_systems)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
        [
          req.authUser.id,
          label,
          b.addressLine1,
          b.addressLine2 || null,
          b.city || null,
          b.state || null,
          b.zip || null,
          b.propertyType || null,
          b.accessNotes || null,
          b.propertyPurpose || null,
          b.transactionStage || null,
          b.country || 'US',
          b.streetAddress || b.addressLine1,
          b.yearBuilt != null ? Number(b.yearBuilt) : null,
          b.beds != null ? Number(b.beds) : null,
          b.baths != null ? Number(b.baths) : null,
          b.sqft != null ? Number(b.sqft) : null,
          JSON.stringify(defaultSystems),
        ]
      );
      res.json({
        ok: true,
        property: await serializeOwnedProperty(rows[0], req.authUser.id),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.put('/api/properties/:id', requireAuth, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      const b = req.body || {};
      const { rows: owned } = await pool.query(
        `SELECT * FROM properties WHERE id=$1 AND owner_user_id=$2`,
        [propertyId, req.authUser.id]
      );
      if (!owned[0] && !req.authUser.isAdmin) {
        return res.status(404).json({ ok: false, message: 'Property not found.' });
      }
      const cur = owned[0];
      let healthProfile = parseJsonSafe(cur.health_profile, {}) || {};
      if (b.beds != null || b.baths != null || b.sqft != null) {
        healthProfile = {
          ...healthProfile,
          beds: b.beds != null ? Number(b.beds) : healthProfile.beds,
          baths: b.baths != null ? Number(b.baths) : healthProfile.baths,
          sqft: b.sqft != null ? Number(b.sqft) : healthProfile.sqft,
        };
      }
      const systems =
        b.homeSystems !== undefined
          ? Array.isArray(b.homeSystems)
            ? b.homeSystems
            : []
          : parseJsonSafe(cur.home_systems, []);

      const yearBuiltVal =
        b.yearBuilt === undefined
          ? cur.year_built
          : b.yearBuilt === null || b.yearBuilt === ''
            ? null
            : Number(b.yearBuilt);
      const bedsVal =
        b.beds === undefined ? cur.beds : b.beds === null || b.beds === '' ? null : Number(b.beds);
      const bathsVal =
        b.baths === undefined ? cur.baths : b.baths === null || b.baths === '' ? null : Number(b.baths);
      const sqftVal =
        b.sqft === undefined ? cur.sqft : b.sqft === null || b.sqft === '' ? null : Number(b.sqft);

      const { rows } = await pool.query(
        `UPDATE properties SET
           label=COALESCE($1, label),
           address_line1=COALESCE($2, address_line1),
           address_line2=$3,
           city=COALESCE($4, city),
           state=COALESCE($5, state),
           zip=COALESCE($6, zip),
           country=COALESCE($7, country),
           street_address=COALESCE($8, street_address),
           year_built=$9,
           beds=$10,
           baths=$11,
           sqft=$12,
           home_systems=$13,
           health_profile=$14,
           property_type=COALESCE($15, property_type),
           access_notes=$16
         WHERE id=$17
         RETURNING *`,
        [
          b.label != null ? String(b.label).slice(0, 80) : null,
          b.addressLine1 != null ? String(b.addressLine1).slice(0, 200) : null,
          b.addressLine2 !== undefined
            ? b.addressLine2
              ? String(b.addressLine2).slice(0, 200)
              : null
            : cur.address_line2,
          b.city != null ? String(b.city).slice(0, 80) : null,
          b.state != null ? String(b.state).slice(0, 40) : null,
          b.zip != null ? String(b.zip).slice(0, 20) : null,
          b.country != null ? String(b.country).slice(0, 40) : null,
          b.streetAddress != null ? String(b.streetAddress).slice(0, 200) : null,
          yearBuiltVal,
          bedsVal,
          bathsVal,
          sqftVal,
          JSON.stringify(systems),
          JSON.stringify(healthProfile),
          b.propertyType != null ? String(b.propertyType).slice(0, 60) : null,
          b.accessNotes !== undefined
            ? b.accessNotes
              ? String(b.accessNotes).slice(0, 500)
              : null
            : cur.access_notes,
          propertyId,
        ]
      );
      res.json({ ok: true, property: await serializeOwnedProperty(rows[0], req.authUser.id) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.post('/api/properties/:id/documents', requireAuth, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      const b = req.body || {};
      const { rows: owned } = await pool.query(
        `SELECT id FROM properties WHERE id=$1 AND owner_user_id=$2`,
        [propertyId, req.authUser.id]
      );
      if (!owned[0]) return res.status(404).json({ ok: false, message: 'Property not found.' });
      const dataUrl = String(b.dataUrl || '');
      if (!dataUrl.startsWith('data:') || dataUrl.length > 6_000_000) {
        return res.status(400).json({ ok: false, message: 'Document file is required (max ~4MB).' });
      }
      const category = String(b.category || 'other').slice(0, 40);
      const { rows } = await pool.query(
        `INSERT INTO property_documents
          (property_id, owner_user_id, category, title, file_name, mime_type, data_url, notes, system_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          propertyId,
          req.authUser.id,
          category,
          b.title ? String(b.title).slice(0, 120) : null,
          b.fileName ? String(b.fileName).slice(0, 160) : null,
          b.mimeType ? String(b.mimeType).slice(0, 80) : null,
          dataUrl,
          b.notes ? String(b.notes).slice(0, 500) : null,
          b.systemKey ? String(b.systemKey).slice(0, 60) : null,
        ]
      );
      const d = rows[0];
      res.json({
        ok: true,
        document: {
          id: Number(d.id),
          category: d.category,
          title: d.title,
          fileName: d.file_name,
          mimeType: d.mime_type,
          dataUrl: d.data_url,
          notes: d.notes,
          systemKey: d.system_key,
          createdAt: d.created_at,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.delete('/api/properties/:id/documents/:docId', requireAuth, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      const docId = Number(req.params.docId);
      const { rows } = await pool.query(
        `DELETE FROM property_documents
         WHERE id=$1 AND property_id=$2 AND owner_user_id=$3
         RETURNING id`,
        [docId, propertyId, req.authUser.id]
      );
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Document not found.' });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.put('/api/properties/:id/health', requireAuth, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      const healthProfile = req.body?.healthProfile;
      if (!healthProfile || typeof healthProfile !== 'object') {
        return res.status(400).json({ ok: false, message: 'healthProfile is required.' });
      }
      const { rows: owned } = await pool.query(
        `SELECT id FROM properties WHERE id=$1 AND owner_user_id=$2`,
        [propertyId, req.authUser.id]
      );
      if (!owned[0] && !req.authUser.isAdmin) {
        return res.status(404).json({ ok: false, message: 'Property not found.' });
      }
      const { rows } = await pool.query(
        `UPDATE properties SET
           health_profile=$1,
           beds=COALESCE($2, beds),
           baths=COALESCE($3, baths),
           sqft=COALESCE($4, sqft)
         WHERE id=$5 RETURNING *`,
        [
          JSON.stringify(healthProfile),
          healthProfile.beds != null ? Number(healthProfile.beds) : null,
          healthProfile.baths != null ? Number(healthProfile.baths) : null,
          healthProfile.sqft != null ? Number(healthProfile.sqft) : null,
          propertyId,
        ]
      );
      res.json({ ok: true, property: await serializeOwnedProperty(rows[0], req.authUser.id) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.put('/api/properties/:id/zip', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { zip } = req.body;
      if (!zip || !zip.trim()) {
        return res.status(400).json({ ok: false, message: 'ZIP code is required.' });
      }
      const { rows } = await pool.query(
        `UPDATE properties SET zip=$1 WHERE id=$2 AND owner_user_id=$3 RETURNING *`,
        [zip.trim(), id, req.authUser.id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ ok: false, message: 'Property not found.' });
      }
      const r = rows[0];
      res.json({
        ok: true,
        property: {
          id: Number(r.id),
          label: r.label,
          addressLine1: r.address_line1,
          city: r.city,
          state: r.state,
          zip: r.zip,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Server error updating property ZIP.' });
    }
  });

  app.put('/api/properties/:id/address', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const b = req.body || {};
      const { addressLine1, addressLine2, city, state, zip } = b;
      if (!addressLine1 || !city || !state || !zip) {
        return res.status(400).json({ ok: false, message: 'Street address, city, state, and ZIP code are required.' });
      }
      const { rows } = await pool.query(
        `UPDATE properties 
         SET address_line1=$1, address_line2=$2, city=$3, state=$4, zip=$5
         WHERE id=$6 AND owner_user_id=$7 RETURNING *`,
        [addressLine1.trim(), addressLine2 ? addressLine2.trim() : null, city.trim(), state.trim(), zip.trim(), id, req.authUser.id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ ok: false, message: 'Property not found.' });
      }
      const r = rows[0];
      res.json({
        ok: true,
        property: {
          id: Number(r.id),
          label: r.label,
          addressLine1: r.address_line1,
          addressLine2: r.address_line2,
          city: r.city,
          state: r.state,
          zip: r.zip,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Server error updating property address.' });
    }
  });

  // ── Public Guest Intake Endpoint ──────────────────────────────────────────
  app.post('/api/public/jobs', async (req, res) => {
    try {
      const b = req.body || {};
      const email = typeof b.email === 'string' ? b.email.trim() : '';
      const name = typeof b.contactName === 'string' ? b.contactName.trim() : '';
      const phone = typeof b.contactPhone === 'string' ? b.contactPhone.trim() : '';
      const streetAddress = typeof b.streetAddress === 'string' ? b.streetAddress.trim() : '';
      const city = typeof b.city === 'string' ? b.city.trim() : '';
      const state = typeof b.state === 'string' ? b.state.trim() : '';
      const zip = typeof b.zip === 'string' ? b.zip.trim() : '';
      const country = typeof b.country === 'string' ? b.country.trim() : 'US';
      const category = typeof b.category === 'string' ? b.category.trim() : 'Other';
      const description = typeof b.description === 'string' ? b.description.trim() : '';
      const title =
        (typeof b.title === 'string' && b.title.trim()) ||
        `${category} issue`;

      const fullAddress = [streetAddress, city, state, zip, country].filter(Boolean).join(', ') || 'TBD';
      const cityStateZip = [city, state, zip].filter(Boolean).join(', ') || 'TBD';

      if (!email || !name) {
        return res.status(400).json({ ok: false, message: 'Name and email are required to start your assessment.' });
      }

      // 1. Find or create user
      let user = null;
      const { rows: existingUsers } = await pool.query(
        'SELECT * FROM users WHERE role=\'homeowner\' AND LOWER(email)=LOWER($1)',
        [email]
      );

      if (existingUsers.length > 0) {
        user = existingUsers[0];
        // Keep profile in sync with the latest contact details from the report wizard.
        const nextName = name || user.name;
        const nextPhone = phone || user.phone || null;
        const nextAddress = fullAddress !== 'TBD' ? fullAddress : user.address || null;
        const { rows: refreshed } = await pool.query(
          `UPDATE users SET
             name = $1,
             phone = COALESCE(NULLIF($2, ''), phone),
             address = COALESCE($3, address),
             profile_phones = CASE
               WHEN (profile_phones IS NULL OR profile_phones = '[]'::jsonb)
                 AND NULLIF($2, '') IS NOT NULL
               THEN jsonb_build_array($2::text)
               ELSE profile_phones
             END,
             profile_addresses = CASE
               WHEN (profile_addresses IS NULL OR profile_addresses = '[]'::jsonb)
                 AND $3::text IS NOT NULL
               THEN jsonb_build_array($3::text)
               ELSE profile_addresses
             END
           WHERE id=$4
           RETURNING *`,
          [nextName, phone || null, fullAddress !== 'TBD' ? fullAddress : null, user.id]
        );
        user = refreshed[0] || user;
      } else {
        // Create new homeowner with a default password for the beta
        const hashed = await bcrypt.hash('password123', 10);
        const profileAddress = fullAddress !== 'TBD' ? fullAddress : null;
        const { rows: newUsers } = await pool.query(
          `INSERT INTO users (role, name, email, password, phone, address, profile_phones, profile_addresses, compliance_status)
           VALUES (
             'homeowner', $1, $2, $3, $4, $5,
             CASE WHEN $4::text IS NOT NULL THEN jsonb_build_array($4::text) ELSE '[]'::jsonb END,
             CASE WHEN $5::text IS NOT NULL THEN jsonb_build_array($5::text) ELSE '[]'::jsonb END,
             'approved'
           ) RETURNING *`,
          [name, email.toLowerCase(), hashed, phone || null, profileAddress]
        );
        user = newUsers[0];
      }

      await ensureUserReferralCodeInline(pool, user);
      if (b.partnerCode) {
        await processReferralAward(pool, user, b.partnerCode);
      }

      // 2. Check/create property
      let propertyId = null;
      if (streetAddress || city || state || zip) {
        const { rows: existingProps } = await pool.query(
          'SELECT id FROM properties WHERE owner_user_id=$1 AND LOWER(address_line1)=LOWER($2)',
          [user.id, streetAddress]
        );
        if (existingProps.length > 0) {
          propertyId = existingProps[0].id;
        } else {
          const { rows: newProps } = await pool.query(
            `INSERT INTO properties (owner_user_id, label, address_line1, city, state, zip, country, street_address)
             VALUES ($1, 'Home', $2, $3, $4, $5, $6, $7) RETURNING id`,
            [user.id, streetAddress, city, state, zip, country, streetAddress]
          );
          propertyId = newProps[0].id;
        }
      }

      // 3. Create managed job
      const { rows: newJobs } = await pool.query(
        `INSERT INTO managed_jobs
          (homeowner_user_id, property_id, status, category, title, description, media_data_url, media_type,
           city_state_zip, full_address, contact_name, contact_phone, service_timing, job_mode,
           street_address, city, state, zip, country)
         VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'managed', $13, $14, $15, $16, $17)
         RETURNING *`,
        [
          user.id,
          propertyId,
          category,
          title,
          description,
          b.mediaDataUrl || null,
          b.mediaType || null,
          cityStateZip,
          fullAddress,
          name,
          phone,
          b.serviceTiming || 'weekday',
          streetAddress,
          city,
          state,
          zip,
          country
        ]
      );
      let job = newJobs[0];
      const bookingId = formatBookingId(job.id, job.created_at);
      await pool.query(`UPDATE managed_jobs SET booking_id=$1 WHERE id=$2`, [bookingId, job.id]);
      job.booking_id = bookingId;

      // 4. Run structured AI assessment
      const result = await analyzeRepairStructured({
        category: job.category,
        description: job.description,
        imageDataUrl: job.media_data_url,
      });

      const assessment = result.assessment;
      const rules = await loadPricingRules(pool);
      const pricing = computePreliminaryRetail(assessment, rules, {
        afterHours: /evening|weekend/i.test(job.service_timing || ''),
        urgency: assessment.urgency,
        zip: job.zip || zip,
      });

      await pool.query(
        `UPDATE managed_jobs SET
           ai_assessment=$1,
           pricing=$2,
           show_retail_price=$3,
           customer_retail_estimate_low=$4,
           customer_retail_estimate_high=$5,
           estimated_contractor_net_low=$6,
           estimated_contractor_net_high=$7,
           category=COALESCE($8, category),
           diy_risk_level=$9,
           updated_at=NOW()
         WHERE id=$10`,
        [
          JSON.stringify(assessment),
          JSON.stringify(pricing),
          pricing.show_price,
          pricing.customer_retail_estimate_low,
          pricing.customer_retail_estimate_high,
          pricing.estimated_contractor_net_low,
          pricing.estimated_contractor_net_high,
          assessment.category || null,
          assessment.diy_risk_level || 'green',
          job.id,
        ]
      );

      const partnerCode = (b.partnerCode || '').trim();
      if (partnerCode) {
        const partner = await lookupPartnerByCode(pool, partnerCode);
        if (partner) {
          await pool.query(
            `UPDATE managed_jobs SET
               partner_id=$1,
               partner_code=$2,
               referral_source=COALESCE(referral_source, 'partner_link'),
               referring_name=COALESCE(NULLIF(referring_name,''), $3),
               referring_company=COALESCE(NULLIF(referring_company,''), $4),
               referring_email=COALESCE(NULLIF(referring_email,''), $5),
               referring_phone=COALESCE(NULLIF(referring_phone,''), $6),
               referral_status='referral_received'
             WHERE id=$7`,
            [
              partner.id,
              partner.code,
              partner.name,
              partner.company || null,
              partner.email || null,
              partner.phone || null,
              job.id,
            ]
          );
        } else {
          await pool.query(
            `UPDATE managed_jobs SET partner_code=$1, referral_status='referral_received' WHERE id=$2`,
            [partnerCode.toUpperCase(), job.id]
          );
        }
      }

      const discountCodeRaw = b.discountCode || '';
      if (discountCodeRaw) {
        const row = await lookupDiscountByCode(pool, discountCodeRaw);
        const checked = validateDiscountRow(row);
        if (checked.ok) {
          await persistJobDiscountFields(pool, job.id, checked.discount, null);
          await incrementDiscountUse(pool, checked.discount.id);
        } else {
          const code = normalizeDiscountCode(discountCodeRaw);
          if (code) {
            await pool.query(`UPDATE managed_jobs SET discount_code=$1 WHERE id=$2`, [code, job.id]);
          }
        }
      } else if (partnerCode) {
        await applyAutoReferralDiscount(pool, job.id, partnerCode);
      }

      // Create timeline logs
      await pushStatus(pool, job.id, null, 'draft', user.id, 'Issue reported (Public Guest)');
      await pushStatus(pool, job.id, 'draft', 'ai_review_complete', user.id, 'AI assessment complete');
      await pushStatus(pool, job.id, 'ai_review_complete', 'awaiting_service_payment', user.id, 'Awaiting dispatch fee');

      // Fetch fresh job
      const { rows: freshJobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [job.id]);
      const freshJob = freshJobs[0];

      // Convert database user row to frontend user representation
      const uiUser = rowToUser(user);
      const token = makeToken(uiUser);

      return res.json({
        ok: true,
        token,
        user: uiUser,
        job: serializeJob(freshJob, uiUser),
      });

    } catch (e) {
      console.error('public job intake:', e);
      res.status(500).json({ ok: false, message: 'Server error. Please try again.' });
    }
  });

  // ── Managed jobs: create + assess ──────────────────────────────────────────
  app.post('/api/managed/jobs', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'homeowner' && !req.authUser.isAdmin) {
        return res.status(403).json({ ok: false, message: 'Homeowners can report issues.' });
      }
      const b = req.body || {};
      if (!b.description && !b.title) {
        return res.status(400).json({ ok: false, message: 'Please describe the issue.' });
      }

      let fullAddress = b.fullAddress || '';
      let cityStateZip = b.cityStateZip || '';
      let streetAddress = b.streetAddress || '';
      let city = b.city || '';
      let state = b.state || '';
      let zip = b.zip || '';
      let country = b.country || 'US';

      if (b.propertyId) {
        const { rows: props } = await pool.query(`SELECT * FROM properties WHERE id=$1 AND owner_user_id=$2`, [
          b.propertyId,
          req.authUser.id,
        ]);
        if (props[0]) {
          const p = props[0];
          fullAddress = [p.address_line1, p.address_line2, p.city, p.state, p.zip, p.country].filter(Boolean).join(', ');
          cityStateZip = [p.city, p.state, p.zip].filter(Boolean).join(', ');
          streetAddress = p.address_line1 || '';
          city = p.city || '';
          state = p.state || '';
          zip = p.zip || '';
          country = p.country || 'US';
        }
      } else {
        // If propertyId not provided, reconstruct fullAddress and cityStateZip
        fullAddress = [streetAddress, city, state, zip, country].filter(Boolean).join(', ') || 'TBD';
        cityStateZip = [city, state, zip].filter(Boolean).join(', ') || 'TBD';
      }

      const { rows } = await pool.query(
        `INSERT INTO managed_jobs
          (homeowner_user_id, property_id, status, category, title, description, media_data_url, media_type,
           preferred_date, preferred_time_slot, service_timing, city_state_zip, full_address, contact_name, contact_phone,
           partner_code, referral_source, referring_name, referring_company, referring_email, referring_phone,
           customer_partner_status_consent, consent_timestamp, consent_version,
           property_purpose, transaction_stage, listing_deadline, closing_deadline,
           inspection_report_url, listing_reference_url, property_opportunity_notes,
           street_address, city, state, zip, country)
         VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)
         RETURNING *`,
        [
          req.authUser.id,
          b.propertyId || null,
          b.category || 'Others',
          b.title || `${b.category || 'Repair'} issue`,
          b.description || '',
          b.mediaDataUrl || null,
          b.mediaType || null,
          b.preferredDate || null,
          b.preferredTimeSlot || null,
          b.serviceTiming || 'weekday',
          cityStateZip || 'TBD',
          fullAddress || 'TBD',
          b.contactName || req.authUser.name || 'Customer',
          b.contactPhone || '',
          b.partnerCode || null,
          b.referralSource || null,
          b.referringName || null,
          b.referringCompany || null,
          b.referringEmail || null,
          b.referringPhone || null,
          Boolean(b.customerPartnerStatusConsent),
          b.customerPartnerStatusConsent ? new Date() : null,
          b.consentVersion || '1.0',
          b.propertyPurpose || null,
          b.transactionStage || null,
          b.listingDeadline || null,
          b.closingDeadline || null,
          b.inspectionReportUrl || null,
          b.listingReferenceUrl || null,
          b.propertyOpportunityNotes || null,
          streetAddress || null,
          city || null,
          state || null,
          zip || null,
          country || 'US'
        ]
      );

      let job = rows[0];
      await audit(pool, req.authUser.id, 'job_created', 'managed_job', job.id, { title: job.title, category: job.category }).catch(() => {});
      const bookingId = formatBookingId(job.id, job.created_at);
      await pool.query(`UPDATE managed_jobs SET booking_id=$1 WHERE id=$2`, [bookingId, job.id]);
      job = { ...job, booking_id: bookingId };

      const partnerCode = (b.partnerCode || '').trim();
      if (partnerCode) {
        await processReferralAward(pool, req.authUser, partnerCode);
        const partner = await lookupPartnerByCode(pool, partnerCode);
        if (partner) {
          await pool.query(
            `UPDATE managed_jobs SET
               partner_id=$1,
               partner_code=$2,
               referral_source=COALESCE(referral_source, 'partner_link'),
               referring_name=COALESCE(NULLIF(referring_name,''), $3),
               referring_company=COALESCE(NULLIF(referring_company,''), $4),
               referring_email=COALESCE(NULLIF(referring_email,''), $5),
               referring_phone=COALESCE(NULLIF(referring_phone,''), $6),
               referral_status='referral_received'
             WHERE id=$7`,
            [
              partner.id,
              partner.code,
              partner.name,
              partner.company || null,
              partner.email || null,
              partner.phone || null,
              job.id,
            ]
          );
        } else {
          // Keep typed code even if not yet in partners table; admin can still see it
          await pool.query(
            `UPDATE managed_jobs SET partner_code=$1, referral_status='referral_received' WHERE id=$2`,
            [partnerCode.toUpperCase(), job.id]
          );
        }
      }

      const discountCodeRaw = b.discountCode || '';
      if (discountCodeRaw) {
        const row = await lookupDiscountByCode(pool, discountCodeRaw);
        const checked = validateDiscountRow(row);
        if (checked.ok) {
          await persistJobDiscountFields(pool, job.id, checked.discount, null);
          await incrementDiscountUse(pool, checked.discount.id);
        } else {
          // Still store the typed code so admin can see the attempt
          const code = normalizeDiscountCode(discountCodeRaw);
          if (code) {
            await pool.query(`UPDATE managed_jobs SET discount_code=$1 WHERE id=$2`, [code, job.id]);
          }
        }
      } else if (partnerCode) {
        await applyAutoReferralDiscount(pool, job.id, partnerCode);
      }

      await pushStatus(pool, job.id, null, 'draft', req.authUser.id, 'Issue reported');
      const { rows: fresh } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [job.id]);
      res.json({ ok: true, job: serializeJob(fresh[0], req.authUser) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not create job.' });
    }
  });

  app.post('/api/managed/jobs/:id/assess', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Job not found.' });
      const job = rows[0];
      if (Number(job.homeowner_user_id) !== Number(req.authUser.id) && !req.authUser.isAdmin) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }

      const result = await analyzeRepairStructured({
        category: job.category,
        description: job.description,
        imageDataUrl: job.media_data_url,
      });

      const assessment = result.assessment;
      const rules = await loadPricingRules(pool);
      const afterHours = /evening|weekend/i.test(job.service_timing || '');
      let pricing = computePreliminaryRetail(assessment, rules, {
        afterHours,
        urgency: assessment.urgency,
        zip: job.zip || null,
      });
      const discount = await resolveJobDiscount(pool, job);
      if (discount) {
        pricing = applyDiscountToPricing(pricing, discount);
      }

      await pool.query(
        `UPDATE managed_jobs SET
           ai_assessment=$1,
           pricing=$2,
           show_retail_price=$3,
           customer_retail_estimate_low=$4,
           customer_retail_estimate_high=$5,
           estimated_contractor_net_low=$6,
           estimated_contractor_net_high=$7,
           category=COALESCE($8, category),
           discount_amount_low=$9,
           discount_amount_high=$10,
           diy_risk_level=$11,
           estimate_confidence=$12,
           updated_at=NOW()
         WHERE id=$13`,
        [
          JSON.stringify(assessment),
          JSON.stringify(pricing),
          pricing.show_price,
          pricing.customer_retail_estimate_low,
          pricing.customer_retail_estimate_high,
          pricing.estimated_contractor_net_low,
          pricing.estimated_contractor_net_high,
          assessment.category || null,
          pricing.discount?.amountLow ?? null,
          pricing.discount?.amountHigh ?? null,
          assessment.diy_risk_level || 'green',
          confidenceLabel(assessment.confidence),
          jobId,
        ]
      );
      await pushStatus(pool, jobId, job.status, 'ai_review_complete', req.authUser.id, 'AI assessment complete');
      await pushStatus(pool, jobId, 'ai_review_complete', 'awaiting_service_payment', req.authUser.id, 'Awaiting dispatch fee');

      const { rows: fresh } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      res.json({
        ok: true,
        job: serializeJob(fresh[0], req.authUser),
        assessment,
        pricing: {
          showPrice: pricing.show_price,
          message: pricing.message,
          customerRetailEstimateLow: pricing.customer_retail_estimate_low,
          customerRetailEstimateHigh: pricing.customer_retail_estimate_high,
          disclaimer: pricing.disclaimer,
        },
        source: result.source,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Assessment failed. Please retry or request a professional.' });
    }
  });

  // ── List jobs ──────────────────────────────────────────────────────────────
  app.get('/api/managed/jobs/my', requireAuth, async (req, res) => {
    try {
      let rows;
      if (req.authUser.role === 'homeowner') {
        ({ rows } = await pool.query(
          `${JOB_WITH_TECH_SELECT}
           WHERE j.homeowner_user_id=$1
           ORDER BY j.created_at DESC`,
          [req.authUser.id]
        ));
      } else if (req.authUser.role === 'contractor') {
        ({ rows } = await pool.query(
          `SELECT j.* FROM managed_jobs j
           WHERE j.assigned_contractor_user_id=$1
              OR j.id IN (SELECT job_id FROM job_invitations WHERE contractor_user_id=$1)
           ORDER BY j.created_at DESC`,
          [req.authUser.id]
        ));
      } else {
        rows = [];
      }
      res.json({ ok: true, jobs: rows.map((r) => serializeJob(r, req.authUser)) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.get('/api/managed/jobs/:id', requireAuth, async (req, res) => {
    try {
      const job = await fetchJobWithTech(pool, Number(req.params.id));
      if (!job) return res.status(404).json({ ok: false, message: 'Not found.' });
      const allowed =
        req.authUser.isAdmin ||
        Number(job.homeowner_user_id) === Number(req.authUser.id) ||
        Number(job.assigned_contractor_user_id) === Number(req.authUser.id) ||
        (
          await pool.query(`SELECT 1 FROM job_invitations WHERE job_id=$1 AND contractor_user_id=$2`, [
            job.id,
            req.authUser.id,
          ])
        ).rows.length > 0;
      if (!allowed) return res.status(403).json({ ok: false, message: 'Not allowed.' });
      res.json({ ok: true, job: serializeJob(job, req.authUser) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.get('/api/admin/managed/jobs', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM managed_jobs ORDER BY created_at DESC`);
      res.json({ ok: true, jobs: rows.map((r) => serializeJob(r, { isAdmin: true, role: 'admin' })) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── Dispatch fee payment ───────────────────────────────────────────────────
  app.post('/api/managed/jobs/:id/pay-dispatch', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      const job = rows[0];
      if (Number(job.homeowner_user_id) !== Number(req.authUser.id) && !req.authUser.isAdmin) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      if (!['awaiting_service_payment', 'ai_review_complete'].includes(job.status)) {
        return res.status(400).json({ ok: false, message: 'Dispatch authorization not due for this status.' });
      }

      const rules = await loadPricingRules(pool);
      
      // Calculate specific visit fee based on assigned/available contractor in that trade
      let visitFee = 125;
      if (job.assigned_contractor_user_id) {
        const { rows: pros } = await pool.query('SELECT visit_fee, emergency_visit_fee FROM users WHERE id=$1', [job.assigned_contractor_user_id]);
        if (pros[0]) {
          const isEmergency = job.service_timing === 'emergency' || String(job.title).toLowerCase().includes('emerg') || String(job.description).toLowerCase().includes('emerg');
          visitFee = Number(isEmergency ? (pros[0].emergency_visit_fee || pros[0].visit_fee || 125) : (pros[0].visit_fee || 125));
        }
      } else {
        const { rows: pros } = await pool.query(
          'SELECT visit_fee FROM users WHERE role=\'contractor\' AND compliance_status=\'approved\' AND LOWER(trade)=LOWER($1) LIMIT 1',
          [job.category]
        );
        if (pros[0]) {
          visitFee = Number(pros[0].visit_fee || 125);
        } else {
          visitFee = Number(rules.default_visit_fee || 125);
        }
      }

      const amountBeforeDiscount = visitFee;
      let amount = visitFee;
      let dispatchDiscount = null;
      const discount = await resolveJobDiscount(pool, job);
      if (discount) {
        const applied = applyDiscountToAmount(amount, discount);
        amount = applied.retail;
        dispatchDiscount = {
          code: discount.code,
          discountAmount: applied.discountAmount,
          originalAmount: amountBeforeDiscount,
        };
      }
      amount = Math.max(0, Math.round(amount * 100) / 100);

      const simulate = shouldSimulatePayment(req.body?.simulate === true);

      if (simulate) {
        await pool.query(
          `INSERT INTO payments (job_id, user_id, payment_type, amount, status, simulated, meta)
           VALUES ($1,$2,'dispatch_fee',$3,'authorized',true,$4)`,
          [jobId, req.authUser.id, amount, JSON.stringify({ contractorVisitPayout: amount, dispatchDiscount })]
        );
        await pool.query(
          `UPDATE managed_jobs SET
             visit_fee_authorized=true,
             updated_at=NOW()
           WHERE id=$1`,
          [jobId]
        );
        await pushStatus(pool, jobId, job.status, 'paid_for_dispatch', req.authUser.id, 'Visit fee authorized (simulated hold placed)');
        await pushStatus(pool, jobId, 'paid_for_dispatch', 'awaiting_contractor', req.authUser.id, 'Ready for dispatch');
        await audit(pool, req.authUser.id, 'dispatch_fee_authorized', 'managed_job', jobId, {
          amount,
          originalAmount: amountBeforeDiscount,
          dispatchDiscount,
          simulated: true,
        });
        await triggerReferralBookingReward(pool, jobId);
        
        const { rows: fresh } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
        return res.json({
          ok: true,
          simulated: true,
          amount,
          job: serializeJob(fresh[0], req.authUser),
        });
      }

      const origin = req.get('origin') || req.get('referer');
      const checkout = await createCheckoutSession({
        amountCents: Math.round(amount * 100),
        customerEmail: req.authUser.email,
        description: `${brand.productName} Contractor Visit Pre-Authorization Hold`,
        successPath: `/?paid=dispatch&job=${jobId}`,
        cancelPath: `/?canceled=dispatch&job=${jobId}`,
        origin,
        metadata: { jobId: String(jobId), paymentType: 'dispatch_fee', userId: String(req.authUser.id), captureMethod: 'manual' },
      });

      await pool.query(
        `INSERT INTO payments (job_id, user_id, payment_type, amount, status, stripe_session_id, simulated, meta)
         VALUES ($1,$2,'dispatch_fee',$3,'pending',$4,false,$5)`,
         [jobId, req.authUser.id, amount, checkout.sessionId, JSON.stringify({ contractorVisitPayout: amount, dispatchDiscount })]
      );

      res.json({ ok: true, simulated: false, url: checkout.url, amount });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── Admin invite / assign ──────────────────────────────────────────────────
  app.post('/api/admin/managed/jobs/:id/invite', requireAuth, requireAdmin, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const contractorUserId = Number(req.body?.contractorUserId);
      if (!Number.isFinite(jobId) || jobId <= 0) {
        return res.status(400).json({ ok: false, message: 'Invalid job.' });
      }
      if (!Number.isFinite(contractorUserId) || contractorUserId <= 0) {
        return res.status(400).json({ ok: false, message: 'Select a contractor to invite.' });
      }

      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Job not found.' });
      const job = rows[0];

      const { rows: contractors } = await pool.query(
        `SELECT * FROM users WHERE id=$1 AND role='contractor'`,
        [contractorUserId]
      );
      if (!contractors[0]) return res.status(404).json({ ok: false, message: 'Contractor not found.' });
      if (contractors[0].is_blocked === true) {
        return res.status(400).json({ ok: false, message: 'This contractor account is blocked.' });
      }
      const compliance = String(contractors[0].compliance_status || 'draft').toLowerCase();
      if (['suspended', 'rejected', 'blocked'].includes(compliance)) {
        return res.status(400).json({ ok: false, message: 'Contractor is suspended or rejected.' });
      }
      if (compliance !== 'approved') {
        return res.status(400).json({
          ok: false,
          message: 'Contractor is not approved yet. Approve them under Contractors first.',
        });
      }
      // Document presence checks
      if (!contractors[0].license_document_data) {
        return res.status(400).json({ ok: false, message: 'Contractor has not uploaded a license document. Documents are required before inviting.' });
      }
      if (!contractors[0].insurance_document_data) {
        return res.status(400).json({ ok: false, message: 'Contractor has not uploaded an insurance document. Documents are required before inviting.' });
      }
      // Expiry checks
      const today = new Date().toISOString().slice(0, 10);
      if (contractors[0].license_expires_at && String(contractors[0].license_expires_at).slice(0, 10) < today) {
        return res.status(400).json({ ok: false, message: 'Contractor license has expired. Ask them to update their license before inviting.' });
      }
      if (contractors[0].insurance_expires_at && String(contractors[0].insurance_expires_at).slice(0, 10) < today) {
        return res.status(400).json({ ok: false, message: 'Contractor insurance has expired. Ask them to update their insurance before inviting.' });
      }


      await pool.query(
        `INSERT INTO job_invitations (job_id, contractor_user_id, status, expected_net_low, expected_net_high, message, invited_by, request_type, site_visit_window)
         VALUES ($1,$2,'invited',$3,$4,$5,$6,$7,$8)
         ON CONFLICT (job_id, contractor_user_id) DO UPDATE SET
           status='invited',
           expected_net_low=EXCLUDED.expected_net_low,
           expected_net_high=EXCLUDED.expected_net_high,
           message=EXCLUDED.message,
           invited_by=EXCLUDED.invited_by,
           request_type=EXCLUDED.request_type,
           site_visit_window=EXCLUDED.site_visit_window,
           responded_at=NULL`,
        [
          jobId,
          contractorUserId,
          job.estimated_contractor_net_low,
          job.estimated_contractor_net_high,
          req.body?.message || null,
          req.authUser.id,
          req.body?.requestType === 'site_visit' ? 'site_visit' : 'remote_quote',
          req.body?.siteVisitWindow || null,
        ]
      );

      if (req.body?.requestType) {
        await pool.query(
          `UPDATE managed_jobs SET quote_request_mode=$1, updated_at=NOW() WHERE id=$2`,
          [req.body.requestType === 'site_visit' ? 'site_visit' : 'remote_quote', jobId],
        );
      }

      // Move job into invited state when still pre-assignment
      const preInvite = [
        'draft',
        'ai_review_complete',
        'awaiting_service_payment',
        'paid_for_dispatch',
        'awaiting_contractor',
      ];
      if (preInvite.includes(job.status)) {
        await pushStatus(pool, jobId, job.status, 'contractor_invited', req.authUser.id, 'Contractor invited');
      }

      await audit(pool, req.authUser.id, 'contractor_invited', 'managed_job', jobId, { contractorUserId });
      const { rows: fresh } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      res.json({
        ok: true,
        job: serializeJob(fresh[0], req.authUser),
        contractor: {
          id: Number(contractors[0].id),
          name: contractors[0].name,
          email: contractors[0].email,
          trade: contractors[0].trade,
        },
      });
    } catch (e) {
      console.error('invite:', e);
      res.status(500).json({ ok: false, message: 'Could not invite contractor.' });
    }
  });

  app.post('/api/admin/managed/jobs/:id/assign', requireAuth, requireAdmin, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const contractorUserId = Number(req.body?.contractorUserId);
      if (!Number.isFinite(jobId) || jobId <= 0) {
        return res.status(400).json({ ok: false, message: 'Invalid job.' });
      }
      if (!Number.isFinite(contractorUserId) || contractorUserId <= 0) {
        return res.status(400).json({ ok: false, message: 'Select a contractor to assign.' });
      }

      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Job not found.' });

      const { rows: contractors } = await pool.query(
        `SELECT * FROM users WHERE id=$1 AND role='contractor'`,
        [contractorUserId]
      );
      if (!contractors[0]) return res.status(404).json({ ok: false, message: 'Contractor not found.' });
      if (contractors[0].is_blocked === true) {
        return res.status(400).json({ ok: false, message: 'This contractor account is blocked.' });
      }
      const compliance = String(contractors[0].compliance_status || 'draft').toLowerCase();
      if (['suspended', 'rejected', 'blocked'].includes(compliance)) {
        return res.status(400).json({ ok: false, message: 'Contractor is suspended or rejected.' });
      }
      if (compliance !== 'approved') {
        return res.status(400).json({
          ok: false,
          message: 'Contractor is not approved yet. Approve them under Contractors first.',
        });
      }
      // Document presence checks (same gates as invite path)
      if (!contractors[0].license_document_data) {
        return res.status(400).json({ ok: false, message: 'Contractor has not uploaded a license document. Documents are required before assignment.' });
      }
      if (!contractors[0].insurance_document_data) {
        return res.status(400).json({ ok: false, message: 'Contractor has not uploaded an insurance document. Documents are required before assignment.' });
      }
      // Expiry checks
      const today = new Date().toISOString().slice(0, 10);
      if (contractors[0].license_expires_at && String(contractors[0].license_expires_at).slice(0, 10) < today) {
        return res.status(400).json({ ok: false, message: 'Contractor license has expired. Ask them to update their license before assignment.' });
      }
      if (contractors[0].insurance_expires_at && String(contractors[0].insurance_expires_at).slice(0, 10) < today) {
        return res.status(400).json({ ok: false, message: 'Contractor insurance has expired. Ask them to update their insurance before assignment.' });
      }


      // Ensure invitation row exists so contractor sees it in their portal
      await pool.query(
        `INSERT INTO job_invitations (job_id, contractor_user_id, status, expected_net_low, expected_net_high, invited_by)
         VALUES ($1,$2,'accepted',$3,$4,$5)
         ON CONFLICT (job_id, contractor_user_id) DO UPDATE SET
           status='accepted',
           responded_at=COALESCE(job_invitations.responded_at, NOW())`,
        [
          jobId,
          contractorUserId,
          rows[0].estimated_contractor_net_low,
          rows[0].estimated_contractor_net_high,
          req.authUser.id,
        ]
      );

      await pool.query(
        `UPDATE managed_jobs SET assigned_contractor_user_id=$1, updated_at=NOW() WHERE id=$2`,
        [contractorUserId, jobId]
      );

      const current = rows[0].status;
      if (!['awaiting_bid', 'bid_received', 'proposal_sent', 'awaiting_customer_approval', 'approved', 'scheduled', 'work_started', 'work_completed', 'payout_pending', 'paid_out', 'closed'].includes(current)) {
        await pushStatus(pool, jobId, current, 'contractor_accepted', req.authUser.id, 'Contractor assigned');
        await pushStatus(pool, jobId, 'contractor_accepted', 'awaiting_bid', req.authUser.id, 'Awaiting confidential net bid');
      } else if (current === 'contractor_invited' || current === 'contractor_accepted') {
        await pushStatus(pool, jobId, current, 'awaiting_bid', req.authUser.id, 'Awaiting confidential net bid');
      }

      await audit(pool, req.authUser.id, 'contractor_assigned', 'managed_job', jobId, { contractorUserId });
      const { rows: fresh } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      res.json({
        ok: true,
        job: serializeJob(fresh[0], req.authUser),
        contractor: {
          id: Number(contractors[0].id),
          name: contractors[0].name,
          email: contractors[0].email,
        },
      });
    } catch (e) {
      console.error('assign:', e);
      res.status(500).json({ ok: false, message: 'Could not assign contractor.' });
    }
  });

  app.post('/api/admin/managed/jobs/:id/apply-discount', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const codeRaw = String(req.body?.code || '').trim();
      if (!codeRaw) {
        return res.status(400).json({ ok: false, message: 'Coupon code is required.' });
      }

      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Job not found.' });

      const row = await lookupDiscountByCode(pool, codeRaw);
      const checked = validateDiscountRow(row);
      if (!checked.ok) {
        return res.status(400).json({ ok: false, message: checked.message });
      }
      const discount = checked.discount;

      const job = rows[0];
      const pricing = applyDiscountToPricing(
        {
          customer_retail_estimate_low: job.customer_retail_estimate_low,
          customer_retail_estimate_high: job.customer_retail_estimate_high,
          show_price: job.show_retail_price !== false,
        },
        discount
      );

      await persistJobDiscountFields(pool, jobId, discount, pricing);
      await audit(pool, req.authUser.id, 'discount_applied_to_job', 'managed_job', jobId, {
        code: discount.code,
        discountType: discount.discountType,
        value: discount.value,
        appliedBy: 'admin',
      });

      const { rows: fresh } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      res.json({
        ok: true,
        discount: publicDiscountView(discount),
        job: serializeJob(fresh[0], req.authUser),
      });
    } catch (e) {
      console.error('apply-discount:', e);
      res.status(500).json({ ok: false, message: 'Could not apply coupon.' });
    }
  });

  // ── Contractor invitations & bids ──────────────────────────────────────────
  app.get('/api/contractor/invitations', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') {
        return res.status(403).json({ ok: false, message: 'Contractors only.' });
      }
      const { rows } = await pool.query(
        `SELECT i.*, j.category, j.title, j.description, j.media_data_url, j.media_type,
                j.preferred_date, j.preferred_time_slot, j.service_timing, j.city_state_zip,
                j.ai_assessment, j.status AS job_status, j.booking_id,
                j.estimated_contractor_net_low, j.estimated_contractor_net_high
         FROM job_invitations i
         JOIN managed_jobs j ON j.id = i.job_id
         WHERE i.contractor_user_id=$1
         ORDER BY i.created_at DESC`,
        [req.authUser.id]
      );
      res.json({
        ok: true,
        invitations: rows.map((r) => ({
          id: Number(r.id),
          jobId: Number(r.job_id),
          status: r.status,
          bookingId: r.booking_id,
          category: r.category,
          title: r.title,
          description: r.description,
          mediaDataUrl: r.media_data_url || null,
          mediaType: r.media_type || null,
          preferredDate: r.preferred_date,
          preferredTimeSlot: r.preferred_time_slot,
          serviceTiming: r.service_timing,
          cityStateZip: r.city_state_zip,
          jobStatus: r.job_status,
          aiAssessment: parseJson(r.ai_assessment),
          expectedNetLow: r.expected_net_low != null ? Number(r.expected_net_low) : Number(r.estimated_contractor_net_low),
          expectedNetHigh: r.expected_net_high != null ? Number(r.expected_net_high) : Number(r.estimated_contractor_net_high),
          // Never expose full address / contact / retail here
        })),
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.post('/api/contractor/invitations/:id/respond', requireAuth, async (req, res) => {
    try {
      const invId = Number(req.params.id);
      const action = String(req.body?.action || '').toLowerCase();
      if (!['accept', 'decline'].includes(action)) {
        return res.status(400).json({ ok: false, message: 'action must be accept or decline' });
      }
      const { rows } = await pool.query(
        `SELECT * FROM job_invitations WHERE id=$1 AND contractor_user_id=$2`,
        [invId, req.authUser.id]
      );
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Invitation not found.' });
      const status = action === 'accept' ? 'accepted' : 'declined';
      await pool.query(
        `UPDATE job_invitations SET status=$1, responded_at=NOW() WHERE id=$2`,
        [status, invId]
      );
      if (action === 'accept') {
        const jobId = rows[0].job_id;
        await pool.query(
          `UPDATE managed_jobs SET assigned_contractor_user_id=$1, updated_at=NOW() WHERE id=$2`,
          [req.authUser.id, jobId]
        );
        const { rows: jobs } = await pool.query(`SELECT status FROM managed_jobs WHERE id=$1`, [jobId]);
        await pushStatus(pool, jobId, jobs[0]?.status, 'contractor_accepted', req.authUser.id, 'Contractor accepted');
        await pushStatus(pool, jobId, 'contractor_accepted', 'awaiting_bid', req.authUser.id, 'Awaiting confidential net bid');
      }
      res.json({ ok: true, status });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.post('/api/contractor/bids', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') {
        return res.status(403).json({ ok: false, message: 'Contractors only.' });
      }
      const b = req.body || {};
      const jobId = Number(b.jobId);
      const labor = Number(b.labor || 0);
      const materials = Number(b.materials || 0);
      const equipment = Number(b.equipment || 0);
      const travel = Number(b.travelDiagnostic || 0);
      const permit = Number(b.permitCost || 0);
      const disposal = Number(b.disposal || 0);
      const netTotal = Number(
        b.netTotal != null ? b.netTotal : labor + materials + equipment + travel + permit + disposal
      );
      if (!jobId || !(netTotal > 0)) {
        return res.status(400).json({ ok: false, message: 'Valid jobId and net total required.' });
      }

      const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!jobs[0]) return res.status(404).json({ ok: false, message: 'Job not found.' });
      const invited = await pool.query(
        `SELECT id FROM job_invitations WHERE job_id=$1 AND contractor_user_id=$2`,
        [jobId, req.authUser.id]
      );
      if (!invited.rows.length && Number(jobs[0].assigned_contractor_user_id) !== Number(req.authUser.id)) {
        return res.status(403).json({ ok: false, message: 'Not invited to this job.' });
      }

      const { rows } = await pool.query(
        `INSERT INTO bids
          (job_id, contractor_user_id, invitation_id, labor, materials, equipment, travel_diagnostic,
           permit_cost, disposal, net_total, duration_hours, earliest_start, warranty, exclusions, notes, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'submitted')
         RETURNING *`,
        [
          jobId,
          req.authUser.id,
          invited.rows[0]?.id || null,
          labor,
          materials,
          equipment,
          travel,
          permit,
          disposal,
          netTotal,
          b.durationHours || null,
          b.earliestStart || null,
          b.warranty || null,
          b.exclusions || null,
          b.notes || null,
        ]
      );

      await pushStatus(pool, jobId, jobs[0].status, 'bid_received', req.authUser.id, 'Confidential net bid submitted');
      await audit(pool, req.authUser.id, 'bid_submitted', 'bid', rows[0].id, { jobId, netTotal });

      res.json({ ok: true, bid: serializeBid(rows[0], req.authUser) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.get('/api/managed/jobs/:id/bids', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      if (!req.authUser.isAdmin && req.authUser.role !== 'contractor') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      let q = `SELECT * FROM bids WHERE job_id=$1`;
      const params = [jobId];
      if (!req.authUser.isAdmin) {
        q += ` AND contractor_user_id=$2`;
        params.push(req.authUser.id);
      }
      q += ` ORDER BY created_at DESC`;
      const { rows } = await pool.query(q, params);
      res.json({
        ok: true,
        bids: rows.map((r) => serializeBid(r, req.authUser)).filter(Boolean),
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── Admin quote builder preview ──────────────────────────────────────────────
  app.get('/api/admin/managed/jobs/:id/quote-builder', requireAuth, requireAdmin, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const bidId = Number(req.query.bidId);
      const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!jobs[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      const job = jobs[0];
      const { rows: bids } = await pool.query(`SELECT * FROM bids WHERE id=$1 AND job_id=$2`, [bidId, jobId]);
      if (!bids[0]) return res.status(404).json({ ok: false, message: 'Bid not found.' });

      const rules = await loadPricingRules(pool);
      const assessment = parseJson(job.ai_assessment);
      const afterHours = /evening|weekend/i.test(job.service_timing || '');
      const quote = computeCustomerQuoteFromBid(Number(bids[0].net_total), rules, {
        urgency: assessment?.urgency,
        afterHours,
        zip: job.zip,
        serviceCharge: 25,
      });

      const aiLow = job.customer_retail_estimate_low != null ? Number(job.customer_retail_estimate_low) : null;
      const aiHigh = job.customer_retail_estimate_high != null ? Number(job.customer_retail_estimate_high) : null;
      const contractorNet = Number(bids[0].net_total);
      let marketPosition = 'unknown';
      if (aiLow != null && aiHigh != null) {
        if (contractorNet < aiLow) marketPosition = 'below_range';
        else if (contractorNet > aiHigh) marketPosition = 'above_range';
        else marketPosition = 'within_range';
      }

      res.json({
        ok: true,
        job: serializeJob(job, req.authUser),
        bid: serializeBid(bids[0]),
        aiEstimate: {
          low: aiLow,
          high: aiHigh,
          confidence: job.estimate_confidence || confidenceLabel(assessment?.confidence),
          contractorNetLow: job.estimated_contractor_net_low != null ? Number(job.estimated_contractor_net_low) : null,
          contractorNetHigh: job.estimated_contractor_net_high != null ? Number(job.estimated_contractor_net_high) : null,
        },
        marketPosition,
        quotePreview: quote,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not load quote builder.' });
    }
  });

  app.post('/api/admin/managed/jobs/:id/quote-builder/preview', requireAuth, requireAdmin, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const bidId = Number(req.body?.bidId);
      const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!jobs[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      const job = jobs[0];
      const { rows: bids } = await pool.query(`SELECT * FROM bids WHERE id=$1 AND job_id=$2`, [bidId, jobId]);
      if (!bids[0]) return res.status(404).json({ ok: false, message: 'Bid not found.' });

      const rules = await loadPricingRules(pool);
      const assessment = parseJson(job.ai_assessment);
      const afterHours = /evening|weekend/i.test(job.service_timing || '');
      const quote = computeCustomerQuoteFromBid(Number(bids[0].net_total), rules, {
        urgency: assessment?.urgency,
        afterHours,
        zip: job.zip,
        serviceCharge: req.body?.serviceCharge != null ? Number(req.body.serviceCharge) : 25,
        adjustments: req.body?.pricingAdjustments || [],
        adminDiscount: req.body?.adminDiscount,
        couponAmount: req.body?.couponAmount,
      });

      const aiLow = job.customer_retail_estimate_low != null ? Number(job.customer_retail_estimate_low) : null;
      const aiHigh = job.customer_retail_estimate_high != null ? Number(job.customer_retail_estimate_high) : null;
      const contractorNet = Number(bids[0].net_total);
      let marketPosition = 'unknown';
      if (aiLow != null && aiHigh != null) {
        if (contractorNet < aiLow) marketPosition = 'below_range';
        else if (contractorNet > aiHigh) marketPosition = 'above_range';
        else marketPosition = 'within_range';
      }

      res.json({
        ok: true,
        aiEstimate: {
          low: aiLow,
          high: aiHigh,
          confidence: job.estimate_confidence || confidenceLabel(assessment?.confidence),
        },
        marketPosition,
        quotePreview: quote,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not preview quote.' });
    }
  });

  // ── Admin proposals ────────────────────────────────────────────────────────
  app.post('/api/admin/managed/jobs/:id/proposal', requireAuth, requireAdmin, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const bidId = Number(req.body?.bidId);
      const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!jobs[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      const { rows: bids } = await pool.query(`SELECT * FROM bids WHERE id=$1 AND job_id=$2`, [bidId, jobId]);
      if (!bids[0]) return res.status(404).json({ ok: false, message: 'Bid not found.' });

      const rules = await loadPricingRules(pool);
      const assessment = parseJson(jobs[0].ai_assessment);
      const afterHours = /evening|weekend/i.test(jobs[0].service_timing || '');

      const adjustments = Array.isArray(req.body?.pricingAdjustments) ? req.body.pricingAdjustments : [];
      const serviceCharge = req.body?.serviceCharge != null ? Number(req.body.serviceCharge) : 25;
      let couponAmount = 0;
      let couponCode = req.body?.couponCode || null;
      if (couponCode) {
        const discount = await lookupDiscountByCode(pool, couponCode);
        if (discount) couponAmount = Number(discount.value) || 0;
      }

      const quote = computeCustomerQuoteFromBid(Number(bids[0].net_total), rules, {
        urgency: assessment?.urgency,
        afterHours,
        zip: jobs[0].zip,
        serviceCharge,
        adjustments,
        adminDiscount: req.body?.adminDiscount,
        couponAmount,
      });

      let retail = req.body?.retailAmount != null ? Number(req.body.retailAmount) : quote.customerQuote;
      const discount = await resolveJobDiscount(pool, jobs[0]);
      if (discount && req.body?.retailAmount == null && !couponCode) {
        const applied = applyDiscountToAmount(retail, discount);
        retail = applied.retail;
      }

      const validHours = Number(req.body?.quoteValidHours || 48);
      const quoteValidUntil = req.body?.quoteValidUntil
        ? new Date(req.body.quoteValidUntil)
        : new Date(Date.now() + validHours * 3600 * 1000);

      const customerLineItems = [
        { label: 'Service & Labor', amount: quote.baseRetail, visible: true },
        ...(adjustments.filter((a) => a.includeInDisplay !== false).map((a) => ({
          label: a.label || a.type || 'Adjustment',
          amount: a.calculation === 'percent'
            ? Math.round(quote.baseRetail * (Number(a.amount) / 100))
            : Number(a.amount),
          visible: true,
        }))),
        ...(serviceCharge > 0 ? [{ label: 'Service charge', amount: serviceCharge, visible: true }] : []),
        ...(quote.adminDiscount > 0 ? [{ label: 'Discount', amount: -quote.adminDiscount, visible: true }] : []),
        ...(couponAmount > 0 ? [{ label: couponCode || 'Coupon', amount: -couponAmount, visible: true }] : []),
      ];

      const { rows } = await pool.query(
        `INSERT INTO proposals
          (job_id, bid_id, scope_summary, retail_amount, deposit_amount, timeline, warranty, exclusions,
           contractor_net, platform_gross, processing_cost, status, created_by, published_at,
           line_items, pricing_adjustments, admin_discount, admin_discount_reason, coupon_code, coupon_funded_by,
           quote_valid_until, customer_line_items, service_charge, expected_margin_pct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'sent',$12,NOW(),$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         RETURNING *`,
        [
          jobId,
          bidId,
          req.body?.scopeSummary || jobs[0].description || jobs[0].title,
          retail,
          req.body?.depositAmount != null ? Number(req.body.depositAmount) : retail,
          req.body?.timeline || null,
          req.body?.warranty || bids[0].warranty,
          req.body?.exclusions || bids[0].exclusions,
          quote.contractorNet,
          quote.netContribution,
          quote.processingCost,
          req.authUser.id,
          JSON.stringify(req.body?.lineItems || customerLineItems),
          JSON.stringify(adjustments),
          quote.adminDiscount,
          req.body?.adminDiscount?.reason || null,
          couponCode,
          req.body?.couponFundedBy || 'fixbridge',
          quoteValidUntil.toISOString(),
          JSON.stringify(customerLineItems),
          serviceCharge,
          quote.expectedMarginPct,
        ]
      );

      const quoteNumber = await ensureQuoteNumber(pool, rows[0].id);
      rows[0].quote_number = quoteNumber;

      await recordFinancialSnapshot(pool, {
        jobId,
        snapshotType: 'customer_quote',
        createdBy: req.authUser.id,
        data: {
          aiEstimateLow: jobs[0].customer_retail_estimate_low,
          aiEstimateHigh: jobs[0].customer_retail_estimate_high,
          aiConfidence: jobs[0].estimate_confidence || confidenceLabel(assessment?.confidence),
          contractorOriginalQuote: quote.contractorNet,
          internalPriceAdjustment: quote.pricingAdjustment,
          additionalCharges: serviceCharge,
          discounts: quote.adminDiscount,
          couponAmount,
          couponFundedBy: req.body?.couponFundedBy || 'fixbridge',
          customerApprovedQuote: retail,
          customerServiceTotal: retail,
          processingCost: quote.processingCost,
          fixbridgeGrossDifference: quote.grossDifference,
          fixbridgeNetContribution: quote.netContribution,
          contractorPayout: quote.contractorNet,
          lineItems: customerLineItems,
          metadata: { bidId, proposalId: rows[0].id },
        },
      });

      await pool.query(
        `UPDATE managed_jobs SET
           active_proposal_id=$1,
           assigned_contractor_user_id=$2,
           updated_at=NOW()
         WHERE id=$3`,
        [rows[0].id, bids[0].contractor_user_id, jobId]
      );
      await pushStatus(pool, jobId, jobs[0].status, 'proposal_sent', req.authUser.id, 'Retail proposal published');
      await pushStatus(pool, jobId, 'proposal_sent', 'awaiting_customer_approval', req.authUser.id, 'Awaiting customer approval');
      await audit(pool, req.authUser.id, 'proposal_published', 'proposal', rows[0].id, {
        retail,
        net: quote.contractorNet,
        marginPct: quote.expectedMarginPct,
      });

      // Email homeowner — proposal ready to review
      try {
        const { rows: hw } = await pool.query('SELECT email, name FROM users WHERE id=$1', [jobs[0].homeowner_user_id]);
        if (hw[0]) {
          await sendNotificationEmail({
            to: hw[0].email,
            subject: `Your ${brand.productName} repair proposal is ready`,
            html: `<p>Hi ${hw[0].name || 'there'},</p><p>Your repair proposal for <strong>${jobs[0].title}</strong> is ready to review. Log in to ${brand.productName} to see the details and approve.</p>`,
          });
        }
      } catch (_e) { /* non-fatal */ }

      res.json({ ok: true, proposal: serializeProposal(rows[0], req.authUser) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.get('/api/managed/jobs/:id/proposal', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!jobs[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      const job = jobs[0];
      const allowed =
        req.authUser.isAdmin ||
        Number(job.homeowner_user_id) === Number(req.authUser.id) ||
        Number(job.assigned_contractor_user_id) === Number(req.authUser.id);
      if (!allowed) return res.status(403).json({ ok: false, message: 'Not allowed.' });

      const { rows } = await pool.query(
        `SELECT * FROM proposals WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [jobId]
      );
      if (!rows[0]) return res.json({ ok: true, proposal: null });
      res.json({ ok: true, proposal: serializeProposal(rows[0], req.authUser) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.post('/api/managed/jobs/:id/approve-proposal', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!jobs[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      if (Number(jobs[0].homeowner_user_id) !== Number(req.authUser.id) && !req.authUser.isAdmin) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const { rows: props } = await pool.query(
        `SELECT * FROM proposals WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [jobId]
      );
      if (!props[0]) return res.status(400).json({ ok: false, message: 'No proposal.' });

      await pool.query(`UPDATE proposals SET status='approved', approved_at=NOW() WHERE id=$1`, [props[0].id]);
      await pushStatus(pool, jobId, jobs[0].status, 'approved', req.authUser.id, 'Customer approved proposal');

      // Auto-charge path: pay retail next
      res.json({ ok: true, proposal: serializeProposal({ ...props[0], status: 'approved' }, req.authUser) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.post('/api/managed/jobs/:id/pay-retail', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!jobs[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      const job = jobs[0];
      if (Number(job.homeowner_user_id) !== Number(req.authUser.id) && !req.authUser.isAdmin) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const { rows: props } = await pool.query(
        `SELECT * FROM proposals WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [jobId]
      );
      if (!props[0]) return res.status(400).json({ ok: false, message: 'No proposal.' });
      const amount = Number(props[0].deposit_amount ?? props[0].retail_amount);
      const simulate = shouldSimulatePayment(req.body?.simulate === true);

      if (simulate) {
        await pool.query(
          `INSERT INTO payments (job_id, user_id, payment_type, amount, status, simulated)
           VALUES ($1,$2,'retail_payment',$3,'succeeded',true)`,
          [jobId, req.authUser.id, amount]
        );
        await pushStatus(pool, jobId, job.status, 'scheduled', req.authUser.id, 'Retail payment received (simulated)');
        await audit(pool, req.authUser.id, 'retail_paid', 'managed_job', jobId, { amount, simulated: true });
        const { rows: fresh } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
        return res.json({ ok: true, simulated: true, amount, job: serializeJob(fresh[0], req.authUser) });
      }

      const origin = req.get('origin') || req.get('referer');
      const checkout = await createCheckoutSession({
        amountCents: Math.round(amount * 100),
        customerEmail: req.authUser.email,
        description: `${brand.productName} repair payment`,
        successPath: `/?paid=retail&job=${jobId}`,
        cancelPath: `/?canceled=retail&job=${jobId}`,
        origin,
        metadata: { jobId: String(jobId), paymentType: 'retail_payment', userId: String(req.authUser.id) },
      });
      await pool.query(
        `INSERT INTO payments (job_id, user_id, payment_type, amount, status, stripe_session_id, simulated)
         VALUES ($1,$2,'retail_payment',$3,'pending',$4,false)`,
        [jobId, req.authUser.id, amount, checkout.sessionId]
      );
      res.json({ ok: true, simulated: false, url: checkout.url, amount });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── Job progress / completion ──────────────────────────────────────────────
  const CONTRACTOR_STATUS_TRANSITIONS = {
    awaiting_bid: ['diagnosing'],
    contractor_accepted: ['diagnosing'],
    diagnosing: ['work_started'],
    approved: ['scheduled', 'contractor_en_route'],
    scheduled: ['contractor_en_route', 'work_started'],
    contractor_en_route: ['work_started'],
    work_started: ['change_order_pending'],
    change_order_pending: ['work_started'],
  };

  app.post('/api/managed/jobs/:id/status', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const toStatus = String(req.body?.status || '');
      if (!JOB_STATUSES.includes(toStatus)) {
        return res.status(400).json({ ok: false, message: 'Invalid status.' });
      }
      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      const job = rows[0];
      const isContractor = Number(job.assigned_contractor_user_id) === Number(req.authUser.id);
      const isOwner = Number(job.homeowner_user_id) === Number(req.authUser.id);
      const isAdmin = req.authUser.role === 'admin' || req.authUser.isAdmin === true;

      if (isAdmin) {
        // staff may set any valid status
      } else if (isContractor) {
        const allowedNext = CONTRACTOR_STATUS_TRANSITIONS[job.status] || [];
        if (!allowedNext.includes(toStatus)) {
          return res.status(400).json({
            ok: false,
            message: `Contractors cannot move jobs from "${job.status}" to "${toStatus}". Use complete for finish.`,
          });
        }
      } else if (isOwner && ['customer_review_pending', 'closed'].includes(toStatus)) {
        // homeowner confirmation path
      } else {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }

      await pushStatus(pool, jobId, job.status, toStatus, req.authUser.id, req.body?.note || null);

      // Handle pre-authorization capture/release rules
      if (toStatus === 'diagnosing') {
        const { rows: pmts } = await pool.query(
          `SELECT * FROM payments WHERE job_id=$1 AND payment_type='dispatch_fee' AND status IN ('authorized','pending') ORDER BY id DESC LIMIT 1`,
          [jobId]
        );
        if (pmts[0]) {
          const pmt = pmts[0];
          if (pmt.simulated) {
            await pool.query(`UPDATE payments SET status='succeeded' WHERE id=$1`, [pmt.id]);
            await pool.query(`UPDATE managed_jobs SET visit_fee_captured=true WHERE id=$1`, [jobId]);
            await pushStatus(pool, jobId, 'diagnosing', 'diagnosing', req.authUser.id, 'Visit fee captured (simulated check-in)');
          } else {
            // Real Stripe pre-authorization capture
            const { rows: freshJobs } = await pool.query(`SELECT stripe_payment_intent_id FROM managed_jobs WHERE id=$1`, [jobId]);
            const intentId = freshJobs[0]?.stripe_payment_intent_id || pmt.stripe_payment_intent || pmt.stripe_session_id; // session id fallback
            if (intentId) {
              const cap = await capturePaymentIntent(intentId);
              if (cap.ok || cap.simulated) {
                await pool.query(`UPDATE payments SET status='succeeded', stripe_payment_intent=$1 WHERE id=$2`, [intentId, pmt.id]);
                await pool.query(`UPDATE managed_jobs SET visit_fee_captured=true WHERE id=$1`, [jobId]);
                await pushStatus(pool, jobId, 'diagnosing', 'diagnosing', req.authUser.id, 'Visit fee captured (Stripe authorized hold captured on check-in)');
              } else {
                console.error('Stripe capture failed on check-in:', cap.error);
              }
            }
          }
        }
      }

      if (['closed', 'canceled'].includes(toStatus)) {
        const { rows: freshJobs } = await pool.query(`SELECT visit_fee_authorized, visit_fee_captured, stripe_payment_intent_id FROM managed_jobs WHERE id=$1`, [jobId]);
        const fJob = freshJobs[0];
        if (fJob && fJob.visit_fee_authorized && !fJob.visit_fee_captured) {
          const { rows: pmts } = await pool.query(
            `SELECT * FROM payments WHERE job_id=$1 AND payment_type='dispatch_fee' AND status IN ('authorized','pending') ORDER BY id DESC LIMIT 1`,
            [jobId]
          );
          if (pmts[0]) {
            const pmt = pmts[0];
            if (pmt.simulated) {
              await pool.query(`UPDATE payments SET status='canceled' WHERE id=$1`, [pmt.id]);
              await pool.query(`UPDATE managed_jobs SET visit_fee_authorized=false WHERE id=$1`, [jobId]);
              await pushStatus(pool, jobId, toStatus, toStatus, req.authUser.id, 'Pre-authorization hold released (simulated)');
            } else {
              const intentId = fJob.stripe_payment_intent_id || pmt.stripe_payment_intent;
              if (intentId) {
                const rel = await cancelPaymentIntent(intentId);
                if (rel.ok || rel.simulated) {
                  await pool.query(`UPDATE payments SET status='canceled' WHERE id=$1`, [pmt.id]);
                  await pool.query(`UPDATE managed_jobs SET visit_fee_authorized=false WHERE id=$1`, [jobId]);
                  await pushStatus(pool, jobId, toStatus, toStatus, req.authUser.id, 'Pre-authorization hold released (Stripe)');
                }
              }
            }
          }
        }
      }

      const { rows: fresh } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      res.json({ ok: true, job: serializeJob(fresh[0], req.authUser) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.post('/api/managed/jobs/:id/complete', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      const job = rows[0];
      const isContractor = Number(job.assigned_contractor_user_id) === Number(req.authUser.id);
      if (!isContractor && !req.authUser.isAdmin) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const report = {
        summary: req.body?.summary || '',
        materialsUsed: req.body?.materialsUsed || '',
        beforePhotoUrl: req.body?.beforePhotoUrl || null,
        afterPhotoUrl: req.body?.afterPhotoUrl || null,
        warranty: req.body?.warranty || '',
        healthUpdate: req.body?.healthUpdate || null,
        completedAt: new Date().toISOString(),
      };
      await pool.query(
        `UPDATE managed_jobs SET completion_report=$1, updated_at=NOW() WHERE id=$2`,
        [JSON.stringify(report), jobId]
      );
      await pushStatus(pool, jobId, job.status, 'work_completed', req.authUser.id, 'Work completed with proof');
      await pushStatus(pool, jobId, 'work_completed', 'customer_review_pending', req.authUser.id, 'Awaiting customer confirmation');

      // Apply property health update from contractor completion
      try {
        const hu = req.body?.healthUpdate;
        if (hu && hu.system && job.property_id) {
          const { rows: props } = await pool.query(`SELECT * FROM properties WHERE id=$1`, [job.property_id]);
          if (props[0]) {
            let profile = {};
            try {
              profile =
                typeof props[0].health_profile === 'string'
                  ? JSON.parse(props[0].health_profile || '{}')
                  : props[0].health_profile || {};
            } catch {
              profile = {};
            }
            const systems = Array.isArray(profile.systems) ? [...profile.systems] : [];
            const idx = systems.findIndex((s) => s && s.system === hu.system);
            const entry = {
              system: hu.system,
              status: hu.status || 'good',
              nextAction: hu.nextAction || 'Service completed',
              notes: hu.notes || report.summary || '',
              updatedAt: new Date().toISOString(),
              updatedBy: 'contractor',
              relatedJobId: jobId,
            };
            if (idx >= 0) systems[idx] = { ...systems[idx], ...entry };
            else systems.push(entry);
            const nextProfile = { ...profile, systems };
            await pool.query(`UPDATE properties SET health_profile=$1 WHERE id=$2`, [
              JSON.stringify(nextProfile),
              job.property_id,
            ]);
          }
        }
      } catch (_e) {
        /* non-fatal */
      }

      // Email homeowner — work done, please confirm
      try {
        const { rows: hw } = await pool.query('SELECT email, name FROM users WHERE id=$1', [job.homeowner_user_id]);
        if (hw[0]) {
          const rpt = report;
          await sendNotificationEmail({
            to: hw[0].email,
            subject: `Work complete — please confirm your ${brand.productName} job`,
            html: `<p>Hi ${hw[0].name || 'there'},</p><p>Your contractor has marked <strong>${job.title}</strong> as complete${rpt.summary ? ': ' + rpt.summary : ''}.</p><p>Log in to review the before/after photos and confirm completion.</p>`,
          });
        }
      } catch (_e) { /* non-fatal */ }

      try {
        await ensurePayoutRecordForJob(pool, jobId, {
          initialStatus: PAYOUT_STATUS.PENDING_APPROVAL,
          actorUserId: req.authUser.id,
        });
      } catch (_payoutErr) {
        console.warn('[payout] create on complete:', _payoutErr.message);
      }

      const { rows: fresh } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      res.json({ ok: true, job: serializeJob(fresh[0], req.authUser) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.post('/api/managed/jobs/:id/confirm-completion', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      if (Number(rows[0].homeowner_user_id) !== Number(req.authUser.id) && !req.authUser.isAdmin) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      await pool.query(`UPDATE managed_jobs SET customer_confirmed_at=NOW() WHERE id=$1`, [jobId]);
      await pushStatus(pool, jobId, rows[0].status, 'admin_review_pending', req.authUser.id, 'Customer confirmed completion');
      await pushStatus(pool, jobId, 'admin_review_pending', 'payout_pending', req.authUser.id, 'Ready for payout');

      try {
        await ensurePayoutRecordForJob(pool, jobId, {
          initialStatus: PAYOUT_STATUS.PENDING_APPROVAL,
          actorUserId: req.authUser.id,
        });
      } catch (_payoutErr) {
        console.warn('[payout] create on confirm:', _payoutErr.message);
      }

      // Optional public review — published immediately on the marketing site
      const rating = Math.round(Number(req.body?.rating));
      const reviewText = String(req.body?.review || req.body?.text || '').trim().slice(0, 2000);
      const location = String(req.body?.location || '').trim().slice(0, 80);
      let imagesJson = null;
      if (Array.isArray(req.body?.images)) {
        const imgs = req.body.images
          .filter((u) => typeof u === 'string' && u.startsWith('data:image/') && u.length <= 1_800_000)
          .slice(0, 4);
        if (imgs.length) imagesJson = JSON.stringify(imgs);
      }
      if (Number.isFinite(rating) && rating >= 1 && rating <= 5 && reviewText.length >= 20) {
        try {
          await pool.query(
            `INSERT INTO site_reviews
               (author_name, location, service_type, rating, body, verified, published, user_id, job_id, images)
             VALUES ($1,$2,$3,$4,$5,TRUE,TRUE,$6,$7,$8)`,
            [
              String(req.authUser.name || 'Homeowner').slice(0, 80),
              location || 'NYC & Long Island',
              String(rows[0].category || rows[0].trade || 'Home repair').slice(0, 60),
              rating,
              reviewText,
              req.authUser.id,
              jobId,
              imagesJson,
            ]
          );
        } catch (revErr) {
          console.warn('confirm-completion review publish:', revErr.message);
        }
      }

      const { rows: fresh } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      res.json({ ok: true, job: serializeJob(fresh[0], req.authUser) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── Admin payout ───────────────────────────────────────────────────────────
  app.post('/api/admin/managed/jobs/:id/payout', requireAuth, requireAdmin, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      if (!Number.isFinite(jobId) || jobId <= 0) {
        return res.status(400).json({ ok: false, message: 'Invalid job.' });
      }
      const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!jobs[0]) return res.status(404).json({ ok: false, message: 'Job not found.' });
      const job = jobs[0];
      if (!job.assigned_contractor_user_id) {
        return res.status(400).json({
          ok: false,
          message: 'Assign a contractor before releasing a payout.',
        });
      }
      const { rows: props } = await pool.query(
        `SELECT * FROM proposals WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [jobId]
      );
      const fallbackNet =
        job.estimated_contractor_net_high != null
          ? Number(job.estimated_contractor_net_high)
          : job.estimated_contractor_net_low != null
            ? Number(job.estimated_contractor_net_low)
            : 0;
      const amount = Number(
        req.body?.amount != null && req.body.amount !== ''
          ? req.body.amount
          : props[0]?.contractor_net != null
            ? props[0].contractor_net
            : fallbackNet
      );
      if (!(amount > 0)) {
        return res.status(400).json({
          ok: false,
          message:
            'No payout amount available. Create a retail proposal from a bid first, or enter an amount.',
        });
      }

      const { rows: contractors } = await pool.query(`SELECT * FROM users WHERE id=$1`, [
        job.assigned_contractor_user_id,
      ]);
      const contractor = contractors[0];
      if (!contractor) {
        return res.status(400).json({ ok: false, message: 'Assigned contractor account is missing.' });
      }
      const simulate =
        shouldSimulatePayment(req.body?.simulate === true) ||
        (!contractor?.stripe_account_id && shouldSimulatePayment(true));
      if (!simulate && !contractor?.stripe_account_id) {
        return res.status(400).json({
          ok: false,
          message: 'Contractor has not connected Stripe payouts yet.',
        });
      }

      // Reserve-hold logic (spec §9): hold back a % for N days before full eligibility
      const payRules = await loadPricingRules(pool);
      const reservePct = Math.max(0, Math.min(1, Number(payRules.reserve_percentage ?? 10) / 100));
      const reserveAmount = Math.round(amount * reservePct * 100) / 100;
      const netPayoutAmount = Math.round((amount - reserveAmount) * 100) / 100;
      const reserveHoldDays = Number(payRules.reserve_hold_days ?? 7);
      const reserveReleaseAt = new Date(Date.now() + reserveHoldDays * 86_400_000);

      let transferId = null;
      if (simulate) {
        transferId = `sim_tr_${Date.now()}`;
      } else {
        const result = await createTransfer({
          amountCents: Math.round(netPayoutAmount * 100),
          destinationAccountId: contractor.stripe_account_id,
          transferGroup: `job_${jobId}`,
          metadata: { jobId: String(jobId), reserveAmount: String(reserveAmount) },
        });
        transferId = result.transferId;
      }

      await pool.query(
        `INSERT INTO transfers (job_id, contractor_user_id, amount, status, stripe_transfer_id, simulated, created_by, reserve_amount, reserve_release_at)
         VALUES ($1,$2,$3,'paid',$4,$5,$6,$7,$8)`,
        [jobId, job.assigned_contractor_user_id, netPayoutAmount, transferId, simulate, req.authUser.id, reserveAmount, reserveReleaseAt]
      );
      await pushStatus(pool, jobId, job.status, 'paid_out', req.authUser.id, 'Contractor payout released');
      await pushStatus(pool, jobId, 'paid_out', 'closed', req.authUser.id, 'Job closed');
      await audit(pool, req.authUser.id, 'payout_released', 'managed_job', jobId, { amount: netPayoutAmount, reserveAmount, reserveReleaseAt, simulate, transferId });

      // Email contractor about payout
      try {
        if (contractor.email) {
          await sendNotificationEmail({
            to: contractor.email,
            subject: `${brand.productName}: payout processed for job #${jobId}`,
            html: `<p>Hi ${contractor.name || 'there'},</p><p>A payout of <strong>$${Math.round(netPayoutAmount)}</strong> has been released for job #${jobId}${reserveAmount > 0 ? `. An additional $${Math.round(reserveAmount)} will be released on ${reserveReleaseAt.toLocaleDateString()} after the reserve hold period.` : '.'}</p>`,
          });
        }
      } catch (_e) { /* non-fatal */ }

      const { rows: fresh } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      res.json({
        ok: true,
        simulated: simulate,
        amount: netPayoutAmount,
        transferId,
        job: serializeJob(fresh[0], req.authUser),
        message: simulate
          ? `Simulated payout of $${Math.round(netPayoutAmount)} to ${contractor.name}. $${Math.round(reserveAmount)} held in reserve until ${reserveReleaseAt.toLocaleDateString()}.`
          : `Payout of $${Math.round(netPayoutAmount)} sent to ${contractor.name}. $${Math.round(reserveAmount)} held in reserve until ${reserveReleaseAt.toLocaleDateString()}.`,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not release payout.' });
    }
  });

  // ── AI override (plain-English admin controls + price markup) ──────────────
  app.put('/api/admin/managed/jobs/:id/ai-override', requireAuth, requireAdmin, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      if (!Number.isFinite(jobId) || jobId <= 0) {
        return res.status(400).json({ ok: false, message: 'Invalid job.' });
      }
      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Not found.' });

      const body = req.body || {};
      const current = parseJson(rows[0].ai_assessment, {});
      const incoming = body.assessment && typeof body.assessment === 'object' ? body.assessment : {};

      // Accept plain fields from the admin form
      const next = { ...current, ...incoming };
      if (body.category != null) next.category = String(body.category).slice(0, 80);
      if (body.urgency != null) next.urgency = String(body.urgency).slice(0, 40);
      if (body.recommended_trade != null) next.recommended_trade = String(body.recommended_trade).slice(0, 80);
      if (body.summary != null) next.summary = String(body.summary).slice(0, 2000);
      if (typeof body.safe_diy_allowed === 'boolean') next.safe_diy_allowed = body.safe_diy_allowed;
      if (typeof body.professional_required === 'boolean') next.professional_required = body.professional_required;
      if (body.confidence != null) {
        // Accept 0–100 from UI or 0–1 from API
        let c = Number(body.confidence);
        if (c > 1) c = c / 100;
        next.confidence = Math.min(1, Math.max(0, c));
      }
      if (body.estimated_labor_hours_min != null) {
        next.estimated_labor_hours_min = Math.max(0.5, Number(body.estimated_labor_hours_min) || 1);
      }
      if (body.estimated_labor_hours_max != null) {
        next.estimated_labor_hours_max = Math.max(
          next.estimated_labor_hours_min || 1,
          Number(body.estimated_labor_hours_max) || 2
        );
      }

      const rules = await loadPricingRules(pool);
      let pricing = computePreliminaryRetail(next, rules, {
        afterHours: /evening|weekend/i.test(rows[0].service_timing || ''),
        forceOnSite: body.forceOnSite === true || body.hidePrice === true,
        allowBlocked: body.allowBlocked === true,
        zip: rows[0].zip || null,
      });

      const adjustment = body.priceAdjustment || body.adjustment || null;
      if (adjustment && typeof adjustment === 'object') {
        pricing = applyAdminPriceAdjustment(pricing, adjustment);
      }
      const discount = await resolveJobDiscount(pool, rows[0]);
      if (discount) {
        pricing = applyDiscountToPricing(pricing, discount);
      }

      await pool.query(
        `UPDATE managed_jobs SET
           ai_assessment=$1, pricing=$2, show_retail_price=$3,
           customer_retail_estimate_low=$4, customer_retail_estimate_high=$5,
           estimated_contractor_net_low=$6, estimated_contractor_net_high=$7,
           category=COALESCE($8, category), updated_at=NOW()
         WHERE id=$9`,
        [
          JSON.stringify(next),
          JSON.stringify(pricing),
          pricing.show_price,
          pricing.customer_retail_estimate_low,
          pricing.customer_retail_estimate_high,
          pricing.estimated_contractor_net_low,
          pricing.estimated_contractor_net_high,
          next.category || null,
          jobId,
        ]
      );
      await audit(pool, req.authUser.id, 'ai_override', 'managed_job', jobId, {
        assessment: next,
        priceAdjustment: adjustment || null,
      });
      const { rows: fresh } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      res.json({ ok: true, job: serializeJob(fresh[0], req.authUser), pricing });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not save AI review.' });
    }
  });

  // ── Contractor Connect onboarding ──────────────────────────────────────────
  app.post('/api/contractor/stripe/onboard', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') {
        return res.status(403).json({ ok: false, message: 'Contractors only.' });
      }
      const { rows } = await pool.query(`SELECT * FROM users WHERE id=$1`, [req.authUser.id]);
      let accountId = rows[0]?.stripe_account_id;
      if (!accountId) {
        const created = await createExpressAccount(req.authUser.email);
        accountId = created.accountId;
        await pool.query(
          `UPDATE users SET stripe_account_id=$1, stripe_onboarding_status=$2 WHERE id=$3`,
          [accountId, created.simulated ? 'simulated' : 'pending', req.authUser.id]
        );
      }
      if (!stripeConfigured()) {
        await pool.query(
          `UPDATE users SET stripe_onboarding_status='simulated', stripe_payouts_enabled=true WHERE id=$1`,
          [req.authUser.id]
        );
        return res.json({ ok: true, simulated: true, accountId });
      }
      const link = await createConnectAccountLink(
        accountId,
        '/?stripe=refresh',
        '/?stripe=return'
      );
      res.json({ ok: true, simulated: false, url: link.url, accountId });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.put('/api/contractor/compliance', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') {
        return res.status(403).json({ ok: false, message: 'Contractors only.' });
      }
      const b = req.body || {};
      // Contractors may update profile fields + submit for review — never self-approve.
      await pool.query(
        `UPDATE users SET
           license_expires_at=COALESCE($1, license_expires_at),
           insurance_expires_at=COALESCE($2, insurance_expires_at),
           service_zips=COALESCE($3, service_zips),
           travel_radius_miles=COALESCE($4, travel_radius_miles),
           min_trip_charge=COALESCE($5, min_trip_charge),
           master_agreement_accepted_at=CASE WHEN $6=true THEN NOW() ELSE master_agreement_accepted_at END
         WHERE id=$7`,
        [
          b.licenseExpiresAt || null,
          b.insuranceExpiresAt || null,
          b.serviceZips ? JSON.stringify(b.serviceZips) : null,
          b.travelRadiusMiles ?? null,
          b.minTripCharge ?? null,
          b.acceptAgreement === true,
          req.authUser.id,
        ]
      );
      if (b.submitForReview === true) {
        await pool.query(
          `UPDATE users SET compliance_status='under_review' WHERE id=$1 AND role='contractor'
             AND COALESCE(compliance_status,'draft') NOT IN ('approved','suspended','rejected','blocked')`,
          [req.authUser.id]
        );
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.put('/api/admin/contractors/:id/compliance', requireAuth, requireAdmin, async (req, res) => {
    try {
      const status = req.body?.complianceStatus;
      await pool.query(`UPDATE users SET compliance_status=$1 WHERE id=$2 AND role='contractor'`, [
        status,
        Number(req.params.id),
      ]);
      await audit(pool, req.authUser.id, 'contractor_compliance', 'user', req.params.id, { status });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  /** Email contractor asking them to update missing application / credential info. */
  app.post('/api/admin/contractors/:id/request-info', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const contractorId = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM users WHERE id=$1 AND role='contractor'`, [contractorId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Contractor not found.' });
      const contractor = rows[0];
      const to = String(contractor.email || '').trim();
      if (!to) return res.status(400).json({ ok: false, message: 'Contractor has no email on file.' });

      const items = Array.isArray(req.body?.items)
        ? req.body.items.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 40)
        : [];
      const note = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 2000) : '';
      const appUrl = (process.env.APP_URL || brand.domain || '').replace(/\/$/, '');
      const loginUrl = appUrl
        ? `${appUrl.includes('://') ? appUrl : `https://${appUrl}`}/?portal=contractor`
        : '';

      const listHtml = items.length
        ? `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
        : `<p>Please review your contractor application and upload any missing documents.</p>`;

      const subject = `${brand.productName}: Please update your contractor information`;
      const html = `
        <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
          <p>Hi ${escapeHtml(contractor.name || 'there')},</p>
          <p>Our team needs updated information on your ${escapeHtml(brand.productName)} contractor profile so we can keep you eligible for jobs.</p>
          <p><strong>Please update the following:</strong></p>
          ${listHtml}
          ${note ? `<p><strong>Note from staff:</strong> ${escapeHtml(note)}</p>` : ''}
          <p>Sign in to your contractor dashboard, open <strong>Compliance</strong> (or Settings → Update profile), and save your changes.</p>
          ${loginUrl ? `<p><a href="${loginUrl}">Open contractor portal →</a></p>` : ''}
          <p style="color:#666;font-size:13px">If you have questions, reply to this email or contact support.</p>
        </div>
      `;

      const delivery = await sendEmailSafe({ to, subject, html });
      if (!delivery.ok) {
        return res.status(502).json({ ok: false, message: delivery.message || 'Email failed to send.' });
      }

      try {
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, message)
           VALUES ($1,'info_request',$2,$3)`,
          [
            contractorId,
            'Update your contractor information',
            items.length
              ? `Staff requested updates: ${items.slice(0, 5).join('; ')}${items.length > 5 ? '…' : ''}`
              : 'Staff asked you to review and complete your application details.',
          ]
        );
      } catch {
        /* ignore notification insert failures */
      }

      await audit(pool, req.authUser.id, 'contractor_request_info', 'user', contractorId, {
        to,
        items,
        simulated: Boolean(delivery.simulated),
      });

      res.json({
        ok: true,
        simulated: Boolean(delivery.simulated),
        message: delivery.simulated
          ? 'Request logged (email provider not configured — check server logs).'
          : `Info request emailed to ${to}.`,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not send info request.' });
    }
  });

  /** Admin edits contractor application / profile fields anytime. */
  app.put('/api/admin/contractors/:id/profile', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const contractorId = Number(req.params.id);
      const { rows: beforeRows } = await pool.query(`SELECT * FROM users WHERE id=$1 AND role='contractor'`, [
        contractorId,
      ]);
      if (!beforeRows[0]) return res.status(404).json({ ok: false, message: 'Contractor not found.' });
      const before = beforeRows[0];
      const body = req.body || {};

      const name = typeof body.name === 'string' ? body.name.trim() : before.name;
      if (!name) return res.status(400).json({ ok: false, message: 'Name is required.' });

      const parseDoc = (nameKey, dataKey) => {
        const provided = Object.prototype.hasOwnProperty.call(body, nameKey) || Object.prototype.hasOwnProperty.call(body, dataKey);
        if (!provided) return { provided: false };
        const docName = typeof body[nameKey] === 'string' ? body[nameKey].trim() : '';
        const docData = typeof body[dataKey] === 'string' ? body[dataKey] : null;
        if (!docName && !docData) return { provided: true, clear: true };
        if (docData && docData.length > 4_000_000) return { error: `${nameKey} is too large.` };
        return { provided: true, set: true, name: docName || 'document', data: docData };
      };

      const licenseDoc = parseDoc('licenseDocumentName', 'licenseDocumentData');
      const insuranceDoc = parseDoc('insuranceDocumentName', 'insuranceDocumentData');
      const idDoc = parseDoc('idDocumentName', 'idDocumentData');
      const w9Doc = parseDoc('w9DocumentName', 'w9DocumentData');
      const bizRegDoc = parseDoc('businessRegistrationName', 'businessRegistrationData');
      const bizLicDoc = parseDoc('businessLicenseName', 'businessLicenseData');
      const diversityDoc = parseDoc('diversityDocumentName', 'diversityDocumentData');
      for (const d of [licenseDoc, insuranceDoc, idDoc, w9Doc, bizRegDoc, bizLicDoc, diversityDoc]) {
        if (d.error) return res.status(400).json({ ok: false, message: d.error });
      }

      let nextApp = before.contractor_application;
      if (before.contractor_application && typeof before.contractor_application === 'string') {
        try {
          nextApp = JSON.parse(before.contractor_application);
        } catch {
          nextApp = {};
        }
      }
      nextApp = nextApp && typeof nextApp === 'object' ? nextApp : {};
      if (body.contractorApplication && typeof body.contractorApplication === 'object') {
        nextApp = {
          ...nextApp,
          ...body.contractorApplication,
          primaryServices: Array.isArray(body.contractorApplication.primaryServices)
            ? body.contractorApplication.primaryServices
            : nextApp.primaryServices || [],
          serviceStates: Array.isArray(body.contractorApplication.serviceStates)
            ? body.contractorApplication.serviceStates
            : nextApp.serviceStates || [],
        };
      }

      const licenseExpires =
        (body.contractorApplication && body.contractorApplication.licenseExpiration) ||
        body.licenseExpiresAt ||
        null;
      const insuranceExpires =
        (body.contractorApplication && body.contractorApplication.insuranceExpiration) ||
        body.insuranceExpiresAt ||
        null;

      const serviceZips =
        body.serviceZips !== undefined
          ? JSON.stringify(Array.isArray(body.serviceZips) ? body.serviceZips : [])
          : JSON.stringify(before.service_zips || []);

      await pool.query(
        `UPDATE users SET
           name=$1,
           phone=COALESCE($2, phone),
           address=COALESCE($3, address),
           contact_email=COALESCE($4, contact_email),
           company_name=COALESCE($5, company_name),
           company_details=COALESCE($6, company_details),
           insurance_details=COALESCE($7, insurance_details),
           trade=COALESCE($8, trade),
           license_number=COALESCE($9, license_number),
           visit_fee=COALESCE($10, visit_fee),
           emergency_visit_fee=COALESCE($11, emergency_visit_fee),
           minimum_labor_fee=COALESCE($12, minimum_labor_fee),
           service_zips=$13::jsonb,
           travel_radius_miles=COALESCE($14, travel_radius_miles),
           contractor_application=$15::jsonb,
           license_expires_at=COALESCE($16::date, license_expires_at),
           insurance_expires_at=COALESCE($17::date, insurance_expires_at),
           license_document_name=CASE
             WHEN $18::boolean AND $19::boolean THEN NULL
             WHEN $18::boolean AND $20::boolean THEN $21
             ELSE license_document_name END,
           license_document_data=CASE
             WHEN $18::boolean AND $19::boolean THEN NULL
             WHEN $18::boolean AND $20::boolean THEN $22
             ELSE license_document_data END,
           insurance_document_name=CASE
             WHEN $23::boolean AND $24::boolean THEN NULL
             WHEN $23::boolean AND $25::boolean THEN $26
             ELSE insurance_document_name END,
           insurance_document_data=CASE
             WHEN $23::boolean AND $24::boolean THEN NULL
             WHEN $23::boolean AND $25::boolean THEN $27
             ELSE insurance_document_data END,
           id_document_name=CASE
             WHEN $28::boolean AND $29::boolean THEN NULL
             WHEN $28::boolean AND $30::boolean THEN $31
             ELSE id_document_name END,
           id_document_data=CASE
             WHEN $28::boolean AND $29::boolean THEN NULL
             WHEN $28::boolean AND $30::boolean THEN $32
             ELSE id_document_data END,
           w9_document_name=CASE
             WHEN $33::boolean AND $34::boolean THEN NULL
             WHEN $33::boolean AND $35::boolean THEN $36
             ELSE w9_document_name END,
           w9_document_data=CASE
             WHEN $33::boolean AND $34::boolean THEN NULL
             WHEN $33::boolean AND $35::boolean THEN $37
             ELSE w9_document_data END,
           business_registration_name=CASE
             WHEN $38::boolean AND $39::boolean THEN NULL
             WHEN $38::boolean AND $40::boolean THEN $41
             ELSE business_registration_name END,
           business_registration_data=CASE
             WHEN $38::boolean AND $39::boolean THEN NULL
             WHEN $38::boolean AND $40::boolean THEN $42
             ELSE business_registration_data END,
           business_license_name=CASE
             WHEN $43::boolean AND $44::boolean THEN NULL
             WHEN $43::boolean AND $45::boolean THEN $46
             ELSE business_license_name END,
           business_license_data=CASE
             WHEN $43::boolean AND $44::boolean THEN NULL
             WHEN $43::boolean AND $45::boolean THEN $47
             ELSE business_license_data END
         WHERE id=$48 AND role='contractor'`,
        [
          name,
          typeof body.phone === 'string' ? body.phone.trim() || null : null,
          typeof body.address === 'string' ? body.address.trim() || null : null,
          typeof body.contactEmail === 'string' ? body.contactEmail.trim() || null : null,
          typeof body.companyName === 'string' ? body.companyName.trim() || null : null,
          typeof body.companyDetails === 'string' ? body.companyDetails.trim() || null : null,
          typeof body.insuranceDetails === 'string' ? body.insuranceDetails.trim() || null : null,
          typeof body.trade === 'string' ? body.trade.trim() || null : null,
          typeof body.licenseNumber === 'string' ? body.licenseNumber.trim() || null : null,
          body.visitFee !== undefined ? (body.visitFee === null ? null : Number(body.visitFee)) : null,
          body.emergencyVisitFee !== undefined
            ? body.emergencyVisitFee === null
              ? null
              : Number(body.emergencyVisitFee)
            : null,
          body.minimumLaborFee !== undefined
            ? body.minimumLaborFee === null
              ? null
              : Number(body.minimumLaborFee)
            : null,
          serviceZips,
          body.travelRadiusMiles !== undefined
            ? body.travelRadiusMiles === null
              ? null
              : Number(body.travelRadiusMiles)
            : null,
          JSON.stringify(nextApp),
          licenseExpires && /^\d{4}-\d{2}-\d{2}/.test(String(licenseExpires))
            ? String(licenseExpires).slice(0, 10)
            : null,
          insuranceExpires && /^\d{4}-\d{2}-\d{2}/.test(String(insuranceExpires))
            ? String(insuranceExpires).slice(0, 10)
            : null,
          Boolean(licenseDoc.provided),
          Boolean(licenseDoc.clear),
          Boolean(licenseDoc.set),
          licenseDoc.provided ? licenseDoc.name : null,
          licenseDoc.provided ? licenseDoc.data : null,
          Boolean(insuranceDoc.provided),
          Boolean(insuranceDoc.clear),
          Boolean(insuranceDoc.set),
          insuranceDoc.provided ? insuranceDoc.name : null,
          insuranceDoc.provided ? insuranceDoc.data : null,
          Boolean(idDoc.provided),
          Boolean(idDoc.clear),
          Boolean(idDoc.set),
          idDoc.provided ? idDoc.name : null,
          idDoc.provided ? idDoc.data : null,
          Boolean(w9Doc.provided),
          Boolean(w9Doc.clear),
          Boolean(w9Doc.set),
          w9Doc.provided ? w9Doc.name : null,
          w9Doc.provided ? w9Doc.data : null,
          Boolean(bizRegDoc.provided),
          Boolean(bizRegDoc.clear),
          Boolean(bizRegDoc.set),
          bizRegDoc.provided ? bizRegDoc.name : null,
          bizRegDoc.provided ? bizRegDoc.data : null,
          Boolean(bizLicDoc.provided),
          Boolean(bizLicDoc.clear),
          Boolean(bizLicDoc.set),
          bizLicDoc.provided ? bizLicDoc.name : null,
          bizLicDoc.provided ? bizLicDoc.data : null,
          contractorId,
        ]
      );

      if (diversityDoc.provided) {
        await pool.query(
          `UPDATE users SET
             diversity_document_name = CASE
               WHEN $2::boolean THEN NULL
               WHEN $3::boolean THEN $4
               WHEN $4::text IS NOT NULL AND NOT $3::boolean THEN $4
               ELSE diversity_document_name
             END,
             diversity_document_data = CASE
               WHEN $2::boolean THEN NULL
               WHEN $3::boolean THEN $5
               ELSE diversity_document_data
             END
           WHERE id=$1 AND role='contractor'`,
          [
            contractorId,
            Boolean(diversityDoc.clear),
            Boolean(diversityDoc.set),
            diversityDoc.provided ? diversityDoc.name : null,
            diversityDoc.provided ? diversityDoc.data : null,
          ]
        );
      }

      await audit(pool, req.authUser.id, 'contractor_profile_updated', 'user', contractorId, {
        by: 'admin',
      });

      const { rows } = await pool.query(`SELECT * FROM users WHERE id=$1`, [contractorId]);
      if (typeof rowToUser === 'function') {
        return res.json({ ok: true, user: rowToUser(rows[0]), message: 'Contractor profile updated.' });
      }
      // Prefer shared rowToUser if available via app — fall back to raw-safe shape
      res.json({
        ok: true,
        user: {
          id: Number(rows[0].id),
          role: rows[0].role,
          name: rows[0].name,
          email: rows[0].email,
          phone: rows[0].phone,
          companyName: rows[0].company_name,
          trade: rows[0].trade,
          licenseNumber: rows[0].license_number,
          licenseExpiresAt: rows[0].license_expires_at
            ? String(rows[0].license_expires_at).slice(0, 10)
            : null,
          insuranceExpiresAt: rows[0].insurance_expires_at
            ? String(rows[0].insurance_expires_at).slice(0, 10)
            : null,
          complianceStatus: rows[0].compliance_status,
          contractorApplication: rows[0].contractor_application,
          w9DocumentName: rows[0].w9_document_name,
          licenseDocumentName: rows[0].license_document_name,
          insuranceDocumentName: rows[0].insurance_document_name,
          diversityDocumentName: rows[0].diversity_document_name,
          serviceZips: rows[0].service_zips,
        },
        message: 'Contractor profile updated.',
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not update contractor profile.' });
    }
  });

  // ── Partners ───────────────────────────────────────────────────────────────
  /** Public lookup so customers can confirm who referred them (no private data). */
  app.get('/api/partners/lookup', async (req, res) => {
    try {
      const code = String(req.query.code || '').trim();
      if (!code) return res.status(400).json({ ok: false, message: 'Partner code required.' });
      const partner = await lookupPartnerByCode(pool, code);
      if (partner) {
        return res.json({ ok: true, partner: publicPartnerView(partner) });
      }

      // Check if it matches a user's referral_code
      const { rows: users } = await pool.query(
        `SELECT id, referral_code, name, role FROM users WHERE LOWER(referral_code)=LOWER($1) LIMIT 1`,
        [code]
      );
      if (users[0]) {
        return res.json({
          ok: true,
          partner: {
            code: users[0].referral_code,
            name: users[0].name,
            company: users[0].role === 'contractor' ? 'Contractor Partner' : 'Homeowner Referral',
          }
        });
      }

      res.json({ ok: true, partner: null });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.get('/api/admin/partners', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM partners ORDER BY created_at DESC`);
      const appUrl = process.env.APP_URL || brand.domain;
      res.json({
        ok: true,
        partners: rows.map((p) => ({
          ...p,
          intakeUrl: intakeShareUrl(p.code, appUrl),
        })),
        statusLabels: PARTNER_STATUS_LABELS,
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.post('/api/admin/partners', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const code = (req.body?.code || crypto.randomBytes(4).toString('hex')).toUpperCase();
      const { rows } = await pool.query(
        `INSERT INTO partners (code, name, company, email, phone)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [
          code,
          req.body?.name || 'Partner',
          req.body?.company || null,
          req.body?.email || null,
          req.body?.phone || null,
        ]
      );
      const appUrl = process.env.APP_URL || brand.domain;
      res.json({
        ok: true,
        partner: { ...rows[0], intakeUrl: intakeShareUrl(rows[0].code, appUrl) },
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.get('/api/admin/partner-referrals', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT r.*, p.name AS partner_name, p.company AS partner_company, p.email AS partner_email,
                j.booking_id, j.status AS job_status, j.category, j.city_state_zip,
                j.customer_partner_status_consent
         FROM partner_referrals r
         LEFT JOIN partners p ON p.id = r.partner_id
         LEFT JOIN managed_jobs j ON j.id = r.job_id
         ORDER BY r.created_at DESC
         LIMIT 200`
      );
      res.json({
        ok: true,
        referrals: rows.map((r) => ({
          id: Number(r.id),
          partnerCode: r.partner_code,
          partnerName: r.partner_name,
          partnerCompany: r.partner_company,
          partnerEmail: r.partner_email,
          status: r.status,
          statusLabel: PARTNER_STATUS_LABELS[r.status] || r.status,
          jobId: r.job_id != null ? Number(r.job_id) : null,
          bookingId: r.booking_id,
          jobStatus: r.job_status,
          category: r.category,
          area: r.city_state_zip,
          consent: r.customer_partner_status_consent === true,
          createdAt: r.created_at,
        })),
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── Discount codes ─────────────────────────────────────────────────────────
  app.get('/api/discounts/lookup', async (req, res) => {
    try {
      const code = String(req.query.code || '').trim();
      if (!code) return res.status(400).json({ ok: false, message: 'Discount code required.' });
      const row = await lookupDiscountByCode(pool, code);
      const checked = validateDiscountRow(row);
      if (!checked.ok) {
        return res.json({ ok: true, discount: null, message: checked.message });
      }
      res.json({ ok: true, discount: publicDiscountView(checked.discount) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.get('/api/admin/discounts', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM discount_codes ORDER BY created_at DESC`);
      res.json({
        ok: true,
        discounts: rows.map((d) => ({
          id: Number(d.id),
          code: d.code,
          label: d.label,
          discountType: d.discount_type,
          value: Number(d.value),
          active: d.active !== false,
          maxUses: d.max_uses != null ? Number(d.max_uses) : null,
          usesCount: Number(d.uses_count || 0),
          expiresAt: d.expires_at,
          createdAt: d.created_at,
        })),
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.post('/api/admin/discounts', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const code = normalizeDiscountCode(req.body?.code || '');
      if (!code || code.length < 3) {
        return res.status(400).json({ ok: false, message: 'Enter a code with at least 3 characters.' });
      }
      const discountType = String(req.body?.discountType || 'percent').toLowerCase() === 'amount' ? 'amount' : 'percent';
      const value = Number(req.body?.value);
      if (!Number.isFinite(value) || value <= 0) {
        return res.status(400).json({ ok: false, message: 'Enter a valid discount value.' });
      }
      if (discountType === 'percent' && value > 90) {
        return res.status(400).json({ ok: false, message: 'Percent discount cannot exceed 90%.' });
      }
      const label = String(req.body?.label || '').trim().slice(0, 120) || null;
      const maxUses = req.body?.maxUses != null && req.body.maxUses !== '' ? Number(req.body.maxUses) : null;
      const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;
      const { rows } = await pool.query(
        `INSERT INTO discount_codes (code, label, discount_type, value, active, max_uses, expires_at, created_by)
         VALUES ($1,$2,$3,$4,true,$5,$6,$7)
         RETURNING *`,
        [
          code,
          label,
          discountType,
          value,
          Number.isFinite(maxUses) && maxUses > 0 ? maxUses : null,
          expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
          req.authUser.id,
        ]
      );
      await audit(pool, req.authUser.id, 'discount_created', 'discount_code', rows[0].id, { code });
      res.json({
        ok: true,
        discount: {
          id: Number(rows[0].id),
          code: rows[0].code,
          label: rows[0].label,
          discountType: rows[0].discount_type,
          value: Number(rows[0].value),
          active: true,
          maxUses: rows[0].max_uses != null ? Number(rows[0].max_uses) : null,
          usesCount: 0,
          expiresAt: rows[0].expires_at,
        },
      });
    } catch (e) {
      if (String(e.message || '').toLowerCase().includes('unique')) {
        return res.status(400).json({ ok: false, message: 'That discount code already exists.' });
      }
      console.error(e);
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.put('/api/admin/discounts/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows: existing } = await pool.query(`SELECT * FROM discount_codes WHERE id=$1`, [id]);
      if (!existing[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      const cur = existing[0];
      const active = typeof req.body?.active === 'boolean' ? req.body.active : cur.active !== false;
      const label = req.body?.label != null ? String(req.body.label).trim().slice(0, 120) : cur.label;
      const discountType =
        req.body?.discountType != null
          ? String(req.body.discountType).toLowerCase() === 'amount'
            ? 'amount'
            : 'percent'
          : cur.discount_type;
      const value = req.body?.value != null ? Number(req.body.value) : Number(cur.value);
      const maxUses =
        req.body?.maxUses !== undefined
          ? req.body.maxUses === null || req.body.maxUses === ''
            ? null
            : Number(req.body.maxUses)
          : cur.max_uses;
      await pool.query(
        `UPDATE discount_codes SET active=$1, label=$2, discount_type=$3, value=$4, max_uses=$5 WHERE id=$6`,
        [active, label || null, discountType, value, maxUses, id]
      );
      await audit(pool, req.authUser.id, 'discount_updated', 'discount_code', id, { active, value });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── Payments list / reporting ──────────────────────────────────────────────
  app.get('/api/admin/payments', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { rows: payments } = await pool.query(`SELECT * FROM payments ORDER BY created_at DESC LIMIT 200`);
      const { rows: transfers } = await pool.query(`SELECT * FROM transfers ORDER BY created_at DESC LIMIT 200`);
      res.json({ ok: true, payments, transfers });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── Homeowner invoices ─────────────────────────────────────────────────────
  app.get('/api/admin/managed/jobs/:id/invoice', requireAuth, requireAdmin, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const built = await buildInvoiceForJob(pool, jobId, { customNote: req.query.note });
      if (!built.ok) return res.status(404).json(built);
      res.json({ ok: true, invoice: built.invoice, html: renderInvoiceHtml(built.invoice) });
    } catch (e) {
      console.error('invoice preview:', e);
      res.status(500).json({ ok: false, message: 'Could not generate invoice.' });
    }
  });

  app.post('/api/admin/managed/jobs/:id/invoice/send', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const sendEmail = req.body?.sendEmail === true;
      const sendSms = req.body?.sendSms === true;
      if (!sendEmail && !sendSms) {
        return res.status(400).json({ ok: false, message: 'Choose at least one delivery method: email or SMS.' });
      }

      const built = await buildInvoiceForJob(pool, jobId, { customNote: req.body?.note });
      if (!built.ok) return res.status(404).json(built);
      const invoice = built.invoice;

      const emailTo = String(req.body?.email || invoice.billTo.email || '').trim();
      const phoneTo = normalizePhone(String(req.body?.phone || invoice.billTo.phone || ''));

      const delivery = { email: null, sms: null };

      if (sendEmail) {
        if (!emailTo) {
          return res.status(400).json({ ok: false, message: 'No email address available. Enter an email to send the invoice.' });
        }
        delivery.email = await sendEmailSafe({
          to: emailTo,
          subject: `${brand.productName} Invoice ${invoice.invoiceNumber} — ${moneyLabel(invoice.amountDue)} due`,
          html: renderInvoiceHtml(invoice),
        });
        if (delivery.email?.ok === false) {
          return res.status(502).json({ ok: false, message: delivery.email.message || 'Email delivery failed.' });
        }
      }

      if (sendSms) {
        if (!phoneTo) {
          return res.status(400).json({ ok: false, message: 'No phone number available. Enter a phone number to send via SMS.' });
        }
        delivery.sms = await sendSmsSafe({
          to: phoneTo,
          body: renderInvoiceSms(invoice),
        });
        if (delivery.sms?.ok === false) {
          return res.status(502).json({ ok: false, message: delivery.sms.message || 'SMS delivery failed.' });
        }
      }

      const { rows: saved } = await pool.query(
        `INSERT INTO homeowner_invoices
           (invoice_number, job_id, homeowner_user_id, amount_due, subtotal, paid, line_items, sent_via, sent_by, custom_note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          invoice.invoiceNumber,
          jobId,
          invoice.homeownerUserId,
          invoice.amountDue,
          invoice.subtotal,
          invoice.paid,
          JSON.stringify(invoice.lineItems),
          JSON.stringify({
            email: sendEmail ? { to: emailTo, simulated: delivery.email?.simulated === true } : null,
            sms: sendSms ? { to: phoneTo, simulated: delivery.sms?.simulated === true } : null,
          }),
          req.authUser.id,
          req.body?.note || null,
        ]
      );

      await audit(pool, req.authUser.id, 'invoice_sent', 'managed_job', jobId, {
        invoiceNumber: invoice.invoiceNumber,
        amountDue: invoice.amountDue,
        sendEmail,
        sendSms,
        emailTo: sendEmail ? emailTo : null,
        phoneTo: sendSms ? phoneTo : null,
      });

      res.json({
        ok: true,
        invoice: {
          ...invoice,
          id: Number(saved[0].id),
          sentVia: parseJson(saved[0].sent_via, {}),
        },
        delivery,
        message: `Invoice ${invoice.invoiceNumber} sent${sendEmail && sendSms ? ' via email and SMS' : sendEmail ? ' via email' : ' via SMS'}.`,
      });
    } catch (e) {
      console.error('invoice send:', e);
      if (String(e.message || '').includes('unique')) {
        return res.status(409).json({ ok: false, message: 'Invoice already sent for this job today. Use preview to resend manually.' });
      }
      res.status(500).json({ ok: false, message: 'Could not send invoice.' });
    }
  });

  app.get('/api/admin/homeowners/:userId/jobs', requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.userId);
      const { rows } = await pool.query(
        `SELECT * FROM managed_jobs WHERE homeowner_user_id=$1 ORDER BY created_at DESC LIMIT 50`,
        [userId]
      );
      res.json({ ok: true, jobs: rows.map((r) => serializeJob(r, { isAdmin: true, role: 'admin' })) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.get('/api/admin/homeowners/:userId/invoices', requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.userId);
      const { rows } = await pool.query(
        `SELECT * FROM homeowner_invoices WHERE homeowner_user_id=$1 ORDER BY created_at DESC LIMIT 50`,
        [userId]
      );
      res.json({
        ok: true,
        invoices: rows.map((r) => ({
          id: Number(r.id),
          invoiceNumber: r.invoice_number,
          jobId: Number(r.job_id),
          amountDue: Number(r.amount_due),
          subtotal: r.subtotal != null ? Number(r.subtotal) : null,
          paid: r.paid != null ? Number(r.paid) : 0,
          sentVia: parseJson(r.sent_via, {}),
          createdAt: r.created_at,
        })),
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  function moneyLabel(n) {
    const v = Number(n);
    return Number.isFinite(v) ? `$${v.toFixed(2)}` : '$0.00';
  }

  app.get('/api/admin/reporting/summary', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { rows: pay } = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN COALESCE(simulated,false)=false THEN amount ELSE 0 END),0)::float AS live_total,
           COALESCE(SUM(CASE WHEN simulated=true THEN amount ELSE 0 END),0)::float AS simulated_total,
           COALESCE(SUM(amount),0)::float AS total
         FROM payments WHERE status='succeeded'`
      );
      const { rows: tr } = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN COALESCE(simulated,false)=false THEN amount ELSE 0 END),0)::float AS live_total,
           COALESCE(SUM(CASE WHEN simulated=true THEN amount ELSE 0 END),0)::float AS simulated_total,
           COALESCE(SUM(amount),0)::float AS total
         FROM transfers WHERE status='paid'`
      );
      const { rows: allJobs } = await pool.query(
        `SELECT id, status, category, created_at, customer_retail_estimate_low, customer_retail_estimate_high, ai_assessment
         FROM managed_jobs`
      );
      const { rows: contractorRows } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM users WHERE role='contractor' AND COALESCE(is_blocked,false)=false`
      );
      let partnersCount = 0;
      try {
        const { rows: partnerRows } = await pool.query(`SELECT COUNT(*)::int AS c FROM partners`);
        partnersCount = partnerRows[0]?.c || 0;
      } catch {
        partnersCount = 0;
      }

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const closedish = new Set([
        'closed',
        'paid_out',
        'work_completed',
        'customer_review_pending',
        'admin_review_pending',
        'payout_pending',
      ]);
      const inactive = new Set(['closed', 'canceled', 'refunded', 'draft', 'paid_out']);
      const dispatch = new Set([
        'paid_for_dispatch',
        'awaiting_contractor',
        'contractor_invited',
        'awaiting_bid',
        'bid_received',
      ]);

      const jobsByStatus = {};
      const categoryMap = {};
      const urgencyMap = {};
      const hourMap = Array.from({ length: 24 }, () => 0);
      const monthMap = new Map();
      const dayMap = new Map();
      let activeJobs = 0;
      let awaitingDispatch = 0;
      let jobsThisMonth = 0;
      let retailSum = 0;
      let retailCount = 0;
      let diyOk = 0;
      let proRequired = 0;
      let pendingAi = 0;

      for (const j of allJobs) {
        const status = j.status || 'unknown';
        jobsByStatus[status] = (jobsByStatus[status] || 0) + 1;
        if (!inactive.has(status)) activeJobs += 1;
        if (dispatch.has(status)) awaitingDispatch += 1;

        const cat = String(j.category || 'others').trim().toLowerCase() || 'others';
        categoryMap[cat] = (categoryMap[cat] || 0) + 1;

        const created = j.created_at instanceof Date ? j.created_at : new Date(j.created_at);
        if (!Number.isNaN(created.getTime())) {
          if (created >= monthStart) {
            jobsThisMonth += 1;
            const dayKey = created.toISOString().slice(0, 10);
            dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + 1);
          }
          if (created >= sixMonthsAgo) {
            const mk = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;
            if (!monthMap.has(mk)) monthMap.set(mk, { open: 0, completed: 0, total: 0 });
            const bucket = monthMap.get(mk);
            bucket.total += 1;
            if (closedish.has(status)) bucket.completed += 1;
            else if (!['canceled', 'refunded'].includes(status)) bucket.open += 1;
          }
          if (created >= thirtyDaysAgo) {
            hourMap[created.getHours()] += 1;
          }
        }

        const low = Number(j.customer_retail_estimate_low);
        const high = Number(j.customer_retail_estimate_high);
        if (Number.isFinite(low) && Number.isFinite(high)) {
          retailSum += (low + high) / 2;
          retailCount += 1;
        }

        let assessment = j.ai_assessment;
        if (typeof assessment === 'string') {
          try {
            assessment = JSON.parse(assessment);
          } catch {
            assessment = null;
          }
        }
        if (!assessment || typeof assessment !== 'object') {
          pendingAi += 1;
        } else {
          if (assessment.safe_diy_allowed === true) diyOk += 1;
          else proRequired += 1;
          const urg = String(assessment.urgency || 'unknown').toLowerCase();
          urgencyMap[urg] = (urgencyMap[urg] || 0) + 1;
        }
      }

      const monthLabels = [];
      for (let i = 5; i >= 0; i -= 1) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
        const bucket = monthMap.get(key) || { open: 0, completed: 0, total: 0 };
        monthLabels.push({ label, ...bucket });
      }

      const byDayThisMonth = [];
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      for (let day = 1; day <= Math.min(daysInMonth, now.getDate()); day += 1) {
        const d = new Date(now.getFullYear(), now.getMonth(), day);
        const key = d.toISOString().slice(0, 10);
        byDayThisMonth.push({
          label: d.toLocaleString('en-US', { month: 'short', day: 'numeric' }),
          count: dayMap.get(key) || 0,
        });
      }

      const assessed = diyOk + proRequired;
      const diyPct = assessed > 0 ? Math.round((diyOk / assessed) * 100) : 0;

      res.json({
        ok: true,
        revenueCollected: pay[0]?.total || 0,
        revenueLive: pay[0]?.live_total || 0,
        revenueSimulated: pay[0]?.simulated_total || 0,
        contractorPaidOut: tr[0]?.total || 0,
        contractorPaidOutLive: tr[0]?.live_total || 0,
        contractorPaidOutSimulated: tr[0]?.simulated_total || 0,
        grossEstimate: (pay[0]?.total || 0) - (tr[0]?.total || 0),
        stripeConfigured: stripeConfigured(),
        paymentsMode: stripeConfigured() ? 'live' : 'simulated',
        jobsByStatus,
        kpis: {
          totalJobs: allJobs.length,
          activeJobs,
          awaitingDispatch,
          availableContractors: contractorRows[0]?.c || 0,
          avgRetailEstimate: retailCount ? Math.round(retailSum / retailCount) : 0,
          partnersCount,
          jobsThisMonth,
        },
        trendByMonth: monthLabels,
        byCategory: Object.entries(categoryMap)
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8),
        byUrgency: Object.entries(urgencyMap).map(([name, value]) => ({ name, value })),
        byHour: hourMap.map((count, hour) => ({
          hour,
          label: `${String(hour).padStart(2, '0')}:00`,
          count,
        })),
        byDayThisMonth,
        diySplit: { diyOk, proRequired, pendingAi, diyPct },
      });
    } catch (e) {
      console.error('reporting summary:', e);
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── Stripe webhook (signature required when Stripe is configured) ──────────
  app.post('/api/stripe/webhook', async (req, res) => {
    try {
      const sig = req.headers['stripe-signature'];
      let event = null;

      if (stripeConfigured()) {
        if (!sig || !req.rawBody) {
          return res.status(400).json({ ok: false, message: 'Missing Stripe signature.' });
        }
        event = await constructWebhookEvent(req.rawBody, sig);
      } else if (process.env.NODE_ENV !== 'production' && req.body?.id && req.body?.type) {
        // Local simulate only — never accept unsigned webhooks in production.
        event = req.body;
      }

      if (!event) return res.status(400).json({ ok: false, message: 'Invalid webhook' });

      const existing = await pool.query(
        `SELECT id FROM webhook_events WHERE provider='stripe' AND event_id=$1`,
        [event.id]
      );
      if (existing.rows.length) return res.json({ ok: true, duplicate: true });

      await pool.query(
        `INSERT INTO webhook_events (provider, event_id, type, processed, payload)
         VALUES ('stripe',$1,$2,false,$3)`,
        [event.id, event.type, JSON.stringify(event)]
      );

      if (event.type === 'checkout.session.completed') {
        const session = event.data?.object || {};
        const jobId = Number(session.metadata?.jobId);
        const paymentType = session.metadata?.paymentType;
        const userId = Number(session.metadata?.userId);
        const planCode = session.metadata?.planCode;
        if (jobId && paymentType) {
          let paymentStatus = 'succeeded';
          if (paymentType === 'dispatch_fee') {
            paymentStatus = 'authorized';
            await pool.query(
              `UPDATE managed_jobs SET
                 visit_fee_authorized=true,
                 stripe_payment_intent_id=$1,
                 updated_at=NOW()
               WHERE id=$2`,
              [session.payment_intent || null, jobId]
            );
          }
          await pool.query(
            `UPDATE payments SET status=$1, stripe_payment_intent=$2
             WHERE stripe_session_id=$3`,
            [paymentStatus, session.payment_intent || null, session.id]
          );
          const { rows: jobs } = await pool.query(`SELECT status FROM managed_jobs WHERE id=$1`, [jobId]);
          if (paymentType === 'dispatch_fee') {
            await pushStatus(pool, jobId, jobs[0]?.status, 'paid_for_dispatch', null, 'Stripe visit fee authorized (hold placed)');
            await pushStatus(pool, jobId, 'paid_for_dispatch', 'awaiting_contractor', null, 'Ready for dispatch');
            await triggerReferralBookingReward(pool, jobId);
          }
          if (paymentType === 'retail_payment') {
            await pushStatus(pool, jobId, jobs[0]?.status, 'scheduled', null, 'Stripe retail payment');
          }
          if (paymentType === 'lead_unlock' && userId) {
            await pool.query(
              `UPDATE lead_purchases SET status='unlocked', unlocked_at=NOW()
               WHERE job_id=$1 AND contractor_user_id=$2`,
              [jobId, userId]
            );
          }
        }
        if (paymentType === 'subscription' && userId && planCode) {
          await pool.query(
            `INSERT INTO subscriptions (user_id, plan_code, plan_family, status, stripe_subscription_id, simulated, current_period_end, meta)
             VALUES ($1,$2,$3,'active',$4,false, NOW() + INTERVAL '30 days', $5)`,
            [
              userId,
              planCode,
              String(planCode).includes('contractor')
                ? 'contractor'
                : String(planCode).includes('property') || String(planCode).includes('portfolio') || String(planCode).includes('brokerage')
                  ? 'property'
                  : 'diy',
              session.subscription || session.payment_intent || null,
              JSON.stringify({ planCode }),
            ]
          );
          await pool.query(`UPDATE users SET plan_code=$1 WHERE id=$2`, [planCode, userId]);
        }
      }

      if (event.type === 'payment_intent.succeeded') {
        const pi = event.data?.object || {};
        await pool.query(
          `UPDATE payments SET status='succeeded' WHERE stripe_payment_intent=$1`,
          [pi.id]
        );
      }

      if (event.type === 'payment_intent.payment_failed') {
        const pi = event.data?.object || {};
        await pool.query(
          `UPDATE payments SET status='failed' WHERE stripe_payment_intent=$1`,
          [pi.id]
        );
      }

      if (event.type === 'charge.refunded') {
        const charge = event.data?.object || {};
        await pool.query(
          `INSERT INTO refunds (amount, reason, status, stripe_refund_id, simulated)
           VALUES ($1,'stripe_charge_refunded','succeeded',$2,false)`,
          [Number(charge.amount_refunded || 0) / 100, charge.id]
        );
      }

      if (event.type === 'charge.dispute.created') {
        const d = event.data?.object || {};
        await pool.query(
          `INSERT INTO disputes (stripe_dispute_id, amount, reason, status, meta)
           VALUES ($1,$2,$3,'open',$4)`,
          [
            d.id,
            Number(d.amount || 0) / 100,
            d.reason || 'stripe_dispute',
            JSON.stringify(d),
          ]
        );
      }

      if (event.type === 'account.updated') {
        const acct = event.data?.object || {};
        if (acct.id) {
          await pool.query(
            `UPDATE users SET stripe_onboarding_status=$1, stripe_payouts_enabled=$2
             WHERE stripe_account_id=$3`,
            [
              acct.details_submitted ? 'complete' : 'pending',
              acct.payouts_enabled === true,
              acct.id,
            ]
          );
          const { rows: users } = await pool.query(`SELECT id FROM users WHERE stripe_account_id=$1`, [acct.id]);
          if (users[0]) {
            await syncContractorAccountFromUser(pool, users[0].id);
          }
        }
      }

      if (event.type === 'transfer.created' || event.type === 'transfer.reversed') {
        const tr = event.data?.object || {};
        if (tr.id) {
          await pool.query(
            `UPDATE transfers SET status=$1 WHERE stripe_transfer_id=$2`,
            [event.type === 'transfer.reversed' ? 'reversed' : 'paid', tr.id]
          );
        }
      }

      if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
        const inv = event.data?.object || {};
        if (inv.subscription) {
          await pool.query(
            `UPDATE subscriptions SET status=$1 WHERE stripe_subscription_id=$2`,
            [event.type === 'invoice.paid' ? 'active' : 'past_due', inv.subscription]
          );
        }
      }

      if (
        event.type === 'customer.subscription.created' ||
        event.type === 'customer.subscription.updated' ||
        event.type === 'customer.subscription.deleted'
      ) {
        const sub = event.data?.object || {};
        if (sub.id) {
          const status =
            event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status || 'active';
          await pool.query(
            `UPDATE subscriptions SET status=$1, current_period_end=to_timestamp($2)
             WHERE stripe_subscription_id=$3`,
            [status, sub.current_period_end || null, sub.id]
          );
        }
      }

      if (event.type === 'payout.paid' || event.type === 'payout.failed') {
        await handlePayoutWebhookUpdate(pool, event);
      }

      await pool.query(`UPDATE webhook_events SET processed=true WHERE provider='stripe' AND event_id=$1`, [
        event.id,
      ]);
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, message: 'Webhook verification failed.' });
    }
  });
}
