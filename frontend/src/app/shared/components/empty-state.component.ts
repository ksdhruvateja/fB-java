import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="empty">
      <h3>{{ title }}</h3>
      @if (body) {
        <p>{{ body }}</p>
      }
      @if (ctaLink && ctaLabel) {
        <a [routerLink]="ctaLink" class="fb-btn fb-btn-primary">{{ ctaLabel }}</a>
      }
    </div>
  `,
  styles: `
    .empty {
      padding: 1.75rem 1.25rem;
      border: 1px dashed var(--border);
      background: var(--fixbridge-cream, #faf6f1);
      display: grid;
      gap: 0.5rem;
      max-width: 36rem;
    }
    h3 {
      font-size: 1.15rem;
      text-transform: uppercase;
    }
    p {
      margin: 0;
      color: var(--muted-foreground);
      line-height: 1.45;
      max-width: 42ch;
    }
    a { margin-top: 0.5rem; justify-self: start; }
  `,
})
export class EmptyStateComponent {
  @Input({ required: true }) title!: string;
  @Input() body = '';
  @Input() ctaLink: string | null = null;
  @Input() ctaLabel = '';
}
