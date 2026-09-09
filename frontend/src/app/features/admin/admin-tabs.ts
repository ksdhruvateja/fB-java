import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AuthUser } from '../../core/models/auth.model';
import { ManagedJob } from '../../core/models/managed-job.model';
import { ServiceOffering } from '../../core/models/service-offering.model';
import { AdminApiService } from '../../core/services/admin-api.service';
import { AiApiService } from '../../core/services/ai-api.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton.component';
import { MessagingPanelComponent } from '../../shared/components/messaging-panel.component';

@Component({
  selector: 'app-admin-overview-tab',
  standalone: true,
  imports: [LoadingSkeletonComponent],
  template: `
    <section>
      <h2>Overview</h2>
      @if (loading) { <app-loading-skeleton /> }
      @else {
        <div class="stats">
          <div><strong>{{ queueCount }}</strong><span>Work queue</span></div>
          <div><strong>{{ jobCount }}</strong><span>Managed jobs</span></div>
          <div><strong>{{ fixera }}</strong><span>Fixera</span></div>
        </div>
      }
    </section>
  `,
  styles: `
    h2 { text-transform: uppercase; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-top: 1rem; }
    .stats div { padding: 1rem; border: 1px solid var(--border); background: var(--card); display: grid; gap: 0.25rem; }
    strong { font-size: 1.5rem; font-family: var(--font-display); }
    span { font-size: 0.75rem; text-transform: uppercase; color: var(--muted-foreground); }
  `,
})
export class AdminOverviewTabComponent implements OnInit {
  private readonly admin = inject(AdminApiService);
  private readonly ai = inject(AiApiService);
  loading = true;
  queueCount = 0;
  jobCount = 0;
  fixera = '—';

  async ngOnInit(): Promise<void> {
    try {
      const [q, jobs, status] = await Promise.all([
        this.admin.workQueue(),
        this.admin.listManagedJobs(),
        this.ai.fixeraStatus(),
      ]);
      this.queueCount = (q.jobs || q.items || []).length;
      this.jobCount = jobs.jobs.length;
      this.fixera = status.configured ? `${status.provider || 'ready'}` : 'offline';
    } finally {
      this.loading = false;
    }
  }
}

@Component({
  selector: 'app-admin-work-queue-tab',
  standalone: true,
  imports: [FormsModule, LoadingSkeletonComponent, EmptyStateComponent],
  template: `
    <section>
      <h2>Work queue</h2>
      <div class="filters">
        <input [(ngModel)]="filter" placeholder="Filter by title, status, id…" />
      </div>
      @if (msg) { <p class="ok">{{ msg }}</p> }
      @if (error) { <p class="err">{{ error }}</p> }
      @if (loading) { <app-loading-skeleton /> }
      @else if (!filtered.length) {
        <app-empty-state title="Queue empty" body="No jobs match the current filter." />
      } @else {
        <ul>
          @for (j of filtered; track j.id) {
            <li>
              <div>
                <strong>{{ j.title || j.category || ('Job #' + j.id) }}</strong>
                <span>{{ j.status }} · #{{ j.id }}</span>
              </div>
              <div class="actions">
                <input [(ngModel)]="contractorIds[j.id]" placeholder="Contractor user id" />
                <button type="button" class="fb-btn fb-btn-ghost" [disabled]="busyId === j.id" (click)="invite(j)">Invite</button>
                <button type="button" class="fb-btn fb-btn-primary" [disabled]="busyId === j.id" (click)="assign(j)">Assign</button>
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    h2 { text-transform: uppercase; }
    .filters { margin: 0.75rem 0; }
    .filters input, .actions input { padding: 0.55rem 0.65rem; border: 1px solid var(--border); background: var(--input-background); }
    .filters input { width: min(100%, 24rem); }
    ul { list-style: none; padding: 0; display: grid; gap: 0.55rem; }
    li { padding: 0.85rem; border: 1px solid var(--border); background: var(--card); display: grid; gap: 0.55rem; }
    span { display: block; font-size: 0.8rem; color: var(--muted-foreground); text-transform: capitalize; }
    .actions { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
    .actions .fb-btn { padding: 0.4rem 0.65rem; font-size: 0.7rem; }
    .ok { color: #1a7a3c; } .err { color: var(--destructive); }
  `,
})
export class AdminWorkQueueTabComponent implements OnInit {
  private readonly admin = inject(AdminApiService);
  loading = true;
  error = '';
  msg = '';
  filter = '';
  jobs: ManagedJob[] = [];
  contractorIds: Record<number, string> = {};
  busyId: number | null = null;

