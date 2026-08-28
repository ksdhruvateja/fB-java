/** Safe property context for AI features — never cross-property or internal admin data. */

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
  const { rows } = await pool.query(
    `SELECT p.* FROM properties p
     LEFT JOIN household_memberships hm ON hm.property_id = p.id AND hm.user_id = $2
     WHERE p.id = $1 AND (p.owner_user_id = $2 OR hm.id IS NOT NULL)`,
    [propertyId, userId]
  );
  const property = rows[0];
  if (!property) return null;

  const health = parseJson(property.health_profile, {}) || {};
  const passport = health.passport || {};
  const maintenance = Array.isArray(health.maintenance) ? health.maintenance.slice(0, 12) : [];
  const systems = equipmentSummary(parseJson(property.home_systems, []));

  const { rows: jobRows } = await pool.query(
    `SELECT id, title, category, status, created_at
     FROM managed_jobs
     WHERE property_id = $1 AND homeowner_user_id = $2
     ORDER BY created_at DESC LIMIT 8`,
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
    lines.push(
      `Recent service history: ${jobRows.map((j) => `${j.title || j.category} (${j.status})`).join('; ')}`
    );
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
