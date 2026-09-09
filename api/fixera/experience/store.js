/**
 * Fixera experience capture. References and summaries only — no raw PII.
 * Does not retrain model weights.
 */

import { displayAssistantName } from '../brand.js';

const MEMORY = {
  interactions: [],
  feedback: [],
};

const DATASET_VERSION = 'fixera-training-v1';

function clip(value, max = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.slice(0, max);
}

export function minimizeTrainingPayload(input = {}) {
  return {
    scenario: clip(input.scenario || input.category, 160),
    context: {
      category: clip(input.category, 80),
      subcategory: clip(input.subcategory, 80),
      zip3: input.zip ? String(input.zip).replace(/\D/g, '').slice(0, 3) : null,
      risk: clip(input.safety, 16),
    },
    observed_evidence: clip(input.observedEvidence, 400),
    diagnosis: clip(input.diagnosis, 400),
    safety: clip(input.safety, 16),
    recommended_action: clip(input.recommendedAction, 160),
    diy_steps: Array.isArray(input.diyStepCount) ? undefined : (input.diyStepCount || null),
    actual_outcome: clip(input.outcome, 160),
    professional_correction: input.professionalCorrection || null,
    quality_score: input.qualityStatus || 'UNREVIEWED',
    approved_for_training: false,
  };
}

export function recordFixeraInteraction(input = {}) {
  const row = {
    interaction_id: input.interactionId || input.requestId || `fxr_${Date.now()}`,
    user_role: input.userRole || null,
    job_id: input.jobId || null,
    property_id: input.propertyId || null,
    task_type: input.task || input.taskType || 'unknown',
    input_summary: clip(input.inputSummary, 180),
    media_references: input.mediaRef ? [String(input.mediaRef).slice(0, 80)] : [],
    retrieved_knowledge_references: input.knowledgeRefs || [],
    provider: input.provider || null,
    model: input.model || null,
    assistant: displayAssistantName(input.assistant),
    output_summary: clip(input.outputSummary, 240),
    safety_classification: input.safety || null,
    evaluator_score: input.evaluator || null,
    schema_quality: input.schemaQuality || null,
    user_feedback: null,
    user_retried: Boolean(input.userRetried),
    diy_result: null,
    professional_escalation: Boolean(input.professionalEscalation),
    professional_correction: null,
    final_job_outcome: null,
    quality_status: input.safety === 'RED' && input.evaluator === 'fail' ? 'SAFETY_REJECTED' : 'UNREVIEWED',
    created_at: new Date().toISOString(),
  };
  MEMORY.interactions.unshift(row);
  if (MEMORY.interactions.length > 80) MEMORY.interactions.length = 80;
  return row;
}

export function recordFixeraFeedback(input = {}) {
  const row = {
    interaction_id: input.interactionId || null,
    job_id: input.jobId || null,
    helpful: input.helpful || null,
    diy_result: input.diyResult || null,
    note: clip(input.note, 160),
    created_at: new Date().toISOString(),
  };
  MEMORY.feedback.unshift(row);
  const match = MEMORY.interactions.find((item) =>
    (row.interaction_id && item.interaction_id === row.interaction_id)
    || (row.job_id && item.job_id === row.job_id)
  );
  if (match) {
    match.user_feedback = row.helpful;
    match.diy_result = row.diy_result;
    if (row.diy_result === 'solved' || row.helpful === 'yes') match.quality_status = 'USER_CONFIRMED';
    if (row.diy_result === 'not_solved') match.quality_status = 'FAILED';
  }
  return row;
}

export function experienceSummary() {
  const rows = MEMORY.interactions;
  return {
    interactions: rows.length,
    unreviewed: rows.filter((r) => r.quality_status === 'UNREVIEWED').length,
    safetyRejected: rows.filter((r) => r.quality_status === 'SAFETY_REJECTED').length,
    userConfirmed: rows.filter((r) => r.quality_status === 'USER_CONFIRMED').length,
    professionalEscalations: rows.filter((r) => r.professional_escalation).length,
    feedback: MEMORY.feedback.length,
    datasetVersion: DATASET_VERSION,
    approvedForTraining: 0,
    goldExamples: 0,
    note: 'In-process captures are references only. Approved training export excludes raw customer identity.',
  };
}

