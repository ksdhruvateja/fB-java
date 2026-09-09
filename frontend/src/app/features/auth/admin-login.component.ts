import { Component } from '@angular/core';
import { RoleLoginComponent } from './role-login.component';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [RoleLoginComponent],
  template: `
    <app-role-login
      role="admin"
      title="Staff sign in"
      subtitle="Ops console access"
      homeLink="/"
      [requireMfa]="true"
    />
  `,
})
export class AdminLoginComponent {}
