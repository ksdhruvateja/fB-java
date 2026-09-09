import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  AssessmentStatusResponse,
  ChatMessage,
  FixeraChatResult,
  StructuredAssessment,
} from '../models/assessment.model';
import { ManagedJob } from '../models/managed-job.model';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable({ providedIn: 'root' })
export class AiApiService {
  private readonly http = inject(HttpClient);

  status(): Promise<{ configured?: boolean; provider?: string; model?: string }> {
    return firstValueFrom(
      this.http.get<{ configured?: boolean; provider?: string; model?: string }>('/api/fixera/status')
    ).catch(() => ({ configured: false }));
  }

  assess(
    jobId: number,
    opts: {
      force?: boolean;
      assessmentInvocationId?: string;
      consents?: Record<string, boolean>;
    } = {}
  ): Promise<{
    ok: boolean;
    status?: string;
    assessmentStatus?: string;
    job?: ManagedJob;
    jobId?: number;
    code?: string;
    message?: string;
  }> {
    const body: Record<string, unknown> = {};
    if (opts.force) body['force'] = true;
    if (opts.assessmentInvocationId) {
      body['assessmentInvocationId'] = opts.assessmentInvocationId;
    }
    if (opts.consents) body['consents'] = opts.consents;
    return firstValueFrom(
      this.http.post<{
        ok: boolean;
        status?: string;
        assessmentStatus?: string;
        job?: ManagedJob;
        jobId?: number;
        code?: string;
        message?: string;
      }>(`/api/managed/jobs/${jobId}/assess`, body)
    ).catch(() => ({ ok: false, message: 'Could not start assessment.' }));
  }

  assessmentStatus(jobId: number): Promise<AssessmentStatusResponse> {
    return firstValueFrom(
      this.http.get<AssessmentStatusResponse>(`/api/managed/jobs/${jobId}/assessment-status`)
    ).catch(() => ({ ok: false, message: 'Could not load assessment status.' }));
  }

  /**
   * Start assess + poll status every 3s (max 50 attempts) — mirrors React assessManagedJob.
   */
  async assessAndWait(
    jobId: number,
    opts: {
      force?: boolean;
      assessmentInvocationId?: string;
      consents?: Record<string, boolean>;
    } = {}
  ): Promise<{
    ok: boolean;
    job?: ManagedJob;
    assessment?: StructuredAssessment | null;
    pricing?: AssessmentStatusResponse['pricing'];
    code?: string;
    message?: string;
  }> {
    const started = await this.assess(jobId, opts);
    if (!started.ok) {
      return {
        ok: false,
        code: started.code,
        message: started.message || 'Assessment unavailable.',
      };
    }
    if (started.status === 'ready' && started.job) {
      return {
        ok: true,
        job: started.job,
        assessment: started.job.aiAssessment,
      };
    }

    for (let attempt = 0; attempt < 50; attempt += 1) {
      await sleep(3000);
      const status = await this.assessmentStatus(jobId);
      if (!status.ok) continue;
      const st = status.status || status.assessmentStatus;
      if (st === 'ready' && status.job) {
        const job = status.job as ManagedJob;
        return {
          ok: true,
          job,
          assessment: job.aiAssessment,
          pricing: status.pricing,
        };
      }
      if (st === 'failed') {
        return {
          ok: false,
          code: status.errorCode || status.code,
          message: status.message || 'Assessment failed.',
        };
      }
    }

    return { ok: false, message: 'Assessment timed out. Please try again.' };
  }

  chat(
    messages: ChatMessage[],
    jobId?: number
  ): Promise<FixeraChatResult> {
    return firstValueFrom(
      this.http.post<FixeraChatResult>('/api/fixera/chat', {
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        jobId,
      })
    ).catch((err) => ({
      reply: null,
      source: 'error',
      error: err?.error?.message || err?.message || 'Network error calling AI chat',
      code: err?.error?.code,
    }));
  }

  fixeraStatus(): Promise<{ configured?: boolean; provider?: string; model?: string }> {
    return this.status();
  }
}
