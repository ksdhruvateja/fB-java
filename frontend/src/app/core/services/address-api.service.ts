import { Injectable } from '@angular/core';
import {
  AddressAutocompleteResponse,
  AddressSuggestion,
} from '../models/address.model';

const UNAVAILABLE =
  'Address suggestions are temporarily unavailable. You can continue entering the address manually.';

const suggestionCache = new Map<string, { at: number; data: AddressAutocompleteResponse }>();
const SUGGESTION_CACHE_MS = 8 * 60 * 1000;

/**
 * Public address autocomplete — intentionally uses fetch without JWT
 * (stale tokens 401 the authenticated autocomplete route).
 */
@Injectable({ providedIn: 'root' })
export class AddressApiService {
  autocomplete(
    q: string,
    opts?: { signal?: AbortSignal; limit?: number }
  ): Promise<AddressAutocompleteResponse> {
    const query = q.trim();
    const limit = opts?.limit ?? 6;
    if (query.length < 3) {
      return Promise.resolve({ ok: true, suggestions: [], skipped: true });
    }

    const key = `${limit}:${query.toLowerCase()}`;
    const hit = suggestionCache.get(key);
    if (hit && Date.now() - hit.at <= SUGGESTION_CACHE_MS) {
      return Promise.resolve(hit.data);
    }

    const params = new URLSearchParams({ q: query, limit: String(limit) });
    return fetch(`/api/public/address/autocomplete?${params}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: opts?.signal,
    })
      .then(async (res) => {
        let data: AddressAutocompleteResponse | null = null;
        try {
          data = (await res.json()) as AddressAutocompleteResponse;
        } catch {
          data = null;
        }
        if (!res.ok || !data || typeof data !== 'object') {
          return {
            ok: true,
            suggestions: [] as AddressSuggestion[],
            unavailable: true,
            message: data?.message || UNAVAILABLE,
          };
        }
        if (data.unavailable) {
          return {
            ...data,
            suggestions: data.suggestions || [],
            message: data.message || UNAVAILABLE,
          };
        }
        const normalized = { ...data, suggestions: data.suggestions || [] };
        if ((normalized.suggestions || []).length > 0) {
          suggestionCache.set(key, { at: Date.now(), data: normalized });
        }
        return normalized;
      })
      .catch((e: Error) => {
        if (e?.name === 'AbortError') throw e;
        return {
          ok: true,
          suggestions: [] as AddressSuggestion[],
          unavailable: true,
          message: UNAVAILABLE,
        };
      });
  }
}
