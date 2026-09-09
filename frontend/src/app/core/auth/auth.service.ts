import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  AUTH_TOKEN_KEY,
  AUTH_USER_CACHE_KEY,
  AuthResult,
  AuthUser,
  UserRole,
  ValidateTokenResult,
} from '../models/auth.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly currentUser = signal<AuthUser | null>(this.getStoredUser());

  constructor(private readonly http: HttpClient) {}

  getStoredToken(): string | null {
    if (!this.canUseStorage()) return null;
    try {
      return window.localStorage.getItem(AUTH_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  getStoredUser(): AuthUser | null {
    if (!this.canUseStorage()) return null;
    try {
      const raw = window.localStorage.getItem(AUTH_USER_CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }

  async signIn(role: UserRole, email: string, password: string): Promise<AuthResult> {
    try {
      const data = await firstValueFrom(
        this.http.post<{
          ok: boolean;
          message?: string;
          token?: string;
          user?: AuthUser;
          mfaRequired?: boolean;
        }>('/api/auth/signin', { role, email, password })
      );
      if (!data.ok || !data.token || !data.user) {
        return { ok: false, message: data.message || 'Sign in failed.' };
      }
      // MFA-pending tokens are stored so MFA start/verify can authenticate.
      this.storeSession(data.token, data.user);
      return {
        ok: true,
        user: data.user,
        mfaRequired: data.mfaRequired === true || (role === 'admin' && data.mfaRequired !== false),
        token: data.token,
      };
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'error' in err
          ? ((err as { error?: { message?: string } }).error?.message)
          : undefined;
      return {
        ok: false,
        message: message || 'Network error. Please check your connection and try again.',
      };
    }
  }

  async forgotPassword(
    email: string,
    role: UserRole | 'partner'
  ): Promise<{ ok: boolean; message?: string }> {
    try {
      return await firstValueFrom(
        this.http.post<{ ok: boolean; message?: string }>('/api/auth/forgot-password', {
          email,
          role,
        })
      );
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'error' in err
          ? ((err as { error?: { message?: string } }).error?.message)
          : undefined;
      return { ok: false, message: message || 'Could not start password reset.' };
    }
  }

  async mfaStart(force = false): Promise<{
    ok: boolean;
    message?: string;
    demoCode?: string;
    emailDelivered?: boolean;
  }> {
    try {
      return await firstValueFrom(
        this.http.post<{
          ok: boolean;
          message?: string;
          demoCode?: string;
          emailDelivered?: boolean;
        }>('/api/auth/mfa/start', { force })
      );
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'error' in err
          ? ((err as { error?: { message?: string } }).error?.message)
          : undefined;
      return { ok: false, message: message || 'Could not start MFA.' };
    }
  }

  async mfaVerify(code: string): Promise<AuthResult> {
    try {
      const data = await firstValueFrom(
        this.http.post<{
          ok: boolean;
          message?: string;
          token?: string;
          user?: AuthUser;
        }>('/api/auth/mfa/verify', { code })
      );
      if (!data.ok || !data.user) {
        return { ok: false, message: data.message || 'Invalid verification code.' };
      }
      const token = data.token || this.getStoredToken();
      if (token) this.storeSession(token, data.user);
      else this.currentUser.set(data.user);
      return { ok: true, user: data.user, token: token || undefined };
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'error' in err
          ? ((err as { error?: { message?: string } }).error?.message)
          : undefined;
      return { ok: false, message: message || 'Could not verify MFA code.' };
    }
  }

  async updateProfile(
    fields: Record<string, unknown>
  ): Promise<{ ok: true; user: AuthUser } | { ok: false; message: string }> {
    const token = this.getStoredToken();
    if (!token) return { ok: false, message: 'Not signed in.' };
    try {
      const data = await firstValueFrom(
        this.http.put<{ ok: boolean; message?: string; token?: string; user?: AuthUser }>(
          '/api/auth/profile',
          fields
        )
      );
      if (!data.ok || !data.user) {
        return { ok: false, message: data.message || 'Could not save profile.' };
      }
      this.storeSession(
        typeof data.token === 'string' && data.token ? data.token : token,
        data.user
      );
      return { ok: true, user: data.user };
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'error' in err
          ? ((err as { error?: { message?: string } }).error?.message)
          : undefined;
      return { ok: false, message: message || 'Could not save profile.' };
    }
  }

  async signUp(user: Record<string, unknown> & {
    role: UserRole;
    name: string;
    email: string;
    password: string;
  }): Promise<AuthResult> {
    try {
      const data = await firstValueFrom(
        this.http.post<{
          ok: boolean;
          message?: string;
          token?: string;
          user?: AuthUser;
        }>('/api/auth/signup', user)
      );
      if (!data.ok || !data.token || !data.user) {
        return { ok: false, message: data.message || 'Sign up failed.' };
      }
      this.storeSession(data.token, data.user);
      return { ok: true, user: data.user, token: data.token };
    } catch {
      return {
        ok: false,
        message: 'Network error. Please check your connection and try again.',
      };
    }
  }

  async validateToken(options?: { syncCheckout?: boolean }): Promise<ValidateTokenResult> {
    const token = this.getStoredToken();
    if (!token) return { ok: false, reason: 'no-token' };

    const url = options?.syncCheckout ? '/api/auth/me?sync=checkout' : '/api/auth/me';
    try {
      const data = await firstValueFrom(
        this.http.get<{ ok: boolean; user?: AuthUser }>(url, {
          headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
        })
      );
      if (!data.ok || !data.user) {
        this.clearSession();
        return { ok: false, reason: 'invalid' };
      }
      this.storeSession(token, data.user);
      return { ok: true, user: data.user };
    } catch {
      // Network / transient API failure — keep the cached session so a blip
      // does not wipe auth and bounce the user to the marketing home page.
      const cached = this.getStoredUser();
      if (cached) {
        this.currentUser.set(cached);
        return { ok: true, user: cached };
      }
      return { ok: false, reason: 'network' };
    }
  }

  logout(): void {
    this.clearSession();
  }

  /** Apply a session from OAuth or other auth flows. */
  applySession(token: string, user: AuthUser): void {
    this.storeSession(token, user);
  }

  private storeSession(token: string, user: AuthUser): void {
    if (this.canUseStorage()) {
      try {
        window.localStorage.setItem(AUTH_TOKEN_KEY, token);
        window.localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(user));
      } catch {
        // Storage can fail in restricted browser modes; keep app usable.
      }
    }
    this.currentUser.set(user);
  }

  private clearSession(): void {
    if (this.canUseStorage()) {
      try {
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
        window.localStorage.removeItem(AUTH_USER_CACHE_KEY);
      } catch {
        // ignore
      }
    }
    this.currentUser.set(null);
  }

  private canUseStorage(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      return typeof window.localStorage !== 'undefined';
    } catch {
      return false;
    }
  }
}
