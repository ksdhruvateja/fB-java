import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ManagedJob } from '../../../core/models/managed-job.model';
import { PropertyContextService } from '../../../core/services/property-context.service';
import { ManagedJobsApiService } from '../../../core/services/managed-jobs-api.service';
import { PropertyApiService } from '../../../core/services/property-api.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { LoadingSkeletonComponent } from '../../../shared/components/loading-skeleton.component';

type JobSegment = 'active' | 'quotes' | 'upcoming' | 'history';

const QUOTE_STATUSES = new Set([
  'awaiting_bid',
  'bid_received',
  'proposal_sent',
  'awaiting_customer_approval',
]);
const UPCOMING_STATUSES = new Set(['approved', 'scheduled', 'contractor_en_route']);
const HISTORY_STATUSES = new Set([
  'work_completed',
  'customer_review_pending',
  'admin_review_pending',
  'payout_pending',
  'paid_out',
  'closed',
  'canceled',
  'refunded',
  'disputed',
]);

@Component({
  selector: 'app-homeowner-jobs',
  standalone: true,
  imports: [RouterLink, LoadingSkeletonComponent, EmptyStateComponent],
  templateUrl: './homeowner-jobs.component.html',
  styleUrl: './homeowner-jobs.component.scss',
})
export class HomeownerJobsComponent implements OnInit {
  private readonly api = inject(ManagedJobsApiService);
  private readonly propertyApi = inject(PropertyApiService);
  private readonly propertyCtx = inject(PropertyContextService);

  loading = true;
  error = '';
  allJobs: ManagedJob[] = [];
  segment: JobSegment = 'active';
  cancellingId: number | null = null;
  deletingId: number | null = null;

  readonly segments: { id: JobSegment; label: string }[] = [
    { id: 'active', label: 'Active' },
    { id: 'quotes', label: 'Quotes' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'history', label: 'History' },
  ];

  async ngOnInit(): Promise<void> {
    try {
      const props = await this.propertyApi.list();
      this.propertyCtx.setProperties(props.properties || []);
    } catch {
      /* ignore */
    }
    await this.reload();
  }

  get jobs(): ManagedJob[] {
    void this.propertyCtx.propertyId();
    const scoped = this.propertyCtx.filterByProperty(this.allJobs);
    return scoped.filter((j) => this.matchesSegment(j, this.segment));
  }

  setSegment(seg: JobSegment): void {
    this.segment = seg;
  }

  async reload(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const res = await this.api.listMine();
      if (!res.ok) {
        this.error = res.message || 'Could not load service requests.';
        this.allJobs = [];
      } else {
        this.allJobs = res.jobs || [];
      }
    } catch {
      this.error = 'Could not load service requests.';
      this.allJobs = [];
    } finally {
      this.loading = false;
    }
  }

  canCancel(job: ManagedJob): boolean {
    return !HISTORY_STATUSES.has(String(job.status));
  }

  canDelete(job: ManagedJob): boolean {
    const s = String(job.status);
    return s === 'draft' || s === 'canceled' || s === 'closed' || s === 'ai_review_complete';
  }

  async cancel(job: ManagedJob): Promise<void> {
    if (!this.canCancel(job) || this.cancellingId) return;
    this.cancellingId = job.id;
    try {
      const res = await this.api.cancel(job.id, {
        reasonCode: 'other',
        notes: 'Cancelled from portal',
      });
      if (!res.ok) this.error = res.message || 'Cancel failed.';
      else await this.reload();
    } finally {
      this.cancellingId = null;
    }
  }

  async deleteJob(job: ManagedJob, ev: Event): Promise<void> {
    ev.preventDefault();
    ev.stopPropagation();
    if (!this.canDelete(job) || this.deletingId) return;
    if (!window.confirm(`Delete request #${job.id}? This cannot be undone.`)) return;
    this.deletingId = job.id;
    try {
      const res = await this.api.delete(job.id);
      if (!res.ok) this.error = res.message || 'Delete failed.';
      else await this.reload();
    } finally {
      this.deletingId = null;
    }
  }

  private matchesSegment(job: ManagedJob, segment: JobSegment): boolean {
    const s = String(job.status);
    if (segment === 'quotes') return QUOTE_STATUSES.has(s);
    if (segment === 'upcoming') return UPCOMING_STATUSES.has(s);
    if (segment === 'history') return HISTORY_STATUSES.has(s);
    return !QUOTE_STATUSES.has(s) && !UPCOMING_STATUSES.has(s) && !HISTORY_STATUSES.has(s);
  }
}
