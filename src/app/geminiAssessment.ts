import type { JobCategory } from "./jobBoard";

export type GeminiAssessment = {
  overview: string;
  imageObservations: string[];
  diagnosis: string;
  likelyRootCause: string;
  professionalSteps: string[];
  partsNeeded: string[];
  workScope: string[];
  toolsRequired: string[];
  diySteps: string[];
  suggestions: string[];
  estimatedCost: string;
  estimatedDuration: string;
  urgency: string;
  safetyNotes: string;
  professionalRecommended: boolean;
};

type AssessInput = {
  category: JobCategory;
  description: string;
  imageDataUrl?: string | null;
};

export type AnalyzeResult = {
  assessment: GeminiAssessment | null;
  source: "gemini" | "fallback" | "error";
  error?: string;
};

const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash-8b",
];

const EMPTY_ASSESSMENT: GeminiAssessment = {
  overview: "",
  imageObservations: [],
  diagnosis: "",
  likelyRootCause: "",
  professionalSteps: [],
  partsNeeded: [],
  workScope: [],
  toolsRequired: [],
  diySteps: [],
  suggestions: [],
  estimatedCost: "",
  estimatedDuration: "",
  urgency: "",
  safetyNotes: "",
  professionalRecommended: true,
};

const GEMINI_PROMPT = `You are FixBridge AI — an expert licensed-trades assessor for NYC/Long Island homeowners.

TASK: Analyze the homeowner's repair issue. If a photo is attached, inspect it FIRST. Describe exactly what you see in the image (materials, damage type, location, severity, corrosion, water marks, cracks, component model clues). Do NOT give generic category advice.

Your response must be specific to THIS issue and THIS photo.

Return ONLY valid JSON with this exact shape:
{
  "overview": "2-3 sentence summary specific to this case",
  "imageObservations": ["specific visible detail from photo", "another specific detail"],
  "diagnosis": "technical diagnosis for this exact issue",
  "likelyRootCause": "most probable root cause",
  "professionalSteps": ["numbered professional step with trade detail", "..."],
  "partsNeeded": ["exact part name/size/type", "..."],
  "workScope": ["specific work item", "..."],
  "toolsRequired": ["tool name", "..."],
  "diySteps": ["safe DIY step if applicable", "..."],
  "suggestions": ["actionable recommendation", "..."],
  "estimatedCost": "$min-$max NYC/LI labor + parts",
  "estimatedDuration": "realistic hours",
  "urgency": "Low/Medium/High — reason",
  "safetyNotes": "specific safety warning",
  "professionalRecommended": true
}

Rules:
- Reference visible evidence from the photo when provided.
- Name specific parts (e.g. "1/2 inch P-trap washer kit", not just "plumbing parts").
- List 4-6 professional steps in execution order.
- If photo is missing, say so in imageObservations and rely on description only.`;

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function parseGeminiJson(text: string): GeminiAssessment | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as Partial<GeminiAssessment>;
    const assessment: GeminiAssessment = {
      overview: asString(parsed.overview),
      imageObservations: asStringArray(parsed.imageObservations),
      diagnosis: asString(parsed.diagnosis),
      likelyRootCause: asString(parsed.likelyRootCause),
      professionalSteps: asStringArray(parsed.professionalSteps),
      partsNeeded: asStringArray(parsed.partsNeeded),
      workScope: asStringArray(parsed.workScope),
      toolsRequired: asStringArray(parsed.toolsRequired),
      diySteps: asStringArray(parsed.diySteps),
      suggestions: asStringArray(parsed.suggestions),
      estimatedCost: asString(parsed.estimatedCost),
      estimatedDuration: asString(parsed.estimatedDuration),
      urgency: asString(parsed.urgency),
      safetyNotes: asString(parsed.safetyNotes),
      professionalRecommended:
        typeof parsed.professionalRecommended === "boolean" ? parsed.professionalRecommended : true,
    };
    if (!assessment.diagnosis && !assessment.overview) return null;
    return assessment;
  } catch {
    return null;
  }
}