  get filtered(): ManagedJob[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) return this.jobs;
    return this.jobs.filter((j) =>
      `${j.id} ${j.title} ${j.status} ${j.category}`.toLowerCase().includes(q)
    );
  }

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading = true;
    try {
      const res = await this.admin.workQueue();
      this.jobs = res.jobs || res.items || [];
      if (!this.jobs.length) {
        const all = await this.admin.listManagedJobs();
        this.jobs = all.jobs || [];
      }
      if (!res.ok && !this.jobs.length) this.error = res.message || 'Could not load queue.';
    } finally {
      this.loading = false;
    }
  }

  async invite(job: ManagedJob): Promise<void> {
    this.busyId = job.id;
    this.error = '';
    this.msg = '';
    try {
      const contractorUserId = Number(this.contractorIds[job.id] || 0) || undefined;
      const res = await this.admin.invite(job.id, contractorUserId ? { contractorUserId } : {});
      if (!res.ok) this.error = res.message || 'Invite failed.';
      else {
        this.msg = `Invite sent for job #${job.id}.`;
        await this.reload();
      }
    } finally {
      this.busyId = null;
    }
  }

  async assign(job: ManagedJob): Promise<void> {
    this.busyId = job.id;
    this.error = '';
    this.msg = '';
    try {
      const contractorUserId = Number(this.contractorIds[job.id] || 0);
      if (!contractorUserId) {
        this.error = 'Enter a contractor user id to assign.';
        return;
      }
      const res = await this.admin.assign(job.id, { contractorUserId });
      if (!res.ok) this.error = res.message || 'Assign failed.';
      else {
        this.msg = `Assigned job #${job.id}.`;
        await this.reload();
      }
    } finally {
      this.busyId = null;
    }
  }
}

