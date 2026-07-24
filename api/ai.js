/**
 * Multi-provider AI assessment for FixBridge.
 * Supports Gemini, OpenAI, OpenRouter, and any OpenAI-compatible endpoint.
 *
 * Env (pick one provider — AI_PROVIDER=auto chooses from available keys):
 *   AI_PROVIDER=auto|gemini|openai|openrouter|custom
 *   AI_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY / GEMINI_API_KEY
 *   AI_BASE_URL / OPENAI_BASE_URL   (custom OpenAI-compatible base, e.g. https://openrouter.ai/api/v1)
 *   AI_MODEL / OPENAI_MODEL         (e.g. gpt-4o-mini, google/gemma-3-27b-it:free)
 */

const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-8b',
];

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_OPENROUTER_MODEL = 'nvidia/nemotron-nano-12b-v2-vl:free';
const OPENAI_BASE = 'https://api.openai.com/v1';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

export const SUMMARY_PROMPT = `You are FixBridge AI. Inspect the repair (and photo if attached). Be specific.

Return ONLY valid JSON:
{
  "overview": "1-2 short sentences",
  "imageObservations": ["detail 1", "detail 2", "detail 3"],
  "estimatedCost": "$min-$max NYC/LI",
  "estimatedDuration": "e.g. 1-2 hours",
  "urgency": "Low/Medium/High — brief reason",
  "professionalRecommended": true
}
No markdown. Keep it short.`;

export const DETAIL_PROMPT = `You are FixBridge AI. Given this repair, return a concise DIY/pro plan. Be specific to the issue/photo.

Return ONLY valid JSON:
{
  "diagnosis": "one short paragraph",
  "likelyRootCause": "one sentence",
  "professionalSteps": ["step 1", "step 2", "step 3", "step 4"],
  "partsNeeded": ["part", "part"],
  "toolsRequired": ["tool", "tool"],
  "diySteps": ["safe DIY step 1", "step 2", "step 3"],
  "safetyNotes": "one safety warning",
  "estimatedCost": "$min-$max NYC/LI",
  "estimatedDuration": "e.g. 1-2 hours",
  "urgency": "Low/Medium/High — brief reason"
}
Max 4 items per array. No markdown.`;

export const PROMPT = DETAIL_PROMPT;

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

export function parseAssessment(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    const diyGuideImages = Array.isArray(parsed.diyGuideImages)
      ? parsed.diyGuideImages
          .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const title = asString(item.title);
            const caption = asString(item.caption);
            const imagePrompt = asString(item.imagePrompt) || asString(item.prompt);
            if (!title && !imagePrompt) return null;
            return {
              title: title || 'DIY guide',
              caption,
              imagePrompt: imagePrompt || title,
            };
          })
          .filter(Boolean)
      : [];
    const assessment = {
      overview: asString(parsed.overview),
      imageObservations: asStringArray(parsed.imageObservations),
      diagnosis: asString(parsed.diagnosis),
      likelyRootCause: asString(parsed.likelyRootCause),
      professionalSteps: asStringArray(parsed.professionalSteps),
      partsNeeded: asStringArray(parsed.partsNeeded),
      workScope: asStringArray(parsed.workScope),
      toolsRequired: asStringArray(parsed.toolsRequired),
      diySteps: asStringArray(parsed.diySteps),
      diyGuideImages,
      suggestions: asStringArray(parsed.suggestions),
      estimatedCost: asString(parsed.estimatedCost),
      estimatedDuration: asString(parsed.estimatedDuration),
      urgency: asString(parsed.urgency),
      safetyNotes: asString(parsed.safetyNotes),
      professionalRecommended:
        typeof parsed.professionalRecommended === 'boolean' ? parsed.professionalRecommended : true,
    };
    if (!assessment.diagnosis && !assessment.overview) return null;
    return assessment;
  } catch {
    return null;
  }
}

