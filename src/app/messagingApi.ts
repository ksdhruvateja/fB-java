import { getStoredToken } from "./auth";

export type MessageAttachment = {
  id: number;
  messageId: number;
  conversationId: number;
  fileName: string;
  mimeType: string;
  byteSize: number;
  downloadUrl: string;
  isImage: boolean;
  isPdf: boolean;
};

export type Conversation = {
  id: number;
  type: string;
  jobId?: number | null;
  homeownerUserId?: number | null;
  contractorUserId?: number | null;
  subject?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  counterpartyName?: string | null;
  jobLabel?: string | null;
};

export type ThreadMessage = {
  id: number;
  conversationId: number;
  senderUserId: number;
  senderRole: string;
  senderDisplayName?: string | null;
  body: string;
  createdAt: string;
  attachments: MessageAttachment[];
};

export type AttachmentInput = {
  fileName: string;
  mimeType: string;
  data: string;
};

async function messagingApi<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...init, headers });
  const data = (await res.json()) as T & { message?: string; ok?: boolean };
  if (!res.ok) {
    throw new Error((data as { message?: string }).message || `Request failed (${res.status})`);
  }
  return data;
}

export async function fetchUnreadMessageCount() {
  return messagingApi<{ ok: boolean; count: number }>("/api/messages/unread-count");
}

export async function fetchConversations(filter: string = "all", search = "") {
  const q = new URLSearchParams({ filter, search });
  return messagingApi<{ ok: boolean; conversations: Conversation[] }>(`/api/messages/conversations?${q}`);
}

export async function createConversation(input: {
  subject?: string;
  body?: string;
  jobId?: number;
  homeownerUserId?: number;
  contractorUserId?: number;
  attachments?: AttachmentInput[];
}) {
  return messagingApi<{ ok: boolean; conversation: Conversation }>("/api/messages/conversations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchConversation(conversationId: number, beforeId?: number) {
  const q = beforeId ? `?beforeId=${beforeId}` : "";
  return messagingApi<{ ok: boolean; conversation: Conversation; messages: ThreadMessage[] }>(
    `/api/messages/conversations/${conversationId}${q}`,
  );
}

export async function sendMessage(
  conversationId: number,
  body: string,
  attachments?: AttachmentInput[],
  idempotencyKey?: string,
) {
  return messagingApi<{ ok: boolean; message: ThreadMessage }>(
    `/api/messages/conversations/${conversationId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ body, attachments, idempotencyKey }),
    },
  );
}

export async function markConversationRead(conversationId: number) {
  return messagingApi<{ ok: boolean }>(`/api/messages/conversations/${conversationId}/read`, {
    method: "POST",
    body: "{}",
  });
}

export async function readFileAsAttachment(file: File): Promise<AttachmentInput> {
  return new Promise((resolve, reject) => {
    if (file.size > 2_500_000) {
      reject(new Error("File must be under 2.5 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        fileName: file.name,
        mimeType: file.type,
        data: String(reader.result),
      });
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

export function attachmentAuthHeaders(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
