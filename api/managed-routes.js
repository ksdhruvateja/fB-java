import crypto from 'crypto';
import {
  mergePricingRules,
  computePreliminaryRetail,
  retailFromBid,
  getDispatchFee,
  applyAdminPriceAdjustment,
  DEFAULT_PRICING_RULES,
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
} from './stripe.js';
import { brand } from './brand.js';
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

export const JOB_STATUSES = [
  'draft',
  'ai_review_complete',
  'awaiting_service_payment',
  'paid_for_dispatch',
  'awaiting_contractor',
  'contractor_invited',
  'contractor_accepted',
  'awaiting_bid',
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

async function audit(pool, actorUserId, action, entityType, entityId, detail) {
  await pool.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, detail)
     VALUES ($1,$2,$3,$4,$5)`,
    [actorUserId || null, action, entityType || null, entityId != null ? String(entityId) : null, detail ? JSON.stringify(detail) : null]
  );
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
  };

  // Customer retail visibility
  if (isOwner || isAdmin) {
    base.customerRetailEstimateLow = row.customer_retail_estimate_low != null
      ? Number(row.customer_retail_estimate_low) : null;
    base.customerRetailEstimateHigh = row.customer_retail_estimate_high != null
      ? Number(row.customer_retail_estimate_high) : null;
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

  // Contractor net visibility
  if (isAssignedContractor || isAdmin || role === 'contractor') {
    base.estimatedContractorNetLow = row.estimated_contractor_net_low != null
      ? Number(row.estimated_contractor_net_low) : null;
    base.estimatedContractorNetHigh = row.estimated_contractor_net_high != null
      ? Number(row.estimated_contractor_net_high) : null;
  }

  // Admin-only internals
  if (isAdmin) {
    base.pricing = parseJson(row.pricing);
    base.homeownerUserId = row.homeowner_user_id;
    base.adminNotes = row.admin_notes;
    base.referralStatus = row.referral_status;
    base.referringName = row.referring_name;
    base.referringCompany = row.referring_company;
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
  };
  if (isAdmin) {
    base.contractorNet = row.contractor_net != null ? Number(row.contractor_net) : null;
    base.platformGross = row.platform_gross != null ? Number(row.platform_gross) : null;
    base.processingCost = row.processing_cost != null ? Number(row.processing_cost) : null;
    base.bidId = row.bid_id;
  }
  if (!isAdmin && !isCustomer) {
    // Contractors must not see retail
    delete base.retailAmount;
    delete base.depositAmount;
  }
  return base;
}

export function registerManagedRoutes(app, { pool, requireAuth, requireAdmin }) {
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

  app.put('/api/pricing/rules', requireAuth, requireAdmin, async (req, res) => {
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

  // ── Properties ─────────────────────────────────────────────────────────────
  app.get('/api/properties', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM properties WHERE owner_user_id=$1 ORDER BY created_at DESC`,
        [req.authUser.id]
      );
      res.json({
        ok: true,
        properties: rows.map((r) => ({
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
        })),
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.post('/api/properties', requireAuth, async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.addressLine1) {
        return res.status(400).json({ ok: false, message: 'Address is required.' });
      }
      const { rows } = await pool.query(
        `INSERT INTO properties
          (owner_user_id, label, address_line1, address_line2, city, state, zip, property_type, access_notes, property_purpose, transaction_stage)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          req.authUser.id,
          b.label || null,
          b.addressLine1,
          b.addressLine2 || null,
          b.city || null,
          b.state || null,
          b.zip || null,
          b.propertyType || null,
          b.accessNotes || null,
          b.propertyPurpose || null,
          b.transactionStage || null,
        ]
      );
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
      res.status(500).json({ ok: false, message: 'Server error' });
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
      if (b.propertyId) {
        const { rows: props } = await pool.query(`SELECT * FROM properties WHERE id=$1 AND owner_user_id=$2`, [
          b.propertyId,
          req.authUser.id,
        ]);
        if (props[0]) {
          const p = props[0];
          fullAddress = [p.address_line1, p.address_line2, p.city, p.state, p.zip].filter(Boolean).join(', ');
          cityStateZip = [p.city, p.state, p.zip].filter(Boolean).join(', ');
        }
      }

      const { rows } = await pool.query(
        `INSERT INTO managed_jobs
          (homeowner_user_id, property_id, status, category, title, description, media_data_url, media_type,
           preferred_date, preferred_time_slot, service_timing, city_state_zip, full_address, contact_name, contact_phone,
           partner_code, referral_source, referring_name, referring_company, referring_email, referring_phone,
           customer_partner_status_consent, consent_timestamp, consent_version,
           property_purpose, transaction_stage, listing_deadline, closing_deadline,
           inspection_report_url, listing_reference_url, property_opportunity_notes)
         VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
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
        ]
      );

      let job = rows[0];
      const bookingId = formatBookingId(job.id, job.created_at);
      await pool.query(`UPDATE managed_jobs SET booking_id=$1 WHERE id=$2`, [bookingId, job.id]);
      job = { ...job, booking_id: bookingId };

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
           updated_at=NOW()
         WHERE id=$11`,
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
          `SELECT * FROM managed_jobs WHERE homeowner_user_id=$1 ORDER BY created_at DESC`,
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
      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [Number(req.params.id)]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      const job = rows[0];
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
        return res.status(400).json({ ok: false, message: 'Dispatch fee not due for this status.' });
      }

      const rules = await loadPricingRules(pool);
      const fee = getDispatchFee(job.service_timing, rules);
      const amount = Number(fee.customer);
      const simulate = shouldSimulatePayment(req.body?.simulate === true);

      if (simulate) {
        await pool.query(
          `INSERT INTO payments (job_id, user_id, payment_type, amount, status, simulated, meta)
           VALUES ($1,$2,'dispatch_fee',$3,'succeeded',true,$4)`,
          [jobId, req.authUser.id, amount, JSON.stringify({ contractorVisitPayout: fee.contractor })]
        );
        await pushStatus(pool, jobId, job.status, 'paid_for_dispatch', req.authUser.id, 'Dispatch fee paid (simulated)');
        await pushStatus(pool, jobId, 'paid_for_dispatch', 'awaiting_contractor', req.authUser.id, 'Ready for dispatch');
        await audit(pool, req.authUser.id, 'dispatch_fee_paid', 'managed_job', jobId, { amount, simulated: true });
        const { rows: fresh } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
        return res.json({
          ok: true,
          simulated: true,
          amount,
          job: serializeJob(fresh[0], req.authUser),
        });
      }

      const checkout = await createCheckoutSession({
        amountCents: Math.round(amount * 100),
        customerEmail: req.authUser.email,
        description: `${brand.productName} Service Assessment & Dispatch`,
        successPath: `/?paid=dispatch&job=${jobId}`,
        cancelPath: `/?canceled=dispatch&job=${jobId}`,
        metadata: { jobId: String(jobId), paymentType: 'dispatch_fee', userId: String(req.authUser.id) },
      });

      await pool.query(
        `INSERT INTO payments (job_id, user_id, payment_type, amount, status, stripe_session_id, simulated, meta)
         VALUES ($1,$2,'dispatch_fee',$3,'pending',$4,false,$5)`,
        [jobId, req.authUser.id, amount, checkout.sessionId, JSON.stringify({ contractorVisitPayout: fee.contractor })]
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

      // Block expired license or insurance
      const _now = new Date();
      if (contractors[0].license_expires_at && new Date(contractors[0].license_expires_at) < _now) {
        return res.status(400).json({ ok: false, message: 'Contractor license has expired. Update it under Contractors before assigning.' });
      }
      if (contractors[0].insurance_expires_at && new Date(contractors[0].insurance_expires_at) < _now) {
        return res.status(400).json({ ok: false, message: 'Contractor insurance certificate has expired. Update it under Contractors before assigning.' });
      }

      await pool.query(
        `INSERT INTO job_invitations (job_id, contractor_user_id, status, expected_net_low, expected_net_high, message, invited_by)`
         VALUES ($1,$2,'invited',$3,$4,$5,$6)
         ON CONFLICT (job_id, contractor_user_id) DO UPDATE SET
           status='invited',
           expected_net_low=EXCLUDED.expected_net_low,
           expected_net_high=EXCLUDED.expected_net_high,
           message=EXCLUDED.message,
           invited_by=EXCLUDED.invited_by,
           responded_at=NULL`,
        [
          jobId,
          contractorUserId,
          job.estimated_contractor_net_low,
          job.estimated_contractor_net_high,
          req.body?.message || null,
          req.authUser.id,
        ]
      );

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

      // Block expired license or insurance
      const _now = new Date();
      if (contractors[0].license_expires_at && new Date(contractors[0].license_expires_at) < _now) {
        return res.status(400).json({ ok: false, message: 'Contractor license has expired. Update it under Contractors before assigning.' });
      }
      if (contractors[0].insurance_expires_at && new Date(contractors[0].insurance_expires_at) < _now) {
        return res.status(400).json({ ok: false, message: 'Contractor insurance certificate has expired. Update it under Contractors before assigning.' });
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
      const priced = retailFromBid(Number(bids[0].net_total), rules, {
        urgency: parseJson(jobs[0].ai_assessment)?.urgency,
        afterHours: /evening|weekend/i.test(jobs[0].service_timing || ''),
      });

      let retail = req.body?.retailAmount != null ? Number(req.body.retailAmount) : priced.customer_final_retail_amount;
      const discount = await resolveJobDiscount(pool, jobs[0]);
      if (discount && req.body?.retailAmount == null) {
        const applied = applyDiscountToAmount(retail, discount);
        retail = applied.retail;
      }
      const { rows } = await pool.query(
        `INSERT INTO proposals
          (job_id, bid_id, scope_summary, retail_amount, deposit_amount, timeline, warranty, exclusions,
           contractor_net, platform_gross, processing_cost, status, created_by, published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'sent',$12,NOW())
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
          priced.contractor_final_net_amount,
          priced.platform_gross_profit,
          priced.processing_cost,
          req.authUser.id,
        ]
      );

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
        net: priced.contractor_final_net_amount,
      });

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

      const checkout = await createCheckoutSession({
        amountCents: Math.round(amount * 100),
        customerEmail: req.authUser.email,
        description: `${brand.productName} repair payment`,
        successPath: `/?paid=retail&job=${jobId}`,
        cancelPath: `/?canceled=retail&job=${jobId}`,
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
        completedAt: new Date().toISOString(),
      };
      await pool.query(
        `UPDATE managed_jobs SET completion_report=$1, updated_at=NOW() WHERE id=$2`,
        [JSON.stringify(report), jobId]
      );
      await pushStatus(pool, jobId, job.status, 'work_completed', req.authUser.id, 'Work completed with proof');
      await pushStatus(pool, jobId, 'work_completed', 'customer_review_pending', req.authUser.id, 'Awaiting customer confirmation');
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

      let transferId = null;
      if (simulate) {
        transferId = `sim_tr_${Date.now()}`;
      } else {
        const result = await createTransfer({
          amountCents: Math.round(amount * 100),
          destinationAccountId: contractor.stripe_account_id,
          transferGroup: `job_${jobId}`,
          metadata: { jobId: String(jobId) },
        });
        transferId = result.transferId;
      }

      await pool.query(
        `INSERT INTO transfers (job_id, contractor_user_id, amount, status, stripe_transfer_id, simulated, created_by)
         VALUES ($1,$2,$3,'paid',$4,$5,$6)`,
        [jobId, job.assigned_contractor_user_id, amount, transferId, simulate, req.authUser.id]
      );
      await pushStatus(pool, jobId, job.status, 'paid_out', req.authUser.id, 'Contractor payout released');
      await pushStatus(pool, jobId, 'paid_out', 'closed', req.authUser.id, 'Job closed');
      await audit(pool, req.authUser.id, 'payout_released', 'managed_job', jobId, { amount, simulate, transferId });

      const { rows: fresh } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      res.json({
        ok: true,
        simulated: simulate,
        amount,
        transferId,
        job: serializeJob(fresh[0], req.authUser),
        message: simulate
          ? `Simulated payout of $${Math.round(amount)} to ${contractor.name}.`
          : `Payout of $${Math.round(amount)} sent to ${contractor.name}.`,
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

  // ── Partners ───────────────────────────────────────────────────────────────
  /** Public lookup so customers can confirm who referred them (no private data). */
  app.get('/api/partners/lookup', async (req, res) => {
    try {
      const code = String(req.query.code || '').trim();
      if (!code) return res.status(400).json({ ok: false, message: 'Partner code required.' });
      const partner = await lookupPartnerByCode(pool, code);
      if (!partner) return res.json({ ok: true, partner: null });
      res.json({ ok: true, partner: publicPartnerView(partner) });
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

  app.post('/api/admin/partners', requireAuth, requireAdmin, async (req, res) => {
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

  app.post('/api/admin/discounts', requireAuth, requireAdmin, async (req, res) => {
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
          await pool.query(
            `UPDATE payments SET status='succeeded', stripe_payment_intent=$1
             WHERE stripe_session_id=$2`,
            [session.payment_intent || null, session.id]
          );
          const { rows: jobs } = await pool.query(`SELECT status FROM managed_jobs WHERE id=$1`, [jobId]);
          if (paymentType === 'dispatch_fee') {
            await pushStatus(pool, jobId, jobs[0]?.status, 'paid_for_dispatch', null, 'Stripe dispatch fee');
            await pushStatus(pool, jobId, 'paid_for_dispatch', 'awaiting_contractor', null, 'Ready for dispatch');
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
        // Logged via webhook_events; Connect payout status is account-level.
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

  app.get('/api/contractor/payouts', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') {
        return res.status(403).json({ ok: false, message: 'Contractors only.' });
      }
      const { rows } = await pool.query(
        `SELECT * FROM transfers WHERE contractor_user_id=$1 ORDER BY created_at DESC`,
        [req.authUser.id]
      );
      res.json({
        ok: true,
        payouts: rows.map((r) => ({
          id: Number(r.id),
          jobId: Number(r.job_id),
          amount: Number(r.amount),
          status: r.status,
          simulated: r.simulated,
          createdAt: r.created_at,
        })),
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });
}
