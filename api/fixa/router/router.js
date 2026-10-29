import { getAiStatus, resolveAiProvider } from '../../ai.js';
import { listFixaProviders } from '../providers.js';
import { policyForTask } from './policies.js';

export function selectProvider(task) {
  const policy = policyForTask(task);
  const runtime = resolveAiProvider();
  const status = getAiStatus();
  const provider = runtime?.provider
    ? { id: runtime.provider, name: runtime.provider }
    : null;
  return {
    task,
    policy: {
      ...policy,
      primary: runtime?.provider || null,
      model: runtime?.model || null,
      fallback: runtime?.fallback?.provider || null,
    },
    provider,
    model: runtime?.model || null,
    fallback: runtime?.fallback
      ? { id: runtime.fallback.provider, name: runtime.fallback.provider, model: runtime.fallback.model }
      : null,
    fallbacks: status.fallbackProviders || [],
    configured: status.configured,
  };
}

export function listProviderContracts() {
  return listFixaProviders();
}
