import { Component, OnInit, inject } from '@angular/core';
import {
  InAppNotification,
  formatRelativeTime,
} from '../../../core/models/notification.model';
import { Conversation } from '../../../core/models/messaging.model';
import { NotificationsApiService } from '../../../core/services/notifications-api.service';
import { MessagingApiService } from '../../../core/services/messaging-api.service';
import { InAppCommsService } from '../../../core/services/in-app-comms.service';

type InboxTab = 'notifications' | 'messages';

@Component({
  selector: 'app-homeowner-inbox',
  standalone: true,
  templateUrl: './homeowner-inbox.component.html',
  styleUrl: './homeowner-inbox.component.scss',
})
export class HomeownerInboxComponent implements OnInit {
  private readonly notificationsApi = inject(NotificationsApiService);
  private readonly messagingApi = inject(MessagingApiService);
  private readonly comms = inject(InAppCommsService);

  tab: InboxTab = 'messages';
  loading = true;
  error = '';
  items: InAppNotification[] = [];
  conversations: Conversation[] = [];

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  relative(iso?: string | null): string {
    return iso ? formatRelativeTime(iso) : '';
  }

  async setTab(tab: InboxTab): Promise<void> {
    this.tab = tab;
    await this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      if (this.tab === 'notifications') {
        const res = await this.notificationsApi.list('all', 0);
        this.items = res.notifications || [];
        if (!res.ok && this.items.length === 0) {
          this.error = 'Could not load notifications.';
        }
      } else {
        const res = await this.messagingApi.listConversations();
        this.conversations = res.conversations || [];
        if (!res.ok && this.conversations.length === 0) {
          this.error = 'Could not load conversations.';
        }
      }
    } catch {
      this.error =
        this.tab === 'notifications'
          ? 'Could not load notifications.'
          : 'Could not load conversations.';
      this.items = [];
      this.conversations = [];
    } finally {
      this.loading = false;
    }
  }

  async markRead(n: InAppNotification): Promise<void> {
    if (n.read) return;
    await this.notificationsApi.markRead(n.id);
    n.read = true;
    void this.comms.refresh(true);
  }

  async openConversation(c: Conversation): Promise<void> {
    await this.messagingApi.markRead(c.id);
    c.unreadCount = 0;
    void this.comms.refresh(true);
  }
}
