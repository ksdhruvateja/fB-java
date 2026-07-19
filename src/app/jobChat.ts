export type JobChatMessage = {
  id: number;
  senderRole: "homeowner" | "contractor" | "system";
  senderName: string;
  text: string;
  imageDataUrl?: string;   // base64 data URL for attached image
  createdAt: string;
};

const STORAGE_KEY = "fixbridge-job-chats";
const BROADCAST_EVENT = "fixbridge-chat-update";

function canUseStorage() {
  if (typeof window === "undefined") return false;
  try {
    return typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function getAllChats(): Record<string, JobChatMessage[]> {
  if (!canUseStorage()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, JobChatMessage[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveAllChats(chats: Record<string, JobChatMessage[]>) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    // Ignore storage errors so UI continues to work.
  }
}

function broadcast() {
  try {
    window.dispatchEvent(new Event(BROADCAST_EVENT));
  } catch {
    // ignore
  }
}

export function getJobMessages(jobId: number): JobChatMessage[] {
  const chats = getAllChats();
  return chats[String(jobId)] ?? [];
}

/** Returns all chats keyed by jobId string — used by admin panel. */
export function getAllJobChats(): Record<string, JobChatMessage[]> {
  return getAllChats();
}

export const CHAT_BROADCAST_EVENT = BROADCAST_EVENT;

export function addJobMessage(
  jobId: number,
  message: Omit<JobChatMessage, "id" | "createdAt">,
) {
  const chats = getAllChats();
  const key = String(jobId);
  const existing = chats[key] ?? [];
  const next: JobChatMessage = {
    ...message,
    id: Date.now() + Math.floor(Math.random() * 1000),
    createdAt: new Date().toISOString(),
  };
  chats[key] = [...existing, next];
  saveAllChats(chats);
  broadcast();
}
