import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { AnalogDataService } from '../../../core/data/analog-data.service';
import { BackendHealth } from '../../../core/data/backend-health';
import type { TargetBody } from '../../../core/data/analog-dataset.model';
import { DataState } from '../../../shared/components/data-state';
import { catalogStatus, metricValue } from '../../../shared/utils/science-format';
import {
  rankWindows,
  WINDOW_METRICS,
  type Destination,
  type DiscoveryQuery,
} from '../domain/discovery';
import { areaFrom, type Area } from '../domain/geographic-area';
import { DiscoveryData, searchErrorText } from '../infrastructure/discovery-data';
import { CandidateMap } from './candidate-map';
import { WindowEvidence } from './window-evidence';

@Component({
  selector: 'app-discovery-explorer',
  imports: [
    RouterLink,
    FormsModule,
    ButtonModule,
    SelectModule,
    DataState,
    CandidateMap,
    WindowEvidence,
  ],
  templateUrl: './discovery-explorer.html',
})
export class DiscoveryExplorer {
  private readonly map = viewChild(CandidateMap);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly catalog = inject(AnalogDataService);
  private readonly discoveryData = inject(DiscoveryData);
  protected readonly searchErrorText = searchErrorText;
  protected readonly health = inject(BackendHealth).status;
  protected readonly catalogStatus = catalogStatus;
  protected readonly labels = WINDOW_METRICS;
  protected readonly metricValue = metricValue;
  protected readonly coordinateLabels = ['Oeste', 'Sur', 'Este', 'Norte'];
  protected readonly destinations = [
    { id: 'mars', label: 'Marte' },
    { id: 'moon', label: 'Luna' },
    { id: 'both', label: 'Ambos' },
  ] as const;
  protected readonly destination = computed<Destination>(() => {
    const body = this.params().get('cuerpo');
    if (body === 'moon' || body === 'both' || body === 'mars') {
      return body;
    }
    return this.catalog.regionById(this.params().get('region') ?? '')?.targetBody ?? 'mars';
  });
  protected readonly references = computed(() => {
    const destination = this.destination();
    const bodies: TargetBody[] = destination === 'both' ? ['mars', 'moon'] : [destination];
    return bodies.map((body) => {
      const options = this.catalog.regionsFor(body);
      const requested = this.params().get(body);
      const legacy = this.params().get('region');
      const selected = options.find((option) => option.id === (requested ?? legacy)) ?? options[0];
      return { body, options, selected, invalid: requested !== null && requested !== selected?.id };
    });
  });
  protected readonly savedArea = computed(
    () => areaFrom((this.params().get('area') ?? '').split(',')),
    { equal: (previous, next) => previous?.join(',') === next?.join(',') },
  );
  protected readonly pendingCoordinates = signal<string[] | undefined>(undefined);
  protected readonly coordinates = computed(
    () => this.pendingCoordinates() ?? this.savedArea()?.map(String) ?? ['', '', '', ''],
  );
  protected readonly draftArea = computed(() => areaFrom(this.coordinates()));
  protected readonly badArea = signal(false);
  protected readonly hasChanges = computed(() => this.pendingCoordinates() !== undefined);
  private readonly query = computed<DiscoveryQuery | undefined>(
    () => {
      const area = this.savedArea();
      const references = this.references();
      if (!area || !references.some((entry) => entry.selected)) {
        return undefined;
      }

      return this.destination() === 'both'
        ? {
            area,
            referenceIds: references.flatMap(({ selected }) => (selected ? [selected.id] : [])),
          }
        : { area, referenceId: references[0].selected?.id };
    },
    {
      equal: (previous, next) =>
        previous?.area === next?.area &&
        previous?.referenceId === next?.referenceId &&
        previous?.referenceIds?.join(',') === next?.referenceIds?.join(','),
    },
  );

