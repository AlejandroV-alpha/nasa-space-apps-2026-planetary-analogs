import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { AnalogDataService } from '../../../core/data/analog-data.service';
import { BackendHealth } from '../../../core/data/backend-health';
import type { TargetBody } from '../../../core/data/analog-dataset.model';
import { DataState } from '../../../shared/components/data-state';
import { catalogStatus, metricValue } from '../../../shared/utils/science-format';
import { filterGroups, WINDOW_METRICS, type Destination } from '../domain/discovery';
import { areaFrom, type Area } from '../domain/geographic-area';
import { DiscoveryData } from '../infrastructure/discovery-data';
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
  protected readonly discovery = inject(DiscoveryData).resource;
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
  protected readonly savedArea = computed(() =>
    areaFrom((this.params().get('area') ?? '').split(',')),
  );
  protected readonly pendingCoordinates = signal<string[] | undefined>(undefined);
  protected readonly coordinates = computed(
    () => this.pendingCoordinates() ?? this.savedArea()?.map(String) ?? ['', '', '', ''],
  );
  protected readonly draftArea = computed(() => areaFrom(this.coordinates()));
  protected readonly badArea = signal(false);
  protected readonly hasChanges = computed(() => this.pendingCoordinates() !== undefined);
  protected readonly groups = computed(() => {
    const results = this.discovery.hasValue() ? this.discovery.value().results : [];
    const area = this.hasChanges() ? undefined : this.savedArea();
    const ids = this.references().flatMap(({ selected }) => (selected ? [selected.id] : []));
    return filterGroups(results, ids, area);
  });
  protected readonly windows = computed(() => this.groups().flatMap((group) => group.rows));
  protected readonly invalidWindows = computed(() => {
    if (!this.discovery.hasValue()) {
      return 0;
    }
    const selectedIds = new Set(this.references().map(({ selected }) => selected?.id));
    return this.discovery
      .value()
      .results.reduce(
        (total, group) => total + (selectedIds.has(group.reference.id) ? group.invalidWindows : 0),
        0,
      );
  });
  protected readonly selected = computed(() =>
    this.windows().find((row) => row.key === this.params().get('ventana')),
  );
  protected readonly unavailableWindow = computed(
    () => this.params().has('ventana') && !this.selected(),
  );
  protected readonly paramsHaveInvalidArea = computed(
    () => this.params().has('area') && !this.savedArea(),
  );
  protected readonly related = computed(() => {
    const selected = this.selected();
    if (!selected || !this.discovery.hasValue()) {
      return [];
    }

    const results = this.discovery.value().results;
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
    this.update({ cuerpo: destination, region: null, ventana: null });
  }

  protected chooseReference(body: TargetBody, id: string): void {
    this.update({ [body]: id, region: null, ventana: null });
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
    if (
      (this.params().get('area') === bounds && !this.params().has('ventana')) ||
      (await this.update({ area: bounds, ventana: null }))
    ) {
      this.pendingCoordinates.set(undefined);
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
