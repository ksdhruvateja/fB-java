import { Component } from '@angular/core';
import { RoleLoginComponent } from './role-login.component';

@Component({
  selector: 'app-homeowner-login',
  standalone: true,
  imports: [RoleLoginComponent],
  template: `
    <app-role-login
      role="homeowner"
      title="Homeowner sign in"
      subtitle="Access your home care dashboard"
      homeLink="/"
      [allowSignup]="true"
    />
  `,
})
export class HomeownerLoginComponent {}
