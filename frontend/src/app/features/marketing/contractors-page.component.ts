import { Component } from '@angular/core';
import { MarketingPageComponent } from './marketing-page.component';

@Component({
  selector: 'app-contractors-page',
  standalone: true,
  imports: [MarketingPageComponent],
  template: `
    <app-marketing-page
      title="Grow with FixBridge"
      lead="Join the contractor network, receive qualified jobs, and manage compliance, quotes, and payouts in one portal."
      ctaLabel="Contractor sign in"
      ctaLink="/auth/contractor"
    />
  `,
})
export class ContractorsPageComponent {}
