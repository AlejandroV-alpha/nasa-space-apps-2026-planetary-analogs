import { DOCUMENT } from '@angular/common';
import { fromEvent, map, of } from 'rxjs';
import { Component, computed, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { AnalogDataService } from '../../../core/data/analog-data.service';
import { CatalogApi } from '../../../core/data/catalog-api';
import { scienceError } from '../../../core/data/api-read';
import type { TargetBody } from '../../../core/data/analog-dataset.model';
import { DataState } from '../../../shared/components/data-state';
import {
  explorationQuery,
  resolveExploration,
  toggleCandidate,
} from '../../../shared/utils/exploration-query';
import { catalogStatus, validEarthPosition } from '../../../shared/utils/science-format';
import { CandidateMap } from './candidate-map';

@Component({
  selector: 'app-explorer',
  imports: [
    RouterLink,
    FormsModule,
    ButtonModule,
    MessageModule,
    SelectModule,
    TagModule,
    DataState,
    CandidateMap,
  ],
  templateUrl: './explorer.html',
})
export class Explorer {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly catalog = inject(AnalogDataService);
  private readonly api = inject(CatalogApi);
  protected readonly scienceError = scienceError;
  protected readonly regions = rxResource({ stream: () => this.api.regions() });
  private readonly regionCatalog = computed(() => {
    const base = this.catalog.dataset();
    if (base && this.regions.hasValue())
      return { ...base, referenceRegions: this.regions.value().items };
    return undefined;
  });
  private readonly filters = computed(
    () => {
      const selection = resolveExploration(this.params(), this.regionCatalog());
      const country = this.params().get('pais') ?? '';
      return {
        body: selection.body,
        referenceId: selection.region?.id,
        country: /^[A-Z]{2}$/.test(country) ? country : undefined,
      };
    },
    {
      equal: (a, b) =>
        a.body === b.body && a.referenceId === b.referenceId && a.country === b.country,
    },
  );
  protected readonly sites = rxResource({
    params: () => (this.regionCatalog() ? this.filters() : undefined),
    stream: ({ params }) => this.api.sites(params.body, params.referenceId, params.country),
  });
  private readonly desktopMedia = inject(DOCUMENT).defaultView?.matchMedia('(min-width: 1024px)');
  private readonly desktopMap = toSignal(
    this.desktopMedia
      ? fromEvent<MediaQueryListEvent>(this.desktopMedia, 'change').pipe(
          map((event) => event.matches),
        )
      : of(false),
    { initialValue: this.desktopMedia?.matches ?? false },
  );
  protected readonly points = rxResource({
    params: () => (this.mapView() || this.desktopMap() ? this.filters().body : undefined),
    stream: ({ params }) => this.api.points(params),
  });
  protected readonly state = computed(() => {
    const base = this.regionCatalog();
    const sites = this.sites.hasValue() ? this.sites.value().items : [];
    return resolveExploration(this.params(), base ? { ...base, sites } : undefined);
  });
  protected readonly country = computed(() => this.filters().country ?? '');
  protected readonly countries = computed(() =>
    [...new Set(this.catalog.sites().map((site) => site.country))].sort(),
  );

  protected chooseCountry(country: string): void {
    this.update({ ...this.query(), pais: country || null, sitio: null, sitios: null });
  }
  protected readonly mapView = signal(false);
  protected readonly catalogStatus = catalogStatus;
  protected readonly validEarthPosition = validEarthPosition;
  protected readonly query = computed(() => {
    const { region, siteIds, selected } = this.state();
    return explorationQuery(region, siteIds, selected?.id);
  });

  protected chooseBody(body: TargetBody): void {
    const region = this.regionCatalog()?.referenceRegions.find((item) => item.targetBody === body);
    this.update({ cuerpo: body, region: region?.id, sitio: null, sitios: null, pais: null });
  }

  protected chooseRegion(id: string): void {
    const region = this.state().regions.find((item) => item.id === id);
    if (region) {
      this.update(explorationQuery(region, []));
    }
  }

  protected selectSite(id: string): void {
    const { region, candidates, siteIds } = this.state();
    if (candidates.some((site) => site.id === id)) {
      this.update(explorationQuery(region, siteIds, id));
    }
  }

  protected toggleSite(id: string): void {
    const { region, siteIds, selected } = this.state();
    this.update(explorationQuery(region, toggleCandidate(siteIds, id), selected?.id));
  }

  private update(
    queryParams: ReturnType<typeof explorationQuery> & { pais?: string | null },
  ): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { pais: this.country() || null, ...queryParams },
      replaceUrl: true,
    });
  }
}
