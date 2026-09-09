import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ReferralsApiService {
  private readonly http = inject(HttpClient);

  me(): Promise<{
    ok: boolean;
    code?: string;
    link?: string;
    shareMessage?: string;
    credits?: { availableCents?: number; pendingCents?: number; usedCents?: number };
    referrals?: unknown[];
    message?: string;
  }> {
    return firstValueFrom(
      this.http.get<{
        ok: boolean;
        code?: string;
        link?: string;
        shareMessage?: string;
        credits?: { availableCents?: number; pendingCents?: number; usedCents?: number };
        referrals?: unknown[];
        message?: string;
      }>('/api/referrals/me')
    ).catch(() => ({
      ok: false,
      message: 'Referrals API not available yet.',
      referrals: [],
    }));
  }
}
