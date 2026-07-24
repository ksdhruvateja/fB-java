/**
 * Backward-compatible re-exports.
 * Multi-provider logic lives in ./ai.js (Gemini, OpenAI, OpenRouter, custom).
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

