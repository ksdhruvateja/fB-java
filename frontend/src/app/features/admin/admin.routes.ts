import { Routes } from '@angular/router';
import { AdminShellComponent } from './admin-shell.component';
import {
  AdminContractorsTabComponent,
  AdminDisputesTabComponent,
  AdminFinanceTabComponent,
  AdminHomeownersTabComponent,
  AdminMessagesTabComponent,
  AdminOverviewTabComponent,
  AdminQuotesTabComponent,
  AdminServicesTabComponent,
  AdminSettingsTabComponent,
  AdminSupportTabComponent,
  AdminWorkQueueTabComponent,
} from './admin-tabs';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      { path: 'overview', component: AdminOverviewTabComponent },
      { path: 'work-queue', component: AdminWorkQueueTabComponent },
      { path: 'quotes', component: AdminQuotesTabComponent },
      { path: 'homeowners', component: AdminHomeownersTabComponent },
      { path: 'contractors', component: AdminContractorsTabComponent },
      { path: 'finance', component: AdminFinanceTabComponent },
      { path: 'disputes', component: AdminDisputesTabComponent },
      { path: 'support-tickets', component: AdminSupportTabComponent },
      { path: 'services', component: AdminServicesTabComponent },
      { path: 'messages', component: AdminMessagesTabComponent },
      { path: 'settings', component: AdminSettingsTabComponent },
      { path: 'dashboard', redirectTo: 'overview' },
      { path: '**', redirectTo: 'overview' },
    ],
  },
];
