import { Component } from '@angular/core';
import { MarketingPageComponent } from './marketing-page.component';

@Component({
  selector: 'app-about-page',
  standalone: true,
  imports: [MarketingPageComponent],
  template: `
    <app-marketing-page
      title="About FixBridge"
      lead="FixBridge connects homeowners with DIY guidance and trusted local pros — with property history, messaging, and payments in one system."
      ctaLabel="Back home"
      ctaLink="/"
    />
  `,
})
export class AboutPageComponent {}