function userPromptText({ category, description, imageDataUrl, mode = 'summary' }) {
  const prompt = mode === 'detail' ? DETAIL_PROMPT : SUMMARY_PROMPT;
  return `${prompt}

Category: ${category}
Homeowner description: ${description}
Photo attached: ${imageDataUrl ? 'YES — analyze the image' : 'NO — use description only'}`;
}

// ── Key / provider resolution ────────────────────────────────────────────────

export function getGeminiApiKey() {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GOOGLE_CLOUD_API_KEY?.trim() ||
    process.env.VITE_GEMINI_API_KEY?.trim() ||
    ''
  );
}

export function getGcpProjectId() {
  return (
    process.env.GCP_PROJECT_ID?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.VITE_GCP_PROJECT_ID?.trim() ||
    ''
  );
}

export function getGcpLocation() {
  return (
    process.env.GCP_LOCATION?.trim() ||
    process.env.VITE_GCP_LOCATION?.trim() ||
    'us-central1'
  );
}

function getOpenAiKey() {
  return (
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.AI_API_KEY?.trim() ||
    ''
  );
}

function getOpenRouterKey() {
  return (
    process.env.OPENROUTER_API_KEY?.trim() ||
    (getOpenAiKey().startsWith('sk-or-') ? getOpenAiKey() : '') ||
    ''
  );
}

function getCustomBaseUrl() {
  return (
    process.env.AI_BASE_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    ''
  ).replace(/\/$/, '');
}

function getConfiguredModel(provider) {
  const explicit = process.env.AI_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || '';
  if (explicit) return explicit;
  if (provider === 'openrouter') return DEFAULT_OPENROUTER_MODEL;
  if (provider === 'openai' || provider === 'custom') return DEFAULT_OPENAI_MODEL;
  return GEMINI_MODELS[0];
}

/**
 * Resolve which provider to use.
 * AI_PROVIDER=auto (default) picks from available keys.
 */
export function resolveAiProvider() {
  const forced = (process.env.AI_PROVIDER || 'auto').trim().toLowerCase();
  const geminiKey = getGeminiApiKey();
  const openAiKey = getOpenAiKey();
  const openRouterKey = getOpenRouterKey();
  const baseUrl = getCustomBaseUrl();

  if (forced && forced !== 'auto') {
    if (forced === 'gemini') {
      return geminiKey
        ? { provider: 'gemini', apiKey: geminiKey, baseUrl: null, model: getConfiguredModel('gemini') }
        : null;
    }
    if (forced === 'openrouter') {
      const key = openRouterKey || openAiKey;
      return key
        ? {
            provider: 'openrouter',
            apiKey: key,
            baseUrl: baseUrl || OPENROUTER_BASE,
            model: getConfiguredModel('openrouter'),
          }
        : null;
    }
    if (forced === 'openai') {
      return openAiKey
        ? {
            provider: 'openai',
            apiKey: openAiKey,
            baseUrl: baseUrl || OPENAI_BASE,
            model: getConfiguredModel('openai'),
          }
        : null;
    }
    if (forced === 'custom') {
      const key = openAiKey || openRouterKey;
      return key && baseUrl
        ? { provider: 'custom', apiKey: key, baseUrl, model: getConfiguredModel('custom') }
        : null;
    }
  }

  // Auto: prefer explicit OpenAI-compatible keys, then Gemini
  if (openRouterKey || openAiKey.startsWith('sk-or-')) {
    return {
      provider: 'openrouter',
      apiKey: openRouterKey || openAiKey,
      baseUrl: baseUrl || OPENROUTER_BASE,
      model: getConfiguredModel('openrouter'),
    };
  }
  if (baseUrl && openAiKey) {
    return {
      provider: 'custom',
      apiKey: openAiKey,
      baseUrl,
      model: getConfiguredModel('custom'),
    };
  }
  if (openAiKey) {
    return {
      provider: 'openai',
      apiKey: openAiKey,
      baseUrl: baseUrl || OPENAI_BASE,
      model: getConfiguredModel('openai'),
    };
  }
  if (geminiKey) {
    return {
      provider: 'gemini',
      apiKey: geminiKey,
      baseUrl: null,
      model: getConfiguredModel('gemini'),
    };
  }
  return null;
}

