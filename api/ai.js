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

/** Structured assessment — NO prices. Pricing engine owns retail ranges. */
export const STRUCTURED_PROMPT = `You are a property-repair assessment engine. Analyze the issue and photo if attached.
Return ONLY valid JSON with this exact schema (no prices, no dollar amounts, no markdown):
{
  "category": "plumbing|electrical|hvac|painting|roofing|flooring|carpentry|others",
  "summary": "1-2 short sentences",
  "urgency": "low|medium|high|emergency",
  "confidence": 0.0,
  "recommended_trade": "licensed_plumber|electrician|hvac_tech|painter|roofer|flooring_tech|carpenter|handyman",
  "professional_required": true,
  "safe_diy_allowed": false,
  "immediate_safety_steps": ["step"],
  "visual_findings": ["finding"],
  "estimated_labor_hours_min": 1,
  "estimated_labor_hours_max": 3,
  "complexity": "low|medium|high",
  "questions_needed": [],
  "diy_difficulty": "easy|moderate|hard|blocked",
  "tools_required": ["tool"],
  "materials_needed": ["material"],
  "diy_steps": ["only if safe_diy_allowed"],
  "stop_conditions": ["when to call a pro"],
  "disclaimer": "AI-assisted assessment, not a professional diagnosis."
}
Rules:
- Never invent prices or cost ranges.
- Set safe_diy_allowed=false for gas, major electrical, flooding, sewage, fire/smoke/CO, structural, dangerous roof, asbestos/lead/hazmat, or low confidence.
- Active leaks / flooding / gas smell => urgency high or emergency and professional_required true.`;

export const SUMMARY_PROMPT = STRUCTURED_PROMPT;
export const DETAIL_PROMPT = STRUCTURED_PROMPT;
export const PROMPT = STRUCTURED_PROMPT;

const DIY_BLOCK_PATTERNS = [
  /gas\s*leak/i,
  /natural\s*gas/i,
  /combustion/i,
  /high\s*voltage/i,
  /main\s*panel/i,
  /flood/i,
  /sewage|sewer\s*backup/i,
  /fire|smoke|carbon\s*monoxide|\bCO\b/i,
  /structural|load[- ]bearing|foundation/i,
  /asbestos|lead\s*paint|hazardous/i,
  /roof\s*(collapse|edge|steep)/i,
];

export function applyDiySafetyRules(assessment, description = '') {
  const text = `${assessment.summary || ''} ${description} ${(assessment.visual_findings || []).join(' ')}`;
  const blocked = DIY_BLOCK_PATTERNS.some((re) => re.test(text));
  const confidence = typeof assessment.confidence === 'number' ? assessment.confidence : 0.5;
  if (blocked || confidence < 0.4) {
    return {
      ...assessment,
      safe_diy_allowed: false,
      professional_required: true,
      diy_difficulty: 'blocked',
      diy_steps: [],
      immediate_safety_steps:
        assessment.immediate_safety_steps?.length
          ? assessment.immediate_safety_steps
          : ['If unsafe, leave the area and contact emergency services or a licensed professional.'],
    };
  }
  return assessment;
}

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

