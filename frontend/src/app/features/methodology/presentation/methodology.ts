import { Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { CatalogApi } from '../../../core/data/catalog-api';
import { BackendHealth } from '../../../core/data/backend-health';
import { scienceError } from '../../../core/data/api-read';
import { RouterLink } from '@angular/router';
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
  imports: [RouterLink, DataState, ScienceSources, TagModule],
  providers: [ProvenanceData],
  templateUrl: './methodology.html',
})
export class Methodology {
  private readonly api = inject(CatalogApi);
  protected readonly health = inject(BackendHealth).status;
  protected readonly scienceError = scienceError;
  protected readonly sources = rxResource({ stream: () => this.api.sources() });
  protected readonly methods = rxResource({ stream: () => this.api.methods() });
  protected readonly status = rxResource({ stream: () => this.api.status() });
  protected readonly datasetLabels = [
    { id: 'catalog', label: 'Catálogo' },
    { id: 'discovery', label: 'Descubrimiento' },
    { id: 'environment', label: 'Ambiente' },
  ] as const;
  protected readonly catalog = inject(AnalogDataService);
  protected readonly provenance = inject(ProvenanceData).resource;
  protected readonly catalogStatus = catalogStatus;
  protected readonly labels = METRIC_LABELS;
  protected readonly metricValue = metricValue;
  protected readonly formatMetric = formatMetric;

  protected readonly entries = Object.entries;

  protected entityName(id: string): string {
    return this.catalog.siteById(id)?.name ?? this.catalog.regionById(id)?.name ?? id;
  }
}
