import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { JobInvitation, ManagedJob } from '../../core/models/managed-job.model';
import { ContractorApiService, ContractorEmployee } from '../../core/services/contractor-api.service';
import { ManagedJobsApiService } from '../../core/services/managed-jobs-api.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton.component';
import { MessagingPanelComponent } from '../../shared/components/messaging-panel.component';
import { compressImageFile } from '../../shared/utils/image-compress';

@Component({
  selector: 'app-contractor-dashboard-tab',
  standalone: true,
  imports: [RouterLink, LoadingSkeletonComponent],
  template: `
    <section>
      <h2>Dashboard</h2>
      <p class="muted">Welcome{{ name ? ', ' + name : '' }}. Open invitations and active jobs.</p>
      @if (loading) { <app-loading-skeleton [count]="3" /> }
      @else if (error) { <p class="err">{{ error }}</p> }
      @else {
        <div class="stats">
          <a routerLink="/contractor/invites"><strong>{{ invites }}</strong><span>Invites</span></a>
          <a routerLink="/contractor/jobs"><strong>{{ jobs }}</strong><span>Jobs</span></a>
          <a routerLink="/contractor/payouts"><strong>{{ payouts }}</strong><span>Payouts</span></a>
        </div>
      }
    </section>
  `,
  styles: `
    h2 { text-transform: uppercase; }
    .muted { color: var(--muted-foreground); }
    .err { color: var(--destructive); }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-top: 1rem; }
    .stats a {
      display: flex; flex-direction: column; gap: 0.25rem;
      padding: 1rem; background: var(--card); border: 1px solid var(--border);
    }
    .stats strong { font-size: 1.5rem; font-family: var(--font-display); }
    .stats span { font-size: 0.75rem; color: var(--muted-foreground); text-transform: uppercase; }
  `,
})
export class ContractorDashboardTabComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly jobsApi = inject(ManagedJobsApiService);
  loading = true;
  error = '';
  name = '';
  invites = 0;
  jobs = 0;
  payouts = 0;

  async ngOnInit(): Promise<void> {
    this.name = this.auth.currentUser()?.name || '';
    try {
      const [inv, jobRes, pay] = await Promise.all([
        this.jobsApi.listInvitations(),
        this.jobsApi.listMine(),
        this.jobsApi.listContractorPayouts(),
      ]);
      this.invites = inv.invitations?.length || 0;
      this.jobs = jobRes.jobs?.length || 0;
      this.payouts = pay.payouts?.length || 0;
      if (!inv.ok && !jobRes.ok && !pay.ok) this.error = 'Could not load contractor dashboard.';
    } catch {
      this.error = 'Could not load contractor dashboard.';
    } finally {
      this.loading = false;
    }
  }
}

@Component({
  selector: 'app-contractor-invites-tab',
  standalone: true,
  imports: [LoadingSkeletonComponent, EmptyStateComponent],
  template: `
    <section>
      <h2>Invitations</h2>
      @if (msg) { <p class="ok">{{ msg }}</p> }
      @if (error) { <p class="err">{{ error }}</p> }
      @if (loading) { <app-loading-skeleton /> }
      @else if (items.length === 0) {
        <app-empty-state title="No open invitations" body="New job invites from FixBridge ops will appear here." />
      } @else {
        <ul>
          @for (i of items; track i.id) {
            <li>
              <div>
                <strong>{{ i.title || i.category || ('Invite #' + i.id) }}</strong>
                <span>{{ i.status || 'pending' }}</span>
              </div>
              <div class="actions">
                <button type="button" class="fb-btn fb-btn-primary" [disabled]="busyId === i.id" (click)="respond(i, 'accept')">Accept</button>
                <button type="button" class="fb-btn fb-btn-ghost" [disabled]="busyId === i.id" (click)="respond(i, 'decline')">Decline</button>
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    h2 { text-transform: uppercase; }
    .err { color: var(--destructive); }
    .ok { color: #1a7a3c; }
    ul { list-style: none; margin: 1rem 0 0; padding: 0; display: grid; gap: 0.5rem; }
    li { padding: 0.9rem 1rem; background: var(--card); border: 1px solid var(--border); display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.75rem; align-items: center; }
    span { display: block; font-size: 0.8rem; color: var(--muted-foreground); text-transform: capitalize; }
    .actions { display: flex; gap: 0.4rem; }
    .actions .fb-btn { padding: 0.45rem 0.7rem; font-size: 0.7rem; }
  `,
})
export class ContractorInvitesTabComponent implements OnInit {
  private readonly api = inject(ManagedJobsApiService);
  loading = true;
  error = '';
  msg = '';
  items: JobInvitation[] = [];
  busyId: number | null = null;

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading = true;
    try {
      const res = await this.api.listInvitations();
      this.items = (res.invitations || []).filter((i) => {
        const s = String(i.status || 'pending').toLowerCase();
        return s === 'pending' || s === 'invited' || s === 'open';
      });
      if (!res.ok) this.error = res.message || 'Could not load invitations.';
    } catch {
      this.error = 'Could not load invitations.';
    } finally {
      this.loading = false;
    }
  }

  async respond(inv: JobInvitation, action: 'accept' | 'decline'): Promise<void> {
    this.busyId = inv.id;
    this.error = '';
    this.msg = '';
    try {
      const res = await this.api.respondInvitation(inv.id, action);
      if (!res.ok) {
        this.error = res.message || 'Could not respond.';
        return;
      }
      this.msg = action === 'accept' ? 'Invitation accepted.' : 'Invitation declined.';
      await this.reload();
    } finally {
      this.busyId = null;
    }
  }
}

