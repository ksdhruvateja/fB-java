import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  CreatePropertyBody,
  Property,
  PropertyDocument,
  UploadPropertyDocumentBody,
} from '../models/property.model';

@Injectable({ providedIn: 'root' })
export class PropertyApiService {
  private readonly http = inject(HttpClient);

  list(): Promise<{ ok: boolean; properties: Property[]; message?: string }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; properties: Property[]; message?: string }>('/api/properties')
    ).catch(() => ({ ok: false, properties: [], message: 'Could not load properties.' }));
  }

  get(propertyId: number): Promise<{ ok: boolean; property?: Property; message?: string }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; property?: Property; message?: string }>(
        `/api/properties/${propertyId}`
      )
    ).catch(() => ({ ok: false, message: 'Could not load property.' }));
  }

  create(body: CreatePropertyBody): Promise<{ ok: boolean; property?: Property; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; property?: Property; message?: string }>('/api/properties', body)
    ).catch(() => ({ ok: false, message: 'Could not create property.' }));
  }

  update(
    propertyId: number,
    body: Partial<Property>
  ): Promise<{ ok: boolean; property?: Property; message?: string }> {
    return firstValueFrom(
      this.http.put<{ ok: boolean; property?: Property; message?: string }>(
        `/api/properties/${propertyId}`,
        body
      )
    ).catch(() => ({ ok: false, message: 'Could not update property.' }));
  }

  /** List documents — prefers dedicated list route, falls back to property payload. */
  async listDocuments(
    propertyId: number
  ): Promise<{ ok: boolean; documents: PropertyDocument[]; message?: string }> {
    try {
      const listed = await firstValueFrom(
        this.http.get<{ ok?: boolean; documents?: PropertyDocument[]; message?: string }>(
          `/api/properties/${propertyId}/documents`
        )
      );
      if (Array.isArray(listed.documents)) {
        return { ok: listed.ok !== false, documents: listed.documents, message: listed.message };
      }
    } catch {
      /* fall through to property GET */
    }
    const prop = await this.get(propertyId);
    if (!prop.ok || !prop.property) {
      return { ok: false, documents: [], message: prop.message || 'Could not load documents.' };
    }
    return { ok: true, documents: prop.property.documents || [] };
  }

  uploadDocument(
    propertyId: number,
    body: UploadPropertyDocumentBody
  ): Promise<{ ok: boolean; document?: PropertyDocument; message?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; document?: PropertyDocument; message?: string }>(
        `/api/properties/${propertyId}/documents`,
        body
      )
    ).catch(() => ({ ok: false, message: 'Could not upload document.' }));
  }

  deleteDocument(
    propertyId: number,
    docId: number
  ): Promise<{ ok: boolean; message?: string }> {
    return firstValueFrom(
      this.http.delete<{ ok: boolean; message?: string }>(
        `/api/properties/${propertyId}/documents/${docId}`
      )
    ).catch(() => ({ ok: false, message: 'Could not delete document.' }));
  }
}