export function listRecentExperiences(limit = 20) {
  return MEMORY.interactions.slice(0, limit).map((row) => ({
    interaction_id: row.interaction_id,
    task_type: row.task_type,
    job_id: row.job_id,
    safety_classification: row.safety_classification,
    evaluator_score: row.evaluator_score,
    quality_status: row.quality_status,
    provider: row.provider,
    model: row.model,
    created_at: row.created_at,
  }));
}

export async function persistFixeraInteraction(pool, row) {
  if (!pool || !row?.interaction_id) return { persisted: false };
  await pool.query(
    `INSERT INTO fixera_interactions (
       id, user_role, job_id, property_id, task_type, input_summary, media_refs,
       knowledge_refs, provider, model, output_summary, safety_classification,
       evaluator_score, schema_quality, quality_status, professional_escalation, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT (id) DO NOTHING`,
    [
      row.interaction_id,
      row.user_role,
      row.job_id,
      row.property_id,
      row.task_type,
      row.input_summary,
      JSON.stringify(row.media_references || []),
      JSON.stringify(row.retrieved_knowledge_references || []),
      row.provider,
      row.model,
      row.output_summary,
      row.safety_classification,
      row.evaluator_score,
      row.schema_quality,
      row.quality_status,
      row.professional_escalation,
      row.created_at,
    ]
  );
  await pool.query(
    `INSERT INTO fixera_training_candidates (
       id, interaction_id, job_id, category, scenario, diagnosis, quality_status,
       approved_for_training, gold_example, pii_minimized, dataset_version, payload
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE,FALSE,TRUE,$8,$9::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [
      `cand_${row.interaction_id}`,
      row.interaction_id,
      row.job_id,
      row.task_type,
      row.input_summary,
      row.output_summary,
      row.quality_status === 'SAFETY_REJECTED' ? 'SAFETY_REJECTED' : 'UNREVIEWED',
      DATASET_VERSION,
      JSON.stringify(minimizeTrainingPayload({
        scenario: row.input_summary,
        diagnosis: row.output_summary,
        safety: row.safety_classification,
        qualityStatus: row.quality_status,
      })),
    ]
  );
  return { persisted: true };
}

export async function trainingOverview(pool) {
  const memory = experienceSummary();
  if (!pool) return { ...memory, source: 'memory' };
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE approved_for_training)::int AS approved,
         COUNT(*) FILTER (WHERE gold_example)::int AS gold,
         COUNT(*) FILTER (WHERE quality_status = 'SAFETY_REJECTED')::int AS safety_rejected,
         COUNT(*) FILTER (WHERE quality_status = 'PROFESSIONAL_CORRECTED')::int AS corrected,
         COUNT(*) FILTER (WHERE quality_status = 'TRAINING_REJECTED')::int AS rejected
       FROM fixera_training_candidates`
    );
    const counts = rows[0] || {};
    return {
      ...memory,
      source: 'database',
      datasetVersion: DATASET_VERSION,
      versions: [DATASET_VERSION, 'fixera-pricing-v1', 'fixera-repair-vision-v1', 'fixera-safety-v1'],
      totalCandidates: counts.total || 0,
      approvedForTraining: counts.approved || 0,
      goldExamples: counts.gold || 0,
      safetyRejected: counts.safety_rejected || memory.safetyRejected,
      professionalCorrected: counts.corrected || 0,
      rejected: counts.rejected || 0,
      exportReady: (counts.approved || 0) > 0,
    };
  } catch {
    return { ...memory, source: 'memory', datasetVersion: DATASET_VERSION };
  }
}

export async function exportApprovedTraining(pool) {
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT payload
     FROM fixera_training_candidates
     WHERE approved_for_training = TRUE
       AND quality_status <> 'SAFETY_REJECTED'
       AND pii_minimized = TRUE
     ORDER BY created_at ASC
     LIMIT 500`
  );
  return rows.map((row) => row.payload).filter(Boolean);
}
