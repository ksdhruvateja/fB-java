import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ManagedJob } from '../models/managed-job.model';
import { PaymentTransaction } from '../models/payment.model';
import { CheckoutBreakdown } from '../models/quote.model';

@Injectable({ providedIn: 'root' })
export class PaymentApiService {
  private readonly http = inject(HttpClient);

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

  payDispatch(
    jobId: number,
    opts: { discountCode?: string; consents?: Record<string, boolean> } = {}
  ): Promise<{
    ok: boolean;
    simulated?: boolean;
    url?: string;
    amount?: number;
    job?: ManagedJob;
    message?: string;
  }> {
    const body: Record<string, unknown> = {
      acknowledged: true,
      consents: opts.consents,
    };
    if (opts.discountCode) body['discountCode'] = opts.discountCode;
    return firstValueFrom(
      this.http.post<{
        ok: boolean;
        simulated?: boolean;
        url?: string;
        amount?: number;
        job?: ManagedJob;
        message?: string;
      }>(`/api/managed/jobs/${jobId}/pay-dispatch`, body)
    ).catch(() => ({ ok: false, message: 'Could not start dispatch payment.' }));
  }

  paymentsMine(): Promise<{
    ok: boolean;
    transactions: PaymentTransaction[];
    message?: string;
  }> {
    return firstValueFrom(
      this.http.get<{
        ok: boolean;
        transactions?: PaymentTransaction[];
        message?: string;
      }>('/api/payments/mine')
    )
      .then((data) => ({
        ok: !!data.ok,
        transactions: data.transactions || [],
        message: data.message,
      }))
      .catch(() => ({
        ok: false,
        transactions: [],
        message: 'Could not load payments.',
      }));
  }

  /** Tip checkout — 100% to contractor via Spring `/api/managed/jobs/{id}/tips`. */
  tipCheckout(
    jobId: number,
    tipAmount: number
  ): Promise<{
    ok: boolean;
    checkoutUrl?: string;
    url?: string;
    simulated?: boolean;
    summary?: { serviceTotal: number; tipAmount: number; customerTotal: number };
    message?: string;
  }> {
    return firstValueFrom(
      this.http.post<{
        ok: boolean;
        checkoutUrl?: string;
        url?: string;
        simulated?: boolean;
        summary?: { serviceTotal: number; tipAmount: number; customerTotal: number };
        message?: string;
      }>(`/api/managed/jobs/${jobId}/tips`, { tipAmount })
    ).catch(() => ({ ok: false, message: 'Could not start tip checkout.' }));
  }
}
