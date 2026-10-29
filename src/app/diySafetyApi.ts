import { api } from "./platformApi";

export type DiySafetyFeedbackRating = "helpful" | "not_helpful" | "unsafe";

export type DiyIncidentType =
  | "safety_concern"
  | "injury"
  | "property_damage"
  | "gas_event"
  | "electrical_event"
  | "fire_smoke"
  | "water_damage"
  | "biohazard"
  | "other_serious";

export async function submitDiySafetyFeedback(input: {
  jobId?: number;
  rating: DiySafetyFeedbackRating;
  message?: string;
  riskLevel?: string;
  messageIndex?: number;
  chatExcerpt?: string;
}) {
  return api<{ ok: boolean; eventId?: number; message?: string }>("/api/homeowner/diy-safety/feedback", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function stopDiyAndEscalate(jobId: number) {
  return api<{ ok: boolean; message?: string }>("/api/homeowner/diy-safety/stop", {
    method: "POST",
    body: JSON.stringify({ jobId }),
  });
}

export async function submitDiyIncidentReport(input: {
  jobId?: number;
  incidentType: DiyIncidentType;
  description: string;
}) {
  return api<{ ok: boolean; eventId?: number; message?: string }>("/api/homeowner/diy-safety/incident", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchAdminDiySafetyEvents(params?: {
  userId?: number;
  jobId?: number;
  priority?: boolean;
}) {
  const q = new URLSearchParams();
  if (params?.userId != null) q.set("userId", String(params.userId));
  if (params?.jobId != null) q.set("jobId", String(params.jobId));
  if (params?.priority) q.set("priority", "true");
  const suffix = q.toString() ? `?${q}` : "";
  return api<{
    ok: boolean;
    events?: Array<{
      id: number;
      userId: number;
      jobId: number | null;
      eventType: string;
      riskLevel: string | null;
      feedbackRating: string | null;
      incidentType: string | null;
      description: string | null;
      createdAt: string;
    }>;
  }>(`/api/admin/diy-safety/events${suffix}`);
}
