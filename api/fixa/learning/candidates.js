/**
 * Controlled learning candidates. A successful provider response is never auto-approved.
 * Stores references only. Does not write verified knowledge.
 */

const candidates = [];

export function recordLearningCandidate(input) {
  const row = {
    id: input.requestId,
    task: input.task,
    jobId: input.jobId || null,
    propertyId: input.propertyId || null,
    provider: input.provider || null,
    model: input.model || null,
    createdAt: new Date().toISOString(),
    safety: input.safety || null,
    evaluator: input.evaluator || null,
    qualityStatus: 'UNREVIEWED',
    reviewStatus: 'UNREVIEWED',
    userFeedback: null,
    professionalCorrection: null,
  };
  candidates.unshift(row);
  if (candidates.length > 50) candidates.length = 50;
  return { id: row.id, qualityStatus: row.qualityStatus };
}

export function learningCandidateCount() {
  return candidates.length;
}
