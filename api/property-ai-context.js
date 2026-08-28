/** Safe property context for AI features — never cross-property or internal admin data. */

import { assertPropertyAccess } from './property-access.js';
import { classifyDiyRisk, safetySystemPrompt } from './diy-safety.js';

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function equipmentSummary(homeSystems = []) {
  return (Array.isArray(homeSystems) ? homeSystems : [])
    .filter((s) => s && (s.brand || s.installedYear || s.lastService || s.notes))
    .slice(0, 20)
    .map((s) => {
      const bits = [s.name || s.key, s.brand, s.installedYear ? `installed ${s.installedYear}` : null]
        .filter(Boolean)
        .join(' ');
      return bits || s.name || s.key;
    });
}

/**
 * Build sanitized property AI context for an authorized homeowner.
 * @param {object} pool
 * @param {number} propertyId
 * @param {number} userId
 */
export async function buildPropertyAIContext(pool, propertyId, userId) {
  const access = await assertPropertyAccess(pool, propertyId, userId);
  if (!access) return null;
  const { rows } = await pool.query(`SELECT p.* FROM properties p WHERE p.id = $1`, [propertyId]);
  const property = rows[0];
  if (!property) return null;

  const health = parseJson(property.health_profile, {}) || {};
  const passport = health.passport || {};
  const maintenance = Array.isArray(health.maintenance) ? health.maintenance.slice(0, 12) : [];
  const systems = equipmentSummary(parseJson(property.home_systems, []));

  const { rows: jobRows } = await pool.query(
    `SELECT id, title, category, status, created_at, customer_retail_estimate_high, completion_report
     FROM managed_jobs
     WHERE property_id = $1 AND homeowner_user_id = $2
     ORDER BY created_at DESC LIMIT 12`,
    [propertyId, property.owner_user_id]
  );

  const lines = [
    `Property: ${property.label || property.address_line1 || `Home #${property.id}`}`,
    `Address: ${[property.address_line1, property.city, property.state, property.zip].filter(Boolean).join(', ')}`,
  ];
  if (property.year_built) lines.push(`Year built: ${property.year_built}`);
  if (property.beds != null) lines.push(`Beds: ${property.beds}`);
  if (property.baths != null) lines.push(`Baths: ${property.baths}`);
  if (property.sqft) lines.push(`Sq ft: ${property.sqft}`);
  if (systems.length) lines.push(`Systems/equipment: ${systems.join('; ')}`);
  if (maintenance.length) {
    lines.push(
      `Upcoming maintenance: ${maintenance.map((m) => `${m.label}${m.dueDate ? ` (due ${m.dueDate})` : ''}`).join('; ')}`
    );
  }
  if (jobRows.length) {
    lines.push('Recent service history:');
    for (const j of jobRows.slice(0, 8)) {
      const amt = j.customer_retail_estimate_high != null ? ` ~$${j.customer_retail_estimate_high}` : '';
      lines.push(`- ${j.title || j.category} (${j.status})${amt}`);
    }
  }
  const warranties = Array.isArray(passport.warranties) ? passport.warranties.slice(0, 8) : [];
  if (warranties.length) {
    lines.push(`Warranties on file: ${warranties.map((w) => w.name).join('; ')}`);
  }

  return {
    propertyId: Number(property.id),
    text: lines.join('\n'),
    summary: {
      label: property.label,
      addressLine1: property.address_line1,
      city: property.city,
      state: property.state,
      zip: property.zip,
      yearBuilt: property.year_built,
      maintenanceCount: maintenance.length,
      serviceHistoryCount: jobRows.length,
    },
  };
}

/**
 * Orchestrated context for the unified Home Assistant.
 */
