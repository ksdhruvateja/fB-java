/** Runtime provider registry. Status is derived from the server-side model router. */

import { getAiStatus } from '../ai.js';

const PROVIDERS = [
  { id: 'openrouter', name: 'OpenRouter', envModel: 'OPENROUTER_MODEL', supportsVideo: false },
  { id: 'anthropic', name: 'Anthropic', envModel: 'ANTHROPIC_MODEL', supportsVideo: false },
  { id: 'openai', name: 'OpenAI', envModel: 'OPENAI_MODEL', supportsVideo: false },
  { id: 'gemini', name: 'Gemini', envModel: 'GEMINI_MODEL', supportsVideo: false },
  { id: 'explabs', name: 'Experiential Labs', envModel: null, supportsVideo: false },
  {
    id: 'fixera-local',
    name: 'Fixera Local',
    envModel: null,
    supportsVideo: false,
    note: 'Not deployed. A self-hosted model requires separate inference infrastructure.',
  },
];

function providerStatus(provider, runtime) {
  if (provider.id === runtime.provider) return 'connected';
  if ((runtime.fallbackProviders || []).some((entry) => entry.provider === provider.id)
    || provider.id === runtime.fallbackProvider) return 'fallback_configured';
  return provider.id === 'fixera-local' ? 'not_deployed' : 'not_configured';
}

export function listFixaProviders() {
  const runtime = getAiStatus();
  return PROVIDERS.map((provider) => {
    const status = providerStatus(provider, runtime);
    const fallback = (runtime.fallbackProviders || []).find((entry) => entry.provider === provider.id);
    const defaultModel = provider.id === runtime.provider
      ? runtime.model
      : fallback?.model || (provider.id === runtime.fallbackProvider ? runtime.fallbackModel : null)
        || (provider.envModel ? process.env[provider.envModel] || null : null);
    return {
      id: provider.id,
      name: provider.name,
      status,
      defaultModel,
      models: defaultModel ? [defaultModel] : [],
      supportsVision: ['openrouter', 'anthropic', 'openai', 'gemini'].includes(provider.id),
      supportsVideo: provider.supportsVideo,
      supportsStructuredOutput: true,
      keyHint: null,
      secretStorage: provider.id === 'fixera-local' ? 'separate_inference' : 'server',
      ...(provider.note ? { note: provider.note } : {}),
    };
  });
}

export function getConnectedProvider(id) {
  const runtime = getAiStatus();
  const selectedId = id || runtime.provider;
  return listFixaProviders().find(
    (provider) => provider.id === selectedId && ['connected', 'fallback_configured'].includes(provider.status)
  ) || null;
}

export const FIXA_MODEL = process.env.OPENROUTER_MODEL || process.env.ANTHROPIC_MODEL || process.env.OPENAI_MODEL || process.env.GEMINI_MODEL || null;

export function getProviderConfig() {
  const runtime = getAiStatus();
  return {
    primary: runtime.provider,
    fallback: runtime.fallbackProvider,
    model: runtime.model,
    fallbackModel: runtime.fallbackModel,
    fallbacks: runtime.fallbackProviders || [],
  };
}
