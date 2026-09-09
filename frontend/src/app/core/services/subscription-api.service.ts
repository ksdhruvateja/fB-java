import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type GoProPlan = {
  id?: number | string;
  code?: string;
  planCode?: string;
  name?: string;
  title?: string;
  description?: string;
  priceMonthly?: number;
  price?: number;
  amount?: number;
  features?: string[];
  [key: string]: unknown;
};

@Injectable({ providedIn: 'root' })
export class SubscriptionApiService {
  private readonly http = inject(HttpClient);

  goProPlans(): Promise<{ ok: boolean; plans: GoProPlan[]; message?: string }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; plans?: GoProPlan[]; message?: string }>(
        '/api/platform/go-pro-plans'
      )
    )
      .then((d) => ({ ok: d.ok !== false, plans: d.plans || [], message: d.message }))
      .catch(() => ({ ok: false, plans: [], message: 'Could not load plans.' }));
  }

  platformPlans(): Promise<{ ok: boolean; plans: GoProPlan[]; message?: string }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; plans?: GoProPlan[]; message?: string }>('/api/platform/plans')
    )
      .then((d) => ({ ok: d.ok !== false, plans: d.plans || [], message: d.message }))
      .catch(() => ({ ok: false, plans: [], message: 'Could not load plans.' }));
  }

  checkout(body: {
    planCode: string;
    jobId?: number;
    returnTo?: string;
  }): Promise<{ ok: boolean; url?: string; message?: string; simulated?: boolean }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; url?: string; message?: string; simulated?: boolean }>(
        '/api/subscriptions/checkout',
        body
      )
    ).catch(() => ({ ok: false, message: 'Could not start checkout.' }));
  }

  mine(): Promise<{ ok: boolean; subscriptions?: unknown[]; message?: string }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; subscriptions?: unknown[]; message?: string }>(
        '/api/subscriptions/mine'
      )
    ).catch(() => ({ ok: false, subscriptions: [], message: 'Could not load subscriptions.' }));
  }
}
