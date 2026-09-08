/**
 * Experiential Labs provider adapter.
 * The only module allowed to create the vendor client or read EXPLABS_API_KEY.
 */

import OpenAI from 'openai';

const MODEL = 'gpt-6-astra';
const BASE_URL = 'https://api.experientiallabs.ai/v1';
const TIMEOUT_MS = Number(process.env.AI_FETCH_TIMEOUT_MS || 38000);

export function readExplabsKey() {
  let raw = String(process.env.EXPLABS_API_KEY || '').replace(/^\uFEFF/, '').trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim();
  }
  raw = raw.replace(/^EXPLABS_API_KEY\s*=\s*/i, '').replace(/^bearer\s+/i, '').trim();
  if (/^xpl_/i.test(raw)) {
    raw = raw.replace(/\s+/g, '');
    const body = raw.slice(4);
    if (/^[0-9a-fA-F]{40}$/.test(body)) raw = `xpl_${body.toLowerCase()}`;
  }
  return raw;
}

export function explabsKeyDiagnostics() {
  const key = readExplabsKey();
  const prefixXpl = /^xpl_/i.test(key);
  const bodyIsHex = prefixXpl && /^[0-9a-fA-F]{40}$/.test(key.slice(4));
  const matchesProviderFormat = /^xpl_[0-9a-f]{40}$/.test(key);
  return {
    keyPresent: Boolean(key),
    keyLength: key.length,
    matchesProviderFormat,
    prefixXpl,
    bodyIsHex,
    keyShape: !key ? 'empty' : matchesProviderFormat ? 'xpl' : prefixXpl ? 'xpl_malformed' : 'unrecognized',
  };
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
    return { ok: true, text, message, model: payload?.model || MODEL, status: 200, code: 'ok', usage: payload?.usage || null };
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
    const apiKey = readExplabsKey();
    const keyDiagnostics = explabsKeyDiagnostics();
    const configured = Boolean(apiKey);
    const report = {
      assistant: 'Fixa',
      provider: 'experiential-labs',
      model: MODEL,
      configured,
      authenticated: false,
      modelReachable: false,
      healthy: false,
      code: configured ? 'unverified' : 'not_configured',
      ...keyDiagnostics,
    };
    if (!configured) {
      console.error('[fixa] health check skipped', { keyPresent: false, provider: 'experiential-labs', model: MODEL });
      return { ...report, ...keyDiagnostics };
    }

    if (!keyDiagnostics.matchesProviderFormat) {
      console.error('[fixa] health check skipped', {
        keyPresent: true,
        provider: 'experiential-labs',
        model: MODEL,
        keyShape: keyDiagnostics.keyShape,
        keyLength: keyDiagnostics.keyLength,
      });
      return {
        ...report,
        ...keyDiagnostics,
        code: 'key_shape_invalid',
        providerCode: 'key_shape_invalid',
      };
    }

    console.info('[fixa] health check started', {
      keyPresent: true,
      provider: 'experiential-labs',
      model: MODEL,
      keyShape: keyDiagnostics.keyShape,
      keyLength: keyDiagnostics.keyLength,
    });
    const modelsStarted = Date.now();
    let modelsStatus = 0;
    let modelsCode = null;
    let listed = [];
    try {
      const modelsRes = await fetch(`${BASE_URL}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      modelsStatus = modelsRes.status;
      const modelsBody = await modelsRes.json().catch(() => null);
      modelsCode = sanitizedProviderCode(
        { error: modelsBody?.error, code: modelsBody?.error?.code, status: modelsRes.status },
        modelsRes.status
      );
      listed = Array.isArray(modelsBody?.data)
        ? modelsBody.data.map((row) => String(row?.id || '')).filter(Boolean)
        : [];
    } catch (err) {
      modelsCode = sanitizedProviderCode(err, 0);
      console.error('[fixa] models list failed', {
        keyPresent: true,
        provider: 'experiential-labs',
        model: MODEL,
        status: 'network',
        code: modelsCode,
      });
      return {
        ...report,
        code: modelsCode || 'provider_unavailable',
        modelsHttpStatus: 0,
        modelsLatencyMs: Date.now() - modelsStarted,
        modelListed: false,
      };
    }

    const modelListed = listed.includes(MODEL);
    if (modelsStatus === 401 || modelsStatus === 403) {
      console.error('[fixa] models list rejected', {
        keyPresent: true,
        provider: 'experiential-labs',
        model: MODEL,
        status: modelsStatus,
        code: modelsCode,
      });
      return {
        ...report,
        authenticated: false,
        modelReachable: false,
        healthy: false,
        code: modelsCode || 'provider_rejected',
        providerStatus: modelsStatus,
        providerCode: modelsCode,
        modelsHttpStatus: modelsStatus,
        modelsLatencyMs: Date.now() - modelsStarted,
        modelListed: false,
      };
    }

    if (modelsStatus !== 200) {
      return {
        ...report,
        authenticated: false,
        modelReachable: false,
        healthy: false,
        code: modelsCode || `provider_http_${modelsStatus || 0}`,
        providerStatus: modelsStatus || undefined,
        providerCode: modelsCode,
        modelsHttpStatus: modelsStatus,
        modelsLatencyMs: Date.now() - modelsStarted,
        modelListed,
      };
    }

    const client = clientOrNull();
    try {
      const started = Date.now();
      const payload = await client.chat.completions.create({
        model: MODEL,
        temperature: 0,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
      });
      const latencyMs = Date.now() - started;
      const message = payload?.choices?.[0]?.message;
      const content = message?.content;
      const text = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('')
          : '';
      const healthy = /ok/i.test(String(text || '').trim());
      return {
        ...report,
        authenticated: modelsStatus === 200,
        modelReachable: modelListed && healthy,
        healthy: modelsStatus === 200 && modelListed && healthy,
        code: healthy ? 'ok' : 'empty_response',
        returnedModel: payload?.model || null,
        latencyMs,
        usage: payload?.usage || null,
        text,
        modelsHttpStatus: modelsStatus,
        modelsLatencyMs: Date.now() - modelsStarted,
        modelListed,
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
        authenticated: modelsStatus === 200 && !rejected,
        modelReachable: false,
        healthy: false,
        code: modelMissing ? 'model_unreachable' : code,
        providerStatus: status || undefined,
        providerCode: code,
        httpStatus: status || undefined,
        modelsHttpStatus: modelsStatus,
        modelsLatencyMs: Date.now() - modelsStarted,
        modelListed,
      };
    }
  },
};

export const EXPLABS_MODEL = MODEL;
export const EXPLABS_BASE_URL = BASE_URL;