@Component({
  selector: 'app-contractor-jobs-tab',
  standalone: true,
  imports: [FormsModule, LoadingSkeletonComponent, EmptyStateComponent],
  template: `
    <section>
      <h2>Jobs</h2>
      @if (error) { <p class="err">{{ error }}</p> }
      @if (msg) { <p class="ok">{{ msg }}</p> }
      @if (loading) { <app-loading-skeleton /> }
      @else if (jobs.length === 0) {
        <app-empty-state title="No assigned jobs" body="Accepted invitations become active jobs here." />
      } @else {
        <ul>
          @for (j of jobs; track j.id) {
            <li>
              <div>
                <strong>{{ j.title || j.category || ('Job #' + j.id) }}</strong>
                <span>{{ j.status }}</span>
              </div>
              <div class="actions">
                <button type="button" class="fb-btn fb-btn-ghost" [disabled]="busyId === j.id" (click)="act(j, 'travel')">Travel</button>
                <button type="button" class="fb-btn fb-btn-ghost" [disabled]="busyId === j.id" (click)="act(j, 'arrived')">Arrived</button>
                <button type="button" class="fb-btn fb-btn-ghost" [disabled]="busyId === j.id" (click)="act(j, 'started')">Started</button>
                <button type="button" class="fb-btn fb-btn-primary" [disabled]="busyId === j.id" (click)="act(j, 'complete')">Complete</button>
              </div>
              @if (employees.length) {
                <label class="assign">
                  Technician
                  <select [ngModel]="techMap[j.id] || ''" (ngModelChange)="assign(j, $event)">
                    <option value="">Unassigned</option>
                    @for (e of employees; track e.id) {
                      <option [value]="e.id">{{ e.name }}</option>
                    }
                  </select>
                </label>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    h2 { text-transform: uppercase; }
    .err { color: var(--destructive); } .ok { color: #1a7a3c; }
    ul { list-style: none; margin: 1rem 0 0; padding: 0; display: grid; gap: 0.65rem; }
    li { padding: 0.9rem 1rem; background: var(--card); border: 1px solid var(--border); display: grid; gap: 0.55rem; }
    span { font-size: 0.8rem; color: var(--muted-foreground); text-transform: capitalize; }
    .actions { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .actions .fb-btn { padding: 0.4rem 0.65rem; font-size: 0.68rem; }
    .assign { display: grid; gap: 0.25rem; font-size: 0.75rem; color: var(--muted-foreground); max-width: 16rem; }
  `,
})
export class ContractorJobsTabComponent implements OnInit {
  private readonly api = inject(ManagedJobsApiService);
  private readonly contractorApi = inject(ContractorApiService);
  loading = true;
  error = '';
  msg = '';
  jobs: ManagedJob[] = [];
  employees: ContractorEmployee[] = [];
  busyId: number | null = null;
  techMap: Record<number, string> = {};

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading = true;
    try {
      const [jobRes, empRes] = await Promise.all([
        this.api.listMine(),
        this.contractorApi.listEmployees(),
      ]);
      this.jobs = jobRes.jobs || [];
      this.employees = (empRes.employees || []).filter((e) => e.active !== false);
      if (!jobRes.ok) this.error = jobRes.message || 'Could not load jobs.';
    } catch {
      this.error = 'Could not load jobs.';
    } finally {
      this.loading = false;
    }
  }

  async act(job: ManagedJob, kind: 'travel' | 'arrived' | 'started' | 'complete'): Promise<void> {
    this.busyId = job.id;
    this.error = '';
    this.msg = '';
    try {
      const res =
        kind === 'travel'
          ? await this.api.markTravel(job.id)
          : kind === 'arrived'
            ? await this.api.markArrived(job.id)
            : kind === 'started'
              ? await this.api.markStarted(job.id)
              : await this.api.complete(job.id);
      if (!res.ok) {
        this.error = res.message || 'Action failed.';
        return;
      }
      this.msg = `Marked ${kind}.`;
      await this.reload();
    } finally {
      this.busyId = null;
    }
  }

  async assign(job: ManagedJob, employeeId: string): Promise<void> {
    this.techMap[job.id] = employeeId;
    if (!employeeId) return;
    const res = await this.contractorApi.assignTechnician(job.id, Number(employeeId));
    if (!res.ok) this.error = res.message || 'Could not assign technician.';
    else this.msg = 'Technician assigned.';
  }
}