@Component({
  selector: 'app-admin-quotes-tab',
  standalone: true,
  imports: [FormsModule, LoadingSkeletonComponent, EmptyStateComponent],
  template: `
    <section>
      <h2>Quotes</h2>
      <div class="filters">
        <input [(ngModel)]="q" placeholder="Search quotes" />
        <button type="button" class="fb-btn fb-btn-ghost" (click)="reload()">Refresh</button>
      </div>
      @if (loading) { <app-loading-skeleton /> }
      @else if (!quotes.length) {
        <app-empty-state title="No quotes" body="Create a proposal from a managed job below." />
      } @else {
        <ul>
          @for (row of quotes; track $index) {
            <li>
              <strong>{{ quoteLabel(row) }}</strong>
              <span>{{ quoteStatus(row) }}</span>
            </li>
          }
        </ul>
      }
      <h3>Quote builder</h3>
      <form class="builder" (ngSubmit)="saveProposal()">
        <div class="fb-field"><label>Job id</label><input [(ngModel)]="jobId" name="jobId" /></div>
        <div class="fb-field"><label>Scope summary</label><textarea [(ngModel)]="scope" name="scope" rows="3"></textarea></div>
        <div class="fb-field"><label>Retail amount</label><input type="number" [(ngModel)]="amount" name="amount" /></div>
        <button class="fb-btn fb-btn-primary" type="submit" [disabled]="busy">{{ busy ? 'Saving…' : 'Save proposal' }}</button>
      </form>
      @if (msg) { <p class="ok">{{ msg }}</p> }
      @if (error) { <p class="err">{{ error }}</p> }
    </section>
  `,
  styles: `
    h2, h3 { text-transform: uppercase; }
    .filters { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 0.75rem 0; }
    .filters input { flex: 1; min-width: 12rem; padding: 0.55rem; border: 1px solid var(--border); }
    ul { list-style: none; padding: 0; display: grid; gap: 0.45rem; }
    li { padding: 0.75rem; border: 1px solid var(--border); display: grid; gap: 0.15rem; }
    span { font-size: 0.8rem; color: var(--muted-foreground); }
    .builder { display: grid; gap: 0.55rem; max-width: 28rem; margin-top: 0.75rem; }
    .ok { color: #1a7a3c; } .err { color: var(--destructive); }
  `,
})
export class AdminQuotesTabComponent implements OnInit {
  private readonly admin = inject(AdminApiService);
  loading = true;
  busy = false;
  error = '';
  msg = '';
  q = '';
  quotes: unknown[] = [];
  jobId = '';
  scope = '';
  amount: number | null = null;

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading = true;
    try {
      const res = await this.admin.listQuotes({ q: this.q || undefined });
      this.quotes = res.quotes || [];
      if (!res.ok && !this.quotes.length) this.error = res.message || 'Could not load quotes.';
    } finally {
      this.loading = false;
    }
  }

  quoteLabel(row: unknown): string {
    const r = row as { id?: string | number; title?: string; jobId?: number };
    return r.title || `Quote ${r.id || r.jobId || ''}`;
  }

  quoteStatus(row: unknown): string {
    return String((row as { status?: string }).status || 'draft');
  }

  async saveProposal(): Promise<void> {
    const id = Number(this.jobId);
    if (!Number.isFinite(id) || id <= 0 || this.busy) return;
    this.busy = true;
    this.error = '';
    this.msg = '';
    try {
      await this.admin.quoteBuilder(id);
      const res = await this.admin.saveProposal(id, {
        scopeSummary: this.scope,
        retailAmount: this.amount,
      });
      if (!res.ok) this.error = res.message || 'Could not save proposal.';
      else {
        this.msg = 'Proposal saved.';
        await this.reload();
      }
    } finally {
      this.busy = false;
    }
  }
}

