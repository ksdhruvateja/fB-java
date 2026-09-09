import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import {
  AdminApiService,
  AdminSearchHit,
  AdminSearchResults,
} from '../../core/services/admin-api.service';
import { InAppCommsService } from '../../core/services/in-app-comms.service';
import { NotificationBellComponent } from '../../shared/components/notification-bell.component';

export type AdminTabId =
  | 'overview'
  | 'work-queue'
  | 'quotes'
  | 'homeowners'
  | 'contractors'
  | 'finance'
  | 'disputes'
  | 'support-tickets'
  | 'services'
  | 'messages'
  | 'settings';

const GROUPS: { label?: string; items: { id: AdminTabId; label: string }[] }[] = [
  { items: [{ id: 'overview', label: 'Overview' }] },
  {
    label: 'Work',
    items: [
      { id: 'work-queue', label: 'Work Queue' },
      { id: 'quotes', label: 'Quotes' },
    ],
  },
  {
    label: 'People',
    items: [
      { id: 'homeowners', label: 'Homeowners' },
      { id: 'contractors', label: 'Contractors' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { id: 'finance', label: 'Finance' },
      { id: 'disputes', label: 'Disputes' },
    ],
  },
  {
    label: 'Support',
    items: [
      { id: 'support-tickets', label: 'Support tickets' },
      { id: 'messages', label: 'Messages' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { id: 'services', label: 'Services' },
      { id: 'settings', label: 'Settings' },
    ],
  },
];

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [FormsModule, RouterOutlet, RouterLink, NotificationBellComponent],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.scss',
})
export class AdminShellComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly adminApi = inject(AdminApiService);
  readonly comms = inject(InAppCommsService);
  private sub?: Subscription;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  tab: AdminTabId = 'overview';
  readonly groups = GROUPS;
  searchQ = '';
  searchBusy = false;
  searchError = '';
  searchOpen = false;
  searchResults: AdminSearchResults | null = null;

  ngOnInit(): void {
    this.comms.start();
    this.sync(this.router.url);
    this.sub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.sync(e.urlAfterRedirects));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  refreshCounts(): void {
    void this.comms.refresh(true);
  }

  onSearchInput(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const q = this.searchQ.trim();
    if (q.length < 2) {
      this.searchResults = null;
      this.searchOpen = false;
      this.searchError = '';
      return;
    }
    this.searchTimer = setTimeout(() => void this.runSearch(q), 280);
  }

  async runSearch(q = this.searchQ): Promise<void> {
    const query = q.trim();
    if (query.length < 2) return;
    this.searchBusy = true;
    this.searchError = '';
    this.searchOpen = true;
    try {
      const res = await this.adminApi.search(query);
      this.searchResults = res.results || null;
      if (!res.ok) this.searchError = res.message || 'Search failed.';
    } finally {
      this.searchBusy = false;
    }
  }

  hitGroups(): { key: string; label: string; hits: AdminSearchHit[] }[] {
    const r = this.searchResults;
    if (!r) return [];
    return (
      [
        { key: 'jobs', label: 'Jobs', hits: r.jobs },
        { key: 'homeowners', label: 'Homeowners', hits: r.homeowners },
        { key: 'contractors', label: 'Contractors', hits: r.contractors },
        { key: 'quotes', label: 'Quotes', hits: r.quotes },
        { key: 'invoices', label: 'Invoices', hits: r.invoices },
        { key: 'payments', label: 'Payments', hits: r.payments },
        { key: 'payouts', label: 'Payouts', hits: r.payouts },
        { key: 'tickets', label: 'Tickets', hits: r.tickets },
        { key: 'technicians', label: 'Technicians', hits: r.technicians },
      ] as const
    ).filter((g) => g.hits?.length);
  }

  openHit(hit: AdminSearchHit): void {
    this.searchOpen = false;
    const href = hit.href;
    let tab: string = 'work-queue';
    if (href && typeof href === 'object' && 'tab' in href) {
      tab = String((href as { tab?: string }).tab || 'work-queue');
    }
    const known = this.groups.flatMap((g) => g.items.map((i) => i.id));
    const dest = (known.includes(tab as AdminTabId) ? tab : 'work-queue') as AdminTabId;
    void this.router.navigate(['/admin', dest]);
  }

  closeSearch(): void {
    this.searchOpen = false;
  }

  private sync(url: string): void {
    const seg = url.split('?')[0].split('/').filter(Boolean)[1] as AdminTabId | undefined;
    const known = this.groups.flatMap((g) => g.items.map((i) => i.id));
    this.tab = seg && known.includes(seg) ? seg : 'overview';
  }
}