@Component({
  selector: 'app-contractor-messages-tab',
  standalone: true,
  imports: [MessagingPanelComponent],
  template: `
    <section>
      <h2>Messages</h2>
      <p class="muted">Full messaging panel for job conversations.</p>
      <button type="button" class="fb-btn fb-btn-primary" (click)="open = true">Open messages</button>
      <app-messaging-panel [open]="open" (closed)="open = false" />
    </section>
  `,
  styles: `h2 { text-transform: uppercase; } .muted { color: var(--muted-foreground); } button { margin-top: 0.75rem; }`,
})
export class ContractorMessagesTabComponent {
  open = true;
}

@Component({
  selector: 'app-contractor-payouts-tab',
  standalone: true,
  imports: [LoadingSkeletonComponent, EmptyStateComponent],
  template: `
    <section>
      <h2>Payouts</h2>
      @if (loading) { <app-loading-skeleton /> }
      @else if (error) { <p class="err">{{ error }}</p> }
      @else if (payouts.length === 0) {
        <app-empty-state title="No payouts yet" body="Completed jobs appear here after ops approval." />
      } @else {
        <ul>
          @for (p of payouts; track $index) {
            <li>
              <strong>{{ label(p) }}</strong>
              <span>{{ status(p) }} · {{ money(p) }}</span>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    h2 { text-transform: uppercase; }
    .err { color: var(--destructive); }
    ul { list-style: none; margin: 1rem 0 0; padding: 0; display: grid; gap: 0.5rem; }
    li { padding: 0.9rem 1rem; background: var(--card); border: 1px solid var(--border); display: grid; gap: 0.2rem; }
    span { font-size: 0.8rem; color: var(--muted-foreground); }
  `,
})
export class ContractorPayoutsTabComponent implements OnInit {
  private readonly api = inject(ManagedJobsApiService);
  loading = true;
  error = '';
  payouts: unknown[] = [];

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.api.listContractorPayouts();
      this.payouts = res.payouts || [];
      if (!res.ok) this.error = res.message || 'Could not load payouts.';
    } catch {
      this.error = 'Could not load payouts.';
    } finally {
      this.loading = false;
    }
  }

  label(p: unknown): string {
    const row = p as { id?: number; jobId?: number; description?: string };
    return row.description || `Payout #${row.id || row.jobId || '—'}`;
  }

  status(p: unknown): string {
    return String((p as { status?: string }).status || 'pending');
  }

  money(p: unknown): string {
    const n = Number((p as { amount?: number; netAmount?: number }).amount
      ?? (p as { netAmount?: number }).netAmount
      ?? 0);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }
}

