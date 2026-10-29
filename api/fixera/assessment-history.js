export function appendAssessmentRevision(historyValue, previousAssessment, recordedAt = new Date().toISOString()) {
  let history = Array.isArray(historyValue) ? [...historyValue] : [];
  if (typeof historyValue === 'string') {
    try {
      const parsed = JSON.parse(historyValue);
      if (Array.isArray(parsed)) history = parsed;
    } catch {
      history = [];
    }
  }
  if (!previousAssessment) return history.slice(-10);
  const hasInitialHypothesis = history.some((entry) => entry?.kind === 'AI_INITIAL_HYPOTHESIS');
  history.push({
    kind: hasInitialHypothesis ? 'AI_REASSESSMENT' : 'AI_INITIAL_HYPOTHESIS',
    assessment: previousAssessment,
    recordedAt,
  });
  return history.slice(-10);
}