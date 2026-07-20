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

export async function getJobMessages(jobId: number): Promise<JobChatMessage[]> {
  const res = await fetch(`/api/chat/${jobId}`);
  return res.json();
}

export async function getAllJobChats(): Promise<Record<string, JobChatMessage[]>> {
  const res = await fetch("/api/chat");
  return res.json();
}

export async function addJobMessage(
  jobId: number,
  message: Omit<JobChatMessage, "id" | "createdAt">,
): Promise<JobChatMessage> {
  const res = await fetch(`/api/chat/${jobId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  const created: JobChatMessage = await res.json();
  broadcast();
  return created;
}