@Component({
  selector: 'app-contractor-compliance-tab',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section>
      <h2>Compliance</h2>
      <p class="muted">License, insurance, and document status.</p>
      <dl>
        <div><dt>Status</dt><dd>{{ status }}</dd></div>
        <div><dt>Dispatch eligible</dt><dd>{{ eligible }}</dd></div>
        <div><dt>License expires</dt><dd>{{ licenseExp }}</dd></div>
        <div><dt>Insurance expires</dt><dd>{{ insuranceExp }}</dd></div>
      </dl>
      <h3>Upload documents</h3>
      <div class="upload">
        <label>Kind
          <select [(ngModel)]="docKind">
            <option value="license">License</option>
            <option value="insurance">Insurance</option>
            <option value="id">ID</option>
            <option value="w9">W-9</option>
          </select>
        </label>
        <input type="file" accept="image/*,application/pdf" (change)="onFile($event)" />
        <button type="button" class="fb-btn fb-btn-primary" [disabled]="busy || !fileData" (click)="upload()">
          {{ busy ? 'Uploading…' : 'Upload' }}
        </button>
      </div>
      @if (msg) { <p class="ok">{{ msg }}</p> }
      @if (error) { <p class="err">{{ error }}</p> }
    </section>
  `,
  styles: `
    h2, h3 { text-transform: uppercase; }
    .muted { color: var(--muted-foreground); }
    dl { margin-top: 1rem; display: grid; gap: 0.5rem; }
    div { padding: 0.85rem 1rem; background: var(--card); border: 1px solid var(--border); }
    dt { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-foreground); }
    dd { margin: 0.15rem 0 0; font-weight: 500; }
    .upload { margin-top: 1rem; display: grid; gap: 0.65rem; max-width: 24rem; }
    .ok { color: #1a7a3c; } .err { color: var(--destructive); }
  `,
})
export class ContractorComplianceTabComponent {
  private readonly auth = inject(AuthService);
  private readonly contractorApi = inject(ContractorApiService);
  private readonly u = this.auth.currentUser();
  status = this.u?.complianceStatus || 'unknown';
  eligible = this.u?.dispatchEligible ? 'Yes' : 'No';
  licenseExp = this.u?.licenseExpiresAt || '—';
  insuranceExp = this.u?.insuranceExpiresAt || '—';
  docKind = 'license';
  fileName = '';
  fileData = '';
  busy = false;
  msg = '';
  error = '';

  async onFile(ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 1600);
      this.fileName = compressed.name;
      this.fileData = compressed.dataUrl;
    } catch {
      this.error = 'Could not read file.';
    }
  }

  async upload(): Promise<void> {
    if (!this.fileData || this.busy) return;
    this.busy = true;
    this.error = '';
    this.msg = '';
    try {
      const res = await this.contractorApi.uploadComplianceDoc(this.docKind, {
        name: this.fileName,
        data: this.fileData,
      });
      if (!res.ok) {
        this.error = res.message || 'Upload failed.';
        return;
      }
      this.msg = 'Document uploaded to profile.';
      await this.auth.validateToken();
      const u = this.auth.currentUser();
      this.status = u?.complianceStatus || this.status;
      this.eligible = u?.dispatchEligible ? 'Yes' : 'No';
    } finally {
      this.busy = false;
    }
  }
}

@Component({
  selector: 'app-contractor-team-tab',
  standalone: true,
  imports: [FormsModule, LoadingSkeletonComponent, EmptyStateComponent],
  template: `
    <section>
      <h2>Team</h2>
      @if (!apiOk && !loading) {
        <app-empty-state title="Team API unavailable" body="Employee CRUD will appear when /api/contractor/employees is enabled." />
      } @else {
        <form class="form" (ngSubmit)="save()">
          <div class="fb-field"><label>Name</label><input [(ngModel)]="draft.name" name="name" required /></div>
          <div class="fb-field"><label>Title</label><input [(ngModel)]="draft.jobTitle" name="title" /></div>
          <div class="fb-field"><label>Phone</label><input [(ngModel)]="draft.phone" name="phone" /></div>
          <button class="fb-btn fb-btn-primary" type="submit" [disabled]="busy">{{ busy ? 'Saving…' : (editId ? 'Update' : 'Add member') }}</button>
        </form>
        @if (loading) { <app-loading-skeleton /> }
        @else {
          <ul>
            @for (e of employees; track e.id) {
              <li>
                <div>
                  <strong>{{ e.name }}</strong>
                  <span>{{ e.jobTitle || 'Team' }} · {{ e.active === false ? 'Inactive' : 'Active' }}</span>
                </div>
                <div class="actions">
                  <button type="button" class="fb-btn fb-btn-ghost" (click)="edit(e)">Edit</button>
                  <button type="button" class="fb-btn fb-btn-ghost" (click)="remove(e)">Remove</button>
                </div>
              </li>
            }
          </ul>
        }
      }
      @if (error) { <p class="err">{{ error }}</p> }
    </section>
  `,
  styles: `
    h2 { text-transform: uppercase; }
    .form { display: grid; gap: 0.55rem; max-width: 24rem; margin: 1rem 0; }
    ul { list-style: none; padding: 0; display: grid; gap: 0.5rem; }
    li { padding: 0.85rem; border: 1px solid var(--border); display: flex; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
    span { display: block; font-size: 0.8rem; color: var(--muted-foreground); }
    .actions { display: flex; gap: 0.35rem; }
    .actions .fb-btn { padding: 0.35rem 0.6rem; font-size: 0.68rem; }
    .err { color: var(--destructive); }
  `,
})
export class ContractorTeamTabComponent implements OnInit {
  private readonly api = inject(ContractorApiService);
  loading = true;
  busy = false;
  apiOk = true;
  error = '';
  employees: ContractorEmployee[] = [];
  editId: number | null = null;
  draft = { name: '', jobTitle: '', phone: '' };

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading = true;
    try {
      const res = await this.api.listEmployees();
      this.apiOk = res.ok;
      this.employees = res.employees || [];
      if (!res.ok) this.error = res.message || '';
    } finally {
      this.loading = false;
    }
  }

  edit(e: ContractorEmployee): void {
    this.editId = e.id;
    this.draft = { name: e.name, jobTitle: e.jobTitle || '', phone: e.phone || '' };
  }

  async save(): Promise<void> {
    if (!this.draft.name.trim() || this.busy) return;
    this.busy = true;
    try {
      const res = await this.api.saveEmployee(
        { name: this.draft.name.trim(), jobTitle: this.draft.jobTitle, phone: this.draft.phone, active: true },
        this.editId || undefined
      );
      if (!res.ok) {
        this.error = res.message || 'Save failed.';
        return;
      }
      this.editId = null;
      this.draft = { name: '', jobTitle: '', phone: '' };
      await this.reload();
    } finally {
      this.busy = false;
    }
  }

  async remove(e: ContractorEmployee): Promise<void> {
    const res = await this.api.deleteEmployee(e.id);
    if (!res.ok) this.error = res.message || 'Remove failed.';
    else await this.reload();
  }
}

@Component({
  selector: 'app-contractor-availability-tab',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section>
      <h2>Availability</h2>
      <p class="muted">Simple weekly toggles saved to your profile.</p>
      <ul>
        @for (d of days; track d.key) {
          <li>
            <label>
              <input type="checkbox" [(ngModel)]="d.on" />
              {{ d.label }}
            </label>
          </li>
        }
      </ul>
      <button type="button" class="fb-btn fb-btn-primary" [disabled]="busy" (click)="save()">
        {{ busy ? 'Saving…' : 'Save availability' }}
      </button>
      @if (msg) { <p class="ok">{{ msg }}</p> }
      @if (error) { <p class="err">{{ error }}</p> }
    </section>
  `,
  styles: `
    h2 { text-transform: uppercase; }
    .muted { color: var(--muted-foreground); }
    ul { list-style: none; padding: 0; display: grid; gap: 0.45rem; margin: 1rem 0; max-width: 18rem; }
    li { padding: 0.65rem 0.85rem; border: 1px solid var(--border); background: var(--card); }
    .ok { color: #1a7a3c; } .err { color: var(--destructive); }
  `,
})
export class ContractorAvailabilityTabComponent implements OnInit {
  private readonly auth = inject(AuthService);
  busy = false;
  msg = '';
  error = '';
  days = [
    { key: 'mon', label: 'Monday', on: true },
    { key: 'tue', label: 'Tuesday', on: true },
    { key: 'wed', label: 'Wednesday', on: true },
    { key: 'thu', label: 'Thursday', on: true },
    { key: 'fri', label: 'Friday', on: true },
    { key: 'sat', label: 'Saturday', on: false },
    { key: 'sun', label: 'Sunday', on: false },
  ];

  ngOnInit(): void {
    const raw = (this.auth.currentUser() as { availabilityWeek?: Record<string, boolean> } | null)
      ?.availabilityWeek;
    if (raw) {
      for (const d of this.days) {
        if (typeof raw[d.key] === 'boolean') d.on = raw[d.key];
      }
    }
  }

  async save(): Promise<void> {
    this.busy = true;
    this.error = '';
    this.msg = '';
    try {
      const availabilityWeek: Record<string, boolean> = {};
      for (const d of this.days) availabilityWeek[d.key] = d.on;
      const res = await this.auth.updateProfile({ availabilityWeek });
      if (!res.ok) {
        this.error = res.message;
        return;
      }
      this.msg = 'Availability saved.';
    } finally {
      this.busy = false;
    }
  }
}

@Component({
  selector: 'app-contractor-performance-tab',
  standalone: true,
  imports: [LoadingSkeletonComponent],
  template: `
    <section>
      <h2>Performance</h2>
      @if (loading) { <app-loading-skeleton /> }
      @else if (error) { <p class="err">{{ error }}</p> }
      @else {
        <dl>
          @for (row of rows; track row.label) {
            <div><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></div>
          }
        </dl>
      }
    </section>
  `,
  styles: `
    h2 { text-transform: uppercase; }
    .err { color: var(--destructive); }
    dl { margin-top: 1rem; display: grid; gap: 0.5rem; }
    div { padding: 0.85rem 1rem; background: var(--card); border: 1px solid var(--border); }
    dt { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-foreground); }
    dd { margin: 0.15rem 0 0; font-weight: 600; }
  `,
})
export class ContractorPerformanceTabComponent implements OnInit {
  private readonly api = inject(ManagedJobsApiService);
  loading = true;
  error = '';
  rows: { label: string; value: string }[] = [];

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.api.contractorPerformance();
      if (!res.ok) {
        this.error = res.message || 'Could not load performance.';
        return;
      }
      const skip = new Set(['ok', 'message']);
      this.rows = Object.entries(res)
        .filter(([k]) => !skip.has(k))
        .map(([k, v]) => ({ label: k, value: String(v) }));
      if (!this.rows.length) this.rows = [{ label: 'status', value: 'No metrics yet' }];
    } catch {
      this.error = 'Could not load performance.';
    } finally {
      this.loading = false;
    }
  }
}

