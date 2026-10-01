/**
 * Fixa Anthropic Connection Adapter
 * Manages fallback Claude Sonnet loops with internal balance validations.
 * Aligned with explicit named export requirements for server runtime stability.
 */
import { randomUUID } from "node:crypto";
import { evaluateRepairAssessment } from "../evaluator/responseEvaluator.js";

const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_API_KEY = String(process.env.ANTHROPIC_API_KEY || "").trim();
const ANTHROPIC_MODEL = String(process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6").trim();
const ANTHROPIC_TIMEOUT_MS = Number(process.env.ANTHROPIC_TIMEOUT_MS || 30000);
const ANTHROPIC_VERSION = "2023-06-01";

function isConfigured() {
  return Boolean(ANTHROPIC_API_KEY && ANTHROPIC_API_KEY !== "YOUR_ANTHROPIC_API_KEY");
}

// Added to fix the specific named export mapping crash in api/ai.js
function readAnthropicKey() {
  return isConfigured() ? ANTHROPIC_API_KEY : '';
}

function getHeaders(requestId) {
  return {
    "x-api-key": ANTHROPIC_API_KEY,
    "anthropic-version": ANTHROPIC_VERSION,
    "content-type": "application/json",
    "accept": "application/json",
    "x-client-request-id": requestId
  };
}

function normalizeText(value) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    if (!item) return "";
    if (typeof item === "string") return item;
    if (item.type === "text") return String(item.text || "");
    return "";
  }).filter(Boolean).join('\n');
}

function normalizeImage(image) {
  if (!image) return null;
  const imageUrl = image.type === "image_url" ? image.image_url?.url : null;
  const dataUrlMatch = typeof imageUrl === "string"
    ? imageUrl.match(/^data:([^;,]+);base64,(.+)$/i)
    : null;
  const mime = String(dataUrlMatch?.[1] || image.mime || image.mimeType || image.contentType || "").trim().toLowerCase();
  let data = dataUrlMatch?.[2] || image.data || image.base64 || image.content || null;
  if (typeof data !== "string") return null;
  if (data.includes(",")) {
    const parts = data.split(",");
    if (parts?.[0]?.toLowerCase().includes("base64")) data = parts.slice(1).join(",");
  }
  if (!data) return null;
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
  if (!allowedTypes.has(mime)) {
    console.warn("[fixa] Claude unsupported image mime", { mime });
    return null;
  }
  return { type: "image", source: { type: "base64", media_type: mime, data } };
}

function normalizeMessages(messages = []) {
  return messages.map((message) => {
    const role = message?.role === "assistant" ? "assistant" : "user";
    const content = message?.content;
    if (typeof content === "string") return { role, content };
    if (!Array.isArray(content)) return { role, content: normalizeText(content) };
    const blocks = [];
    for (const item of content) {
      if (!item) continue;
      if (typeof item === "string") { blocks.push({ type: "text", text: item }); continue; }
      if (item.type === "text") { blocks.push({ type: "text", text: String(item.text || "") }); continue; }
      if (item.type === "image" || item.type === "image_url" || item.mime || item.mimeType || item.base64 || item.data) {
        const image = normalizeImage(item);
        if (image) blocks.push(image);
      }
    }
    return { role, content: blocks.length > 0 ? blocks : "" };
  });
}

function extractSystem(messages, system) {
  if (system) return String(system);
  return messages.filter((message) => message?.role === "system").map((message) => normalizeText(message?.content)).filter(Boolean).join("\n\n");
}

function removeSystemMessages(messages) {
  return messages.filter((message) => message?.role !== "system");
}

function convertResponseFormat(responseFormat) {
  if (!responseFormat) return "";
  if (responseFormat.type === "json_object") return "\n\nReturn ONLY valid JSON. Do not use markdown fences.";
  return "";
}

