import { Routes } from '@angular/router';
import { ContractorShellComponent } from './contractor-shell.component';
import {
  ContractorAreasTabComponent,
  ContractorAvailabilityTabComponent,
  ContractorComplianceTabComponent,
  ContractorDashboardTabComponent,
  ContractorInvitesTabComponent,
  ContractorJobsTabComponent,
  ContractorMessagesTabComponent,
  ContractorPayoutsTabComponent,
  ContractorPerformanceTabComponent,
  ContractorSettingsTabComponent,
  ContractorTeamTabComponent,
} from './contractor-tabs';

export const CONTRACTOR_ROUTES: Routes = [
  {
    path: '',
    component: ContractorShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: ContractorDashboardTabComponent },
      { path: 'invites', component: ContractorInvitesTabComponent },
      { path: 'jobs', component: ContractorJobsTabComponent },
      { path: 'messages', component: ContractorMessagesTabComponent },
      { path: 'team', component: ContractorTeamTabComponent },
      { path: 'compliance', component: ContractorComplianceTabComponent },
      { path: 'availability', component: ContractorAvailabilityTabComponent },
      { path: 'payouts', component: ContractorPayoutsTabComponent },
      { path: 'performance', component: ContractorPerformanceTabComponent },
      { path: 'areas', component: ContractorAreasTabComponent },
      { path: 'settings', component: ContractorSettingsTabComponent },
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
];
