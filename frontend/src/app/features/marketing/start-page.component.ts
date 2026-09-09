import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-start-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="page">
      <p class="eyebrow">FixBridge</p>
      <h1>Start intake</h1>
      <p class="lead">Partner / promo codes from the URL are stored for the signup flow. Continue as a homeowner to report an issue.</p>
      <a class="fb-btn fb-btn-primary" routerLink="/auth/homeowner">Continue</a>
    </section>
  `,
  styles: `
    .page { max-width: 720px; margin: 0 auto; padding: 3rem 1.5rem; display: grid; gap: 0.85rem; }
    .eyebrow { margin: 0; font-family: var(--font-display); font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--primary); }
    .lead { color: var(--muted-foreground); max-width: 48ch; }
  `,
})
export class StartPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    const partner = q.get('partner') || q.get('ref') || q.get('code');
    const discount = q.get('discount') || q.get('promo');
    try {
      if (partner) {
        const code = partner.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        if (code) {
          sessionStorage.setItem('fixbridge-partner-code', code);
          sessionStorage.setItem('fixbridge-partner-intake', '1');
        }
      }
      if (discount) {
        const code = discount.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        if (code) sessionStorage.setItem('fixbridge-discount-code', code);
      }
    } catch {
      /* ignore */
    }

    const user = this.auth.getStoredUser();
    if (user?.role === 'homeowner') {
      void this.router.navigateByUrl('/homeowner');
    }
  }
}
