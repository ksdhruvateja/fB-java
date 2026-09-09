import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type SupportTicket = {
  id?: number;
  ticketNumber: string;
  subject?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  messages?: { id?: number; body?: string; message?: string; fromStaff?: boolean; createdAt?: string }[];
};

@Injectable({ providedIn: 'root' })
export class SupportApiService {
  private readonly http = inject(HttpClient);

  list(status?: string): Promise<{ ok: boolean; tickets: SupportTicket[]; message?: string }> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return firstValueFrom(
      this.http.get<{ ok: boolean; tickets?: SupportTicket[]; message?: string }>(
        `/api/support/tickets${q}`
      )
    )
      .then((d) => ({ ok: !!d.ok, tickets: d.tickets || [], message: d.message }))
      .catch(() => ({ ok: false, tickets: [], message: 'Could not load tickets.' }));
  }

  get(ticketNumber: string): Promise<{ ok: boolean; ticket?: SupportTicket; message?: string }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; ticket?: SupportTicket; message?: string }>(
        `/api/support/tickets/${encodeURIComponent(ticketNumber)}`
      )
    ).catch(() => ({ ok: false, message: 'Could not load ticket.' }));
  }

  create(body: {
    subject: string;
    message: string;
    category?: string;
  }): Promise<{ ok: boolean; ticket?: SupportTicket; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; ticket?: SupportTicket; message?: string }>(
        '/api/support/tickets',
        body
      )
    ).catch(() => ({ ok: false, message: 'Could not create ticket.' }));
  }

  reply(
    ticketNumber: string,
    message: string
  ): Promise<{ ok: boolean; ticket?: SupportTicket; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; ticket?: SupportTicket; message?: string }>(
        `/api/support/tickets/${encodeURIComponent(ticketNumber)}/reply`,
        { message }
      )
    ).catch(() => ({ ok: false, message: 'Could not send reply.' }));
  }
}