function parseApiError(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    const message = parsed.error?.message;
    if (message) {
      if (status === 429 || message.includes("quota")) {
        return "Your Gemini API key is valid but quota is exceeded. Wait a few minutes, create a new API key at aistudio.google.com/apikey, or enable billing in Google AI Studio — then restart pnpm dev.";
      }
      if (status === 400 && message.includes("API key")) {
        return "Gemini rejected this API key. Copy a fresh key from aistudio.google.com/apikey into .env and restart pnpm dev.";
      }
      return message.split("\n")[0];
    }
  } catch {
    // ignore
  }
  return `Gemini API error (${status})`;
}

function buildRequestParts(input: AssessInput) {
  const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [];

  if (input.imageDataUrl?.startsWith("data:")) {
    const [, meta, data] = input.imageDataUrl.match(/^data:(.*?);base64,(.*)$/) || [];
    if (meta && data) {
      parts.push({ inline_data: { mime_type: meta, data } });
    }
  }

  parts.push({
    text: `${GEMINI_PROMPT}

Category: ${input.category}
Homeowner description: ${input.description}
Photo attached: ${input.imageDataUrl ? "YES — analyze the image in detail" : "NO — use description only"}`,
  });

  return parts;
}

async function callGeminiModel(
  apiKey: string,
  model: string,
  input: AssessInput,
): Promise<{ assessment: GeminiAssessment | null; error?: string }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: buildRequestParts(input) }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.35,
        },
      }),
    },
  );

  const body = await response.text();
  if (!response.ok) {
    return { assessment: null, error: parseApiError(body, response.status) };
  }

  const payload = JSON.parse(body) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return { assessment: null, error: "Gemini returned an empty response" };
  }

  const assessment = parseGeminiJson(text);
  if (!assessment) {
    return { assessment: null, error: "Could not parse Gemini response — try again with a clearer photo" };
  }
  return { assessment };
}

export function isGeminiConfigured(): boolean {
  const key = import.meta.env.VITE_GEMINI_API_KEY?.trim();
  return Boolean(key && key.length > 10);
}

export function getGeminiKeyIssue(): string | null {
  const key = import.meta.env.VITE_GEMINI_API_KEY?.trim();
  return validateApiKey(key ?? "");
}

function validateApiKey(apiKey: string): string | null {
  if (!apiKey) return "Add VITE_GEMINI_API_KEY to your .env file";
  if (apiKey.length < 10) return "Gemini API key looks too short — check your .env file";
  return null;
}

/** Offline-only placeholder when no API key is configured. */
function buildOfflineAssessment(input: AssessInput): GeminiAssessment {
  return {
    ...EMPTY_ASSESSMENT,
    overview: "Gemini API is not connected. Add VITE_GEMINI_API_KEY to .env for real image-based analysis.",
    imageObservations: input.imageDataUrl
      ? ["Photo uploaded but AI is offline — connect Gemini API for visual analysis."]
      : ["No photo uploaded."],
    diagnosis: `Offline preview for: ${input.description.trim().slice(0, 200)}`,
    likelyRootCause: "Connect Gemini API for a real diagnosis.",
    professionalSteps: ["Connect API key", "Re-run analysis with photo attached"],
    partsNeeded: ["Connect Gemini for part identification"],
    workScope: ["Real scope available after API connection"],
    toolsRequired: [],
    diySteps: [],
    suggestions: ["Get a free API key from https://aistudio.google.com/apikey"],
    estimatedCost: "—",
    estimatedDuration: "—",
    urgency: "—",
    safetyNotes: "Do not rely on offline preview for safety decisions.",
    professionalRecommended: true,
  };
}

export async function analyzeWithGemini(input: AssessInput): Promise<AnalyzeResult> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { assessment: buildOfflineAssessment(input), source: "fallback", error: "No API key configured" };
  }

  const keyError = validateApiKey(apiKey);
  if (keyError) {
    return { assessment: null, source: "error", error: keyError };
  }

  let lastError = "Gemini API unavailable";

  for (const model of GEMINI_MODELS) {
    try {
      const result = await callGeminiModel(apiKey, model, input);
      if (result.assessment) {
        return { assessment: result.assessment, source: "gemini" };
      }
      lastError = result.error ?? lastError;
      // Don't retry other models for auth/key errors
      if (lastError.includes("API key") || lastError.includes("permission")) break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Network error calling Gemini";
    }
  }

  return {
    assessment: null,
    source: "error",
    error: lastError,
  };
}
