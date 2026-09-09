import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { MessagingApiService } from './messaging-api.service';
import { NotificationsApiService } from './notifications-api.service';

const POLL_MS = 15_000;

/** Mirrors React useInAppComms — polls unread notification + message counts every 15s. */
@Injectable({ providedIn: 'root' })
export class InAppCommsService implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationsApiService);
  private readonly messaging = inject(MessagingApiService);

  readonly unreadNotifications = signal(0);
  readonly unreadMessages = signal(0);
  readonly loading = signal(true);

  private timer: number | null = null;
  private lastRefreshAt = 0;
  private started = false;

  private readonly onFocus = () => void this.refresh();
  private readonly onVis = () => this.schedule();

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.refresh(true);
    this.schedule();
    window.addEventListener('focus', this.onFocus);
    document.addEventListener('visibilitychange', this.onVis);
  }

  stop(): void {
    this.started = false;
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    window.removeEventListener('focus', this.onFocus);
    document.removeEventListener('visibilitychange', this.onVis);
  }

  ngOnDestroy(): void {
    this.stop();
  }

  async refresh(force = false): Promise<void> {
    if (!this.auth.getStoredToken()) return;
    const now = Date.now();
    if (!force && now - this.lastRefreshAt < 20_000) return;
    this.lastRefreshAt = now;
    try {
      const [n, m] = await Promise.all([
        this.notifications.unreadCount(),
        this.messaging.unreadCount(),
      ]);
      this.unreadNotifications.set(n.count || 0);
      this.unreadMessages.set(m.count || 0);
    } catch {
      /* keep last counts */
    } finally {
      this.loading.set(false);
    }
  }

  private schedule(): void {
    if (this.timer) window.clearInterval(this.timer);
    const hidden = document.visibilityState === 'hidden';
    this.timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void this.refresh(true);
    }, hidden ? POLL_MS * 3 : POLL_MS);
  }
}
