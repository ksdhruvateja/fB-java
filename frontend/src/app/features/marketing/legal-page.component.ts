import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-legal-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="page">
      <p class="eyebrow">FixBridge</p>
      <h1>Legal</h1>
      <p>Document: <strong>{{ slug || 'overview' }}</strong></p>
      <p class="lead">Legal document shells will be ported from the React legalDocuments module.</p>
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
export class LegalPageComponent {
  readonly slug = inject(ActivatedRoute).snapshot.paramMap.get('slug') || '';
}