export function parseStructuredAssessment(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    const urgencyRaw = asString(parsed.urgency, 'medium').toLowerCase();
    let urgency = 'medium';
    if (urgencyRaw.includes('emerg')) urgency = 'emergency';
    else if (urgencyRaw.includes('high')) urgency = 'high';
    else if (urgencyRaw.includes('low')) urgency = 'low';

    const confidence = typeof parsed.confidence === 'number'
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.6;

    const assessment = {
      category: asString(parsed.category, 'others').toLowerCase(),
      summary: asString(parsed.summary) || asString(parsed.overview) || asString(parsed.diagnosis),
      urgency,
      confidence,
      recommended_trade: asString(parsed.recommended_trade, 'handyman'),
      professional_required:
        typeof parsed.professional_required === 'boolean'
          ? parsed.professional_required
          : typeof parsed.professionalRecommended === 'boolean'
            ? parsed.professionalRecommended
            : true,
      safe_diy_allowed:
        typeof parsed.safe_diy_allowed === 'boolean' ? parsed.safe_diy_allowed : false,
      immediate_safety_steps: asStringArray(parsed.immediate_safety_steps),
      visual_findings: asStringArray(parsed.visual_findings).length
        ? asStringArray(parsed.visual_findings)
        : asStringArray(parsed.imageObservations),
      estimated_labor_hours_min: Number(parsed.estimated_labor_hours_min) || 1,
      estimated_labor_hours_max: Number(parsed.estimated_labor_hours_max) || 3,
      complexity: asString(parsed.complexity, 'medium').toLowerCase(),
      questions_needed: asStringArray(parsed.questions_needed),
      diy_difficulty: asString(parsed.diy_difficulty, 'blocked'),
      tools_required: asStringArray(parsed.tools_required).length
        ? asStringArray(parsed.tools_required)
        : asStringArray(parsed.toolsRequired),
      materials_needed: asStringArray(parsed.materials_needed).length
        ? asStringArray(parsed.materials_needed)
        : asStringArray(parsed.partsNeeded),
      diy_steps: asStringArray(parsed.diy_steps).length
        ? asStringArray(parsed.diy_steps)
        : asStringArray(parsed.diySteps),
      stop_conditions: asStringArray(parsed.stop_conditions),
      disclaimer: asString(
        parsed.disclaimer,
        'AI-assisted assessment, not a professional diagnosis.'
      ),
    };
    if (!assessment.summary) return null;
    // Strip any accidental price fields from model output
    delete assessment.estimatedCost;
    delete assessment.estimated_cost;
    return assessment;
  } catch {
    return null;
  }
}

export function fallbackStructuredAssessment({ category, description } = {}) {
  const text = `${category || ''} ${description || ''}`.toLowerCase();
  let urgency = 'medium';
  if (/flood|gas|fire|sparks|sewage|no heat.*winter|burning smell/.test(text)) urgency = 'emergency';
  else if (/leak|broken|not working|outage/.test(text)) urgency = 'high';

  const cat = String(category || 'others').toLowerCase();
  return applyDiySafetyRules(
    {
      category: cat.includes('plumb') ? 'plumbing' : cat.includes('electr') ? 'electrical' : 'others',
      summary: description
        ? `Possible ${category || 'repair'} issue based on the description provided.`
        : 'Issue reported — professional review recommended.',
      urgency,
      confidence: description ? 0.55 : 0.35,
      recommended_trade: 'handyman',
      professional_required: true,
      safe_diy_allowed: false,
      immediate_safety_steps: urgency === 'emergency'
        ? ['If there is immediate danger, leave the area and call emergency services.']
        : ['Document the issue with photos and avoid further damage if safe.'],
      visual_findings: [],
      estimated_labor_hours_min: 1,
      estimated_labor_hours_max: 4,
      complexity: 'medium',
      questions_needed: ['Can you share clearer photos of the affected area?'],
      diy_difficulty: 'blocked',
      tools_required: [],
      materials_needed: [],
      diy_steps: [],
      stop_conditions: ['Stop and request a professional if the issue worsens.'],
      disclaimer: 'AI-assisted assessment, not a professional diagnosis.',
    },
    description
  );
}

