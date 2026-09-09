import { Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { StructuredAssessment } from '../../../core/models/assessment.model';
import { ManagedJob } from '../../../core/models/managed-job.model';
import { Property } from '../../../core/models/property.model';
import { ServiceOffering } from '../../../core/models/service-offering.model';
import { PropertyContextService } from '../../../core/services/property-context.service';
import { AiApiService } from '../../../core/services/ai-api.service';
import { ManagedJobsApiService } from '../../../core/services/managed-jobs-api.service';
import { PropertyApiService } from '../../../core/services/property-api.service';
import { ServiceCatalogApiService } from '../../../core/services/service-catalog-api.service';
import { AiAssessmentAckModalComponent } from '../../../shared/components/ai-assessment-ack-modal.component';
import { compressImageFile } from '../../../shared/utils/image-compress';

const FALLBACK_CATEGORIES = [
  { id: 'plumbing', label: 'Plumbing' },
  { id: 'electrical', label: 'Electrical' },
  { id: 'hvac', label: 'HVAC' },
  { id: 'appliances', label: 'Appliances' },
  { id: 'handyman', label: 'Handyman' },
  { id: 'pest_control', label: 'Pest Control' },
  { id: 'roofing_siding', label: 'Roofing / Siding' },
  { id: 'cleaning_service', label: 'Cleaning Service' },
  { id: 'landscaping', label: 'Landscaping' },
  { id: 'general_contractor', label: 'Other / Not Sure' },
] as const;

type Phase = 'category' | 'details' | 'property' | 'media' | 'path' | 'assessing' | 'summary';
type CategoryOption = { id: string; label: string };

@Component({
  selector: 'app-homeowner-report',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AiAssessmentAckModalComponent],
  templateUrl: './homeowner-report.component.html',
  styleUrl: './homeowner-report.component.scss',
})
export class HomeownerReportComponent implements OnInit {
  @ViewChild('analysisAnchor') analysisAnchor?: ElementRef<HTMLElement>;

  private readonly fb = inject(FormBuilder);
  private readonly propertiesApi = inject(PropertyApiService);
  private readonly jobsApi = inject(ManagedJobsApiService);
  private readonly aiApi = inject(AiApiService);
  private readonly catalogApi = inject(ServiceCatalogApiService);
  private readonly propertyCtx = inject(PropertyContextService);
  private readonly router = inject(Router);

  categories: CategoryOption[] = [...FALLBACK_CATEGORIES];
  phase: Phase = 'category';
  loadingProps = true;
  submitting = false;
  error = '';
  properties: Property[] = [];
  mediaName = '';
  mediaDataUrl: string | null = null;
  mediaType: string | null = null;
  job: ManagedJob | null = null;
  assessment: StructuredAssessment | null = null;
  assessHint = 'Starting assessment…';
  progressPct = 8;

  ackOpen = false;
  ackChecked = false;
  ackError: string | null = null;
  pendingPath: 'ai' | 'hire' | null = null;

  readonly form = this.fb.nonNullable.group({
    category: ['', Validators.required],
    title: ['', Validators.required],
    description: ['', Validators.required],
    propertyId: ['' as string],
  });

