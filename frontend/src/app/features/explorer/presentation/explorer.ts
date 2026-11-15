import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { AnalogDataService } from '../../../core/data/analog-data.service';
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
  protected readonly state = computed(() =>
    resolveExploration(this.params(), this.catalog.dataset()),
  );
  protected readonly mapView = signal(false);
  protected readonly catalogStatus = catalogStatus;
  protected readonly validEarthPosition = validEarthPosition;
  protected readonly query = computed(() => {
    const { region, siteIds, selected } = this.state();
    return explorationQuery(region, siteIds, selected?.id);
  });

  protected chooseBody(body: TargetBody): void {
    const region = this.catalog.regionsFor(body)[0];
    this.update({ cuerpo: body, region: region?.id ?? null, sitio: null, sitios: null });
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

  private update(queryParams: ReturnType<typeof explorationQuery>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl: true });
  }
}