export function isAiConfigured() {
  return Boolean(resolveAiProvider());
}

/** @deprecated use isAiConfigured */
export function isGeminiConfigured() {
  return isAiConfigured();
}

export function getAiStatus() {
  const resolved = resolveAiProvider();
  return {
    configured: Boolean(resolved),
    provider: resolved?.provider || null,
    model: resolved?.model || null,
    vertexProject: getGcpProjectId() || null,
  };
}

// ── Gemini provider ──────────────────────────────────────────────────────────

function parseGeminiApiError(body, status) {
  try {
    const parsed = JSON.parse(body);
    const message = parsed?.error?.message || '';
    if (!message) return `Gemini API error (${status})`;

    const lower = message.toLowerCase();
    if (status === 429 || lower.includes('quota')) {
      return 'Gemini quota exceeded. Wait a few minutes or enable billing in Google Cloud, then retry.';
    }
    if (
      status === 401 ||
      status === 403 ||
      lower.includes('api key') ||
      lower.includes('oauth 2') ||
      lower.includes('authentication') ||
      lower.includes('referer') ||
      lower.includes('blocked')
    ) {
      if (lower.includes('referer') || (lower.includes('blocked') && lower.includes('referer'))) {
        return (
          'Google blocked this API key due to HTTP referrer restrictions. In Google Cloud Console → Credentials → your API key, ' +
          'set Application restrictions to None (for local/server use), or allow http://localhost:5000/* — then retry.'
        );
      }
      if (lower.includes('are blocked') || lower.includes('requests to this api')) {
        return (
          'This API key is not allowed to call Gemini. In Google Cloud Console → Credentials → your API key → API restrictions, ' +
          'choose Don\'t restrict key, OR restrict to Generative Language API / Gemini API. Also enable Gemini API via ' +
          'https://console.cloud.google.com/flows/enableapi?apiid=generativelanguage.googleapis.com'
        );
      }
      return (
        'Google rejected this API key. In Google Cloud Console → APIs & Services → Credentials, ' +
        'create an API key (not an OAuth Client ID/secret), enable Generative Language API ' +
        '(and Vertex AI API if using GCP_PROJECT_ID), then set GEMINI_API_KEY or GOOGLE_API_KEY in .env.'
      );
    }
    return message.split('\n')[0];
  } catch {
    return `Gemini API error (${status})`;
  }
}

function buildGeminiParts(input) {
  const parts = [];
  if (typeof input.imageDataUrl === 'string' && input.imageDataUrl.startsWith('data:')) {
    const match = input.imageDataUrl.match(/^data:(.*?);base64,(.*)$/);
    if (match) {
      parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
    }
  }
  parts.push({ text: userPromptText(input) });
  return parts;
}

function geminiEndpointCandidates(model) {
  const projectId = getGcpProjectId();
  const location = getGcpLocation();
  const urls = [`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`];
  if (projectId) {
    urls.push(
      `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent`,
      `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`,
    );
  }
  return urls;
}

