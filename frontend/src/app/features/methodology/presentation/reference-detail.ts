import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CatalogApi } from '../../../core/data/catalog-api';
import { AnalogDataService } from '../../../core/data/analog-data.service';
import { scienceError } from '../../../core/data/api-read';
import { DataState } from '../../../shared/components/data-state';
import { ScienceSources } from '../../../shared/components/science-sources';
import { formatMetric, METRIC_LABELS } from '../../../shared/utils/science-format';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DataState, ScienceSources],
  template: `
    <section class="mx-auto max-w-5xl space-y-5 px-5 py-6 sm:px-8">
      <a
        routerLink="/explorar/catalogo"
        queryParamsHandling="preserve"
        class="inline-block py-2 font-semibold text-primary underline"
        >Volver a sitios conocidos</a
      >
      <app-data-state
        [loading]="reference.isLoading()"
        [failed]="!!reference.error()"
        [errorText]="scienceError(reference.error())"
        (retry)="reference.reload()"
      >
        @if (reference.hasValue()) {
          @let item = reference.value();
          <header class="rounded-2xl bg-mission p-6 text-surface-0">
            <p class="mb-2 text-sm text-primary-200">
              {{ item.targetBody === 'moon' ? 'Luna' : 'Marte' }}
            </p>
            <h1 class="text-3xl font-semibold sm:text-4xl">{{ item.name }}</h1>
            <p class="mt-3">{{ item.description }}</p>
          </header>
          <section class="mt-5 space-y-3" aria-label="Indicadores de referencia">
            <p>{{ item.selectionRationale }}</p>
            <p class="break-words text-sm text-muted-color">
              {{ item.crs }} · {{ item.center.coordinates[0] }}°, {{ item.center.coordinates[1] }}°
            </p>
            <dl class="grid gap-3 sm:grid-cols-3">
              @for (metric of item.metrics; track metric.key) {
                <div class="rounded-xl border border-surface-200 p-4 dark:border-surface-700">
                  <dt>{{ labels[metric.key] }}</dt>
                  <dd class="mt-1 text-xl font-semibold">{{ formatMetric(metric) }}</dd>
                </div>
              }
            </dl>
            <app-science-sources [sources]="sources()" />
          </section>
        }
      </app-data-state>
    </section>
  `,
})
export class ReferenceDetail {
  private readonly api = inject(CatalogApi);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private readonly catalog = inject(AnalogDataService);
  protected readonly scienceError = scienceError;
  protected readonly labels = METRIC_LABELS;
  protected readonly formatMetric = formatMetric;
  protected readonly reference = rxResource({
    params: () => this.params().get('regionId') ?? undefined,
    stream: ({ params }) => this.api.region(params),
  });
  protected readonly sources = computed(() =>
    this.reference.hasValue() ? this.catalog.sourcesFor(this.reference.value().sourceIds) : [],
  );
}
