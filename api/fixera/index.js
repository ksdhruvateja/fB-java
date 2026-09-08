/**
 * Canonical Fixera entry point.
 * Implementation lives in api/fixa (kept in place to avoid a risky file move).
 * Application code should import from here. Vendor SDKs stay behind this layer.
 */

export {
  assessRepair,
  reassessRepair,
  chat,
  complete,
  respond,
  extractDocument,
  prepareProfessionalHandoff,
  evaluateRepairOutcome,
  getContext,
  run,
  getFixaPublicStatus as getFixeraPublicStatus,
  getFixaPublicStatus,
  getFixaHealth as getFixeraHealth,
  getFixaHealth,
  getFixaAdminProviders as getFixeraAdminProviders,
  getFixaAdminProviders,
  FIXA_UNAVAILABLE as FIXERA_UNAVAILABLE,
  FIXA_UNAVAILABLE,
} from '../fixa/index.js';

export { displayAssistantName, FIXERA_NAME } from './brand.js';
export { getPricingIntelligence, evaluateCurrentQuote } from './pricing/intelligence.js';
export {
  recordFixeraInteraction,
  recordFixeraFeedback,
  persistFixeraInteraction,
  trainingOverview,
  listRecentExperiences,
  exportApprovedTraining,
} from './experience/store.js';

export const fixera = {
  assessRepair: (...args) => import('../fixa/index.js').then((m) => m.assessRepair(...args)),
  reassessRepair: (...args) => import('../fixa/index.js').then((m) => m.reassessRepair(...args)),
  chat: (...args) => import('../fixa/index.js').then((m) => m.chat(...args)),
  prepareProfessionalHandoff: (...args) => import('../fixa/index.js').then((m) => m.prepareProfessionalHandoff(...args)),
  evaluateRepairOutcome: (...args) => import('../fixa/index.js').then((m) => m.evaluateRepairOutcome(...args)),
};