async function postGeminiGenerate(url, apiKey, body) {
  const appUrl = (process.env.APP_URL || 'http://localhost:5000').replace(/\/$/, '');
  const attempts = [
    {
      url,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
        Referer: `${appUrl}/`,
        Origin: appUrl,
      },
    },
    {
      url: `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`,
      headers: {
        'Content-Type': 'application/json',
        Referer: `${appUrl}/`,
        Origin: appUrl,
      },
    },
  ];

  let lastStatus = 0;
  let lastBody = '';

  for (const attempt of attempts) {
    const response = await fetch(attempt.url, {
      method: 'POST',
      headers: attempt.headers,
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (response.ok) return { ok: true, body: text, status: response.status };
    lastStatus = response.status;
    lastBody = text;
    if (response.status !== 401 && response.status !== 403) break;
  }

  return { ok: false, body: lastBody, status: lastStatus };
}

async function callGeminiModel(apiKey, model, input) {
  const body = {
    contents: [{ parts: buildGeminiParts(input) }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.35,
    },
  };
  let lastError = `Gemini API error for ${model}`;

  for (const url of geminiEndpointCandidates(model)) {
    const result = await postGeminiGenerate(url, apiKey, body);
    if (!result.ok) {
      const err = parseGeminiApiError(result.body, result.status);
      lastError = err;
      if (
        result.status === 429 ||
        /quota/i.test(err) ||
        /referer|are blocked|rejected this API key|not allowed to call Gemini/i.test(err)
      ) {
        return { assessment: null, error: err };
      }
      continue;
    }

    let payload;
    try {
      payload = JSON.parse(result.body);
    } catch {
      lastError = 'Gemini returned invalid JSON';
      continue;
    }

    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      lastError = 'Gemini returned an empty response';
      continue;
    }

    const assessment = parseAssessment(text);
    if (!assessment) {
      lastError = 'Could not parse Gemini response — try again with a clearer photo';
      continue;
    }

    return { assessment };
  }

  return { assessment: null, error: lastError };
}

