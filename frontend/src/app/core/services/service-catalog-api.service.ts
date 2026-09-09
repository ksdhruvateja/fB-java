import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ServiceOffering } from '../models/service-offering.model';

@Injectable({ providedIn: 'root' })
export class ServiceCatalogApiService {
  private readonly http = inject(HttpClient);

  listHomeServices(): Promise<{ ok: boolean; offerings: ServiceOffering[]; message?: string }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; offerings: ServiceOffering[]; message?: string }>('/api/home-services')
    ).catch(() => ({ ok: false, offerings: [], message: 'Could not load services.' }));
  }

  listAdminServices(): Promise<{ ok: boolean; offerings: ServiceOffering[]; message?: string }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; offerings: ServiceOffering[]; message?: string }>('/api/admin/services')
    ).catch(() => ({ ok: false, offerings: [], message: 'Could not load admin services.' }));
  }

  updateAdminService(
    id: string,
    body: Partial<ServiceOffering>
  ): Promise<{ ok: boolean; offering?: ServiceOffering; message?: string }> {
    return firstValueFrom(
      this.http.put<{ ok: boolean; offering?: ServiceOffering; message?: string }>(
        `/api/admin/services/${encodeURIComponent(id)}`,
        body
      )
    ).catch(() => ({ ok: false, message: 'Could not update service.' }));
  }
}
