import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DiyGuideStep, StructuredAssessment } from '../../../core/models/assessment.model';
import { ManagedJob } from '../../../core/models/managed-job.model';
import { PropertyContextService } from '../../../core/services/property-context.service';
import { DiyApiService } from '../../../core/services/diy-api.service';
import { ManagedJobsApiService } from '../../../core/services/managed-jobs-api.service';
import { PropertyApiService } from '../../../core/services/property-api.service';

@Component({
  selector: 'app-homeowner-diy',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './homeowner-diy.component.html',
  styleUrl: './homeowner-diy.component.scss',
})
export class HomeownerDiyComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly jobsApi = inject(ManagedJobsApiService);
  private readonly diyApi = inject(DiyApiService);
  private readonly propertyApi = inject(PropertyApiService);
  private readonly propertyCtx = inject(PropertyContextService);

  loading = true;
  starting = false;
  stopping = false;
  error = '';
  message = '';
  jobId: number | null = null;
  job: ManagedJob | null = null;
  assessment: StructuredAssessment | null = null;
  safetyAccepted = false;
  sessionStarted = false;
  steps: Array<{ title: string; body: string }> = [];
  /** Property-scoped DIY-eligible jobs when no jobId in query. */
  candidates: ManagedJob[] = [];

  async ngOnInit(): Promise<void> {
    try {
      const props = await this.propertyApi.list();
      this.propertyCtx.setProperties(props.properties || []);
    } catch {
      /* ignore */
    }

    const raw = this.route.snapshot.queryParamMap.get('jobId');
    const id = raw ? Number(raw) : NaN;
    if (!Number.isFinite(id) || id <= 0) {
      await this.loadCandidates();
      this.loading = false;
      return;
    }
    this.jobId = id;
    await this.load();
  }

  async loadCandidates(): Promise<void> {
    try {
      const res = await this.jobsApi.listMine();
      const scoped = this.propertyCtx.filterByProperty(res.jobs || []);
      this.candidates = scoped.filter((j) => {
        const a = j.aiAssessment;
        return !!(a?.diy_guide_steps?.length || a?.diy_steps?.length || a?.diy_difficulty);
      });
      if (!this.candidates.length) {
        this.error =
          'No DIY guides for this property yet. Start from a service request assessment, or switch property.';
      }
    } catch {
      this.error = 'Could not load DIY options for this property.';
    }
  }

  openCandidate(job: ManagedJob): void {
    void this.router.navigate(['/homeowner/diy'], { queryParams: { jobId: job.id } });
  }

  async load(): Promise<void> {
    if (!this.jobId) return;
    this.loading = true;
    this.error = '';
    try {
      const res = await this.jobsApi.get(this.jobId);
      if (!res.ok || !res.job) {
        this.error = res.message || 'Could not load this job.';
        this.job = null;
        return;
      }
      const selected = this.propertyCtx.propertyId();
      if (
        selected != null &&
        res.job.propertyId != null &&
        Number(res.job.propertyId) !== selected
      ) {
        this.error = 'This DIY guide belongs to another property. Switch property or pick another job.';
        this.job = null;
        await this.loadCandidates();
        return;
      }
      this.job = res.job;
      this.assessment = res.job.aiAssessment || null;
      this.steps = this.buildSteps(this.assessment);
    } catch {
      this.error = 'Could not load DIY session.';
      this.job = null;
    } finally {
      this.loading = false;
    }
  }

  private buildSteps(a: StructuredAssessment | null): Array<{ title: string; body: string }> {
    if (!a) return [];
    const guide = a.diy_guide_steps || [];
    if (guide.length) {
      return guide.map((s: DiyGuideStep, i) => ({
        title: s.title || `Step ${s.step_number || i + 1}`,
        body: [s.instruction, s.explanation, s.safety_note].filter(Boolean).join('\n\n'),
      }));
    }
    const simple = a.diy_steps || [];
    if (simple.length) {
      return simple.map((body, i) => ({ title: `Step ${i + 1}`, body }));
    }
    if (a.immediate_safety_steps?.length) {
      return a.immediate_safety_steps.map((body, i) => ({
        title: `Safety ${i + 1}`,
        body,
      }));
    }
    return [];
  }

  async startSession(): Promise<void> {
    if (!this.jobId || !this.safetyAccepted || this.starting) return;
    this.starting = true;
    this.error = '';
    this.message = '';
    try {
      const res = await this.diyApi.startSafety({
        jobId: this.jobId,
        acknowledged: true,
        consents: {
          DIY_SAFETY: true,
          DIY_SAFETY_ABILITY_ACK: true,
        },
      });
      if (!res.ok) {
        this.error = res.message || 'Could not start DIY session.';
        return;
      }
      this.sessionStarted = true;
      this.message = 'DIY session started. Follow each step carefully.';
    } finally {
      this.starting = false;
    }
  }

  async stopEscalate(): Promise<void> {
    if (!this.jobId || this.stopping) return;
    this.stopping = true;
    this.error = '';
    try {
      const res = await this.diyApi.stopAndEscalate(this.jobId);
      if (!res.ok) {
        this.error = res.message || 'Could not escalate.';
        return;
      }
      await this.router.navigate(['/homeowner/jobs', this.jobId], {
        queryParams: { hire: '1' },
      });
    } finally {
      this.stopping = false;
    }
  }
}
