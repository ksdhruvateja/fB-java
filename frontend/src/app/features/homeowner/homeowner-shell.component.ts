import { Component, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { formatBadgeCount } from '../../core/models/notification.model';
import { PropertyContextService } from '../../core/services/property-context.service';
import { InAppCommsService } from '../../core/services/in-app-comms.service';
import { PropertyApiService } from '../../core/services/property-api.service';
import { NotificationBellComponent } from '../../shared/components/notification-bell.component';
import { MessagingPanelComponent } from '../../shared/components/messaging-panel.component';
import {
  HomeownerBottomNavComponent,
  HomeownerTabId,
} from './homeowner-bottom-nav.component';

const TITLES: Record<string, string> = {
  overview: 'Home',
  services: 'Services',
  jobs: 'Requests',
  report: 'Request Service',
  diy: 'DIY Guide',
  inbox: 'Messages',
  more: 'More',
  properties: 'My Property',
  'property-care': 'Property Care',
  payments: 'Payments',
  'go-pro': 'Go Pro',
  profile: 'Settings',
  help: 'Help & Support',
  legal: 'Legal',
  'refer-earn': 'Refer & Earn',
  documents: 'Documents',
};

const SIDE_LINKS: { id: string; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'services', label: 'Services' },
  { id: 'jobs', label: 'Service Requests' },
  { id: 'report', label: 'Request Service' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'property-care', label: 'Property Care' },
  { id: 'properties', label: 'My Property' },
  { id: 'payments', label: 'Payments' },
  { id: 'go-pro', label: 'Go Pro' },
  { id: 'documents', label: 'Documents' },
  { id: 'refer-earn', label: 'Refer & Earn' },
  { id: 'legal', label: 'Legal' },
  { id: 'profile', label: 'Profile' },
  { id: 'help', label: 'Help' },
  { id: 'more', label: 'More' },
];

@Component({
  selector: 'app-homeowner-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    FormsModule,
    HomeownerBottomNavComponent,
    NotificationBellComponent,
    MessagingPanelComponent,
  ],
  templateUrl: './homeowner-shell.component.html',
  styleUrl: './homeowner-shell.component.scss',
})
export class HomeownerShellComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly propertyApi = inject(PropertyApiService);
  readonly propertyCtx = inject(PropertyContextService);
  readonly comms = inject(InAppCommsService);

  private sub?: Subscription;
  tab: HomeownerTabId = 'overview';
  pageTitle = 'Home';
  messagesOpen = false;
  readonly sideLinks = SIDE_LINKS;
  readonly userName = computed(() => this.auth.currentUser()?.name || 'Homeowner');

  get title(): string {
    return this.pageTitle;
  }

  get inboxBadge(): string | null {
    return formatBadgeCount(
      this.comms.unreadNotifications() + this.comms.unreadMessages()
    );
  }

  get selectedPropertyId(): string {
    const id = this.propertyCtx.propertyId();
    return id == null ? '' : String(id);
  }

  set selectedPropertyId(value: string) {
    const n = value ? Number(value) : NaN;
    this.propertyCtx.select(Number.isFinite(n) && n > 0 ? n : null);
  }

  ngOnInit(): void {
    this.comms.start();
    void this.loadProperties();
    this.syncTab(this.router.url);
    this.sub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.syncTab(e.urlAfterRedirects));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  async loadProperties(): Promise<void> {
    try {
      const res = await this.propertyApi.list();
      this.propertyCtx.setProperties(res.properties || []);
    } catch {
      /* ignore */
    }
  }

  go(tab: HomeownerTabId): void {
    void this.router.navigate(['/homeowner', tab]);
  }

  refreshCounts(): void {
    void this.comms.refresh(true);
  }

  openMessages(): void {
    this.messagesOpen = true;
  }

  closeMessages(): void {
    this.messagesOpen = false;
  }

  isActive(id: string): boolean {
    const parts = this.router.url.split('?')[0].split('/').filter(Boolean);
    return (parts[1] || 'overview') === id;
  }

  private syncTab(url: string): void {
    const parts = url.split('?')[0].split('/').filter(Boolean);
    const seg = parts[1] || 'overview';
    if (seg === 'jobs' && parts[2]) this.pageTitle = 'Request detail';
    else this.pageTitle = TITLES[seg] || 'FixBridge';
    if (seg === 'diy') this.tab = 'jobs';
    else if (seg in TITLES) this.tab = (seg === 'property-care' || seg === 'go-pro' || seg === 'legal' || seg === 'refer-earn' || seg === 'documents' ? 'more' : seg) as HomeownerTabId;
    else this.tab = 'overview';
  }
}
