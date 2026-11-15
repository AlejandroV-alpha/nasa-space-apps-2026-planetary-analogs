import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { AnalogDataService } from '../../../core/data/analog-data.service';
import { DataState } from '../../../shared/components/data-state';
import {
  explorationQuery,
  resolveExploration,
  toggleCandidate,
} from '../../../shared/utils/exploration-query';
import {
  catalogStatus,
  formatMetric,
  METRIC_LABELS,
  metricValue,
} from '../../../shared/utils/science-format';
import { ComparisonSession } from '../application/comparison-session';
import type { ServerComparisonRow } from '../domain/comparison';

@Component({
  selector: 'app-comparison',
  imports: [
    RouterLink,
    FormsModule,
    ButtonModule,
    MessageModule,
    SelectModule,
    TagModule,
    DataState,
  ],
  providers: [ComparisonSession],
  templateUrl: './comparison.html',
})
export class Comparison {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly catalog = inject(AnalogDataService);
  protected readonly references = computed(() => Array.from(this.catalog.referenceRegions()));
  protected readonly session = inject(ComparisonSession);
  protected readonly state = computed(() =>
    resolveExploration(this.params(), this.catalog.dataset()),
  );
  protected readonly query = computed(() => {
    const { region, siteIds } = this.state();
    return explorationQuery(region, siteIds);
  });
  protected readonly catalogStatus = catalogStatus;
  protected readonly labels = METRIC_LABELS;
  protected readonly formatMetric = formatMetric;

  constructor() {
    effect(() => {
      this.params();
      this.session.clear();
    });
  }

  protected chooseReference(id: string): void {
    const region = this.catalog.regionById(id);
    if (region) {
      this.update(explorationQuery(region, []));
    }
  }

  protected toggleSite(id: string): void {
    const { candidates, region, siteIds } = this.state();
    if (candidates.some((candidate) => candidate.id === id)) {
      this.update(explorationQuery(region, toggleCandidate(siteIds, id)));
    }
  }

  protected submit(): void {
    const { region, siteIds } = this.state();
    if (region) {
      this.session.submit(region.id, siteIds);
    }
  }

  protected difference(row: ServerComparisonRow, index: number): string {
    if (!row.comparable || !row.reference) {
      return '—';
    }

    return metricValue(row.signed_differences[index], row.reference.unit, true);
  }

  private update(queryParams: ReturnType<typeof explorationQuery>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl: true });
  }
}
