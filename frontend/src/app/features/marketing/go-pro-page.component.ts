import { Component } from '@angular/core';
import { MarketingPageComponent } from './marketing-page.component';

@Component({
  selector: 'app-go-pro-page',
  standalone: true,
  imports: [MarketingPageComponent],
  template: `
    <app-marketing-page
      title="Go Pro"
      lead="Unlock HomeCare Pro features for deeper property insights, priority dispatch, and member pricing. Stripe return query params are documented in MIGRATION_NOTES.md."
      ctaLabel="Homeowner sign in"
      ctaLink="/auth/homeowner"
    />
  `,
})
export class GoProPageComponent {}
