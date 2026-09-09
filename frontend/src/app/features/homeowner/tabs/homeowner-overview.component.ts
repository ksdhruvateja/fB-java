import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ManagedJob } from '../../../core/models/managed-job.model';
import { Property } from '../../../core/models/property.model';
import { PropertyContextService } from '../../../core/services/property-context.service';
import { ManagedJobsApiService } from '../../../core/services/managed-jobs-api.service';
import { PropertyApiService } from '../../../core/services/property-api.service';
import { LoadingSkeletonComponent } from '../../../shared/components/loading-skeleton.component';

@Component({
  selector: 'app-homeowner-overview',
  standalone: true,
  imports: [RouterLink, LoadingSkeletonComponent],
  templateUrl: './homeowner-overview.component.html',
  styleUrl: './homeowner-overview.component.scss',
})
export class HomeownerOverviewComponent implements OnInit {
  private readonly propertiesApi = inject(PropertyApiService);
  private readonly jobsApi = inject(ManagedJobsApiService);
  private readonly propertyCtx = inject(PropertyContextService);

  loading = true;
  error = '';
  properties: Property[] = [];
  allJobs: ManagedJob[] = [];

  get jobs(): ManagedJob[] {
    void this.propertyCtx.propertyId();
    return this.propertyCtx.filterByProperty(this.allJobs).slice(0, 8);
  }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const [props, jobs] = await Promise.all([
        this.propertiesApi.list(),
        this.jobsApi.listMine(),
      ]);
      if (!props.ok && !jobs.ok) {
        this.error = props.message || jobs.message || 'Could not load your dashboard.';
      } else {
        if (!props.ok) this.error = props.message || 'Could not load properties.';
        if (!jobs.ok && !this.error) this.error = jobs.message || 'Could not load jobs.';
      }
      this.properties = props.properties || [];
      this.propertyCtx.setProperties(this.properties);
      this.allJobs = jobs.jobs || [];
    } catch {
      this.error = 'Something went wrong loading your home.';
      this.properties = [];
      this.allJobs = [];
    } finally {
      this.loading = false;
    }
  }
}
