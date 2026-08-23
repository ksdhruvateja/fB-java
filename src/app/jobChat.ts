import { getStoredToken } from "./auth";

export type JobChatMessage = {
  id: number;
  senderRole: "homeowner" | "contractor" | "system";
  senderName: string;
  text: string;
  imageDataUrl?: string;
  createdAt: string;
};

export const CHAT_BROADCAST_EVENT = "fixbridge-chat-update";

function broadcast() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHAT_BROADCAST_EVENT));
  }
}

function authHeaders(): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function getJobMessages(jobId: number): Promise<JobChatMessage[]> {
  const res = await fetch(`/api/chat/${jobId}`, { headers: authHeaders() });
  if (!res.ok) return [];
  return res.json();
}

export async function getAllJobChats(): Promise<Record<string, JobChatMessage[]>> {
  const res = await fetch("/api/chat", { headers: authHeaders() });
  if (!res.ok) return {};
  return res.json();
}

export async function addJobMessage(
  jobId: number,
  message: Omit<JobChatMessage, "id" | "createdAt">,
): Promise<JobChatMessage> {
  const res = await fetch(`/api/chat/${jobId}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    throw new Error("Could not send message.");
  }
  const created: JobChatMessage = await res.json();
  broadcast();
  return created;
}
