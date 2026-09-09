import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { Conversation, ThreadMessage } from '../../core/models/messaging.model';
import { MessagingApiService } from '../../core/services/messaging-api.service';
import { formatRelativeTime } from '../../core/models/notification.model';

@Component({
  selector: 'app-messaging-panel',
  standalone: true,
  templateUrl: './messaging-panel.component.html',
  styleUrl: './messaging-panel.component.scss',
})
export class MessagingPanelComponent implements OnChanges {
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();
  @Output() refreshCounts = new EventEmitter<void>();

  private readonly api = inject(MessagingApiService);

  loading = false;
  error = '';
  conversations: Conversation[] = [];
  active: Conversation | null = null;
  messages: ThreadMessage[] = [];
  threadLoading = false;
  draft = '';
  sending = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      void this.loadConversations();
    }
  }

  relative(iso?: string | null): string {
    return iso ? formatRelativeTime(iso) : '';
  }

  close(): void {
    this.closed.emit();
  }

  async loadConversations(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const res = await this.api.listConversations();
      this.conversations = res.conversations || [];
      if (!res.ok && this.conversations.length === 0) {
        this.error = 'Could not load conversations.';
      }
    } catch {
      this.error = 'Could not load conversations.';
      this.conversations = [];
    } finally {
      this.loading = false;
    }
  }

  async openThread(c: Conversation): Promise<void> {
    this.active = c;
    this.threadLoading = true;
    this.messages = [];
    try {
      const res = await this.api.getConversation(c.id);
      this.messages = res.messages || [];
      await this.api.markRead(c.id);
      this.refreshCounts.emit();
      c.unreadCount = 0;
    } catch {
      this.error = 'Could not load messages.';
    } finally {
      this.threadLoading = false;
    }
  }

  backToList(): void {
    this.active = null;
    this.messages = [];
    this.draft = '';
  }

  onDraft(ev: Event): void {
    this.draft = (ev.target as HTMLTextAreaElement).value;
  }

  async send(): Promise<void> {
    if (!this.active || !this.draft.trim() || this.sending) return;
    this.sending = true;
    try {
      const res = await this.api.sendMessage(this.active.id, this.draft.trim());
      if (res.ok && res.message) {
        this.messages = [...this.messages, res.message];
        this.draft = '';
      } else {
        this.error = 'Could not send message.';
      }
    } finally {
      this.sending = false;
    }
  }
}
