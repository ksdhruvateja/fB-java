import { Routes } from '@angular/router';
import { HomeownerShellComponent } from './homeowner-shell.component';
import { HomeownerOverviewComponent } from './tabs/homeowner-overview.component';
import { HomeownerJobsComponent } from './tabs/homeowner-jobs.component';
import { HomeownerJobDetailComponent } from './tabs/homeowner-job-detail.component';
import { HomeownerPropertiesComponent } from './tabs/homeowner-properties.component';
import { HomeownerInboxComponent } from './tabs/homeowner-inbox.component';
import { HomeownerProfileComponent } from './tabs/homeowner-profile.component';
import { HomeownerReportComponent } from './tabs/homeowner-report.component';
import { HomeownerDiyComponent } from './tabs/homeowner-diy.component';
import {
  HomeownerDocumentsComponent,
  HomeownerGoProComponent,
  HomeownerHelpComponent,
  HomeownerLegalComponent,
  HomeownerMoreComponent,
  HomeownerPaymentsComponent,
  HomeownerPropertyCareComponent,
  HomeownerReferComponent,
  HomeownerServicesComponent,
} from './tabs/homeowner-extra-tabs';

export const HOMEOWNER_ROUTES: Routes = [
  {
    path: '',
    component: HomeownerShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      { path: 'overview', component: HomeownerOverviewComponent },
      { path: 'services', component: HomeownerServicesComponent },
      { path: 'jobs', component: HomeownerJobsComponent },
      { path: 'jobs/:id', component: HomeownerJobDetailComponent },
      { path: 'report', component: HomeownerReportComponent },
      { path: 'diy', component: HomeownerDiyComponent },
      { path: 'inbox', component: HomeownerInboxComponent },
      { path: 'more', component: HomeownerMoreComponent },
      { path: 'properties', component: HomeownerPropertiesComponent },
      { path: 'property', redirectTo: 'properties' },
      { path: 'property-care', component: HomeownerPropertyCareComponent },
      { path: 'passport', redirectTo: 'property-care' },
      { path: 'payments', component: HomeownerPaymentsComponent },
      { path: 'go-pro', component: HomeownerGoProComponent },
      { path: 'help', component: HomeownerHelpComponent },
      { path: 'legal', component: HomeownerLegalComponent },
      { path: 'refer-earn', component: HomeownerReferComponent },
      { path: 'documents', component: HomeownerDocumentsComponent },
      { path: 'profile', component: HomeownerProfileComponent },
      { path: 'settings', redirectTo: 'profile' },
      { path: 'dashboard', redirectTo: 'overview' },
      { path: '**', redirectTo: 'overview' },
    ],
  },
];
