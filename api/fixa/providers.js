/**
 * Fixa provider registry.
 * Connection status comes from server secrets. Raw keys are never returned.
 * Only Experiential Labs is implemented. Other vendors stay disconnected
 * so a missing or failed primary provider cannot fall through.
 */

import { readExplabsKey } from './providers/explabs.js';

const EXPLABS_MODEL = 'gpt-6-astra';

function explabsKey() {
  return readExplabsKey();
}

function maskedKeyHint(key) {
  if (!key || !key.startsWith('xpl_')) return null;
  return 'xpl_••••';
}

function explabsRecord() {
  const key = explabsKey();
  const configured = Boolean(key);
  return {
    id: 'explabs',
    name: 'Experiential Labs',
    status: configured ? 'configured' : 'not_connected',
    defaultModel: EXPLABS_MODEL,
    models: [EXPLABS_MODEL],
    supportsVision: true,
    supportsVideo: false,
    supportsStructuredOutput: true,
    keyHint: maskedKeyHint(key),
    secretStorage: 'server',
  };
}

const DISCONNECTED = [
  {
    id: 'fixera-local',
    name: 'Fixera Local',
    status: 'not_deployed',
    defaultModel: null,
    models: [],
    supportsVision: false,
    supportsVideo: false,
    supportsStructuredOutput: true,
    keyHint: null,
    secretStorage: 'separate_inference',
    note: 'Not deployed. A self-hosted model requires separate inference infrastructure, not Netlify Functions.',
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
  {
    id: 'gemini',
    name: 'Gemini',
    status: 'not_connected',
    defaultModel: null,
    models: [],
    supportsVision: true,
    supportsVideo: true,
    supportsStructuredOutput: true,
    keyHint: null,
    secretStorage: 'server',
  },
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
  },
];

export function listFixaProviders() {
  return [explabsRecord(), ...DISCONNECTED];
}

export function getConnectedProvider(id = 'explabs') {
  return listFixaProviders().find((provider) => provider.id === id && provider.status === 'configured') || null;
}

export const FIXA_MODEL = EXPLABS_MODEL;
