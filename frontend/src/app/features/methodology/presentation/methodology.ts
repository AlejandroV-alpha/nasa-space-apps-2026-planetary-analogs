import { Component, inject } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { AnalogDataService } from '../../../core/data/analog-data.service';
import { DataState } from '../../../shared/components/data-state';
import { ScienceSources } from '../../../shared/components/science-sources';
import {
  catalogStatus,
  formatMetric,
  METRIC_LABELS,
  metricValue,
} from '../../../shared/utils/science-format';
import { ProvenanceData } from '../infrastructure/provenance-data';

@Component({
  selector: 'app-methodology',
  imports: [DataState, ScienceSources, TagModule],
  providers: [ProvenanceData],
  templateUrl: './methodology.html',
})
export class Methodology {
  protected readonly catalog = inject(AnalogDataService);
  protected readonly provenance = inject(ProvenanceData).resource;
  protected readonly catalogStatus = catalogStatus;
  protected readonly labels = METRIC_LABELS;
  protected readonly metricValue = metricValue;
  protected readonly formatMetric = formatMetric;

  protected entityName(id: string): string {
    return this.catalog.siteById(id)?.name ?? this.catalog.regionById(id)?.name ?? id;
  }
}
