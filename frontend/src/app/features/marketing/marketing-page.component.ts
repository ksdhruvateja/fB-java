import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-marketing-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="page">
      <p class="page__eyebrow">FixBridge</p>
      <h1>{{ title }}</h1>
      <p class="page__lead">{{ lead }}</p>
      <a class="fb-btn fb-btn-primary" [routerLink]="ctaLink">{{ ctaLabel }}</a>
    </section>
  `,
  styles: `
    .page {
      max-width: 720px;
      margin: 0 auto;
      padding: 3rem 1.5rem 4rem;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }
    .page__eyebrow {
      margin: 0;
      font-family: var(--font-display);
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--primary);
    }
    h1 {
      font-size: clamp(2rem, 4vw, 2.8rem);
      line-height: 1.05;
    }
    .page__lead {
      margin: 0 0 0.5rem;
      color: var(--muted-foreground);
      max-width: 48ch;
      line-height: 1.5;
    }
  `,
})
export class MarketingPageComponent {
  @Input({ required: true }) title!: string;
  @Input({ required: true }) lead!: string;
  @Input() ctaLabel = 'Get started';
  @Input() ctaLink = '/auth/homeowner';
}
