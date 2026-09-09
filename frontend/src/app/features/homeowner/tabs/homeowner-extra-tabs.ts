import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ManagedJob } from '../../../core/models/managed-job.model';
import { PaymentTransaction } from '../../../core/models/payment.model';
import { Property, PropertyDocument } from '../../../core/models/property.model';
import { ServiceOffering } from '../../../core/models/service-offering.model';
import { PropertyContextService } from '../../../core/services/property-context.service';
import { LegalApiService } from '../../../core/services/legal-api.service';
import { ManagedJobsApiService } from '../../../core/services/managed-jobs-api.service';
import { PaymentApiService } from '../../../core/services/payment-api.service';
import { PropertyApiService } from '../../../core/services/property-api.service';
import { ReferralsApiService } from '../../../core/services/referrals-api.service';
import { ServiceCatalogApiService } from '../../../core/services/service-catalog-api.service';
import { SubscriptionApiService, GoProPlan } from '../../../core/services/subscription-api.service';
import { SupportApiService, SupportTicket } from '../../../core/services/support-api.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { LoadingSkeletonComponent } from '../../../shared/components/loading-skeleton.component';
import { compressImageFile } from '../../../shared/utils/image-compress';

@Component({
  selector: 'app-homeowner-services',
  standalone: true,
  imports: [RouterLink, LoadingSkeletonComponent, EmptyStateComponent],
  template: `
    <section class="page">
      <h2>Services</h2>
      <p class="muted">One card per service — pick DIY, AI assessment, subscribe, or hire a pro.</p>
      @if (loading) {
        <app-loading-skeleton [count]="6" />
      } @else if (error) {
        <p class="fb-error" role="alert">{{ error }}</p>
      } @else if (offerings.length === 0) {
        <app-empty-state title="No services" body="The catalog is empty right now." ctaLink="/homeowner/report" ctaLabel="Request anyway" />
      } @else {
        <ul class="cards">
          @for (o of offerings; track o.id) {
            <li class="card">
              <div class="card__top">
                <strong>{{ o.name }}</strong>
                <div class="flags">
                  @if (o.diyEligible) { <span class="fb-badge">DIY</span> }
                  @if (o.aiAssessmentEligible !== false) { <span class="fb-badge fb-badge--accent">AI</span> }
                  @if (o.subscriptionEligible) { <span class="fb-badge">Subscribe</span> }
                  @if (o.oneTimeProfessional !== false) { <span class="fb-badge">Pro</span> }
                </div>
              </div>
              <p>{{ o.description }}</p>
              <div class="card__actions">
                @if (o.diyEligible) {
                  <a class="fb-btn fb-btn-ghost" [routerLink]="['/homeowner/report']" [queryParams]="{ category: o.slug || o.id, path: 'diy' }">DIY</a>
                }
                @if (o.aiAssessmentEligible !== false) {
                  <a class="fb-btn fb-btn-ghost" [routerLink]="['/homeowner/report']" [queryParams]="{ category: o.slug || o.id }">AI</a>
                }
                @if (o.subscriptionEligible) {
                  <a class="fb-btn fb-btn-ghost" routerLink="/homeowner/go-pro">Subscribe</a>
                }
                <a class="fb-btn fb-btn-primary" [routerLink]="['/homeowner/report']" [queryParams]="{ category: o.slug || o.id, hire: '1' }">Hire pro</a>
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    .page h2 { text-transform: uppercase; font-size: 1.75rem; }
    .muted { color: var(--muted-foreground); max-width: 48ch; }
    .cards { list-style: none; margin: 1.25rem 0 0; padding: 0; display: grid; gap: 0.85rem; }
    .card { padding: 1rem; border: 1px solid var(--border); background: var(--card); display: grid; gap: 0.55rem; }
    .card__top { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem; align-items: center; }
    .flags { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .card p { margin: 0; color: var(--muted-foreground); font-size: 0.95rem; }
    .card__actions { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .card__actions .fb-btn { padding: 0.5rem 0.8rem; font-size: 0.75rem; }
  `,
})
export class HomeownerServicesComponent implements OnInit {
  private readonly catalogApi = inject(ServiceCatalogApiService);
  loading = true;
  error = '';
  offerings: ServiceOffering[] = [];

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.catalogApi.listHomeServices();
      this.offerings = (res.offerings || []).filter(
        (o) => o.active !== false && o.homeownerVisible !== false
      );
      if (!res.ok && this.offerings.length === 0) this.error = res.message || 'Could not load services.';
    } catch {
      this.error = 'Could not load services.';
    } finally {
      this.loading = false;
    }
  }
}

