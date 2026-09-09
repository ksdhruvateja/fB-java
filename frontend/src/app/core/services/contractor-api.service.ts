import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ManagedJob } from '../models/managed-job.model';

export type ContractorEmployee = {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  active?: boolean;
};

@Injectable({ providedIn: 'root' })
export class ContractorApiService {
  private readonly http = inject(HttpClient);

  listEmployees(): Promise<{ ok: boolean; employees: ContractorEmployee[]; message?: string }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; employees?: ContractorEmployee[]; message?: string }>(
        '/api/contractor/employees'
      )
    )
      .then((d) => ({ ok: !!d.ok, employees: d.employees || [], message: d.message }))
      .catch(() => ({
        ok: false,
        employees: [],
        message: 'Team API not available yet.',
      }));
  }

  saveEmployee(
    body: Partial<ContractorEmployee> & { name: string },
    id?: number
  ): Promise<{ ok: boolean; employees?: ContractorEmployee[]; message?: string }> {
    const req = id
      ? this.http.put<{ ok: boolean; employees?: ContractorEmployee[]; message?: string }>(
          `/api/contractor/employees/${id}`,
          body
        )
      : this.http.post<{ ok: boolean; employees?: ContractorEmployee[]; message?: string }>(
          '/api/contractor/employees',
          body
        );
    return firstValueFrom(req).catch(() => ({
      ok: false,
      message: 'Could not save team member.',
    }));
  }

  deleteEmployee(id: number): Promise<{ ok: boolean; message?: string }> {
    return firstValueFrom(
      this.http.delete<{ ok: boolean; message?: string }>(`/api/contractor/employees/${id}`)
    ).catch(() => ({ ok: false, message: 'Could not remove team member.' }));
  }

  assignTechnician(
    jobId: number,
    employeeId: number
  ): Promise<{ ok: boolean; job?: ManagedJob; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; job?: ManagedJob; message?: string }>(
        `/api/contractor/managed/jobs/${jobId}/assign-technician`,
        { employeeId }
      )
    ).catch(() => ({ ok: false, message: 'Could not assign technician.' }));
  }

  uploadComplianceDoc(
    kind: string,
    payload: { name: string; data: string }
  ): Promise<{ ok: boolean; message?: string; user?: unknown }> {
    return firstValueFrom(
      this.http.put<{ ok: boolean; message?: string; user?: unknown }>('/api/auth/profile', {
        [`${kind}DocumentName`]: payload.name,
        [`${kind}DocumentData`]: payload.data,
      })
    ).catch(() => ({ ok: false, message: 'Could not upload document.' }));
  }
}
