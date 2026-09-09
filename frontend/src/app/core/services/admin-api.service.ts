import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ManagedJob } from '../models/managed-job.model';
import { ServiceOffering } from '../models/service-offering.model';
import { AuthUser } from '../models/auth.model';

export type AdminSearchHit = {
  id: number;
  label: string;
  subtitle?: string | null;
  status?: string;
  jobId?: number;
  href?: Record<string, unknown> | string;
};

export type AdminSearchResults = {
  jobs: AdminSearchHit[];
  homeowners: AdminSearchHit[];
  contractors: AdminSearchHit[];
  quotes: AdminSearchHit[];
  invoices: AdminSearchHit[];
  payments: AdminSearchHit[];
  payouts: AdminSearchHit[];
  tickets: AdminSearchHit[];
  technicians: AdminSearchHit[];
};

function emptySearchResults(): AdminSearchResults {
  return {
    jobs: [],
    homeowners: [],
    contractors: [],
    quotes: [],
    invoices: [],
    payments: [],
    payouts: [],
    tickets: [],
    technicians: [],
  };
}

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);

  workQueue(): Promise<{ ok: boolean; jobs?: ManagedJob[]; items?: ManagedJob[]; message?: string }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; jobs?: ManagedJob[]; items?: ManagedJob[]; message?: string }>(
        '/api/admin/work-queue'
      )
    ).catch(() => ({ ok: false, message: 'Could not load work queue.' }));
  }

  listManagedJobs(): Promise<{ ok: boolean; jobs: ManagedJob[]; message?: string }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; jobs?: ManagedJob[]; message?: string }>('/api/admin/managed/jobs')
    )
      .then((d) => ({ ok: !!d.ok, jobs: d.jobs || [], message: d.message }))
      .catch(() => ({ ok: false, jobs: [], message: 'Could not load jobs.' }));
  }

  invite(
    jobId: number,
    body: Record<string, unknown> = {}
  ): Promise<{ ok: boolean; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; message?: string }>(
        `/api/admin/managed/jobs/${jobId}/invite`,
        body
      )
    ).catch(() => ({ ok: false, message: 'Could not invite contractor.' }));
  }

  assign(
    jobId: number,
    body: Record<string, unknown> = {}
  ): Promise<{ ok: boolean; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; message?: string }>(
        `/api/admin/managed/jobs/${jobId}/assign`,
        body
      )
    ).catch(() => ({ ok: false, message: 'Could not assign contractor.' }));
  }

  listQuotes(params?: {
    q?: string;
    status?: string;
  }): Promise<{ ok: boolean; quotes?: unknown[]; message?: string }> {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.status) qs.set('status', params.status);
    const suffix = qs.toString() ? `?${qs}` : '';
    return firstValueFrom(
      this.http.get<{ ok: boolean; quotes?: unknown[]; message?: string }>(
        `/api/admin/quotes${suffix}`
      )
    ).catch(() => ({ ok: false, quotes: [], message: 'Could not load quotes.' }));
  }

  quoteBuilder(jobId: number): Promise<{ ok: boolean; message?: string; [key: string]: unknown }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; message?: string }>(
        `/api/admin/managed/jobs/${jobId}/quote-builder`
      )
    ).catch(() => ({ ok: false, message: 'Could not load quote builder.' }));
  }

  saveProposal(
    jobId: number,
    body: Record<string, unknown>
  ): Promise<{ ok: boolean; message?: string; [key: string]: unknown }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; message?: string }>(
        `/api/admin/managed/jobs/${jobId}/proposal`,
        body
      )
    ).catch(() => ({ ok: false, message: 'Could not save proposal.' }));
  }

  listPayouts(status?: string): Promise<{ ok: boolean; payouts?: unknown[]; message?: string }> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return firstValueFrom(
      this.http.get<{ ok: boolean; payouts?: unknown[]; message?: string }>(`/api/admin/payouts${q}`)
    ).catch(() => ({ ok: false, payouts: [], message: 'Could not load payouts.' }));
  }

  approvePayout(id: number): Promise<{ ok: boolean; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; message?: string }>(`/api/admin/payouts/${id}/approve`, {})
    ).catch(() => ({ ok: false, message: 'Could not approve payout.' }));
  }

  adjustPayout(
    id: number,
    body: Record<string, unknown>
  ): Promise<{ ok: boolean; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; message?: string }>(`/api/admin/payouts/${id}/adjust`, body)
    ).catch(() => ({ ok: false, message: 'Could not adjust payout.' }));
  }

  listDisputes(status?: string): Promise<{ ok: boolean; disputes?: unknown[]; message?: string }> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return firstValueFrom(
      this.http.get<{ ok: boolean; disputes?: unknown[]; message?: string }>(
        `/api/admin/disputes${q}`
      )
    ).catch(() => ({ ok: false, disputes: [], message: 'Could not load disputes.' }));
  }

  resolveDispute(
    id: number,
    body: Record<string, unknown>
  ): Promise<{ ok: boolean; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; message?: string }>(`/api/admin/disputes/${id}/actions`, body)
    ).catch(() => ({ ok: false, message: 'Could not resolve dispute.' }));
  }

  manualPayment(body: Record<string, unknown>): Promise<{ ok: boolean; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; message?: string }>('/api/admin/payments/manual', body)
    ).catch(() => ({ ok: false, message: 'Could not create manual payment.' }));
  }

  listUsers(role?: 'homeowner' | 'contractor' | string): Promise<{
    ok: boolean;
    users: AuthUser[];
    message?: string;
  }> {
    const path = role
      ? `/api/admin/users?role=${encodeURIComponent(role)}`
      : '/api/admin/users';
    return firstValueFrom(
      this.http.get<{ ok?: boolean; users?: AuthUser[]; message?: string }>(path)
    )
      .then((data) => {
        let users = data.users || [];
        if (role) {
          users = users.filter((u) => !u.role || u.role === role);
        }
        return { ok: data.ok !== false, users, message: data.message };
      })
      .catch(() => ({ ok: false, users: [], message: 'User directory API not available.' }));
  }

  search(q: string): Promise<{
    ok: boolean;
    query?: string;
    results?: AdminSearchResults;
    message?: string;
  }> {
    const query = String(q || '').trim();
    if (query.length < 2) {
      return Promise.resolve({ ok: true, query, results: emptySearchResults() });
    }
    return firstValueFrom(
      this.http.get<{
        ok?: boolean;
        query?: string;
        results?: AdminSearchResults;
        message?: string;
      }>(`/api/admin/search?q=${encodeURIComponent(query)}`)
    )
      .then((data) => ({
        ok: data.ok !== false,
        query: data.query || query,
        results: data.results || emptySearchResults(),
        message: data.message,
      }))
      .catch(() => ({
        ok: false,
        message: 'Search unavailable.',
        results: emptySearchResults(),
      }));
  }

  listAdminServices(): Promise<{ ok: boolean; offerings: ServiceOffering[]; message?: string }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; offerings?: ServiceOffering[]; message?: string }>(
        '/api/admin/services'
      )
    )
      .then((d) => ({ ok: !!d.ok, offerings: d.offerings || [], message: d.message }))
      .catch(() => ({ ok: false, offerings: [], message: 'Could not load services.' }));
  }

  updateService(
    id: string,
    body: Partial<ServiceOffering>
  ): Promise<{ ok: boolean; offering?: ServiceOffering; message?: string }> {
    return firstValueFrom(
      this.http.put<{ ok: boolean; offering?: ServiceOffering; message?: string }>(
        `/api/admin/services/${encodeURIComponent(id)}`,
        body
      )
    ).catch(() => ({ ok: false, message: 'Could not update service.' }));
  }

  homecareSettings(): Promise<{ ok: boolean; config?: unknown; pricing?: unknown; message?: string }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; config?: unknown; pricing?: unknown; message?: string }>(
        '/api/admin/homecare/settings'
      )
    ).catch(() => ({ ok: false, message: 'Could not load HomeCare settings.' }));
  }

  patchHomecareSettings(
    body: Record<string, unknown>
  ): Promise<{ ok: boolean; config?: unknown; message?: string }> {
    return firstValueFrom(
      this.http.patch<{ ok: boolean; config?: unknown; message?: string }>(
        '/api/admin/homecare/settings',
        body
      )
    ).catch(() => ({ ok: false, message: 'Could not save HomeCare settings.' }));
  }

  getActivationFee(): Promise<{ ok: boolean; activationFee?: number; message?: string }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; activationFee?: number; message?: string }>(
        '/api/admin/homecare/activation-fee'
      )
    ).catch(() => ({ ok: false, message: 'Could not load activation fee.' }));
  }

  putActivationFee(
    activationFee: number
  ): Promise<{ ok: boolean; activationFee?: number; message?: string }> {
    return firstValueFrom(
      this.http.put<{ ok: boolean; activationFee?: number; message?: string }>(
        '/api/admin/homecare/activation-fee',
        { activationFee }
      )
    ).catch(() => ({ ok: false, message: 'Could not save activation fee.' }));
  }

  listSubscriptionPlans(): Promise<{ ok: boolean; plans?: unknown[]; message?: string }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; plans?: unknown[]; message?: string }>(
        '/api/admin/subscription-plans'
      )
    ).catch(() => ({ ok: false, plans: [], message: 'Could not load plans.' }));
  }

  saveSubscriptionPlan(
    body: Record<string, unknown>,
    id?: number
  ): Promise<{ ok: boolean; message?: string }> {
    const req = id
      ? this.http.put<{ ok: boolean; message?: string }>(
          `/api/admin/subscription-plans/${id}`,
          body
        )
      : this.http.post<{ ok: boolean; message?: string }>('/api/admin/subscription-plans', body);
    return firstValueFrom(req).catch(() => ({ ok: false, message: 'Could not save plan.' }));
  }

  adminSupportTickets(status?: string): Promise<{
    ok: boolean;
    tickets?: unknown[];
    message?: string;
  }> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return firstValueFrom(
      this.http.get<{ ok: boolean; tickets?: unknown[]; message?: string }>(
        `/api/admin/support/tickets${q}`
      )
    ).catch(() => ({ ok: false, tickets: [], message: 'Could not load support tickets.' }));
  }

  replySupportTicket(
    ticketNumber: string,
    message: string,
    internal = false
  ): Promise<{ ok: boolean; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; message?: string }>(
        `/api/admin/support/tickets/${encodeURIComponent(ticketNumber)}/reply`,
        { message, internal }
      )
    ).catch(() => ({ ok: false, message: 'Could not reply.' }));
  }
}
