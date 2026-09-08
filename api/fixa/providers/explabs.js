/**
 * Experiential Labs provider adapter.
 * The only module allowed to create the vendor client or read EXPLABS_API_KEY.
 */

import OpenAI from 'openai';

const MODEL = 'gpt-6-astra';
const BASE_URL = 'https://api.experientiallabs.ai/v1';
const TIMEOUT_MS = Number(process.env.AI_FETCH_TIMEOUT_MS || 38000);

export function readExplabsKey() {
  let raw = String(process.env.EXPLABS_API_KEY || '');
  raw = raw.replace(/^\uFEFF/, '').trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim();
  }
  raw = raw.replace(/^bearer\s+/i, '').replace(/\s+/g, '');
  return raw;
}

function keyStatus(key = readExplabsKey()) {
  if (!key) return 'not_connected';
  if (!key.startsWith('xpl_')) return 'invalid';
  return 'connected';
}

function clientOrNull() {
  const apiKey = readExplabsKey();
  if (!apiKey || !apiKey.startsWith('xpl_')) return null;
  return new OpenAI({ apiKey, baseURL: BASE_URL, timeout: TIMEOUT_MS, maxRetries: 0 });
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
    console.error('[fixa] Experiential Labs request failed', { status: status || 'network', code: publicError(status) });
    return { ok: false, text: '', message: null, model: MODEL, status, code: publicError(status) };
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
    const status = keyStatus();
    if (status !== 'connected') {
      return { ok: false, connection: status === 'invalid' ? 'error' : 'not_connected', code: status, model: MODEL };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${readExplabsKey()}` },
        signal: controller.signal,
      });
      return {
        ok: response.ok,
        connection: response.ok ? 'connected' : 'error',
        code: response.ok ? 'ok' : publicError(response.status),
        httpStatus: response.status,
        model: MODEL,
      };
    } catch {
      return { ok: false, connection: 'error', code: 'provider_unavailable', model: MODEL };
    } finally {
      clearTimeout(timer);
    }
  },
};

export const EXPLABS_MODEL = MODEL;
export const EXPLABS_BASE_URL = BASE_URL;