async function createCompletion({ messages = [], system, temperature = 0.2, maxTokens = 2500, responseFormat, signal } = {}) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  let timeout;

  try {
    if (!isConfigured() || ANTHROPIC_API_KEY === "YOUR_ANTHROPIC_API_KEY") {
      throw new Error("PROVIDER_BILLING_EXHAUSTED_BYPASS");
    }

    const extractedSystem = extractSystem(messages, system);
    const userMessages = removeSystemMessages(messages);
    const normalizedMessages = normalizeMessages(userMessages);
    const finalSystem = `${extractedSystem || ""}${convertResponseFormat(responseFormat)}`;

    const body = {
      model: ANTHROPIC_MODEL,
      max_tokens: Math.max(256, Number(maxTokens || 2500)),
      temperature: Number(temperature ?? 0.2),
      messages: normalizedMessages
    };

    if (finalSystem.trim()) body.system = finalSystem.trim();

    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);

    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    const hasImage = JSON.stringify(normalizedMessages).includes('"type":"image"');
    console.log("[fixa] Claude request started", { provider: "anthropic", model: ANTHROPIC_MODEL, hasImage, messageCount: normalizedMessages.length, timeoutMs: ANTHROPIC_TIMEOUT_MS, requestId });

    const response = await fetch(`${ANTHROPIC_BASE_URL}/messages`, { method: "POST", headers: getHeaders(requestId), body: JSON.stringify(body), signal: controller.signal });
    const latencyMs = Date.now() - startedAt;
    const rawText = await response.text();

    clearTimeout(timeout);

    let payload;
    try { payload = rawText ? JSON.parse(rawText) : {}; } catch { payload = { raw: rawText }; }

    if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
    if (rawText.includes("credit balance is too low")) throw new Error("PROVIDER_BILLING_EXHAUSTED");

    const text = normalizeText(payload?.content);

    if (!text.trim()) {
      throw new Error("EMPTY_RESPONSE_BODY");
    }

    console.log("[fixa] Claude request completed", { provider: "anthropic", model: payload?.model || ANTHROPIC_MODEL, latencyMs, requestId });

    return {
      ok: true,
      provider: "anthropic",
      model: payload?.model || ANTHROPIC_MODEL,
      status: response.status,
      code: "ok",
      text,
      message: { role: "assistant", content: text },
      usage: payload?.usage || null,
      requestId,
      latencyMs
    };

  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const isTimeout = error?.name === "AbortError";
    const status = Number(error?.message?.match(/PROVIDER_HTTP_(\d+)/)?.[1]) || null;

    console.warn("[fixa] Claude request failed or bypassed", {
      code: isTimeout ? "provider_timeout" : "provider_exception",
      message: error?.message || "Billing Lock",
      latencyMs,
      requestId
    });
    return {
      ok: false,
      provider: "anthropic",
      model: ANTHROPIC_MODEL,
      status,
      code: isTimeout ? "provider_timeout" : error?.message === "PROVIDER_BILLING_EXHAUSTED_BYPASS" ? "provider_not_configured" : error?.message === "PROVIDER_BILLING_EXHAUSTED" ? "provider_billing_exhausted" : status ? `provider_http_${status}` : "provider_exception",
      error: true,
      usage: null,
      requestId,
      latencyMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function healthCheck() {
  if (!isConfigured()) return { ok: false, provider: "anthropic", model: ANTHROPIC_MODEL, code: "not_connected" };
  return { ok: true, provider: "anthropic", model: ANTHROPIC_MODEL, code: "configured" };
}

async function analyze({ messages = [], temperature = 0.2, maxTokens = 2500, json = false, signal } = {}) {
  return createCompletion({
    messages,
    temperature,
    maxTokens,
    signal,
    responseFormat: json ? { type: "json_object" } : undefined,
  });
}

const anthropicProvider = {
  provider: "anthropic",
  name: "Anthropic Claude",
  model: ANTHROPIC_MODEL,
  models: [ANTHROPIC_MODEL],
  supportsVision: true,
  supportsStructuredOutput: true,
  isConfigured,
  analyze,
  createCompletion,
  complete: createCompletion,
  healthCheck
};

export { ANTHROPIC_MODEL, isConfigured, analyze, createCompletion, healthCheck, anthropicProvider, readAnthropicKey };
export default anthropicProvider;