@Component({
  selector: 'app-admin-finance-tab',
  standalone: true,
  imports: [FormsModule, LoadingSkeletonComponent],
  template: `
    <section>
      <h2>Finance</h2>
      <div class="fb-seg">
        <button type="button" [class.active]="tab === 'payouts'" (click)="tab = 'payouts'">Payouts</button>
        <button type="button" [class.active]="tab === 'manual'" (click)="tab = 'manual'">Manual payment</button>
      </div>
      @if (msg) { <p class="ok">{{ msg }}</p> }
      @if (error) { <p class="err">{{ error }}</p> }
      @if (tab === 'payouts') {
        @if (loading) { <app-loading-skeleton /> }
        @else {
          <ul>
            @for (p of payouts; track $index) {
              <li>
                <div>
                  <strong>{{ payoutLabel(p) }}</strong>
                  <span>{{ payoutStatus(p) }} · {{ money(p) }}</span>
                </div>
                <div class="actions">
                  <button type="button" class="fb-btn fb-btn-primary" (click)="approve(p)">Approve</button>
                  <button type="button" class="fb-btn fb-btn-ghost" (click)="adjust(p)">Adjust -10%</button>
                </div>
              </li>
            }
          </ul>
        }
      } @else {
        <form class="form" (ngSubmit)="manual()">
          <div class="fb-field"><label>Job id</label><input [(ngModel)]="manualJobId" name="jobId" /></div>
          <div class="fb-field"><label>Amount</label><input type="number" [(ngModel)]="manualAmount" name="amount" /></div>
          <div class="fb-field"><label>Note</label><input [(ngModel)]="manualNote" name="note" /></div>
          <button class="fb-btn fb-btn-primary" type="submit" [disabled]="busy">Record payment</button>
        </form>
      }
    </section>
  `,
  styles: `
    h2 { text-transform: uppercase; }
    ul { list-style: none; padding: 0; display: grid; gap: 0.5rem; }
    li { padding: 0.85rem; border: 1px solid var(--border); display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem; }
    span { display: block; font-size: 0.8rem; color: var(--muted-foreground); }
    .actions { display: flex; gap: 0.35rem; }
    .actions .fb-btn { padding: 0.4rem 0.65rem; font-size: 0.68rem; }
    .form { display: grid; gap: 0.55rem; max-width: 24rem; }
    .ok { color: #1a7a3c; } .err { color: var(--destructive); }
  `,
})
export class AdminFinanceTabComponent implements OnInit {
  private readonly admin = inject(AdminApiService);
  tab: 'payouts' | 'manual' = 'payouts';
  loading = true;
  busy = false;
  error = '';
  msg = '';
  payouts: unknown[] = [];
  manualJobId = '';
  manualAmount: number | null = null;
  manualNote = '';

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading = true;
    try {
      const res = await this.admin.listPayouts();
      this.payouts = res.payouts || [];
      if (!res.ok) this.error = res.message || 'Could not load payouts.';
    } finally {
      this.loading = false;
    }
  }

  payoutLabel(p: unknown): string {
    const r = p as { id?: number; jobId?: number };
    return `Payout #${r.id || '—'} (job ${r.jobId || '—'})`;
  }

  payoutStatus(p: unknown): string {
    return String((p as { status?: string }).status || 'pending');
  }

  money(p: unknown): string {
    const n = Number((p as { amount?: number }).amount || 0);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }

  payoutId(p: unknown): number {
    return Number((p as { id?: number }).id || 0);
  }

  async approve(p: unknown): Promise<void> {
    const id = this.payoutId(p);
    if (!id) return;
    const res = await this.admin.approvePayout(id);
    if (!res.ok) this.error = res.message || 'Approve failed.';
    else {
      this.msg = 'Payout approved.';
      await this.reload();
    }
  }

  async adjust(p: unknown): Promise<void> {
    const id = this.payoutId(p);
    if (!id) return;
    const amount = Number((p as { amount?: number }).amount || 0) * 0.9;
    const res = await this.admin.adjustPayout(id, { amount, reason: 'manual adjustment' });
    if (!res.ok) this.error = res.message || 'Adjust failed.';
    else {
      this.msg = 'Payout adjusted.';
      await this.reload();
    }
  }

  async manual(): Promise<void> {
    this.busy = true;
    this.error = '';
    this.msg = '';
    try {
      const res = await this.admin.manualPayment({
        jobId: Number(this.manualJobId) || undefined,
        amount: this.manualAmount,
        note: this.manualNote,
      });
      if (!res.ok) this.error = res.message || 'Manual payment failed.';
      else this.msg = 'Manual payment recorded.';
    } finally {
      this.busy = false;
    }
  }
}

@Component({
  selector: 'app-admin-disputes-tab',
  standalone: true,
  imports: [FormsModule, LoadingSkeletonComponent, EmptyStateComponent],
  template: `
    <section>
      <h2>Disputes</h2>
      @if (loading) { <app-loading-skeleton /> }
      @else if (!disputes.length) {
        <app-empty-state title="No disputes" body="Open disputes will list here for resolution." />
      } @else {
        <ul>
          @for (d of disputes; track $index) {
            <li>
              <div>
                <strong>{{ disputeLabel(d) }}</strong>
                <span>{{ disputeStatus(d) }}</span>
              </div>
              <button type="button" class="fb-btn fb-btn-primary" (click)="resolve(d)">Resolve</button>
            </li>
          }
        </ul>
      }
      @if (msg) { <p class="ok">{{ msg }}</p> }
      @if (error) { <p class="err">{{ error }}</p> }
    </section>
  `,
  styles: `
    h2 { text-transform: uppercase; }
    ul { list-style: none; padding: 0; display: grid; gap: 0.5rem; }
    li { padding: 0.85rem; border: 1px solid var(--border); display: flex; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; align-items: center; }
    span { display: block; font-size: 0.8rem; color: var(--muted-foreground); }
    .fb-btn { padding: 0.4rem 0.7rem; font-size: 0.7rem; }
    .ok { color: #1a7a3c; } .err { color: var(--destructive); }
  `,
})
export class AdminDisputesTabComponent implements OnInit {
  private readonly admin = inject(AdminApiService);
  loading = true;
  disputes: unknown[] = [];
  msg = '';
  error = '';

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.admin.listDisputes();
      this.disputes = res.disputes || [];
      if (!res.ok) this.error = res.message || 'Could not load disputes.';
    } finally {
      this.loading = false;
    }
  }

  disputeLabel(d: unknown): string {
    const r = d as { id?: number; jobId?: number; reason?: string };
    return r.reason || `Dispute #${r.id || '—'} (job ${r.jobId || '—'})`;
  }

  disputeStatus(d: unknown): string {
    return String((d as { status?: string }).status || 'open');
  }

  async resolve(d: unknown): Promise<void> {
    const id = Number((d as { id?: number }).id || 0);
    if (!id) return;
    const res = await this.admin.resolveDispute(id, { action: 'resolve', note: 'Resolved by admin' });
    if (!res.ok) this.error = res.message || 'Resolve failed.';
    else {
      this.msg = 'Dispute resolved.';
      const refreshed = await this.admin.listDisputes();
      this.disputes = refreshed.disputes || [];
    }
  }
}

