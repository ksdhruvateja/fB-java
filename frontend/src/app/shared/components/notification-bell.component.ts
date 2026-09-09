import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import {
  InAppNotification,
  formatBadgeCount,
  formatRelativeTime,
} from '../../core/models/notification.model';
import { NotificationsApiService } from '../../core/services/notifications-api.service';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.scss',
})
export class NotificationBellComponent {
  @Input() unreadCount = 0;
  @Output() navigate = new EventEmitter<InAppNotification>();
  @Output() refreshCounts = new EventEmitter<void>();
  @Output() openMessagesPanel = new EventEmitter<void>();

  private readonly api = inject(NotificationsApiService);

  open = false;
  items: InAppNotification[] = [];
  loading = false;

  get badge(): string | null {
    return formatBadgeCount(this.unreadCount);
  }

  async toggle(): Promise<void> {
    this.open = !this.open;
    if (this.open) await this.load();
  }

  close(): void {
    this.open = false;
  }

  async load(): Promise<void> {
    this.loading = true;
    try {
      const r = await this.api.list('all', 0);
      this.items = (r.notifications || []).slice(0, 10);
    } catch {
      this.items = [];
    } finally {
      this.loading = false;
    }
  }

  relative(iso: string): string {
    return formatRelativeTime(iso);
  }

  async onItem(n: InAppNotification): Promise<void> {
    if (!n.read) {
      await this.api.markRead(n.id);
      this.refreshCounts.emit();
    }
    this.navigate.emit(n);
    this.open = false;
  }

  async markAll(): Promise<void> {
    await this.api.markAllRead();
    this.refreshCounts.emit();
    await this.load();
  }

  async archiveRead(): Promise<void> {
    await this.api.archiveRead();
    this.refreshCounts.emit();
    await this.load();
  }

  openMessages(): void {
    this.open = false;
    this.openMessagesPanel.emit();
  }
}
