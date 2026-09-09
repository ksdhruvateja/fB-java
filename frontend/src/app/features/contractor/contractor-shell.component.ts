import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { formatBadgeCount } from '../../core/models/notification.model';
import { InAppCommsService } from '../../core/services/in-app-comms.service';
import { NotificationBellComponent } from '../../shared/components/notification-bell.component';

export type ContractorTabId =
  | 'dashboard'
  | 'invites'
  | 'jobs'
  | 'messages'
  | 'team'
  | 'compliance'
  | 'availability'
  | 'payouts'
  | 'performance'
  | 'areas'
  | 'settings';

const TABS: { id: ContractorTabId; label: string; group: string }[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'Main' },
  { id: 'invites', label: 'Invitations', group: 'Main' },
  { id: 'jobs', label: 'Jobs', group: 'Main' },
  { id: 'messages', label: 'Messages', group: 'Main' },
  { id: 'team', label: 'Team', group: 'Operations' },
  { id: 'compliance', label: 'Compliance', group: 'Operations' },
  { id: 'availability', label: 'Availability', group: 'Operations' },
  { id: 'areas', label: 'Service areas', group: 'Operations' },
  { id: 'payouts', label: 'Payouts', group: 'Business' },
  { id: 'performance', label: 'Performance', group: 'Business' },
  { id: 'settings', label: 'Settings', group: 'Account' },
];

@Component({
  selector: 'app-contractor-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, NotificationBellComponent],
  templateUrl: './contractor-shell.component.html',
  styleUrl: './contractor-shell.component.scss',
})
export class ContractorShellComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  readonly comms = inject(InAppCommsService);
  private sub?: Subscription;

  tab: ContractorTabId = 'dashboard';
  readonly tabs = TABS;

  get groups(): string[] {
    return [...new Set(this.tabs.map((t) => t.group))];
  }

  get messageBadge(): string | null {
    return formatBadgeCount(this.comms.unreadMessages());
  }

  ngOnInit(): void {
    this.comms.start();
    this.sync(this.router.url);
    this.sub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.sync(e.urlAfterRedirects));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  tabsFor(group: string) {
    return this.tabs.filter((t) => t.group === group);
  }

  refreshCounts(): void {
    void this.comms.refresh(true);
  }

  private sync(url: string): void {
    const seg = url.split('?')[0].split('/').filter(Boolean)[1] as ContractorTabId | undefined;
    if (seg && this.tabs.some((t) => t.id === seg)) this.tab = seg;
    else this.tab = 'dashboard';
  }
}
