import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-marketing-unsubscribe',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="page">
      <p class="eyebrow">FixBridge</p>
      <h1>Marketing preferences</h1>
      <p>
        Unsubscribe request for channel <strong>{{ channel }}</strong>
        @if (token) {
          (token received).
        } @else {
          — missing token.
        }
      </p>
      <p class="lead">API wiring for /api marketing unsubscribe will be ported next.</p>
      <a routerLink="/">Back home</a>
    </section>
  `,
  styles: `
    .page { max-width: 720px; margin: 0 auto; padding: 3rem 1.5rem; display: grid; gap: 0.75rem; }
    .eyebrow { margin: 0; font-family: var(--font-display); font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--primary); }
    .lead { color: var(--muted-foreground); }
    a { color: var(--primary); }
  `,
})
export class MarketingUnsubscribeComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  token = '';
  channel = 'email';

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    this.token = q.get('token') || '';
    this.channel = q.get('channel') || 'email';
  }
}
