/**
 * Backward-compatible re-exports.
 * Experiential Labs GPT-6 Astra logic lives in ./ai.js.
 */
export {
  analyzeRepair,
  chatWithCustomer,
  isAiConfigured,
  isGeminiConfigured,
  getAiStatus,
  getGeminiApiKey,
  getGcpProjectId,
  getGcpLocation,
  parseAssessment,
  PROMPT,
  resolveAiProvider,
} from './ai.js';

