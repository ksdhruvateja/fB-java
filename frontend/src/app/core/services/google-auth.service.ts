import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AuthUser, UserRole } from '../models/auth.model';

export type GoogleAuthConfig = {
  ok: boolean;
  googleOAuthEnabled?: boolean;
  configured: boolean;
  clientId?: string | null;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, config: Record<string, unknown>) => void;
          cancel: () => void;
        };
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const existing = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error('Could not load Google Sign-In.'))
      );
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not load Google Sign-In.'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  getConfig(): Promise<GoogleAuthConfig> {
    return firstValueFrom(
      this.http.get<GoogleAuthConfig>('/api/auth/google/config')
    ).catch(() => ({ ok: false, configured: false }));
  }

  async loadGis(): Promise<void> {
    await loadGoogleScript();
  }

  async signInWithGoogle(
    credential: string,
    role: UserRole,
    body: Record<string, unknown> = {}
  ): Promise<
    | { ok: true; user: AuthUser; token: string; message?: string }
    | { ok: false; message: string; code?: string }
  > {
    try {
      const data = await firstValueFrom(
        this.http.post<{
          ok: boolean;
          message?: string;
          code?: string;
          token?: string;
          user?: AuthUser;
        }>('/api/auth/google', {
          credential: credential || undefined,
          role,
          ...body,
        })
      );
      if (!data.ok || !data.token || !data.user) {
        return {
          ok: false,
          message: data.message || 'We could not complete Google sign-in.',
          code: data.code,
        };
      }
      this.auth.applySession(data.token, data.user);
      return { ok: true, user: data.user, token: data.token, message: data.message };
    } catch {
      return {
        ok: false,
        message: 'Network error. Please check your connection and try again.',
      };
    }
  }
}
