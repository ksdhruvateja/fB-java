import type { AdaptiveAnswers } from "./serviceRequestFlow";
import type { IntakePhase } from "./HomeownerServiceIntake";
import type { ServiceLocation } from "./serviceRequestFlow";

export type IntakeDraft = {
  userId: number;
  intakePhase: IntakePhase;
  requestSystemId: string;
  issueArea: ServiceLocation | "";
  description: string;
  adaptiveAnswers: AdaptiveAnswers;
  propertyId: number | "";
  partnerCode: string;
  mediaDataUrl: string | null;
  mediaType: string | null;
  savedAt: string;
};

const STORAGE_KEY = "fixbridge-intake-draft";

export function loadIntakeDraft(userId: number): IntakeDraft | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IntakeDraft;
    if (Number(parsed.userId) !== Number(userId)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveIntakeDraft(draft: IntakeDraft) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
  } catch {
    /* quota exceeded — ignore */
  }
}

export function clearIntakeDraft() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
