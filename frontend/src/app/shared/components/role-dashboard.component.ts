import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { UserRole } from '../../core/models/auth.model';

@Component({
  selector: 'app-role-dashboard',
  standalone: true,
  templateUrl: './role-dashboard.component.html',
  styleUrl: './role-dashboard.component.scss',
})
export class RoleDashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.currentUser;
  readonly displayName = computed(() => this.user()?.name || 'User');
  readonly displayEmail = computed(() => this.user()?.email || '');
  readonly displayRole = computed(() => this.user()?.role || 'homeowner');

  titleFor(role: UserRole | string): string {
    if (role === 'contractor') return 'Contractor dashboard';
    if (role === 'admin') return 'Admin dashboard';
    return 'Homeowner dashboard';
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/');
  }
}
