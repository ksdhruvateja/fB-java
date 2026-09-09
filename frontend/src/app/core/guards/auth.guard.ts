import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const token = auth.getStoredToken();
  if (!token) {
    return router.createUrlTree(['/']);
  }

  const result = await auth.validateToken();
  if (!result.ok) {
    auth.logout();
    return router.createUrlTree(['/']);
  }

  return true;
};
