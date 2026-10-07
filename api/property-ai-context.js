/** Safe property context for AI features — never cross-property or internal admin data. */

import { assertPropertyAccess } from './property-access.js';
import { reportedMaterials } from './reported-materials.js';
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
    .filter((s) => s && (s.brand || s.model || s.serialNumber || s.serial || s.installedYear || s.lastService || s.notes))
    .slice(0, 20)
    .map((s) => {
      const bits = [
        s.name || s.key,
        s.brand,
        s.model ? `model ${s.model}` : null,
        s.serialNumber || s.serial ? `serial ${s.serialNumber || s.serial}` : null,
        s.installedYear ? `installed ${s.installedYear}` : null,
        s.lastService ? `last serviced ${s.lastService}` : null,
      ]
        .filter(Boolean)
        .join(' ');
      return bits || s.name || s.key;
    });
}

function isConfirmedMemoryRecord(record) {
  if (!record || typeof record !== 'object') return false;
  if (record.ignored === true || record.dismissed === true) return false;
  const verification = String(record.verification || (record.modelConfirmed ? 'confirmed' : '')).toLowerCase();
  const source = String(record.source || '').toLowerCase();
  if (verification === 'confirmed' || source === 'confirmed' || source === 'homeowner') return true;
  return false;
}

function confirmedEquipmentLines(homeSystems = []) {
  return (Array.isArray(homeSystems) ? homeSystems : [])
    .filter(isConfirmedMemoryRecord)
    .slice(0, 12)
    .map((s) => {
      const label = [
        s.name || s.key,
        s.brand,
        s.model ? `model ${s.model}` : null,
        s.serialNumber || s.serial ? `serial ${s.serialNumber || s.serial}` : null,
      ].filter(Boolean).join(' ');
      const extras = [s.installedYear ? `installed ${s.installedYear}` : null, s.lastService ? `last serviced ${s.lastService}` : null]
        .filter(Boolean)
        .join(', ');
      return extras ? `${label} (${extras})` : label;
    })
    .filter(Boolean);
}

function detectIntentFromMessage(userMessage, jobContext = null) {
  const msg = String(userMessage || '').toLowerCase();
  if (/quote|expensive|reasonable|too high|make sense|pricing/.test(msg)) return 'quote_second_opinion';
  if (/same\s+(cleaner|landscaper|contractor|provider|guy|person)/.test(msg) || /same\s+as\s+last/.test(msg)) {
    return 'same_provider';
  }
  if (
    /every\s+(week|two weeks|month)|twice\s+a\s+month|biweekly|recurring|clean\s+every|mow|lawn\s+cut|landscap/.test(
      msg
    )
  ) {
    return 'recurring';
  }
  if (jobContext?.hasQuote) return null;
  return null;
}

/**
 * Build sanitized property AI context for an authorized homeowner.
 * @param {object} pool
 * @param {number} propertyId
 * @param {number} userId
 */
