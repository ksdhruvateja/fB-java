import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LegalApiService {
  private readonly http = inject(HttpClient);

  documents(): Promise<{ ok: boolean; documents?: unknown[]; message?: string }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; documents?: unknown[]; message?: string }>('/api/legal/documents')
    ).catch(() => ({ ok: false, documents: [], message: 'Could not load legal documents.' }));
  }

  consentStatus(): Promise<{
    ok: boolean;
    required?: boolean;
    accepted?: boolean;
    missing?: string[];
    consents?: Record<string, unknown>;
    message?: string;
  }> {
    return firstValueFrom(
      this.http.get<{
        ok: boolean;
        required?: boolean;
        accepted?: boolean;
        missing?: string[];
        consents?: Record<string, unknown>;
        message?: string;
      }>('/api/homeowner/consent/status')
    ).catch(() => ({ ok: false, message: 'Could not load consent status.' }));
  }

  accept(body: Record<string, unknown> = {}): Promise<{ ok: boolean; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; message?: string }>('/api/homeowner/consent/accept', body)
    ).catch(() => ({ ok: false, message: 'Could not record consent.' }));
  }
}