/** Legacy mapper for older UI that still expects overview/estimatedCost fields (cost left empty). */
export function parseAssessment(text) {
  const structured = parseStructuredAssessment(text);
  if (structured) {
    return {
      overview: structured.summary,
      imageObservations: structured.visual_findings,
      diagnosis: structured.summary,
      likelyRootCause: '',
      professionalSteps: [],
      partsNeeded: structured.materials_needed,
      workScope: [],
      toolsRequired: structured.tools_required,
      diySteps: structured.safe_diy_allowed ? structured.diy_steps : [],
      diyGuideImages: [],
      suggestions: structured.immediate_safety_steps,
      estimatedCost: '', // pricing engine only
      estimatedDuration: `${structured.estimated_labor_hours_min}-${structured.estimated_labor_hours_max} hours`,
      urgency: structured.urgency,
      safetyNotes: structured.immediate_safety_steps.join(' '),
      professionalRecommended: structured.professional_required,
      // structured fields also available
      ...structured,
    };
  }
  return null;
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

/**
 * Managed MVP assessment: structured technical fields only (no invented prices).
 */
export async function analyzeRepairStructured(input) {
  const result = await analyzeRepair({ ...input, mode: 'summary' });
  let structured = null;

  if (result.assessment) {
    // analyzeRepair already parsed via parseAssessment which embeds structured fields
    if (result.assessment.summary || result.assessment.category) {
      structured = {
        category: result.assessment.category || String(input.category || 'others').toLowerCase(),
        summary: result.assessment.summary || result.assessment.overview || result.assessment.diagnosis || '',
        urgency: String(result.assessment.urgency || 'medium').toLowerCase().includes('emerg')
          ? 'emergency'
          : String(result.assessment.urgency || 'medium').toLowerCase().includes('high')
            ? 'high'
            : String(result.assessment.urgency || 'medium').toLowerCase().includes('low')
              ? 'low'
              : 'medium',
        confidence: typeof result.assessment.confidence === 'number' ? result.assessment.confidence : 0.65,
        recommended_trade: result.assessment.recommended_trade || 'handyman',
        professional_required:
          typeof result.assessment.professional_required === 'boolean'
            ? result.assessment.professional_required
            : result.assessment.professionalRecommended !== false,
        safe_diy_allowed: result.assessment.safe_diy_allowed === true,
        immediate_safety_steps: result.assessment.immediate_safety_steps || [],
        visual_findings: result.assessment.visual_findings || result.assessment.imageObservations || [],
        estimated_labor_hours_min: result.assessment.estimated_labor_hours_min || 1,
        estimated_labor_hours_max: result.assessment.estimated_labor_hours_max || 3,
        complexity: result.assessment.complexity || 'medium',
        questions_needed: result.assessment.questions_needed || [],
        diy_difficulty: result.assessment.diy_difficulty || 'blocked',
        tools_required: result.assessment.tools_required || result.assessment.toolsRequired || [],
        materials_needed: result.assessment.materials_needed || result.assessment.partsNeeded || [],
        diy_steps: result.assessment.diy_steps || result.assessment.diySteps || [],
        stop_conditions: result.assessment.stop_conditions || [],
        disclaimer:
          result.assessment.disclaimer || 'AI-assisted assessment, not a professional diagnosis.',
      };
    }
  }

  if (!structured) {
    structured = fallbackStructuredAssessment(input);
    return {
      assessment: applyDiySafetyRules(structured, input.description),
      source: result.source === 'error' ? 'fallback' : result.source || 'fallback',
      model: result.model,
      error: result.error,
    };
  }

  return {
    assessment: applyDiySafetyRules(structured, input.description),
    source: result.source,
    model: result.model,
    error: result.error,
  };
}

const CHAT_SYSTEM = `# SYSTEM PROMPT

You are an intelligent, friendly, and highly empathetic AI assistant for FixBridge, a home services company. Your primary goal is to understand the customer's situation, identify their needs, and respond in a way that is helpful, reassuring, and conversational.

When relevant, you may mention FixBridge options such as posting a job to get contractor bids, or using the guided DIY assessment — but never claim you already booked a technician or inspected their home.

## Your Personality

- Be warm, polite, and professional.
- Sound human and natural, not robotic.
- Build trust through understanding and clear communication.
- Keep responses positive, calm, and solution-oriented.
- Match the customer's tone while remaining respectful.
- Avoid generic or repetitive responses.

## Your Core Responsibilities

### 1. Understand the Customer First
Before responding, analyze:
- What problem is the customer experiencing?
- What is the customer's main goal?
- How urgent is the issue?
- What emotions are they expressing (frustration, confusion, stress, urgency, happiness, curiosity, etc.)?
- Are they asking directly or indirectly for help?

If the customer's message is unclear, politely ask relevant follow-up questions instead of making assumptions.

### 2. Analyze the Situation

Internally determine:
- Type of home service needed
- Severity of the issue
- Possible causes
- Best next steps
- Whether emergency assistance may be required
- Information still needed from the customer

Do not expose your internal reasoning. Only provide the final helpful response.

### 3. Build Rapport

Always make the customer feel heard.

Examples:
- Acknowledge what they shared.
- Show understanding of their situation.
- Respond naturally rather than using scripted phrases.

Instead of:
"I understand."

Prefer:
"That definitely sounds frustrating."
"I can see why you'd want to get this resolved quickly."
"Thanks for explaining the situation."

### 4. Be Solution Focused

Every response should move the conversation forward.

When appropriate:
- Explain the issue simply.
- Suggest practical next steps.
- Recommend scheduling a technician.
- Suggest troubleshooting steps if safe.
- Explain what information is needed.
- Offer alternative solutions.

### 5. Handle Different Customer Emotions

If customer is frustrated:
- Stay calm.
- Never argue.
- Acknowledge the inconvenience.
- Focus on resolving the issue.

If customer is worried:
- Be reassuring.
- Explain clearly.
- Reduce uncertainty.

If customer is angry:
- Stay respectful.
- Don't blame anyone.
- Focus on helping.

If customer is happy:
- Match their positive energy.

### 6. Ask Smart Follow-up Questions

Only ask what is necessary.

Examples:
- Which appliance is affected?
- When did the issue start?
- Is the problem happening continuously or intermittently?
- Have you noticed any unusual sounds or smells?
- Is there any visible water leakage?
- Can you share a photo if possible?

Do not overwhelm customers with too many questions at once.

### 7. Communication Style

Responses should be:
- Natural
- Friendly
- Clear
- Concise
- Helpful
- Easy to understand

Avoid:
- Technical jargon unless requested.
- Long paragraphs.
- Robotic wording.
- Repeating the customer's message unnecessarily.

### 8. Home Services Knowledge

Be prepared to assist with services including but not limited to:

- Plumbing
- Electrical
- HVAC
- Air Conditioning
- Heating
- Appliance Repair
- Roofing
- Painting
- Pest Control
- Cleaning
- Handyman
- Flooring
- Carpentry
- Locksmith
- Garage Doors
- Water Heater
- Drain Cleaning
- Smart Home Devices
- Home Maintenance
- Landscaping
- General Repairs

### 9. Safety First

If the customer describes a dangerous situation such as:
- Gas smell
- Smoke
- Fire
- Sparking wires
- Flooding
- Structural damage
- Carbon monoxide concerns
- Electrical burning smell

Prioritize safety.

Advise the customer to:
- Stop using affected equipment if safe.
- Leave the area if necessary.
- Contact emergency services or the appropriate utility if there is immediate danger.
- Arrange emergency professional assistance.

Never encourage unsafe actions.

### 10. Booking Assistance

If the customer appears ready for service:
- Help collect the required information naturally.
- Confirm:
  - Service needed
  - Address
  - Preferred date
  - Preferred time
  - Contact information
- Summarize before confirming.
- Guide them to post a job on FixBridge when they are ready for a technician — do not invent a booking confirmation.

### 11. If Information Is Missing

Never guess.

Politely ask for the missing details needed to provide accurate assistance.

### 12. Tone Adaptation

Adjust your tone based on the customer's communication style.

If the customer is:
- Formal → respond professionally.
- Casual → be conversational.
- Brief → keep responses concise.
- Detailed → provide detailed guidance.

### 13. Response Structure

Whenever possible:

1. Acknowledge the customer's situation.
2. Address their concern.
3. Offer a solution or next step.
4. Ask one relevant follow-up question if needed.
5. End positively.

### 14. Never

- Invent information.
- Promise unavailable services.
- Guess pricing.
- Diagnose with certainty without enough information.
- Blame the customer.
- Use dismissive language.
- Use overly scripted responses.

### 15. Goal

Your objective is to make every customer feel:

- Heard
- Understood
- Respected
- Confident
- Comfortable
- Guided toward the best solution

Every response should improve the customer's experience while helping them efficiently resolve their home service needs.`;

async function chatWithGemini(apiKey, messages, model) {
  const contents = [];
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const result = await postGeminiGenerate(url, apiKey, {
    systemInstruction: { parts: [{ text: CHAT_SYSTEM }] },
    contents:
      contents.length > 0
        ? contents
        : [{ role: 'user', parts: [{ text: 'Hello' }] }],
    generationConfig: { temperature: 0.55, maxOutputTokens: 900 },
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
        temperature: 0.55,
        max_tokens: 900,
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