@Component({
  selector: 'app-admin-support-tab',
  standalone: true,
  imports: [FormsModule, LoadingSkeletonComponent, EmptyStateComponent],
  template: `
    <section>
      <h2>Support tickets</h2>
      @if (loading) { <app-loading-skeleton /> }
      @else if (!tickets.length) {
        <app-empty-state title="Queue clear" body="No support tickets in the admin queue." />
      } @else {
        <ul>
          @for (t of tickets; track $index) {
            <li>
              <div>
                <strong>{{ ticketLabel(t) }}</strong>
                <span>{{ ticketStatus(t) }} · {{ ticketNumber(t) }}</span>
              </div>
              <div class="reply">
                <input [(ngModel)]="replies[ticketNumber(t)]" placeholder="Reply…" />
                <button type="button" class="fb-btn fb-btn-primary" (click)="reply(t)">Send</button>
              </div>
            </li>
          }
        </ul>
      }
      @if (msg) { <p class="ok">{{ msg }}</p> }
      @if (error) { <p class="err">{{ error }}</p> }
    </section>
  `,
  styles: `
    h2 { text-transform: uppercase; }
    ul { list-style: none; padding: 0; display: grid; gap: 0.55rem; }
    li { padding: 0.85rem; border: 1px solid var(--border); display: grid; gap: 0.5rem; }
    span { display: block; font-size: 0.8rem; color: var(--muted-foreground); }
    .reply { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .reply input { flex: 1; min-width: 10rem; padding: 0.5rem; border: 1px solid var(--border); }
    .fb-btn { padding: 0.4rem 0.7rem; font-size: 0.7rem; }
    .ok { color: #1a7a3c; } .err { color: var(--destructive); }
  `,
})
export class AdminSupportTabComponent implements OnInit {
  private readonly admin = inject(AdminApiService);
  loading = true;
  tickets: unknown[] = [];
  replies: Record<string, string> = {};
  msg = '';
  error = '';

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.admin.adminSupportTickets();
      this.tickets = res.tickets || [];
      if (!res.ok) this.error = res.message || 'Could not load tickets.';
    } finally {
      this.loading = false;
    }
  }

  ticketNumber(t: unknown): string {
    return String((t as { ticketNumber?: string }).ticketNumber || '');
  }

  ticketLabel(t: unknown): string {
    return String((t as { subject?: string }).subject || this.ticketNumber(t) || 'Ticket');
  }

  ticketStatus(t: unknown): string {
    return String((t as { status?: string }).status || 'open');
  }

  async reply(t: unknown): Promise<void> {
    const num = this.ticketNumber(t);
    const message = (this.replies[num] || '').trim();
    if (!num || !message) return;
    const res = await this.admin.replySupportTicket(num, message);
    if (!res.ok) this.error = res.message || 'Reply failed.';
    else {
      this.msg = 'Reply sent.';
      this.replies[num] = '';
    }
  }
}

