import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { InAppNotification } from '../models/notification.model';

@Injectable({ providedIn: 'root' })
export class NotificationsApiService {
  private readonly http = inject(HttpClient);

  unreadCount(): Promise<{ ok: boolean; count: number }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; count: number }>('/api/notifications/unread-count')
    ).catch(() => ({ ok: false, count: 0 }));
  }

  list(
    filter: 'all' | 'unread' | 'archived' = 'all',
    offset = 0
  ): Promise<{ ok: boolean; notifications: InAppNotification[] }> {
    const q = new URLSearchParams({ filter, offset: String(offset) });
    return firstValueFrom(
      this.http.get<{ ok: boolean; notifications: InAppNotification[] }>(
        `/api/notifications?${q}`
      )
    ).catch(() => ({ ok: false, notifications: [] }));
  }

  markRead(id: number): Promise<{ ok: boolean }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean }>(`/api/notifications/${id}/read`, {})
    ).catch(() => ({ ok: false }));
  }

  markAllRead(): Promise<{ ok: boolean }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean }>('/api/notifications/read-all', {})
    ).catch(() => ({ ok: false }));
  }

  archive(id: number): Promise<{ ok: boolean }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean }>(`/api/notifications/${id}/archive`, {})
    ).catch(() => ({ ok: false }));
  }

  archiveRead(): Promise<{ ok: boolean }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean }>('/api/notifications/archive-read', {})
    ).catch(() => ({ ok: false }));
  }
}
