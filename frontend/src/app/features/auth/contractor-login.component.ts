import { Component } from '@angular/core';
import { RoleLoginComponent } from './role-login.component';

@Component({
  selector: 'app-contractor-login',
  standalone: true,
  imports: [RoleLoginComponent],
  template: `
    <app-role-login
      role="contractor"
      title="Contractor sign in"
      subtitle="Manage jobs, quotes, and payouts"
      homeLink="/contractors"
      [allowSignup]="true"
    />
  `,
})
export class ContractorLoginComponent {}
