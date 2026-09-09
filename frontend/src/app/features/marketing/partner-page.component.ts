import { Component } from '@angular/core';
import { MarketingPageComponent } from './marketing-page.component';

@Component({
  selector: 'app-partner-page',
  standalone: true,
  imports: [MarketingPageComponent],
  template: `
    <app-marketing-page
      title="Partner portal"
      lead="Partner intake and reporting tools will be migrated here. Use /start?partner=CODE for customer intake attribution."
      ctaLabel="Home"
      ctaLink="/"
    />
  `,
})
export class PartnerPageComponent {}
