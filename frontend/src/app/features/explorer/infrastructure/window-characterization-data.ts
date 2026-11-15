import { Injectable, inject } from '@angular/core';
import { ApiRead } from '../../../core/data/api-read';
import type {
  Application,
  ApplicationsResponse,
  CandidateDiscovery,
  DiscoveredWindowDetail,
  EvidenceResponse,
  GeologyResponse,
  StudyResponse,
  ThermalResponse,
} from '../domain/window-science';
import type { MeasuredCoverage } from '../domain/discovery';
import { isCoverage, isGroup, isSource, parseWindowDetail } from './discovery-data';

export interface WindowReference {
  windowId: string;
  referenceRegionId: string;
}

const windows = '/discovered-candidates';

@Injectable({ providedIn: 'root' })
export class WindowCharacterizationData {
  private readonly api = inject(ApiRead);

  geology(selection: WindowReference) {
    return this.forPair<GeologyResponse>(
      selection,
      'geology',
      (value) =>
        ['qualitative', 'unavailable'].includes(value.status) &&
        !!value.earth &&
        !!value.planetary &&
        Array.isArray(value.comparison?.limitations),
    );
  }

  thermal(selection: WindowReference) {
    return this.forPair<ThermalResponse>(
      selection,
      'thermal',
      (value) =>
        !!value.earth &&
        !!value.planetary &&
        typeof value.comparison?.comparable === 'boolean' &&
        typeof value.comparison.reason === 'string',
    );
  }

  applications(selection: WindowReference, mission?: Application['type']) {
    return this.forPair<ApplicationsResponse>(
      selection,
      'applications',
      (value) =>
        Array.isArray(value.applications) &&
        value.applications.every(
          (item) =>
            ['rover_mobility', 'geological_sampling', 'field_operations'].includes(item?.type) &&
            item.validatedForOperations === false &&
            Array.isArray(item.missingEvidence) &&
            Array.isArray(item.supportingMetrics),
        ),
      mission ? { mission_type: mission } : {},
    );
  }

  evidence(selection: WindowReference) {
    return this.forPair<EvidenceResponse>(
      selection,
      'evidence',
      (value) =>
        !!value.dimensions?.topography &&
        !!value.dimensions.geology &&
        !!value.dimensions.thermal &&
        value.scientificReview?.status === 'pending' &&
        Array.isArray(value.relatedStudies) &&
        Array.isArray(value.sources) &&
        Array.isArray(value.limitations),
    );
  }

  detail(id: string) {
    return this.api.get<DiscoveredWindowDetail>(
      windows + '/' + encodeURIComponent(id),
      {},
      (value) => parseWindowDetail(value, id),
    );
  }

  coverage() {
    return this.api.get<MeasuredCoverage>('/discovery-coverage', {}, (value) => {
      if (!isCoverage(value)) throw new Error('Cobertura científica inválida.');
      return value;
    });
  }

  highlights() {
    return this.api.get<CandidateDiscovery>(windows, {}, (value) => {
      if (
        value?.schemaVersion !== '1.0.0' ||
        !isSource(value.search) ||
        !Array.isArray(value.results) ||
        !value.results.every(isGroup) ||
        !value.method
      ) {
        throw new Error('Listado resumido inválido.');
      }
      return value;
    });
  }

  study(id: string) {
    return this.api.get<StudyResponse>('/analog-studies/' + encodeURIComponent(id), {}, (value) => {
      if (
        value?.id !== id ||
        !value.windowId ||
        !value.referenceRegionId ||
        typeof value.researchQuestion !== 'string' ||
        !value.terrainResults ||
        !value.thermalResults ||
        !value.geologyResults ||
        !Array.isArray(value.potentialApplications) ||
        !Array.isArray(value.sources) ||
        !Array.isArray(value.limitations)
      ) {
        throw new Error('El caso de estudio recibido es incompatible.');
      }
      return value;
    });
  }

  private forPair<T extends WindowReference>(
    selection: WindowReference,
    suffix: string,
    isValid: (value: T) => boolean,
    params: Record<string, string> = {},
  ) {
    return this.api.get<T>(
      windows + '/' + encodeURIComponent(selection.windowId) + '/' + suffix,
      { reference_region_id: selection.referenceRegionId, ...params },
      (value) => {
        if (
          value?.windowId !== selection.windowId ||
          value.referenceRegionId !== selection.referenceRegionId ||
          !isValid(value)
        ) {
          throw new Error('La respuesta no corresponde al par científico solicitado.');
        }
        return value;
      },
    );
  }
}
