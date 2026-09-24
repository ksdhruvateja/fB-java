import { explabsProvider } from '../providers/explabs.js';
import { policyForTask } from './policies.js';

const REGISTRY = {
  explabs: explabsProvider,
};

export function selectProvider(task) {
  const policy = policyForTask(task);
  const provider = policy.primary ? REGISTRY[policy.primary] : null;
  return {
    task,
    policy,
    provider: provider || null,
    model: policy.model || null,
    fallback: null,
  };
}

export function listProviderContracts() {
  return [
    {
      id: explabsProvider.id,
      name: explabsProvider.name,
      models: explabsProvider.models,
      supportsVision: explabsProvider.supportsVision,
      supportsVideo: explabsProvider.supportsVideo,
      supportsStructuredOutput: explabsProvider.supportsStructuredOutput,
    },
    { id: 'openai', name: 'OpenAI', status: 'not_configured' },
    { id: 'anthropic', name: 'Claude', status: 'not_configured' },
    { id: 'gemini', name: 'Gemini', status: 'not_configured' },
    { id: 'openrouter', name: 'OpenRouter', status: 'not_configured' },
  ];
}
