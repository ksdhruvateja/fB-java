import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ChangeOrder, CheckoutBreakdown, Proposal, QuoteOption } from '../models/quote.model';
import { ManagedJob } from '../models/managed-job.model';

@Injectable({ providedIn: 'root' })
export class QuoteApiService {
  private readonly http = inject(HttpClient);

  getProposal(jobId: number): Promise<{ ok: boolean; proposal: Proposal | null; message?: string }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; proposal: Proposal | null; message?: string }>(
        `/api/managed/jobs/${jobId}/proposal`
      )
    ).catch(() => ({ ok: false, proposal: null, message: 'Could not load proposal.' }));
  }

  quoteOptions(
    jobId: number
  ): Promise<{
    ok: boolean;
    options: QuoteOption[];
    hasAlternatives: boolean;
    message?: string;
  }> {
    return firstValueFrom(
      this.http.get<{
        ok: boolean;
        options?: QuoteOption[];
        hasAlternatives?: boolean;
        message?: string;
      }>(`/api/managed/jobs/${jobId}/quote-options`)
    )
      .then((data) => ({
        ok: !!data.ok,
        options: data.options || [],
        hasAlternatives: !!data.hasAlternatives,
        message: data.message,
      }))
      .catch(() => ({
        ok: false,
        options: [],
        hasAlternatives: false,
        message: 'Could not load quote options.',
      }));
  }

  approveProposal(
    jobId: number,
    opts: { consents?: Record<string, boolean>; proposalId?: number } = {}
  ): Promise<{ ok: boolean; proposal?: Proposal; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; proposal?: Proposal; message?: string }>(
        `/api/managed/jobs/${jobId}/approve-proposal`,
        {
          consents: opts.consents,
          acknowledged: true,
          proposalId: opts.proposalId,
        }
      )
    ).catch(() => ({ ok: false, message: 'Could not approve proposal.' }));
  }

  listChangeOrders(
    jobId: number
  ): Promise<{ ok: boolean; changeOrders: ChangeOrder[]; message?: string }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; changeOrders?: ChangeOrder[]; message?: string }>(
        `/api/managed/jobs/${jobId}/change-orders`
      )
    )
      .then((data) => ({
        ok: !!data.ok,
        changeOrders: data.changeOrders || [],
        message: data.message,
      }))
      .catch(() => ({
        ok: false,
        changeOrders: [],
        message: 'Could not load change orders.',
      }));
  }

  approveChangeOrder(
    jobId: number,
    changeOrderId: number,
    consents?: Record<string, boolean>
  ): Promise<{ ok: boolean; changeOrder?: ChangeOrder; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; changeOrder?: ChangeOrder; message?: string }>(
        `/api/managed/jobs/${jobId}/change-orders/${changeOrderId}/approve`,
        { consents, acknowledged: true }
      )
    ).catch(() => ({ ok: false, message: 'Could not approve change order.' }));
  }

  prepareCheckout(
    jobId: number,
    body?: { discountCode?: string | null; clearCoupon?: boolean }
  ): Promise<{
    ok: boolean;
    snapshot?: CheckoutBreakdown;
    amount?: number;
    job?: ManagedJob;
    message?: string;
  }> {
    return firstValueFrom(
      this.http.post<{
        ok: boolean;
        snapshot?: CheckoutBreakdown;
        amount?: number;
        job?: ManagedJob;
        message?: string;
      }>(`/api/managed/jobs/${jobId}/prepare-checkout`, body || {})
    ).catch(() => ({ ok: false, message: 'Could not prepare checkout.' }));
  }
}
