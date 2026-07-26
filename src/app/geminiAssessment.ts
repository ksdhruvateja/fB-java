import type { JobCategory } from "./jobBoard";

export type DiyGuideImage = {
  title: string;
  caption: string;
  imagePrompt: string;
};

export type AiAssessment = {
  overview: string;
  imageObservations: string[];
  diagnosis: string;
  likelyRootCause: string;
  professionalSteps: string[];
  partsNeeded: string[];
  workScope: string[];
  toolsRequired: string[];
  diySteps: string[];
  diyGuideImages: DiyGuideImage[];
  suggestions: string[];
  estimatedCost: string;
  estimatedDuration: string;
  urgency: string;
  safetyNotes: string;
  professionalRecommended: boolean;
};

/** @deprecated use AiAssessment */
export type GeminiAssessment = AiAssessment;

type AssessInput = {
  category: JobCategory;
  description: string;
  imageDataUrl?: string | null;
  mode?: "summary" | "detail";
};

export type AiProviderSource =
  | "gemini"
  | "openai"
  | "openrouter"
  | "custom"
  | "fallback"
  | "error";

export type AnalyzeResult = {
  assessment: AiAssessment | null;
  source: AiProviderSource;
  error?: string;
  model?: string;
};

export type AiStatus = {
  configured: boolean;
  provider?: string | null;
  model?: string | null;
};

let cachedConfigured: boolean | null = null;
let cachedProvider: string | null = null;

const EMPTY_ASSESSMENT: AiAssessment = {
  overview: "",
  imageObservations: [],
  diagnosis: "",
  likelyRootCause: "",
  professionalSteps: [],
  partsNeeded: [],
  workScope: [],
  toolsRequired: [],
  diySteps: [],
  diyGuideImages: [],
  suggestions: [],
  estimatedCost: "",
  estimatedDuration: "",
  urgency: "",
  safetyNotes: "",
  professionalRecommended: true,
};

/** Offline-only placeholder when no API key is configured. */
function buildOfflineAssessment(input: AssessInput): AiAssessment {
  return {
    ...EMPTY_ASSESSMENT,
    overview:
      "No AI provider connected. Add OPENAI_API_KEY, OPENROUTER_API_KEY, AI_API_KEY (+ AI_BASE_URL), or GEMINI_API_KEY in .env.",
    imageObservations: input.imageDataUrl
      ? ["Photo uploaded but AI is offline — connect an API key for visual analysis."]
      : ["No photo uploaded."],
    diagnosis: `Offline preview for: ${input.description.trim().slice(0, 200)}`,
    likelyRootCause: "Connect an AI API key for a real diagnosis.",
    professionalSteps: ["Connect API key", "Re-run analysis with photo attached"],
    partsNeeded: ["Connect AI for part identification"],
    workScope: ["Real scope available after API connection"],
    toolsRequired: [],
    diySteps: [],
    suggestions: [
      "OpenAI: set OPENAI_API_KEY (optional OPENAI_MODEL)",
      "OpenRouter: set OPENROUTER_API_KEY or AI_API_KEY=sk-or-…",
      "Any OpenAI-compatible API: set AI_API_KEY + AI_BASE_URL + AI_MODEL",
      "Gemini: set GEMINI_API_KEY from Google AI Studio / Cloud Console",
    ],
    estimatedCost: "—",
    estimatedDuration: "—",
    urgency: "—",
    safetyNotes: "Do not rely on offline preview for safety decisions.",
    professionalRecommended: true,
  };
}

export async function refreshAiStatus(): Promise<boolean> {
  try {
    const response = await fetch("/api/ai/status");
    if (!response.ok) {
      cachedConfigured = false;
      cachedProvider = null;
      return false;
    }
    const data = (await response.json()) as AiStatus;
    cachedConfigured = Boolean(data.configured);
    cachedProvider = data.provider ?? null;
    return cachedConfigured;
  } catch {
    cachedConfigured = false;
    cachedProvider = null;
    return false;
  }
}

/** @deprecated use refreshAiStatus */
export const refreshGeminiStatus = refreshAiStatus;

export function isAiConfigured(): boolean {
  return cachedConfigured === true;
}

/** @deprecated use isAiConfigured */
export function isGeminiConfigured(): boolean {
  return isAiConfigured();
}

export function getAiProviderLabel(): string | null {
  return cachedProvider;
}

export function getAiKeyIssue(): string | null {
  if (cachedConfigured === false) {
    return "Add OPENAI_API_KEY, OPENROUTER_API_KEY, AI_API_KEY (+ AI_BASE_URL), or GEMINI_API_KEY to .env and restart the API";
  }
  return null;
}

/** @deprecated use getAiKeyIssue */
export function getGeminiKeyIssue(): string | null {
  return getAiKeyIssue();
}

export async function analyzeWithAi(input: AssessInput): Promise<AnalyzeResult> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    try {
      const token = window.localStorage.getItem("fixbridge-auth-token");
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      // ignore
    }
    const response = await fetch("/api/ai/assess", {
      method: "POST",
      headers,
      body: JSON.stringify({
        category: input.category,
        description: input.description,
        imageDataUrl: input.imageDataUrl ?? null,
        mode: input.mode ?? "summary",
      }),
    });

    const data = (await response.json()) as AnalyzeResult & { message?: string };
    if (!response.ok) {
      return {
        assessment: null,
        source: "error",
        error: data.message ?? data.error ?? `AI assess failed (${response.status})`,
      };
    }

    if (data.source === "fallback" && !data.assessment) {
      return {
        assessment: buildOfflineAssessment(input),
        source: "fallback",
        error: data.error,
      };
    }

    if (data.assessment) {
      cachedConfigured = true;
      if (data.source && data.source !== "fallback" && data.source !== "error") {
        cachedProvider = data.source;
      }
      return {
        assessment: data.assessment,
        source: data.source ?? "openai",
        model: data.model,
      };
    }

    return {
      assessment: null,
      source: data.source ?? "error",
      error: data.error ?? "AI assessment failed",
    };
  } catch (err) {
    return {
      assessment: null,
      source: "error",
      error: err instanceof Error ? err.message : "Network error calling AI assess",
    };
  }
}

/** @deprecated use analyzeWithAi */
export const analyzeWithGemini = analyzeWithAi;

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResult = {
  reply: string | null;
  source?: AiProviderSource | string;
  error?: string;
  model?: string;
};

/** Live customer chat via the same OpenRouter / OpenAI / Gemini provider. */
export async function chatWithAi(messages: ChatMessage[]): Promise<ChatResult> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    try {
      const token = window.localStorage.getItem("fixbridge-auth-token");
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      // ignore
    }
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    const data = (await response.json()) as ChatResult & { message?: string };
    if (!response.ok) {
      return {
        reply: null,
        source: "error",
        error: data.message ?? data.error ?? `AI chat failed (${response.status})`,
      };
    }
    if (data.reply) {
      cachedConfigured = true;
      return { reply: data.reply, source: data.source, model: data.model };
    }
    return {
      reply: null,
      source: data.source ?? "error",
      error: data.error ?? "AI chat returned an empty reply",
    };
  } catch (err) {
    return {
      reply: null,
      source: "error",
      error: err instanceof Error ? err.message : "Network error calling AI chat",
    };
  }
}

