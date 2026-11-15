import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TagModule } from 'primeng/tag';
import { AnalogDataService } from '../../../core/data/analog-data.service';
import { DataState } from '../../../shared/components/data-state';
import { ScienceSources } from '../../../shared/components/science-sources';
import {
  explorationQuery,
  resolveExploration,
  toggleCandidate,
} from '../../../shared/utils/exploration-query';
import {
  catalogStatus,
  formatMetric,
  METRIC_LABELS,
  validEarthPosition,
} from '../../../shared/utils/science-format';

@Component({
  selector: 'app-site-detail',
  imports: [RouterLink, TagModule, DataState, ScienceSources],
  templateUrl: './site-detail.html',
})
export class SiteDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private readonly query = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly catalog = inject(AnalogDataService);
  protected readonly site = computed(() =>
    this.catalog.siteById(this.params().get('siteId') ?? ''),
  );
  protected readonly sources = computed(() => {
    const site = this.site();
    if (!site) {
      return [];
    }

    const ids = new Set(site.sourceIds);
    for (const metric of site.metrics) {
      for (const id of metric.sourceIds) {
        ids.add(id);
      }
    }

    return this.catalog.sourcesFor(Array.from(ids));
  });
  protected readonly catalogStatus = catalogStatus;
  protected readonly labels = METRIC_LABELS;
  protected readonly formatMetric = formatMetric;
  protected readonly validEarthPosition = validEarthPosition;
  protected readonly backQuery = computed(() => {
    const site = this.site();
    const state = resolveExploration(this.query(), this.catalog.dataset());
    const assessment =
      site?.assessments.find((item) => item.referenceRegionId === state.region?.id) ??
      site?.assessments[0];
    const region = assessment
      ? this.catalog.regionById(assessment.referenceRegionId)
      : state.region;
    const ids = region?.id === state.region?.id ? state.siteIds : [];
    return explorationQuery(region, ids, site?.id);
  });

  protected comparisonQuery(regionId: string, siteId: string) {
    const state = resolveExploration(this.query(), this.catalog.dataset());
    const region = this.catalog.regionById(regionId);
    const ids = regionId === state.region?.id ? state.siteIds : [];
    const selection = ids.includes(siteId) ? ids : toggleCandidate(ids, siteId);
    return explorationQuery(region, selection, siteId);
  }
}
