import { randomUUID } from 'node:crypto';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_CLOUD_API_KEY || '').trim();
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || process.env.AI_FETCH_TIMEOUT_MS || 30000);

function isConfigured() {
  return Boolean(GEMINI_API_KEY && GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY');
}

function imagePart(item) {
  const imageUrl = item?.type === 'image_url' ? item.image_url?.url : null;
  const match = typeof imageUrl === 'string' ? imageUrl.match(/^data:([^;,]+);base64,(.+)$/i) : null;
  const mimeType = match?.[1] || item?.mimeType || item?.mime || null;
  const data = match?.[2] || item?.data || item?.base64 || null;
  if (!mimeType || !data || !String(mimeType).startsWith('image/')) return null;
  return { inlineData: { mimeType, data } };
}

function contentParts(content) {
  if (typeof content === 'string') return [{ text: content }];
  if (!Array.isArray(content)) return [{ text: String(content || '') }];
  return content.map((item) => {
    if (typeof item === 'string') return { text: item };
    if (item?.type === 'text') return { text: String(item.text || '') };
    return imagePart(item);
  }).filter(Boolean);
}

function normalizeMessages(messages) {
  let systemText = '';
  const contents = [];
  for (const message of messages) {
    if (message?.role === 'system') {
      systemText = [systemText, ...contentParts(message.content).map((part) => part.text || '')].filter(Boolean).join('\n\n');
      continue;
    }
    const parts = contentParts(message?.content);
    if (!parts.length) continue;
    contents.push({ role: message?.role === 'assistant' ? 'model' : 'user', parts });
  }
  return { systemText, contents };
}

async function createCompletion({ messages = [], temperature = 0.2, maxTokens = 2500, responseFormat, signal } = {}) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    if (!isConfigured()) throw new Error('PROVIDER_NOT_CONFIGURED');
    const { systemText, contents } = normalizeMessages(messages);
    const body = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        ...(responseFormat?.type === 'json_object' ? { responseMimeType: 'application/json' } : {}),
      },
      ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
    };
    const response = await fetch(`${GEMINI_BASE_URL}/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
        'x-client-request-id': requestId,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
    const text = (payload?.candidates?.[0]?.content?.parts || []).map((part) => part?.text || '').filter(Boolean).join('\n');
    if (!text.trim()) throw new Error('EMPTY_RESPONSE_BODY');
    return {
      ok: true,
      provider: 'gemini',
      model: payload?.modelVersion || GEMINI_MODEL,
      status: response.status,
      code: 'ok',
      text,
      message: { role: 'assistant', content: text },
      usage: payload?.usageMetadata || null,
      requestId,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    return {
      ok: false,
      provider: 'gemini',
      model: GEMINI_MODEL,
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
  return { ok: isConfigured(), provider: 'gemini', model: GEMINI_MODEL, code: isConfigured() ? 'configured' : 'not_connected' };
}

const geminiProvider = {
  provider: 'gemini',
  name: 'Google Gemini',
  model: GEMINI_MODEL,
  models: [GEMINI_MODEL],
  supportsVision: true,
  supportsStructuredOutput: true,
  isConfigured,
  analyze,
  createCompletion,
  complete: createCompletion,
  healthCheck,
};

export { GEMINI_MODEL, isConfigured, analyze, createCompletion, healthCheck, geminiProvider };
export default geminiProvider;