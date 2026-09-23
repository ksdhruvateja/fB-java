import { geminiProvider } from '../providers/gemini.js';
import { policyForTask } from './policies.js';

const REGISTRY = {
  gemini: geminiProvider,
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
      id: geminiProvider.id,
      name: geminiProvider.name,
      models: geminiProvider.models,
      supportsVision: geminiProvider.supportsVision,
      supportsVideo: geminiProvider.supportsVideo,
      supportsStructuredOutput: geminiProvider.supportsStructuredOutput,
    },
    { id: 'openai', name: 'OpenAI', status: 'not_configured' },
    { id: 'anthropic', name: 'Claude', status: 'not_configured' },
    { id: 'openrouter', name: 'OpenRouter', status: 'not_configured' },
  ];
}
