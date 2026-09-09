import { Injectable, computed, signal } from '@angular/core';
import { Property } from '../models/property.model';

export const SELECTED_PROPERTY_KEY = 'fixbridge-selected-property';

@Injectable({ providedIn: 'root' })
export class PropertyContextService {
  private readonly selectedId = signal<number | null>(this.readStored());
  private readonly propertiesSig = signal<Property[]>([]);

  readonly propertyId = this.selectedId.asReadonly();
  readonly properties = this.propertiesSig.asReadonly();
  readonly selected = computed(() => {
    const id = this.selectedId();
    const list = this.propertiesSig();
    if (id == null) return null;
    return list.find((p) => p.id === id) || null;
  });

  setProperties(list: Property[]): void {
    this.propertiesSig.set(list || []);
    const id = this.selectedId();
    if (id != null && !list.some((p) => p.id === id)) {
      this.select(list[0]?.id ?? null);
    } else if (id == null && list.length === 1) {
      this.select(list[0].id);
    }
  }

  select(id: number | null): void {
    this.selectedId.set(id);
    this.writeStored(id);
  }

  /** Filter jobs that belong to the selected property. Unscoped when none selected. */
  filterByProperty<T extends { propertyId?: number | null }>(items: T[]): T[] {
    const id = this.selectedId();
    if (id == null) return items;
    return items.filter((j) => j.propertyId == null || Number(j.propertyId) === id);
  }

  /**
   * Filter payments by selected property when they are job-linked.
   * Pass `jobPropertyById` (jobId → propertyId) for transactions that only carry jobId.
   * Non-job payments (subscriptions, etc.) stay visible when a property is selected.
   */
  filterPaymentsByProperty<T extends { propertyId?: number | null; jobId?: number | null }>(
    items: T[],
    jobPropertyById?: Map<number, number | null | undefined>
  ): T[] {
    const id = this.selectedId();
    if (id == null) return items;
    return items.filter((t) => {
      if (t.propertyId != null) return Number(t.propertyId) === id;
      if (t.jobId == null) return true;
      const jobProp = jobPropertyById?.get(Number(t.jobId));
      if (jobProp == null) return true;
      return Number(jobProp) === id;
    });
  }

  private readStored(): number | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(SELECTED_PROPERTY_KEY);
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }

  private writeStored(id: number | null): void {
    if (typeof window === 'undefined') return;
    try {
      if (id == null) window.localStorage.removeItem(SELECTED_PROPERTY_KEY);
      else window.localStorage.setItem(SELECTED_PROPERTY_KEY, String(id));
    } catch {
      /* ignore */
    }
  }
}