@Component({
  selector: 'app-homeowner-payments',
  standalone: true,
  imports: [LoadingSkeletonComponent, EmptyStateComponent],
  template: `
    <section class="page">
      <h2>Payments</h2>
      <p class="muted">History and outstanding balances from your jobs{{ propertyCtx.propertyId() ? ' for this property' : '' }}.</p>
      @if (loading) {
        <app-loading-skeleton />
      } @else if (error) {
        <p class="fb-error">{{ error }}</p>
      } @else {
        @if (outstanding.length) {
          <h3>Outstanding</h3>
          <ul>
            @for (j of outstanding; track j.id) {
              <li>
                <strong>{{ j.title || ('Job #' + j.id) }}</strong>
                <em>{{ money(j.outstandingAmount) }}</em>
              </li>
            }
          </ul>
        }
        <h3>History</h3>
        @if (items.length === 0) {
          <app-empty-state title="No payments yet" body="Paid invoices and tips will show here." />
        } @else {
          <ul>
            @for (t of items; track t.id) {
              <li>
                <strong>{{ t.typeLabel || t.paymentType }}</strong>
                <span>{{ t.description }}</span>
                <em>{{ money(t.amount) }} · {{ t.status }}</em>
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
  styles: `
    .page h2, h3 { text-transform: uppercase; }
    .muted { color: var(--muted-foreground); }
    ul { list-style: none; margin: 0.75rem 0 1.25rem; padding: 0; display: grid; gap: 0.5rem; }
    li { padding: 0.85rem 1rem; background: var(--card); border: 1px solid var(--border); display: grid; gap: 0.15rem; }
    span, em { font-size: 0.8rem; color: var(--muted-foreground); font-style: normal; }
  `,
})
export class HomeownerPaymentsComponent implements OnInit {
  private readonly api = inject(PaymentApiService);
  private readonly jobsApi = inject(ManagedJobsApiService);
  readonly propertyCtx = inject(PropertyContextService);
  loading = true;
  error = '';
  private allItems: PaymentTransaction[] = [];
  private allJobs: ManagedJob[] = [];

  get outstanding(): (ManagedJob & { outstandingAmount?: number })[] {
    void this.propertyCtx.propertyId();
    const scoped = this.propertyCtx.filterByProperty(this.allJobs);
    return scoped.filter(
      (j) => Number((j as { outstandingAmount?: number }).outstandingAmount || 0) > 0
    ) as (ManagedJob & { outstandingAmount?: number })[];
  }

  get items(): PaymentTransaction[] {
    void this.propertyCtx.propertyId();
    const map = new Map<number, number | null | undefined>();
    for (const j of this.allJobs) map.set(j.id, j.propertyId);
    return this.propertyCtx.filterPaymentsByProperty(this.allItems, map);
  }

  async ngOnInit(): Promise<void> {
    try {
      const [pay, jobs] = await Promise.all([this.api.paymentsMine(), this.jobsApi.listMine()]);
      this.allItems = pay.transactions || [];
      this.allJobs = jobs.jobs || [];
      if (!pay.ok && this.allItems.length === 0) this.error = pay.message || 'Could not load payments.';
    } catch {
      this.error = 'Could not load payments.';
    } finally {
      this.loading = false;
    }
  }

  money(n?: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
  }
}

@Component({
  selector: 'app-homeowner-help',
  standalone: true,
  imports: [FormsModule, LoadingSkeletonComponent, EmptyStateComponent],
  template: `
    <section class="page">
      <h2>Help & Support</h2>
      <form class="create" (ngSubmit)="create()">
        <div class="fb-field">
          <label>Subject</label>
          <input [(ngModel)]="subject" name="subject" required />
        </div>
        <div class="fb-field">
          <label>Message</label>
          <textarea [(ngModel)]="message" name="message" rows="4" required></textarea>
        </div>
        @if (formError) { <p class="fb-error">{{ formError }}</p> }
        @if (formOk) { <p class="ok">{{ formOk }}</p> }
        <button class="fb-btn fb-btn-primary" type="submit" [disabled]="busy">{{ busy ? 'Sending…' : 'Create ticket' }}</button>
      </form>

      <h3>Your tickets</h3>
      @if (loading) { <app-loading-skeleton /> }
      @else if (tickets.length === 0) {
        <app-empty-state title="No tickets" body="Create a ticket above and our team will reply." />
      } @else {
        <ul>
          @for (t of tickets; track t.ticketNumber) {
            <li>
              <button type="button" class="ticket" (click)="open(t)">
                <strong>{{ t.subject || t.ticketNumber }}</strong>
                <span>{{ t.status }} · {{ t.ticketNumber }}</span>
              </button>
              @if (active?.ticketNumber === t.ticketNumber) {
                <div class="thread">
                  @for (m of active?.messages || []; track $index) {
                    <p>{{ m.body || m.message }}</p>
                  }
                  <div class="fb-field">
                    <label>Reply</label>
                    <textarea [(ngModel)]="reply" name="reply" rows="3"></textarea>
                  </div>
                  <button type="button" class="fb-btn fb-btn-ghost" [disabled]="busy" (click)="sendReply()">Send reply</button>
                </div>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    .page h2, h3 { text-transform: uppercase; }
    .create { display: grid; gap: 0.75rem; max-width: 36rem; margin: 1rem 0 1.5rem; }
    .ok { color: #1a7a3c; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
    li { border: 1px solid var(--border); background: var(--card); }
    .ticket { width: 100%; text-align: left; background: transparent; border: 0; padding: 0.9rem 1rem; cursor: pointer; display: grid; gap: 0.2rem; }
    .ticket span { font-size: 0.8rem; color: var(--muted-foreground); text-transform: capitalize; }
    .thread { padding: 0 1rem 1rem; display: grid; gap: 0.5rem; border-top: 1px solid var(--border); }
    .thread p { margin: 0.35rem 0 0; font-size: 0.9rem; }
  `,
})
export class HomeownerHelpComponent implements OnInit {
  private readonly api = inject(SupportApiService);
  loading = true;
  busy = false;
  subject = '';
  message = '';
  reply = '';
  formError = '';
  formOk = '';
  tickets: SupportTicket[] = [];
  active: SupportTicket | null = null;

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading = true;
    try {
      const res = await this.api.list();
      this.tickets = res.tickets || [];
    } finally {
      this.loading = false;
    }
  }

  async create(): Promise<void> {
    if (!this.subject.trim() || !this.message.trim() || this.busy) return;
    this.busy = true;
    this.formError = '';
    this.formOk = '';
    try {
      const res = await this.api.create({
        subject: this.subject.trim(),
        message: this.message.trim(),
      });
      if (!res.ok) {
        this.formError = res.message || 'Could not create ticket.';
        return;
      }
      this.formOk = `Ticket ${res.ticket?.ticketNumber || ''} created.`;
      this.subject = '';
      this.message = '';
      await this.reload();
    } finally {
      this.busy = false;
    }
  }

  async open(t: SupportTicket): Promise<void> {
    if (this.active?.ticketNumber === t.ticketNumber) {
      this.active = null;
      return;
    }
    const res = await this.api.get(t.ticketNumber);
    this.active = res.ticket || t;
  }

  async sendReply(): Promise<void> {
    if (!this.active || !this.reply.trim() || this.busy) return;
    this.busy = true;
    try {
      const res = await this.api.reply(this.active.ticketNumber, this.reply.trim());
      if (res.ok) {
        this.reply = '';
        await this.open(this.active);
      }
    } finally {
      this.busy = false;
    }
  }
}

@Component({
  selector: 'app-homeowner-property-care',
  standalone: true,
  imports: [FormsModule, RouterLink, LoadingSkeletonComponent, EmptyStateComponent],
  template: `
    <section class="page">
      <h2>Property care</h2>
      <p class="muted">Passport-style view of systems and documents for the selected property.</p>
      @if (loading) { <app-loading-skeleton /> }
      @else if (!property) {
        <app-empty-state title="Select a property" body="Use the property switcher in the header, or add a property." ctaLink="/homeowner/properties" ctaLabel="My properties" />
      } @else {
        <div class="card">
          <strong>{{ property.label || property.addressLine1 }}</strong>
          <span>{{ property.city }}{{ property.state ? ', ' + property.state : '' }} {{ property.zip }}</span>
        </div>
        <h3>Systems from job history</h3>
        @if (systems.length === 0) {
          <p class="muted">No categorized jobs yet for this property.</p>
        } @else {
          <ul class="chips">
            @for (s of systems; track s) { <li>{{ s }}</li> }
          </ul>
        }
        <h3>Documents / media</h3>
        <div class="upload">
          <input type="file" accept="image/*,.pdf,.doc,.docx" (change)="onFile($event)" />
          <select [(ngModel)]="uploadCategory">
            <option value="other">Other</option>
            <option value="receipt">Receipt</option>
            <option value="warranty">Warranty</option>
            <option value="manual">Manual</option>
            <option value="invoice">Invoice</option>
            <option value="inspection">Inspection</option>
            <option value="contractor">Contractor</option>
            <option value="photo_before">Photo before</option>
            <option value="photo_after">Photo after</option>
          </select>
          <button type="button" class="fb-btn fb-btn-primary" [disabled]="uploading || !pendingFile" (click)="upload()">
            {{ uploading ? 'Uploading…' : 'Upload' }}
          </button>
        </div>
        @if (docError) { <p class="fb-error">{{ docError }}</p> }
        @if (docMsg) { <p class="ok">{{ docMsg }}</p> }
        @if (documents.length === 0 && media.length === 0) {
          <p class="muted">No documents yet — upload files above or attach photos on a service request.</p>
        } @else {
          @if (documents.length) {
            <ul>
              @for (d of documents; track d.id) {
                <li>
                  <div>
                    <strong>{{ d.title || d.fileName || ('Document #' + d.id) }}</strong>
                    <span>{{ d.category }}{{ d.mimeType ? ' · ' + d.mimeType : '' }}</span>
                  </div>
                  <button type="button" class="fb-btn fb-btn-ghost" [disabled]="deletingId === d.id" (click)="removeDoc(d)">
                    {{ deletingId === d.id ? '…' : 'Delete' }}
                  </button>
                </li>
              }
            </ul>
          }
          @if (media.length) {
            <h4>Job media</h4>
            <ul>
              @for (m of media; track m.id) {
                <li>
                  <a [routerLink]="['/homeowner/jobs', m.id]">Job #{{ m.id }} media</a>
                  <span>{{ m.title || m.category }}</span>
                </li>
              }
            </ul>
          }
        }
      }
    </section>
  `,
  styles: `
    .page h2, h3, h4 { text-transform: uppercase; }
    .muted { color: var(--muted-foreground); }
    .card { padding: 1rem; border: 1px solid var(--border); background: var(--card); display: grid; gap: 0.25rem; margin: 1rem 0; }
    .chips { list-style: none; display: flex; flex-wrap: wrap; gap: 0.4rem; padding: 0; }
    .chips li { padding: 0.35rem 0.65rem; border: 1px solid var(--border); background: var(--secondary); text-transform: capitalize; font-size: 0.85rem; }
    .upload { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin: 0.75rem 0; }
    .upload select, .upload input[type=file] { padding: 0.45rem; border: 1px solid var(--border); background: var(--input-background); }
    ul:not(.chips) { list-style: none; padding: 0; display: grid; gap: 0.45rem; }
    ul:not(.chips) li { padding: 0.75rem; border: 1px solid var(--border); display: flex; justify-content: space-between; gap: 0.75rem; align-items: center; }
    ul:not(.chips) li > div { display: grid; gap: 0.15rem; }
    span { font-size: 0.8rem; color: var(--muted-foreground); }
    .ok { color: #1a7a3c; }
    .fb-btn-ghost { padding: 0.4rem 0.65rem; font-size: 0.7rem; }
  `,
})
export class HomeownerPropertyCareComponent implements OnInit {
  private readonly propertyCtx = inject(PropertyContextService);
  private readonly propertyApi = inject(PropertyApiService);
  private readonly jobsApi = inject(ManagedJobsApiService);
  loading = true;
  property: Property | null = null;
  systems: string[] = [];
  media: ManagedJob[] = [];
  documents: PropertyDocument[] = [];
  uploadCategory = 'other';
  pendingFile: File | null = null;
  uploading = false;
  deletingId: number | null = null;
  docError = '';
  docMsg = '';

  async ngOnInit(): Promise<void> {
    try {
      const [props, jobs] = await Promise.all([this.propertyApi.list(), this.jobsApi.listMine()]);
      this.propertyCtx.setProperties(props.properties || []);
      this.property = this.propertyCtx.selected();
      const scoped = this.propertyCtx.filterByProperty(jobs.jobs || []);
      this.systems = [...new Set(scoped.map((j) => j.category).filter(Boolean) as string[])];
      this.media = scoped.filter((j) => !!j.mediaDataUrl);
      if (this.property?.id) await this.reloadDocs(this.property.id);
    } finally {
      this.loading = false;
    }
  }

  async reloadDocs(propertyId: number): Promise<void> {
    const res = await this.propertyApi.listDocuments(propertyId);
    this.documents = res.documents || [];
    if (!res.ok && !this.documents.length) this.docError = res.message || '';
  }

  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.pendingFile = input.files?.[0] || null;
    this.docError = '';
    this.docMsg = '';
  }

  async upload(): Promise<void> {
    if (!this.property?.id || !this.pendingFile || this.uploading) return;
    this.uploading = true;
    this.docError = '';
    this.docMsg = '';
    try {
      const compressed = await compressImageFile(this.pendingFile);
      const res = await this.propertyApi.uploadDocument(this.property.id, {
        dataUrl: compressed.dataUrl,
        fileName: compressed.name,
        mimeType: compressed.type,
        category: this.uploadCategory,
        title: compressed.name,
      });
      if (!res.ok) {
        this.docError = res.message || 'Upload failed.';
        return;
      }
      this.docMsg = 'Document uploaded.';
      this.pendingFile = null;
      await this.reloadDocs(this.property.id);
    } finally {
      this.uploading = false;
    }
  }

  async removeDoc(doc: PropertyDocument): Promise<void> {
    if (!this.property?.id || this.deletingId) return;
    if (!window.confirm(`Delete “${doc.title || doc.fileName || doc.id}”?`)) return;
    this.deletingId = doc.id;
    this.docError = '';
    try {
      const res = await this.propertyApi.deleteDocument(this.property.id, doc.id);
      if (!res.ok) this.docError = res.message || 'Delete failed.';
      else await this.reloadDocs(this.property.id);
    } finally {
      this.deletingId = null;
    }
  }
}

@Component({
  selector: 'app-homeowner-go-pro',
  standalone: true,
  imports: [LoadingSkeletonComponent, EmptyStateComponent],
  template: `
    <section class="page">
      <h2>Go Pro</h2>
      <p class="muted">HomeCare Pro plans from FixBridge.</p>
      @if (loading) { <app-loading-skeleton /> }
      @else if (error) { <p class="fb-error">{{ error }}</p> }
      @else if (plans.length === 0) {
        <app-empty-state title="No plans" body="Plans will appear when the billing API is configured." />
      } @else {
        <ul>
          @for (p of plans; track p.code || p.planCode || p.id || p.name) {
            <li>
              <strong>{{ p.name || p.title || p.code || p.planCode }}</strong>
              <p>{{ p.description || '' }}</p>
              <em>{{ money(p.priceMonthly ?? p.price ?? p.amount) }}/mo</em>
              <button type="button" class="fb-btn fb-btn-primary" [disabled]="busy" (click)="checkout(p)">
                {{ busy ? 'Starting…' : 'Checkout' }}
              </button>
            </li>
          }
        </ul>
      }
      @if (msg) { <p class="ok">{{ msg }}</p> }
    </section>
  `,
  styles: `
    .page h2 { text-transform: uppercase; }
    .muted, p { color: var(--muted-foreground); }
    ul { list-style: none; padding: 0; display: grid; gap: 0.75rem; margin-top: 1rem; }
    li { padding: 1rem; border: 1px solid var(--border); background: var(--card); display: grid; gap: 0.4rem; }
    em { font-style: normal; font-weight: 700; color: var(--foreground); }
    .ok { color: #1a7a3c; }
  `,
})
export class HomeownerGoProComponent implements OnInit {
  private readonly api = inject(SubscriptionApiService);
  loading = true;
  busy = false;
  error = '';
  msg = '';
  plans: GoProPlan[] = [];

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.api.goProPlans();
      this.plans = res.plans || [];
      if (!res.ok && !this.plans.length) {
        const fallback = await this.api.platformPlans();
        this.plans = fallback.plans || [];
        if (!fallback.ok && !this.plans.length) this.error = res.message || 'Could not load plans.';
      }
    } catch {
      this.error = 'Could not load plans.';
    } finally {
      this.loading = false;
    }
  }

  money(n?: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
  }

  async checkout(plan: GoProPlan): Promise<void> {
    const planCode = String(plan.planCode || plan.code || plan.id || '');
    if (!planCode || this.busy) return;
    this.busy = true;
    this.msg = '';
    try {
      const res = await this.api.checkout({ planCode });
      if (!res.ok) {
        this.error = res.message || 'Checkout failed.';
        return;
      }
      if (res.url) {
        window.location.href = res.url;
        return;
      }
      this.msg = res.simulated ? 'Subscription activated (simulated).' : 'Checkout complete.';
    } finally {
      this.busy = false;
    }
  }
}

@Component({
  selector: 'app-homeowner-legal',
  standalone: true,
  imports: [LoadingSkeletonComponent],
  template: `
    <section class="page">
      <h2>Legal & consent</h2>
      @if (loading) { <app-loading-skeleton /> }
      @else {
        <p class="muted">Status: {{ accepted ? 'Accepted' : 'Action needed' }}</p>
        @if (missing.length) {
          <ul>
            @for (m of missing; track m) { <li>{{ m }}</li> }
          </ul>
        }
        @if (!accepted) {
          <button type="button" class="fb-btn fb-btn-primary" [disabled]="busy" (click)="accept()">
            {{ busy ? 'Saving…' : 'Accept required consents' }}
          </button>
        }
        @if (msg) { <p class="ok">{{ msg }}</p> }
        @if (error) { <p class="fb-error">{{ error }}</p> }
      }
    </section>
  `,
  styles: `
    .page h2 { text-transform: uppercase; }
    .muted { color: var(--muted-foreground); }
    ul { padding-left: 1.1rem; }
    .ok { color: #1a7a3c; }
    button { margin-top: 0.75rem; }
  `,
})
export class HomeownerLegalComponent implements OnInit {
  private readonly api = inject(LegalApiService);
  loading = true;
  busy = false;
  accepted = false;
  missing: string[] = [];
  msg = '';
  error = '';

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.api.consentStatus();
      this.accepted = !!(res.accepted || (res.required === false));
      this.missing = res.missing || [];
    } finally {
      this.loading = false;
    }
  }

  async accept(): Promise<void> {
    this.busy = true;
    this.error = '';
    try {
      const res = await this.api.accept({ acceptAll: true });
      if (!res.ok) {
        this.error = res.message || 'Could not accept.';
        return;
      }
      this.accepted = true;
      this.msg = 'Consents recorded.';
      this.missing = [];
    } finally {
      this.busy = false;
    }
  }
}

@Component({
  selector: 'app-homeowner-refer',
  standalone: true,
  imports: [LoadingSkeletonComponent, EmptyStateComponent],
  template: `
    <section class="page">
      <h2>Refer & earn</h2>
      @if (loading) { <app-loading-skeleton /> }
      @else if (error && !code) {
        <app-empty-state title="Referrals unavailable" [body]="error" />
      } @else {
        <div class="card">
          <p class="muted">Your code</p>
          <strong>{{ code || '—' }}</strong>
          @if (link) { <a [href]="link" target="_blank" rel="noopener">{{ link }}</a> }
          @if (shareMessage) { <p>{{ shareMessage }}</p> }
          <p class="muted">Credits available: {{ moneyCents(credits) }}</p>
        </div>
        <h3>Referrals</h3>
        @if (!referrals.length) {
          <p class="muted">No referrals yet — share your code to get started.</p>
        } @else {
          <ul>
            @for (r of referrals; track $index) {
              <li>{{ label(r) }}</li>
            }
          </ul>
        }
      }
    </section>
  `,
  styles: `
    .page h2, h3 { text-transform: uppercase; }
    .muted { color: var(--muted-foreground); margin: 0; }
    .card { margin: 1rem 0; padding: 1rem; border: 1px solid var(--border); display: grid; gap: 0.35rem; }
    ul { list-style: none; padding: 0; display: grid; gap: 0.4rem; }
    li { padding: 0.75rem; border: 1px solid var(--border); }
  `,
})
export class HomeownerReferComponent implements OnInit {
  private readonly api = inject(ReferralsApiService);
  loading = true;
  error = '';
  code = '';
  link = '';
  shareMessage = '';
  credits = 0;
  referrals: unknown[] = [];

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.api.me();
      this.code = res.code || '';
      this.link = res.link || '';
      this.shareMessage = res.shareMessage || '';
      this.credits = res.credits?.availableCents || 0;
      this.referrals = res.referrals || [];
      if (!res.ok) this.error = res.message || 'Could not load referrals.';
    } finally {
      this.loading = false;
    }
  }

  moneyCents(cents: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
  }

  label(r: unknown): string {
    const row = r as { statusLabel?: string; status?: string; referredName?: string; referralCode?: string };
    return `${row.referredName || row.referralCode || 'Referral'} · ${row.statusLabel || row.status || ''}`;
  }
}

@Component({
  selector: 'app-homeowner-documents',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, LoadingSkeletonComponent, EmptyStateComponent],
  template: `
    <section class="page">
      <h2>Documents</h2>
      <p class="muted">Property vault for the selected home — upload, list, and delete files.</p>
      @if (loading) { <app-loading-skeleton /> }
      @else if (!propertyId) {
        <app-empty-state title="Select a property" body="Use the property switcher in the header to view documents." ctaLink="/homeowner/properties" ctaLabel="My properties" />
      } @else {
        <div class="upload">
          <input type="file" accept="image/*,.pdf,.doc,.docx" (change)="onFile($event)" />
          <select [(ngModel)]="uploadCategory">
            <option value="other">Other</option>
            <option value="receipt">Receipt</option>
            <option value="warranty">Warranty</option>
            <option value="manual">Manual</option>
            <option value="invoice">Invoice</option>
            <option value="inspection">Inspection</option>
            <option value="contractor">Contractor</option>
            <option value="photo_before">Photo before</option>
            <option value="photo_after">Photo after</option>
          </select>
          <button type="button" class="fb-btn fb-btn-primary" [disabled]="uploading || !pendingFile" (click)="upload()">
            {{ uploading ? 'Uploading…' : 'Upload document' }}
          </button>
        </div>
        @if (error) { <p class="fb-error">{{ error }}</p> }
        @if (msg) { <p class="ok">{{ msg }}</p> }
        @if (!documents.length && !jobMedia.length) {
          <app-empty-state title="No documents" body="Upload a file above, or add photos on a service request." ctaLink="/homeowner/report" ctaLabel="Request service" />
        } @else {
          @if (documents.length) {
            <ul>
              @for (d of documents; track d.id) {
                <li>
                  <div>
                    <strong>{{ d.title || d.fileName || ('Document #' + d.id) }}</strong>
                    <span>{{ d.category }}{{ d.createdAt ? ' · ' + (d.createdAt | date:'mediumDate') : '' }}</span>
                  </div>
                  <button type="button" class="fb-btn fb-btn-ghost" [disabled]="deletingId === d.id" (click)="remove(d)">
                    {{ deletingId === d.id ? '…' : 'Delete' }}
                  </button>
                </li>
              }
            </ul>
          }
          @if (jobMedia.length) {
            <h3>Job attachments</h3>
            <ul>
              @for (j of jobMedia; track j.id) {
                <li>
                  <a [routerLink]="['/homeowner/jobs', j.id]">{{ j.title || ('Job #' + j.id) }}</a>
                  <span>{{ j.mediaType || 'attachment' }}</span>
                </li>
              }
            </ul>
          }
        }
      }
    </section>
  `,
  styles: `
    .page h2, h3 { text-transform: uppercase; }
    .muted { color: var(--muted-foreground); }
    .upload { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin: 1rem 0; }
    .upload select, .upload input[type=file] { padding: 0.45rem; border: 1px solid var(--border); background: var(--input-background); }
    ul { list-style: none; padding: 0; display: grid; gap: 0.45rem; margin-top: 1rem; }
    li { padding: 0.85rem; border: 1px solid var(--border); display: flex; justify-content: space-between; gap: 0.75rem; align-items: center; }
    li > div, li > a { display: grid; gap: 0.2rem; }
    span { font-size: 0.8rem; color: var(--muted-foreground); }
    .ok { color: #1a7a3c; }
    .fb-btn-ghost { padding: 0.4rem 0.65rem; font-size: 0.7rem; }
  `,
})
export class HomeownerDocumentsComponent implements OnInit {
  private readonly jobsApi = inject(ManagedJobsApiService);
  private readonly propertyApi = inject(PropertyApiService);
  private readonly propertyCtx = inject(PropertyContextService);
  loading = true;
  propertyId: number | null = null;
  documents: PropertyDocument[] = [];
  jobMedia: ManagedJob[] = [];
  uploadCategory = 'other';
  pendingFile: File | null = null;
  uploading = false;
  deletingId: number | null = null;
  error = '';
  msg = '';

  async ngOnInit(): Promise<void> {
    try {
      const props = await this.propertyApi.list();
      this.propertyCtx.setProperties(props.properties || []);
      this.propertyId = this.propertyCtx.propertyId();
      const jobs = await this.jobsApi.listMine();
      this.jobMedia = this.propertyCtx
        .filterByProperty(jobs.jobs || [])
        .filter((j) => !!j.mediaDataUrl);
      if (this.propertyId) {
        const docs = await this.propertyApi.listDocuments(this.propertyId);
        this.documents = docs.documents || [];
        if (!docs.ok && !this.documents.length) this.error = docs.message || '';
      }
    } finally {
      this.loading = false;
    }
  }

  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.pendingFile = input.files?.[0] || null;
    this.error = '';
    this.msg = '';
  }

  async upload(): Promise<void> {
    if (!this.propertyId || !this.pendingFile || this.uploading) return;
    this.uploading = true;
    this.error = '';
    this.msg = '';
    try {
      const compressed = await compressImageFile(this.pendingFile);
      const res = await this.propertyApi.uploadDocument(this.propertyId, {
        dataUrl: compressed.dataUrl,
        fileName: compressed.name,
        mimeType: compressed.type,
        category: this.uploadCategory,
        title: compressed.name,
      });
      if (!res.ok) {
        this.error = res.message || 'Upload failed.';
        return;
      }
      this.msg = 'Document uploaded.';
      this.pendingFile = null;
      const docs = await this.propertyApi.listDocuments(this.propertyId);
      this.documents = docs.documents || [];
    } finally {
      this.uploading = false;
    }
  }

  async remove(doc: PropertyDocument): Promise<void> {
    if (!this.propertyId || this.deletingId) return;
    if (!window.confirm(`Delete “${doc.title || doc.fileName || doc.id}”?`)) return;
    this.deletingId = doc.id;
    this.error = '';
    try {
      const res = await this.propertyApi.deleteDocument(this.propertyId, doc.id);
      if (!res.ok) this.error = res.message || 'Delete failed.';
      else {
        const docs = await this.propertyApi.listDocuments(this.propertyId);
        this.documents = docs.documents || [];
      }
    } finally {
      this.deletingId = null;
    }
  }
}

@Component({
  selector: 'app-homeowner-more',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="more">
      <h2>More</h2>
      <p>Account shortcuts</p>
      <nav>
        <a routerLink="/homeowner/diy">DIY guides</a>
        <a routerLink="/homeowner/property-care">Property care</a>
        <a routerLink="/homeowner/properties">My Property</a>
        <a routerLink="/homeowner/documents">Documents</a>
        <a routerLink="/homeowner/payments">Payments</a>
        <a routerLink="/homeowner/services">Services</a>
        <a routerLink="/homeowner/go-pro">Go Pro</a>
        <a routerLink="/homeowner/refer-earn">Refer & earn</a>
        <a routerLink="/homeowner/legal">Legal & consent</a>
        <a routerLink="/homeowner/profile">Profile</a>
        <a routerLink="/homeowner/help">Help & Support</a>
      </nav>
    </section>
  `,
  styles: `
    .more h2 { text-transform: uppercase; font-size: 1.75rem; }
    .more p { color: var(--muted-foreground); }
    nav { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1rem; }
    a {
      padding: 0.9rem 1rem;
      background: var(--card);
      border: 1px solid var(--border);
      font-weight: 600;
    }
  `,
})
export class HomeownerMoreComponent {}