  protected readonly discovery = rxResource({
    params: this.query,
    stream: ({ params }) => this.discoveryData.search(params),
  });
  protected readonly result = computed(() => {
    if (!this.hasChanges() && this.discovery.hasValue()) {
      return this.discovery.value();
    }
    return undefined;
  });
  protected readonly coverage = computed(() => this.result()?.coverage);
  protected readonly hasMeasuredCenters = computed(() =>
    this.coverage()?.features.some((feature) => feature.properties.centerInArea),
  );
  protected readonly groups = computed(() => {
    const result = this.result();
    if (!result) return [];

    return this.references().flatMap(({ selected }) => {
      if (!selected) return [];

      const group = result.results.find((item) => item.reference.id === selected.id);
      return [
        {
          regionId: selected.id,
          comparableWindows: group?.comparableWindows ?? 0,
          rows: group ? rankWindows(group) : [],
        },
      ];
    });
  });
  protected readonly windows = computed(() => this.groups().flatMap((group) => group.rows));
  protected readonly selected = computed(() => {
    const key = this.params().get('ventana');
    if (!key) return undefined;

    const id = key.slice(key.indexOf('/') + 1);
    return (
      this.windows().find((row) => row.key === key) ??
      this.windows().find((row) => row.window.id === id)
    );
  });
  protected readonly unavailableWindow = computed(
    () => this.params().has('ventana') && !this.selected(),
  );
  protected readonly paramsHaveInvalidArea = computed(
    () => this.params().has('area') && !this.savedArea(),
  );
  protected readonly related = computed(() => {
    const selected = this.selected();
    const result = this.result();
    if (!selected || !result) {
      return [];
    }

    const results = result.results;
    return this.references().flatMap(({ selected: region }) => {
      const window = results
        .find((group) => group.reference.id === region?.id)
        ?.features.find(({ id }) => id === selected.window.id);
      return region && window ? [{ region, window }] : [];
    });
  });
  protected readonly catalogQuery = computed(() => ({
    cuerpo: this.references()[0]?.body,
    region: this.references()[0]?.selected?.id,
    sitio: this.params().get('sitio'),
    sitios: this.params().get('sitios'),
  }));

  protected chooseDestination(destination: Destination): void {
    void this.update({ cuerpo: destination, region: null });
  }

  protected chooseReference(body: TargetBody, id: string): void {
    void this.update({ [body]: id, region: null });
  }

  protected coordinateChanged(index: number, value: string): void {
    this.map()?.cancelDraw();
    const values = Array.from(this.coordinates());
    values[index] = value;
    this.pendingCoordinates.set(values);
    this.badArea.set(false);
  }

  protected drawArea(area: Area | undefined): void {
    this.pendingCoordinates.set(area?.map(String) ?? ['', '', '', '']);
    this.badArea.set(false);
  }

  protected async search(): Promise<void> {
    const area = this.draftArea();
    if (!area) {
      this.badArea.set(true);
      return;
    }
    const bounds = area.join(',');
    if (this.params().get('area') === bounds) {
      this.pendingCoordinates.set(undefined);
      this.discovery.reload();
      return;
    }

    const submitted = this.pendingCoordinates();
    if (await this.update({ area: bounds, ventana: null })) {
      if (this.pendingCoordinates() === submitted) this.pendingCoordinates.set(undefined);
    }
  }

  protected clear(): void {
    this.map()?.cancelDraw();
    this.drawArea(undefined);
    void this.update({ area: null, ventana: null });
  }

  protected reset(): void {
    this.map()?.cancelDraw();
    this.drawArea(undefined);
    void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }

  protected select(key: string): void {
    if (this.windows().some((row) => row.key === key)) {
      void this.update({ ventana: key });
    }
  }

  protected openSite(id: string): void {
    void this.router.navigate(['/sitios', id], {
      queryParams: { ...this.route.snapshot.queryParams, desde: 'descubrimiento' },
    });
  }

  private update(queryParams: Record<string, string | null>): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