@Component({
  selector: 'app-admin-homeowners-tab',
  standalone: true,
  imports: [LoadingSkeletonComponent, EmptyStateComponent],
  template: `
    <section>
      <h2>Homeowners</h2>
      @if (loading) { <app-loading-skeleton /> }
      @else if (!users.length) {
        <app-empty-state title="Directory unavailable" [body]="error || 'No homeowner users returned.'" />
      } @else {
        <ul>
          @for (u of users; track u.id || u.email) {
            <li>
              <strong>{{ u.name || u.email }}</strong>
              <span>{{ u.email }} · {{ u.planCode || 'free' }}</span>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    h2 { text-transform: uppercase; }
    ul { list-style: none; padding: 0; display: grid; gap: 0.45rem; }
    li { padding: 0.8rem; border: 1px solid var(--border); display: grid; gap: 0.15rem; }
    span { font-size: 0.8rem; color: var(--muted-foreground); }
  `,
})
export class AdminHomeownersTabComponent implements OnInit {
  private readonly admin = inject(AdminApiService);
  loading = true;
  error = '';
  users: AuthUser[] = [];

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.admin.listUsers('homeowner');
      this.users = (res.users || []).filter((u) => u.role === 'homeowner' || !u.role);
      if (!res.ok) this.error = res.message || '';
      if (!this.users.length) {
        const jobs = await this.admin.listManagedJobs();
        const names = new Map<string, AuthUser>();
        for (const j of jobs.jobs || []) {
          const key = String(j.homeownerUserId || j.contactName || j.id);
          if (!names.has(key)) {
            names.set(key, {
              role: 'homeowner',
              name: j.contactName || `Homeowner ${j.homeownerUserId || ''}`,
              email: '',
              id: j.homeownerUserId || undefined,
            });
          }
        }
        this.users = [...names.values()];
      }
    } finally {
      this.loading = false;
    }
  }
}

@Component({
  selector: 'app-admin-contractors-tab',
  standalone: true,
  imports: [LoadingSkeletonComponent, EmptyStateComponent],
  template: `
    <section>
      <h2>Contractors</h2>
      @if (loading) { <app-loading-skeleton /> }
      @else if (!users.length) {
        <app-empty-state title="Directory unavailable" [body]="error || 'No contractor users returned.'" />
      } @else {
        <ul>
          @for (u of users; track u.id || u.email) {
            <li>
              <strong>{{ u.companyName || u.name || u.email }}</strong>
              <span>{{ u.email }} · {{ u.complianceStatus || 'unknown' }} · {{ u.trade || 'trade n/a' }}</span>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    h2 { text-transform: uppercase; }
    ul { list-style: none; padding: 0; display: grid; gap: 0.45rem; }
    li { padding: 0.8rem; border: 1px solid var(--border); display: grid; gap: 0.15rem; }
    span { font-size: 0.8rem; color: var(--muted-foreground); }
  `,
})
export class AdminContractorsTabComponent implements OnInit {
  private readonly admin = inject(AdminApiService);
  loading = true;
  error = '';
  users: AuthUser[] = [];

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.admin.listUsers('contractor');
      this.users = (res.users || []).filter((u) => u.role === 'contractor' || !u.role);
      if (!res.ok) this.error = res.message || '';
      if (!this.users.length) {
        const jobs = await this.admin.listManagedJobs();
        const names = new Map<string, AuthUser>();
        for (const j of jobs.jobs || []) {
          if (!j.contractorName) continue;
          const key = j.contractorName;
          if (!names.has(key)) {
            names.set(key, {
              role: 'contractor',
              name: j.contractorName,
              email: '',
              companyName: j.contractorName,
            });
          }
        }
        this.users = [...names.values()];
      }
    } finally {
      this.loading = false;
    }
  }
}

