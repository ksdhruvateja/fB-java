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
  getLocationFactorByZip,
  getZipMarketLabel,
  resolveCustomerVisitFee,
  applyVisitFeeCredit,
} from './pricing.js';
import {
  buildProfessionalDispatchBreakdown,
  buildProfessionalRequestBetaSnapshot,
  saveProfessionalDispatchSnapshot,
} from './professional-dispatch-pricing.js';
import {
  buildLocalMarketProfile,
  loadMarketData,
  saveMarketSnapshot,
} from './market-intelligence.js';
import { zip5 } from './address-utils.js';
import { isPaidHomeCarePlan } from './subscription-catalog.js';
import {
  activateSubscriptionFromCheckout,
  applyInvoiceSubscriptionStatus,
  applyStripeSubscriptionObject,
  getHomeCareEntitlement,
} from './subscription-state.js';
import { insertJobReview, loadJobForReview, parseCategoryRatings } from './job-reviews.js';
import {
  createRequireHomeCareFeature,
  getHomeCareConfig,
  priorityTierForConfig,
  resolveFeatureEntitlement,
} from './homecare-config.js';
import { buildPropertyAIContext } from './property-ai-context.js';
import { assessRepair, extractDocument } from './fixa/index.js';
import { resolveJobPricingMode } from './contractor-agreement.js';
import { createJobAuthorization } from './job-authorization.js';
import {
  ASSESSMENT_ERROR_MESSAGES,
  registerAssessmentProcessor,
  resolveAssessmentStatus,
  scheduleAssessmentJob,
  schedulePendingServiceRequestAssessment,
} from './assessment-worker.js';
import {
  normalizeStructuredEquipment,
  hasStructuredEquipmentData,
  equipmentFromExtraction,
} from './contractor-equipment.js';
import {
  upsertServiceReminderEligibility,
  cancelServiceReminderForJob,
  resetReminderOnReschedule,
  TERMINAL_JOB_STATUSES,
} from './service-reminders.js';
import {
  resolveServiceAtUtc,
  resolveAndPersistPropertyTimezone,
  normalizeTimezoneInput,
} from './property-timezone.js';
import {
  stripeConfigured,
  shouldSimulatePayment,
  assertPaymentsAvailable,
  createCheckoutSession,
  createExpressAccount,
  createConnectAccountLink,
  createTransfer,
  constructWebhookEvent,
  capturePaymentIntent,
  cancelPaymentIntent,
  getStripe,
} from './stripe.js';
import { brand } from './brand.js';
import { ensurePayoutRecordForJob, approveAndReleasePayout, handlePayoutWebhookUpdate, syncContractorAccountFromUser } from './payout-db.js';
import {
  claimWebhookEvent,
  markWebhookProcessed,
  markWebhookFailed,
  settleSuccessfulJobPayment,
  processSuccessfulPayment,
  applyPaymentRiskToPayouts,
  capturePaymentStripeFees,
  reconcileRefundForJob,
} from './payment-settlement.js';
import { PAYOUT_STATUS } from './payout-service.js';
import {
  lookupPartnerByCode,
  normalizePartnerCode,
  publicPartnerView,
  syncPartnerReferralFromJob,
  intakeShareUrl,
  attachPartnerToJob,
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
import { sendEmailSafe, sendSmsSafe, notifyOps } from './notify.js';
import { lookupZipPlace, formatLocationContext } from './zip-market.js';
import { isAdminRole } from './auth-helpers.js';
import { registerDisputeRoutes } from './disputes.js';
import {
  CANCELLATION_REASON_LABELS,
  HOMEOWNER_CANCELABLE_STATUSES,
  isHomeownerCancellableStatus,
  normalizeCancellationPayload,
  notifyJobCancelled,
  releaseVisitFeeHoldIfNeeded,
} from './job-cancellation.js';
import {
  registerContractorComplianceRoutes,
  enforceContractorDispatchGate,
} from './contractor-compliance-routes.js';
import {
  ACKNOWLEDGMENT_TYPES,
  requireHomeownerAcknowledgment,
  requireActionConsents,
  validateAndRecordActionConsents,
  checkActionConsentsFromBody,
  assertHomeownerDispatchConsent,
} from './homeowner-acknowledgments.js';
import { recordSignupMarketingConsents } from './marketing-consent-service.js';
import { registerHomeownerConsentRoutes } from './homeowner-consent-routes.js';
import { registerDiySafetyRoutes } from './diy-safety-routes.js';
import { registerLegalAdminRoutes } from './legal-admin-routes.js';
import { recordJobDispatchEvidence } from './job-evidence.js';
import { loadCurrentComplianceDocuments } from './contractor-compliance.js';
import {
  homeownerStatusLabel,
  loadJobTimeline,
  recordJobOperationalEvent,
} from './job-operational-events.js';
import { convertProposalToInvoice } from './quote-invoice-service.js';
import { createInAppNotification, notifyAdmins } from './in-app-notifications.js';

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
  try {
    const { applyReferralCode } = await import('./referrals.js');
    await applyReferralCode(pool, newUser.id, partnerCode, { actorId: newUser.id });
  } catch (e) {
    console.error('processReferralAward', e);
  }
}

async function triggerReferralBookingReward(pool, jobId) {
  try {
    const { rows: jobs } = await pool.query(
      `SELECT j.id, j.homeowner_user_id, j.assigned_contractor_user_id
       FROM managed_jobs j WHERE j.id=$1`,
      [jobId]
    );
    if (!jobs[0]) return;
    const { onReferralQualifyingPayment } = await import('./referral-routes.js');
    await onReferralQualifyingPayment(pool, {
      jobId,
      homeownerUserId: jobs[0].homeowner_user_id,
      contractorUserId: jobs[0].assigned_contractor_user_id,
    });
  } catch (err) {
    console.error('Error in triggerReferralBookingReward:', err);
  }
}