@Component({
  selector: 'app-contractor-areas-tab',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section>
      <h2>Service areas</h2>
      <p class="muted">Comma-separated ZIP codes saved on your contractor profile.</p>
      <div class="fb-field">
        <label>ZIPs</label>
        <textarea [(ngModel)]="zips" rows="4" placeholder="33101, 33109, 33139"></textarea>
      </div>
      <button type="button" class="fb-btn fb-btn-primary" [disabled]="busy" (click)="save()">
        {{ busy ? 'Saving…' : 'Save areas' }}
      </button>
      @if (msg) { <p class="ok">{{ msg }}</p> }
      @if (error) { <p class="err">{{ error }}</p> }
    </section>
  `,
  styles: `
    h2 { text-transform: uppercase; }
    .muted { color: var(--muted-foreground); }
    .fb-field { max-width: 28rem; margin: 1rem 0; }
    .ok { color: #1a7a3c; } .err { color: var(--destructive); }
  `,
})
export class ContractorAreasTabComponent implements OnInit {
  private readonly auth = inject(AuthService);
  zips = '';
  busy = false;
  msg = '';
  error = '';

  ngOnInit(): void {
    this.zips = (this.auth.currentUser()?.serviceZips || []).join(', ');
  }

  async save(): Promise<void> {
    this.busy = true;
    this.error = '';
    this.msg = '';
    try {
      const serviceZips = this.zips
        .split(/[\s,]+/)
        .map((z) => z.trim())
        .filter(Boolean);
      const res = await this.auth.updateProfile({ serviceZips });
      if (!res.ok) {
        this.error = res.message;
        return;
      }
      this.msg = 'Service areas updated.';
    } finally {
      this.busy = false;
    }
  }
}

@Component({
  selector: 'app-contractor-settings-tab',
  standalone: true,
  template: `
    <section>
      <h2>Settings</h2>
      <p class="muted">{{ email }}</p>
      <button type="button" class="fb-btn fb-btn-primary" (click)="logout()">Log out</button>
    </section>
  `,
  styles: `h2 { text-transform: uppercase; } .muted { color: var(--muted-foreground); } button { margin-top: 1rem; }`,
})
export class ContractorSettingsTabComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  email = this.auth.currentUser()?.email || '';

  logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/');
  }
}