  get stepIndex(): number {
    const order: Phase[] = ['category', 'details', 'property', 'media', 'path', 'assessing', 'summary'];
    return Math.min(order.indexOf(this.phase) + 1, 5);
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadCatalog(), this.loadProperties()]);
    const selected = this.propertyCtx.propertyId();
    if (selected) this.form.patchValue({ propertyId: String(selected) });
  }

  private async loadCatalog(): Promise<void> {
    try {
      const res = await this.catalogApi.listHomeServices();
      const offerings = (res.offerings || []).filter(
        (o) => o.active !== false && o.homeownerVisible !== false
      );
      if (offerings.length > 0) {
        this.categories = offerings.map((o: ServiceOffering) => ({
          id: o.slug || o.id,
          label: o.name,
        }));
      }
    } catch {
      /* keep fallback */
    }
  }

  private async loadProperties(): Promise<void> {
    try {
      const res = await this.propertiesApi.list();
      this.properties = res.properties || [];
      this.propertyCtx.setProperties(this.properties);
      if (!res.ok && this.properties.length === 0) {
        this.error = res.message || 'Could not load properties.';
      }
    } catch {
      this.error = 'Could not load properties.';
    } finally {
      this.loadingProps = false;
    }
  }

  selectCategory(id: string): void {
    this.form.patchValue({ category: id });
    this.error = '';
    this.phase = 'details';
  }

  nextFromDetails(): void {
    this.form.controls.title.markAsTouched();
    this.form.controls.description.markAsTouched();
    if (this.form.controls.title.invalid || this.form.controls.description.invalid) {
      this.error = 'Title and description are required.';
      return;
    }
    this.error = '';
    this.phase = 'property';
  }

  nextFromProperty(): void {
    this.error = '';
    this.phase = 'media';
  }

  nextFromMedia(): void {
    this.error = '';
    this.phase = 'path';
  }

  back(): void {
    this.error = '';
    if (this.phase === 'details') this.phase = 'category';
    else if (this.phase === 'property') this.phase = 'details';
    else if (this.phase === 'media') this.phase = 'property';
    else if (this.phase === 'path') this.phase = 'media';
  }

  async onFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      this.mediaDataUrl = null;
      this.mediaType = null;
      this.mediaName = '';
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      this.error = 'Media must be under 12 MB before compression.';
      input.value = '';
      return;
    }
    this.error = '';
    try {
      const compressed = await compressImageFile(file, 1600);
      this.mediaName = compressed.name;
      this.mediaType = compressed.type;
      this.mediaDataUrl = compressed.dataUrl;
    } catch {
      this.error = 'Could not process the selected file.';
      this.mediaDataUrl = null;
    }
  }

  chooseAiPath(): void {
    this.pendingPath = 'ai';
    this.ackChecked = false;
    this.ackError = null;
    this.ackOpen = true;
  }

  cancelAck(): void {
    this.ackOpen = false;
    this.pendingPath = null;
  }

  async confirmAck(): Promise<void> {
    if (!this.ackChecked) {
      this.ackError = 'Please acknowledge the AI assessment notice.';
      return;
    }
    this.ackOpen = false;
    this.pendingPath = null;
    await this.submitAndAssess(true);
  }

  async chooseHirePath(): Promise<void> {
    await this.submitAndAssess(false);
  }

  private scrollToAnalysis(): void {
    queueMicrotask(() => {
      this.analysisAnchor?.nativeElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async submitAndAssess(runAi: boolean): Promise<void> {
    if (this.submitting) return;
    const raw = this.form.getRawValue();
    if (!raw.category || !raw.title.trim() || !raw.description.trim()) {
      this.error = 'Please complete category, title, and description.';
      this.phase = 'category';
      return;
    }

    this.submitting = true;
    this.error = '';
    this.phase = runAi ? 'assessing' : 'path';
    this.assessHint = 'Creating your service request…';
    this.progressPct = 12;
    if (runAi) this.scrollToAnalysis();

    try {
      const propertyId = raw.propertyId ? Number(raw.propertyId) : undefined;
      const createRes = await this.jobsApi.create({
        category: raw.category,
        title: raw.title.trim(),
        description: raw.description.trim(),
        propertyId: Number.isFinite(propertyId) ? propertyId : undefined,
        serviceTiming: 'weekday',
        mediaDataUrl: this.mediaDataUrl || undefined,
        mediaType: this.mediaType || undefined,
      });

      if (!createRes.ok || !createRes.job) {
        this.error = createRes.message || 'Could not create service request.';
        this.phase = 'path';
        return;
      }

      this.job = createRes.job;

      if (!runAi) {
        void this.router.navigate(['/homeowner', 'jobs', createRes.job.id], {
          queryParams: { hire: '1' },
        });
        return;
      }

      this.assessHint = 'Analysis may take 1–5 minutes…';
      this.progressPct = 28;
      this.scrollToAnalysis();

      const invocationId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `assess-${Date.now()}`;

      const progressTimer = window.setInterval(() => {
        this.progressPct = Math.min(92, this.progressPct + 3);
      }, 2500);

      try {
        const assessRes = await this.aiApi.assessAndWait(createRes.job.id, {
          assessmentInvocationId: invocationId,
          consents: { AI_ASSESSMENT_ACK: true },
        });

        if (!assessRes.ok || !assessRes.job) {
          this.error = assessRes.message || 'Assessment unavailable. You can still hire a pro.';
          this.job = createRes.job;
          this.assessment = null;
          this.phase = 'summary';
          return;
        }

        this.job = assessRes.job;
        this.assessment = assessRes.assessment || assessRes.job.aiAssessment || null;
        this.progressPct = 100;
        this.phase = 'summary';
      } finally {
        window.clearInterval(progressTimer);
      }
    } catch {
      this.error = 'Something went wrong submitting your request.';
      this.phase = 'path';
    } finally {
      this.submitting = false;
    }
  }

  goDiy(): void {
    if (!this.job) return;
    void this.router.navigate(['/homeowner', 'diy'], { queryParams: { jobId: this.job.id } });
  }

  goHire(): void {
    if (!this.job) return;
    void this.router.navigate(['/homeowner', 'jobs', this.job.id], {
      queryParams: { hire: '1' },
    });
  }

  reset(): void {
    this.phase = 'category';
    this.job = null;
    this.assessment = null;
    this.mediaDataUrl = null;
    this.mediaType = null;
    this.mediaName = '';
    this.error = '';
    this.progressPct = 8;
    this.form.reset({ category: '', title: '', description: '', propertyId: '' });
  }
}
