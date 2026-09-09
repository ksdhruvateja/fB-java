/** Structured job memory from existing records. AI text is never stored as a verified fact. */

export function jobMemoryFromRecord(job = {}, extras = {}) {
  const assessment = job.aiAssessment || job.ai_assessment || extras.assessment || null;
  return {
    jobId: job.id || job.jobId || null,
    source: 'SYSTEM',
    originalIssue: job.description || extras.description || '',
    category: job.category || assessment?.category || null,
    subcategory: job.serviceSubcategory || assessment?.service_subcategory || null,
    mediaPresent: Boolean(job.mediaDataUrl || job.media_data_url || extras.media),
    diagnosis: {
      value: assessment?.summary || null,
      source: 'AI_INFERRED',
    },
    observedEvidence: {
      value: assessment?.observed_evidence || [],
      source: 'MEDIA_OBSERVED',
    },
    likelyCauses: {
      value: assessment?.likely_causes || [],
      source: 'AI_INFERRED',
    },
    completedSteps: extras.completedSteps || [],
    failedStep: extras.failedStep || null,
    homeownerComments: extras.comments || [],
    professionalEscalation: Boolean(extras.escalated),
    resolution: extras.resolution || null,
  };
}
