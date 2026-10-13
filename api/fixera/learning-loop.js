import { randomUUID } from 'node:crypto';
import { persistFixeraInteraction, recordFixeraInteraction } from './experience/store.js';

/*
 * Fixera learning loop (no model training happens here):
 *   1. Record: chat turns, case outcomes (DIY fixed / still broken / professional requested or
 *      completed, safety-popup decisions, feedback) and professional findings are stored and
 *      linked to the assessment they belong to.
 *   2. Review: admins approve, correct or reject each case before it is reused or exported.
 *   3. Reuse: approved cases similar to a new request are added to the prompt as reference.
 * Text that can leave a case (review queue, reuse, export) goes through scrubPii first.
 */

const ASSESSMENT_TASKS = ['repair_assessment', 'reassessment'];
const OUTCOME_TYPES = new Set([
  'DIY_FIXED',
  'DIY_STILL_BROKEN',
  'PROFESSIONAL_REQUESTED',
  'PROFESSIONAL_COMPLETED',
  'SAFETY_CONFIRMED',
  'SAFETY_DECLINED',
  'USER_FEEDBACK',
]);

/** Removes contact details and street addresses from free text. */
export function scrubPii(value, max = 400) {
  let t = String(value || '');
  t = t.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]');
  t = t.replace(/https?:\/\/\S+/gi, '[link]');
  t = t.replace(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[phone]');
  t = t.replace(/\b\d{1,6}\s+(?:[A-Z][a-z]+\s){0,3}(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|way|pl|place|ter|terrace|cir|circle|pkwy|parkway|hwy|highway)\b\.?/gi, '[address]');
  t = t.replace(/\b(?:apt|apartment|unit|suite|ste)\.?\s*#?\s*\w+/gi, '[unit]');
  t = t.replace(/\b\d{5}(?:-\d{4})?\b/g, '[zip]');
  t = t.replace(/\b(?:my name is|i am|i'm)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g, (m) => m.replace(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?$/, '[name]'));
  return t.replace(/\s+/g, ' ').trim().slice(0, max);
}

function list(value, n, max = 200) {
  return (Array.isArray(value) ? value : [])
    .map((v) => (typeof v === 'string' ? v : v?.name || v?.instruction || v?.title || ''))
    .map((v) => scrubPii(v, max))
    .filter(Boolean)
    .slice(0, n);
}

/** The de-identified record of a case that review, reuse and export work from. */
export function buildCasePayload(assessment, { category, description } = {}) {
  const a = assessment || {};
  return {
    category: String(category || a.category || 'other').toLowerCase().slice(0, 60),
    problem: scrubPii(description, 400),
    diagnosis: scrubPii(a.summary, 400),
    likely_causes: list(a.likely_causes, 4),
    recommended_trade: a.recommended_trade || null,
    safety: {
      level: a.diy_risk_level || null,
      decision: a.diy_safety?.decision || null,
      factors: (a.diy_safety?.factors || []).map((f) => `${f.code}:${f.severity}`).slice(0, 8),
    },
    assessment_stage: a.assessment_stage || null,
    diy_steps: list(a.diy_steps, 8, 240),
    parts: list(a.materials_needed, 8, 80),
    follow_up_maintenance: list((a.follow_up_maintenance || []).map((m) => m.task), 4, 120),
  };
}

/** Adds the de-identified case record to an assessment interaction before it is persisted. */
export function attachCasePayload(interaction, { assessment, category, description }) {
  if (!interaction) return interaction;
  interaction.case_payload = assessment ? buildCasePayload(assessment, { category, description }) : null;
  interaction.case_category = String(category || assessment?.category || '').toLowerCase().slice(0, 60) || null;
  return interaction;
}

/** Records a chat turn (DIY chat, general Fixera chat, Home Assistant). */
export async function recordChatForLearning(pool, {
  userId, userRole = 'homeowner', jobId = null, propertyId = null, task = 'diy_chat',
  userMessage, reply, riskLevel = null, provider = null, model = null, blockedBy = null, guardrailRemovals = 0,
}) {
  if (!pool) return null;
  const interaction = recordFixeraInteraction({
    requestId: randomUUID(),
    userId,
    userRole,
    jobId,
    caseId: jobId,
    caseType: jobId ? 'managed_job' : null,
    propertyId,
    task,
    inputSummary: scrubPii(userMessage, 180),
    outputSummary: scrubPii(reply, 240),
    provider,
    model,
    success: Boolean(reply),
    failureCode: blockedBy,
    safety: riskLevel,
    evaluator: blockedBy ? 'safety_policy' : guardrailRemovals ? `guardrails_removed_${guardrailRemovals}` : 'recorded',
  });
  interaction.case_payload = {
    chat: true,
    question: scrubPii(userMessage, 400),
    answer: scrubPii(reply, 800),
    risk_level: riskLevel,
    blocked_by: blockedBy,
    guardrail_removals: guardrailRemovals,
  };
  try {
    await persistFixeraInteraction(pool, interaction);
  } catch (e) {
    console.warn('[fixera] chat capture failed', e?.message || e);
  }
  return interaction;
}

async function latestAssessmentInteraction(pool, jobId) {
  const { rows } = await pool.query(
    `SELECT id FROM fixera_interactions
      WHERE job_id=$1 AND task_type = ANY($2::text[]) AND success IS TRUE
      ORDER BY created_at DESC LIMIT 1`,
    [jobId, ASSESSMENT_TASKS]
  );
  return rows[0]?.id || null;
}

/**
 * Records what actually happened on a case and attaches it to the assessment it tests.
 * A professional's findings become the case's correction and put it back in the review queue.
 */
export async function recordCaseOutcome(pool, { jobId, outcome, source, details = {}, actorUserId = null }) {
  if (!pool || !jobId || !OUTCOME_TYPES.has(outcome)) return null;
  const interactionId = await latestAssessmentInteraction(pool, jobId);
  const clean = {
    action: details.action ? scrubPii(details.action, 400) : undefined,
    parts: details.parts ? list(details.parts, 10, 80) : undefined,
    observation: details.observation ? scrubPii(details.observation, 400) : undefined,
    professional_findings: details.professionalFindings ? scrubPii(details.professionalFindings, 600) : undefined,
    actual_cause: details.actualCause ? scrubPii(details.actualCause, 400) : undefined,
    diagnosis_match: details.diagnosisMatch || undefined,
    helpful: details.helpful || undefined,
    note: details.note ? scrubPii(details.note, 300) : undefined,
  };
  const { rows } = await pool.query(
    `INSERT INTO fixera_case_outcomes (job_id, interaction_id, outcome, source, details, actor_user_id)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING id, created_at`,
    [jobId, interactionId, outcome, source || null, JSON.stringify(clean), actorUserId]
  );
  if (interactionId) {
    const correction = outcome === 'PROFESSIONAL_COMPLETED' && (clean.actual_cause || clean.professional_findings)
      ? { actual_cause: clean.actual_cause || null, findings: clean.professional_findings || null, diagnosis_match: clean.diagnosis_match || null }
      : null;
    await pool.query(
      `UPDATE fixera_training_candidates
          SET outcome_type = CASE WHEN $2 IN ('SAFETY_CONFIRMED','SAFETY_DECLINED','USER_FEEDBACK') AND outcome_type IS NOT NULL THEN outcome_type ELSE $2 END,
              outcome_at = NOW(),
              payload = jsonb_set(
                jsonb_set(COALESCE(payload,'{}'::jsonb), '{outcomes}',
                  COALESCE(payload->'outcomes','[]'::jsonb) || jsonb_build_array(jsonb_build_object('outcome',$2::text,'source',$3::text,'details',$4::jsonb,'at',NOW()))),
                '{professional_correction}', COALESCE($5::jsonb, payload->'professional_correction', 'null'::jsonb)),
              -- A reviewed case goes back to review when a professional's findings arrive.
              quality_status = CASE
                WHEN $5::jsonb IS NOT NULL AND quality_status IN ('APPROVED','ADMIN_CORRECTED') THEN 'NEEDS_REREVIEW'
                ELSE quality_status END
        WHERE interaction_id=$1`,
      [interactionId, outcome, source || null, JSON.stringify(clean), correction ? JSON.stringify(correction) : null]
    );
  }
  return { id: Number(rows[0].id), interactionId };
}

const REVIEW_FILTERS = {
  needs_review: `quality_status IN ('UNREVIEWED','NEEDS_REREVIEW')`,
  with_outcome: `quality_status IN ('UNREVIEWED','NEEDS_REREVIEW') AND outcome_type IS NOT NULL`,
  approved: `approved_for_training = TRUE`,
  rejected: `quality_status IN ('TRAINING_REJECTED','SAFETY_REJECTED')`,
  all: `TRUE`,
};

export async function listReviewQueue(pool, { filter = 'with_outcome', task = 'assessment', limit = 25, offset = 0 } = {}) {
  const where = REVIEW_FILTERS[filter] || REVIEW_FILTERS.with_outcome;
  const taskWhere = task === 'chat'
    ? `category NOT IN ('repair_assessment','reassessment')`
    : task === 'all' ? 'TRUE' : `category IN ('repair_assessment','reassessment')`;
  const { rows } = await pool.query(
    `SELECT id, interaction_id, job_id, category AS task_type, case_category, quality_status, approved_for_training,
            gold_example, outcome_type, outcome_at, reviewed_at, review_notes, corrected_diagnosis, payload, created_at
       FROM fixera_training_candidates
      WHERE ${where} AND ${taskWhere}
      ORDER BY (outcome_type IS NOT NULL) DESC, COALESCE(outcome_at, created_at) DESC
      LIMIT $1 OFFSET $2`,
    [Math.min(100, Math.max(1, Number(limit) || 25)), Math.max(0, Number(offset) || 0)]
  );
  const { rows: counts } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE ${REVIEW_FILTERS.needs_review})::int AS needs_review,
       COUNT(*) FILTER (WHERE ${REVIEW_FILTERS.with_outcome})::int AS with_outcome,
       COUNT(*) FILTER (WHERE ${REVIEW_FILTERS.approved})::int AS approved,
       COUNT(*) FILTER (WHERE ${REVIEW_FILTERS.rejected})::int AS rejected
     FROM fixera_training_candidates WHERE ${taskWhere}`
  );
  return { items: rows, counts: counts[0] || {} };
}

const REVIEW_ACTIONS = new Set(['approve', 'correct', 'reject', 'safety_reject', 'reset']);

/**
 * approve: reuse and export as is. correct: approve with the reviewer's diagnosis/fix.
 * reject: never reuse. safety_reject: unsafe guidance, never reuse or export.
 */
export async function reviewCandidate(pool, id, { action, correctedDiagnosis, correctedFix, notes, gold, reviewerId }) {
  if (!REVIEW_ACTIONS.has(action)) {
    throw Object.assign(new Error('Unknown review action.'), { status: 400, code: 'INVALID_REVIEW_ACTION' });
  }
  const { rows } = await pool.query(`SELECT id, quality_status, payload FROM fixera_training_candidates WHERE id=$1`, [id]);
  const row = rows[0];
  if (!row) throw Object.assign(new Error('Case not found.'), { status: 404, code: 'CANDIDATE_NOT_FOUND' });
  if ((action === 'approve' || action === 'correct') && row.quality_status === 'SAFETY_REJECTED') {
    throw Object.assign(new Error('A safety-rejected case cannot be approved. Reset it first if this was a mistake.'), { status: 409, code: 'SAFETY_REJECTED' });
  }
  if (action === 'correct' && !String(correctedDiagnosis || '').trim()) {
    throw Object.assign(new Error('Enter the corrected diagnosis.'), { status: 400, code: 'CORRECTION_REQUIRED' });
  }
  const status = {
    approve: 'APPROVED',
    correct: 'ADMIN_CORRECTED',
    reject: 'TRAINING_REJECTED',
    safety_reject: 'SAFETY_REJECTED',
    reset: 'UNREVIEWED',
  }[action];
  const approved = action === 'approve' || action === 'correct';
  const correction = action === 'correct'
    ? { diagnosis: scrubPii(correctedDiagnosis, 600), fix: correctedFix ? scrubPii(correctedFix, 800) : null }
    : null;
  const { rows: updated } = await pool.query(
    `UPDATE fixera_training_candidates
        SET quality_status=$2,
            approved_for_training=$3,
            gold_example=CASE WHEN $3 THEN $4 ELSE FALSE END,
            corrected_diagnosis=CASE WHEN $5::jsonb IS NULL THEN corrected_diagnosis ELSE $5::jsonb->>'diagnosis' END,
            payload=CASE WHEN $5::jsonb IS NULL THEN payload ELSE jsonb_set(COALESCE(payload,'{}'::jsonb), '{reviewer_correction}', $5::jsonb) END,
            review_notes=$6,
            reviewed_by=$7,
            reviewed_at=NOW()
      WHERE id=$1
      RETURNING id, quality_status, approved_for_training, gold_example, corrected_diagnosis, reviewed_at`,
    [id, status, approved, gold === true, correction ? JSON.stringify(correction) : null, notes ? String(notes).slice(0, 1000) : null, reviewerId || null]
  );
  return updated[0];
}

function tsQueryTerms(text) {
  const stop = new Set(['the', 'and', 'with', 'from', 'that', 'this', 'have', 'there', 'when', 'what', 'into', 'just', 'repair', 'issue', 'problem']);
  const words = String(text || '').toLowerCase().match(/[a-z]{3,}/g) || [];
  return [...new Set(words.filter((w) => !stop.has(w)))].slice(0, 16).join(' | ');
}

/**
 * House isolation: by default nothing from one house is ever placed in another house's prompt.
 * Collected cases are used only for review and the training export.
 *
 * With FIXERA_CROSS_HOME_REUSE=true, reviewed (approved or corrected) cases may be added as
 * generic reference, using only the category, the diagnosis and the fix as written by the
 * reviewer or by Fixera. The other homeowner's own words, outcome notes, property, job and
 * user are never included. FIXERA_REUSE_CONFIRMED_OUTCOMES=true additionally allows cases
 * confirmed fixed before review.
 */
export function crossHomeReuseEnabled() {
  return process.env.FIXERA_CROSS_HOME_REUSE === 'true';
}

export async function retrieveConfirmedCases(pool, { category = '', query = '', excludeJobId = null, limit = 3 } = {}) {
  if (!pool || !crossHomeReuseEnabled()) return { items: [], references: [] };
  const terms = tsQueryTerms(query);
  if (!terms) return { items: [], references: [] };
  const includeConfirmed = process.env.FIXERA_REUSE_CONFIRMED_OUTCOMES === 'true';
  let rows = [];
  try {
    ({ rows } = await pool.query(
      `SELECT id, job_id, case_category, quality_status, outcome_type, corrected_diagnosis, payload,
              ts_rank(to_tsvector('english', concat_ws(' ', payload->>'problem', payload->>'diagnosis', corrected_diagnosis)), to_tsquery('english', $2)) AS rank
         FROM fixera_training_candidates
        WHERE category IN ('repair_assessment','reassessment')
          AND quality_status NOT IN ('SAFETY_REJECTED','TRAINING_REJECTED')
          AND (approved_for_training = TRUE
               OR ($5 AND outcome_type IN ('DIY_FIXED','PROFESSIONAL_COMPLETED')))
          AND ($1 = '' OR case_category IS NULL OR lower(case_category) = lower($1))
          AND ($3::bigint IS NULL OR job_id IS DISTINCT FROM $3::bigint)
          AND to_tsvector('english', concat_ws(' ', payload->>'problem', payload->>'diagnosis', corrected_diagnosis)) @@ to_tsquery('english', $2)
        ORDER BY approved_for_training DESC, gold_example DESC, rank DESC
        LIMIT $4`,
      [String(category || '').toLowerCase().slice(0, 60), terms, excludeJobId == null ? null : Number(excludeJobId), Math.min(5, Math.max(1, limit)), includeConfirmed]
    ));
  } catch (e) {
    console.warn('[fixera] confirmed-case lookup failed', e?.message || e);
    return { items: [], references: [] };
  }
  // Only reviewer- or Fixera-written text: never the other homeowner's words or notes.
  const items = rows.map((r) => {
    const p = r.payload || {};
    const fix = p.reviewer_correction?.fix || (p.diy_steps || []).slice(0, 3).join(' ');
    const cause = p.reviewer_correction?.diagnosis || r.corrected_diagnosis || p.diagnosis;
    const how = r.quality_status === 'ADMIN_CORRECTED' ? 'reviewed and corrected' : r.quality_status === 'APPROVED' ? 'reviewed' : 'outcome confirmed, not yet reviewed';
    return [
      `Reference ${p.category || r.case_category || 'repair'} pattern (${how}):`,
      `confirmed cause: ${cause || 'n/a'}`,
      fix ? `what resolved it: ${fix}` : '',
    ].filter(Boolean).join(' ');
  });
  return {
    items,
    references: rows.map((r) => ({ type: 'reference_pattern', id: r.id, status: r.quality_status })),
  };
}

export function confirmedCasesContext(result) {
  if (!result?.items?.length) return '';
  return [
    'General repair patterns confirmed by FixBridge reviewers. Use them only as reference for likely causes and fixes.',
    'They are not evidence about this home. The current photos and description take priority, and every safety rule still applies.',
    ...result.items.map((item) => `- ${item}`),
  ].join('\n');
}
