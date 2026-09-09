import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';

function friendlyMessage(err: HttpErrorResponse): string {
  const body = err.error;
  if (body && typeof body === 'object') {
    const msg = (body as { message?: string; error?: string }).message
      || (body as { message?: string; error?: string }).error;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  if (typeof body === 'string' && body.trim()) return body.trim();

  switch (err.status) {
    case 0:
      return 'Network error. Check your connection and try again.';
    case 400:
      return 'That request could not be processed. Please check your input.';
    case 401:
      return 'Your session expired. Please sign in again.';
    case 403:
      return 'You do not have permission to do that.';
    case 404:
      return 'We could not find what you were looking for.';
    case 409:
      return 'That action conflicts with the current state. Refresh and try again.';
    case 422:
      return 'Some fields need attention before we can continue.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    case 500:
    case 502:
    case 503:
      return 'Something went wrong on our side. Please try again shortly.';
    default:
      return err.message || 'Something went wrong. Please try again.';
  }
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        const friendly = friendlyMessage(err);
        if (
          err.status === 401 &&
          !req.url.includes('/api/auth/signin') &&
          !req.url.includes('/api/auth/signup') &&
          !req.url.includes('/api/auth/mfa')
        ) {
          const role = auth.currentUser()?.role || auth.getStoredUser()?.role;
          auth.logout();
          const path =
            role === 'contractor'
              ? '/auth/contractor'
              : role === 'admin'
                ? '/auth/admin'
                : '/auth/homeowner';
          void router.navigateByUrl(path);
        }
        return throwError(() => {
          const wrapped = new HttpErrorResponse({
            error: typeof err.error === 'object' && err.error
              ? { ...err.error, message: (err.error as { message?: string }).message || friendly }
              : { message: friendly },
            headers: err.headers,
            status: err.status,
            statusText: err.statusText,
            url: err.url || undefined,
          });
          return wrapped;
        });
      }
      return throwError(() => err);
    })
  );
};
