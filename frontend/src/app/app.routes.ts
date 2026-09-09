import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { MarketingLayoutComponent } from './layouts/marketing-layout.component';
import { PortalLayoutComponent } from './layouts/portal-layout.component';
import { MarketingHomeComponent } from './features/marketing/marketing-home.component';
import { ContractorsPageComponent } from './features/marketing/contractors-page.component';
import { AboutPageComponent } from './features/marketing/about-page.component';
import { GoProPageComponent } from './features/marketing/go-pro-page.component';
import { LegalPageComponent } from './features/marketing/legal-page.component';
import { MarketingUnsubscribeComponent } from './features/marketing/marketing-unsubscribe.component';
import { StartPageComponent } from './features/marketing/start-page.component';
import { PartnerPageComponent } from './features/marketing/partner-page.component';
import { HomeownerLoginComponent } from './features/auth/homeowner-login.component';
import { ContractorLoginComponent } from './features/auth/contractor-login.component';
import { AdminLoginComponent } from './features/auth/admin-login.component';
import { ResetPasswordComponent } from './features/auth/reset-password.component';

export const routes: Routes = [
  {
    path: '',
    component: MarketingLayoutComponent,
    children: [
      { path: '', component: MarketingHomeComponent },
      { path: 'contractors', component: ContractorsPageComponent },
      { path: 'about', component: AboutPageComponent },
      { path: 'go-pro', component: GoProPageComponent },
      { path: 'legal', component: LegalPageComponent },
      { path: 'legal/:slug', component: LegalPageComponent },
      { path: 'marketing/unsubscribe', component: MarketingUnsubscribeComponent },
      { path: 'start', component: StartPageComponent },
      { path: 'partner', component: PartnerPageComponent },
    ],
  },
  { path: 'auth/homeowner', component: HomeownerLoginComponent },
  { path: 'auth/contractor', component: ContractorLoginComponent },
  { path: 'auth/admin', component: AdminLoginComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  {
    path: 'homeowner',
    component: PortalLayoutComponent,
    canActivate: [authGuard, roleGuard('homeowner')],
    loadChildren: () =>
      import('./features/homeowner/homeowner.routes').then((m) => m.HOMEOWNER_ROUTES),
  },
  {
    path: 'contractor',
    component: PortalLayoutComponent,
    canActivate: [authGuard, roleGuard('contractor')],
    loadChildren: () =>
      import('./features/contractor/contractor.routes').then((m) => m.CONTRACTOR_ROUTES),
  },
  {
    path: 'admin',
    component: PortalLayoutComponent,
    canActivate: [authGuard, roleGuard('admin')],
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
