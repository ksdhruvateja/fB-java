/**
 * Fixa OpenRouter Provider Connection Adapter
 * Fully aligned and stabilized with immediate fallback safeguards.
 * Patched to supply missing readOpenRouterKey named export for platform architecture stability.
 */
import { randomUUID } from "node:crypto";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const OPENROUTER_API_KEY = String(
    process.env.OPENROUTER_API_KEY || ""
).trim();

const OPENROUTER_MODEL = String(
    process.env.OPENROUTER_MODEL || "openrouter/free"
).trim();

const AI_FETCH_TIMEOUT_MS = Number(
    process.env.AI_FETCH_TIMEOUT_MS || 30000
);

function isConfigured() {
    return Boolean(
        OPENROUTER_API_KEY &&
        OPENROUTER_API_KEY !== "YOUR_OPENROUTER_API_KEY"
    );
}

// Added to resolve the specific named export mapping crash in api/ai.js
function readOpenRouterKey() {
    return isConfigured() ? OPENROUTER_API_KEY : '';
}

function getHeaders() {
    return {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "HTTP-Referer": String(
            process.env.APP_URL || "http://localhost:5000"
        ).trim(),
        "X-Title": "FixBridge",
    };
}

function normalizeContent(content) {
    if (typeof content === "string") {
        return content;
    }

    if (!Array.isArray(content)) {
        return "";
    }

    return content
        .map((item) => {
            if (!item) {
                return "";
            }

            if (typeof item === "string") {
                return item;
            }

            if (item.type === "text") {
                return String(item.text || "");
            }

            return "";
        })
        .filter(Boolean)
        .join("\n");
}

function normalizeMessages(messages = []) {
    return messages.map((message) => {
        if (!message) {
            return {
                role: "user",
                content: "",
            };
        }

        return {
            role: message.role || "user",
            content:
                typeof message.content === "string"
                    ? message.content
                    : Array.isArray(message.content)
                        ? message.content
                        : normalizeContent(message.content),
        };
    });
}

async function createCompletion({
    messages = [],
    system,
    temperature = 0.2,
    maxTokens = 2500,
    responseFormat,
    signal,
} = {}) {
    const requestId = randomUUID();
    const normalizedMessages = [];

    if (system) {
        normalizedMessages.push({
            role: "system",
            content: String(system),
        });
    }

    normalizedMessages.push(...normalizeMessages(messages));

    const body = {
        model: OPENROUTER_MODEL,
        messages: normalizedMessages,
        temperature,
        max_tokens: maxTokens,
    };

    if (responseFormat) {
        body.response_format = responseFormat;
    }

    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, AI_FETCH_TIMEOUT_MS);

    if (signal) {
        if (signal.aborted) {
            controller.abort();
        } else {
            signal.addEventListener(
                "abort",
                () => controller.abort(),
                { once: true }
            );
        }
    }

    const startedAt = Date.now();

    try {
        console.log("[fixa] OpenRouter request started", {
            provider: "openrouter",
            model: OPENROUTER_MODEL,
            messageCount: normalizedMessages.length,
            timeoutMs: AI_FETCH_TIMEOUT_MS,
            requestId,
        });

        if (!isConfigured()) {
            throw new Error("PROVIDER_ROUTE_BYPASS");
        }

        const response = await fetch(
            `${OPENROUTER_BASE_URL}/chat/completions`,
            {
                method: "POST",
                headers: {
                    ...getHeaders(),
                    "x-client-request-id": requestId,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            }
        );

        const latencyMs = Date.now() - startedAt;
        const rawText = await response.text();

        let payload;
        try {
            payload = rawText ? JSON.parse(rawText) : {};
        } catch {
            payload = { raw: rawText };
        }

        if (!response.ok) {
            throw new Error(`HTTP_${response.status}_FAILURE`);
        }

        const choice = payload?.choices?.[0];
        const content = choice?.message?.content;
        const text = typeof content === "string" ? content : normalizeContent(content);

        if (!text.trim()) {
            throw new Error("EMPTY_RESPONSE_BODY");
        }

        console.log("[fixa] OpenRouter request completed", {
            provider: "openrouter",
            model: OPENROUTER_MODEL,
            latencyMs,
            requestId,
        });

        return {
            ok: true,
            provider: "openrouter",
            model: payload?.model || OPENROUTER_MODEL,
            status: response.status,
            code: "ok",
            text,
            message: {
                role: "assistant",
                content: text,
            },
            usage: payload?.usage || null,
            requestId,
            latencyMs,
        };

    } catch (error) {
        const latencyMs = Date.now() - startedAt;
        const isTimeout = error?.name === "AbortError";
        const status = Number(error?.message?.match(/HTTP_(\d+)_FAILURE/)?.[1]) || null;

        console.warn("[fixa] OpenRouter request failed or bypassed", {
            code: isTimeout ? "provider_timeout" : "provider_exception",
            message: error?.message || "Connection Drop",
            latencyMs,
            requestId
        });
        return {
            ok: false,
            provider: "openrouter",
            model: OPENROUTER_MODEL,
            status,
            code: isTimeout ? "provider_timeout" : error?.message === "PROVIDER_ROUTE_BYPASS" ? "provider_not_configured" : status ? `provider_http_${status}` : "provider_exception",
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
    if (!isConfigured()) {
        return {
            ok: false,
            provider: "openrouter",
            model: OPENROUTER_MODEL,
            code: "not_connected",
        };
    }

    return {
        ok: true,
        provider: "openrouter",
        model: OPENROUTER_MODEL,
        code: "configured",
    };
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

const openrouterProvider = {
    provider: "openrouter",
    name: "OpenRouter",
    model: OPENROUTER_MODEL,
    models: [OPENROUTER_MODEL],
    supportsVision: true,
    supportsStructuredOutput: true,
    isConfigured,
    analyze,
    createCompletion,
    complete: createCompletion,
    healthCheck,
};

// Exported both explicitly as an explicit named object and default parameter to complete alignment
export {
    OPENROUTER_MODEL,
    isConfigured,
    createCompletion,
    analyze,
    healthCheck,
    openrouterProvider,
    readOpenRouterKey
};

export default openrouterProvider;
