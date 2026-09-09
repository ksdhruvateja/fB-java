import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  CancellationReasonCode,
  JobInvitation,
  ManagedJob,
} from '../models/managed-job.model';

@Injectable({ providedIn: 'root' })
export class ManagedJobsApiService {
  private readonly http = inject(HttpClient);

  listMine(): Promise<{ ok: boolean; jobs: ManagedJob[]; message?: string }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; jobs: ManagedJob[]; message?: string }>('/api/managed/jobs/my')
    ).catch(() => ({ ok: false, jobs: [], message: 'Could not load jobs.' }));
  }

  get(jobId: number): Promise<{ ok: boolean; job?: ManagedJob; message?: string }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; job?: ManagedJob; message?: string }>(
        `/api/managed/jobs/${jobId}`
      )
    ).catch(() => ({ ok: false, message: 'Could not load job.' }));
  }

  create(body: Record<string, unknown>): Promise<{ ok: boolean; job?: ManagedJob; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; job?: ManagedJob; message?: string }>('/api/managed/jobs', body)
    ).catch(() => ({ ok: false, message: 'Could not create job.' }));
  }

  cancel(
    jobId: number,
    payload: {
      reasonCode: CancellationReasonCode;
      notes?: string;
      details?: Record<string, unknown>;
    }
  ): Promise<{
    ok: boolean;
    message?: string;
    job?: ManagedJob;
    alreadyCancelled?: boolean;
  }> {
    return firstValueFrom(
      this.http.post<{
        ok: boolean;
        message?: string;
        job?: ManagedJob;
        alreadyCancelled?: boolean;
      }>(`/api/managed/jobs/${jobId}/cancel`, payload)
    ).catch(() => ({ ok: false, message: 'Could not cancel job.' }));
  }

  delete(jobId: number): Promise<{ ok: boolean; message?: string }> {
    return firstValueFrom(
      this.http.delete<{ ok: boolean; message?: string }>(`/api/managed/jobs/${jobId}`)
    ).catch(() => ({ ok: false, message: 'Could not delete job.' }));
  }

  requestProfessional(
    jobId: number,
    body: Record<string, unknown> = {}
  ): Promise<{ ok: boolean; job?: ManagedJob; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; job?: ManagedJob; message?: string }>(
        `/api/managed/jobs/${jobId}/request-professional`,
        body
      )
    ).catch(() => ({ ok: false, message: 'Could not request a professional.' }));
  }

  dispatchPricing(
    jobId: number,
    params?: { discountCode?: string }
  ): Promise<{
    ok: boolean;
    amount?: number;
    currency?: string;
    breakdown?: Record<string, unknown>;
    message?: string;
    [key: string]: unknown;
  }> {
    const q = params?.discountCode
      ? `?discountCode=${encodeURIComponent(params.discountCode)}`
      : '';
    return firstValueFrom(
      this.http.get<{
        ok: boolean;
        amount?: number;
        currency?: string;
        breakdown?: Record<string, unknown>;
        message?: string;
      }>(`/api/managed/jobs/${jobId}/dispatch-pricing${q}`)
    ).catch(() => ({ ok: false, message: 'Could not load dispatch pricing.' }));
  }

  complete(jobId: number): Promise<{ ok: boolean; job?: ManagedJob; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; job?: ManagedJob; message?: string }>(
        `/api/managed/jobs/${jobId}/complete`,
        {}
      )
    ).catch(() => ({ ok: false, message: 'Could not mark job complete.' }));
  }

  listInvitations(): Promise<{ ok: boolean; invitations: JobInvitation[]; message?: string }> {
    return firstValueFrom(
      this.http.get<{
        ok: boolean;
        invitations?: JobInvitation[];
        invites?: JobInvitation[];
        message?: string;
      }>('/api/contractor/invitations')
    )
      .then((data) => ({
        ok: !!data.ok,
        invitations: data.invitations || data.invites || [],
        message: data.message,
      }))
      .catch(() => ({ ok: false, invitations: [], message: 'Could not load invitations.' }));
  }

  respondInvitation(
    id: number,
    action: 'accept' | 'decline'
  ): Promise<{ ok: boolean; message?: string; invitation?: JobInvitation }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; message?: string; invitation?: JobInvitation }>(
        `/api/contractor/invitations/${id}/respond`,
        { action }
      )
    ).catch(() => ({ ok: false, message: 'Could not respond to invitation.' }));
  }

  markTravel(jobId: number): Promise<{ ok: boolean; job?: ManagedJob; message?: string }> {
    return this.contractorJobAction(jobId, 'mark-travel');
  }

  markArrived(jobId: number): Promise<{ ok: boolean; job?: ManagedJob; message?: string }> {
    return this.contractorJobAction(jobId, 'mark-arrived');
  }

  markStarted(jobId: number): Promise<{ ok: boolean; job?: ManagedJob; message?: string }> {
    return this.contractorJobAction(jobId, 'mark-started');
  }

  private contractorJobAction(
    jobId: number,
    action: string
  ): Promise<{ ok: boolean; job?: ManagedJob; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; job?: ManagedJob; message?: string }>(
        `/api/contractor/managed/jobs/${jobId}/${action}`,
        {}
      )
    ).catch(() => ({ ok: false, message: `Could not ${action.replace(/-/g, ' ')}.` }));
  }

  listContractorPayouts(): Promise<{ ok: boolean; payouts: unknown[]; message?: string }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; payouts?: unknown[]; message?: string }>(
        '/api/contractor/payouts'
      )
    )
      .then((data) => ({ ok: !!data.ok, payouts: data.payouts || [], message: data.message }))
      .catch(() => ({ ok: false, payouts: [], message: 'Could not load payouts.' }));
  }

  contractorPerformance(): Promise<{ ok: boolean; message?: string; [key: string]: unknown }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; message?: string }>(`/api/contractor/performance`)
    ).catch(() => ({ ok: false, message: 'Could not load performance.' }));
  }
}
