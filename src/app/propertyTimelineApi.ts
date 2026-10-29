import { getStoredToken } from "./auth";

export type PropertyTimelineEvent = {
  id: string;
  type: string;
  occurredAt: string | null;
  title: string;
  subtitle?: string | null;
  amount?: number | null;
  status?: string | null;
  section?: "upcoming" | "recent";
  relatedJobId?: number;
  relatedRecurringId?: number;
  relatedDocumentId?: number;
  bookingId?: string | null;
  category?: string | null;
  beforePhotoUrl?: string | null;
  afterPhotoUrl?: string | null;
  summary?: string | null;
  preferredTimeWindow?: string | null;
  fromRecurring?: boolean;
};

async function api<T>(path: string): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return { ok: false, message: text || res.statusText } as T;
  }
}

export async function fetchPropertyTimeline(propertyId: number) {
  return api<{
    ok: boolean;
    upcoming?: PropertyTimelineEvent[];
    recent?: PropertyTimelineEvent[];
    events?: PropertyTimelineEvent[];
    message?: string;
  }>(`/api/properties/${propertyId}/timeline`);
}
