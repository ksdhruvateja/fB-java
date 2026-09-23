/**
 * Fixa provider registry.
 * Connection status comes from server secrets. Raw keys are never returned.
 */

import { readGeminiKey, GEMINI_MODEL } from './providers/gemini.js';

function geminiRecord() {
  const configured = Boolean(readGeminiKey());
  return {
    id: 'gemini',
    name: 'Google Gemini',
    status: configured ? 'configured' : 'not_connected',
    defaultModel: GEMINI_MODEL,
    models: [GEMINI_MODEL],
    supportsVision: true,
    supportsVideo: false,
    supportsStructuredOutput: true,
    keyHint: configured ? '••••' : null,
    secretStorage: 'server',
  };
}

const DISCONNECTED = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    status: 'not_connected',
    defaultModel: null,
    models: [],
    supportsVision: true,
    supportsVideo: false,
    supportsStructuredOutput: true,
    keyHint: null,
    secretStorage: 'server',
    note: 'Removed. Fixera uses Google Gemini.',
  },
  {
    id: 'explabs',
    name: 'Experiential Labs',
    status: 'not_connected',
    defaultModel: null,
    models: [],
    supportsVision: true,
    supportsVideo: false,
    supportsStructuredOutput: true,
    keyHint: null,
    secretStorage: 'server',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    status: 'not_connected',
    defaultModel: null,
    models: [],
    supportsVision: true,
    supportsVideo: false,
    supportsStructuredOutput: true,
    keyHint: null,
    secretStorage: 'server',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    status: 'not_connected',
    defaultModel: null,
    models: [],
    supportsVision: true,
    supportsVideo: false,
    supportsStructuredOutput: true,
    keyHint: null,
    secretStorage: 'server',
  },
];

export function listFixaProviders() {
  return [geminiRecord(), ...DISCONNECTED];
}

export function getConnectedProvider(id = 'gemini') {
  return listFixaProviders().find((provider) => provider.id === id && provider.status === 'configured') || null;
}

export const FIXA_MODEL = GEMINI_MODEL;

export function getProviderConfig() {
  return {
    primary: 'gemini',
    fallback: null,
    model: GEMINI_MODEL,
  };
}