@Component({
  selector: 'app-admin-services-tab',
  standalone: true,
  imports: [FormsModule, LoadingSkeletonComponent],
  template: `
    <section>
      <h2>Services admin</h2>
      @if (loading) { <app-loading-skeleton /> }
      @else {
        <ul>
          @for (o of offerings; track o.id) {
            <li>
              <strong>{{ o.name }}</strong>
              <div class="flags">
                <label><input type="checkbox" [(ngModel)]="o.diyEligible" /> DIY</label>
                <label><input type="checkbox" [(ngModel)]="o.aiAssessmentEligible" /> AI</label>
                <label><input type="checkbox" [(ngModel)]="o.subscriptionEligible" /> Subscribe</label>
                <label><input type="checkbox" [(ngModel)]="o.oneTimeProfessional" /> Pro</label>
                <label><input type="checkbox" [(ngModel)]="o.active" /> Active</label>
              </div>
              <button type="button" class="fb-btn fb-btn-ghost" (click)="save(o)">Save</button>
            </li>
          }
        </ul>
      }
      @if (msg) { <p class="ok">{{ msg }}</p> }
      @if (error) { <p class="err">{{ error }}</p> }
    </section>
  `,
  styles: `
    h2 { text-transform: uppercase; }
    ul { list-style: none; padding: 0; display: grid; gap: 0.55rem; }
    li { padding: 0.85rem; border: 1px solid var(--border); display: grid; gap: 0.5rem; }
    .flags { display: flex; flex-wrap: wrap; gap: 0.65rem; font-size: 0.85rem; }
    .fb-btn { justify-self: start; padding: 0.4rem 0.7rem; font-size: 0.7rem; }
    .ok { color: #1a7a3c; } .err { color: var(--destructive); }
  `,
})
export class AdminServicesTabComponent implements OnInit {
  private readonly admin = inject(AdminApiService);
  loading = true;
  offerings: ServiceOffering[] = [];
  msg = '';
  error = '';

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.admin.listAdminServices();
      this.offerings = res.offerings || [];
      if (!res.ok) this.error = res.message || 'Could not load services.';
    } finally {
      this.loading = false;
    }
  }

  async save(o: ServiceOffering): Promise<void> {
    const res = await this.admin.updateService(o.id, {
      diyEligible: o.diyEligible,
      aiAssessmentEligible: o.aiAssessmentEligible,
      subscriptionEligible: o.subscriptionEligible,
      oneTimeProfessional: o.oneTimeProfessional,
      active: o.active,
    });
    if (!res.ok) this.error = res.message || 'Save failed.';
    else this.msg = `Saved ${o.name}.`;
  }
}

