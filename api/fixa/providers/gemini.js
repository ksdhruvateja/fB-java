/**
 * Fixera Gemini provider — Google Generative Language API.
 * Server-side only. Never expose GEMINI_API_KEY / GOOGLE_AI_API_KEY to the client.
 */

import { randomUUID } from 'node:crypto';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const GEMINI_MODEL = String(process.env.GEMINI_MODEL || 'gemini-3.6-flash').trim() || 'gemini-3.6-flash';
const MODEL_FALLBACKS = [...new Set([
  GEMINI_MODEL,
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
])];
const AI_FETCH_TIMEOUT_MS = Number(process.env.AI_FETCH_TIMEOUT_MS || 45000);

export function readGeminiKey() {
  return String(
    process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_AI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_CLOUD_API_KEY ||
      ''
  )
    .replace(/^\uFEFF/, '')
    .trim();
}

export function isConfigured() {
  return Boolean(readGeminiKey());
}

function extractTextFromParts(parts) {
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function dataUrlToInline(url) {
  const match = String(url || '').match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;
  return {
    inline_data: {
      mime_type: match[1] || 'image/jpeg',
      data: match[2],
    },
  };
}

function contentToParts(content) {
  if (typeof content === 'string') {
    return content.trim() ? [{ text: content }] : [];
  }
  if (!Array.isArray(content)) return [];
  const parts = [];
  for (const item of content) {
    if (!item) continue;
    if (typeof item === 'string') {
      if (item.trim()) parts.push({ text: item });
      continue;
    }
    if (item.type === 'text' && item.text) {
      parts.push({ text: String(item.text) });
      continue;
    }
    if (item.type === 'image_url') {
      const url = item.image_url?.url || item.image_url;
      const inline = dataUrlToInline(url);
      if (inline) parts.push(inline);
    }
  }
  return parts;
}

function toGeminiPayload({ messages = [], system, temperature, maxTokens, json }) {
  const systemParts = [];
  const contents = [];

  if (system) systemParts.push({ text: String(system) });

  for (const message of messages) {
    if (!message) continue;
    const role = message.role === 'assistant' ? 'model' : message.role === 'system' ? 'system' : 'user';
    const parts = contentToParts(message.content);
    if (!parts.length) continue;
    if (role === 'system') {
      systemParts.push(...parts);
      continue;
    }
    contents.push({ role, parts });
  }

  const body = {
    contents: contents.length ? contents : [{ role: 'user', parts: [{ text: 'Hello' }] }],
    generationConfig: {
      temperature: typeof temperature === 'number' ? temperature : 0.2,
      maxOutputTokens: Number(maxTokens || 4000),
    },
  };
  if (systemParts.length) {
    body.systemInstruction = { parts: systemParts };
  }
  if (json) {
    body.generationConfig.responseMimeType = 'application/json';
  }
  return body;
}

export async function createCompletion({
  messages = [],
  system,
  temperature,
  maxTokens,
  json = false,
  signal,
} = {}) {
  const apiKey = readGeminiKey();
  const requestId = randomUUID();
  const startedAt = Date.now();

  if (!apiKey) {
    return {
      ok: false,
      provider: 'gemini',
      model: GEMINI_MODEL,
      status: 0,
      code: 'not_connected',
      text: '',
      message: null,
      requestId,
      latencyMs: 0,
    };
  }

  try {
    let response;
    let raw = '';
    let usedModel = GEMINI_MODEL;
    for (const model of MODEL_FALLBACKS) {
      usedModel = model;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), AI_FETCH_TIMEOUT_MS);
      if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
      try {
        response = await fetch(
          `${BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toGeminiPayload({ messages, system, temperature, maxTokens, json })),
            signal: controller.signal,
          }
        );
        raw = await response.text();
      } catch (error) {
        if (error?.name === 'AbortError' && model !== MODEL_FALLBACKS[MODEL_FALLBACKS.length - 1]) {
          console.warn('[fixa] Gemini model timed out, trying next model', { model, requestId });
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
      if (response.ok || (response.status !== 503 && response.status !== 429 && response.status !== 404)) break;
    }
    if (!response) {
      return {
        ok: false,
        provider: 'gemini',
        model: usedModel,
        status: 0,
        code: 'provider_timeout',
        text: '',
        message: null,
        requestId,
        latencyMs: Date.now() - startedAt,
      };
    }
    let payload = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = { raw };
    }

    const text = extractTextFromParts(payload?.candidates?.[0]?.content?.parts);
    const latencyMs = Date.now() - startedAt;

    if (!response.ok || !text) {
      const code = payload?.error?.status || (response.ok ? 'empty_response' : `http_${response.status}`);
      console.warn('[fixa] Gemini request failed', {
        provider: 'gemini',
        model: usedModel,
        status: response.status,
        code,
        requestId,
        latencyMs,
      });
      return {
        ok: false,
        provider: 'gemini',
        model: usedModel,
        status: response.status,
        code,
        text: '',
        message: null,
        requestId,
        latencyMs,
      };
    }

    console.log('[fixa] Gemini request completed', {
      provider: 'gemini',
      model: payload?.modelVersion || usedModel,
      requestId,
      latencyMs,
    });

    return {
      ok: true,
      provider: 'gemini',
      model: payload?.modelVersion || usedModel,
      status: response.status,
      code: 'ok',
      text,
      message: { role: 'assistant', content: text },
      usage: payload?.usageMetadata || null,
      requestId,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const isTimeout = error?.name === 'AbortError';
    console.warn('[fixa] Gemini request exception', {
      provider: 'gemini',
      model: GEMINI_MODEL,
      code: isTimeout ? 'provider_timeout' : 'provider_exception',
      message: error?.message || String(error),
      requestId,
      latencyMs,
    });
    return {
      ok: false,
      provider: 'gemini',
      model: GEMINI_MODEL,
      status: 0,
      code: isTimeout ? 'provider_timeout' : 'provider_exception',
      text: '',
      message: null,
      requestId,
      latencyMs,
    };
  }
}

export async function healthCheck() {
  const apiKey = readGeminiKey();
  if (!apiKey) {
    return {
      ok: false,
      configured: false,
      authenticated: false,
      modelReachable: false,
      healthy: false,
      provider: 'gemini',
      model: GEMINI_MODEL,
      code: 'not_connected',
    };
  }

  const ping = await createCompletion({
    messages: [{ role: 'user', content: 'Reply with the single word pong.' }],
    temperature: 0,
    maxTokens: 16,
    json: false,
  });

  return {
    ok: Boolean(ping.ok),
    configured: true,
    authenticated: ping.ok || ping.status === 400,
    modelReachable: Boolean(ping.ok),
    healthy: Boolean(ping.ok),
    provider: 'gemini',
    model: ping.model || GEMINI_MODEL,
    code: ping.ok ? 'ok' : ping.code,
    latencyMs: ping.latencyMs,
    text: ping.ok ? String(ping.text || '').slice(0, 40) : undefined,
  };
}

export const geminiProvider = {
  id: 'gemini',
  provider: 'gemini',
  name: 'Google Gemini',
  model: GEMINI_MODEL,
  models: [GEMINI_MODEL],
  supportsVision: true,
  supportsVideo: false,
  supportsStructuredOutput: true,
  isConfigured,
  createCompletion,
  complete: createCompletion,
  analyze: createCompletion,
  healthCheck,
};

export default geminiProvider;
