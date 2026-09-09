import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-loading-skeleton',
  standalone: true,
  template: `
    <div class="sk" [attr.aria-busy]="true" aria-label="Loading">
      @for (row of rows; track $index) {
        <div class="sk__row" [style.--w]="widths[$index % widths.length]"></div>
      }
    </div>
  `,
  styles: `
    .sk { display: grid; gap: 0.65rem; }
    .sk__row {
      height: 0.95rem;
      width: var(--w, 100%);
      border-radius: 2px;
      background: linear-gradient(90deg, #eee 0%, #f7f2eb 45%, #eee 100%);
      background-size: 200% 100%;
      animation: sk-shine 1.2s ease-in-out infinite;
    }
    @keyframes sk-shine {
      0% { background-position: 100% 0; }
      100% { background-position: -100% 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .sk__row { animation: none; background: #eee; }
    }
  `,
})
export class LoadingSkeletonComponent {
  @Input() count = 4;
  readonly widths = ['100%', '92%', '78%', '86%', '70%'];

  get rows(): number[] {
    return Array.from({ length: Math.max(1, this.count) }, (_, i) => i);
  }
}
