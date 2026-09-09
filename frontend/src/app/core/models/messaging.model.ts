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
