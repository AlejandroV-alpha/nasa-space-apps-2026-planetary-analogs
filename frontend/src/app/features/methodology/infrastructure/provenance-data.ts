import { httpResource } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_BASE_URL } from '../../../core/config/api-url';
import type { MetricUnit } from '../../../core/data/analog-dataset.model';

interface SensitivityMetric {
  readonly key: string;
  readonly label: string;
  readonly value: number | null;
  readonly unit: MetricUnit;
}

interface Sensitivity {
  readonly analysisScaleM: number;
  readonly metrics: readonly SensitivityMetric[];
}

interface Provenance {
  readonly characterizationExports?: Record<
    string,
    { path: string; version: string; sha256: string }
  >;
  readonly scientificCatalogSha256: string;
  readonly coordinateFrames: Readonly<Record<string, string>>;
  readonly entities: readonly {
    readonly id: string;
    readonly sensitivity: readonly Sensitivity[];
  }[];
}

@Injectable()
export class ProvenanceData {
  private readonly apiBase = inject(API_BASE_URL);
  readonly resource = httpResource<Provenance>(
    () => ({
      url: this.apiBase + '/provenance',
      timeout: 12000,
    }),
    {
      parse: (raw) => {
        if (typeof raw !== 'object' || raw === null) {
          throw new Error('Procedencia inválida.');
        }

        const value = raw as Partial<Provenance>;
        if (
          !Array.isArray(value.entities) ||
          typeof value.scientificCatalogSha256 !== 'string' ||
          !value.coordinateFrames ||
          typeof value.coordinateFrames !== 'object' ||
          value.entities.some(
            (entity) =>
              !entity ||
              typeof entity.id !== 'string' ||
              !Array.isArray(entity.sensitivity) ||
              entity.sensitivity.some(
                (entry: Sensitivity) =>
                  !entry || !Number.isFinite(entry.analysisScaleM) || !Array.isArray(entry.metrics),
              ),
          )
        ) {
          throw new Error('Procedencia inválida.');
        }

        return {
          entities: value.entities,
          characterizationExports: value.characterizationExports,
          coordinateFrames: value.coordinateFrames,
          scientificCatalogSha256: value.scientificCatalogSha256,
        };
      },
    },
  );
}
