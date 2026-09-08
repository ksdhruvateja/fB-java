/**
 * Experiential Labs provider adapter.
 * The only module allowed to create the vendor client or read EXPLABS_API_KEY.
 */

import OpenAI from 'openai';

const MODEL = 'gpt-6-astra';
const BASE_URL = 'https://api.experientiallabs.ai/v1';
const TIMEOUT_MS = Number(process.env.AI_FETCH_TIMEOUT_MS || 38000);

export function readExplabsKey() {
  return String(process.env.EXPLABS_API_KEY || '').trim();
}

function sanitizedProviderCode(err, status) {
  const raw = err?.error?.code || err?.code || err?.error?.type || '';
  const code = String(raw || '').trim().slice(0, 64);
  if (!code) return publicError(status);
  if (/authorization|bearer|sk-|api[_-]?key\s*[:=]/i.test(code) && !/^invalid_api_key$/i.test(code)) {
    return publicError(status);
  }
  return code;
}

function clientOrNull() {
  const apiKey = readExplabsKey();
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL: BASE_URL,
    timeout: TIMEOUT_MS,
    maxRetries: 0,
  });
}

function publicError(status) {
  if (status === 401 || status === 403) return 'provider_rejected';
  if (status === 429) return 'provider_busy';
  if (status) return `provider_http_${status}`;
  return 'provider_unavailable';
}

async function createCompletion({ messages, temperature, maxTokens, json }) {
  const client = clientOrNull();
  if (!client) {
    console.error('[fixa] Experiential Labs is not connected');
    return { ok: false, text: '', model: MODEL, status: 0, code: 'not_connected' };
  }
  try {
    const payload = await client.chat.completions.create({
      model: MODEL,
      temperature,
      max_tokens: maxTokens,
      messages,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    });
    const message = payload?.choices?.[0]?.message;
    const content = message?.content;
    const text = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('\n')
        : '';
    return { ok: true, text, message, model: MODEL, status: 200, code: 'ok' };
  } catch (err) {
    const status = Number(err?.status || err?.statusCode || 0);
    const code = sanitizedProviderCode(err, status);
    console.error('[fixa] Experiential Labs request failed', {
      keyPresent: Boolean(readExplabsKey()),
      provider: 'experiential-labs',
      model: MODEL,
      status: status || 'network',
      code,
    });
    return { ok: false, text: '', message: null, model: MODEL, status, code };
  }
}

export const explabsProvider = {
  id: 'explabs',
  name: 'Experiential Labs',
  models: [MODEL],
  supportsVision: true,
  supportsVideo: false,
  supportsStructuredOutput: true,
  async analyze(input) {
    return createCompletion(input);
  },
  async complete(input) {
    return createCompletion(input);
  },
  async healthCheck() {
    const configured = Boolean(readExplabsKey());
    const report = {
      assistant: 'Fixa',
      provider: 'experiential-labs',
      model: MODEL,
      configured,
      authenticated: false,
      modelReachable: false,
      healthy: false,
      code: configured ? 'unverified' : 'not_configured',
    };
    if (!configured) return report;

    const client = clientOrNull();
    try {
      const payload = await client.chat.completions.create({
        model: MODEL,
        temperature: 0,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
      });
      const message = payload?.choices?.[0]?.message;
      const content = message?.content;
      const text = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('')
          : '';
      const healthy = Boolean(String(text || '').trim());
      return {
        ...report,
        authenticated: true,
        modelReachable: true,
        healthy,
        code: healthy ? 'ok' : 'empty_response',
      };
    } catch (err) {
      const status = Number(err?.status || err?.statusCode || 0);
      const code = sanitizedProviderCode(err, status);
      const rejected = status === 401 || status === 403;
      const modelMissing = status === 404;
      console.error('[fixa] health check failed', {
        keyPresent: Boolean(readExplabsKey()),
        provider: 'experiential-labs',
        model: MODEL,
        status: status || 'network',
        code,
      });
      return {
        ...report,
        authenticated: Boolean(status) && !rejected,
        modelReachable: false,
        healthy: false,
        code: modelMissing ? 'model_unreachable' : code,
        providerStatus: status || undefined,
        providerCode: code,
        httpStatus: status || undefined,
      };
    }
  },
};

export const EXPLABS_MODEL = MODEL;
export const EXPLABS_BASE_URL = BASE_URL;