async function applyAutoReferralDiscount(pool, jobId, partnerCode) {
  try {
    if (!partnerCode) return;
    const normalized = partnerCode.trim().toUpperCase();
    if (!normalized) return;

    // Only B2B partner codes may auto-apply a job discount.
    // Peer referral codes establish relationships / credits — they are not promo coupons.
    const { rows: partners } = await pool.query(
      `SELECT id FROM partners WHERE LOWER(code)=LOWER($1) AND active=true AND deleted_at IS NULL LIMIT 1`,
      [normalized]
    );
    if (!partners.length) return;

    let referralDiscountValue = 25.0;
    try {
      const { rows: pr } = await pool.query(`SELECT rules FROM pricing_rules WHERE id='default'`);
      const rules = pr[0]?.rules || {};
      if (rules.referral_coupon_value != null) {
        referralDiscountValue = Number(rules.referral_coupon_value);
      }
    } catch { }

    await pool.query(
      `UPDATE managed_jobs SET
         discount_code=$1,
         discount_type='amount',
         discount_value=$2,
         discount_label=$3,
         updated_at=NOW()
       WHERE id=$4`,
      [normalized, referralDiscountValue, `Partner referral (${normalized})`, jobId]
    );
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
    u.name AS contractor_name,
    u.phone AS contractor_phone,
    u.compliance_status,
    u.insurance_document_name,
    u.insurance_document_data,
    u.insurance_details,
    u.trade AS tech_trade,
    emp.full_name AS employee_full_name,
    emp.job_title AS employee_job_title,
    emp.trade AS employee_trade,
    emp.bio AS employee_bio,
    emp.customer_description AS employee_customer_description,
    emp.photo_data AS employee_photo_data,
    emp.phones AS employee_phones,
    emp.emails AS employee_emails,
    u.company_name AS employee_company_name,
    inv.id AS linked_invoice_id,
    inv.invoice_number AS linked_invoice_number,
    inv.status AS linked_invoice_status,
    inv.amount_due AS linked_invoice_amount_due
  FROM managed_jobs j
  LEFT JOIN users u ON u.id = j.assigned_contractor_user_id
  LEFT JOIN contractor_employees emp ON emp.id = j.assigned_employee_id
  LEFT JOIN LATERAL (
    SELECT id, invoice_number, status, amount_due
    FROM homeowner_invoices
    WHERE job_id = j.id
    ORDER BY created_at DESC
    LIMIT 1
  ) inv ON true
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

async function claimPendingServiceRequestAssessment(
  pool,
  pendingId,
  homeownerUserId,
  { force = false } = {}
) {
  const { rows } = await pool.query(
    `UPDATE pending_service_requests
        SET assessment_status = 'processing',
            updated_at = NOW()
      WHERE id = $1
        AND homeowner_user_id = $2
        AND (
          $3::boolean = TRUE
          OR assessment_status IS NULL
          OR assessment_status IN ('pending', 'failed')
        )
      RETURNING *`,
    [
      pendingId,
      homeownerUserId,
      force,
    ]
  );

  return rows[0] || null;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendNotificationEmail({ to, subject, html, template, data, firstName }) {
  if (!to) return;
  try {
    if (template) {
      await sendEmailSafe({ to, template, data });
      return;
    }
    await sendEmailSafe({ to, subject, html, firstName });
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

/** Sum of homeowner visit/dispatch fees already authorized or paid on a job. */
async function getVisitFeeCreditForJob(pool, jobId) {
  const { rows } = await pool.query(
    `SELECT amount, status FROM payments
     WHERE job_id=$1 AND payment_type='dispatch_fee'
       AND status IN ('succeeded','authorized','paid','captured')
     ORDER BY id DESC LIMIT 1`,
    [jobId]
  );
  if (rows[0]) {
    return {
      amount: Math.max(0, Number(rows[0].amount) || 0),
      status: rows[0].status,
      source: 'payment',
    };
  }
  const { rows: jobs } = await pool.query(
    `SELECT visit_fee_amount, visit_fee_authorized, visit_fee_captured FROM managed_jobs WHERE id=$1`,
    [jobId]
  );
  const j = jobs[0];
  if (j && (j.visit_fee_authorized || j.visit_fee_captured) && j.visit_fee_amount != null) {
    return {
      amount: Math.max(0, Number(j.visit_fee_amount) || 0),
      status: j.visit_fee_captured ? 'succeeded' : 'authorized',
      source: 'job',
    };
  }
  return { amount: 0, status: null, source: null };
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

function getPackageLabel(job) {
  const raw = job || {};

  // HomeCare / subscription plan
  const plan = raw.packageLabel ?? raw.package ?? raw.planName ?? raw.plan ?? raw.homeCarePlan ?? raw.homecarePlan;

  if (typeof plan === "string" && plan.trim()) { return "Plan";}

  // Hire a Professional flow
  const selectedAction = String(raw.selectedAction ?? raw.selected_action ?? "" ).trim().toLowerCase();

  if (selectedAction === "hire" || selectedAction === "hire_professional") {
    return "Hire a Professional";
  }

  const paymentType = String(raw.paymentType ?? raw.payment_type ?? "").trim().toLowerCase();

  if (paymentType === "pending_professional_fee" || paymentType === "dispatch_fee") {
    return "Hire a Professional";
  }

  return "—";
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
  const pricingMode = resolveJobPricingMode(row);
  const managedPricingFirewall =
    pricingMode === 'FIXBRIDGE_MANAGED' && isAssignedContractor && !isAdmin;

  const base = {
    id: Number(row.id),
    bookingId: row.booking_id,
    jobMode: row.job_mode || 'managed',
    pricingMode,
    status: row.status,
    category: row.category,
    serviceSubcategory: row.service_subcategory || undefined,
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
    priorityTier: row.priority_tier || 'standard',
    homeownerUserId: isAdmin ? row.homeowner_user_id : undefined,
    aiAssessment: (() => {
      const a = parseJson(row.ai_assessment);
      if (!a) return null;
      const risk = row.diy_risk_level || a.diy_risk_level || 'green';
      if ((role === 'homeowner' || (isOwner && role !== 'admin')) && risk === 'red') {
        return {
          ...a,
          diy_steps: [],
          diy_guide_steps: [],
          tools_required: [],
          materials_needed: [],
          safe_diy_allowed: false,
        };
      }
      return a;
    })(),
    assessmentStatus: resolveAssessmentStatus(row),
    assessmentErrorCode: row.assessment_error_code || null,
    showRetailPrice: row.show_retail_price !== false,
    preferredTimeNote: 'Preferred service time — not confirmed until a contractor is scheduled.',
    partnerCode: row.partner_code,
    referringName: managedPricingFirewall ? undefined : row.referring_name,
    referringCompany: managedPricingFirewall ? undefined : row.referring_company,
    customerPartnerStatusConsent: row.customer_partner_status_consent === true,
    referralStatus: managedPricingFirewall ? undefined : row.referral_status,
    propertyPurpose: row.property_purpose,
    transactionStage: row.transaction_stage,
    completionReport: parseJson(row.completion_report),
    customerConfirmedAt: row.customer_confirmed_at || null,
    discountCode: managedPricingFirewall ? undefined : row.discount_code || null,
    discountLabel: managedPricingFirewall ? undefined : row.discount_label || null,
    discountType: managedPricingFirewall ? undefined : row.discount_type || null,
    discountValue: managedPricingFirewall
      ? undefined
      : row.discount_value != null
        ? Number(row.discount_value)
        : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assignedContractorUserId: row.assigned_contractor_user_id,
    preferredContractorUserId: row.preferred_contractor_user_id || null,
    sourceRecurringServiceId: row.source_recurring_service_id || null,
    activeProposalId: row.active_proposal_id,
    streetAddress: isAdmin || isOwner || (isAssignedContractor && addressUnlocked(row.status)) ? (row.street_address || null) : null,
    city: isAdmin || isOwner || isAssignedContractor || role === 'contractor' ? (row.city || null) : null,
    state: isAdmin || isOwner || isAssignedContractor || role === 'contractor' ? (row.state || null) : null,
    zip: isAdmin || isOwner || (isAssignedContractor && addressUnlocked(row.status)) ? (row.zip || null) : null,
    country: isAdmin || isOwner || (isAssignedContractor && addressUnlocked(row.status)) ? (row.country || null) : null,
  };

  if (isAdmin) {
    base.preferredByHomeowner = Boolean(row.preferred_contractor_user_id);
  }

  if (isOwner || isAdmin) {
    base.cancellationReason = row.cancellation_reason || null;
    base.cancellationReasonCode = row.cancellation_reason_code || null;
    base.cancellationDetails = parseJson(row.cancellation_details);
    base.cancelledAt = row.cancelled_at || null;
    base.cancelledBy = row.cancelled_by || null;
  } else if (isAssignedContractor && String(row.status) === 'canceled') {
    base.cancelledBy = row.cancelled_by || null;
    if (row.cancellation_reason_code && row.cancellation_reason_code !== 'provider_issue') {
      base.cancellationReason =
        CANCELLATION_REASON_LABELS[row.cancellation_reason_code] || row.cancellation_reason || null;
    }
  }

  if ((isOwner || isAdmin) && row.assigned_contractor_user_id) {
    const ratingRaw = row.tech_rating != null ? Number(row.tech_rating) : null;
    const employeePhones = parseJson(row.employee_phones, []) || [];
    const employeeEmails = parseJson(row.employee_emails, []) || [];
    const visiblePhones = employeePhones.filter((p) => p?.customerVisible !== false);
    const visibleEmails = employeeEmails.filter((e) => e?.customerVisible !== false);
    const primaryPhone =
      visiblePhones.find((p) => p?.isPrimary)?.value ||
      visiblePhones[0]?.value ||
      null;
    const primaryEmail =
      visibleEmails.find((e) => e?.isPrimary)?.value ||
      visibleEmails[0]?.value ||
      null;
    const employee =
      row.assigned_employee_id && row.employee_full_name
        ? {
          id: Number(row.assigned_employee_id),
          name: row.employee_full_name,
          jobTitle: row.employee_job_title || null,
          company: row.tech_company || row.company_name || row.employee_company_name || null,
          phone: primaryPhone || row.tech_phone || row.contractor_phone || null,
          email: primaryEmail || null,
          trade: row.employee_trade || row.tech_trade || row.trade || null,
          photoUrl: row.employee_photo_data
            ? `/api/contractor/employees/${row.assigned_employee_id}/photo`
            : null,
          bio: row.employee_customer_description || row.employee_bio || null,
        }
        : null;
    base.technician = employee || {
      id: Number(row.assigned_contractor_user_id),
      name: row.tech_name || row.contractor_name || null,
      company: row.tech_company || row.company_name || null,
      phone: row.tech_phone || row.contractor_phone || null,
      rating: Number.isFinite(ratingRaw) ? ratingRaw : null,
      verified: row.tech_verified === true || row.compliance_status === 'approved',
      insured: Boolean(
        row.tech_insured ||
        row.insurance_document_data ||
        row.insurance_document_name ||
        row.insurance_details
      ),
      trade: row.tech_trade || row.trade || null,
    };
    base.assignedEmployeeId = row.assigned_employee_id != null ? Number(row.assigned_employee_id) : null;
    base.homeownerStatusLabel = homeownerStatusLabel(row.status, Boolean(row.assigned_employee_id || base.technician?.name));
  } else if (isOwner || isAdmin) {
    base.technician = null;
    base.homeownerStatusLabel = homeownerStatusLabel(row.status, false);
  }

  // Customer retail visibility — homeowners only see final FixBridge amounts
  if (isOwner || isAdmin) {
    base.customerRetailEstimateLow = row.customer_retail_estimate_low != null
      ? Number(row.customer_retail_estimate_low) : null;
    base.customerRetailEstimateHigh = row.customer_retail_estimate_high != null
      ? Number(row.customer_retail_estimate_high) : null;
    base.visitFeeAuthorized = row.visit_fee_authorized === true;
    base.visitFeeCaptured = row.visit_fee_captured === true;
    base.visitFeeAmount =
      row.visit_fee_amount != null
        ? Number(row.visit_fee_amount)
        : parseJson(row.pricing)?.contractor_visit_fee != null
          ? Number(parseJson(row.pricing).contractor_visit_fee)
          : null;
    base.diyRiskLevel = row.diy_risk_level || 'green';
    const assessmentForReasons = parseJson(row.ai_assessment);
    if (isAdmin && assessmentForReasons) {
      base.diyRiskReasons = assessmentForReasons.diy_risk_reasons || [];
      base.diyRiskReasonCodes = assessmentForReasons.diy_risk_reason_codes || [];
    }
    const storedPricingOwner = parseJson(row.pricing) || {};
    base.estimateContext =
      storedPricingOwner.estimate_context ||
      (row.zip ? String(row.zip).slice(0, 5) : null);
    base.estimateConfidence = row.estimate_confidence || storedPricingOwner.estimate_confidence || null;
    base.pricingDisclaimer =
      storedPricingOwner.disclaimer ||
      'Estimated service range includes coordination, administration, payment handling and subcontracted delivery.';
    if (row.linked_invoice_id) {
      base.invoiceId = Number(row.linked_invoice_id);
      base.invoiceNumber = row.linked_invoice_number || null;
      base.invoiceStatus = row.linked_invoice_status || null;
      base.invoiceAmountDue =
        row.linked_invoice_amount_due != null ? Number(row.linked_invoice_amount_due) : null;
    }
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
    const storedPricing = parseJson(row.pricing) || {};
    base.pricing = {
      show_price: row.show_retail_price !== false,
      customer_retail_estimate_low: base.customerRetailEstimateLow,
      customer_retail_estimate_high: base.customerRetailEstimateHigh,
      disclaimer: base.pricingDisclaimer,
      contractor_visit_fee:
        base.visitFeeAmount != null
          ? base.visitFeeAmount
          : storedPricing.contractor_visit_fee != null
            ? Number(storedPricing.contractor_visit_fee)
            : null,
    };
  }

  // Contractor net visibility — managed jobs hide customer retail economics
  if (isAssignedContractor || isAdmin || role === 'contractor') {
    if (managedPricingFirewall) {
      base.providerCompensationLow =
        row.estimated_contractor_net_low != null ? Number(row.estimated_contractor_net_low) : null;
      base.providerCompensationHigh =
        row.estimated_contractor_net_high != null ? Number(row.estimated_contractor_net_high) : null;
      base.nteLimit = row.nte_limit != null ? Number(row.nte_limit) : null;
      base.managedPricingFirewall = true;
      base.pricingCommunicationGuidance = true;
    } else {
      base.estimatedContractorNetLow =
        row.estimated_contractor_net_low != null ? Number(row.estimated_contractor_net_low) : null;
      base.estimatedContractorNetHigh =
        row.estimated_contractor_net_high != null ? Number(row.estimated_contractor_net_high) : null;
    }
  }

  // Admin-only internals
  if (isAdmin) {
    base.homeownerUserId = row.homeowner_user_id;
    base.adminNotes = row.admin_notes;
    base.workQueueStatus = row.work_queue_status || null;
    base.serviceFeeAmount = row.service_fee_amount != null ? Number(row.service_fee_amount) : null;
    base.serviceAmount = row.service_amount != null ? Number(row.service_amount) : null;
    base.couponDiscountAmount = row.coupon_discount_amount != null ? Number(row.coupon_discount_amount) : null;
    base.finalCustomerAmount = row.final_customer_amount != null ? Number(row.final_customer_amount) : null;
    base.paymentCompletedAt = row.payment_completed_at || null;
    base.checkoutSnapshot = parseJson(row.checkout_snapshot);
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

async function hasSucceededRetailPayment(pool, jobId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM payments WHERE job_id=$1 AND payment_type='retail_payment' AND status='succeeded' LIMIT 1`,
    [jobId]
  );
  return rows.length > 0;
}

async function notifyAdminsNewJobForQuote(pool, { job, homeowner }) {
  const bookingId = job.booking_id || `FB-${job.id}`;
  const estimateLow = job.customer_retail_estimate_low;
  const estimateHigh = job.customer_retail_estimate_high;
  const estimate =
    estimateLow != null && estimateHigh != null
      ? `$${Math.round(Number(estimateLow))}–$${Math.round(Number(estimateHigh))}`
      : 'see job details';
  const msg =
    `${brand.productName}: New job ${bookingId} ready for contractor quote — ` +
    `"${job.title || job.category}" (${job.category || 'repair'}). ` +
    `Homeowner: ${homeowner?.name || 'Customer'} (${homeowner?.email || '—'}). AI estimate: ${estimate}.`;

  notifyOps(msg);

  try {
    await notifyAdmins(pool, {
      type: 'new_service_request',
      title: 'New service request',
      message: msg,
      jobId: job.id,
      entityType: 'job',
      entityId: job.id,
    });
  } catch {
    /* non-fatal */
  }

  try {
    const { rows: admins } = await pool.query(
      `SELECT email, name FROM users WHERE role='admin' AND COALESCE(is_blocked,false)=false AND email IS NOT NULL`
    );
    for (const admin of admins) {
      await sendEmailSafe({
        to: admin.email,
        template: 'admin_notification',
        data: {
          firstName: admin.name,
          subject: `${brand.productName} — New job for contractor quote ${bookingId}`,
          headline: 'New job for contractor quote',
          message: msg,
          viewUrl: `${(process.env.APP_URL || '').replace(/\/$/, '')}/admin`,
        },
      });
    }
  } catch (e) {
    console.error('notify new job admins:', e.message);
  }
}

async function notifyAdminsHomeownerApprovedQuote(pool, { job, homeowner, proposal }) {
  const bookingId = job.booking_id || `FB-${job.id}`;
  const amount = proposal?.retail_amount != null ? `$${Math.round(Number(proposal.retail_amount))}` : 'see proposal';
  const msg =
    `${brand.productName}: Homeowner approved quote ${bookingId} — ` +
    `"${job.title || job.category}" for ${amount}. ` +
    `${homeowner?.name || 'Customer'} (${homeowner?.email || '—'}). Request contractor dispatch when ready.`;

  notifyOps(msg);

  try {
    await notifyAdmins(pool, {
      type: 'quote_accepted',
      title: 'Quote accepted',
      message: msg,
      jobId: job.id,
      entityType: 'quote',
      entityId: proposal?.id || job.active_proposal_id || job.id,
    });
  } catch {
    /* non-fatal */
  }

  try {
    const { rows: admins } = await pool.query(
      `SELECT email, name FROM users WHERE role='admin' AND COALESCE(is_blocked,false)=false AND email IS NOT NULL`
    );
    for (const admin of admins) {
      await sendEmailSafe({
        to: admin.email,
        template: 'admin_notification',
        data: {
          firstName: admin.name,
          subject: `${brand.productName} — Homeowner approved quote ${bookingId}`,
          headline: 'Homeowner approved quote',
          message: msg,
          viewUrl: `${(process.env.APP_URL || '').replace(/\/$/, '')}/admin`,
        },
      });
    }
  } catch (e) {
    console.error('notify approval admins:', e.message);
  }
}

async function notifyAdminsDispatchServiceRequest(pool, { job, homeowner, amount, discountCode }) {
  const bookingId = job.booking_id || `FB-${job.id}`;
  const category = job.category || 'repair';
  const area = [job.city, job.state, job.zip].filter(Boolean).join(', ') || job.city_state_zip || 'Service area';
  const couponNote = discountCode ? ` Coupon: ${discountCode}.` : '';
  const paid = Math.round((Number(amount) || 0) * 100) / 100;
  const statusLabel = job.work_queue_status === 'PAID_NEEDS_REVIEW' ? 'PAID — NEEDS REVIEW' : 'Ready for Admin Review';
  const msg =
    `${brand.productName}: New Paid Service Request ${bookingId} — ` +
    `${category} • ${area}. Customer paid: $${paid}.${couponNote} Status: ${statusLabel}.`;

  notifyOps(msg);

  try {
    await notifyAdmins(pool, {
      type: 'new_service_request',
      title: 'New paid service request',
      message: msg,
      jobId: job.id,
      entityType: 'job',
      entityId: job.id,
    });
  } catch {
    /* non-fatal */
  }

  try {
    const { rows: admins } = await pool.query(
      `SELECT email, name FROM users WHERE role='admin' AND COALESCE(is_blocked,false)=false AND email IS NOT NULL`
    );
    for (const admin of admins) {
      await sendEmailSafe({
        to: admin.email,
        template: 'admin_notification',
        data: {
          firstName: admin.name,
          subject: `${brand.productName} — New Paid Service Request ${bookingId}`,
          headline: 'New paid service request',
          message:
            `${bookingId} — ${category} • ${area}. Customer paid: $${paid}.` +
            `${discountCode ? ` Coupon: ${discountCode}.` : ''} Status: ${statusLabel}.`,
          viewUrl: `${(process.env.APP_URL || '').replace(/\/$/, '')}/admin`,
        },
      });
    }
  } catch (e) {
    console.error('notify dispatch admins:', e.message);
  }
}

async function applyValidatedCouponToJob(pool, jobId, discount) {
  const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
  const job = rows[0];
  if (!job) return null;
  // Persist coupon on the job for checkout preview only — does not redeem / increment uses.
  // Do not rewrite retail estimate columns; visit-fee discount is computed at checkout.
  await persistJobDiscountFields(pool, jobId, discount, null);
  return discount;
}

/** Gather ZIP, property, postal data, and automatic local market intelligence for AI + pricing. */
async function loadAssessContext(pool, job, rules, assessment = null) {
  const zip = job.zip ? String(job.zip).trim().slice(0, 5) : null;
  let property = null;
  if (job.property_id) {
    const { rows } = await pool.query(`SELECT * FROM properties WHERE id=$1`, [job.property_id]);
    property = rows[0] || null;
  }

  let localJobs = [];
  let bids = [];
  let completedPayments = [];
  let zipPlace = null;
  try {
    const market = await loadMarketData(pool, {
      zip,
      trade: assessment?.category || job.category,
      jobId: job.id,
    });
    localJobs = market.jobs || [];
    bids = market.bids || [];
    completedPayments = market.completedPayments || [];
    zipPlace = market.zipPlace || null;
  } catch (err) {
    console.warn('[assessment] market context unavailable, continuing', {
      jobId: job.id,
      error: err?.message || String(err),
    });
  }

  const marketProfile = await buildLocalMarketProfile({
    zip,
    trade: assessment?.category || job.category,
    serviceType: assessment?.service_type,
    rules: rules || DEFAULT_PRICING_RULES,
    jobs: localJobs,
    bids,
    completedPayments,
    zipPlace,
    city: job.city || property?.city,
    state: job.state || property?.state,
    assessment,
  });

  const marketLabel = getZipMarketLabel(zip);
  const locationFactor = getLocationFactorByZip(zip) || Number(rules?.location_factor) || 1;

  const locationContext = formatLocationContext({
    zip,
    city: job.city || property?.city,
    state: job.state || property?.state,
    zipPlace,
    marketLabel,
    locationFactor,
    marketProfile,
    property,
    serviceTiming: job.service_timing,
  });

  return {
    zip,
    city: job.city || property?.city || zipPlace?.place,
    state: job.state || property?.state || zipPlace?.state,
    zipPlace,
    marketLabel,
    locationFactor,
    marketProfile,
    property,
    locationContext,
  };
}

async function runManagedJobAssessment(pool, job, viewer) {
  const t0 = Date.now();

  const isPending =
    String(job?.record_type || job?.recordType || '').toLowerCase() ===
    'pending_service_request';

  const recordId = Number(job?.id);

  console.log('[assessment] processing started', {
    recordType: isPending ? 'pending_service_request' : 'managed_job',
    jobId: recordId,
    pendingServiceRequestId: isPending ? recordId : null,
  });

  const rules = await loadPricingRules(pool);

  const { rows: hoRows } = await pool.query(
    `SELECT plan_code FROM users WHERE id=$1`,
    [job.homeowner_user_id]
  );

  const homeCarePro = isPaidHomeCarePlan(hoRows[0]?.plan_code);

  // Phase 1: preliminary context for AI (ZIP + property + coarse market)
  const preCtx = await loadAssessContext(
    pool,
    job,
    rules,
    null
  );

  console.log('[assessment] context ready', {
    jobId: recordId,
    zip: preCtx.zip,
    city: preCtx.city,
    state: preCtx.state,
    durationMs: Date.now() - t0,
  });

  let propertyAiContext = '';

  if (job.property_id) {
    try {
      const ctx = await buildPropertyAIContext(
        pool,
        job.property_id,
        job.homeowner_user_id
      );
      propertyAiContext = String(ctx?.text || '').trim();
    } catch (err) {
      console.warn('[assessment] property context unavailable', {
        propertyId: job.property_id,
        error: err?.message || String(err),
      });
    }
  }

  const aiStarted = Date.now();

  console.log('[assessment] AI started', {
    jobId: recordId,
  });

  const result = await assessRepair({
    category: job.category,
    description: job.description,
    imageDataUrl: job.media_data_url,
    locationContext: propertyAiContext
      ? `${preCtx.locationContext}\n\nThis homeowner's property (this login only):\n${propertyAiContext}`
      : preCtx.locationContext,
    zip: preCtx.zip,
    city: preCtx.city,
    state: preCtx.state,
  });

  console.log('[assessment] AI complete', {
    jobId: recordId,
    durationMs: Date.now() - aiStarted,
    source: result?.source,
  });

  const assessment = result.assessment;

  if (!assessment) {
    return {
      ok: false,
      error: result.error || 'Assessment failed.',
      code: 'AI_ASSESSMENT_FAILED',
    };
  }

  // Phase 2: refine market profile with AI service classification
  const ctx = await loadAssessContext(
    pool,
    job,
    rules,
    assessment
  );

  const afterHours =
    /evening|weekend|night|holiday/i.test(
      job.service_timing || ''
    );

  let pricing = computePreliminaryRetail(
    assessment,
    rules,
    {
      afterHours,
      urgency: assessment.urgency,
      zip: ctx.zip || job.zip || null,
      marketProfile: ctx.marketProfile,
      subscriptionDiscount: homeCarePro
        ? Number(rules.subscription_discount) || 0
        : 0,
    }
  );

  pricing.contractor_visit_fee =
    resolveCustomerVisitFee(rules, {
      emergency:
        job.service_timing === 'emergency' ||
        String(assessment.urgency || '')
          .toLowerCase()
          .includes('emerg'),
      homeCarePro,
    });

  /*
   * Existing managed jobs may have discount information.
   *
   * Pending service requests have not yet become managed jobs,
   * so do not run the managed-job discount lookup for them.
   */
  if (!isPending) {
    const discount = await resolveJobDiscount(
      pool,
      job
    );

    if (discount) {
      pricing = applyDiscountToPricing(
        pricing,
        discount
      );
    }
  }

  let snapshotId = null;

  /*
   * Market snapshots are tied to managed jobs.
   * A pending service request does not have a managed_job row yet,
   * so save the snapshot only after the request has become a managed job.
   */
  if (!isPending) {
    // Save the market snapshot only for an actual managed job.
    snapshotId = await saveMarketSnapshot(pool, {
      jobId: recordId,
      profile: ctx.marketProfile,
      pricing,
      propertyZip: ctx.zip,
      city: ctx.city,
      state: ctx.state,
      serviceCategory: assessment.category,
      serviceSubcategory:
        assessment.service_subcategory,
    });
  }

  if (isPending) {
    // pending_service_requests has a smaller assessment schema than
    // managed_jobs. Keep the full pricing/assessment payload in JSONB
    // and only update columns that actually exist on the pending table.
    await pool.query(
      `UPDATE pending_service_requests SET
         ai_assessment=$1,
         pricing=$2,
         category=COALESCE($3, category),
         assessment_status='ready',
         updated_at=NOW()
       WHERE id=$4`,
      [
        JSON.stringify(assessment),
        JSON.stringify(pricing),
        assessment.category || null,
        recordId,
      ]
    );

    console.log('[assessment] pending request saved', {
      pendingServiceRequestId: recordId,
      durationMs: Date.now() - t0,
    });

    return {
      ok: true,
      assessment,
      pricing,
      result,
      ctx,
      viewer,
      pendingServiceRequestId: recordId,
      marketSnapshotId: null,
    };
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
       similar_jobs_count=$13,
       market_snapshot_id=COALESCE($14, market_snapshot_id),
       city=COALESCE(city, $15),
       state=COALESCE(state, $16),
       assessment_status='ready',
       assessment_error_code=NULL,
       assessment_completed_at=NOW(),
       updated_at=NOW()
     WHERE id=$17`,
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
      pricing.estimate_confidence ||
      confidenceLabel(assessment.confidence),
      ctx.marketProfile?.jobsAnalyzed || 0,
      snapshotId,
      ctx.city || null,
      ctx.state || null,
      recordId,
    ]
  );

  console.log('[assessment] saved', {
    jobId: recordId,
    durationMs: Date.now() - t0,
  });

  return {
    ok: true,
    assessment,
    pricing,
    result,
    ctx,
    viewer,
    jobId: recordId,
    marketSnapshotId: snapshotId,
  };
}

// /** Background/local worker entry — runs full assessment and updates job status. */
// export async function processManagedJobAssessmentTask(pool, { jobId, actorUserId }) {
//   const started = Date.now();
//   const id = Number(jobId);
//   const actorId = Number(actorUserId);
//   console.log('[assessment] worker started', { jobId: id });
//   try {
//     const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [id]);
//     if (!rows[0]) {
//       console.warn('[assessment] worker job missing', { jobId: id });
//       return { ok: false, code: 'JOB_NOT_FOUND' };
//     }
//     const job = rows[0];
//     const viewer = { id: actorId, role: 'homeowner' };
//     const ran = await runManagedJobAssessment(pool, job, viewer);
//     if (!ran.ok) {
//       const code = ran.code || 'AI_ASSESSMENT_FAILED';
//       await pool.query(
//         `UPDATE managed_jobs SET assessment_status='failed', assessment_error_code=$1, assessment_completed_at=NOW(), updated_at=NOW() WHERE id=$2`,
//         [code, id]
//       );
//       console.log('[assessment] failed', { jobId: id, code, durationMs: Date.now() - started });
//       return { ok: false, code };
//     }
//     await pushStatus(pool, id, job.status, 'ai_review_complete', actorId, 'AI assessment complete');
//     try {
//       await createInAppNotification(pool, {
//         userId: job.homeowner_user_id,
//         userRole: 'homeowner',
//         jobId: id,
//         type: 'ai_assessment_ready',
//         title: 'AI assessment ready',
//         message: 'Your assessment is ready to review.',
//         entityType: 'job',
//         entityId: id,
//       });
//     } catch {
//       /* non-fatal */
//     }
//     console.log('[assessment] complete', { jobId: id, durationMs: Date.now() - started });
//     return { ok: true };
//   } catch (err) {
//     const code =
//       err?.code === 'AI_TIMEOUT' || /timed out/i.test(String(err?.message || ''))
//         ? 'AI_TIMEOUT'
//         : 'AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE';
//     await pool.query(
//       `UPDATE managed_jobs SET assessment_status='failed', assessment_error_code=$1, assessment_completed_at=NOW(), updated_at=NOW() WHERE id=$2`,
//       [code, id]
//     ).catch(() => {});
//     console.error('[assessment] worker error', {
//       jobId: id,
//       code,
//       durationMs: Date.now() - started,
//       error: err?.message || String(err),
//     });
//     return { ok: false, code };
//   }
// }

/** Background/local worker entry — runs full assessment and updates record status. */
export async function processManagedJobAssessmentTask(
  pool,
  {
    jobId,
    pendingServiceRequestId,
    actorUserId,
    recordType = 'managed_job',
  }
) {
  const started = Date.now();

  const isPending =
    recordType === 'pending_service_request';

  const recordId = Number(
    isPending ? pendingServiceRequestId : jobId
  );

  const actorId = Number(actorUserId);

  console.log('[assessment] worker started', {
    recordType,
    jobId: isPending ? null : recordId,
    pendingServiceRequestId: isPending ? recordId : null,
  });

  try {
    const table = isPending
      ? 'pending_service_requests'
      : 'managed_jobs';

    const { rows } = await pool.query(
      `SELECT * FROM ${table} WHERE id=$1`,
      [recordId]
    );

    if (!rows[0]) {
      console.warn('[assessment] worker record missing', {
        recordType,
        recordId,
      });

      return {
        ok: false,
        code: isPending
          ? 'PENDING_SERVICE_REQUEST_NOT_FOUND'
          : 'JOB_NOT_FOUND',
      };
    }

    const record = rows[0];

    if (
      Number(record.homeowner_user_id) !== actorId
    ) {
      console.warn('[assessment] worker ownership mismatch', {
        recordType,
        recordId,
        actorId,
        homeownerUserId: record.homeowner_user_id,
      });

      return {
        ok: false,
        code: 'NOT_ALLOWED',
      };
    }

    /*
     * runManagedJobAssessment() now knows how to persist
     * either a managed job or a pending service request.
     */
    const ran = await runManagedJobAssessment(
      pool,
      {
        ...record,
        record_type: recordType,
      },
      {
        id: actorId,
        role: 'homeowner',
      }
    );

    if (!ran.ok) {
      const code =
        ran.code || 'AI_ASSESSMENT_FAILED';

      await pool.query(
        isPending
          ? `UPDATE pending_service_requests
               SET assessment_status='failed',
                   updated_at=NOW()
             WHERE id=$1`
          : `UPDATE managed_jobs
               SET assessment_status='failed',
                   assessment_error_code=$1,
                   assessment_completed_at=NOW(),
                   updated_at=NOW()
             WHERE id=$2`,
        isPending ? [recordId] : [code, recordId]
      );

      console.log('[assessment] failed', {
        recordType,
        recordId,
        code,
        durationMs: Date.now() - started,
      });

      return {
        ok: false,
        code,
      };
    }

    /*
     * Pending requests are not managed jobs yet.
     * Therefore do not create managed-job status history
     * or managed-job notifications here.
     */
    if (isPending) {
      console.log('[assessment] pending request complete', {
        pendingServiceRequestId: recordId,
        durationMs: Date.now() - started,
      });

      return {
        ok: true,
        pendingServiceRequestId: recordId,
      };
    }

    await pushStatus(
      pool,
      recordId,
      record.status,
      'ai_review_complete',
      actorId,
      'AI assessment complete'
    );

    try {
      await createInAppNotification(pool, {
        userId: record.homeowner_user_id,
        userRole: 'homeowner',
        jobId: recordId,
        type: 'ai_assessment_ready',
        title: 'AI assessment ready',
        message: 'Your assessment is ready to review.',
        entityType: 'job',
        entityId: recordId,
      });
    } catch {
      /* non-fatal */
    }

    console.log('[assessment] complete', {
      jobId: recordId,
      durationMs: Date.now() - started,
    });

    return {
      ok: true,
      jobId: recordId,
    };
  } catch (err) {
    const code =
      err?.code === 'AI_TIMEOUT' ||
        /timed out/i.test(
          String(err?.message || '')
        )
        ? 'AI_TIMEOUT'
        : 'AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE';

    const table = isPending
      ? 'pending_service_requests'
      : 'managed_jobs';

    await pool
      .query(
        isPending
          ? `UPDATE pending_service_requests
               SET assessment_status='failed',
                   updated_at=NOW()
             WHERE id=$1`
          : `UPDATE managed_jobs
               SET assessment_status='failed',
                   assessment_error_code=$1,
                   assessment_completed_at=NOW(),
                   updated_at=NOW()
             WHERE id=$2`,
        isPending ? [recordId] : [code, recordId]
      )
      .catch(() => { });

    console.error('[assessment] worker error', {
      recordType,
      recordId,
      code,
      durationMs: Date.now() - started,
      error: err?.message || String(err),
    });

    return {
      ok: false,
      code,
    };
  }
}

registerAssessmentProcessor(processManagedJobAssessmentTask);

async function claimAssessmentProcessing(pool, jobId, homeownerUserId, { force = false } = {}) {
  const staleMinutes = 12;
  const { rows } = await pool.query(
    `UPDATE managed_jobs
     SET assessment_status='processing',
         assessment_started_at=NOW(),
         assessment_completed_at=NULL,
         assessment_error_code=NULL,
         assessment_attempts=COALESCE(assessment_attempts, 0) + 1,
         updated_at=NOW()
     WHERE id=$1
       AND homeowner_user_id=$2
       AND (
         $3::boolean = TRUE
         OR assessment_status IS NULL
         OR assessment_status IN ('pending', 'failed')
         OR (assessment_status='processing' AND assessment_started_at < NOW() - ($4::text || ' minutes')::interval)
       )
     RETURNING *`,
    [jobId, homeownerUserId, force, String(staleMinutes)]
  );
  return rows[0] || null;
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
    base.lineItems = parseJson(row.line_items);
    base.pricingAdjustments = parseJson(row.pricing_adjustments);
    base.adminDiscount = row.admin_discount != null ? Number(row.admin_discount) : null;
    base.adminDiscountReason = row.admin_discount_reason;
    base.couponCode = row.coupon_code;
    base.couponFundedBy = row.coupon_funded_by;
    base.quoteValidUntil = row.quote_valid_until;
    base.customerLineItems = parseJson(row.customer_line_items);
    base.serviceCharge = row.service_charge != null ? Number(row.service_charge) : null;
    base.expectedMarginPct = row.expected_margin_pct != null ? Number(row.expected_margin_pct) : null;
    base.createdByName = row.created_by_name || null;
    base.createdById = row.created_by != null ? Number(row.created_by) : null;
    base.bookingId = row.booking_id || null;
    base.jobTitle = row.job_title || null;
    base.jobCategory = row.job_category || null;
    base.jobZip = row.job_zip || null;
    base.homeownerName = row.homeowner_name || null;
    base.homeownerEmail = row.homeowner_email || null;
    base.contractorName = row.contractor_name || null;
    base.aiEstimateLow = row.ai_estimate_low != null ? Number(row.ai_estimate_low) : null;
    base.aiEstimateHigh = row.ai_estimate_high != null ? Number(row.ai_estimate_high) : null;
    if (row.linked_invoice_id) {
      base.invoiceId = Number(row.linked_invoice_id);
      base.invoiceNumber = row.linked_invoice_number || null;
      base.invoiceStatus = row.linked_invoice_status || null;
      base.invoiceAmountDue =
        row.linked_invoice_amount_due != null ? Number(row.linked_invoice_amount_due) : null;
    }
    base.homeownerPhone = row.homeowner_phone || row.job_contact_phone || null;
    base.discountType = row.discount_type || null;
    base.shippingAmount = row.shipping_amount != null ? Number(row.shipping_amount) : null;
    base.quoteOptionLabel = row.quote_option_label || null;
    base.quoteOptionTitle = row.quote_option_title || null;
    base.optionGroup = row.option_group || null;
    base.optionSelectionStatus = row.option_selection_status || 'pending';
    base.versionNumber = Number(row.version_number || 1);
    base.contractorQuoteAmount =
      row.contractor_quote_amount != null
        ? Number(row.contractor_quote_amount)
        : row.contractor_net != null
          ? Number(row.contractor_net)
          : null;
  }
  if (isCustomer) {
    base.customerLineItems = row.customer_line_items;
    base.quoteValidUntil = row.quote_valid_until;
    base.couponCode = row.coupon_code;
    base.quoteOptionLabel = row.quote_option_label || null;
    base.quoteOptionTitle = row.quote_option_title || null;
    base.optionGroup = row.option_group || null;
    base.optionSelectionStatus = row.option_selection_status || 'pending';
    base.versionNumber = Number(row.version_number || 1);
  }
  if (!isAdmin && !isCustomer) {
    // Contractors must not see retail
    delete base.retailAmount;
    delete base.depositAmount;
  }
  return base;
}

function resolveContractorNetForQuote(bid, body = {}) {
  if (body.contractorNetOverride != null && Number.isFinite(Number(body.contractorNetOverride))) {
    return Math.max(0, Number(body.contractorNetOverride));
  }
  const lines = body.contractorLines || {};
  const hasLines = ['labor', 'materials', 'equipment', 'travelDiagnostic', 'permitCost', 'disposal'].some(
    (k) => lines[k] != null
  );
  if (hasLines) {
    return Math.max(
      0,
      Number(lines.labor || 0) +
      Number(lines.materials || 0) +
      Number(lines.equipment || 0) +
      Number(lines.travelDiagnostic || 0) +
      Number(lines.permitCost || 0) +
      Number(lines.disposal || 0)
    );
  }
  return Number(bid.net_total) || 0;
}

function buildDefaultCustomerLineItems(quote, { adjustments = [], serviceCharge = 0, couponCode, couponAmount = 0, visitFeeCredit = 0 } = {}) {
  const items = [
    { label: 'Service & Labor', amount: quote.baseRetail, visible: true },
    ...adjustments
      .filter((a) => a.includeInDisplay !== false)
      .map((a) => ({
        label: a.label || a.type || 'Adjustment',
        amount:
          String(a.calculation || 'fixed').toLowerCase() === 'percent'
            ? Math.round(quote.baseRetail * (Number(a.amount) / 100))
            : Number(a.amount),
        visible: true,
      })),
    ...(serviceCharge > 0 ? [{ label: 'Service charge', amount: serviceCharge, visible: true }] : []),
    ...(quote.adminDiscount > 0 ? [{ label: 'Discount', amount: -quote.adminDiscount, visible: true }] : []),
    ...(couponAmount > 0 ? [{ label: couponCode || 'Coupon', amount: -couponAmount, visible: true }] : []),
    ...(visitFeeCredit > 0 ? [{ label: 'Visit fee credit', amount: -visitFeeCredit, visible: true }] : []),
  ];
  return items;
}

async function ensureQuoteNumber(pool, proposalId) {
  const quoteNumber = `FBQ-${String(proposalId).padStart(5, '0')}`;
  await pool.query(
    `UPDATE proposals SET quote_number = COALESCE(quote_number, $1) WHERE id = $2`,
    [quoteNumber, proposalId]
  );
  return quoteNumber;
}



/** Convert a paid pending service request into the normal managed-job workflow.
 *
 * This is intentionally transactional and idempotent:
 *  - Stripe/webhook/auth-me retries cannot create a second managed job.
 *  - the pending row is deleted only after the managed job has been committed.
 *  - all homeowner/request data needed by the managed workflow is copied forward.
 */
export async function convertPendingServiceRequest(pool, pendingServiceRequestId, payment = {}) {
  const pendingId = Number(pendingServiceRequestId);
  if (!Number.isFinite(pendingId) || pendingId <= 0) {
    throw Object.assign(new Error('Invalid pending service request.'), { code: 'INVALID_PENDING_SERVICE_REQUEST' });
  }

  const expectedHomeownerId = Number(payment.homeownerUserId || 0) || null;
  const stripeSessionId = payment.stripeSessionId || null;
  const stripePaymentIntentId = payment.stripePaymentIntentId || null;

  console.info("[FLOW][4][API] CONVERSION START", {
    pendingServiceRequestId: pendingId,
    paymentType: payment.paymentType || null,
    paymentStatus: payment.paymentStatus || null,
    amountCents: payment.amountCents ?? null,
    homeownerUserId: expectedHomeownerId,
    stripeSessionId: stripeSessionId ? String(stripeSessionId).slice(0, 18) : null,
    hasPaymentIntent: Boolean(stripePaymentIntentId),
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM pending_service_requests WHERE id=$1 FOR UPDATE`,
      [pendingId]
    );
    const pending = rows[0];

    console.info("[FLOW][4][API] PENDING LOOKUP", {
      pendingServiceRequestId: pendingId,
      found: Boolean(pending),
      pendingHomeownerUserId: pending?.homeowner_user_id ?? null,
      pendingStatus: pending?.status ?? null,
      paymentStatus: pending?.payment_status ?? null,
      selectedAction: pending?.selected_action ?? null,
      managedJobId: pending?.managed_job_id ?? null,
      assessmentStatus: pending?.assessment_status ?? null,
    });

    // The pending row is deliberately deleted after conversion. A retry therefore
    // needs another idempotency path instead of treating "not found" as failure.
    if (!pending) {
      let existingJob = null;

      if (stripeSessionId) {
        const { rows: paymentRows } = await client.query(
          `SELECT job_id
             FROM payments
            WHERE stripe_session_id=$1
              AND job_id IS NOT NULL
            ORDER BY id DESC
            LIMIT 1`,
          [stripeSessionId]
        );
        const existingJobId = Number(paymentRows[0]?.job_id || 0);
        if (existingJobId > 0) {
          const { rows: jobRows } = await client.query(
            `SELECT * FROM managed_jobs WHERE id=$1`,
            [existingJobId]
          );
          existingJob = jobRows[0] || null;
        }
      }

      if (!existingJob && stripePaymentIntentId) {
        const { rows: jobRows } = await client.query(
          `SELECT *
             FROM managed_jobs
            WHERE stripe_payment_intent_id=$1
            ORDER BY id DESC
            LIMIT 1`,
          [stripePaymentIntentId]
        );
        existingJob = jobRows[0] || null;
      }

      if (existingJob && (!expectedHomeownerId || Number(existingJob.homeowner_user_id) === expectedHomeownerId)) {
        console.info("[FLOW][4][API] ALREADY CONVERTED", {
          pendingServiceRequestId: pendingId,
          managedJobId: existingJob.id,
          managedJobStatus: existingJob.status,
        });
        await client.query('COMMIT');
        return { ok: true, alreadyConverted: true, job: existingJob };
      }

      throw Object.assign(new Error('Pending service request not found.'), {
        code: 'PENDING_SERVICE_REQUEST_NOT_FOUND',
      });
    }

    if (
      expectedHomeownerId &&
      Number(pending.homeowner_user_id) !== expectedHomeownerId
    ) {
      throw Object.assign(new Error('Pending service request does not belong to the payment owner.'), {
        code: 'PENDING_SERVICE_REQUEST_OWNER_MISMATCH',
      });
    }

    if (pending.managed_job_id) {
      const { rows: existing } = await client.query(
        `SELECT * FROM managed_jobs WHERE id=$1`,
        [pending.managed_job_id]
      );
      if (existing[0]) {
        await client.query(`DELETE FROM pending_service_requests WHERE id=$1`, [pendingId]);
        await client.query('COMMIT');
        return { ok: true, alreadyConverted: true, job: existing[0] };
      }
    }

    const paidAmountCents = Number(
      payment.amountCents ??
      pending.paid_amount_cents ??
      0
    );
    const paidAmount = Math.max(0, paidAmountCents) / 100;
    const bookingDate = pending.created_at || new Date();
    const paymentType = String(payment.paymentType || 'pending_professional_fee');
    const isProfessionalPayment = paymentType === 'pending_professional_fee';

    /*
     * Copy the request fields that belong to managed_jobs. Keep payment/temporary
     * pending-only fields out of the job and explicitly set the workflow fields
     * that must change at conversion time.
     */
    const { rows: jobs } = await client.query(
      `INSERT INTO managed_jobs (
        homeowner_user_id,
        property_id,
        status,
        category,
        service_subcategory,
        title,
        description,
        media_data_url,
        media_type,
        preferred_date,
        preferred_time_slot,
        service_timing,
        city_state_zip,
        full_address,
        street_address,
        city,
        state,
        zip,
        country,
        contact_name,
        contact_phone,
        property_purpose,
        transaction_stage,
        listing_deadline,
        closing_deadline,
        inspection_report_url,
        listing_reference_url,
        property_opportunity_notes,
        partner_code,
        referral_source,
        referring_name,
        referring_company,
        referring_email,
        referring_phone,
        customer_partner_status_consent,
        consent_timestamp,
        consent_version,
        discount_code,
        job_mode,
        ai_assessment,
        pricing,
        assessment_status,
        assessment_error_code,
        assessment_completed_at,
        show_retail_price,
        customer_retail_estimate_low,
        customer_retail_estimate_high,
        estimated_contractor_net_low,
        estimated_contractor_net_high,
        diy_risk_level,
        estimate_confidence,
        similar_jobs_count,
        visit_fee_authorized,
        visit_fee_amount,
        final_customer_amount,
        payment_completed_at,
        stripe_payment_intent_id,
        work_queue_status
      ) VALUES (
        $1,$2,'paid_for_dispatch',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
        $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,
        $30,$31,$32,$33,$34,$35,$36,$37,'managed',$38,$39,'ready',NULL,NOW(),
        $40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,NOW(),$51,'PAID_NEEDS_REVIEW'
      )
      RETURNING *`,
      [
        pending.homeowner_user_id,
        pending.property_id,
        pending.category || 'Others',
        pending.service_subcategory || null,
        pending.title || `${pending.category || 'Repair'} issue`,
        pending.description || '',
        pending.media_data_url || null,
        pending.media_type || null,
        pending.preferred_date || null,
        pending.preferred_time_slot || null,
        pending.service_timing || 'weekday',
        pending.city_state_zip || 'TBD',
        pending.full_address || 'TBD',
        pending.street_address || null,
        pending.city || null,
        pending.state || null,
        pending.zip || null,
        pending.country || 'US',
        pending.contact_name || null,
        pending.contact_phone || null,
        pending.property_purpose || null,
        pending.transaction_stage || null,
        pending.listing_deadline || null,
        pending.closing_deadline || null,
        pending.inspection_report_url || null,
        pending.listing_reference_url || null,
        pending.property_opportunity_notes || null,
        pending.partner_code || null,
        pending.referral_source || null,
        pending.referring_name || null,
        pending.referring_company || null,
        pending.referring_email || null,
        pending.referring_phone || null,
        pending.customer_partner_status_consent === true,
        pending.consent_timestamp || null,
        pending.consent_version || null,
        pending.discount_code || null,
        pending.ai_assessment || pending.assessment_result || null,
        pending.pricing || null,
        pending.show_retail_price !== false,
        pending.customer_retail_estimate_low ?? null,
        pending.customer_retail_estimate_high ?? null,
        pending.estimated_contractor_net_low ?? null,
        pending.estimated_contractor_net_high ?? null,
        pending.diy_risk_level || null,
        pending.estimate_confidence || null,
        pending.similar_jobs_count || 0,
        isProfessionalPayment,
        isProfessionalPayment ? paidAmount : null,
        isProfessionalPayment ? paidAmount : null,
        payment.stripePaymentIntentId || pending.stripe_payment_intent_id || null,
      ]
    );

    const job = jobs[0];
    console.info("[FLOW][4][API] MANAGED JOB CREATED", {
      pendingServiceRequestId: pendingId,
      managedJobId: job?.id || null,
      managedJobStatus: job?.status || null,
      paymentStatus: payment.paymentStatus || null,
      paymentType,
      amountCents: paidAmountCents,
    });
    const bookingId = formatBookingId(job.id, bookingDate);
    await client.query(
      `UPDATE managed_jobs
          SET booking_id=$1,
              updated_at=NOW()
        WHERE id=$2`,
      [bookingId, job.id]
    );
    job.booking_id = bookingId;

    // The payment belongs to the newly-created managed job. This makes a webhook
    // retry safely idempotent even though the pending row is now gone.
    if (stripeSessionId) {
      await client.query(
        `UPDATE payments
            SET job_id=$1,
                status='succeeded',
                stripe_payment_intent=COALESCE($2, stripe_payment_intent)
          WHERE stripe_session_id=$3
            AND (job_id IS NULL OR job_id=$1)`,
        [job.id, stripePaymentIntentId, stripeSessionId]
      );
    }

    console.info("[FLOW][4][API] PAYMENT LINKED TO MANAGED JOB", {
      pendingServiceRequestId: pendingId,
      managedJobId: job.id,
      stripeSessionId: stripeSessionId ? String(stripeSessionId).slice(0, 18) : null,
      paymentIntentPresent: Boolean(stripePaymentIntentId),
    });

    // IMPORTANT: delete the exact pending row. It is no longer the source of truth
    // once the managed job exists.
    const deleted = await client.query(
      `DELETE FROM pending_service_requests WHERE id=$1 RETURNING id`,
      [pendingId]
    );
    if (!deleted.rows[0]) {
      throw Object.assign(new Error('Pending service request could not be finalized.'), {
        code: 'PENDING_SERVICE_REQUEST_DELETE_FAILED',
      });
    }

    console.info("[FLOW][4][API] PENDING REQUEST FINALIZED/DELETED", {
      pendingServiceRequestId: pendingId,
      managedJobId: job.id,
    });

    await client.query('COMMIT');

    console.info("[FLOW][4][API] CONVERSION COMMITTED", {
      pendingServiceRequestId: pendingId,
      managedJobId: job.id,
      status: job.status,
    });

    // Admin notification is part of the conversion contract. It runs after the
    // database transaction so a mail/notification failure can never roll back
    // a successful payment conversion.
    let adminNotified = false;
    if (paymentType === 'pending_professional_fee' || paymentType === 'subscription') {
      try {
        const { rows: homeowners } = await pool.query(
          `SELECT id, name, email FROM users WHERE id=$1`,
          [pending.homeowner_user_id]
        );
        await notifyAdminsDispatchServiceRequest(pool, {
          job,
          homeowner: homeowners[0] || { name: null, email: null },
          amount: paidAmount,
          discountCode: pending.discount_code || null,
        });
        adminNotified = true;
      } catch (notifyError) {
        console.warn(
          '[PENDING SERVICE REQUEST] admin notification failed:',
          notifyError?.message || notifyError
        );
      }
    }

    return { ok: true, alreadyConverted: false, job, adminNotified };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export function registerManagedRoutes(app, { pool, requireAuth, requireAdmin, requireAdminWrite, requirePermission, makeToken, rowToUser }) {
  const requireHomeCareFeature = createRequireHomeCareFeature(pool);
  const need = typeof requirePermission === 'function'
    ? requirePermission
    : () => (_req, _res, next) => next();

  // ── Brand ──────────────────────────────────────────────────────────────────
  app.get('/api/brand', (_req, res) => {
    res.json({ ok: true, brand });
  });

  // ── Pricing rules ──────────────────────────────────────────────────────────
  app.get('/api/pricing/rules', requireAuth, requireAdmin, need('pricing.view'), async (_req, res) => {
    try {
      const rules = await loadPricingRules(pool);
      res.json({ ok: true, rules });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.put('/api/pricing/rules', requireAuth, requireAdmin, requireAdminWrite, need('pricing.edit'), async (req, res) => {
    try {
      const prevRules = await loadPricingRules(pool);
      const rules = mergePricingRules(req.body?.rules || req.body);
      const prevVersion = prevRules?.professional_dispatch_pricing?.version || 0;
      const nextVersion = rules?.professional_dispatch_pricing?.version || prevVersion;
      const pricingChanged =
        JSON.stringify(prevRules?.professional_dispatch_pricing || {}) !==
        JSON.stringify(rules?.professional_dispatch_pricing || {});
      if (pricingChanged) {
        const bumped = Number(prevVersion || 0) + 1;
        rules.professional_dispatch_pricing = {
          ...(rules.professional_dispatch_pricing || {}),
          version: bumped,
          effective_from: new Date().toISOString().slice(0, 10),
        };
        await pool.query(
          `INSERT INTO pricing_rules_versions (pricing_version, rules, updated_by)
           VALUES ($1,$2,$3)`,
          [bumped, JSON.stringify(rules.professional_dispatch_pricing), req.authUser.id]
        );
      }
      await pool.query(
        `INSERT INTO pricing_rules (id, rules, updated_at, updated_by)
         VALUES ('default', $1, NOW(), $2)
         ON CONFLICT (id) DO UPDATE SET rules=$1, updated_at=NOW(), updated_by=$2`,
        [JSON.stringify(rules), req.authUser.id]
      );
      await audit(pool, req.authUser.id, 'pricing_rules_update', 'pricing_rules', 'default', rules);
      if (pricingChanged) {
        await audit(pool, req.authUser.id, 'PROFESSIONAL_DISPATCH_PRICING_UPDATED', 'pricing_rules', 'default', {
          old: prevRules?.professional_dispatch_pricing || null,
          new: rules.professional_dispatch_pricing || null,
        });
      }
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
          OR LOWER(COALESCE(inv.invoice_number,'')) LIKE $${i}
          OR LOWER(COALESCE(j.booking_id,'')) LIKE $${i}
          OR LOWER(COALESCE(j.title,'')) LIKE $${i}
          OR LOWER(COALESCE(j.category,'')) LIKE $${i}
          OR LOWER(COALESCE(j.zip,'')) LIKE $${i}
          OR LOWER(COALESCE(j.contact_phone,'')) LIKE $${i}
          OR LOWER(COALESCE(hw.name,'')) LIKE $${i}
          OR LOWER(COALESCE(hw.email,'')) LIKE $${i}
          OR LOWER(COALESCE(hw.phone,'')) LIKE $${i}
          OR LOWER(COALESCE(ct.name,'')) LIKE $${i}
          OR CAST(p.retail_amount AS TEXT) LIKE $${i}
          OR CAST(p.id AS TEXT) LIKE $${i}
          OR CAST(j.id AS TEXT) LIKE $${i}
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
               j.contact_phone AS job_contact_phone,
               hw.name AS homeowner_name,
               hw.email AS homeowner_email,
               hw.phone AS homeowner_phone,
               ct.name AS contractor_name,
               cr.name AS created_by_name,
               inv.id AS linked_invoice_id,
               inv.invoice_number AS linked_invoice_number,
               inv.status AS linked_invoice_status,
               inv.amount_due AS linked_invoice_amount_due
        FROM proposals p
        JOIN managed_jobs j ON j.id = p.job_id
        LEFT JOIN users hw ON hw.id = j.homeowner_user_id
        LEFT JOIN bids b ON b.id = p.bid_id
        LEFT JOIN users ct ON ct.id = COALESCE(j.assigned_contractor_user_id, b.contractor_user_id)
        LEFT JOIN users cr ON cr.id = p.created_by
        LEFT JOIN homeowner_invoices inv ON inv.id = p.converted_invoice_id
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
                ct.email AS contractor_email,
                cr.name AS created_by_name
         FROM proposals p
         JOIN managed_jobs j ON j.id = p.job_id
         LEFT JOIN users hw ON hw.id = j.homeowner_user_id
         LEFT JOIN bids b ON b.id = p.bid_id
         LEFT JOIN users ct ON ct.id = b.contractor_user_id
         LEFT JOIN users cr ON cr.id = p.created_by
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

  /** Market intelligence runs automatically during AI assessment — no manual admin lookup. */
  app.get('/api/admin/market-intelligence', requireAuth, requireAdmin, async (_req, res) => {
    res.status(410).json({
      ok: false,
      message: 'Market Intelligence runs automatically during AI assessment. Review job pricing details instead.',
    });
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

  function homeSystemKeyFromJob(job) {
    const hay = `${job.category || ''} ${job.title || ''}`.toLowerCase();
    if (/water.?heater/.test(hay)) return 'water_heater';
    if (/hvac|heat|cool|ac\b|furnace|thermostat/.test(hay)) return 'hvac';
    if (/roof|gutter|shingle/.test(hay)) return 'roof';
    if (/plumb|sink|leak|pipe|drain|toilet|faucet/.test(hay)) return 'plumbing';
    if (/electric|outlet|breaker|wiring|panel/.test(hay)) return 'electrical';
    if (/pest|termite|rodent/.test(hay)) return 'pest';
    if (/fridge|refrigerat/.test(hay)) return 'refrigerator';
    if (/dishwasher/.test(hay)) return 'dishwasher';
    if (/smoke|detector|safety|security|alarm|carbon/.test(hay)) return 'safety';
    return null;
  }

  function propertySystemLabelFromKey(key) {
    const map = {
      hvac: 'HVAC',
      water_heater: 'Plumbing',
      plumbing: 'Plumbing',
      roof: 'Roof',
      electrical: 'Electrical',
      pest: 'Pest',
      refrigerator: 'Appliances',
      dishwasher: 'Appliances',
      safety: 'Safety',
    };
    return map[key] || null;
  }

  function propertySystemFromHealthUpdate(system) {
    const s = String(system || '');
    if (['HVAC', 'Plumbing', 'Electrical', 'Roof', 'Appliances', 'Pest', 'Safety'].includes(s)) return s;
    return propertySystemLabelFromKey(homeSystemKeyFromJob({ category: s, title: s })) || s;
  }

  /** Update passport home_systems + health history when a FixBridge job completes. */
  async function syncPropertyHistoryFromCompletedJob(pool, job, report) {
    if (!job.property_id) return;
    const { rows: props } = await pool.query(`SELECT * FROM properties WHERE id=$1`, [job.property_id]);
    if (!props[0]) return;

    const completedAt = report?.completedAt || new Date().toISOString();
    const completedDate = completedAt.slice(0, 10);
    const hu = report?.healthUpdate || null;
    let systemKey = homeSystemKeyFromJob(job);
    if (hu?.system) {
      const mapped = String(hu.system).toLowerCase();
      if (mapped.includes('hvac')) systemKey = 'hvac';
      else if (mapped.includes('roof')) systemKey = 'roof';
      else if (mapped.includes('plumb') || mapped.includes('water')) systemKey = systemKey || 'plumbing';
      else if (mapped.includes('electric')) systemKey = 'electrical';
      else if (mapped.includes('pest')) systemKey = 'pest';
      else if (mapped.includes('appliance')) systemKey = systemKey || 'refrigerator';
      else if (mapped.includes('safety')) systemKey = 'safety';
    }

    let homeSystems = parseJsonSafe(props[0].home_systems, []) || [];
    if (!Array.isArray(homeSystems)) homeSystems = [];
    if (systemKey) {
      const idx = homeSystems.findIndex((s) => s && String(s.key || '').toLowerCase() === systemKey);
      if (idx >= 0) {
        homeSystems[idx] = {
          ...homeSystems[idx],
          lastService: completedDate,
          notes: homeSystems[idx].notes || undefined,
        };
      } else {
        homeSystems.push({
          key: systemKey,
          name: propertySystemLabelFromKey(systemKey) || systemKey,
          lastService: completedDate,
        });
      }
    }

    let profile = parseJsonSafe(props[0].health_profile, {}) || {};
    const systems = Array.isArray(profile.systems) ? [...profile.systems] : [];
    const propSystem =
      (hu && hu.system && propertySystemFromHealthUpdate(hu.system)) ||
      propertySystemLabelFromKey(systemKey);
    if (propSystem) {
      const entry = {
        system: propSystem,
        status: (hu && hu.status) || 'good',
        nextAction: (hu && hu.nextAction) || 'Up to date — last serviced via FixBridge',
        notes: (hu && hu.notes) || report?.summary || '',
        updatedAt: completedAt,
        updatedBy: 'fixbridge_job',
        relatedJobId: Number(job.id),
      };
      const sIdx = systems.findIndex((s) => s && s.system === propSystem);
      if (sIdx >= 0) systems[sIdx] = { ...systems[sIdx], ...entry };
      else systems.push(entry);
    }

    const previousServices = Array.isArray(profile.previousServices) ? [...profile.previousServices] : [];
    previousServices.unshift({
      id: `job-${job.id}`,
      system: propSystem || 'Other',
      title: job.title || job.category || 'FixBridge service',
      date: completedDate,
      notes: [report?.summary, report?.warranty ? `Warranty: ${report.warranty}` : '']
        .filter(Boolean)
        .join(' · ')
        .slice(0, 400),
      relatedJobId: Number(job.id),
    });

    const homeUpdateState = profile.homeUpdateState && typeof profile.homeUpdateState === 'object'
      ? { ...profile.homeUpdateState }
      : {};
    const history = Array.isArray(homeUpdateState.history) ? [...homeUpdateState.history] : [];
    history.unshift({
      id: `job-${job.id}-resolved`,
      systemLabel: propSystem || systemKey || 'Home system',
      title: 'Service completed',
      level: 'informational',
      status: 'resolved',
      generatedAt: completedAt,
      basedOn: `FixBridge job #${job.id}`,
      relatedJobId: Number(job.id),
    });
    homeUpdateState.history = history.slice(0, 80);

    const nextProfile = {
      ...profile,
      systems,
      previousServices: previousServices.slice(0, 40),
      homeUpdateState,
    };

    await pool.query(`UPDATE properties SET home_systems=$1, health_profile=$2 WHERE id=$3`, [
      JSON.stringify(homeSystems),
      JSON.stringify(nextProfile),
      job.property_id,
    ]);

    try {
      const memorySource = report?.completedBy?.role === 'admin' ? 'admin' : 'contractor';
      await createMemorySuggestionFromJobCompletion(pool, job, report, systemKey, { memorySource });
    } catch (_e) {
      /* non-fatal */
    }
  }

  async function createMemorySuggestionFromJobCompletion(
    pool,
    job,
    report,
    systemKey,
    { memorySource = 'contractor' } = {}
  ) {
    if (!job.property_id) return;
    const rawEq = report?.structuredEquipment || report?.equipmentUpdate || null;
    const eu = rawEq ? normalizeStructuredEquipment(job, rawEq) : null;
    if (!hasStructuredEquipmentData(eu)) return;

    const equipment = {
      key: eu.key || systemKey || 'other_system',
      name: eu.name || systemKey || 'Equipment',
      manufacturer: eu.manufacturer || eu.brand,
      model: eu.model,
      serial: eu.serial,
      filterSize: eu.filterSize,
      installationYear: eu.installationYear || eu.installedYear,
      capacity: eu.capacity,
      fuelType: eu.fuelType,
      equipmentType: eu.equipmentType || eu.applianceType,
      roofMaterial: eu.roofMaterial,
      notes: eu.notes || (report?.summary ? String(report.summary).slice(0, 200) : undefined),
    };

    const source = String(memorySource || 'contractor').slice(0, 40);
    const { rows: existing } = await pool.query(
      `SELECT id FROM property_memory_suggestions
       WHERE property_id=$1 AND owner_user_id=$2 AND source_ref=$3 AND status='pending'
         AND source IN ('contractor','completed_job','admin','ai_extraction')`,
      [job.property_id, job.homeowner_user_id, String(job.id)]
    );
    if (existing.length) return;

    await pool.query(
      `INSERT INTO property_memory_suggestions
        (property_id, owner_user_id, source, source_ref, status, payload, confidence)
       VALUES ($1,$2,$3,$4,'pending',$5,$6)`,
      [
        job.property_id,
        job.homeowner_user_id,
        source,
        String(job.id),
        JSON.stringify({ equipment, jobTitle: job.title || job.category, trade: eu.trade }),
        eu?.confidence != null ? Number(eu.confidence) : 0.85,
      ]
    );
  }

  async function maybeCreateEquipmentSuggestionFromLabelPhoto(pool, job, report) {
    if (!job.property_id || !report?.equipmentLabelPhotoUrl) return;
    try {
      const result = await extractDocument({
        category: 'equipment_label',
        title: job.title || 'Equipment label',
        fileName: 'equipment-label.jpg',
        mimeType: 'image/jpeg',
        dataUrl: report.equipmentLabelPhotoUrl,
        systemKey: job.category,
      });
      const eq = equipmentFromExtraction(result.extraction, job.category);
      if (!hasStructuredEquipmentData(eq)) return;
      const suggestionReport = {
        ...report,
        structuredEquipment: eq,
        summary: report.summary,
      };
      await createMemorySuggestionFromJobCompletion(pool, job, suggestionReport, eq.key, {
        memorySource: 'ai_extraction',
      });
    } catch (e) {
      console.warn('[equipment-label-extract]', e.message);
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
      postalCodePlus4: r.postal_code_plus4 || null,
      addressVerified: r.address_verified === true,
      addressVerifiedAt: r.address_verified_at || null,
      addressVerificationProvider: r.address_verification_provider || null,
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
        // Omit bulky data URLs from list/save payloads. Clients fetch one file on demand.
        dataUrl: d.data_url || null,
        hasFile: Boolean(d.data_url) || d.has_file === true,
        notes: d.notes,
        systemKey: d.system_key,
        createdAt: d.created_at,
      })),
      healthProfile,
      timezone: r.timezone || null,
      latitude: r.latitude != null ? Number(r.latitude) : null,
      longitude: r.longitude != null ? Number(r.longitude) : null,
    };
  }

  async function loadPropertyDocuments(propertyId, ownerUserId, { includeDataUrl = false } = {}) {
    const columns = includeDataUrl
      ? '*'
      : `id, property_id, owner_user_id, category, title, file_name, mime_type, notes, system_key, created_at,
         true AS has_file`;
    const { rows } = await pool.query(
      `SELECT ${columns} FROM property_documents
       WHERE property_id=$1 AND owner_user_id=$2
       ORDER BY created_at DESC`,
      [propertyId, ownerUserId]
    );
    return rows;
  }

  async function serializeOwnedProperty(row, ownerUserId, _planCode, { includeDataUrl = false } = {}) {
    // Maintenance passport files belong to the property owner. Do not hide them
    // behind the Pro document-vault flag or uploads vanish after refresh.
    const docs = await loadPropertyDocuments(row.id, ownerUserId, { includeDataUrl });
    return serializeProperty(row, docs);
  }

  app.get('/api/properties', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM properties WHERE owner_user_id=$1 ORDER BY created_at ASC, id ASC`,
        [req.authUser.id]
      );
      const ids = rows.map((row) => row.id);
      const docsByProperty = new Map();
      if (ids.length) {
        const { rows: docRows } = await pool.query(
          `SELECT id, property_id, owner_user_id, category, title, file_name, mime_type, notes, system_key, created_at,
                  true AS has_file
           FROM property_documents
           WHERE owner_user_id=$1 AND property_id = ANY($2::int[])
           ORDER BY created_at DESC`,
          [req.authUser.id, ids]
        );
        for (const doc of docRows) {
          const list = docsByProperty.get(doc.property_id) || [];
          list.push(doc);
          docsByProperty.set(doc.property_id, list);
        }
      }
      const properties = rows.map((row) => serializeProperty(row, docsByProperty.get(row.id) || []));
      res.json({ ok: true, properties });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.post('/api/properties', requireAuth, async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.addressLine1 || !b.city || !b.state || !b.zip) {
        return res.status(400).json({
          ok: false,
          message: 'Address Line 1, City, State, and ZIP Code are required.',
        });
      }
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM properties WHERE owner_user_id=$1`,
        [req.authUser.id]
      );
      const homeNumber = (countRows[0]?.c || 0) + 1;
      const label = b.label || `My Home ${homeNumber}`;
      const defaultSystems = Array.isArray(b.homeSystems) ? b.homeSystems : [];
      const zipVal = zip5(b.zip || '');
      const { rows } = await pool.query(
        `INSERT INTO properties
          (owner_user_id, label, address_line1, address_line2, city, state, zip, property_type, access_notes, property_purpose, transaction_stage, country, street_address, year_built, beds, baths, sqft, home_systems, postal_code_plus4)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
        [
          req.authUser.id,
          label,
          b.addressLine1,
          b.addressLine2 || null,
          b.city || null,
          b.state || null,
          zipVal || null,
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
          b.postalCodePlus4 || null,
        ]
      );
      const propertyId = rows[0].id;
      try {
        await resolveAndPersistPropertyTimezone(pool, propertyId, {
          timezone: b.timezone,
          latitude: b.latitude,
          longitude: b.longitude,
          addressLine1: b.addressLine1,
          city: b.city,
          state: b.state,
          zip: zipVal,
        });
      } catch (_e) {
        /* non-fatal */
      }
      const { rows: fresh } = await pool.query(`SELECT * FROM properties WHERE id=$1`, [propertyId]);
      res.json({
        ok: true,
        property: await serializeOwnedProperty(fresh[0] || rows[0], req.authUser.id, req.authUser.planCode),
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
      if (!owned[0] && req.authUser.role !== 'admin') {
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

      const addressFieldsTouched =
        b.addressLine1 != null ||
        b.addressLine2 !== undefined ||
        b.city != null ||
        b.state != null ||
        b.zip != null;
      // Historic verification columns are left untouched (no longer written).
      const nextPlus4 =
        b.postalCodePlus4 !== undefined ? b.postalCodePlus4 : cur.postal_code_plus4;
      const zipVal = b.zip != null ? zip5(b.zip) : null;

      let nextTimezone = cur.timezone;
      if (b.timezone !== undefined) {
        nextTimezone = normalizeTimezoneInput(b.timezone);
      }

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
           access_notes=$16,
           postal_code_plus4=$17,
           timezone=$18
         WHERE id=$19
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
          zipVal,
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
          nextPlus4,
          nextTimezone,
          propertyId,
        ]
      );
      if (addressFieldsTouched || b.latitude != null || b.longitude != null) {
        try {
          await resolveAndPersistPropertyTimezone(pool, propertyId, {
            timezone: b.timezone,
            latitude: b.latitude ?? cur.latitude,
            longitude: b.longitude ?? cur.longitude,
            addressLine1: b.addressLine1 ?? cur.address_line1,
            city: b.city ?? cur.city,
            state: b.state ?? cur.state,
            zip: zipVal ?? cur.zip,
          });
        } catch (_e) {
          /* non-fatal */
        }
      }
      const { rows: freshRows } = await pool.query(`SELECT * FROM properties WHERE id=$1`, [propertyId]);
      res.json({
        ok: true,
        property: await serializeOwnedProperty(freshRows[0] || rows[0], req.authUser.id, req.authUser.planCode),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.post('/api/properties/:id/documents', requireAuth, async (req, res) => {
    try {
      const config = await getHomeCareConfig(pool);
      const propertyId = Number(req.params.id);
      const b = req.body || {};
      const { rows: owned } = await pool.query(
        `SELECT id FROM properties WHERE id=$1 AND owner_user_id=$2`,
        [propertyId, req.authUser.id]
      );
      if (!owned[0]) return res.status(404).json({ ok: false, message: 'Property not found.' });
      const { rows: docCount } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM property_documents WHERE property_id=$1`,
        [propertyId]
      );
      if ((docCount[0]?.n || 0) >= config.documents.maxDocumentsPerProperty) {
        return res.status(409).json({
          ok: false,
          message: `Document limit reached (${config.documents.maxDocumentsPerProperty} per property).`,
        });
      }
      const dataUrl = String(b.dataUrl || '');
      // Netlify function payloads are ~6MB. A 3MB file is ~4MB as a data URL.
      const maxFileBytes = Math.min(3 * 1024 * 1024, config.documents.maxFileSizeMb * 1024 * 1024);
      const maxDataUrlChars = Math.floor(maxFileBytes * 1.4) + 128;
      if (!dataUrl.startsWith('data:') || dataUrl.length > maxDataUrlChars) {
        return res.status(400).json({
          ok: false,
          message: 'This file is too large. Maximum size is 3 MB.',
        });
      }
      const allowedCategories = new Set([
        'receipt', 'warranty', 'manual', 'invoice', 'inspection', 'contractor',
        'photo_before', 'photo_after', 'other',
      ]);
      const category = allowedCategories.has(String(b.category || ''))
        ? String(b.category)
        : 'other';
      const mime = String(b.mimeType || '').slice(0, 80);
      const allowedMime = /^(image\/(jpeg|png)|application\/pdf|application\/msword|application\/vnd.openxmlformats-officedocument.wordprocessingml.document)$/i;
      if (mime && !allowedMime.test(mime)) {
        return res.status(400).json({ ok: false, message: 'Unsupported file type.' });
      }
      const rawName = String(b.fileName || 'document').replace(/[/\\]/g, '').replace(/\.\./g, '').slice(0, 160);
      const systemKey = b.systemKey && String(b.systemKey) !== 'undefined'
        ? String(b.systemKey).slice(0, 60)
        : null;
      const { rows } = await pool.query(
        `INSERT INTO property_documents
          (property_id, owner_user_id, category, title, file_name, mime_type, data_url, notes, system_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          propertyId,
          req.authUser.id,
          category,
          b.title ? String(b.title).slice(0, 120) : rawName,
          rawName,
          mime || null,
          dataUrl,
          b.notes ? String(b.notes).slice(0, 500) : null,
          systemKey,
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
          hasFile: true,
          notes: d.notes,
          systemKey: d.system_key,
          createdAt: d.created_at,
        },
      });
    } catch (e) {
      console.error('property document upload:', e?.message || e);
      res.status(500).json({ ok: false, message: 'Could not save document. Please try again.' });
    }
  });

  app.get('/api/properties/:id/documents/:docId', requireAuth, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      const docId = Number(req.params.docId);
      const { rows } = await pool.query(
        `SELECT d.* FROM property_documents d
         JOIN properties p ON p.id = d.property_id
         WHERE d.id=$1 AND d.property_id=$2 AND p.owner_user_id=$3`,
        [docId, propertyId, req.authUser.id]
      );
      const d = rows[0];
      if (!d) return res.status(404).json({ ok: false, message: 'Document not found.' });
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
      console.error('property document get:', e?.message || e);
      res.status(500).json({ ok: false, message: 'Could not load document.' });
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

  app.post('/api/properties/:id/documents/:docId/analyze', requireAuth, requireHomeCareFeature('property_aware_ai'), async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      const docId = Number(req.params.docId);
      const { rows } = await pool.query(
        `SELECT d.* FROM property_documents d
         JOIN properties p ON p.id = d.property_id
         WHERE d.id=$1 AND d.property_id=$2 AND p.owner_user_id=$3`,
        [docId, propertyId, req.authUser.id]
      );
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Document not found.' });
      const d = rows[0];
      const result = await extractDocument({
        category: d.category,
        title: d.title,
        fileName: d.file_name,
        mimeType: d.mime_type,
        notes: d.notes,
        dataUrl: d.data_url,
        systemKey: d.system_key,
      });
      res.json({
        ok: true,
        extraction: result.extraction,
        source: result.source,
        model: result.model || null,
        message: result.error || null,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not analyze document.' });
    }
  });

  app.post('/api/properties/:id/documents/:docId/apply-extract', requireAuth, requireHomeCareFeature('document_vault'), async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      const docId = Number(req.params.docId);
      const extraction = req.body?.extraction;
      if (!extraction || typeof extraction !== 'object') {
        return res.status(400).json({ ok: false, message: 'extraction is required.' });
      }
      const { rows: owned } = await pool.query(
        `SELECT * FROM properties WHERE id=$1 AND owner_user_id=$2`,
        [propertyId, req.authUser.id]
      );
      if (!owned[0]) return res.status(404).json({ ok: false, message: 'Property not found.' });
      const { rows: docs } = await pool.query(
        `SELECT id FROM property_documents WHERE id=$1 AND property_id=$2 AND owner_user_id=$3`,
        [docId, propertyId, req.authUser.id]
      );
      if (!docs[0]) return res.status(404).json({ ok: false, message: 'Document not found.' });

      let homeSystems = parseJsonSafe(owned[0].home_systems, []) || [];
      if (!Array.isArray(homeSystems)) homeSystems = [];
      const systemKey = String(extraction.systemKey || req.body?.systemKey || '').trim() || 'other';
      const idx = homeSystems.findIndex((s) => s && String(s.key || '').toLowerCase() === systemKey.toLowerCase());
      const patch = {
        key: systemKey,
        name: extraction.systemLabel || (idx >= 0 ? homeSystems[idx].name : systemKey),
      };
      if (extraction.date) patch.lastService = String(extraction.date).slice(0, 32);
      if (extraction.installationDate) {
        const y = String(extraction.installationDate).slice(0, 4);
        if (/^\d{4}$/.test(y)) patch.installedYear = y;
      }
      if (extraction.warrantyUntil) patch.warrantyUntil = String(extraction.warrantyUntil).slice(0, 32);
      if (extraction.recommendedFollowUp) {
        patch.followUpRecommendation = String(extraction.recommendedFollowUp).slice(0, 400);
      }
      if (extraction.recommendedFollowUpDate) {
        patch.followUpDueDate = String(extraction.recommendedFollowUpDate).slice(0, 32);
      }
      const findings = Array.isArray(extraction.inspectionFindings)
        ? extraction.inspectionFindings.filter(Boolean).join('; ').slice(0, 400)
        : '';
      if (findings || extraction.provider) {
        const bits = [findings, extraction.provider ? `Provider: ${extraction.provider}` : '']
          .filter(Boolean)
          .join(' · ');
        patch.notes = bits.slice(0, 500);
      }
      if (String(extraction.serviceType || '').toLowerCase().includes('inspect') || findings) {
        if (extraction.date) patch.lastInspection = String(extraction.date).slice(0, 32);
      }

      if (idx >= 0) homeSystems[idx] = { ...homeSystems[idx], ...patch };
      else homeSystems.push(patch);

      if (extraction.systemKey) {
        await pool.query(
          `UPDATE property_documents SET system_key=$1, notes=COALESCE($2, notes) WHERE id=$3`,
          [
            String(extraction.systemKey).slice(0, 60),
            extraction.summary ? String(extraction.summary).slice(0, 500) : null,
            docId,
          ]
        );
      }

      await pool.query(`UPDATE properties SET home_systems=$1 WHERE id=$2`, [
        JSON.stringify(homeSystems),
        propertyId,
      ]);
      const docsAll = await loadPropertyDocuments(propertyId, req.authUser.id);
      const { rows: fresh } = await pool.query(`SELECT * FROM properties WHERE id=$1`, [propertyId]);
      res.json({ ok: true, property: serializeProperty(fresh[0], docsAll) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not apply extraction.' });
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
      if (!owned[0] && req.authUser.role !== 'admin') {
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
      res.json({ ok: true, property: await serializeOwnedProperty(rows[0], req.authUser.id, req.authUser.planCode) });
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
         SET address_line1=$1, address_line2=$2, city=$3, state=$4, zip=$5,
             postal_code_plus4=$6
         WHERE id=$7 AND owner_user_id=$8 RETURNING *`,
        [
          addressLine1.trim(),
          addressLine2 ? addressLine2.trim() : null,
          city.trim(),
          state.trim(),
          zip5(zip),
          b.postalCodePlus4 || null,
          id,
          req.authUser.id,
        ]
      );
      if (rows.length === 0) {
        return res.status(404).json({ ok: false, message: 'Property not found.' });
      }
      try {
        await resolveAndPersistPropertyTimezone(pool, Number(id), {
          addressLine1: addressLine1.trim(),
          city: city.trim(),
          state: state.trim(),
          zip: zip5(zip),
        });
      } catch (_e) {
        /* non-fatal */
      }
      const { rows: freshAddr } = await pool.query(`SELECT * FROM properties WHERE id=$1`, [id]);
      const r = freshAddr[0] || rows[0];
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
          postalCodePlus4: r.postal_code_plus4 || null,
          addressVerified: r.address_verified === true,
          addressVerificationProvider: r.address_verification_provider || null,
          timezone: r.timezone || null,
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
      const streetAddress =
        typeof b.addressLine1 === 'string'
          ? b.addressLine1.trim()
          : typeof b.streetAddress === 'string'
            ? b.streetAddress.trim()
            : '';
      const addressLine2 = typeof b.addressLine2 === 'string' ? b.addressLine2.trim() : '';
      const city = typeof b.city === 'string' ? b.city.trim() : '';
      const state = typeof b.state === 'string' ? b.state.trim() : '';
      const zip = typeof b.zip === 'string' ? b.zip.trim() : '';
      const country = typeof b.country === 'string' ? b.country.trim() : 'US';
      const category = typeof b.category === 'string' ? b.category.trim() : 'Other';
      const description = typeof b.description === 'string' ? b.description.trim() : '';
      const title =
        (typeof b.title === 'string' && b.title.trim()) ||
        `${category} issue`;

      const fullAddress =
        [streetAddress, addressLine2, city, state, zip, country].filter(Boolean).join(', ') || 'TBD';
      const cityStateZip = [city, state, zip].filter(Boolean).join(', ') || 'TBD';

      if (!email || !name) {
        return res.status(400).json({ ok: false, message: 'Name and email are required to start your assessment.' });
      }

      const guestConsent = checkActionConsentsFromBody(b, 'GUEST_SUBMIT');
      if (!guestConsent.ok) {
        return res.status(400).json({
          ok: false,
          code: guestConsent.code,
          message: 'You must agree to the FixBridge Terms of Service and Privacy Policy.',
          missingAcceptanceTypes: guestConsent.missing,
        });
      }

      // 1. Find or create user
      let user = null;
      const { rows: existingUsers } = await pool.query(
        'SELECT * FROM users WHERE role=\'homeowner\' AND LOWER(email)=LOWER($1)',
        [email]
      );

      if (existingUsers.length > 0) {
        // Do not attach guest jobs to existing accounts without proving ownership.
        return res.status(409).json({
          ok: false,
          code: 'ACCOUNT_EXISTS',
          message: 'An account with this email already exists. Please sign in to continue your request.',
        });
      }

      // Guest intake: random password (session is via returned JWT). Prefer set-password / forgot-password later.
      {
        const tempPassword = crypto.randomBytes(32).toString('base64url');
        const hashed = await bcrypt.hash(tempPassword, 10);
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

      await validateAndRecordActionConsents(pool, req, {
        actionKey: 'GUEST_SUBMIT',
        userId: user.id,
        idempotencyPrefix: `guest-submit:${user.id}`,
      });

      await ensureUserReferralCodeInline(pool, user);
      const emailOptIn =
        b.marketingEmailOptIn === true || b.marketingConsent === true;
      const smsOptIn =
        b.marketingSmsOptIn === true || b.marketingConsent === true;
      await recordSignupMarketingConsents(pool, {
        userId: user.id,
        emailOptIn,
        smsOptIn,
        source: 'signup',
        req,
      });
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
            `INSERT INTO properties (owner_user_id, label, address_line1, address_line2, city, state, zip, country, street_address)
             VALUES ($1, 'Home', $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [user.id, streetAddress, addressLine2 || null, city, state, zip, country, streetAddress]
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

      // 4. Queue structured AI assessment (async — avoids Netlify inactivity timeout)
      await pool.query(
        `UPDATE managed_jobs SET assessment_status='processing', assessment_started_at=NOW(), assessment_attempts=1 WHERE id=$1`,
        [job.id]
      );
      const queued = await scheduleAssessmentJob(pool, {
        jobId: job.id,
        actorUserId: user.id,
      });
      if (!queued.ok) {
        console.warn('public job assess queue failed:', queued.reason);
        await pool.query(
          `UPDATE managed_jobs SET assessment_status='failed', assessment_error_code='WORKER_UNAVAILABLE', assessment_completed_at=NOW() WHERE id=$1`,
          [job.id]
        );
      }

      const partnerCode = (b.partnerCode || '').trim();
      if (partnerCode) {
        const partner = await lookupPartnerByCode(pool, partnerCode);
        if (partner) {
          const attached = await attachPartnerToJob(pool, job.id, partner, user.id, {
            actorId: user.id,
          });
          if (!attached.ok && attached.blocked) {
            console.warn('partner self-referral blocked on public job create:', attached.reason);
          }
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
          // Do NOT increment uses here — coupon is only redeemed after verified payment.
        } else {
          const code = normalizeDiscountCode(discountCodeRaw);
          if (code) {
            await pool.query(`UPDATE managed_jobs SET discount_code=$1 WHERE id=$2`, [code, job.id]);
          }
        }
      } else if (partnerCode) {
        await applyAutoReferralDiscount(pool, job.id, partnerCode);
      }

      // Create timeline logs (AI completion is recorded by the background assessment worker)
      await pushStatus(pool, job.id, null, 'draft', user.id, 'Issue reported (Public Guest)');

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

  app.post('/api/managed/jobs', requireAuth, async (req, res) => {
    try {
      if (
        req.authUser.role !== 'homeowner' &&
        req.authUser.role !== 'admin'
      ) {
        return res.status(403).json({
          ok: false,
          message: 'Homeowners can report issues.',
        });
      }

      const b = req.body || {};

      if (!b.description && !b.title) {
        return res.status(400).json({
          ok: false,
          message: 'Please describe the issue.',
        });
      }

      // ------------------------------------------------------------
      // EXISTING PROPERTY / ADDRESS RESOLUTION
      // ------------------------------------------------------------

      let fullAddress = b.fullAddress || '';
      let cityStateZip = b.cityStateZip || '';
      let streetAddress = b.streetAddress || '';
      let city = b.city || '';
      let state = b.state || '';
      let zip = b.zip || '';
      let country = b.country || 'US';

      if (b.propertyId) {
        const { rows: props } = await pool.query(
          `SELECT *
           FROM properties
          WHERE id=$1
            AND owner_user_id=$2`,
          [
            b.propertyId,
            req.authUser.id,
          ]
        );

        if (props[0]) {
          const p = props[0];

          fullAddress = [
            p.address_line1,
            p.address_line2,
            p.city,
            p.state,
            p.zip,
            p.country,
          ].filter(Boolean).join(', ');

          cityStateZip = [
            p.city,
            p.state,
            p.zip,
          ].filter(Boolean).join(', ');

          streetAddress = p.address_line1 || '';
          city = p.city || '';
          state = p.state || '';
          zip = p.zip || '';
          country = p.country || 'US';
        }
      } else {
        fullAddress =
          [
            streetAddress,
            city,
            state,
            zip,
            country,
          ].filter(Boolean).join(', ') || 'TBD';

        cityStateZip =
          [
            city,
            state,
            zip,
          ].filter(Boolean).join(', ') || 'TBD';
      }

      // ------------------------------------------------------------
      // AUTHORITATIVE HOMECARE ENTITLEMENT CHECK
      // ------------------------------------------------------------

      const entitlement = await getHomeCareEntitlement(
        pool,
        req.authUser.id
      );

      const hasActiveHomeCare =
        entitlement.hasAccess === true;

      console.log(
        '[MANAGED JOB] HomeCare entitlement:',
        {
          userId: req.authUser.id,
          hasActiveHomeCare,
          plan: entitlement.plan,
          status: entitlement.status,
        }
      );

      // ------------------------------------------------------------
      // NON-HOMECARE REQUEST
      // Store it as pending_service_requests.
      // ------------------------------------------------------------

      if (!hasActiveHomeCare) {
        // ----------------------------------------------------------
        // PENDING SERVICE REQUEST INSERT
        //
        // IMPORTANT:
        // status is omitted so PostgreSQL uses:
        // status TEXT NOT NULL DEFAULT 'pending'
        //
        // 37 target columns = 37 parameters.
        // ----------------------------------------------------------

        const { rows: pendingRows } =
          await pool.query(
            `INSERT INTO pending_service_requests
            (
              homeowner_user_id,
              property_id,
              category,
              service_subcategory,
              title,
              description,
              media_data_url,
              media_type,
              preferred_date,
              preferred_time_slot,
              service_timing,
              city_state_zip,
              full_address,
              street_address,
              city,
              state,
              zip,
              country,
              contact_name,
              contact_phone,
              partner_code,
              referral_source,
              referring_name,
              referring_company,
              referring_email,
              referring_phone,
              customer_partner_status_consent,
              consent_timestamp,
              consent_version,
              property_purpose,
              transaction_stage,
              listing_deadline,
              closing_deadline,
              inspection_report_url,
              listing_reference_url,
              property_opportunity_notes,
              discount_code
            )
           VALUES
            (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
              $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
              $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
              $31,$32,$33,$34,$35,$36,$37
            )
           RETURNING *`,
            [
              req.authUser.id,
              b.propertyId || null,

              b.category || 'Others',
              b.serviceSubcategory || null,
              b.title ||
              `${b.category || 'Repair'} issue`,
              b.description || '',

              b.mediaDataUrl || null,
              b.mediaType || null,

              b.preferredDate || null,
              b.preferredTimeSlot || null,
              b.serviceTiming || 'weekday',

              cityStateZip || 'TBD',
              fullAddress || 'TBD',
              streetAddress || null,
              city || null,
              state || null,
              zip || null,
              country || 'US',

              b.contactName ||
              req.authUser.name ||
              'Customer',

              b.contactPhone || '',

              b.partnerCode || null,
              b.referralSource || null,

              b.referringName || null,
              b.referringCompany || null,
              b.referringEmail || null,
              b.referringPhone || null,

              Boolean(
                b.customerPartnerStatusConsent
              ),

              b.customerPartnerStatusConsent
                ? new Date()
                : null,

              b.consentVersion || '1.0',

              b.propertyPurpose || null,
              b.transactionStage || null,
              b.listingDeadline || null,
              b.closingDeadline || null,
              b.inspectionReportUrl || null,
              b.listingReferenceUrl || null,
              b.propertyOpportunityNotes || null,

              b.discountCode
                ? String(b.discountCode)
                  .trim()
                  .toUpperCase()
                : null,
            ]
          );

        const pending = pendingRows[0];

        console.log(
          '[PENDING SERVICE REQUEST] CREATED:',
          {
            id: pending.id,
            homeowner_user_id:
              pending.homeowner_user_id,
            status: pending.status,
          }
        );

        return res.json({
          ok: true,
          type: 'pending_service_request',
          pendingServiceRequestId:
            pending.id,
          pendingServiceRequest: pending,
          entitlement: {
            hasAccess: false,
            plan: entitlement.plan,
            status: entitlement.status,
          },
        });
      }

      // ------------------------------------------------------------
      // EXISTING HOMECARE MANAGED-JOB FLOW
      // ------------------------------------------------------------

      const { rows } = await pool.query(
        `INSERT INTO managed_jobs
        (
          homeowner_user_id,
          property_id,
          status,
          category,
          service_subcategory,
          title,
          description,
          media_data_url,
          media_type,
          preferred_date,
          preferred_time_slot,
          service_timing,
          city_state_zip,
          full_address,
          contact_name,
          contact_phone,
          partner_code,
          referral_source,
          referring_name,
          referring_company,
          referring_email,
          referring_phone,
          customer_partner_status_consent,
          consent_timestamp,
          consent_version,
          property_purpose,
          transaction_stage,
          listing_deadline,
          closing_deadline,
          inspection_report_url,
          listing_reference_url,
          property_opportunity_notes,
          street_address,
          city,
          state,
          zip,
          country
        )
       VALUES
        (
          $1,$2,'draft',$3,$4,$5,$6,$7,$8,$9,$10,$11,
          $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
          $24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36
        )
       RETURNING *`,
        [
          req.authUser.id,
          b.propertyId || null,
          b.category || 'Others',
          b.serviceSubcategory || null,
          b.title ||
          `${b.category || 'Repair'} issue`,
          b.description || '',
          b.mediaDataUrl || null,
          b.mediaType || null,
          b.preferredDate || null,
          b.preferredTimeSlot || null,
          b.serviceTiming || 'weekday',
          cityStateZip || 'TBD',
          fullAddress || 'TBD',
          b.contactName ||
          req.authUser.name ||
          'Customer',
          b.contactPhone || '',
          b.partnerCode || null,
          b.referralSource || null,
          b.referringName || null,
          b.referringCompany || null,
          b.referringEmail || null,
          b.referringPhone || null,
          Boolean(
            b.customerPartnerStatusConsent
          ),
          b.customerPartnerStatusConsent
            ? new Date()
            : null,
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
          country || 'US',
        ]
      );

      let job = rows[0];

      // ------------------------------------------------------------
      // EXISTING MANAGED-JOB LOGIC
      // ------------------------------------------------------------

      await audit(
        pool,
        req.authUser.id,
        'job_created',
        'managed_job',
        job.id,
        {
          title: job.title,
          category: job.category,
        }
      ).catch(() => { });

      const bookingId = formatBookingId(
        job.id,
        job.created_at
      );

      await pool.query(
        `UPDATE managed_jobs
          SET booking_id=$1
        WHERE id=$2`,
        [
          bookingId,
          job.id,
        ]
      );

      job = {
        ...job,
        booking_id: bookingId,
      };

      const config =
        await getHomeCareConfig(pool);

      const priorityTier =
        priorityTierForConfig(
          config,
          req.authUser.planCode
        );

      await pool.query(
        `UPDATE managed_jobs
          SET priority_tier=$1
        WHERE id=$2`,
        [
          priorityTier,
          job.id,
        ]
      );

      job.priority_tier =
        priorityTier;

      // KEEP YOUR EXISTING PARTNER / DISCOUNT / STATUS LOGIC HERE.

      await pushStatus(
        pool,
        job.id,
        null,
        'draft',
        req.authUser.id,
        'Issue reported'
      );

      const { rows: fresh } =
        await pool.query(
          `SELECT *
           FROM managed_jobs
          WHERE id=$1`,
          [job.id]
        );

      return res.json({
        ok: true,
        type: 'managed_job',
        job: serializeJob(
          fresh[0],
          req.authUser
        ),
        entitlement: {
          hasAccess: true,
          plan: entitlement.plan,
          status: entitlement.status,
        },
      });
    } catch (e) {
      console.error(
        '[POST /api/managed/jobs] ERROR:',
        e
      );

      return res.status(500).json({
        ok: false,
        message: 'Could not create job.',
      });
    }
  });

  app.post('/api/managed/jobs/:id/assess', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const force = req.body?.force === true;
      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Job not found.' });
      const job = rows[0];
      if (Number(job.homeowner_user_id) !== Number(req.authUser.id) && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }

      const currentStatus = resolveAssessmentStatus(job);
      if (currentStatus === 'ready' && !force) {
        return res.json({
          ok: true,
          status: 'ready',
          assessmentStatus: 'ready',
          job: serializeJob(job, req.authUser),
        });
      }
      if (currentStatus === 'processing' && !force) {
        return res.status(202).json({
          ok: true,
          status: 'processing',
          assessmentStatus: 'processing',
          jobId,
          message: 'Assessment is still processing.',
        });
      }

      const invocationId = String(req.body?.assessmentInvocationId || req.body?.invocationId || '').trim();
      if (!invocationId) {
        return res.status(400).json({
          ok: false,
          code: 'AI_ASSESSMENT_ACK_REQUIRED',
          message: 'AI assessment acknowledgment is required before continuing.',
        });
      }
      const consentCheck = checkActionConsentsFromBody(req.body, 'AI_ASSESSMENT');
      if (!consentCheck.ok) {
        return res.status(400).json({
          ok: false,
          code: consentCheck.code,
          message: 'You must acknowledge the AI assessment disclaimer before continuing.',
          missingAcceptanceTypes: consentCheck.missing,
        });
      }
      const consentResult = await requireActionConsents(pool, req, res, {
        actionKey: 'AI_ASSESSMENT',
        userId: req.authUser.id,
        jobId,
        idempotencyPrefix: `AI_ASSESSMENT:${req.authUser.id}:${jobId}:${invocationId}`,
      });
      if (!consentResult) return;

      const claimed = await claimAssessmentProcessing(pool, jobId, job.homeowner_user_id, { force });
      if (!claimed) {
        return res.status(202).json({
          ok: true,
          status: 'processing',
          assessmentStatus: 'processing',
          jobId,
          message: 'Assessment is already in progress.',
        });
      }

      const queued = await scheduleAssessmentJob(pool, {
        jobId,
        actorUserId: req.authUser.id,
      });
      if (!queued.ok) {
        await pool.query(
          `UPDATE managed_jobs SET assessment_status='failed', assessment_error_code='WORKER_UNAVAILABLE', assessment_completed_at=NOW() WHERE id=$1`,
          [jobId]
        );
        return res.status(503).json({
          ok: false,
          code: 'AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE',
          message: ASSESSMENT_ERROR_MESSAGES.AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE,
        });
      }

      return res.status(202).json({
        ok: true,
        status: 'processing',
        assessmentStatus: 'processing',
        jobId,
        message: 'Assessment started.',
      });
    } catch (e) {
      console.error('assess:', e);
      res.status(500).json({
        ok: false,
        code: 'AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE',
        message: ASSESSMENT_ERROR_MESSAGES.AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE,
      });
    }
  });

  app.get('/api/pending-service-requests/my', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT *
           FROM pending_service_requests
          WHERE homeowner_user_id=$1
            AND COALESCE(status,'pending') <> 'converted'
          ORDER BY COALESCE(updated_at, created_at) DESC, id DESC`,
        [req.authUser.id]
      );
      return res.json({ ok: true, pendingServiceRequests: rows });
    } catch (e) {
      console.error('pending-service-requests my:', e);
      return res.status(500).json({
        ok: false,
        message: 'Could not load saved service requests.',
      });
    }
  });

  app.get('/api/pending-service-requests/:id', requireAuth, async (req, res) => {
    try {
      const pendingId = Number(req.params.id);
      if (!Number.isFinite(pendingId) || pendingId <= 0) {
        return res.status(400).json({ ok: false, message: 'Invalid pending service request.' });
      }
      const { rows } = await pool.query(`SELECT * FROM pending_service_requests WHERE id=$1`, [pendingId]);
      const pending = rows[0];

      // Converted pending requests are intentionally deleted. Resolve the
      // historical request ID through the payment metadata so the Stripe
      // return page can still discover the newly-created managed job.
      if (!pending) {
        const { rows: convertedRows } = await pool.query(
          `SELECT j.*
             FROM payments p
             JOIN managed_jobs j ON j.id=p.job_id
            WHERE p.user_id=$1
              AND p.job_id IS NOT NULL
              AND (
                p.meta->>'pendingServiceRequestId'=$2
                OR p.meta->>'pending_service_request_id'=$2
              )
            ORDER BY p.id DESC
            LIMIT 1`,
          [req.authUser.id, String(pendingId)]
        );
        const convertedJob = convertedRows[0];
        if (convertedJob) {
          return res.json({
            ok: true,
            pendingServiceRequest: undefined,
            managedJob: serializeJob(convertedJob, req.authUser),
            converted: true,
          });
        }
        return res.status(404).json({ ok: false, message: 'Pending service request not found.' });
      }

      if (Number(pending.homeowner_user_id) !== Number(req.authUser.id) && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      let managedJob = null;
      if (pending.managed_job_id) {
        const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [pending.managed_job_id]);
        managedJob = jobs[0] ? serializeJob(jobs[0], req.authUser) : null;
      }
      return res.json({
        ok: true,
        pendingServiceRequest: pending,
        managedJob,
        converted: Boolean(managedJob),
      });
    } catch (e) {
      console.error('pending-service-request get:', e);
      return res.status(500).json({ ok: false, message: 'Could not load pending service request.' });
    }
  });

  app.post('/api/pending-service-requests/:id/professional-checkout', requireAuth, async (req, res) => {
    try {
      const pendingId = Number(req.params.id);
      if (!Number.isFinite(pendingId) || pendingId <= 0) {
        return res.status(400).json({ ok: false, message: 'Invalid pending service request.' });
      }
      const { rows } = await pool.query(`SELECT * FROM pending_service_requests WHERE id=$1`, [pendingId]);
      const pending = rows[0];
      if (!pending) return res.status(404).json({ ok: false, message: 'Pending service request not found.' });
      if (Number(pending.homeowner_user_id) !== Number(req.authUser.id)) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      if (pending.managed_job_id) {
        const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [pending.managed_job_id]);
        return res.json({ ok: true, alreadyConverted: true, managedJob: jobs[0] ? serializeJob(jobs[0], req.authUser) : null });
      }
      if (String(pending.assessment_status || '') !== 'ready' && !pending.ai_assessment) {
        return res.status(400).json({ ok: false, code: 'ASSESSMENT_REQUIRED', message: 'Complete the Fixera assessment before requesting professional service.' });
      }
      if (req.body?.acknowledged !== true) {
        return res.status(400).json({ ok: false, code: 'ACK_REQUIRED', message: 'Please acknowledge the professional-service payment terms.' });
      }

      const serviceTiming = String(req.body?.serviceTiming || pending.service_timing || 'weekday').slice(0, 40);
      const preferredDate = req.body?.preferredDate ? String(req.body.preferredDate).slice(0, 32) : null;
      const preferredTimeSlot = String(req.body?.preferredTimeSlot || pending.preferred_time_slot || '9-11').slice(0, 40);
      const propertyPurpose = String(req.body?.propertyPurpose || pending.property_purpose || 'current_homeowner').slice(0, 80);
      const transactionStage = String(req.body?.transactionStage || pending.transaction_stage || 'ongoing_maintenance').slice(0, 80);
      const contactPhone = req.body?.contactPhone != null ? String(req.body.contactPhone).slice(0, 40) : pending.contact_phone;
      const amountCents = 12500;

      console.info("[FLOW][3][API] PROFESSIONAL HIRE CHOSEN", {
        pendingServiceRequestId: pendingId,
        homeownerUserId: req.authUser.id,
        selectedAction: pending.selected_action || null,
        assessmentStatus: pending.assessment_status || null,
        amountCents,
        serviceTiming,
        preferredDate,
        preferredTimeSlot,
      });

      await pool.query(
        `UPDATE pending_service_requests SET
           service_timing=$2,
           preferred_date=$3,
           preferred_time_slot=$4,
           property_purpose=$5,
           transaction_stage=$6,
           contact_phone=$7,
           selected_action='hire',
           payment_status='pending',
           paid_amount_cents=$8,
           updated_at=NOW()
         WHERE id=$1`,
        [pendingId, serviceTiming, preferredDate, preferredTimeSlot, propertyPurpose, transactionStage, contactPhone || null, amountCents]
      );

      try {
        assertPaymentsAvailable();
      } catch (payErr) {
        return res.status(payErr.status || 503).json({ ok: false, code: payErr.code || 'STRIPE_NOT_CONFIGURED', message: payErr.message || 'Payments are not configured.' });
      }

      const origin = req.get('origin') || req.get('referer');
      let checkout;
      try {
        checkout = await createCheckoutSession({
          amountCents,
          customerEmail: req.authUser.email,
          description: `${brand.productName} Professional Service Request — Pending #${pendingId}`,
          successPath: `/?paid=pending-professional&pendingServiceRequestId=${pendingId}`,
          cancelPath: `/?canceled=pending-professional&pendingServiceRequestId=${pendingId}`,
          origin,
          metadata: {
            pendingServiceRequestId: String(pendingId),
            paymentType: 'pending_professional_fee',
            userId: String(req.authUser.id),
            amountCents: String(amountCents),
          },
        });
      } catch (payErr) {
        console.error('pending professional checkout:', payErr);
        return res.status(payErr.status || 502).json({ ok: false, code: payErr.code || 'STRIPE_CHECKOUT_FAILED', message: payErr.message || 'Could not start Stripe checkout.' });
      }

      await pool.query(
        `UPDATE pending_service_requests SET stripe_session_id=$2, updated_at=NOW() WHERE id=$1`,
        [pendingId, checkout.sessionId]
      );

      // Create the payment row before redirecting to Stripe. This gives the
      // authenticated post-return sync a durable reconciliation record even
      // when Stripe's webhook arrives late or is temporarily unavailable.
      await pool.query(
        `INSERT INTO payments (
           user_id,
           payment_type,
           amount,
           currency,
           status,
           stripe_session_id,
           provider,
           simulated,
           meta
         )
         SELECT $1,'pending_professional_fee',$2,'usd','pending',$3,'stripe',false,$4
          WHERE NOT EXISTS (
            SELECT 1 FROM payments WHERE stripe_session_id=$3
          )`,
        [
          req.authUser.id,
          amountCents / 100,
          checkout.sessionId,
          JSON.stringify({
            pendingServiceRequestId: pendingId,
            source: 'pending_service_request_checkout',
          }),
        ]
      );

      console.info("[FLOW][3][API] PROFESSIONAL CHECKOUT CREATED", {
        pendingServiceRequestId: pendingId,
        amountCents,
        stripeSessionId: checkout.sessionId ? String(checkout.sessionId).slice(0, 18) : null,
        hasUrl: Boolean(checkout.url),
      });

      return res.json({ ok: true, url: checkout.url, amount: 125, amountCents, pendingServiceRequestId: pendingId });
    } catch (e) {
      console.error('pending professional checkout:', e);
      return res.status(500).json({ ok: false, message: 'Could not start professional payment.' });
    }
  });

  app.post('/api/pending-service-requests/:id/assess', requireAuth, async (req, res) => {
    try {
      const pendingId = Number(req.params.id);
      const force = req.body?.force === true;

      const { rows } = await pool.query(
        `SELECT *
           FROM pending_service_requests
          WHERE id=$1`,
        [pendingId]
      );

      if (!rows[0]) {
        return res.status(404).json({
          ok: false,
          message: 'Pending service request not found.',
        });
      }

      const pending = rows[0];

      if (
        Number(pending.homeowner_user_id) !==
        Number(req.authUser.id) &&
        req.authUser.role !== 'admin'
      ) {
        return res.status(403).json({
          ok: false,
          message: 'Not allowed.',
        });
      }

      const currentStatus =
        resolveAssessmentStatus(pending);

      if (currentStatus === 'ready' && !force) {
        return res.json({
          ok: true,
          status: 'ready',
          assessmentStatus: 'ready',
          pendingServiceRequestId: pendingId,
          pendingServiceRequest: pending,
        });
      }

      if (
        currentStatus === 'processing' &&
        !force
      ) {
        return res.status(202).json({
          ok: true,
          status: 'processing',
          assessmentStatus: 'processing',
          pendingServiceRequestId: pendingId,
          message: 'Assessment is still processing.',
        });
      }

      const invocationId = String(
        req.body?.assessmentInvocationId ||
        req.body?.invocationId ||
        ''
      ).trim();

      if (!invocationId) {
        return res.status(400).json({
          ok: false,
          code: 'AI_ASSESSMENT_ACK_REQUIRED',
          message:
            'AI assessment acknowledgment is required before continuing.',
        });
      }

      const consentCheck =
        checkActionConsentsFromBody(
          req.body,
          'AI_ASSESSMENT'
        );

      if (!consentCheck.ok) {
        return res.status(400).json({
          ok: false,
          code: consentCheck.code,
          message:
            'You must acknowledge the AI assessment disclaimer before continuing.',
          missingAcceptanceTypes:
            consentCheck.missing,
        });
      }

      /*
       * Pending service requests do not have a managed_job ID.
       * Therefore jobId must remain null here.
       */
      const consentResult =
        await requireActionConsents(pool, req, res, {
          actionKey: 'AI_ASSESSMENT',
          userId: req.authUser.id,
          jobId: null,
          idempotencyPrefix:
            `AI_ASSESSMENT_PENDING:${req.authUser.id}:${pendingId}:${invocationId}`,
        });

      if (!consentResult) {
        return;
      }

      const claimed =
        await claimPendingServiceRequestAssessment(
          pool,
          pendingId,
          pending.homeowner_user_id,
          { force }
        );

      if (!claimed) {
        return res.status(202).json({
          ok: true,
          status: 'processing',
          assessmentStatus: 'processing',
          pendingServiceRequestId: pendingId,
          message:
            'Assessment is already in progress.',
        });
      }

      const queued =
        await schedulePendingServiceRequestAssessment(
          pool,
          {
            pendingServiceRequestId: pendingId,
            actorUserId: req.authUser.id,
          }
        );

      if (!queued.ok) {
        await pool.query(
          `UPDATE pending_service_requests
        SET assessment_status='failed',
            updated_at=NOW()
      WHERE id=$1`,
          [pendingId]
        );


        return res.status(503).json({
          ok: false,
          code:
            'AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE',
          message:
            ASSESSMENT_ERROR_MESSAGES
              .AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE,
        });
      }

      return res.status(202).json({
        ok: true,
        status: 'processing',
        assessmentStatus: 'processing',
        pendingServiceRequestId: pendingId,
        message: 'Assessment started.',
      });
    } catch (e) {
      console.error(
        'pending-service-request assess:',
        e
      );

      return res.status(500).json({
        ok: false,
        code:
          'AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE',
        message:
          ASSESSMENT_ERROR_MESSAGES
            .AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE,
      });
    }
  }
  );

  app.get('/api/managed/jobs/:id/assessment-status', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Job not found.' });
      const job = rows[0];
      if (Number(job.homeowner_user_id) !== Number(req.authUser.id) && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const status = resolveAssessmentStatus(job);
      const errorCode = job.assessment_error_code || null;
      const payload = {
        ok: true,
        status,
        assessmentStatus: status,
        jobId,
        errorCode,
        message:
          status === 'failed'
            ? ASSESSMENT_ERROR_MESSAGES[errorCode] ||
            ASSESSMENT_ERROR_MESSAGES.AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE
            : undefined,
      };
      if (status === 'ready') {
        payload.job = serializeJob(job, req.authUser);
        const pricing = parseJson(job.pricing);
        if (pricing) {
          payload.pricing = {
            showPrice: job.show_retail_price !== false,
            message: pricing.message,
            customerRetailEstimateLow: job.customer_retail_estimate_low,
            customerRetailEstimateHigh: job.customer_retail_estimate_high,
            disclaimer: pricing.disclaimer,
          };
        }
      }
      return res.json(payload);
    } catch (e) {
      console.error('assessment-status:', e);
      res.status(500).json({
        ok: false,
        code: 'AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE',
        message: ASSESSMENT_ERROR_MESSAGES.AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE,
      });
    }
  });

  app.get('/api/pending-service-requests/:id/assessment-status', requireAuth, async (req, res) => {
    try {
      const pendingId = Number(req.params.id);

      const { rows } = await pool.query(
        `SELECT *
           FROM pending_service_requests
          WHERE id=$1`,
        [pendingId]
      );

      if (!rows[0]) {
        return res.status(404).json({
          ok: false,
          message:
            'Pending service request not found.',
        });
      }

      const pending = rows[0];

      if (
        Number(pending.homeowner_user_id) !==
        Number(req.authUser.id) &&
        req.authUser.role !== 'admin'
      ) {
        return res.status(403).json({
          ok: false,
          message: 'Not allowed.',
        });
      }

      const status =
        resolveAssessmentStatus(pending);

      const errorCode =
        pending.assessment_error_code || null;

      const payload = {
        ok: true,
        status,
        assessmentStatus: status,
        pendingServiceRequestId: pendingId,
        errorCode,
        message:
          status === 'failed'
            ? ASSESSMENT_ERROR_MESSAGES[
            errorCode
            ] ||
            ASSESSMENT_ERROR_MESSAGES
              .AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE
            : undefined,
      };

      if (status === 'ready') {
        payload.pendingServiceRequest = pending;

        const pricing =
          parseJson(pending.pricing);

        if (pricing) {
          payload.pricing = {
            showPrice:
              pending.show_retail_price !== false,
            message: pricing.message,
            customerRetailEstimateLow:
              pending.customer_retail_estimate_low,
            customerRetailEstimateHigh:
              pending.customer_retail_estimate_high,
            disclaimer: pricing.disclaimer,
          };
        }
      }

      return res.json(payload);
    } catch (e) {
      console.error(
        'pending-service-request assessment-status:',
        e
      );

      return res.status(500).json({
        ok: false,
        code:
          'AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE',
        message:
          ASSESSMENT_ERROR_MESSAGES
            .AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE,
      });
    }
  }
  );

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

  app.post('/api/managed/jobs/:id/repeat-service', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      const source = rows[0];
      if (!source) return res.status(404).json({ ok: false, message: 'Job not found.' });
      if (Number(source.homeowner_user_id) !== Number(req.authUser.id) && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const completedStatuses = ['completed', 'closed', 'customer_review_pending', 'work_completed', 'payout_pending'];
      if (!completedStatuses.includes(String(source.status).toLowerCase())) {
        return res.status(400).json({ ok: false, message: 'Only completed or in-review jobs can be repeated.' });
      }

      const requestSameProvider = req.body?.requestSameProvider !== false;
      let preferredId = null;
      let providerNote = '';
      if (requestSameProvider && source.assigned_contractor_user_id) {
        const { rows: contractors } = await pool.query(
          `SELECT id, name, company_name, is_blocked FROM users WHERE id=$1 AND role='contractor'`,
          [source.assigned_contractor_user_id]
        );
        const c = contractors[0];
        if (c && !c.is_blocked) {
          preferredId = Number(c.id);
          providerNote = `Preferred provider: ${c.company_name || c.name} (user #${c.id}).`;
        }
      }

      const description = [
        source.description || '',
        providerNote,
        'Repeated from prior FixBridge service — new quote and pricing required.',
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, 2000);

      const { rows: created } = await pool.query(
        `INSERT INTO managed_jobs
          (homeowner_user_id, property_id, status, category, service_subcategory, title, description,
           full_address, city_state_zip, street_address, city, state, zip, country,
           contact_name, contact_phone, preferred_date, preferred_time_slot, service_timing, preferred_contractor_user_id)
         VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         RETURNING *`,
        [
          req.authUser.id,
          source.property_id,
          source.category || 'Others',
          source.service_subcategory || null,
          source.title || `${source.category || 'Service'} (repeat)`,
          description,
          source.full_address || 'TBD',
          source.city_state_zip || 'TBD',
          source.street_address || null,
          source.city || null,
          source.state || null,
          source.zip || null,
          source.country || 'US',
          source.contact_name || req.authUser.name || 'Customer',
          source.contact_phone || '',
          null,
          source.preferred_time_slot || null,
          source.service_timing || 'weekday',
          preferredId,
        ]
      );
      let job = created[0];
      const bookingId = formatBookingId(job.id, job.created_at);
      await pool.query(`UPDATE managed_jobs SET booking_id=$1 WHERE id=$2`, [bookingId, job.id]);
      job = { ...job, booking_id: bookingId };

      const config = await getHomeCareConfig(pool);
      const priorityTier = priorityTierForConfig(config, req.authUser.planCode);
      await pool.query(`UPDATE managed_jobs SET priority_tier=$1 WHERE id=$2`, [priorityTier, job.id]);

      res.json({ ok: true, job: serializeJob({ ...job, priority_tier: priorityTier }, req.authUser) });
    } catch (e) {
      console.error('repeat-service:', e);
      res.status(500).json({ ok: false, message: 'Could not repeat service.' });
    }
  });

  app.get('/api/managed/jobs/:id', requireAuth, async (req, res) => {
    try {
      const job = await fetchJobWithTech(pool, Number(req.params.id));
      if (!job) return res.status(404).json({ ok: false, message: 'Not found.' });
      const allowed =
        req.authUser.role === 'admin' ||
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

  /** Homeowner updates schedule / request details before work is underway. */
  app.put('/api/managed/jobs/:id/homeowner-update', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Job not found.' });
      const job = rows[0];
      if (Number(job.homeowner_user_id) !== Number(req.authUser.id) && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }

      const locked = [
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
      ].includes(String(job.status));
      if (locked) {
        return res.status(400).json({
          ok: false,
          message: 'This request can no longer be edited. Contact FixBridge support if you need changes.',
        });
      }

      const b = req.body || {};
      const nextTiming =
        b.serviceTiming != null ? String(b.serviceTiming).slice(0, 40) : job.service_timing;
      const nextDate =
        b.preferredDate !== undefined
          ? b.preferredDate
            ? String(b.preferredDate).slice(0, 32)
            : null
          : job.preferred_date;
      const nextSlot =
        b.preferredTimeSlot != null
          ? String(b.preferredTimeSlot).slice(0, 40)
          : job.preferred_time_slot;
      const nextDesc =
        b.description != null ? String(b.description).slice(0, 4000) : job.description;
      const nextPhone =
        b.contactPhone != null ? String(b.contactPhone).slice(0, 40) : job.contact_phone;
      const nextTitle = b.title != null ? String(b.title).slice(0, 200) : job.title;

      const { rows: updated } = await pool.query(
        `UPDATE managed_jobs SET
           service_timing=$2,
           preferred_date=$3,
           preferred_time_slot=$4,
           description=$5,
           contact_phone=$6,
           title=COALESCE($7, title),
           updated_at=NOW()
         WHERE id=$1
         RETURNING *`,
        [jobId, nextTiming, nextDate, nextSlot, nextDesc, nextPhone, nextTitle || null]
      );

      try {
        await pool.query(
          `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, detail)
           VALUES ($1,'homeowner_job_update','managed_job',$2,$3)`,
          [
            req.authUser.id,
            String(jobId),
            JSON.stringify({
              serviceTiming: nextTiming,
              preferredDate: nextDate,
              preferredTimeSlot: nextSlot,
            }),
          ]
        );
      } catch {
        /* non-fatal */
      }

      try {
        const { serviceAt: previousServiceAt } = await resolveServiceAtUtc(pool, job);
        const dateChanged =
          String(nextDate || '').slice(0, 10) !== String(job.preferred_date || '').slice(0, 10) ||
          String(nextSlot || '') !== String(job.preferred_time_slot || '');
        if (dateChanged) {
          await resetReminderOnReschedule(pool, updated[0], previousServiceAt);
        } else {
          await upsertServiceReminderEligibility(pool, updated[0], {
            recurringServiceId: updated[0].source_recurring_service_id,
          });
        }
      } catch (_e) {
        /* non-fatal */
      }

      res.json({ ok: true, job: serializeJob(updated[0], req.authUser) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not update request.' });
    }
  });

  app.post('/api/managed/jobs/:id/cancel', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
      const jobId = Number(req.params.id);
      if (!Number.isFinite(jobId) || jobId <= 0) {
        return res.status(400).json({ ok: false, message: 'Invalid job id.' });
      }

      const parsed = normalizeCancellationPayload(req.body || {});
      if (!parsed.ok) {
        return res.status(400).json({ ok: false, message: parsed.message });
      }

      await client.query('BEGIN');
      const { rows } = await client.query(`SELECT * FROM managed_jobs WHERE id=$1 FOR UPDATE`, [jobId]);
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ ok: false, message: 'Job not found.' });
      }
      const job = rows[0];
      const isOwner = Number(job.homeowner_user_id) === Number(req.authUser.id);
      const isAdmin = req.authUser.role === 'admin';
      if (!isOwner && !isAdmin) {
        await client.query('ROLLBACK');
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }

      if (String(job.status) === 'canceled') {
        await client.query('COMMIT');
        return res.json({
          ok: true,
          alreadyCancelled: true,
          job: serializeJob(job, req.authUser),
        });
      }

      if (!isHomeownerCancellableStatus(job.status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          ok: false,
          message: 'This service can no longer be cancelled online. Contact FixBridge support for help.',
        });
      }

      const fromStatus = job.status;
      const cancelledBy = isAdmin ? 'admin' : 'homeowner';
      const { rows: updatedRows } = await client.query(
        `UPDATE managed_jobs SET
           status='canceled',
           cancellation_reason=$2,
           cancellation_reason_code=$3,
           cancellation_details=$4,
           cancelled_at=NOW(),
           cancelled_by=$5,
           updated_at=NOW()
         WHERE id=$1 AND status = ANY($6::text[])
         RETURNING *`,
        [
          jobId,
          parsed.cancellationReason,
          parsed.reasonCode,
          JSON.stringify(parsed.details || {}),
          cancelledBy,
          Array.from(HOMEOWNER_CANCELABLE_STATUSES),
        ]
      );

      if (!updatedRows[0]) {
        await client.query('ROLLBACK');
        const { rows: fresh } = await client.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
        if (fresh[0] && String(fresh[0].status) === 'canceled') {
          return res.json({
            ok: true,
            alreadyCancelled: true,
            job: serializeJob(fresh[0], req.authUser),
          });
        }
        return res.status(409).json({
          ok: false,
          message: 'This service changed while cancelling. Refresh and try again.',
        });
      }

      await client.query(
        `INSERT INTO job_status_history (job_id, from_status, to_status, actor_user_id, note)
         VALUES ($1,$2,'canceled',$3,$4)`,
        [jobId, fromStatus, req.authUser.id, `Cancelled by ${cancelledBy}: ${parsed.reasonLabel}`]
      );

      await client.query('COMMIT');

      const updatedJob = updatedRows[0];
      try {
        await releaseVisitFeeHoldIfNeeded(pool, jobId, req.authUser.id, pushStatus);
      } catch (e) {
        console.error('cancel release hold:', e.message);
      }

      const { rows: hw } = await pool.query('SELECT id, name, email FROM users WHERE id=$1', [
        job.homeowner_user_id,
      ]);
      try {
        await notifyJobCancelled(pool, {
          job: updatedJob,
          homeowner: hw[0],
          reasonCode: parsed.reasonCode,
          reasonLabel: parsed.reasonLabel,
          details: parsed.details,
          actorUserId: req.authUser.id,
        });
      } catch (e) {
        console.error('notifyJobCancelled:', e.message);
      }

      try {
        await syncPartnerReferralFromJob(pool, jobId, 'canceled');
      } catch (e) {
        console.error('[Partner sync cancel]', e.message);
      }

      res.json({ ok: true, job: serializeJob(updatedJob, req.authUser) });
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      console.error('cancel job:', e);
      res.status(500).json({ ok: false, message: 'Could not cancel service.' });
    } finally {
      client.release();
    }
  });

  app.post('/api/managed/jobs/:id/request-professional', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Job not found.' });
      const job = rows[0];
      if (Number(job.homeowner_user_id) !== Number(req.authUser.id) && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const assessmentFailed = job.assessment_status === 'failed';
      const professionalAllowed =
        ['ai_review_complete', 'awaiting_service_payment'].includes(job.status) ||
        (assessmentFailed && job.status === 'draft');
      if (!professionalAllowed) {
        return res.status(400).json({
          ok: false,
          message: 'Professional dispatch is not available for this job status.',
        });
      }

      if (req.authUser.role !== 'admin') {
        const rules = await loadPricingRules(pool);
        let discount = null;
        if (job.discount_code) {
          const row = await lookupDiscountByCode(pool, job.discount_code);
          const checked = validateDiscountRow(row);
          if (checked.ok) discount = checked.discount;
        }
        const breakdown = buildCheckoutBreakdown(job, rules, discount);
        const betaSnapshot = buildProfessionalRequestBetaSnapshot(breakdown, job);
        const ackOk = await requireHomeownerAcknowledgment(pool, req, res, {
          jobId,
          actionKey: 'PROFESSIONAL_DISPATCH',
          message: 'You must acknowledge the professional service request terms before requesting a professional.',
          snapshotData: betaSnapshot,
        });
        if (!ackOk) return;
      }

      const b = req.body || {};
      const serviceTiming = b.serviceTiming || job.service_timing || 'weekday';
      const preferredDate = b.preferredDate || null;
      const preferredTimeSlot = b.preferredTimeSlot || job.preferred_time_slot || '9-11';
      const propertyPurpose = b.propertyPurpose || job.property_purpose || 'current_homeowner';
      const transactionStage = b.transactionStage || job.transaction_stage || 'ongoing_maintenance';

      if (b.discountCode) {
        const codeRaw = normalizeDiscountCode(String(b.discountCode));
        if (codeRaw) {
          const row = await lookupDiscountByCode(pool, codeRaw);
          const checked = validateDiscountRow(row);
          if (!checked.ok) {
            return res.status(400).json({ ok: false, message: checked.message });
          }
          await applyValidatedCouponToJob(pool, jobId, checked.discount);
        }
      }

      await pool.query(
        `UPDATE managed_jobs SET
           service_timing=$2,
           preferred_date=$3,
           preferred_time_slot=$4,
           property_purpose=$5,
           transaction_stage=$6,
           job_mode='managed',
           updated_at=NOW()
         WHERE id=$1`,
        [jobId, serviceTiming, preferredDate, preferredTimeSlot, propertyPurpose, transactionStage]
      );

      if (job.status === 'ai_review_complete' || (assessmentFailed && job.status === 'draft')) {
        await pushStatus(
          pool,
          jobId,
          job.status,
          'awaiting_service_payment',
          req.authUser.id,
          assessmentFailed
            ? 'Homeowner requested professional dispatch after assessment failure'
            : 'Homeowner requested professional dispatch'
        );
      }

      const { rows: fresh } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      res.json({ ok: true, job: serializeJob(fresh[0], req.authUser) });
    } catch (e) {
      console.error('request-professional:', e);
      res.status(500).json({ ok: false, message: 'Could not save dispatch request.' });
    }
  });

  // ── Checkout: optional coupon validate → snapshot → pay ────────────────────
  function buildCheckoutBreakdown(job, rules, discount) {
    return buildProfessionalDispatchBreakdown(job, rules, discount);
  }

  app.get('/api/managed/jobs/:id/dispatch-pricing', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Job not found.' });
      const job = rows[0];
      if (Number(job.homeowner_user_id) !== Number(req.authUser.id) && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const rules = await loadPricingRules(pool);
      let discount = null;
      if (job.discount_code) {
        const row = await lookupDiscountByCode(pool, job.discount_code);
        const checked = validateDiscountRow(row);
        if (checked.ok) discount = checked.discount;
      }
      const codeFromQuery = req.query?.discountCode != null ? normalizeDiscountCode(String(req.query.discountCode)) : null;
      if (codeFromQuery) {
        const row = await lookupDiscountByCode(pool, codeFromQuery);
        const checked = validateDiscountRow(row);
        if (!checked.ok) {
          return res.status(400).json({ ok: false, message: checked.message || 'Invalid coupon.' });
        }
        discount = checked.discount;
      }
      const breakdown = buildCheckoutBreakdown(job, rules, discount);
      res.json({
        ok: true,
        breakdown,
        lines: breakdown.lines,
        authorizedNowCents: breakdown.authorizedNowCents,
        authorizedNow: breakdown.authorizedNow,
        repairWorkIncluded: false,
        repairWorkNote: breakdown.repairWorkNote,
      });
    } catch (e) {
      console.error('dispatch-pricing:', e);
      res.status(500).json({ ok: false, message: 'Could not load dispatch pricing.' });
    }
  });

  /** Validate coupon only — does not permanently redeem / increment usage. */
  app.post('/api/managed/jobs/:id/apply-coupon', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const codeRaw = String(req.body?.code || '').trim();
      if (!codeRaw) return res.status(400).json({ ok: false, message: 'Coupon code is required.' });

      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Job not found.' });
      const job = rows[0];
      if (Number(job.homeowner_user_id) !== Number(req.authUser.id) && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      if (job.visit_fee_authorized || job.coupon_redeemed_at) {
        return res.status(400).json({ ok: false, message: 'Payment already completed for this request.' });
      }

      const row = await lookupDiscountByCode(pool, codeRaw);
      const checked = validateDiscountRow(row);
      if (!checked.ok) {
        return res.status(400).json({
          ok: false,
          message: checked.message || 'This coupon is not valid for this service.',
        });
      }

      // Persist validated coupon on the job for checkout preview only (not redeemed yet).
      await applyValidatedCouponToJob(pool, jobId, checked.discount);

      const rules = await loadPricingRules(pool);
      const breakdown = buildCheckoutBreakdown(job, rules, checked.discount);
      const { rows: fresh } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      res.json({
        ok: true,
        discount: publicDiscountView(checked.discount),
        visitFeeOriginal: breakdown.serviceFee,
        visitFeeAfterDiscount: breakdown.finalAmount,
        discountAmount: breakdown.couponDiscount,
        breakdown,
        job: serializeJob(fresh[0], req.authUser),
      });
    } catch (e) {
      console.error('apply-coupon:', e);
      res.status(500).json({ ok: false, message: 'Could not validate coupon.' });
    }
  });

  app.post('/api/managed/jobs/:id/clear-coupon', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Job not found.' });
      const job = rows[0];
      if (Number(job.homeowner_user_id) !== Number(req.authUser.id) && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      if (job.visit_fee_authorized || job.coupon_redeemed_at) {
        return res.status(400).json({ ok: false, message: 'Payment already completed for this request.' });
      }
      await persistJobDiscountFields(pool, jobId, null, null);
      await pool.query(
        `UPDATE managed_jobs SET checkout_snapshot = NULL, coupon_discount_amount = NULL, updated_at=NOW() WHERE id=$1`,
        [jobId]
      );
      const rules = await loadPricingRules(pool);
      const { rows: fresh } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      const breakdown = buildCheckoutBreakdown(fresh[0], rules, null);
      res.json({ ok: true, breakdown, job: serializeJob(fresh[0], req.authUser) });
    } catch (e) {
      console.error('clear-coupon:', e);
      res.status(500).json({ ok: false, message: 'Could not remove coupon.' });
    }
  });

  /** Build / refresh server-side checkout snapshot before Confirm & Pay. */
  app.post('/api/managed/jobs/:id/prepare-checkout', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Job not found.' });
      let job = rows[0];
      if (Number(job.homeowner_user_id) !== Number(req.authUser.id) && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      if (job.visit_fee_authorized) {
        return res.status(400).json({ ok: false, message: 'This request is already paid.' });
      }

      const clearCoupon = req.body?.clearCoupon === true;
      const codeFromBody = req.body?.discountCode != null ? normalizeDiscountCode(String(req.body.discountCode)) : null;

      if (clearCoupon || codeFromBody === '') {
        await persistJobDiscountFields(pool, jobId, null, null);
        const refreshed = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
        job = refreshed.rows[0];
      } else if (codeFromBody) {
        const row = await lookupDiscountByCode(pool, codeFromBody);
        const checked = validateDiscountRow(row);
        if (!checked.ok) {
          return res.status(400).json({ ok: false, message: checked.message || 'This coupon is not valid.' });
        }
        await applyValidatedCouponToJob(pool, jobId, checked.discount);
        const refreshed = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
        job = refreshed.rows[0];
      }

      const rules = await loadPricingRules(pool);
      let discount = null;
      if (job.discount_code) {
        const row = await lookupDiscountByCode(pool, job.discount_code);
        const checked = validateDiscountRow(row);
        if (!checked.ok) {
          return res.status(400).json({
            ok: false,
            message: checked.message || 'Coupon on this request is no longer valid. Remove it to continue.',
          });
        }
        discount = checked.discount;
      }

      const snapshot = buildCheckoutBreakdown(job, rules, discount);
      await pool.query(
        `UPDATE managed_jobs SET
           checkout_snapshot=$2::jsonb,
           service_fee_amount=$3,
           service_amount=$4,
           coupon_discount_amount=$5,
           final_customer_amount=$6,
           visit_fee_amount=$6,
           updated_at=NOW()
         WHERE id=$1`,
        [
          jobId,
          JSON.stringify(snapshot),
          snapshot.serviceFee,
          snapshot.serviceAmount,
          snapshot.couponDiscount,
          snapshot.finalAmount,
        ]
      );

      const { rows: fresh } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      res.json({
        ok: true,
        snapshot,
        breakdown: snapshot,
        job: serializeJob(fresh[0], req.authUser),
      });
    } catch (e) {
      console.error('prepare-checkout:', e);
      res.status(500).json({ ok: false, message: 'Could not prepare checkout.' });
    }
  });

  app.post('/api/managed/jobs/:id/pay-dispatch', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      let { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      let job = rows[0];
      if (Number(job.homeowner_user_id) !== Number(req.authUser.id) && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      if (!['awaiting_service_payment', 'ai_review_complete'].includes(job.status)) {
        return res.status(400).json({ ok: false, message: 'Dispatch authorization not due for this status.' });
      }
      if (job.visit_fee_authorized) {
        return res.status(400).json({ ok: false, message: 'Visit fee already authorized.' });
      }

      // Refresh / lock checkout snapshot from current pricing + validated coupon (backend source of truth).
      const codeFromBody = req.body?.discountCode != null ? normalizeDiscountCode(String(req.body.discountCode)) : null;
      if (codeFromBody === '') {
        await persistJobDiscountFields(pool, jobId, null, null);
        job = (await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId])).rows[0];
      } else if (codeFromBody) {
        const row = await lookupDiscountByCode(pool, codeFromBody);
        const checked = validateDiscountRow(row);
        if (!checked.ok) {
          return res.status(400).json({ ok: false, message: checked.message });
        }
        await applyValidatedCouponToJob(pool, jobId, checked.discount);
        job = (await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId])).rows[0];
      }

      const rules = await loadPricingRules(pool);
      let discount = null;
      if (job.discount_code) {
        const row = await lookupDiscountByCode(pool, job.discount_code);
        const checked = validateDiscountRow(row);
        if (!checked.ok) {
          return res.status(400).json({
            ok: false,
            message: checked.message || 'Coupon on this job is no longer valid.',
          });
        }
        discount = checked.discount;
      }

      const snapshot = buildCheckoutBreakdown(job, rules, discount);
      const amount = snapshot.finalAmount;

      if (req.body?.authorizedAmount != null || req.body?.authorizedNow != null) {
        const clientCents = Math.round(Number(req.body.authorizedAmount ?? req.body.authorizedNow) * 100);
        if (clientCents !== snapshot.authorizedNowCents) {
          return res.status(400).json({
            ok: false,
            code: 'PRICING_MISMATCH',
            message: 'Authorized amount does not match current server pricing. Please refresh and try again.',
            authorizedNow: snapshot.authorizedNow,
          });
        }
      }

      if (req.authUser.role !== 'admin') {
        const betaSnapshot = buildProfessionalRequestBetaSnapshot(snapshot, job);
        const consentResult = await requireActionConsents(pool, req, res, {
          jobId,
          actionKey: 'PROFESSIONAL_DISPATCH',
          userId: req.authUser.id,
          snapshotData: betaSnapshot,
          idempotencyPrefix: `PROFESSIONAL_DISPATCH:${req.authUser.id}:${jobId}:pay`,
        });
        if (!consentResult) return;
        const payAcceptanceId = (
          await pool.query(
            `SELECT id FROM homeowner_acceptances
             WHERE user_id=$1 AND job_id=$2 AND acceptance_type='PROFESSIONAL_REQUEST_BETA_ACK'
             ORDER BY accepted_at DESC LIMIT 1`,
            [req.authUser.id, jobId]
          )
        ).rows[0]?.id;
        await pool.query(
          `INSERT INTO payment_authorization_snapshots (
             user_id, job_id, authorized_amount_cents, currency, policy_document_version, acceptance_id
           ) VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            req.authUser.id,
            jobId,
            snapshot.authorizedNowCents,
            'usd',
            'homeowner_professional_request_beta_v1',
            payAcceptanceId || null,
          ]
        );
        await saveProfessionalDispatchSnapshot(pool, {
          jobId,
          userId: req.authUser.id,
          breakdown: snapshot,
        });
      }

      await pool.query(
        `UPDATE managed_jobs SET
           checkout_snapshot=$2::jsonb,
           service_fee_amount=$3,
           service_amount=$4,
           coupon_discount_amount=$5,
           final_customer_amount=$6,
           visit_fee_amount=$6,
           updated_at=NOW()
         WHERE id=$1`,
        [
          jobId,
          JSON.stringify(snapshot),
          snapshot.serviceFee,
          snapshot.serviceAmount,
          snapshot.couponDiscount,
          amount,
        ]
      );

      try {
        assertPaymentsAvailable();
      } catch (payErr) {
        return res.status(payErr.status || 503).json({
          ok: false,
          code: payErr.code || 'STRIPE_NOT_CONFIGURED',
          message: payErr.message || 'Payments are not configured.',
        });
      }

      const origin = req.get('origin') || req.get('referer');
      let checkout;
      try {
        checkout = await createCheckoutSession({
          amountCents: Math.round(amount * 100),
          customerEmail: req.authUser.email,
          description: `${brand.productName} Service Fee — ${snapshot.bookingId}`,
          successPath: `/?paid=dispatch&job=${jobId}`,
          cancelPath: `/?canceled=dispatch&job=${jobId}`,
          origin,
          metadata: {
            jobId: String(jobId),
            paymentType: 'dispatch_fee',
            userId: String(req.authUser.id),
            captureMethod: 'manual',
            finalAmount: String(amount),
            serviceFee: String(snapshot.serviceFee),
            couponCode: snapshot.couponCode || '',
          },
        });
      } catch (payErr) {
        console.error('pay-dispatch checkout:', payErr);
        return res.status(payErr.status || 502).json({
          ok: false,
          code: payErr.code || 'STRIPE_CHECKOUT_FAILED',
          message: payErr.message || 'Could not start Stripe checkout.',
        });
      }

      await pool.query(
        `INSERT INTO payments (job_id, user_id, payment_type, amount, status, stripe_session_id, simulated, meta)
         VALUES ($1,$2,'dispatch_fee',$3,'pending',$4,false,$5)`,
        [
          jobId,
          req.authUser.id,
          amount,
          checkout.sessionId,
          JSON.stringify({
            checkoutSnapshot: snapshot,
            dispatchDiscount: snapshot.couponCode
              ? {
                code: snapshot.couponCode,
                discountAmount: snapshot.couponDiscount,
                originalAmount: snapshot.serviceFee,
              }
              : null,
          }),
        ]
      );

      res.json({ ok: true, url: checkout.url, amount, snapshot });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── Admin invite / assign ──────────────────────────────────────────────────
  app.post('/api/admin/managed/jobs/:id/invite', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
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
      const gateOk = await enforceContractorDispatchGate(pool, contractors[0], res, job);
      if (!gateOk) return;
      const hoConsent = await assertHomeownerDispatchConsent(pool, job.homeowner_user_id, jobId);
      if (!hoConsent.ok) {
        return res.status(409).json({
          ok: false,
          code: 'HOMEOWNER_DISPATCH_CONSENT_REQUIRED',
          message: 'Homeowner dispatch acknowledgments are incomplete.',
          missingAcceptanceTypes: hoConsent.missing,
        });
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
      try {
        await createInAppNotification(pool, {
          userId: contractorUserId,
          userRole: 'contractor',
          jobId,
          type: 'job_invitation',
          title: 'Job invitation',
          message: `You've been invited to ${job.booking_id || `FB-${jobId}`}.`,
          entityType: 'job',
          entityId: jobId,
        });
      } catch {
        /* non-fatal */
      }
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

  app.post('/api/admin/managed/jobs/:id/assign', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
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
      const gateOk = await enforceContractorDispatchGate(pool, contractors[0], res, job);
      if (!gateOk) return;
      const hoConsent = await assertHomeownerDispatchConsent(pool, job.homeowner_user_id, jobId);
      if (!hoConsent.ok) {
        return res.status(409).json({
          ok: false,
          code: 'HOMEOWNER_DISPATCH_CONSENT_REQUIRED',
          message: 'Homeowner dispatch acknowledgments are incomplete.',
          missingAcceptanceTypes: hoConsent.missing,
        });
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

      const employeeId = req.body?.employeeId != null ? Number(req.body.employeeId) : null;
      if (employeeId) {
        const empCheck = await assertEmployeeAssignable(pool, employeeId, contractorUserId);
        if (!empCheck.ok) {
          return res.status(empCheck.status || 400).json({ ok: false, message: empCheck.message });
        }
        await pool.query(`UPDATE managed_jobs SET assigned_employee_id=$1 WHERE id=$2`, [employeeId, jobId]);
        await recordJobOperationalEvent(pool, {
          jobId,
          eventType: 'technician_assigned',
          contractorUserId,
          employeeId,
          actorUserId: req.authUser.id,
          detail: { employeeName: empCheck.employee?.full_name || null },
        });
      } else if (req.body?.clearEmployee === true) {
        await pool.query(`UPDATE managed_jobs SET assigned_employee_id=NULL WHERE id=$1`, [jobId]);
      }

      const current = rows[0].status;
      if (!['awaiting_bid', 'bid_received', 'proposal_sent', 'awaiting_customer_approval', 'approved', 'scheduled', 'work_started', 'work_completed', 'payout_pending', 'paid_out', 'closed'].includes(current)) {
        await pushStatus(pool, jobId, current, 'contractor_accepted', req.authUser.id, 'Contractor assigned');
        await pushStatus(pool, jobId, 'contractor_accepted', 'awaiting_bid', req.authUser.id, 'Awaiting confidential net bid');
      } else if (current === 'contractor_invited' || current === 'contractor_accepted') {
        await pushStatus(pool, jobId, current, 'awaiting_bid', req.authUser.id, 'Awaiting confidential net bid');
      }

      await audit(pool, req.authUser.id, 'contractor_assigned', 'managed_job', jobId, { contractorUserId });
      await recordJobOperationalEvent(pool, {
        jobId,
        eventType: 'contractor_assigned',
        contractorUserId,
        employeeId: employeeId || null,
        actorUserId: req.authUser.id,
        detail: { companyName: contractors[0].company_name || contractors[0].name || null },
      });

      const complianceDocs = await loadCurrentComplianceDocuments(pool, contractorUserId);
      const { rows: dispatchSnaps } = await pool.query(
        `SELECT id, authorized_now_cents FROM professional_dispatch_snapshots
         WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [jobId]
      );
      await recordJobDispatchEvidence(pool, {
        jobId,
        homeownerUserId: rows[0].homeowner_user_id,
        contractorUserId,
        professionalDispatchSnapshotId: dispatchSnaps[0]?.id || null,
        authorizedNowCents: dispatchSnaps[0]?.authorized_now_cents || rows[0].visit_fee_amount || null,
        complianceDocumentIds: complianceDocs.map((d) => Number(d.id)),
        complianceStatus: contractors[0].compliance_status || null,
      });

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

  // ── Contractor performance & reviews ───────────────────────────────────────
  app.get('/api/contractor/performance', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') {
        return res.status(403).json({ ok: false, message: 'Contractors only.' });
      }
      const contractorId = req.authUser.id;

      const { rows: reviewRows } = await pool.query(
        `SELECT sr.id, sr.author_name, sr.location, sr.service_type, sr.rating, sr.body,
                sr.verified, sr.created_at, sr.job_id,
                sr.rating_quality, sr.rating_communication, sr.rating_punctuality,
                sr.rating_cleanliness, sr.rating_value,
                mj.title AS job_title, mj.booking_id AS job_ref
         FROM site_reviews sr
         INNER JOIN managed_jobs mj ON mj.id = sr.job_id
         WHERE mj.assigned_contractor_user_id = $1 AND sr.published = TRUE
         ORDER BY sr.created_at DESC
         LIMIT 50`,
        [contractorId]
      );

      const reviews = reviewRows.map((r) => {
        const categories = {};
        if (r.rating_quality != null) categories.quality = Number(r.rating_quality);
        if (r.rating_communication != null) categories.communication = Number(r.rating_communication);
        if (r.rating_punctuality != null) categories.punctuality = Number(r.rating_punctuality);
        if (r.rating_cleanliness != null) categories.cleanliness = Number(r.rating_cleanliness);
        if (r.rating_value != null) categories.value = Number(r.rating_value);
        return {
          id: Number(r.id),
          authorName: r.author_name,
          location: r.location,
          serviceType: r.service_type,
          rating: Number(r.rating),
          text: r.body,
          verified: r.verified === true,
          verifiedFixBridgeJob: r.verified === true && r.job_id != null,
          categories: Object.keys(categories).length ? categories : null,
          createdAt: r.created_at,
          jobId: r.job_id != null ? Number(r.job_id) : null,
          jobTitle: r.job_title || null,
          jobRef: r.job_ref || (r.job_id ? `FB-${r.job_id}` : null),
        };
      });

      const reviewCount = reviews.length;
      const averageRating =
        reviewCount > 0
          ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount) * 10) / 10
          : null;
      const avg = (key) => {
        const vals = reviews.map((r) => r.categories?.[key]).filter((n) => n != null);
        if (!vals.length) return null;
        return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
      };

      res.json({
        ok: true,
        reviews,
        stats: {
          reviewCount,
          averageRating,
          categoryAverages: {
            quality: avg('quality'),
            communication: avg('communication'),
            punctuality: avg('punctuality'),
            cleanliness: avg('cleanliness'),
            value: avg('value'),
          },
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not load performance data.' });
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
        const { rows: jobRows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
        const job = jobRows[0];
        if (!job) return res.status(404).json({ ok: false, message: 'Job not found.' });

        const { rows: providerRows } = await pool.query(`SELECT * FROM users WHERE id=$1`, [req.authUser.id]);
        try {
          await createJobAuthorization(pool, {
            job,
            providerUser: providerRows[0],
            req,
          });
        } catch (authErr) {
          console.error('job authorization on accept:', authErr);
        }

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
      if (req.authUser.role !== 'admin' && req.authUser.role !== 'contractor') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      let q = `SELECT * FROM bids WHERE job_id=$1`;
      const params = [jobId];
      if (req.authUser.role !== 'admin') {
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
      const quote = computeCustomerQuoteFromBid(resolveContractorNetForQuote(bids[0], req.body), rules, {
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
  app.post('/api/admin/managed/jobs/:id/proposal', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
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

      const contractorNet = resolveContractorNetForQuote(bids[0], req.body);
      const quote = computeCustomerQuoteFromBid(contractorNet, rules, {
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

      const customerLineItems = Array.isArray(req.body?.customerLineItems) && req.body.customerLineItems.length
        ? req.body.customerLineItems
        : buildDefaultCustomerLineItems(quote, {
          adjustments,
          serviceCharge,
          couponCode,
          couponAmount,
          visitFeeCredit: 0,
        });

      const visitCredit = await getVisitFeeCreditForJob(pool, jobId);
      const billed = applyVisitFeeCredit(retail, visitCredit.amount);
      if (billed.visitFeeCredit > 0 && !req.body?.customerLineItems?.length) {
        customerLineItems.push({
          label: 'Visit fee credit (already paid)',
          amount: -billed.visitFeeCredit,
          visible: true,
        });
      }
      const amountDue =
        req.body?.depositAmount != null ? Number(req.body.depositAmount) : billed.amountDue;

      const { rows } = await pool.query(
        `INSERT INTO proposals
          (job_id, bid_id, scope_summary, retail_amount, deposit_amount, timeline, warranty, exclusions,
           contractor_net, platform_gross, processing_cost, status, created_by, published_at,
           line_items, pricing_adjustments, admin_discount, admin_discount_reason, coupon_code, coupon_funded_by,
           quote_valid_until, customer_line_items, service_charge, expected_margin_pct,
           customer_notes, terms_conditions, contractor_quote_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'sent',$12,NOW(),$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
         RETURNING *`,
        [
          jobId,
          bidId,
          req.body?.scopeSummary || jobs[0].description || jobs[0].title,
          billed.retail,
          amountDue,
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
          req.body?.customerNotes || null,
          req.body?.termsConditions || null,
          quote.contractorNet,
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
          metadata: { bidId, proposalId: rows[0].id, createdByName: req.authUser.name || req.authUser.email },
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
            template: 'repair_proposal_ready',
            data: {
              firstName: hw[0].name,
              jobTitle: jobs[0].title,
              jobId: jobs[0].id,
              viewUrl: `${(process.env.APP_URL || '').replace(/\/$/, '')}/homeowner?job=${jobs[0].id}`,
            },
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
        req.authUser.role === 'admin' ||
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

  app.get('/api/managed/jobs/:id/quote-options', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows: jobs } = await pool.query(`SELECT homeowner_user_id FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!jobs[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      const allowed =
        req.authUser.role === 'admin' ||
        Number(jobs[0].homeowner_user_id) === Number(req.authUser.id);
      if (!allowed) return res.status(403).json({ ok: false, message: 'Not allowed.' });

      const { rows } = await pool.query(
        `SELECT * FROM proposals
         WHERE job_id=$1
           AND status IN ('sent','viewed','accepted','approved')
           AND COALESCE(status,'') != 'superseded'
         ORDER BY quote_option_label NULLS LAST, published_at DESC NULLS LAST`,
        [jobId],
      );
      const options = rows.map((r) => serializeProposal(r, req.authUser));
      const labeled = options.filter((o) => o.quoteOptionLabel || o.optionGroup);
      const hasAlternatives = labeled.length > 1;
      return res.json({ ok: true, options, hasAlternatives });
    } catch (e) {
      return res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.post('/api/managed/jobs/:id/approve-proposal', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
      const jobId = Number(req.params.id);
      const { rows: jobs } = await client.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!jobs[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      if (Number(jobs[0].homeowner_user_id) !== Number(req.authUser.id) && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }

      const proposalId = Number(req.body?.proposalId || jobs[0].active_proposal_id || 0);
      let prop = null;
      if (proposalId > 0) {
        const { rows: byId } = await client.query(
          `SELECT * FROM proposals WHERE id=$1 AND job_id=$2`,
          [proposalId, jobId]
        );
        prop = byId[0] || null;
      }
      if (!prop) {
        const { rows: props } = await client.query(
          `SELECT * FROM proposals
           WHERE job_id=$1
             AND status IN ('sent','viewed')
           ORDER BY published_at DESC NULLS LAST, created_at DESC
           LIMIT 1`,
          [jobId]
        );
        prop = props[0] || null;
      }
      if (!prop) {
        return res.status(400).json({ ok: false, message: 'No active quote available for approval.' });
      }

      const propStatus = String(prop.status || '').toLowerCase();
      if (['superseded', 'converted', 'canceled', 'cancelled', 'declined', 'expired'].includes(propStatus)) {
        return res.status(409).json({
          ok: false,
          code: 'quote_not_active',
          message:
            propStatus === 'superseded'
              ? 'This quote has been superseded by a newer version. Please review the latest quote.'
              : 'This quote is no longer available for approval.',
        });
      }
      if (!['sent', 'viewed', 'accepted', 'approved'].includes(propStatus)) {
        return res.status(409).json({
          ok: false,
          code: 'quote_not_sent',
          message: 'This quote has not been sent for your review yet.',
        });
      }

      if (req.authUser.role !== 'admin') {
        const ackOk = await requireHomeownerAcknowledgment(pool, req, res, {
          jobId,
          quoteId: prop.id,
          actionKey: 'QUOTE_APPROVAL',
          message: 'You must agree to the service agreement and approve the quote scope and total.',
        });
        if (!ackOk) return;
      }

      const versionNumber = Number(prop.version_number || 1);

      const validUntil = prop.quote_valid_until ? new Date(prop.quote_valid_until) : null;
      if (validUntil && validUntil.getTime() < Date.now()) {
        await client.query(`UPDATE proposals SET status='expired' WHERE id=$1 AND status NOT IN ('accepted','converted','paid')`, [
          prop.id,
        ]);
        return res.status(409).json({
          ok: false,
          code: 'quote_expired',
          message: 'This quote has expired. Contact FixBridge for an updated quote.',
        });
      }

      await client.query('BEGIN');
      const { rows: lockedProps } = await client.query(`SELECT * FROM proposals WHERE id=$1 FOR UPDATE`, [prop.id]);
      prop = lockedProps[0];
      if (!prop) {
        await client.query('ROLLBACK');
        return res.status(404).json({ ok: false, message: 'Quote not found.' });
      }
      if (prop.converted_invoice_id) {
        const { rows: existingInv } = await client.query(`SELECT * FROM homeowner_invoices WHERE id=$1`, [
          prop.converted_invoice_id,
        ]);
        await client.query('COMMIT');
        return res.json({
          ok: true,
          alreadyAccepted: true,
          proposal: serializeProposal(prop, req.authUser),
          invoice: existingInv[0]
            ? {
              id: Number(existingInv[0].id),
              invoiceNumber: existingInv[0].invoice_number,
              total: Number(existingInv[0].total || existingInv[0].amount_due) || 0,
              status: existingInv[0].status,
            }
            : null,
        });
      }

      const totals =
        typeof prop.document_totals === 'string'
          ? JSON.parse(prop.document_totals || '{}')
          : prop.document_totals || {};
      const lineItems = prop.customer_line_items || prop.line_items || [];
      const { rows: snapRows } = await client.query(
        `INSERT INTO quote_acceptance_snapshots (
           proposal_id, quote_number, version_number, homeowner_user_id, job_id, contractor_user_id,
           line_items, subtotal, discount_amount, shipping_amount, additional_charges, tax_amount, total,
           contractor_amount, terms, warranty, customer_notes, document_snapshot, accepted_by
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
         ) RETURNING id`,
        [
          prop.id,
          prop.quote_number || null,
          versionNumber,
          jobs[0].homeowner_user_id,
          jobId,
          jobs[0].assigned_contractor_user_id || null,
          JSON.stringify(lineItems),
          totals.subtotal ?? prop.retail_amount ?? null,
          totals.discountAmount ?? prop.admin_discount ?? null,
          totals.shippingAmount ?? prop.shipping_amount ?? null,
          null,
          totals.taxAmount ?? null,
          totals.total ?? prop.retail_amount ?? null,
          prop.contractor_quote_amount ?? prop.contractor_net ?? null,
          prop.terms_conditions || null,
          prop.warranty || null,
          prop.customer_notes || null,
          JSON.stringify({ ...prop, document_totals: totals }),
          req.authUser.id,
        ]
      );
      await client.query(
        `UPDATE proposals SET
           status='accepted',
           approved_at=NOW(),
           locked_at=COALESCE(locked_at, NOW()),
           accepted_snapshot_id=$1,
           option_selection_status='accepted'
         WHERE id=$2`,
        [snapRows[0].id, prop.id]
      );
      if (prop.option_group) {
        await client.query(
          `UPDATE proposals SET
             status='declined',
             option_selection_status='not_selected'
           WHERE job_id=$1 AND option_group=$2 AND id != $3
             AND status IN ('sent','viewed')`,
          [jobId, prop.option_group, prop.id],
        );
      }
      prop = { ...prop, status: 'accepted', accepted_snapshot_id: snapRows[0].id };
      await client.query(
        `UPDATE homeowner_acceptances
         SET snapshot_id=$1,
             snapshot_data=COALESCE(snapshot_data, $2::jsonb)
         WHERE job_id=$3 AND user_id=$4
           AND acceptance_type IN ('QUOTE_SCOPE_APPROVAL', 'HOMEOWNER_SERVICE_AGREEMENT', 'PAYMENT_VISIT_POLICY')
           AND snapshot_id IS NULL
           AND accepted_at >= NOW() - INTERVAL '5 minutes'`,
        [
          snapRows[0].id,
          JSON.stringify({ quoteSnapshotId: snapRows[0].id, proposalId: prop.id, total: totals.total ?? prop.retail_amount }),
          jobId,
          req.authUser.id,
        ]
      );
      await pushStatus(pool, jobId, jobs[0].status, 'approved', req.authUser.id, 'Customer approved proposal');

      const convertResult = await convertProposalToInvoice(client, {
        proposalRow: prop,
        actorUserId: req.authUser.id,
      });
      if (!convertResult.ok) {
        await client.query('ROLLBACK');
        return res.status(convertResult.status || 500).json({
          ok: false,
          code: convertResult.code,
          message: convertResult.message || 'Quote accepted but invoice could not be created.',
        });
      }
      await client.query('COMMIT');

      await notifyAdminsHomeownerApprovedQuote(pool, {
        job: jobs[0],
        homeowner: req.authUser,
        proposal: prop,
      });
      try {
        const inv = convertResult.invoice;
        if (inv && jobs[0].homeowner_user_id && !convertResult.alreadyConverted) {
          await createInAppNotification(pool, {
            userId: jobs[0].homeowner_user_id,
            userRole: 'homeowner',
            jobId,
            type: 'invoice_created',
            title: 'Invoice created',
            message: `Invoice ${inv.invoiceNumber || ''} is ready.`,
            entityType: 'invoice',
            entityId: inv.id,
            metadata: { quoteId: prop.id, versionNumber },
          });
        }
      } catch {
        /* non-fatal */
      }

      res.json({
        ok: true,
        proposal: serializeProposal(
          {
            ...prop,
            status: 'accepted',
            locked_at: new Date().toISOString(),
            accepted_snapshot_id: snapRows[0].id,
            converted_invoice_id: convertResult.invoiceRow?.id || prop.converted_invoice_id,
          },
          req.authUser
        ),
        invoice: convertResult.invoice || null,
        alreadyAccepted: convertResult.alreadyConverted === true,
      });
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      console.error('approve-proposal:', e);
      res.status(500).json({ ok: false, message: 'Server error' });
    } finally {
      client.release();
    }
  });

  app.post('/api/admin/managed/jobs/:id/request-dispatch', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Job not found.' });
      const job = rows[0];
      if (job.status !== 'approved') {
        return res.status(400).json({
          ok: false,
          message: 'Dispatch can only be requested after the homeowner approves the final quote.',
        });
      }
      if (!job.assigned_contractor_user_id) {
        return res.status(400).json({ ok: false, message: 'Assign a contractor before requesting dispatch.' });
      }

      await pushStatus(pool, jobId, job.status, 'scheduled', req.authUser.id, 'Admin requested contractor dispatch');

      try {
        const { rows: contractors } = await pool.query(`SELECT email, name FROM users WHERE id=$1`, [
          job.assigned_contractor_user_id,
        ]);
        if (contractors[0]?.email) {
          await sendNotificationEmail({
            to: contractors[0].email,
            template: 'dispatch_approved',
            data: {
              firstName: contractors[0].name,
              jobNumber: job.booking_id || `Job #${jobId}`,
              service: job.title || job.category,
              viewUrl: `${(process.env.APP_URL || '').replace(/\/$/, '')}/?job=${jobId}`,
            },
          });
        }
      } catch (_e) {
        /* non-fatal */
      }

      const { rows: fresh } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      res.json({ ok: true, job: serializeJob(fresh[0], req.authUser) });
    } catch (e) {
      console.error('request-dispatch:', e);
      res.status(500).json({ ok: false, message: 'Could not request dispatch.' });
    }
  });

  app.post('/api/managed/jobs/:id/pay-retail', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!jobs[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      const job = jobs[0];
      if (Number(job.homeowner_user_id) !== Number(req.authUser.id) && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      if (!['customer_review_pending', 'work_completed'].includes(job.status)) {
        return res.status(400).json({
          ok: false,
          message: 'Payment is available after the contractor marks the job complete.',
        });
      }
      if (await hasSucceededRetailPayment(pool, jobId)) {
        return res.status(400).json({ ok: false, message: 'This job has already been paid.' });
      }
      const { rows: props } = await pool.query(
        `SELECT * FROM proposals WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [jobId]
      );
      if (!props[0]) return res.status(400).json({ ok: false, message: 'No proposal.' });

      const retail = Number(props[0].retail_amount) || 0;
      const visitCredit = await getVisitFeeCreditForJob(pool, jobId);
      const billed = applyVisitFeeCredit(retail, visitCredit.amount);
      const amount =
        props[0].deposit_amount != null && Number(props[0].deposit_amount) >= 0
          ? Number(props[0].deposit_amount)
          : billed.amountDue;

      if (req.authUser.role !== 'admin') {
        const ackOk = await requireHomeownerAcknowledgment(pool, req, res, {
          jobId,
          actionKey: 'PAYMENT_AUTHORIZATION',
          message: 'You must authorize the payment amount under the stated cancellation/refund rules.',
          snapshotData: {
            authorizedAmountCents: Math.round(amount * 100),
            currency: 'usd',
            proposalId: props[0].id,
            retailAmount: retail,
          },
        });
        if (!ackOk) return;
        await pool.query(
          `INSERT INTO payment_authorization_snapshots (
             user_id, job_id, authorized_amount_cents, currency, policy_document_version
           ) VALUES ($1,$2,$3,$4,$5)`,
          [req.authUser.id, jobId, Math.round(amount * 100), 'usd', '1.0']
        );
      }

      try {
        assertPaymentsAvailable();
      } catch (payErr) {
        return res.status(payErr.status || 503).json({
          ok: false,
          code: payErr.code || 'STRIPE_NOT_CONFIGURED',
          message: payErr.message || 'Payments are not configured.',
        });
      }

      const origin = req.get('origin') || req.get('referer');
      let checkout;
      try {
        checkout = await createCheckoutSession({
          amountCents: Math.round(amount * 100),
          customerEmail: req.authUser.email,
          description: `${brand.productName} repair payment${billed.visitFeeCredit > 0 ? ` (visit fee credit −$${billed.visitFeeCredit.toFixed(2)})` : ''
            }`,
          successPath: `/?paid=retail&job=${jobId}`,
          cancelPath: `/?canceled=retail&job=${jobId}`,
          origin,
          metadata: {
            jobId: String(jobId),
            paymentType: 'retail_payment',
            userId: String(req.authUser.id),
            visitFeeCredit: String(billed.visitFeeCredit),
          },
        });
      } catch (payErr) {
        console.error('pay-retail checkout:', payErr);
        return res.status(payErr.status || 502).json({
          ok: false,
          code: payErr.code || 'STRIPE_CHECKOUT_FAILED',
          message: payErr.message || 'Could not start Stripe checkout.',
        });
      }

      await pool.query(
        `INSERT INTO payments (job_id, user_id, payment_type, amount, status, stripe_session_id, simulated, meta)
         VALUES ($1,$2,'retail_payment',$3,'pending',$4,false,$5)`,
        [
          jobId,
          req.authUser.id,
          amount,
          checkout.sessionId,
          JSON.stringify({ retail, visitFeeCredit: billed.visitFeeCredit, amountDue: amount }),
        ]
      );
      res.json({
        ok: true,
        url: checkout.url,
        amount,
        retail,
        visitFeeCredit: billed.visitFeeCredit,
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── Job progress / completion ──────────────────────────────────────────────
  app.get('/api/managed/jobs/:id/timeline', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!jobs[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      const job = jobs[0];
      const isAdmin = req.authUser.role === 'admin';
      const isOwner = Number(job.homeowner_user_id) === Number(req.authUser.id);
      const isContractor = Number(job.assigned_contractor_user_id) === Number(req.authUser.id);
      if (!isAdmin && !isOwner && !isContractor) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const timeline = await loadJobTimeline(pool, jobId);
      res.json({ ok: true, timeline });
    } catch (e) {
      console.error('job timeline:', e);
      res.status(500).json({ ok: false, message: 'Could not load timeline.' });
    }
  });

  async function markOperationalMilestone(req, res, { toStatus, eventType, note }) {
    try {
      const jobId = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      const job = rows[0];
      const isAdmin = req.authUser.role === 'admin';
      const isContractor = Number(job.assigned_contractor_user_id) === Number(req.authUser.id);
      if (!isAdmin && !isContractor) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const employeeId =
        req.body?.employeeId != null
          ? Number(req.body.employeeId)
          : job.assigned_employee_id != null
            ? Number(job.assigned_employee_id)
            : null;
      if (employeeId && isContractor) {
        const empCheck = await assertEmployeeAssignable(pool, employeeId, req.authUser.id);
        if (!empCheck.ok) {
          return res.status(empCheck.status || 400).json({ ok: false, message: empCheck.message });
        }
        await pool.query(`UPDATE managed_jobs SET assigned_employee_id=$1 WHERE id=$2`, [employeeId, jobId]);
      }
      await pushStatus(pool, jobId, job.status, toStatus, req.authUser.id, note || null);
      await recordJobOperationalEvent(pool, {
        jobId,
        eventType,
        contractorUserId: job.assigned_contractor_user_id,
        employeeId,
        actorUserId: req.authUser.id,
        detail: req.body?.detail || {},
      });
      const fresh = await fetchJobWithTech(pool, jobId);
      res.json({ ok: true, job: serializeJob(fresh, req.authUser) });
    } catch (e) {
      console.error(`${eventType}:`, e);
      res.status(500).json({ ok: false, message: 'Could not update job.' });
    }
  }

  app.post('/api/admin/managed/jobs/:id/mark-dispatched', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    await markOperationalMilestone(req, res, {
      toStatus: 'contractor_en_route',
      eventType: 'contractor_dispatched',
      note: 'Contractor dispatched',
    });
  });

  app.post('/api/admin/managed/jobs/:id/mark-started', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    await markOperationalMilestone(req, res, {
      toStatus: 'work_started',
      eventType: 'job_started',
      note: 'Job started',
    });
  });

  app.post('/api/admin/managed/jobs/:id/mark-completed', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    await markOperationalMilestone(req, res, {
      toStatus: 'work_completed',
      eventType: 'job_completed',
      note: 'Job completed',
    });
  });

  app.post('/api/contractor/managed/jobs/:id/assign-technician', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const employeeId = Number(req.body?.employeeId);
      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      if (Number(rows[0].assigned_contractor_user_id) !== Number(req.authUser.id)) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      if (!Number.isFinite(employeeId) || employeeId <= 0) {
        return res.status(400).json({ ok: false, message: 'Select a technician.' });
      }
      const empCheck = await assertEmployeeAssignable(pool, employeeId, req.authUser.id);
      if (!empCheck.ok) {
        return res.status(empCheck.status || 400).json({ ok: false, message: empCheck.message });
      }
      await pool.query(`UPDATE managed_jobs SET assigned_employee_id=$1, updated_at=NOW() WHERE id=$2`, [
        employeeId,
        jobId,
      ]);
      await recordJobOperationalEvent(pool, {
        jobId,
        eventType: 'technician_assigned',
        contractorUserId: req.authUser.id,
        employeeId,
        actorUserId: req.authUser.id,
        detail: { employeeName: empCheck.employee?.full_name || null },
      });
      const fresh = await fetchJobWithTech(pool, jobId);
      res.json({ ok: true, job: serializeJob(fresh, req.authUser) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not assign technician.' });
    }
  });

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

  async function recordContractorMilestone(req, res, { eventType, toStatus = null, note = null }) {
    try {
      const jobId = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      const job = rows[0];
      if (Number(job.assigned_contractor_user_id) !== Number(req.authUser.id) && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const employeeId = job.assigned_employee_id != null ? Number(job.assigned_employee_id) : null;
      if (toStatus) {
        const allowedNext = CONTRACTOR_STATUS_TRANSITIONS[job.status] || [];
        const isAdmin = req.authUser.role === 'admin';
        if (!isAdmin && !allowedNext.includes(toStatus)) {
          return res.status(400).json({
            ok: false,
            message: `Cannot move job from "${job.status}" to "${toStatus}".`,
          });
        }
        await pushStatus(pool, jobId, job.status, toStatus, req.authUser.id, note || null);
      }
      await recordJobOperationalEvent(pool, {
        jobId,
        eventType,
        contractorUserId: job.assigned_contractor_user_id,
        employeeId,
        actorUserId: req.authUser.id,
        detail: req.body?.detail || {},
      });
      const fresh = await fetchJobWithTech(pool, jobId);
      res.json({ ok: true, job: serializeJob(fresh, req.authUser) });
    } catch (e) {
      console.error(eventType, e);
      res.status(500).json({ ok: false, message: 'Could not update job.' });
    }
  }

  app.post('/api/contractor/managed/jobs/:id/mark-travel', requireAuth, async (req, res) => {
    await recordContractorMilestone(req, res, {
      eventType: 'contractor_dispatched',
      toStatus: 'contractor_en_route',
      note: 'Technician en route',
    });
  });

  app.post('/api/contractor/managed/jobs/:id/mark-arrived', requireAuth, async (req, res) => {
    await recordContractorMilestone(req, res, {
      eventType: 'technician_arrived',
      note: 'Technician arrived on site',
    });
  });

  app.post('/api/contractor/managed/jobs/:id/mark-started', requireAuth, async (req, res) => {
    await recordContractorMilestone(req, res, {
      eventType: 'job_started',
      toStatus: 'work_started',
      note: 'Job started',
    });
  });

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
      const isAdmin = req.authUser.role === 'admin';

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

      if (TERMINAL_JOB_STATUSES.has(toStatus)) {
        try {
          await cancelServiceReminderForJob(pool, jobId);
        } catch (_e) {
          /* non-fatal */
        }
      }

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
      const isAdmin = req.authUser.role === 'admin';
      if (!isContractor && !isAdmin) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const structuredRaw = req.body?.structuredEquipment || req.body?.equipmentUpdate || null;
      const structuredEquipment = structuredRaw
        ? normalizeStructuredEquipment(job, structuredRaw)
        : null;

      const report = {
        summary: req.body?.summary || '',
        materialsUsed: req.body?.materialsUsed || '',
        beforePhotoUrl: req.body?.beforePhotoUrl || null,
        afterPhotoUrl: req.body?.afterPhotoUrl || null,
        equipmentLabelPhotoUrl: req.body?.equipmentLabelPhotoUrl || null,
        warranty: req.body?.warranty || '',
        healthUpdate: req.body?.healthUpdate || null,
        structuredEquipment: hasStructuredEquipmentData(structuredEquipment) ? structuredEquipment : null,
        completedAt: new Date().toISOString(),
        completedBy: {
          userId: req.authUser.id,
          role: isAdmin ? 'admin' : 'contractor',
          at: new Date().toISOString(),
        },
      };
      await pool.query(
        `UPDATE managed_jobs SET completion_report=$1, updated_at=NOW() WHERE id=$2`,
        [JSON.stringify(report), jobId]
      );
      const completionNote = isAdmin
        ? `Work completed by admin (user ${req.authUser.id})`
        : 'Work completed with proof';
      await pushStatus(pool, jobId, job.status, 'work_completed', req.authUser.id, completionNote);
      await pushStatus(pool, jobId, 'work_completed', 'customer_review_pending', req.authUser.id, 'Awaiting customer confirmation');

      try {
        await syncPropertyHistoryFromCompletedJob(pool, { ...job, completion_report: JSON.stringify(report) }, report);
      } catch (_e) {
        /* non-fatal */
      }

      try {
        if (!hasStructuredEquipmentData(structuredEquipment) && report.equipmentLabelPhotoUrl) {
          await maybeCreateEquipmentSuggestionFromLabelPhoto(pool, job, report);
        }
      } catch (_e) {
        /* non-fatal — structured equipment suggestions handled in syncPropertyHistoryFromCompletedJob */
      }

      try {
        await cancelServiceReminderForJob(pool, jobId);
      } catch (_e) {
        /* non-fatal */
      }

      const isRecurring =
        job.source_recurring_service_id != null ||
        /recurring|cleaning|landscap/i.test(String(job.title || job.category || ''));
      const serviceLabel = isRecurring
        ? job.title?.toLowerCase().includes('landscap')
          ? 'landscaping service'
          : job.title?.toLowerCase().includes('clean')
            ? 'cleaning service'
            : 'home service'
        : job.title || 'service';
      const appUrl = process.env.APP_URL || 'https://fixbridge.netlify.app';
      const jobLink = `${appUrl}/?job=${jobId}`;
      const photoNote =
        report.beforePhotoUrl || report.afterPhotoUrl
          ? `<p><a href="${jobLink}">View before &amp; after photos</a></p>`
          : '';

      try {
        const { rows: hw } = await pool.query('SELECT email, name FROM users WHERE id=$1', [job.homeowner_user_id]);
        if (hw[0]) {
          await sendNotificationEmail({
            to: hw[0].email,
            template: 'job_completed',
            data: {
              firstName: hw[0].name,
              service: serviceLabel,
              property: job.city_state_zip || job.full_address,
              contractorName: null,
              completedAt: new Date().toISOString(),
              viewUrl: jobLink,
            },
          });
        }
        await recordJobOperationalEvent(pool, {
          jobId,
          eventType: 'job_completed',
          contractorUserId: job.assigned_contractor_user_id,
          employeeId: job.assigned_employee_id || null,
          actorUserId: req.authUser.id,
          detail: { summary: report.summary || null },
        });
      } catch (_e) {
        /* non-fatal */
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
      if (Number(rows[0].homeowner_user_id) !== Number(req.authUser.id) && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      await pool.query(`UPDATE managed_jobs SET customer_confirmed_at=NOW() WHERE id=$1`, [jobId]);

      if (await hasSucceededRetailPayment(pool, jobId)) {
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
      }

      // Optional job review — verified status derived server-side only
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
      let publishedReview = null;
      if (Number.isFinite(rating) && rating >= 1 && rating <= 5) {
        try {
          const access = await loadJobForReview(pool, jobId, req.authUser.id);
          if (access.ok) {
            const { rows: existing } = await pool.query(
              `SELECT id FROM site_reviews WHERE user_id=$1 AND job_id=$2 LIMIT 1`,
              [req.authUser.id, jobId]
            );
            if (!existing.length) {
              const categories = parseCategoryRatings(req.body);
              publishedReview = await insertJobReview(pool, {
                job: access.job,
                homeownerUser: req.authUser,
                rating,
                body: reviewText || '',
                location: location || 'Local area',
                serviceType: String(rows[0].category || 'Home repair').slice(0, 60),
                imagesJson,
                categories,
              });
            } else {
              const { rows: revRows } = await pool.query(`SELECT * FROM site_reviews WHERE id=$1`, [existing[0].id]);
              publishedReview = revRows[0] || null;
            }
          }
        } catch (revErr) {
          console.warn('confirm-completion review publish:', revErr.message);
        }
      }

      const { rows: fresh } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      const reviewPayload = publishedReview
        ? {
          id: Number(publishedReview.id),
          rating: Number(publishedReview.rating),
          verified: publishedReview.verified === true,
          verifiedFixBridgeJob: publishedReview.verified === true && publishedReview.job_id != null,
          categories: parseCategoryRatings({
            categories: {
              quality: publishedReview.rating_quality,
              communication: publishedReview.rating_communication,
              punctuality: publishedReview.rating_punctuality,
              cleanliness: publishedReview.rating_cleanliness,
              value: publishedReview.rating_value,
            },
          }),
        }
        : null;
      res.json({ ok: true, job: serializeJob(fresh[0], req.authUser), review: reviewPayload });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── Admin payout (P0: legacy direct-transfer DISABLED — ledger path only) ──
  app.post('/api/admin/managed/jobs/:id/payout', requireAuth, requireAdmin, requireAdminWrite, need('payouts.approve'), async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      if (!Number.isFinite(jobId) || jobId <= 0) {
        return res.status(400).json({ ok: false, message: 'Invalid job.' });
      }
      const payout = await ensurePayoutRecordForJob(pool, jobId, {
        initialStatus: PAYOUT_STATUS.PENDING_APPROVAL,
        actorUserId: req.authUser.id,
      });
      if (!payout) {
        return res.status(400).json({
          ok: false,
          code: 'PAYOUT_UNAVAILABLE',
          message: 'Could not create payout record. Assign a contractor first.',
        });
      }
      if (payout.status === 'on_hold' || payout.status === PAYOUT_STATUS.ON_HOLD) {
        return res.status(409).json({
          ok: false,
          code: 'PAYOUT_ON_HOLD',
          message: payout.hold_reason || 'Payout is on hold due to payment risk.',
        });
      }
      const result = await approveAndReleasePayout(pool, payout.id, req.authUser.id, {
        adjustmentsCents: 0,
        note: req.body?.note || 'Released via unified payout path (legacy endpoint redirected)',
      });
      if (!result.ok) return res.status(400).json(result);
      const { rows: fresh } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      return res.json({
        ok: true,
        deprecatedEndpoint: true,
        message: 'Legacy payout endpoint redirected to ledger-backed payout flow.',
        simulated: result.simulated,
        amount: Number(result.payout?.net_amount_cents || 0) / 100,
        transferId: result.transferId,
        payout: result.payout,
        job: fresh[0] ? serializeJob(fresh[0], req.authUser) : null,
      });
    } catch (e) {
      console.error('[payout legacy->v2]', e);
      res.status(500).json({ ok: false, message: 'Could not release payout.' });
    }
  });

  // ── AI override (plain-English admin controls + price markup) ──────────────
  app.put('/api/admin/managed/jobs/:id/ai-override', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
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
          [accountId, 'pending', req.authUser.id]
        );
      }
      const link = await createConnectAccountLink(
        accountId,
        '/?stripe=refresh',
        '/?stripe=return'
      );
      if (!link.url) {
        return res.status(502).json({ ok: false, message: 'Could not create Stripe onboarding link.' });
      }
      res.json({ ok: true, url: link.url, accountId });
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

  app.put('/api/admin/contractors/:id/compliance', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
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

      const delivery = await sendEmailSafe({
        to,
        template: 'contractor_info_request',
        data: {
          firstName: contractor.name,
          message: `Our team needs updated information on your ${brand.productName} contractor profile.\n\nPlease update the following:\n${items.join('\n')}${note ? `\n\nNote from staff: ${note}` : ''}`,
        },
      });
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
      console.error('partner lookup:', e);
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.get('/api/admin/partners', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM partners WHERE deleted_at IS NULL ORDER BY created_at DESC`
      );
      const appUrl = process.env.APP_URL || brand.domain;
      res.json({
        ok: true,
        partners: rows.map((p) => ({
          ...p,
          active: p.active !== false,
          intakeUrl: intakeShareUrl(p.code, appUrl),
        })),
        statusLabels: PARTNER_STATUS_LABELS,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Unable to load referral codes.' });
    }
  });

  app.post('/api/admin/partners', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const requested = req.body?.code != null ? String(req.body.code) : '';
      const code = requested.trim()
        ? normalizePartnerCode(requested)
        : crypto.randomBytes(4).toString('hex').toUpperCase();
      if (!code || code.length < 3) {
        return res.status(400).json({ ok: false, message: 'Enter a referral code with at least 3 characters.' });
      }
      if (requested.trim() && normalizePartnerCode(requested) !== requested.trim().toUpperCase()) {
        return res.status(400).json({
          ok: false,
          message: 'Referral codes cannot contain spaces or special characters.',
        });
      }
      const name = String(req.body?.name || req.body?.label || '').trim().slice(0, 160) || 'Partner';
      const notes = String(req.body?.notes || '').trim().slice(0, 500) || null;
      const existing = await pool.query(
        `SELECT id, deleted_at FROM partners WHERE LOWER(code)=LOWER($1) LIMIT 1`,
        [code]
      );
      if (existing.rows[0]) {
        return res.status(400).json({ ok: false, message: 'This referral code already exists.' });
      }
      const { rows } = await pool.query(
        `INSERT INTO partners (code, name, company, email, phone, notes, active)
         VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING *`,
        [
          code,
          name,
          req.body?.company || null,
          req.body?.email || null,
          req.body?.phone || null,
          notes,
        ]
      );
      await audit(pool, req.authUser.id, 'referral_code_created', 'partner', rows[0].id, { code });
      const appUrl = process.env.APP_URL || brand.domain;
      res.json({
        ok: true,
        partner: { ...rows[0], active: true, intakeUrl: intakeShareUrl(rows[0].code, appUrl) },
      });
    } catch (e) {
      if (String(e.code) === '23505' || String(e.message || '').toLowerCase().includes('unique')) {
        return res.status(400).json({ ok: false, message: 'This referral code already exists.' });
      }
      console.error(e);
      res.status(500).json({ ok: false, message: 'Unable to create referral code.' });
    }
  });

  app.put('/api/admin/partners/:id', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM partners WHERE id=$1`, [id]);
      if (!rows[0] || rows[0].deleted_at) {
        return res.status(404).json({ ok: false, message: 'Referral code not found.' });
      }
      if (typeof req.body?.active !== 'boolean') {
        return res.status(400).json({ ok: false, message: 'Unable to update referral code.' });
      }
      const active = req.body.active;
      await pool.query(`UPDATE partners SET active=$1 WHERE id=$2`, [active, id]);
      await audit(
        pool,
        req.authUser.id,
        active ? 'referral_code_activated' : 'referral_code_deactivated',
        'partner',
        id,
        { code: rows[0].code, active }
      );
      res.json({ ok: true, active });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Unable to update referral code.' });
    }
  });

  app.delete('/api/admin/partners/:id', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM partners WHERE id=$1`, [id]);
      if (!rows[0] || rows[0].deleted_at) {
        return res.status(404).json({ ok: false, message: 'Referral code not found.' });
      }
      const used = await pool.query(
        `SELECT COUNT(*)::int AS n FROM partner_referrals WHERE partner_id=$1 OR LOWER(partner_code)=LOWER($2)`,
        [id, rows[0].code]
      );
      const usage = Number(used.rows[0]?.n || 0);
      if (usage > 0) {
        await pool.query(`UPDATE partners SET deleted_at=NOW(), active=false WHERE id=$1`, [id]);
      } else {
        await pool.query(`DELETE FROM partners WHERE id=$1`, [id]);
      }
      await audit(pool, req.authUser.id, 'referral_code_deleted', 'partner', id, {
        code: rows[0].code,
        archived: usage > 0,
      });
      res.json({ ok: true, archived: usage > 0 });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Unable to delete referral code.' });
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

  function mapDiscountAdmin(d) {
    return {
      id: Number(d.id),
      code: d.code,
      label: d.label,
      notes: d.notes || null,
      discountType: d.discount_type,
      value: Number(d.value),
      active: d.active !== false,
      maxUses: d.max_uses != null ? Number(d.max_uses) : null,
      usesCount: Number(d.uses_count || 0),
      perUserLimit: d.per_user_limit != null ? Number(d.per_user_limit) : null,
      startsAt: d.starts_at,
      expiresAt: d.expires_at,
      createdAt: d.created_at,
    };
  }

  function parseOptionalDate(value) {
    if (value == null || value === '') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'invalid' : date;
  }

  app.get('/api/admin/discounts', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM discount_codes WHERE deleted_at IS NULL ORDER BY created_at DESC`
      );
      res.json({
        ok: true,
        discounts: rows.map(mapDiscountAdmin),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Unable to load referral codes.' });
    }
  });

  app.post('/api/admin/discounts', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const rawCode = String(req.body?.code || '');
      const code = normalizeDiscountCode(rawCode);
      if (!code || code.length < 3) {
        return res.status(400).json({ ok: false, message: 'Enter a referral code with at least 3 characters.' });
      }
      if (rawCode.trim() && code !== rawCode.trim().toUpperCase()) {
        return res.status(400).json({
          ok: false,
          message: 'Referral codes cannot contain spaces or special characters.',
        });
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
      const notes = String(req.body?.notes || '').trim().slice(0, 500) || null;
      const maxUses = req.body?.maxUses != null && req.body.maxUses !== '' ? Number(req.body.maxUses) : null;
      if (maxUses != null && (!Number.isFinite(maxUses) || maxUses < 0)) {
        return res.status(400).json({ ok: false, message: 'Usage limit must be zero or greater.' });
      }
      const perUserLimit =
        req.body?.perUserLimit != null && req.body.perUserLimit !== '' ? Number(req.body.perUserLimit) : null;
      if (perUserLimit != null && (!Number.isFinite(perUserLimit) || perUserLimit < 0)) {
        return res.status(400).json({ ok: false, message: 'Per-user limit must be zero or greater.' });
      }
      const startsAt = parseOptionalDate(req.body?.startsAt);
      const expiresAt = parseOptionalDate(req.body?.expiresAt);
      if (startsAt === 'invalid' || expiresAt === 'invalid') {
        return res.status(400).json({ ok: false, message: 'Enter a valid start and end date.' });
      }
      if (startsAt && expiresAt && expiresAt.getTime() < startsAt.getTime()) {
        return res.status(400).json({ ok: false, message: 'End date cannot be before the start date.' });
      }
      const existing = await pool.query(
        `SELECT id FROM discount_codes WHERE LOWER(code)=LOWER($1) LIMIT 1`,
        [code]
      );
      if (existing.rows[0]) {
        return res.status(400).json({ ok: false, message: 'This referral code already exists.' });
      }
      const active = req.body?.active !== false;
      const { rows } = await pool.query(
        `INSERT INTO discount_codes
           (code, label, notes, discount_type, value, active, max_uses, per_user_limit, starts_at, expires_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          code,
          label,
          notes,
          discountType,
          value,
          active,
          Number.isFinite(maxUses) && maxUses > 0 ? maxUses : null,
          Number.isFinite(perUserLimit) && perUserLimit > 0 ? perUserLimit : null,
          startsAt,
          expiresAt,
          req.authUser.id,
        ]
      );
      await audit(pool, req.authUser.id, 'referral_code_created', 'discount_code', rows[0].id, { code });
      res.json({ ok: true, discount: mapDiscountAdmin(rows[0]) });
    } catch (e) {
      if (String(e.code) === '23505' || String(e.message || '').toLowerCase().includes('unique')) {
        return res.status(400).json({ ok: false, message: 'This referral code already exists.' });
      }
      console.error(e);
      res.status(500).json({ ok: false, message: 'Unable to create referral code.' });
    }
  });

  app.put('/api/admin/discounts/:id', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows: existing } = await pool.query(`SELECT * FROM discount_codes WHERE id=$1`, [id]);
      if (!existing[0] || existing[0].deleted_at) {
        return res.status(404).json({ ok: false, message: 'Referral code not found.' });
      }
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
      if (!Number.isFinite(value) || value <= 0) {
        return res.status(400).json({ ok: false, message: 'Enter a valid discount value.' });
      }
      if (discountType === 'percent' && value > 90) {
        return res.status(400).json({ ok: false, message: 'Percent discount cannot exceed 90%.' });
      }
      const maxUses =
        req.body?.maxUses !== undefined
          ? req.body.maxUses === null || req.body.maxUses === ''
            ? null
            : Number(req.body.maxUses)
          : cur.max_uses;
      if (maxUses != null && (!Number.isFinite(maxUses) || maxUses < 0)) {
        return res.status(400).json({ ok: false, message: 'Usage limit must be zero or greater.' });
      }
      await pool.query(
        `UPDATE discount_codes SET active=$1, label=$2, discount_type=$3, value=$4, max_uses=$5 WHERE id=$6 AND deleted_at IS NULL`,
        [active, label || null, discountType, value, maxUses, id]
      );
      const action =
        typeof req.body?.active === 'boolean'
          ? active
            ? 'referral_code_activated'
            : 'referral_code_deactivated'
          : 'referral_code_updated';
      await audit(pool, req.authUser.id, action, 'discount_code', id, { code: cur.code, active, value });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Unable to update referral code.' });
    }
  });

  app.delete('/api/admin/discounts/:id', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM discount_codes WHERE id=$1`, [id]);
      if (!rows[0] || rows[0].deleted_at) {
        return res.status(404).json({ ok: false, message: 'Referral code not found.' });
      }
      const uses = Number(rows[0].uses_count || 0);
      const jobs = await pool.query(
        `SELECT COUNT(*)::int AS n FROM managed_jobs WHERE LOWER(discount_code)=LOWER($1)`,
        [rows[0].code]
      );
      const usage = Math.max(uses, Number(jobs.rows[0]?.n || 0));
      if (usage > 0) {
        await pool.query(`UPDATE discount_codes SET deleted_at=NOW(), active=false WHERE id=$1`, [id]);
      } else {
        await pool.query(`DELETE FROM discount_codes WHERE id=$1`, [id]);
      }
      await audit(pool, req.authUser.id, 'referral_code_deleted', 'discount_code', id, {
        code: rows[0].code,
        archived: usage > 0,
      });
      res.json({ ok: true, archived: usage > 0 });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Unable to delete referral code.' });
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

  /** Unified order ledger — quotes, payments, payouts, profits, creator attribution. */
  app.get('/api/admin/order-ledger', requireAuth, requireAdmin, async (req, res) => {
    try {
      const q = String(req.query.q || '').trim().toLowerCase();
      const params = [];
      let where = `WHERE j.status NOT IN ('draft')`;
      if (q) {
        params.push(`%${q}%`);
        const i = params.length;
        where += ` AND (
          LOWER(COALESCE(p.quote_number,'')) LIKE $${i}
          OR LOWER(COALESCE(j.booking_id,'')) LIKE $${i}
          OR LOWER(COALESCE(hw.name,'')) LIKE $${i}
          OR LOWER(COALESCE(ct.name,'')) LIKE $${i}
          OR LOWER(COALESCE(cr.name,'')) LIKE $${i}
        )`;
      }

      const { rows: jobs } = await pool.query(
        `SELECT j.id AS job_id, j.booking_id, j.status AS job_status, j.category, j.title,
                j.customer_retail_estimate_low AS ai_low, j.customer_retail_estimate_high AS ai_high,
                hw.name AS homeowner_name, hw.email AS homeowner_email,
                p.id AS proposal_id, p.quote_number, p.retail_amount, p.contractor_net, p.platform_gross,
                p.processing_cost, p.expected_margin_pct, p.published_at, p.approved_at, p.status AS quote_status,
                p.scope_summary, p.timeline, p.service_charge, p.admin_discount,
                cr.name AS created_by_name, cr.email AS created_by_email,
                ct.name AS contractor_name
         FROM managed_jobs j
         LEFT JOIN LATERAL (
           SELECT * FROM proposals WHERE job_id = j.id ORDER BY created_at DESC LIMIT 1
         ) p ON TRUE
         LEFT JOIN users hw ON hw.id = j.homeowner_user_id
         LEFT JOIN users cr ON cr.id = p.created_by
         LEFT JOIN bids b ON b.id = p.bid_id
         LEFT JOIN users ct ON ct.id = COALESCE(b.contractor_user_id, j.assigned_contractor_user_id)
         ${where}
         ORDER BY COALESCE(p.published_at, j.created_at) DESC NULLS LAST
         LIMIT 120`,
        params
      );

      const jobIds = jobs.map((j) => j.job_id);
      let payments = [];
      let payouts = [];
      if (jobIds.length) {
        const { rows: payRows } = await pool.query(
          `SELECT id, job_id, payment_type, amount, status, simulated, created_at, stripe_session_id
           FROM payments WHERE job_id = ANY($1::bigint[]) ORDER BY created_at DESC`,
          [jobIds]
        );
        payments = payRows;
        const { rows: payoutRows } = await pool.query(
          `SELECT id, job_id, contractor_id, status, gross_amount_cents, net_amount_cents, fee_amount_cents,
                  created_at, approved_at, paid_at, stripe_transfer_id
           FROM contractor_payouts WHERE job_id = ANY($1::bigint[]) ORDER BY created_at DESC`,
          [jobIds]
        );
        payouts = payoutRows;
      }

      const paymentsByJob = new Map();
      for (const p of payments) {
        if (!paymentsByJob.has(p.job_id)) paymentsByJob.set(p.job_id, []);
        paymentsByJob.get(p.job_id).push(p);
      }
      const payoutsByJob = new Map();
      for (const p of payouts) {
        if (!payoutsByJob.has(p.job_id)) payoutsByJob.set(p.job_id, []);
        payoutsByJob.get(p.job_id).push(p);
      }

      const ledger = [];
      let totalIncoming = 0;
      let totalPending = 0;
      let totalPaidOut = 0;
      let totalQuotedProfit = 0;

      for (const row of jobs) {
        const quoteNumber = row.quote_number || (row.proposal_id ? `FBQ-${String(row.proposal_id).padStart(5, '0')}` : null);
        const jobPayments = paymentsByJob.get(row.job_id) || [];
        const jobPayouts = payoutsByJob.get(row.job_id) || [];
        const incoming = jobPayments
          .filter((p) => p.status === 'succeeded')
          .reduce((s, p) => s + Number(p.amount || 0), 0);
        const pending = jobPayments
          .filter((p) => ['pending', 'authorized'].includes(String(p.status)))
          .reduce((s, p) => s + Number(p.amount || 0), 0);
        const paidOut = jobPayouts
          .filter((p) => ['paid', 'processing'].includes(String(p.status)))
          .reduce((s, p) => s + Number(p.net_amount_cents || 0) / 100, 0);

        totalIncoming += incoming;
        totalPending += pending;
        totalPaidOut += paidOut;
        if (row.platform_gross != null) totalQuotedProfit += Number(row.platform_gross);

        if (row.proposal_id) {
          ledger.push({
            kind: 'quote',
            date: row.published_at,
            jobId: row.job_id,
            bookingId: row.booking_id,
            quoteNumber,
            quoteStatus: row.quote_status,
            jobStatus: row.job_status,
            homeownerName: row.homeowner_name,
            contractorName: row.contractor_name,
            createdByName: row.created_by_name || row.created_by_email || '—',
            aiEstimateLow: row.ai_low != null ? Number(row.ai_low) : null,
            aiEstimateHigh: row.ai_high != null ? Number(row.ai_high) : null,
            contractorQuote: row.contractor_net != null ? Number(row.contractor_net) : null,
            customerQuote: row.retail_amount != null ? Number(row.retail_amount) : null,
            platformMargin: row.platform_gross != null ? Number(row.platform_gross) : null,
            expectedMarginPct: row.expected_margin_pct != null ? Number(row.expected_margin_pct) : null,
            processingCost: row.processing_cost != null ? Number(row.processing_cost) : null,
            amount: row.retail_amount != null ? Number(row.retail_amount) : null,
            description: `Quote published — ${row.scope_summary || row.title || row.category || 'Repair'}`,
          });
        }

        for (const p of jobPayments) {
          ledger.push({
            kind: 'payment',
            date: p.created_at,
            jobId: row.job_id,
            bookingId: row.booking_id,
            quoteNumber,
            paymentType: p.payment_type,
            status: p.status,
            amount: Number(p.amount || 0),
            simulated: p.simulated === true,
            description: `${p.payment_type} — ${p.status}`,
          });
        }

        for (const p of jobPayouts) {
          ledger.push({
            kind: 'payout',
            date: p.paid_at || p.approved_at || p.created_at,
            jobId: row.job_id,
            bookingId: row.booking_id,
            quoteNumber,
            status: p.status,
            amount: Number(p.net_amount_cents || 0) / 100,
            grossAmount: Number(p.gross_amount_cents || 0) / 100,
            feeAmount: Number(p.fee_amount_cents || 0) / 100,
            contractorName: row.contractor_name,
            description: `Contractor payout — ${p.status}`,
          });
        }
      }

      ledger.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

      res.json({
        ok: true,
        summary: {
          totalIncoming: Math.round(totalIncoming * 100) / 100,
          totalPending: Math.round(totalPending * 100) / 100,
          totalPaidOut: Math.round(totalPaidOut * 100) / 100,
          totalQuotedProfit: Math.round(totalQuotedProfit * 100) / 100,
          netPosition: Math.round((totalIncoming - totalPaidOut) * 100) / 100,
          orderCount: jobs.length,
          ledgerEventCount: ledger.length,
        },
        orders: jobs.map((row) => ({
          jobId: row.job_id,
          bookingId: row.booking_id,
          quoteNumber: row.quote_number || (row.proposal_id ? `FBQ-${String(row.proposal_id).padStart(5, '0')}` : null),
          jobStatus: row.job_status,
          quoteStatus: row.quote_status,
          homeownerName: row.homeowner_name,
          contractorName: row.contractor_name,
          createdByName: row.created_by_name,
          publishedAt: row.published_at,
          approvedAt: row.approved_at,
          aiEstimateLow: row.ai_low != null ? Number(row.ai_low) : null,
          aiEstimateHigh: row.ai_high != null ? Number(row.ai_high) : null,
          contractorQuote: row.contractor_net != null ? Number(row.contractor_net) : null,
          customerQuote: row.retail_amount != null ? Number(row.retail_amount) : null,
          platformMargin: row.platform_gross != null ? Number(row.platform_gross) : null,
          expectedMarginPct: row.expected_margin_pct != null ? Number(row.expected_margin_pct) : null,
          moneyReceived: (paymentsByJob.get(row.job_id) || [])
            .filter((p) => p.status === 'succeeded')
            .reduce((s, p) => s + Number(p.amount || 0), 0),
          moneyPending: (paymentsByJob.get(row.job_id) || [])
            .filter((p) => ['pending', 'authorized'].includes(String(p.status)))
            .reduce((s, p) => s + Number(p.amount || 0), 0),
          contractorPaidOut: (payoutsByJob.get(row.job_id) || [])
            .filter((p) => ['paid', 'processing'].includes(String(p.status)))
            .reduce((s, p) => s + Number(p.net_amount_cents || 0) / 100, 0),
        })),
        ledger,
      });
    } catch (e) {
      console.error('order-ledger:', e);
      res.status(500).json({ ok: false, message: 'Could not load order ledger.' });
    }
  });

  /** Server-calculated profitability — admin only; never expose to homeowners. */
  app.get('/api/admin/profitability', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { rows: pay } = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN status='succeeded' THEN ROUND(amount::numeric * 100) ELSE 0 END),0)::bigint AS revenue_cents,
           COALESCE(SUM(CASE WHEN status='refunded' THEN ROUND(amount::numeric * 100) ELSE 0 END),0)::bigint AS refunded_cents,
           COALESCE(SUM(CASE WHEN status='succeeded' AND COALESCE(simulated,false)=true THEN ROUND(amount::numeric * 100) ELSE 0 END),0)::bigint AS simulated_revenue_cents
         FROM payments`
      );
      const { rows: transfers } = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN status IN ('paid','succeeded','transferred') THEN ROUND(amount::numeric * 100) ELSE 0 END),0)::bigint AS contractor_paid_cents
         FROM transfers`
      );
      const { rows: props } = await pool.query(
        `SELECT
           COALESCE(SUM(ROUND(retail_amount::numeric * 100)),0)::bigint AS retail_cents,
           COALESCE(SUM(ROUND(contractor_net::numeric * 100)),0)::bigint AS contractor_net_cents,
           COALESCE(SUM(ROUND(COALESCE(platform_gross,0)::numeric * 100)),0)::bigint AS platform_gross_cents
         FROM proposals WHERE status IN ('sent','approved','accepted','paid') OR published_at IS NOT NULL`
      );
      const { rows: visit } = await pool.query(
        `SELECT COALESCE(SUM(ROUND(COALESCE(visit_fee_amount,0)::numeric * 100)),0)::bigint AS visit_fee_cents
         FROM managed_jobs WHERE visit_fee_authorized=true`
      );
      const { rows: jobs } = await pool.query(
        `SELECT
           j.id,
           j.status,
           j.category,
           ROUND(COALESCE(p.retail_amount,0)::numeric * 100)::bigint AS retail_cents,
           ROUND(COALESCE(p.contractor_net,0)::numeric * 100)::bigint AS contractor_net_cents,
           ROUND(COALESCE(p.platform_gross,0)::numeric * 100)::bigint AS platform_gross_cents,
           ROUND(COALESCE(j.visit_fee_amount,0)::numeric * 100)::bigint AS visit_fee_cents
         FROM managed_jobs j
         LEFT JOIN LATERAL (
           SELECT retail_amount, contractor_net, platform_gross
           FROM proposals WHERE job_id=j.id ORDER BY created_at DESC LIMIT 1
         ) p ON TRUE
         WHERE j.status NOT IN ('draft','canceled')
         ORDER BY j.id DESC
         LIMIT 50`
      );

      const revenueCents = Number(pay[0]?.revenue_cents || 0);
      const refundedCents = Number(pay[0]?.refunded_cents || 0);
      const contractorPaidCents = Number(transfers[0]?.contractor_paid_cents || 0);
      const platformGrossCents = Number(props[0]?.platform_gross_cents || 0);
      const retailCents = Number(props[0]?.retail_cents || 0);
      const contractorNetCents = Number(props[0]?.contractor_net_cents || 0);
      const visitFeeCents = Number(visit[0]?.visit_fee_cents || 0);
      // Approximate processing at 2.9% + $0.30 per succeeded payment count is heavy; use 2.9% of revenue.
      const processingFeeCents = Math.round(revenueCents * 0.029);
      const netPlatformCents =
        revenueCents - refundedCents - contractorPaidCents - processingFeeCents;

      const centsToDollars = (c) => Math.round(Number(c) || 0) / 100;

      res.json({
        ok: true,
        summary: {
          homeownerCharged: centsToDollars(revenueCents),
          refunds: centsToDollars(refundedCents),
          contractorCost: centsToDollars(contractorNetCents),
          contractorPaidOut: centsToDollars(contractorPaidCents),
          platformGrossMargin: centsToDollars(platformGrossCents || retailCents - contractorNetCents),
          paymentProcessingFeesEst: centsToDollars(processingFeeCents),
          visitFeesAuthorized: centsToDollars(visitFeeCents),
          netPlatformRevenue: centsToDollars(netPlatformCents),
          simulatedRevenue: centsToDollars(pay[0]?.simulated_revenue_cents || 0),
          stripeConfigured: stripeConfigured(),
        },
        jobs: (jobs || []).map((j) => ({
          id: Number(j.id),
          status: j.status,
          category: j.category,
          homeownerCharged: centsToDollars(j.retail_cents),
          contractorCost: centsToDollars(j.contractor_net_cents),
          platformMargin: centsToDollars(j.platform_gross_cents),
          visitFee: centsToDollars(j.visit_fee_cents),
        })),
      });
    } catch (e) {
      console.error('profitability:', e);
      res.status(500).json({ ok: false, message: 'Could not load profitability.' });
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

      const claim = await claimWebhookEvent(pool, {
        provider: 'stripe',
        eventId: event.id,
        eventType: event.type,
        payload: event,
      });
      if (claim.alreadyProcessed) return res.json({ ok: true, duplicate: true });

      if (event.type === 'checkout.session.completed') {
        const session = event.data?.object || {};
        const jobId = Number(session.metadata?.jobId);
        const paymentType = session.metadata?.paymentType;
        if (paymentType === 'recurring_activation_fee') {
          const recurringServiceId = Number(session.metadata?.recurringServiceId);
          const paidAmt = session.amount_total != null ? Number(session.amount_total) / 100 : null;
          const payUpdate = await pool.query(
            `UPDATE payments SET status='succeeded', stripe_payment_intent=$2,
               public_id=COALESCE(public_id, 'TXN-' || LPAD(id::text, 5, '0')),
               provider=COALESCE(provider, 'stripe')
             WHERE stripe_session_id=$1
             RETURNING id`,
            [session.id, session.payment_intent || null]
          );
          if (recurringServiceId) {
            const { fulfillRecurringActivation } = await import('./recurring-activation.js');
            await fulfillRecurringActivation(pool, {
              recurringServiceId,
              paymentId: payUpdate.rows[0]?.id || null,
              amountCents: session.amount_total != null ? Number(session.amount_total) : paidAmt != null ? Math.round(paidAmt * 100) : null,
            });
          }
          return res.json({ ok: true });
        }
        const userId = Number(session.metadata?.userId || session.metadata?.homeownerId);
        const planCode = session.metadata?.planCode;

        if (paymentType === 'pending_professional_fee') {
          const pendingId = Number(session.metadata?.pendingServiceRequestId);
          if (!Number.isFinite(pendingId) || pendingId <= 0) {
            return res.status(400).json({ ok: false, message: 'Invalid pending service request payment metadata.' });
          }
          const amountCents = session.amount_total != null ? Number(session.amount_total) : 12500;
          if (amountCents !== 12500) {
            return res.status(400).json({ ok: false, message: 'Pending professional payment amount mismatch.' });
          }
          const pendingPaymentUpdate = await pool.query(
            `UPDATE pending_service_requests SET
               payment_status='succeeded',
               stripe_session_id=COALESCE(stripe_session_id,$2),
               stripe_payment_intent_id=$3,
               paid_amount_cents=$4,
               paid_at=COALESCE(paid_at,NOW()),
               updated_at=NOW()
             WHERE id=$1 AND homeowner_user_id=$5`,
            [pendingId, session.id, session.payment_intent || null, amountCents, userId]
          );

          // If auth/me already reconciled the Stripe return, the pending row
          // has been deleted. convertPendingServiceRequest() handles that
          // idempotently through the payment/job linkage.
          if (!pendingPaymentUpdate.rowCount) {
            console.info(
              '[PENDING SERVICE REQUEST] webhook found no pending row; checking idempotent conversion:',
              pendingId
            );
          }

          console.info("[FLOW][4][WEBHOOK] STRIPE PAYMENT CONFIRMED", {
            pendingServiceRequestId: pendingId,
            userId,
            amountCents,
            stripeSessionId: session.id ? String(session.id).slice(0, 18) : null,
            paymentIntentPresent: Boolean(session.payment_intent),
          });

          const converted = await convertPendingServiceRequest(pool, pendingId, {
            amountCents,
            stripeSessionId: session.id,
            stripePaymentIntentId: session.payment_intent || null,
            homeownerUserId: userId || null,
            paymentType: 'pending_professional_fee',
          });
          console.info("[FLOW][4][WEBHOOK] CONVERSION RESULT", {
            pendingServiceRequestId: pendingId,
            managedJobId: converted?.job?.id || null,
            managedJobStatus: converted?.job?.status || null,
            alreadyConverted: Boolean(converted?.alreadyConverted),
          });

          if (converted.job) {
            const paymentMeta = JSON.stringify({
              source: 'pending_service_request',
              pendingServiceRequestId: pendingId,
            });
            const paymentUpdate = await pool.query(
              `UPDATE payments SET
                 job_id=$1,
                 status='succeeded',
                 stripe_payment_intent=COALESCE($2, stripe_payment_intent),
                 provider='stripe',
                 simulated=false,
                 meta=COALESCE(meta,'{}'::jsonb) || $3::jsonb
               WHERE stripe_session_id=$4
               RETURNING id`,
              [
                converted.job.id,
                session.payment_intent || null,
                paymentMeta,
                session.id,
              ]
            );
            if (!paymentUpdate.rows[0]) {
              await pool.query(
                `INSERT INTO payments (job_id,user_id,payment_type,amount,status,stripe_session_id,stripe_payment_intent,simulated,meta)
                 VALUES ($1,$2,'pending_professional_fee',$3,'succeeded',$4,$5,false,$6)`,
                [
                  converted.job.id,
                  userId || converted.job.homeowner_user_id,
                  125,
                  session.id,
                  session.payment_intent || null,
                  paymentMeta,
                ]
              );
            }
            await pushStatus(pool, converted.job.id, 'paid_for_dispatch', 'awaiting_contractor', null, 'Ready for Admin review after pending-service conversion');
          }
          return res.json({ ok: true, converted: Boolean(converted.job), managedJobId: converted.job?.id || null });
        }

        if (jobId && paymentType) {
          let paymentStatus = 'succeeded';
          if (paymentType === 'dispatch_fee') {
            paymentStatus = 'authorized';
            const paidAmt = session.amount_total != null ? Number(session.amount_total) / 100 : null;
            await pool.query(
              `UPDATE managed_jobs SET
                 visit_fee_authorized=true,
                 visit_fee_amount=COALESCE($1, visit_fee_amount),
                 final_customer_amount=COALESCE($1, final_customer_amount),
                 payment_completed_at=COALESCE(payment_completed_at, NOW()),
                 work_queue_status='PAID_NEEDS_REVIEW',
                 stripe_payment_intent_id=$2,
                 pricing = CASE
                   WHEN $1::numeric IS NULL THEN pricing
                   WHEN pricing IS NULL THEN jsonb_build_object('contractor_visit_fee', $1::numeric)
                   ELSE pricing || jsonb_build_object('contractor_visit_fee', $1::numeric)
                 END,
                 updated_at=NOW()
               WHERE id=$3`,
              [paidAmt, session.payment_intent || null, jobId]
            );
          }
          await pool.query(
            `UPDATE payments SET status=$1, stripe_payment_intent=$2,
               public_id=COALESCE(public_id, 'TXN-' || LPAD(id::text, 5, '0')),
               provider=COALESCE(provider, 'stripe')
             WHERE stripe_session_id=$3`,
            [paymentStatus, session.payment_intent || null, session.id]
          );
          const { rows: jobs } = await pool.query(`SELECT status FROM managed_jobs WHERE id=$1`, [jobId]);
          if (paymentType === 'dispatch_fee') {
            await pushStatus(pool, jobId, jobs[0]?.status, 'paid_for_dispatch', null, 'Stripe visit fee authorized (hold placed)');
            await pushStatus(pool, jobId, 'paid_for_dispatch', 'awaiting_contractor', null, 'Ready for dispatch — PAID, needs Admin review');
            await triggerReferralBookingReward(pool, jobId);
            try {
              const { rows: jobRows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
              const { rows: userRows } = userId
                ? await pool.query(`SELECT id, name, email FROM users WHERE id=$1`, [userId])
                : { rows: [] };
              const paidAmt =
                session.amount_total != null ? Number(session.amount_total) / 100 : jobRows[0]?.visit_fee_amount;
              if (jobRows[0]) {
                const metaRaw = await pool.query(
                  `SELECT meta FROM payments WHERE stripe_session_id=$1 LIMIT 1`,
                  [session.id]
                );
                let discountCode = jobRows[0].discount_code || null;
                let discountAmount = jobRows[0].coupon_discount_amount != null
                  ? Number(jobRows[0].coupon_discount_amount)
                  : null;
                try {
                  const meta = metaRaw.rows[0]?.meta;
                  const parsed = typeof meta === 'string' ? JSON.parse(meta) : meta;
                  if (parsed?.dispatchDiscount?.code) discountCode = parsed.dispatchDiscount.code;
                  if (parsed?.checkoutSnapshot?.couponDiscount != null) {
                    discountAmount = Number(parsed.checkoutSnapshot.couponDiscount);
                  } else if (parsed?.dispatchDiscount?.discountAmount != null) {
                    discountAmount = Number(parsed.dispatchDiscount.discountAmount);
                  }
                } catch {
                  // ignore
                }
                // Finalize coupon redemption exactly once after verified payment.
                if (discountCode && !jobRows[0].coupon_redeemed_at) {
                  const dRow = await lookupDiscountByCode(pool, discountCode);
                  if (dRow?.id) {
                    await incrementDiscountUse(pool, dRow.id, jobRows[0].homeowner_user_id || userId || null);
                    await pool.query(
                      `UPDATE managed_jobs SET
                         coupon_redeemed_at=NOW(),
                         coupon_discount_amount=COALESCE($2, coupon_discount_amount),
                         updated_at=NOW()
                       WHERE id=$1 AND coupon_redeemed_at IS NULL`,
                      [jobId, discountAmount]
                    );
                  }
                }
                await notifyAdminsDispatchServiceRequest(pool, {
                  job: {
                    ...jobRows[0],
                    work_queue_status: 'PAID_NEEDS_REVIEW',
                  },
                  homeowner: userRows[0] || { name: session.customer_email, email: session.customer_email },
                  amount: paidAmt,
                  discountCode,
                });
              }
            } catch (notifyErr) {
              console.error('dispatch webhook notify:', notifyErr.message);
            }
          }
          if (paymentType === 'retail_payment') {
            await pushStatus(pool, jobId, jobs[0]?.status, 'admin_review_pending', null, 'Stripe retail payment received');
            await pushStatus(pool, jobId, 'admin_review_pending', 'payout_pending', null, 'Ready for contractor payout');
            try {
              const paidAmt = session.amount_total != null ? Number(session.amount_total) / 100 : null;
              const tipCents = Number(session.metadata?.tipAmountCents || 0);
              const tipDollars = tipCents > 0 ? tipCents / 100 : 0;
              await processSuccessfulPayment(pool, {
                source: 'stripe_retail_webhook',
                jobId,
                homeownerUserId: userId || null,
                paymentType: 'retail_payment',
                customerTotal: paidAmt,
                serviceAmount: paidAmt != null ? Math.max(0, paidAmt - tipDollars) : null,
                tipAmount: tipDollars,
                stripeSessionId: session.id,
                stripePaymentIntentId: session.payment_intent || null,
                actorUserId: userId || null,
                stripeMetadata: session.metadata || {},
                idempotencyKey: `stripe-session-${session.id}`,
              });
            } catch (_payoutErr) {
              console.warn('[payout] settle on retail webhook:', _payoutErr.message);
              throw _payoutErr;
            }
            try {
              await triggerReferralBookingReward(pool, jobId);
            } catch (_refErr) {
              /* non-fatal */
            }
          }
          if (paymentType === 'invoice_payment') {
            const invoiceId = Number(session.metadata?.invoiceId);
            const paidAmt = session.amount_total != null ? Number(session.amount_total) / 100 : null;
            const tipCents = Number(session.metadata?.tipAmountCents || 0);
            const tipDollars = tipCents > 0 ? tipCents / 100 : 0;
            const serviceDollars = paidAmt != null ? Math.max(0, paidAmt - tipDollars) : null;
            try {
              await processSuccessfulPayment(pool, {
                source: 'stripe_invoice_webhook',
                jobId,
                invoiceId: Number.isFinite(invoiceId) ? invoiceId : null,
                proposalId: session.metadata?.proposalId ? Number(session.metadata.proposalId) : null,
                homeownerUserId: userId || null,
                paymentType: 'invoice_payment',
                customerTotal: paidAmt,
                serviceAmount: serviceDollars,
                tipAmount: tipDollars,
                stripeSessionId: session.id,
                stripePaymentIntentId: session.payment_intent || null,
                actorUserId: userId || null,
                stripeMetadata: session.metadata || {},
                idempotencyKey: `stripe-session-${session.id}`,
              });
            } catch (invErr) {
              console.warn('[invoice] stripe settlement failed:', invErr.message);
              throw invErr;
            }
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
          const paidAmt =
            session.amount_total != null ? Number(session.amount_total) / 100 : null;
          const stripeSubId = session.subscription || null;
          let periodEnd = null;
          if (stripeSubId) {
            try {
              const stripe = await getStripe();
              if (stripe) {
                const sub = await stripe.subscriptions.retrieve(String(stripeSubId));
                if (sub?.current_period_end) {
                  periodEnd = new Date(sub.current_period_end * 1000).toISOString();
                }
              }
            } catch {
              /* default period applied in activateSubscriptionFromCheckout */
            }
          }
          await activateSubscriptionFromCheckout(pool, {
            userId,
            planCode,
            stripeSubscriptionId: stripeSubId,
            stripeCustomerId: session.customer || null,
            currentPeriodEnd: periodEnd,
            checkoutSessionId: session.id,
            meta: { activatedByWebhook: true },
          });

          // A pending request is converted only after Stripe has confirmed
          // the successful HomeCare subscription checkout. The initial
          // pending request may legitimately remain payment_status='not_required'
          // when the subscription itself is the payment/entitlement event.
          const pendingServiceRequestId = Number(session.metadata?.pendingServiceRequestId);
          if (Number.isFinite(pendingServiceRequestId) && pendingServiceRequestId > 0) {
            const pendingAmountCents =
              session.amount_total != null ? Number(session.amount_total) : null;

            const pendingPaymentStatus =
              pendingAmountCents != null && pendingAmountCents > 0
                ? 'succeeded'
                : 'not_required';

            await pool.query(
              `UPDATE pending_service_requests SET
                 payment_status=$2,
                 stripe_session_id=COALESCE(stripe_session_id,$3),
                 stripe_payment_intent_id=$4,
                 paid_amount_cents=COALESCE($5, paid_amount_cents),
                 paid_at=COALESCE(paid_at, CASE WHEN $2='succeeded' THEN NOW() ELSE paid_at END),
                 selected_action='homecare',
                 updated_at=NOW()
               WHERE id=$1 AND homeowner_user_id=$6`,
              [
                pendingServiceRequestId,
                pendingPaymentStatus,
                session.id,
                session.payment_intent || null,
                pendingAmountCents,
                userId,
              ]
            );

            const converted = await convertPendingServiceRequest(
              pool,
              pendingServiceRequestId,
              {
                amountCents: pendingAmountCents,
                paymentStatus: pendingPaymentStatus,
                stripeSessionId: session.id,
                stripePaymentIntentId: session.payment_intent || null,
                homeownerUserId: userId || null,
                paymentType: 'subscription',
              }
            );

            console.log('[PENDING SERVICE REQUEST] HomeCare conversion:', {
              pendingServiceRequestId,
              managedJobId: converted?.job?.id || null,
              alreadyConverted: converted?.alreadyConverted || false,
            });
          }

          const { rows: payRows } = await pool.query(
            `UPDATE payments SET
               status='succeeded',
               stripe_payment_intent=COALESCE($1, stripe_payment_intent),
               stripe_subscription_id=COALESCE($2, stripe_subscription_id),
               amount=COALESCE($3, amount),
               currency=COALESCE($4, currency, 'usd'),
               provider='stripe',
               public_id=COALESCE(public_id, 'TXN-' || LPAD(id::text, 5, '0')),
               meta = COALESCE(meta, '{}'::jsonb) || $5::jsonb
             WHERE stripe_session_id=$6
             RETURNING *`,
            [
              session.payment_intent || null,
              stripeSubId,
              paidAmt,
              session.currency || 'usd',
              JSON.stringify({
                planCode,
                customerId: session.customer || null,
                activatedByWebhook: true,
                paymentDate: new Date().toISOString(),
              }),
              session.id,
            ]
          );
          if (!payRows[0]) {
            const { rows: inserted } = await pool.query(
              `INSERT INTO payments (user_id, payment_type, amount, currency, status, stripe_session_id, stripe_payment_intent, stripe_subscription_id, provider, simulated, meta)
               VALUES ($1,'subscription',$2,$3,'succeeded',$4,$5,$6,'stripe',false,$7)
               RETURNING id`,
              [
                userId,
                paidAmt || 0,
                session.currency || 'usd',
                session.id,
                session.payment_intent || null,
                stripeSubId,
                JSON.stringify({ planCode, customerId: session.customer || null }),
              ]
            );
            if (inserted[0]) {
              await pool.query(
                `UPDATE payments SET public_id='TXN-' || LPAD(id::text, 5, '0') WHERE id=$1`,
                [inserted[0].id]
              );
            }
          }
        }
      }

      if (event.type === 'payment_intent.succeeded') {
        const pi = event.data?.object || {};
        await pool.query(
          `UPDATE payments SET status='succeeded' WHERE stripe_payment_intent=$1`,
          [pi.id]
        );
        const { rows: pays } = await pool.query(`SELECT * FROM payments WHERE stripe_payment_intent=$1`, [pi.id]);
        if (pays[0]) {
          try {
            await capturePaymentStripeFees(pool, pays[0]);
          } catch (e) {
            console.warn('[webhook] fee capture:', e.message);
          }
        }
      }

      if (event.type === 'payment_intent.payment_failed') {
        const pi = event.data?.object || {};
        await pool.query(
          `UPDATE payments SET status='failed' WHERE stripe_payment_intent=$1`,
          [pi.id]
        );
        try {
          const { rows: pays } = await pool.query(
            `SELECT job_id, homeowner_user_id FROM payments WHERE stripe_payment_intent=$1 LIMIT 1`,
            [pi.id],
          );
          const pay = pays[0];
          if (pay?.job_id) {
            await notifyAdmins(pool, {
              type: 'payment_failed',
              title: 'Payment failed',
              message: `A homeowner payment failed for job FB-${pay.job_id}.`,
              jobId: pay.job_id,
              entityType: 'job',
              entityId: pay.job_id,
            });
            if (pay.homeowner_user_id) {
              await createInAppNotification(pool, {
                userId: pay.homeowner_user_id,
                userRole: 'homeowner',
                jobId: pay.job_id,
                type: 'payment_failed',
                title: 'Payment unsuccessful',
                message: 'Your payment did not go through. You can retry from the invoice.',
                entityType: 'invoice',
                entityId: pay.job_id,
              });
            }
          }
        } catch {
          /* non-fatal */
        }
      }

      if (event.type === 'checkout.session.expired') {
        const session = event.data?.object || {};
        if (session.id) {
          await pool.query(
            `UPDATE payments SET status='cancelled'
             WHERE stripe_session_id=$1 AND status='pending'`,
            [session.id]
          );
        }
      }

      if (event.type === 'charge.refunded') {
        const charge = event.data?.object || {};
        let riskJobId = Number(charge.metadata?.jobId || charge.metadata?.job_id || 0);
        let paymentId = null;
        if (!riskJobId && charge.payment_intent) {
          const { rows: pays } = await pool.query(
            `SELECT id, job_id FROM payments WHERE stripe_payment_intent=$1 LIMIT 1`,
            [typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id]
          );
          riskJobId = Number(pays[0]?.job_id || 0);
          paymentId = pays[0]?.id || null;
        }
        const refundAmountCents = Number(charge.amount_refunded || 0);
        await pool.query(
          `INSERT INTO refunds (payment_id, job_id, amount, reason, status, stripe_refund_id, simulated, refund_amount_cents)
           VALUES ($1,$2,$3,'stripe_charge_refunded','succeeded',$4,false,$5)
           ON CONFLICT DO NOTHING`,
          [
            paymentId,
            riskJobId || null,
            refundAmountCents / 100,
            charge.id,
            refundAmountCents,
          ]
        ).catch(() =>
          pool.query(
            `INSERT INTO refunds (amount, reason, status, stripe_refund_id, simulated, refund_amount_cents)
             VALUES ($1,'stripe_charge_refunded','succeeded',$2,false,$3)`,
            [refundAmountCents / 100, charge.id, refundAmountCents]
          )
        );
        if (riskJobId) {
          await reconcileRefundForJob(pool, riskJobId, {
            refundAmountCents,
            paymentId,
            reason: 'Customer refund (charge.refunded)',
          });
        }
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
        const pi = typeof d.payment_intent === 'string' ? d.payment_intent : d.payment_intent?.id;
        if (pi) {
          const { rows: pays } = await pool.query(
            `SELECT job_id FROM payments WHERE stripe_payment_intent=$1 LIMIT 1`,
            [pi]
          );
          if (pays[0]?.job_id) {
            await applyPaymentRiskToPayouts(pool, pays[0].job_id, {
              reason: 'Chargeback / dispute created',
              relatedPaymentId: d.id,
            });
          }
        }
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
          await applyInvoiceSubscriptionStatus(
            pool,
            inv.subscription,
            event.type === 'invoice.paid' ? 'paid' : 'failed'
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
          await applyStripeSubscriptionObject(pool, sub);
        }
      }

      if (event.type === 'payout.paid' || event.type === 'payout.failed') {
        await handlePayoutWebhookUpdate(pool, event);
      }

      await markWebhookProcessed(pool, event.id);
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      try {
        if (typeof event !== 'undefined' && event?.id) {
          await markWebhookFailed(pool, event.id, e.message);
        }
      } catch (_) { /* ignore */ }
      res.status(400).json({ ok: false, message: 'Webhook verification failed.' });
    }
  });

  registerContractorComplianceRoutes(app, {
    pool,
    requireAuth,
    requireAdmin,
    requireAdminWrite,
    requirePermission,
    audit,
  });

  registerHomeownerConsentRoutes(app, {
    pool,
    requireAuth,
    requireAdmin,
    requirePermission,
  });

  registerDiySafetyRoutes(app, {
    pool,
    requireAuth,
    requireAdmin,
    requirePermission,
  });

  registerLegalAdminRoutes(app, {
    pool,
    requireAuth,
    requireAdmin,
    requirePermission,
    audit,
  });

  registerDisputeRoutes(app, { pool, requireAuth, requireAdmin, requireAdminWrite, pushStatus });
}