export async function buildPropertyAIContext(pool, propertyId, userId, options = {}) {
  const { includeAddress = true, includeProDetails = true } = options;
  const equipmentKey = String(options.equipmentKey || '').trim();
  const access = await assertPropertyAccess(pool, propertyId, userId);
  if (!access) return null;
  const { rows } = await pool.query(
    `SELECT p.* FROM properties p WHERE p.id = $1 AND p.owner_user_id = $2`,
    [propertyId, access.owner_user_id]
  );
  const property = rows[0];
  if (!property) return null;

  const health = parseJson(property.health_profile, {}) || {};
  const passport = health.passport || {};
  const maintenance = includeProDetails && Array.isArray(health.maintenance) ? health.maintenance.slice(0, 12) : [];
  const previousServices = Array.isArray(health.previousServices) ? health.previousServices.slice(0, 20) : [];
  const storedSystems = parseJson(property.home_systems, []) || [];
  const homeSystems = Array.isArray(storedSystems)
    ? storedSystems.filter((record) => record && record.ignored !== true && record.dismissed !== true)
    : [];
  const confirmedSystems = confirmedEquipmentLines(homeSystems);
  const systems = confirmedSystems.length ? confirmedSystems : equipmentSummary(homeSystems);

  const { rows: jobRows } = await pool.query(
    `SELECT id, title, category, equipment_key, status, created_at, customer_confirmed_at, completion_report
     FROM managed_jobs
     WHERE property_id = $1 AND homeowner_user_id = $2
       AND ($3::text IS NULL OR equipment_key=$3 OR equipment_key IS NULL)
     ORDER BY created_at DESC LIMIT 12`,
    [propertyId, property.owner_user_id, equipmentKey || null]
  );
  const selectedEquipment = equipmentKey && Array.isArray(homeSystems)
    ? homeSystems.find((item) => item?.key === equipmentKey)
    : null;
  const relevantPreviousServices = equipmentKey
    ? previousServices.filter((service) => !service.equipmentKey || service.equipmentKey === equipmentKey)
    : previousServices;

  const lines = [
    `Property: ${property.label || property.address_line1 || `Home #${property.id}`}`,
  ];
  if (includeAddress) {
    lines.push(`Address: ${[property.address_line1, property.city, property.state, property.zip].filter(Boolean).join(', ')}`);
  } else {
    const locality = [property.city, property.state, property.zip].filter(Boolean).join(', ');
    if (locality) lines.push(`Market area: ${locality}`);
  }
  if (property.year_built) lines.push(`Year built: ${property.year_built}`);
  if (property.beds != null) lines.push(`Beds: ${property.beds}`);
  if (property.baths != null) lines.push(`Baths: ${property.baths}`);
  if (property.sqft) lines.push(`Sq ft: ${property.sqft}`);
  if (systems.length) {
    lines.push(
      confirmedSystems.length
        ? `Confirmed home systems/equipment: ${systems.join('; ')}`
        : `Systems/equipment: ${systems.join('; ')}`
    );
  }
  if (selectedEquipment) {
    const identity = [selectedEquipment.name, selectedEquipment.brand, selectedEquipment.model ? `model ${selectedEquipment.model}` : ''].filter(Boolean).join(' ');
    const modelSource = selectedEquipment.modelConfirmed ? 'confirmed' : selectedEquipment.modelSource || 'homeowner-reported';
    lines.push(`Selected equipment for this repair: ${identity || equipmentKey}${selectedEquipment.model ? ` (${modelSource})` : ''}`);
  }
  if (maintenance.length) {
    lines.push(
      `Upcoming maintenance: ${maintenance.map((m) => `${m.label}${m.dueDate ? ` (due ${m.dueDate})` : ''}`).join('; ')}`
    );
  }
  if (jobRows.length) {
    lines.push('Recent service history (reported outcomes are not verified diagnoses):');
    for (const j of jobRows.slice(0, 8)) {
      const report = parseJson(j.completion_report, {}) || {};
      const diy = report.fixeraDiy && typeof report.fixeraDiy === 'object' ? report.fixeraDiy : {};
      const diyOutcome = diy.outcome === 'CUSTOMER_CONFIRMED_FIXED'
        ? 'HOMEOWNER_REPORTED_FIXED'
        : diy.outcome === 'CUSTOMER_CONFIRMED_STILL_BROKEN'
          ? 'HOMEOWNER_REPORTED_STILL_BROKEN'
          : null;
      const source = j.customer_confirmed_at ? 'CUSTOMER_CONFIRMED' : diyOutcome || 'TECHNICIAN_REPORTED';
      const diagnosis = report.actualDiagnosis || report.diagnosis || report.findings || null;
      const repair = report.actualRepair || report.repairPerformed || report.workPerformed || report.summary || null;
      const parts = reportedMaterials(report).join(', ');
      const diyDetails = diyOutcome
        ? `Fixera DIY outcome: ${diyOutcome}; action: ${String(diy.latestOutcomeDetails?.actualAction || 'not specified').slice(0, 160)}; parts: ${(diy.latestOutcomeDetails?.partsUsed || []).slice(0, 8).join(', ') || 'not specified'}; homeowner-reported, not a verified diagnosis`
        : '';
      const equipment = Array.isArray(homeSystems)
        ? homeSystems.find((item) => item?.key === j.equipment_key)
        : null;
      const equipmentDetail = equipment
        ? `equipment: ${[equipment.name, equipment.brand, equipment.model ? `model ${equipment.model}` : ''].filter(Boolean).join(' ')}`
        : j.equipment_key ? `equipment key: ${j.equipment_key}` : '';
      const details = [diagnosis ? `finding: ${String(diagnosis).slice(0, 180)}` : '', repair ? `work: ${String(repair).slice(0, 180)}` : '', parts ? `parts: ${parts.slice(0, 120)}` : '', diyDetails]
        .filter(Boolean)
        .join('; ');
      lines.push(`- ${j.title || j.category} (${j.status}; ${source})${equipmentDetail ? `; ${equipmentDetail}` : ''}${details ? ` — ${details}` : ''}`);
    }
  }
  if (relevantPreviousServices.length) {
    lines.push('Additional homeowner service history (use reported outcomes as context, not as a diagnosis):');
    for (const service of relevantPreviousServices) {
      const detail = [service.title, service.notes].filter(Boolean).map((value) => String(value).slice(0, 180)).join(' — ');
      if (detail) lines.push(`- ${detail} (${service.verification || service.source || 'USER_REPORTED'})`);
    }
  }
  const warranties = includeProDetails && Array.isArray(passport.warranties) ? passport.warranties.slice(0, 8) : [];
  if (warranties.length) {
    lines.push(
      `Warranties on file: ${warranties.map((w) => `${w.name}${w.expiresAt ? ` (expires ${w.expiresAt})` : ''}`).join('; ')}`
    );
  }

  const docs = includeProDetails ? (await pool.query(
    `SELECT id, category, system_key FROM property_documents
     WHERE property_id=$1 AND owner_user_id=$2
       AND ($3::text IS NULL OR system_key=$3 OR system_key IS NULL)
     ORDER BY created_at DESC LIMIT 6`,
    [propertyId, property.owner_user_id, equipmentKey || null]
  )).rows.map(d => ({ id: Number(d.id), category: d.category, systemKey: d.system_key || null,
    source: 'DOCUMENT_VAULT_METADATA', analysisStatus: 'not_analyzed' })) : [];
  if (docs.length) {
    lines.push(`Document vault: ${docs.map(d => d.category || 'document').join('; ')}. Metadata only; contents not analyzed. Do not infer equipment facts, diagnoses or warranty coverage from these files.`);
  }

  return {
    propertyId: Number(property.id),
    text: lines.join('\n'),
    memory: {
      id: Number(property.id),
      label: property.label || null,
      homeSystems: Array.isArray(homeSystems) ? homeSystems.slice(0, 20) : [],
      previousServices: [
        ...jobRows.slice(0, 8).map((j) => {
        const report = parseJson(j.completion_report, {}) || {};
        const diy = report.fixeraDiy && typeof report.fixeraDiy === 'object' ? report.fixeraDiy : {};
        const diyVerification = diy.outcome === 'CUSTOMER_CONFIRMED_FIXED'
          ? 'CUSTOMER_CONFIRMED_OUTCOME'
          : diy.outcome === 'CUSTOMER_CONFIRMED_STILL_BROKEN'
            ? 'CUSTOMER_REPORTED_STILL_BROKEN'
            : null;
        return {
          id: Number(j.id),
          title: j.title || j.category || 'FixBridge service',
          category: j.category || null,
          equipmentKey: j.equipment_key || null,
          equipment: Array.isArray(homeSystems) ? homeSystems.find((item) => item?.key === j.equipment_key) || null : null,
          status: j.status || null,
          date: j.created_at || null,
          source: j.customer_confirmed_at ? 'CUSTOMER_CONFIRMED' : diyVerification || 'TECHNICIAN_REPORTED',
          verification: j.customer_confirmed_at ? 'CUSTOMER_CONFIRMED' : diyVerification || 'TECHNICIAN_REPORTED',
          diagnosis: report.actualDiagnosis || report.diagnosis || report.findings || null,
          repair: report.actualRepair || report.repairPerformed || report.workPerformed || report.summary || null,
          partsUsed: reportedMaterials(report),
          diyOutcome: diy.outcome || null,
          diyActualAction: diy.latestOutcomeDetails?.actualAction || null,
          diyPartsUsed: Array.isArray(diy.latestOutcomeDetails?.partsUsed) ? diy.latestOutcomeDetails.partsUsed.slice(0, 12) : [],
          diyToolsUsed: Array.isArray(diy.latestOutcomeDetails?.toolsUsed) ? diy.latestOutcomeDetails.toolsUsed.slice(0, 12) : [],
          diyReportedCost: diy.latestOutcomeDetails?.cost ?? null,
          completedStepIndexes: Array.isArray(diy.completedStepIndexes) ? diy.completedStepIndexes.slice(0, 40) : [],
        };
        }),
        ...relevantPreviousServices,
      ].filter((service, index, all) => all.findIndex((item) => item.id === service.id) === index).slice(0, 20),
      passport: includeProDetails ? {
        warranties: Array.isArray(passport.warranties) ? passport.warranties.slice(0, 8) : [],
        documents: docs,
        maintenance,
      } : {},
    },
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

  let jobContext = null;
  let preferredProviders = [];

  if (propertyId) {
    const propCtx = await buildPropertyAIContext(pool, propertyId, userId);
    if (propCtx) {
      parts.push('=== PROPERTY PASSPORT ===');
      parts.push(propCtx.text);
    }
    try {
      const { rows: prefs } = await pool.query(
        `SELECT pc.service_type, pc.is_favorite, u.name, u.company_name
         FROM preferred_contractors pc
         JOIN users u ON u.id = pc.contractor_user_id
         WHERE pc.property_id=$1 AND pc.owner_user_id=$2`,
        [propertyId, userId]
      );
      preferredProviders = prefs;
      if (prefs.length) {
        parts.push('Preferred providers:');
        for (const p of prefs) {
          const fav = p.is_favorite ? ' (favorite)' : '';
          parts.push(`- ${p.service_type}: ${p.company_name || p.name}${fav}`);
        }
      }
    } catch {
      /* table may not exist yet */
    }

    try {
      const { rows: recurring } = await pool.query(
        `SELECT service_type, recurrence, status, next_service_date
         FROM recurring_services
         WHERE property_id=$1 AND owner_user_id=$2 AND status IN ('active','paused')
         ORDER BY next_service_date ASC NULLS LAST LIMIT 6`,
        [propertyId, userId]
      );
      if (recurring.length) {
        parts.push('Recurring home care plans:');
        for (const r of recurring) {
          const label = r.service_type === 'recurring_landscaping' ? 'Landscaping' : 'Cleaning';
          const next = r.next_service_date ? String(r.next_service_date).slice(0, 10) : 'not scheduled';
          parts.push(`- ${label} (${r.recurrence}, ${r.status}) — next plan date: ${next}`);
        }
      }
    } catch {
      /* optional */
    }


  }

  if (jobId) {
    const { rows: jobs } = await pool.query(
      `SELECT j.*, p.retail_amount, p.status AS proposal_status, p.line_items
       FROM managed_jobs j
       LEFT JOIN proposals p ON p.job_id = j.id AND p.id = (
         SELECT id FROM proposals WHERE job_id = j.id ORDER BY created_at DESC LIMIT 1
       )
       WHERE j.id = $1 AND j.homeowner_user_id = $2`,
      [jobId, userId]
    );
    const job = jobs[0];
    if (job) {
      jobContext = { hasQuote: job.retail_amount != null || job.proposal_status === 'sent' };
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

  const resolvedIntent = intent || detectIntentFromMessage(userMessage, jobContext) || null;

  const systemRules = [
    'You are FixBridge Home Assistant — one property-aware helper for repairs, maintenance, quotes, and recurring care.',
    'Ask ONE useful question at a time. Do not dump long forms. Never ask more than one question mark in a single reply unless giving emergency safety instructions.',
    'Use property context you already have — do not re-ask known facts unless confirming (e.g. reference HVAC brand from passport).',
    'Never expose contractor internal costs, margins, or admin notes.',
    'For repair vs replacement: give advisory context only. Never say the homeowner must replace equipment unless there is a safety emergency.',
    'When enough context exists, suggest clear next actions: DIY (if safe), Remote Quote, Site Visit, or Recurring Service.',
    safetySystemPrompt(risk.level),
    resolvedIntent ? `Detected user intent: ${resolvedIntent}` : '',
  ].filter(Boolean);

  return {
    contextText: parts.join('\n'),
    systemRules: systemRules.join('\n'),
    riskLevel: risk.level,
    suggestedActions: buildSuggestedActions(risk.level, resolvedIntent, {
      userMessage,
      jobContext,
      preferredProviders,
    }),
    resolvedIntent,
  };
}

function buildSuggestedActions(riskLevel, intent, { userMessage = '', jobContext = null, preferredProviders = [] } = {}) {
  const actions = [];
  const msg = String(userMessage || '').toLowerCase();

  if (riskLevel === 'EMERGENCY' || riskLevel === 'HIGH') {
    actions.push({ id: 'site_visit', label: 'Schedule Site Visit' });
    return actions;
  }

  const wantsQuoteOpinion =
    intent === 'quote_second_opinion' || /quote|expensive|reasonable|too high|make sense/.test(msg);
  if (wantsQuoteOpinion && jobContext?.hasQuote) {
    actions.push({ id: 'quote_second_opinion', label: 'Review My Quote' });
  }

  const wantsRecurring =
    intent === 'recurring' || /clean|landscap|every\s+(week|two weeks|month)|mow|lawn/.test(msg);
  if (wantsRecurring) {
    if (/landscap|mow|lawn|yard/.test(msg)) {
      actions.push({ id: 'recurring_landscaping', label: 'Set Up Recurring Landscaping' });
    } else if (/clean/.test(msg)) {
      actions.push({ id: 'recurring_cleaning', label: 'Set Up Recurring Cleaning' });
    } else {
      actions.push({ id: 'recurring_cleaning', label: 'Set Up Recurring Cleaning' });
      actions.push({ id: 'recurring_landscaping', label: 'Set Up Recurring Landscaping' });
    }
  }

  const wantsSameProvider =
    intent === 'same_provider' || /same\s+(cleaner|landscaper|contractor|provider)/.test(msg);
  if (wantsSameProvider && preferredProviders.length) {
    actions.push({ id: 'remote_quote', label: 'Request Same Provider' });
  }

  if (riskLevel === 'LOW' || riskLevel === 'MODERATE') {
    actions.push({ id: 'diy', label: 'Try Safe DIY' });
  }
  actions.push({ id: 'remote_quote', label: 'Request Remote Quote' });
  actions.push({ id: 'site_visit', label: 'Schedule Site Visit' });

  const seen = new Set();
  return actions.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
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
