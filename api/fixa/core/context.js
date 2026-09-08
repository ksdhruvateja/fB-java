/** Normalized Fixa context. Only fields needed for the current task. */

import { jobMemoryFromRecord } from '../memory/jobMemory.js';
import { propertyMemoryFromRecord } from '../memory/propertyMemory.js';

export function buildFixaContext(input = {}, task = 'repair_assessment') {
  const job = input.job || {};
  const property = input.property || {};
  return {
    actor: input.actor || 'homeowner',
    task,
    homeownerId: input.homeownerId || job.homeownerId || null,
    jobId: input.jobId || job.id || null,
    propertyId: input.propertyId || property.id || job.propertyId || null,
    category: input.category || job.category || null,
    subcategory: input.subcategory || job.serviceSubcategory || null,
    description: input.description || job.description || '',
    observation: input.observation || '',
    currentStep: input.currentStep ?? null,
    risk: input.risk || job.diyRiskLevel || null,
    mediaAttached: Boolean(input.imageDataUrl || job.mediaDataUrl),
    job: jobMemoryFromRecord(job, {
      assessment: input.assessment || job.aiAssessment,
      completedSteps: input.completedSteps,
      failedStep: input.failedStep,
      comments: input.observation ? [input.observation] : [],
      escalated: Boolean(input.escalated),
    }),
    property: propertyMemoryFromRecord(property),
    membershipRelevant: Boolean(input.homeCarePro),
  };
}
