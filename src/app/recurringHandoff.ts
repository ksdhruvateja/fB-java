export type RecurringHandoff = {
  propertyId?: number | null;
  serviceType?: "recurring_cleaning" | "recurring_landscaping";
  recurrence?: "weekly" | "biweekly" | "monthly";
  openAdd?: boolean;
};

export const RECURRING_HANDOFF_KEY = "fixbridge_recurring_handoff";

export function saveRecurringHandoff(payload: RecurringHandoff) {
  try {
    sessionStorage.setItem(RECURRING_HANDOFF_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function readRecurringHandoff(): RecurringHandoff | null {
  try {
    const raw = sessionStorage.getItem(RECURRING_HANDOFF_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RecurringHandoff;
  } catch {
    return null;
  }
}

export function clearRecurringHandoff() {
  try {
    sessionStorage.removeItem(RECURRING_HANDOFF_KEY);
  } catch {
    /* ignore */
  }
}

/** Infer recurrence from natural language (supported options only). */
export function inferRecurrenceFromText(text: string): RecurringHandoff["recurrence"] | null {
  const t = text.toLowerCase();
  if (/every\s+week|weekly|once\s+a\s+week/.test(t)) return "weekly";
  if (/every\s+two\s+weeks|biweekly|every\s+2\s+weeks|twice\s+a\s+month/.test(t)) return "biweekly";
  if (/every\s+month|monthly|once\s+a\s+month/.test(t)) return "monthly";
  return null;
}

export function inferRecurringServiceType(text: string): RecurringHandoff["serviceType"] | null {
  const t = text.toLowerCase();
  if (/landscap|mow|lawn|yard|garden/.test(t)) return "recurring_landscaping";
  if (/clean/.test(t)) return "recurring_cleaning";
  return null;
}
