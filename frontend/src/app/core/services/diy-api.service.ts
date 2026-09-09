import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type DiyProject = {
  id?: number;
  title?: string;
  jobId?: number | null;
  plan?: Record<string, unknown>;
  status?: string;
  createdAt?: string;
};

@Injectable({ providedIn: 'root' })
export class DiyApiService {
  private readonly http = inject(HttpClient);

  listProjects(): Promise<{ ok: boolean; projects: DiyProject[]; message?: string }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; projects?: DiyProject[]; message?: string }>('/api/diy/projects')
    )
      .then((data) => ({
        ok: !!data.ok,
        projects: data.projects || [],
        message: data.message,
      }))
      .catch(() => ({ ok: false, projects: [], message: 'Could not load DIY projects.' }));
  }

  createProject(body: {
    title?: string;
    jobId?: number;
    plan: Record<string, unknown>;
  }): Promise<{ ok: boolean; project?: DiyProject; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; project?: DiyProject; message?: string }>(
        '/api/diy/projects',
        body
      )
    ).catch(() => ({ ok: false, message: 'Could not save DIY project.' }));
  }

  updateSteps(
    projectId: number,
    steps: unknown
  ): Promise<{ ok: boolean; project?: DiyProject; message?: string }> {
    return firstValueFrom(
      this.http.put<{ ok: boolean; project?: DiyProject; message?: string }>(
        `/api/diy/projects/${projectId}/steps`,
        { steps }
      )
    ).catch(() => ({ ok: false, message: 'Could not update DIY steps.' }));
  }

  startSafety(body: {
    jobId?: number;
    consents?: Record<string, boolean>;
    acknowledged?: boolean;
  } = {}): Promise<{ ok: boolean; message?: string; code?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; message?: string; code?: string }>(
        '/api/homeowner/diy-safety/start',
        body
      )
    ).catch(() => ({ ok: false, message: 'Could not start DIY safety session.' }));
  }

  stopAndEscalate(jobId: number): Promise<{ ok: boolean; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; message?: string }>('/api/homeowner/diy-safety/stop', {
        jobId,
      })
    ).catch(() => ({ ok: false, message: 'Could not stop DIY session.' }));
  }

  feedback(input: {
    jobId?: number;
    rating: 'helpful' | 'not_helpful' | 'unsafe';
    message?: string;
    riskLevel?: string;
  }): Promise<{ ok: boolean; eventId?: number; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; eventId?: number; message?: string }>(
        '/api/homeowner/diy-safety/feedback',
        input
      )
    ).catch(() => ({ ok: false, message: 'Could not submit feedback.' }));
  }
}
