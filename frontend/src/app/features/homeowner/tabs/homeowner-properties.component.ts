import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Property } from '../../../core/models/property.model';
import { PropertyApiService } from '../../../core/services/property-api.service';

@Component({
  selector: 'app-homeowner-properties',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './homeowner-properties.component.html',
  styleUrl: './homeowner-properties.component.scss',
})
export class HomeownerPropertiesComponent implements OnInit {
  private readonly api = inject(PropertyApiService);
  private readonly fb = inject(FormBuilder);

  loading = true;
  saving = false;
  error = '';
  message = '';
  properties: Property[] = [];
  showForm = false;

  readonly form = this.fb.nonNullable.group({
    label: [''],
    addressLine1: ['', Validators.required],
    addressLine2: [''],
    city: [''],
    state: [''],
    zip: [''],
  });

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const res = await this.api.list();
      if (!res.ok) {
        this.error = res.message || 'Could not load properties.';
        this.properties = [];
      } else {
        this.properties = res.properties || [];
      }
    } catch {
      this.error = 'Could not load properties.';
      this.properties = [];
    } finally {
      this.loading = false;
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    this.message = '';
    this.error = '';
    try {
      const res = await this.api.create(this.form.getRawValue());
      if (!res.ok) {
        this.error = res.message || 'Could not create property.';
        return;
      }
      this.message = 'Property added.';
      this.form.reset({
        label: '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        state: '',
        zip: '',
      });
      this.showForm = false;
      await this.reload();
    } finally {
      this.saving = false;
    }
  }
}
