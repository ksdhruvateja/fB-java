import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '../models/auth.model';

export function roleGuard(expectedRole: UserRole): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    const token = auth.getStoredToken();
    if (!token) {
      return router.createUrlTree([loginPathFor(expectedRole)]);
    }

    let user = auth.getStoredUser();
    const result = await auth.validateToken();
    if (result.ok) {
      user = result.user;
    }

    if (!user || user.role !== expectedRole) {
      auth.logout();
      return router.createUrlTree([loginPathFor(expectedRole)]);
    }

    return true;
  };
}

function loginPathFor(role: UserRole): string {
  if (role === 'contractor') return '/auth/contractor';
  if (role === 'admin') return '/auth/admin';
  return '/auth/homeowner';
}
