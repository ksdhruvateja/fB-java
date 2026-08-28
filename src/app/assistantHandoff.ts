export type AssistantHandoff = {
  propertyId?: number | null;
  category?: string;
  serviceSubcategory?: string;
  title?: string;
  description?: string;
  issueArea?: string;
  requestSystemId?: string;
  intent?: "remote_quote" | "site_visit" | "diy";
  assistantSummary?: string;
  mediaDataUrl?: string | null;
};

export const ASSISTANT_HANDOFF_KEY = "fixbridge_assistant_handoff";

export function saveAssistantHandoff(payload: AssistantHandoff) {
  try {
    sessionStorage.setItem(ASSISTANT_HANDOFF_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function readAssistantHandoff(): AssistantHandoff | null {
  try {
    const raw = sessionStorage.getItem(ASSISTANT_HANDOFF_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AssistantHandoff;
  } catch {
    return null;
  }
}

export function clearAssistantHandoff() {
  try {
    sessionStorage.removeItem(ASSISTANT_HANDOFF_KEY);
  } catch {
    /* ignore */
  }
}