async function analyzeWithGemini(apiKey, input, preferredModel) {
  const models = preferredModel
    ? [preferredModel, ...GEMINI_MODELS.filter((m) => m !== preferredModel)]
    : GEMINI_MODELS;
  let lastError = 'Gemini API unavailable';

  for (const model of models) {
    try {
      const result = await callGeminiModel(apiKey, model, input);
      if (result.assessment) return { assessment: result.assessment, source: 'gemini', model };
      lastError = result.error || lastError;
      if (
        lastError.includes('quota') ||
        lastError.includes('rejected this API key') ||
        lastError.includes('not allowed to call Gemini') ||
        lastError.includes('referrer restrictions') ||
        lastError.includes('permission')
      ) {
        break;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Network error calling Gemini';
    }
  }

  return { assessment: null, source: 'error', error: lastError };
}

// ── OpenAI-compatible provider (OpenAI / OpenRouter / custom) ────────────────

function parseOpenAiError(body, status, provider) {
  try {
    const parsed = JSON.parse(body);
    const message = parsed?.error?.message || parsed?.error || '';
    const raw = parsed?.error?.metadata?.raw;
    const providerName = parsed?.error?.metadata?.provider_name;
    const text = typeof message === 'string' ? message : '';
    const rawText = typeof raw === 'string' ? raw : '';
    const combined = `${text} ${rawText}`.toLowerCase();

    if (
      status === 429 ||
      /rate.?limit|quota|temporarily rate-limited upstream/i.test(combined)
    ) {
      if (/upstream|provider returned error|rate_limit_exceeded/i.test(combined) || rawText) {
        const retry = parsed?.error?.metadata?.retry_after_seconds;
        const retryHint = retry ? ` Retry in ~${retry}s.` : ' Retry shortly.';
        const who = providerName ? ` (${providerName})` : '';
        return (
          `The free model is busy upstream${who} — this is not your OpenRouter account quota.` +
          retryHint +
          ' Or switch AI_MODEL / use a paid model, or add a provider key at https://openrouter.ai/settings/integrations'
        );
      }
      return `${provider} rate limit hit. Retry shortly or switch model/provider in .env.`;
    }
    if (status === 401 || status === 403) {
      return `${provider} rejected this API key. Check AI_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY in .env.`;
    }
    if (rawText) return rawText.split('\n')[0];
    if (text) return text.split('\n')[0];
    return `${provider} API error (${status})`;
  } catch {
    return `${provider} API error (${status})`;
  }
}

function extractMessageText(message) {
  if (!message) return '';
  const { content } = message;
  if (typeof content === 'string' && content.trim()) return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text' && typeof part.text === 'string') return part.text;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  // Some reasoning models put final text in alternate fields
  if (typeof message.reasoning === 'string' && message.reasoning.trim()) return message.reasoning;
  if (Array.isArray(message.reasoning_details)) {
    return message.reasoning_details
      .map((d) => (typeof d?.text === 'string' ? d.text : typeof d?.content === 'string' ? d.content : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function wantsReasoning() {
  const flag = (process.env.AI_REASONING || 'false').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'on';
}

async function analyzeWithOpenAiCompatible(config, input) {
  const { provider, apiKey, baseUrl, model } = config;
  const content = [{ type: 'text', text: userPromptText(input) }];

  if (typeof input.imageDataUrl === 'string' && input.imageDataUrl.startsWith('data:')) {
    content.push({
      type: 'image_url',
      image_url: { url: input.imageDataUrl },
    });
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === 'openrouter') {
    const appUrl = (process.env.APP_URL || 'http://localhost:5000').replace(/\/$/, '');
    headers['HTTP-Referer'] = appUrl;
    headers['X-Title'] = 'FixBridge';
  }

  const messages = [
    {
      role: 'system',
      content:
        'You are FixBridge AI. Respond with ONLY valid JSON matching the schema in the user message. No markdown fences.',
    },
    { role: 'user', content },
  ];

  const buildBody = (useJsonFormat) => {
    const mode = input.mode === 'detail' ? 'detail' : 'summary';
    const body = {
      model,
      temperature: 0.15,
      max_tokens: mode === 'detail' ? 700 : 350,
      messages,
    };
    // Many free/reasoning models reject response_format — optional.
    if (useJsonFormat) body.response_format = { type: 'json_object' };
    if (provider === 'openrouter' && wantsReasoning()) {
      body.reasoning = { enabled: true };
    }
    return body;
  };

  // Prefer plain JSON prompt; only retry with response_format if parse fails / API error
  const attempts = provider === 'openrouter' ? [false] : [true, false];
  let lastError = `${provider} API unavailable`;

  for (const useJsonFormat of attempts) {
    let response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(buildBody(useJsonFormat)),
      });
    } catch (err) {
      return {
        assessment: null,
        source: 'error',
        error: err instanceof Error ? err.message : `Network error calling ${provider}`,
      };
    }

    const text = await response.text();
    if (!response.ok) {
      lastError = parseOpenAiError(text, response.status, provider);
      // Retry without json_object if the model rejects it
      if (
        useJsonFormat &&
        (/response_format|json_object|not supported/i.test(lastError) || response.status === 400)
      ) {
        continue;
      }
      return { assessment: null, source: 'error', error: lastError };
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      lastError = `${provider} returned invalid JSON envelope`;
      continue;
    }

    const messageText = extractMessageText(payload?.choices?.[0]?.message);
    if (!messageText) {
      lastError = `${provider} returned an empty response`;
      continue;
    }

    const assessment = parseAssessment(messageText);
    if (!assessment) {
      lastError = `Could not parse ${provider} response — try again with a clearer photo`;
      continue;
    }

    return { assessment, source: provider, model };
  }

  return { assessment: null, source: 'error', error: lastError };
}

// ── Public entry ─────────────────────────────────────────────────────────────

export async function analyzeRepair(input) {
  const resolved = resolveAiProvider();
  if (!resolved) {
    return {
      assessment: null,
      source: 'fallback',
      error:
        'No AI API key configured. Set OPENAI_API_KEY, OPENROUTER_API_KEY, AI_API_KEY (+ AI_BASE_URL), or GEMINI_API_KEY in .env, then restart the API.',
    };
  }

  const payload = {
    ...input,
    mode: input.mode === 'detail' ? 'detail' : 'summary',
  };

  if (resolved.provider === 'gemini') {
    return analyzeWithGemini(resolved.apiKey, payload, resolved.model);
  }

  return analyzeWithOpenAiCompatible(resolved, payload);
}

const CHAT_SYSTEM = `You are FixBridge AI, a friendly home-repair assistant for NYC and Long Island homeowners.

Help customers understand repair issues, likely causes, rough cost ranges, urgency, DIY vs hire-a-pro guidance, and what to do next on FixBridge (post a job, get contractor bids).

Rules:
- Be clear, practical, and conversational — not robotic.
- Ask a short clarifying question when the issue is vague.
- Give NYC/LI-relevant cost ranges when useful.
- If safety is a concern (gas, electrical, flooding, structural), say so and recommend a licensed pro.
- Keep answers concise (usually 2–5 short paragraphs or short bullets).
- Do not invent that you already inspected their home; work from what they tell you.
- Never claim you booked a contractor; guide them to Post a Job when ready.`;

async function chatWithGemini(apiKey, messages, model) {
  const contents = [];
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    });
  }
  // Prefixed system guidance into first user turn if present
  if (contents.length > 0 && contents[0].role === 'user') {
    contents[0].parts[0].text = `${CHAT_SYSTEM}\n\nCustomer: ${contents[0].parts[0].text}`;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const result = await postGeminiGenerate(url, apiKey, {
    contents,
    generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
  });
  if (!result.ok) {
    return { reply: null, error: parseGeminiApiError(result.body, result.status) };
  }
  let payload;
  try {
    payload = JSON.parse(result.body);
  } catch {
    return { reply: null, error: 'Gemini returned invalid JSON' };
  }
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text?.trim()) return { reply: null, error: 'Gemini returned an empty reply' };
  return { reply: text.trim() };
}

