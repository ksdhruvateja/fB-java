import { Component } from '@angular/core';
import { RoleDashboardComponent } from '../../shared/components/role-dashboard.component';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RoleDashboardComponent],
  template: `<app-role-dashboard />`,
})
export class AdminDashboardComponent {}
