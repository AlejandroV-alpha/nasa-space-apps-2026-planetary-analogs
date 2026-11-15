import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { scienceError } from '../../../core/data/api-read';
import { AnalogDataService } from '../../../core/data/analog-data.service';
import { DataState } from '../../../shared/components/data-state';
import type { RankedWindow } from '../domain/discovery';
import type { Area } from '../domain/geographic-area';
import { WindowCharacterizationData } from '../infrastructure/window-characterization-data';
import { CandidateMap } from './candidate-map';
import { ScienceFindings } from './science-findings';
import { WindowEvidence } from './window-evidence';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ButtonModule,
    TagModule,
    DataState,
    CandidateMap,
    ScienceFindings,
    WindowEvidence,
  ],
  templateUrl: './scientific-detail.html',
})
export class ScientificDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private readonly data = inject(WindowCharacterizationData);
  private readonly catalog = inject(AnalogDataService);
  protected readonly shareStatus = signal('');
  protected async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(location.href);
      this.shareStatus.set('Enlace copiado.');
    } catch {
      this.shareStatus.set('Puedes copiar la dirección desde la barra del navegador.');
    }
  }

  protected readonly scienceError = scienceError;
  protected readonly detail = rxResource({
    params: () => this.params().get('windowId') ?? undefined,
    stream: ({ params }) => this.data.detail(params),
  });
  protected readonly study = rxResource({
    params: () => this.params().get('studyId') ?? undefined,
    stream: ({ params }) => this.data.study(params),
  });
  protected readonly result = computed(() => {
    if (this.detail.hasValue()) {
      const detail = this.detail.value();
      return { ...detail, study: undefined };
    }
    if (this.study.hasValue()) {
      const study = this.study.value();
      return {
        id: study.windowId,
        geometry: study.geometry,
        center: study.center,
        comparisons: [study.terrainResults],
        quality: undefined,
        tileId: undefined,
        study,
      };
    }
    return undefined;
  });
  protected readonly comparisons = computed(() => {
    const result = this.result();
    if (!result) return [];

    return result.comparisons.map((terrain) => {
      const reference = this.catalog.regionById(terrain.reference.id);
      const key = terrain.reference.id + '/' + result.id;
      const row: RankedWindow = {
        key,
        rank: 1,
        window: {
          id: result.id,
          type: 'Feature',
          geometry: result.geometry,
          properties: {
            center: result.center,
            tileId: result.tileId ?? '',
            comparison: terrain.comparison,
            sensitivity: terrain.sensitivity,
            quality: result.quality ?? terrain.sensitivity.quality,
          },
        },
      };
      return { row, reference: reference ?? { ...terrain.reference, sourceIds: [] } };
    });
  });
  protected readonly mapWindows = computed(() =>
    this.comparisons()
      .slice(0, 1)
      .map((item) => item.row),
  );
  protected readonly bounds = computed<Area | undefined>(() => {
    const coordinates = this.result()?.geometry.coordinates[0];
    if (!coordinates?.length) return undefined;

    const longitudes = coordinates.map(([longitude]) => longitude);
    const latitudes = coordinates.map(([, latitude]) => latitude);
    return [
      Math.min(...longitudes),
      Math.min(...latitudes),
      Math.max(...longitudes),
      Math.max(...latitudes),
    ];
  });

  protected readonly returnLink = computed(() => {
    const studyId = this.params().get('studyId');
    if (!studyId) return ['/explorar'];

    const result = this.result();
    return result ? ['/ventanas', result.id] : ['/'];
  });
}