@Component({
  selector: 'app-admin-settings-tab',
  standalone: true,
  imports: [FormsModule, LoadingSkeletonComponent],
  template: `
    <section>
      <h2>Platform settings</h2>
      @if (loading) { <app-loading-skeleton /> }
      @else {
        <h3>HomeCare</h3>
        <pre class="cfg">{{ configPreview }}</pre>
        <div class="fb-field">
          <label>Activation fee</label>
          <input type="number" [(ngModel)]="activationFee" />
        </div>
        <button type="button" class="fb-btn fb-btn-primary" [disabled]="busy" (click)="saveFee()">
          Save activation fee
        </button>

        <h3>Subscription plans</h3>
        <ul>
          @for (p of plans; track $index) {
            <li>{{ planLabel(p) }}</li>
          }
        </ul>
        <form class="form" (ngSubmit)="createPlan()">
          <div class="fb-field"><label>Plan code</label><input [(ngModel)]="planCode" name="code" /></div>
          <div class="fb-field"><label>Name</label><input [(ngModel)]="planName" name="name" /></div>
          <div class="fb-field"><label>Monthly price</label><input type="number" [(ngModel)]="planPrice" name="price" /></div>
          <button class="fb-btn fb-btn-ghost" type="submit" [disabled]="busy">Create / update plan</button>
        </form>

        <h3>Fixera status</h3>
        <dl>
          <div><dt>Configured</dt><dd>{{ fixera.configured ? 'Yes' : 'No' }}</dd></div>
          <div><dt>Provider</dt><dd>{{ fixera.provider || '—' }}</dd></div>
          <div><dt>Model</dt><dd>{{ fixera.model || '—' }}</dd></div>
        </dl>

        <button type="button" class="fb-btn fb-btn-primary" (click)="logout()">Log out</button>
      }
      @if (msg) { <p class="ok">{{ msg }}</p> }
      @if (error) { <p class="err">{{ error }}</p> }
    </section>
  `,
  styles: `
    h2, h3 { text-transform: uppercase; }
    .cfg { background: var(--secondary); padding: 0.75rem; overflow: auto; font-size: 0.75rem; max-height: 12rem; }
    .form, .fb-field { max-width: 24rem; margin: 0.75rem 0; display: grid; gap: 0.45rem; }
    ul { list-style: none; padding: 0; display: grid; gap: 0.35rem; }
    li { padding: 0.65rem; border: 1px solid var(--border); }
    dl { display: grid; gap: 0.45rem; margin: 0.75rem 0 1.25rem; }
    dl div { padding: 0.75rem; border: 1px solid var(--border); }
    dt { font-size: 0.7rem; text-transform: uppercase; color: var(--muted-foreground); }
    dd { margin: 0.15rem 0 0; font-weight: 600; }
    .ok { color: #1a7a3c; } .err { color: var(--destructive); }
  `,
})
export class AdminSettingsTabComponent implements OnInit {
  private readonly admin = inject(AdminApiService);
  private readonly ai = inject(AiApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  loading = true;
  busy = false;
  error = '';
  msg = '';
  configPreview = '';
  activationFee = 0;
  plans: unknown[] = [];
  planCode = '';
  planName = '';
  planPrice: number | null = null;
  fixera: { configured?: boolean; provider?: string; model?: string } = {};

  async ngOnInit(): Promise<void> {
    try {
      const [settings, fee, plans, status] = await Promise.all([
        this.admin.homecareSettings(),
        this.admin.getActivationFee(),
        this.admin.listSubscriptionPlans(),
        this.ai.fixeraStatus(),
      ]);
      this.configPreview = JSON.stringify(settings.config || settings.pricing || {}, null, 2);
      this.activationFee = Number(fee.activationFee || 0);
      this.plans = plans.plans || [];
      this.fixera = status;
    } finally {
      this.loading = false;
    }
  }

  planLabel(p: unknown): string {
    const r = p as { code?: string; planCode?: string; name?: string; priceMonthly?: number };
    return `${r.name || r.code || r.planCode} · $${r.priceMonthly ?? '—'}`;
  }

  async saveFee(): Promise<void> {
    this.busy = true;
    try {
      const res = await this.admin.putActivationFee(Number(this.activationFee) || 0);
      if (!res.ok) this.error = res.message || 'Could not save fee.';
      else this.msg = 'Activation fee saved.';
    } finally {
      this.busy = false;
    }
  }

  async createPlan(): Promise<void> {
    if (!this.planCode.trim() || this.busy) return;
    this.busy = true;
    try {
      const res = await this.admin.saveSubscriptionPlan({
        code: this.planCode.trim(),
        planCode: this.planCode.trim(),
        name: this.planName.trim() || this.planCode.trim(),
        priceMonthly: this.planPrice,
      });
      if (!res.ok) this.error = res.message || 'Could not save plan.';
      else {
        this.msg = 'Plan saved.';
        const plans = await this.admin.listSubscriptionPlans();
        this.plans = plans.plans || [];
      }
    } finally {
      this.busy = false;
    }
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/');
  }
}

@Component({
  selector: 'app-admin-messages-tab',
  standalone: true,
  imports: [MessagingPanelComponent],
  template: `
    <section>
      <h2>Messages</h2>
      <p class="muted">Platform communications</p>
      <app-messaging-panel [open]="true" />
    </section>
  `,
  styles: `h2 { text-transform: uppercase; } .muted { color: var(--muted-foreground); }`,
})
export class AdminMessagesTabComponent {}
