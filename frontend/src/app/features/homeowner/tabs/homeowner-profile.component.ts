import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-homeowner-profile',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './homeowner-profile.component.html',
  styleUrl: './homeowner-profile.component.scss',
})
export class HomeownerProfileComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.currentUser;
  readonly fields = computed(() => {
    const u = this.user();
    if (!u) return [];
    return [
      { label: 'Name', value: u.name },
      { label: 'Email', value: u.email },
      { label: 'Role', value: u.role },
      { label: 'Phone', value: u.phone || '—' },
      { label: 'Address', value: u.address || '—' },
      { label: 'Plan', value: u.planCode || u.homeCareSubscription?.planCode || 'Free' },
    ];
  });

  logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/');
  }
}
