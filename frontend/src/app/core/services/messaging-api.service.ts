import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  AttachmentInput,
  Conversation,
  ThreadMessage,
} from '../models/messaging.model';

@Injectable({ providedIn: 'root' })
export class MessagingApiService {
  private readonly http = inject(HttpClient);

  unreadCount(): Promise<{ ok: boolean; count: number }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; count: number }>('/api/messages/unread-count')
    ).catch(() => ({ ok: false, count: 0 }));
  }

  listConversations(
    filter = 'all',
    search = ''
  ): Promise<{ ok: boolean; conversations: Conversation[] }> {
    const q = new URLSearchParams({ filter, search });
    return firstValueFrom(
      this.http.get<{ ok: boolean; conversations: Conversation[] }>(
        `/api/messages/conversations?${q}`
      )
    ).catch(() => ({ ok: false, conversations: [] }));
  }

  getConversation(
    conversationId: number,
    beforeId?: number
  ): Promise<{ ok: boolean; conversation?: Conversation; messages: ThreadMessage[] }> {
    const q = beforeId ? `?beforeId=${beforeId}` : '';
    return firstValueFrom(
      this.http.get<{
        ok: boolean;
        conversation?: Conversation;
        messages: ThreadMessage[];
      }>(`/api/messages/conversations/${conversationId}${q}`)
    ).catch(() => ({ ok: false, messages: [] }));
  }

  createConversation(input: {
    subject?: string;
    body?: string;
    jobId?: number;
    homeownerUserId?: number;
    contractorUserId?: number;
    attachments?: AttachmentInput[];
  }): Promise<{ ok: boolean; conversation?: Conversation; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; conversation?: Conversation; message?: string }>(
        '/api/messages/conversations',
        input
      )
    ).catch(() => ({ ok: false, message: 'Could not create conversation.' }));
  }

  sendMessage(
    conversationId: number,
    body: string,
    attachments?: AttachmentInput[],
    idempotencyKey?: string
  ): Promise<{ ok: boolean; message?: ThreadMessage }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; message?: ThreadMessage }>(
        `/api/messages/conversations/${conversationId}/messages`,
        { body, attachments, idempotencyKey }
      )
    ).catch(() => ({ ok: false }));
  }

  markRead(conversationId: number): Promise<{ ok: boolean }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean }>(
        `/api/messages/conversations/${conversationId}/read`,
        {}
      )
    ).catch(() => ({ ok: false }));
  }
}