async function chatWithOpenAiCompatible(config, messages) {
  const { provider, apiKey, baseUrl, model } = config;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === 'openrouter') {
    const appUrl = (process.env.APP_URL || 'http://localhost:5000').replace(/\/$/, '');
    headers['HTTP-Referer'] = appUrl;
    headers['X-Title'] = 'FixBridge';
  }

  const payloadMessages = [
    { role: 'system', content: CHAT_SYSTEM },
    ...messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content })),
  ];

  let response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 700,
        messages: payloadMessages,
      }),
    });
  } catch (err) {
    return {
      reply: null,
      error: err instanceof Error ? err.message : `Network error calling ${provider}`,
    };
  }

  const text = await response.text();
  if (!response.ok) {
    return { reply: null, error: parseOpenAiError(text, response.status, provider) };
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { reply: null, error: `${provider} returned invalid JSON` };
  }

  const reply = extractMessageText(payload?.choices?.[0]?.message);
  if (!reply?.trim()) {
    return { reply: null, error: `${provider} returned an empty reply` };
  }
  return { reply: reply.trim(), model };
}

/**
 * Conversational FixBridge assistant for the AI Assistance tab.
 * @param {{ messages: { role: 'user'|'assistant'|'system', content: string }[] }} input
 */
export async function chatWithCustomer(input) {
  const resolved = resolveAiProvider();
  if (!resolved) {
    return {
      reply: null,
      source: 'fallback',
      error:
        'No AI API key configured. Set OPENAI_API_KEY, OPENROUTER_API_KEY, or GEMINI_API_KEY in .env.',
    };
  }

  const messages = Array.isArray(input?.messages) ? input.messages : [];
  if (!messages.some((m) => m.role === 'user' && typeof m.content === 'string' && m.content.trim())) {
    return { reply: null, source: 'error', error: 'At least one user message is required.' };
  }

  if (resolved.provider === 'gemini') {
    const result = await chatWithGemini(resolved.apiKey, messages, resolved.model || GEMINI_MODELS[0]);
    if (!result.reply) return { reply: null, source: 'error', error: result.error };
    return { reply: result.reply, source: 'gemini', model: resolved.model };
  }

  const result = await chatWithOpenAiCompatible(resolved, messages);
  if (!result.reply) return { reply: null, source: 'error', error: result.error };
  return { reply: result.reply, source: resolved.provider, model: result.model || resolved.model };
}