export async function buildHomeAssistantContext(pool, { userId, propertyId, jobId, intent, userMessage }) {
  const parts = [];
  let risk = { level: 'MODERATE', reason: null };
  if (userMessage) risk = classifyDiyRisk(userMessage);

  if (propertyId) {
    const propCtx = await buildPropertyAIContext(pool, propertyId, userId);
    if (propCtx) {
      parts.push('=== PROPERTY PASSPORT ===');
      parts.push(propCtx.text);
    }
    try {
      const { rows: prefs } = await pool.query(
        `SELECT pc.service_type, u.name, u.company_name
         FROM preferred_contractors pc
         JOIN users u ON u.id = pc.contractor_user_id
         WHERE pc.property_id=$1 AND pc.owner_user_id=$2`,
        [propertyId, userId]
      );
      if (prefs.length) {
        parts.push('Preferred providers:');
        for (const p of prefs) {
          parts.push(`- ${p.service_type}: ${p.company_name || p.name}`);
        }
      }
    } catch {
      /* table may not exist yet */
    }
  }

  if (jobId) {
    const { rows: jobs } = await pool.query(
      `SELECT j.*, p.retail_amount, p.status AS proposal_status
       FROM managed_jobs j
       LEFT JOIN proposals p ON p.job_id = j.id AND p.id = (
         SELECT id FROM proposals WHERE job_id = j.id ORDER BY created_at DESC LIMIT 1
       )
       WHERE j.id = $1 AND j.homeowner_user_id = $2`,
      [jobId, userId]
    );
    const job = jobs[0];
    if (job) {
      parts.push('=== CURRENT JOB ===');
      parts.push(`Title: ${job.title || job.category}`);
      parts.push(`Status: ${job.status}`);
      parts.push(`Description: ${(job.description || '').slice(0, 500)}`);
      if (job.retail_amount != null) parts.push(`Quote total (customer): $${job.retail_amount}`);
      if (job.ai_assessment) {
        const a = parseJson(job.ai_assessment, {});
        if (a?.summary) parts.push(`AI assessment: ${String(a.summary).slice(0, 400)}`);
      }
      if (propertyId) {
        const rr = await buildRepairReplaceContext(pool, propertyId, userId, job);
        if (rr?.summary) {
          parts.push('=== REPAIR VS REPLACE ADVISORY CONTEXT (advisory only) ===');
          parts.push(rr.summary);
        }
      }
    }
  } else if (propertyId && userMessage) {
    const rr = await buildRepairReplaceContext(pool, propertyId, userId, { category: intent, description: userMessage });
    if (rr?.summary) {
      parts.push('=== REPAIR VS REPLACE ADVISORY CONTEXT (advisory only) ===');
      parts.push(rr.summary);
    }
  }

  const systemRules = [
    'You are FixBridge Home Assistant — one property-aware helper for repairs, maintenance, quotes, and recurring care.',
    'Ask ONE useful question at a time. Do not dump long forms. Never ask more than one question mark in a single reply unless giving emergency safety instructions.',
    'Use property context you already have — do not re-ask known facts unless confirming.',
    'Never expose contractor internal costs, margins, or admin notes.',
    'For repair vs replacement: give advisory context only. Never say the homeowner must replace equipment unless there is a safety emergency.',
    'When enough context exists, suggest clear next actions: DIY (if safe), Remote Quote, Site Visit, or Recurring Service.',
    safetySystemPrompt(risk.level),
    intent ? `User intent hint: ${intent}` : '',
  ].filter(Boolean);

  return {
    contextText: parts.join('\n'),
    systemRules: systemRules.join('\n'),
    riskLevel: risk.level,
    suggestedActions: buildSuggestedActions(risk.level, intent),
  };
}

function buildSuggestedActions(riskLevel, intent) {
  const actions = [];
  if (riskLevel === 'EMERGENCY' || riskLevel === 'HIGH') {
    actions.push({ id: 'site_visit', label: 'Schedule Site Visit' });
    return actions;
  }
  if (intent === 'recurring' || /clean|landscap|every\s+(week|two weeks|month)/i.test(intent || '')) {
    actions.push({ id: 'recurring_cleaning', label: 'Set Up Recurring Cleaning' });
    actions.push({ id: 'recurring_landscaping', label: 'Set Up Recurring Landscaping' });
  }
  actions.push({ id: 'diy', label: 'Try Safe DIY' });
  actions.push({ id: 'remote_quote', label: 'Request Remote Quote' });
  actions.push({ id: 'site_visit', label: 'Schedule Site Visit' });
  return actions;
}

export { classifyDiyRisk, safetySystemPrompt };

/**
 * Advisory repair-vs-replace context — no hard thresholds, contextual summary only.
 */
