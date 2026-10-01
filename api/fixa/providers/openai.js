import { randomUUID } from 'node:crypto';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim();
const OPENAI_MODEL = String(process.env.OPENAI_MODEL || 'gpt-4.1-mini').trim();
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || process.env.AI_FETCH_TIMEOUT_MS || 30000);

function isConfigured() {
  return Boolean(OPENAI_API_KEY && OPENAI_API_KEY !== 'YOUR_OPENAI_API_KEY');
}

function normalizeContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((item) => {
    if (!item) return '';
    if (typeof item === 'string') return item;
    if (item.type === 'text') return String(item.text || '');
    return '';
  }).filter(Boolean).join('\n');
}

function normalizeMessages(messages) {
  return messages.map((message) => ({
    role: ['system', 'assistant'].includes(message?.role) ? message.role : 'user',
    content: typeof message?.content === 'string'
      ? message.content
      : Array.isArray(message?.content)
        ? message.content
        : normalizeContent(message?.content),
  }));
}

async function createCompletion({ messages = [], temperature = 0.2, maxTokens = 2500, responseFormat, signal } = {}) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    if (!isConfigured()) throw new Error('PROVIDER_NOT_CONFIGURED');
    const body = {
      model: OPENAI_MODEL,
      messages: normalizeMessages(messages),
      temperature,
      max_tokens: maxTokens,
    };
    if (responseFormat) body.response_format = responseFormat;
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-client-request-id': requestId,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
    const content = payload?.choices?.[0]?.message?.content;
    const text = typeof content === 'string' ? content : normalizeContent(content);
    if (!text.trim()) throw new Error('EMPTY_RESPONSE_BODY');
    return {
      ok: true,
      provider: 'openai',
      model: payload?.model || OPENAI_MODEL,
      status: response.status,
      code: 'ok',
      text,
      message: { role: 'assistant', content: text },
      usage: payload?.usage || null,
      requestId,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    return {
      ok: false,
      provider: 'openai',
      model: OPENAI_MODEL,
      code: isTimeout ? 'provider_timeout' : error?.message === 'PROVIDER_NOT_CONFIGURED' ? 'provider_not_configured' : error?.message?.startsWith('PROVIDER_HTTP_') ? error.message.toLowerCase() : 'provider_exception',
      requestId,
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function analyze({ messages = [], temperature = 0.2, maxTokens = 2500, json = false, signal } = {}) {
  return createCompletion({
    messages,
    temperature,
    maxTokens,
    signal,
    responseFormat: json ? { type: 'json_object' } : undefined,
  });
}

async function healthCheck() {
  return { ok: isConfigured(), provider: 'openai', model: OPENAI_MODEL, code: isConfigured() ? 'configured' : 'not_connected' };
}

const openaiProvider = {
  provider: 'openai',
  name: 'OpenAI',
  model: OPENAI_MODEL,
  models: [OPENAI_MODEL],
  supportsVision: true,
  supportsStructuredOutput: true,
  isConfigured,
  analyze,
  createCompletion,
  complete: createCompletion,
  healthCheck,
};

export { OPENAI_MODEL, isConfigured, analyze, createCompletion, healthCheck, openaiProvider };
export default openaiProvider;