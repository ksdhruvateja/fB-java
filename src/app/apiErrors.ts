/** Detect gateway/HTML error bodies that must never be shown to homeowners. */
export function isHtmlOrGatewayErrorBody(text: string): boolean {
  const sample = String(text || "").trim().slice(0, 500).toLowerCase();
  if (!sample) return false;
  return (
    sample.startsWith("<!doctype") ||
    sample.startsWith("<html") ||
    sample.includes("<head>") ||
    sample.includes("inactivity timeout") ||
    sample.includes("gateway timeout") ||
    sample.includes("bad gateway")
  );
}

export function sanitizeApiErrorMessage(
  text: string,
  status: number,
  fallback = "We couldn't complete that request right now. Please try again."
): string {
  const trimmed = String(text || "").trim();
  if (!trimmed || isHtmlOrGatewayErrorBody(trimmed)) {
    return fallback;
  }
  if (trimmed.length > 280) {
    return fallback;
  }
  return trimmed;
}

export const ASSESSMENT_UNAVAILABLE_CODE = "AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE";

export function assessmentUnavailableMessage() {
  return "We couldn't finish the assessment right now. Please try again in a moment.";
}
