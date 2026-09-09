import { Component, EventEmitter, Input, Output } from '@angular/core';

export type BottomNavId = 'home' | 'jobs' | 'request' | 'inbox' | 'more';
export type HomeownerTabId =
  | 'overview'
  | 'services'
  | 'jobs'
  | 'report'
  | 'inbox'
  | 'more'
  | 'properties'
  | 'payments'
  | 'profile'
  | 'help';

const PRIMARY = new Set<HomeownerTabId>(['overview', 'jobs', 'report', 'inbox', 'more']);

@Component({
  selector: 'app-homeowner-bottom-nav',
  standalone: true,
  templateUrl: './homeowner-bottom-nav.component.html',
  styleUrl: './homeowner-bottom-nav.component.scss',
})
export class HomeownerBottomNavComponent {
  @Input() tab: HomeownerTabId = 'overview';
  @Input() inboxBadge: string | null = null;
  @Output() home = new EventEmitter<void>();
  @Output() jobs = new EventEmitter<void>();
  @Output() request = new EventEmitter<void>();
  @Output() inbox = new EventEmitter<void>();
  @Output() more = new EventEmitter<void>();

  get active(): BottomNavId {
    if (this.tab === 'overview') return 'home';
    if (this.tab === 'jobs') return 'jobs';
    if (this.tab === 'report') return 'request';
    if (this.tab === 'inbox') return 'inbox';
    if (this.tab === 'more' || !PRIMARY.has(this.tab)) return 'more';
    return 'home';
  }

  on(id: BottomNavId): void {
    if (id === 'home') this.home.emit();
    else if (id === 'jobs') this.jobs.emit();
    else if (id === 'request') this.request.emit();
    else if (id === 'inbox') this.inbox.emit();
    else this.more.emit();
  }
}
