import { getStoredToken } from "./auth";
import type { ProFeatureId } from "./proFeatures";

export type AssistantAction = {
  id: string;
  label: string;
};

export type AssistantChatMessage = {
  role: "user" | "assistant";
  content: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return { ok: false, message: text || res.statusText } as T;
  }
}

export async function sendHomeAssistantMessage(body: {
  messages: AssistantChatMessage[];
  propertyId?: number | null;
  jobId?: number | null;
  intent?: string | null;
}) {
  return api<{
    ok: boolean;
    reply?: string;
    riskLevel?: string;
    suggestedActions?: AssistantAction[];
    code?: string;
    feature?: ProFeatureId;
    message?: string;
  }>("/api/home-assistant/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type MemorySuggestion = {
  id: number;
  source: string;
  sourceRef?: string | null;
  payload: { equipment?: Record<string, unknown>; jobTitle?: string };
  confidence?: number | null;
  createdAt?: string;
};

export async function listMemorySuggestions(propertyId: number) {
  return api<{ ok: boolean; suggestions?: MemorySuggestion[]; message?: string }>(
    `/api/properties/${propertyId}/memory-suggestions`
  );
}

export async function confirmMemorySuggestion(propertyId: number, suggestionId: number) {
  return api<{ ok: boolean; message?: string }>(
    `/api/properties/${propertyId}/memory-suggestions/${suggestionId}/confirm`,
    { method: "POST" }
  );
}

export async function ignoreMemorySuggestion(propertyId: number, suggestionId: number) {
  return api<{ ok: boolean; message?: string }>(
    `/api/properties/${propertyId}/memory-suggestions/${suggestionId}/ignore`,
    { method: "POST" }
  );
}

export async function setPreferredProvider(
  propertyId: number,
  body: { contractorUserId: number; serviceType: string; isFavorite?: boolean; notes?: string }
) {
  return api<{ ok: boolean; message?: string }>(`/api/properties/${propertyId}/preferred-providers`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