export async function buildRepairReplaceContext(pool, propertyId, userId, jobOrHint = null) {
  const { rows } = await pool.query(`SELECT p.* FROM properties p WHERE p.id=$1`, [propertyId]);
  const property = rows[0];
  if (!property) return null;

  const homeSystems = parseJson(property.home_systems, []) || [];
  const health = parseJson(property.health_profile, {}) || {};
  const warranties = Array.isArray(health.passport?.warranties) ? health.passport.warranties : [];

  const category = String(jobOrHint?.category || jobOrHint?.title || '').toLowerCase();
  const systemKey = category.includes('hvac')
    ? 'hvac'
    : category.includes('water')
      ? 'water_heater'
      : category.includes('roof')
        ? 'roof'
        : category.includes('appliance')
          ? 'refrigerator'
          : null;

  const equipment = systemKey
    ? homeSystems.find((s) => s && String(s.key).toLowerCase() === systemKey)
    : homeSystems.find((s) => s && (s.brand || s.installedYear || s.lastService));

  const { rows: relatedJobs } = await pool.query(
    `SELECT id, title, category, status, created_at, customer_retail_estimate_high, completion_report
     FROM managed_jobs
     WHERE property_id=$1 AND homeowner_user_id=$2
     ORDER BY created_at DESC LIMIT 20`,
    [propertyId, property.owner_user_id]
  );

  const related = relatedJobs.filter((j) => {
    const cat = String(j.category || j.title || '').toLowerCase();
    if (!systemKey) return true;
    if (systemKey === 'hvac') return /hvac|furnace|ac\b|air/.test(cat);
    if (systemKey === 'water_heater') return /water|plumb/.test(cat);
    if (systemKey === 'roof') return /roof/.test(cat);
    return cat.includes(systemKey);
  });

  const completed = related.filter((j) => ['completed', 'closed', 'work_completed'].includes(String(j.status).toLowerCase()));
  const repairCount = completed.length;
  const recentCosts = completed
    .map((j) => (j.customer_retail_estimate_high != null ? Number(j.customer_retail_estimate_high) : null))
    .filter((n) => n != null);
  const cumulativeRecent = recentCosts.slice(0, 3).reduce((a, b) => a + b, 0);

  const installedYear = equipment?.installedYear ? Number(String(equipment.installedYear).slice(0, 4)) : null;
  const approximateAge =
    installedYear && Number.isFinite(installedYear) ? new Date().getFullYear() - installedYear : null;

  const warrantyActive = warranties.some(
    (w) =>
      w &&
      (!systemKey || String(w.equipmentLabel || w.name || '').toLowerCase().includes(systemKey.replace('_', ' '))) &&
      (!w.expiresAt || new Date(w.expiresAt) > new Date())
  );

  const lines = [];
  if (equipment?.brand || equipment?.name) {
    lines.push(`Equipment on file: ${[equipment.name, equipment.brand, equipment.model].filter(Boolean).join(' ')}`);
  }
  if (approximateAge != null) lines.push(`Approximate age: ~${approximateAge} years`);
  if (equipment?.lastService) lines.push(`Last service: ${equipment.lastService}`);
  if (repairCount) lines.push(`Related completed repairs/visits on record: ${repairCount}`);
  if (cumulativeRecent > 0) lines.push(`Recent related spend (last ${Math.min(3, recentCosts.length)} jobs): ~$${cumulativeRecent}`);
  if (warrantyActive) lines.push('Warranty: active coverage may apply — repair could be preferable while covered.');
  if (jobOrHint?.retail_amount != null) lines.push(`Current quote under review: $${jobOrHint.retail_amount}`);

  if (!lines.length) return { summary: null, factors: {} };

  return {
    summary: `${lines.join('. ')}. Use this only for balanced advisory guidance — compare repair vs replacement when age/history/cost suggest it, without commanding a decision.`,
    factors: {
      approximateAge,
      repairCount,
      cumulativeRecent,
      warrantyActive,
      equipmentName: equipment?.name || null,
    },
  };
}

export function sanitizeQuoteForSecondOpinion(proposal, job) {
  const lineItems = Array.isArray(proposal?.lineItems)
    ? proposal.lineItems.map((li) => ({
        label: li.label || li.description || 'Line item',
        amount: li.amount ?? li.total ?? null,
        quantity: li.quantity ?? 1,
      }))
    : [];
  return {
    jobTitle: job?.title || null,
    jobCategory: job?.category || null,
    jobDescription: job?.description || null,
    proposalTitle: proposal?.title || null,
    proposalNotes: proposal?.notes || proposal?.scopeSummary || null,
    lineItems,
    totalAmount: proposal?.totalAmount ?? proposal?.amount ?? null,
    customerRetailEstimateLow: job?.customer_retail_estimate_low ?? null,
    customerRetailEstimateHigh: job?.customer_retail_estimate_high ?? null,
  };
}
