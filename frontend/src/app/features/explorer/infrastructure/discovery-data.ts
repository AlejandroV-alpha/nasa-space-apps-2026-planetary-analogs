import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, forkJoin, map, of, tap, throwError, type Observable } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api-url';
import {
  mergeSearches,
  type EvidenceAvailability,
  type DiscoveryGroup,
  type DiscoveryQuery,
  type DiscoverySearch,
  type DiscoverySource,
  type DiscoveredWindow,
  type MeasuredCoverage,
  type MeasuredFootprint,
  type WindowComparison,
  type WindowQuality,
} from '../domain/discovery';
import type { DiscoveredWindowDetail } from '../domain/window-science';
import { areaSegments, type Area } from '../domain/geographic-area';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function array(value: unknown): value is unknown[] {
  return Array.isArray(value);
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function nullableNumber(value: unknown): boolean {
  return value === null || finite(value);
}
function position(value: unknown): value is [number, number] {
  return (
    array(value) &&
    value.length === 2 &&
    value.every(finite) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}
function polygon(value: unknown): boolean {
  return (
    record(value) &&
    value['type'] === 'Polygon' &&
    array(value['coordinates']) &&
    value['coordinates'].length > 0 &&
    value['coordinates'].every((ring) => {
      if (!array(ring) || ring.length < 4 || !ring.every(position)) {
        return false;
      }

      const [first] = ring;
      const last = ring[ring.length - 1];
      return (
        first[0] === last[0] &&
        first[1] === last[1] &&
        new Set(ring.map((point) => point.join(','))).size >= 3
      );
    })
  );
}
function comparison(value: unknown): value is WindowComparison {
  return (
    record(value) &&
    finite(value['analysisScaleM']) &&
    value['analysisScaleM'] > 0 &&
    (value['distance'] === null || (finite(value['distance']) && value['distance'] >= 0)) &&
    array(value['metrics']) &&
    value['metrics'].every(
      (metric) =>
        record(metric) &&
        typeof metric['key'] === 'string' &&
        (metric['unit'] === 'deg' || metric['unit'] === 'm') &&
        nullableNumber(metric['candidateValue']) &&
        nullableNumber(metric['referenceValue']) &&
        nullableNumber(metric['signedDifference']),
    )
  );
}
function quality(value: unknown): value is WindowQuality {
  return (
    record(value) &&
    typeof value['coverageMeaning'] === 'string' &&
    [value['validHeightCellFraction'], value['validSlopeCellFraction']].every(
      (fraction) => finite(fraction) && fraction >= 0 && fraction <= 1,
    )
  );
}
function windowFeature(value: unknown): value is DiscoveredWindow {
  if (
    !record(value) ||
    value['type'] !== 'Feature' ||
    typeof value['id'] !== 'string' ||
    !polygon(value['geometry']) ||
    !record(value['properties'])
  ) {
    return false;
  }

  const properties = value['properties'];
  const sensitivity = properties['sensitivity'];
  return (
    position(properties['center']) &&
    typeof properties['tileId'] === 'string' &&
    quality(properties['quality']) &&
    comparison(properties['comparison']) &&
    (sensitivity === null ||
      (record(sensitivity) && quality(sensitivity['quality']) && comparison(sensitivity)))
  );
}

function nonNegativeInteger(value: unknown): value is number {
  return finite(value) && Number.isInteger(value) && value >= 0;
}

function isBounds(value: unknown): value is Area {
  return (
    array(value) &&
    value.length === 4 &&
    value.every(finite) &&
    position(value.slice(0, 2)) &&
    position(value.slice(2)) &&
    value[0] < value[2] &&
    value[1] < value[3]
  );
}

export function isSource(value: unknown): value is DiscoverySource {
  return (
    record(value) &&
    (value['boundsWgs84'] === null || isBounds(value['boundsWgs84'])) &&
    nonNegativeInteger(value['measuredWindows']) &&
    finite(value['windowSideM']) &&
    value['windowSideM'] > 0 &&
    finite(value['centerSpacingM']) &&
    value['centerSpacingM'] > 0 &&
    array(value['tiles']) &&
    value['tiles'].every(
      (tile) =>
        record(tile) &&
        typeof tile['tileId'] === 'string' &&
        typeof tile['url'] === 'string' &&
        typeof tile['sha256'] === 'string',
    ) &&
    array(value['skippedTiles']) &&
    value['skippedTiles'].every(
      (tile) =>
        record(tile) && typeof tile['tileId'] === 'string' && typeof tile['reason'] === 'string',
    )
  );
}

function isFootprint(value: unknown): value is MeasuredFootprint {
  return (
    record(value) &&
    value['type'] === 'Feature' &&
    typeof value['id'] === 'string' &&
    polygon(value['geometry']) &&
    record(value['properties']) &&
    typeof value['properties']['tileId'] === 'string' &&
    typeof value['properties']['centerInArea'] === 'boolean'
  );
}

export function isCoverage(value: unknown): value is MeasuredCoverage {
  return (
    record(value) &&
    value['type'] === 'FeatureCollection' &&
    array(value['features']) &&
    value['features'].every(isFootprint) &&
    value['windowCount'] === value['features'].length &&
    new Set(value['features'].map(({ id }) => id)).size === value['windowCount'] &&
    value['status'] === (value['windowCount'] ? 'measured' : 'no_measured_windows')
  );
}

export function isGroup(value: unknown): value is DiscoveryGroup {
  if (
    !record(value) ||
    value['type'] !== 'FeatureCollection' ||
    !record(value['reference']) ||
    !nonNegativeInteger(value['comparableWindows']) ||
    !array(value['features']) ||
    value['comparableWindows'] < value['features'].length ||
    !value['features'].every(windowFeature)
  ) {
    return false;
  }

  const { id, name, body } = value['reference'];
  return (
    typeof id === 'string' &&
    typeof name === 'string' &&
    (body === 'moon' || body === 'mars') &&
    new Set(value['features'].map((feature) => feature.id)).size === value['features'].length
  );
}

function isEvidenceAvailability(value: unknown): value is EvidenceAvailability {
  const states = ['qualitative', 'context_only', 'catalogued', 'not_evaluated'];
  return (
    record(value) &&
    Object.values(value).every(
      (group) =>
        record(group) &&
        Object.values(group).every(
          (item) =>
            record(item) &&
            states.some((state) => state === item['geology']) &&
            states.some((state) => state === item['thermal']),
        ),
    )
  );
}

export function parseWindowDetail(
  value: DiscoveredWindowDetail,
  id: string,
): DiscoveredWindowDetail {
  if (
    value?.id !== id ||
    !position(value.center) ||
    !polygon(value.geometry) ||
    typeof value.tileId !== 'string' ||
    !quality(value.quality) ||
    !Array.isArray(value.comparisons) ||
    !value.comparisons.every(
      (item) =>
        item &&
        typeof item.reference?.id === 'string' &&
        typeof item.reference.name === 'string' &&
        (item.reference.body === 'mars' || item.reference.body === 'moon') &&
        comparison(item.comparison) &&
        comparison(item.sensitivity) &&
        quality((item.sensitivity as { quality?: unknown }).quality),
    )
  ) {
    throw new Error('Ficha de ventana inválida.');
  }
  return value;
}

export function parseSearch(raw: unknown): DiscoverySearch {
  if (
    !record(raw) ||
    raw['schemaVersion'] !== '1.0.0' ||
    !isBounds(raw['boundsWgs84']) ||
    !isSource(raw['sourceSearch']) ||
    !isCoverage(raw['coverage']) ||
    !array(raw['results']) ||
    !raw['results'].every(isGroup) ||
    new Set(raw['results'].map(({ reference }) => reference.id)).size !== raw['results'].length
  ) {
    throw new Error('Contrato de búsqueda inválido.');
  }

  const method = raw['method'];
  if (
    !record(method) ||
    typeof method['distance'] !== 'string' ||
    typeof method['ordering'] !== 'string' ||
    !array(method['limitations']) ||
    !method['limitations'].every((item) => typeof item === 'string')
  ) {
    throw new Error('Método de comparación inválido.');
  }

  return {
    schemaVersion: raw['schemaVersion'],
    boundsWgs84: raw['boundsWgs84'],
    sourceSearch: raw['sourceSearch'],
    coverage: raw['coverage'],
    evidenceAvailability: isEvidenceAvailability(raw['evidenceAvailability'])
      ? raw['evidenceAvailability']
      : undefined,
    results: raw['results'],
    method: {
      distance: method['distance'],
      ordering: method['ordering'],
      limitations: method['limitations'],
    },
  };
}

export function searchErrorText(error: unknown): string {
  if (!(error instanceof HttpErrorResponse) || (error.status >= 200 && error.status < 300)) {
    return 'La respuesta de búsqueda es inválida. Puedes reintentar.';
  }

  const body: unknown = error.error;
  const detail = record(body) ? body['detail'] : undefined;
  let message = '';
  if (typeof detail === 'string') {
    message = detail;
  } else if (array(detail)) {
    message = detail
      .filter(record)
      .map((entry) => entry['msg'])
      .filter((item) => typeof item === 'string')
      .join(' ');
  }

  switch (error.status) {
    case 0:
      return 'No se pudo conectar con FastAPI. Revisa la conexión y reintenta.';
    case 404:
      return 'La referencia o el servicio de búsqueda no están disponibles. ' + message;
    case 422:
      return 'FastAPI rechazó los límites o parámetros de búsqueda. ' + message;
    case 503:
      return 'El inventario de ventanas medidas no está disponible en FastAPI. Puedes reintentar.';
    default:
      return 'No se pudo completar la búsqueda geográfica. Puedes reintentar.';
  }
}

@Injectable({ providedIn: 'root' })
export class DiscoveryData {
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_BASE_URL);
  private readonly cache = new Map<string, { data: DiscoverySearch; expires: number }>();

  search(query: DiscoveryQuery): Observable<DiscoverySearch> {
    const parts = areaSegments(query.area);
    if (parts.length === 1) {
      return this.fetch({ ...query, area: parts[0] }).pipe(
        map((data) => ({ ...data, boundsWgs84: query.area })),
      );
    }

    // Fetch all comparable results from both halves before limiting the merged ranking.
    return forkJoin(parts.map((area) => this.fetch({ ...query, area, limit: undefined }))).pipe(
      map((responses) => mergeSearches(responses, query)),
    );
  }

  private fetch({
    area,
    referenceId,
    referenceIds,
    limit,
    includeEvidence,
  }: DiscoveryQuery): Observable<DiscoverySearch> {
    const key = JSON.stringify([area, referenceId, limit, includeEvidence || undefined]);
    const cached = this.cached(key);
    if (cached) {
      return of(cached);
    }

    const allReferences =
      referenceId &&
      this.cached(JSON.stringify([area, undefined, limit, includeEvidence || undefined]));
    if (
      allReferences &&
      allReferences.results.some((group) => group.reference.id === referenceId)
    ) {
      return of({
        ...allReferences,
        results: allReferences.results.filter((group) => group.reference.id === referenceId),
      });
    }

    if (referenceIds && referenceIds.length > 1) {
      const cachedReferences = referenceIds.map((id) =>
        this.cached(JSON.stringify([area, id, limit, includeEvidence || undefined])),
      );
      if (cachedReferences.every((data) => data !== undefined)) {
        const [first] = cachedReferences;
        if (
          cachedReferences.every(
            (data) => JSON.stringify(data.sourceSearch) === JSON.stringify(first.sourceSearch),
          )
        ) {
          return of({ ...first, results: cachedReferences.flatMap((data) => data.results) });
        }
      }
    }

    const [west, south, east, north] = area;
    const params: Record<string, string | number> = { west, south, east, north };
    if (includeEvidence) params['include_evidence'] = 'true';
    if (referenceId) params['reference_region_id'] = referenceId;
    if (limit !== undefined) {
      params['limit'] = limit;
    } else {
      params['all_results'] = 'true';
    }

    return this.http
      .get<unknown>(this.api + '/discovered-candidates/search', { params, timeout: 12000 })
      .pipe(
        map(parseSearch),
        map((data) => {
          if (
            data.boundsWgs84.join(',') !== area.join(',') ||
            (referenceId !== undefined &&
              data.results.some((group) => group.reference.id !== referenceId))
          ) {
            throw new Error('La respuesta no corresponde al área o referencia solicitada.');
          }
          return data;
        }),
        tap((data) => {
          if (this.cache.size >= 12) {
            const oldest = this.cache.keys().next();
            if (!oldest.done) this.cache.delete(oldest.value);
          }
          this.cache.set(key, { data, expires: Date.now() + 5 * 60_000 });
        }),
        catchError((error: unknown) => {
          if (!includeEvidence || !(error instanceof HttpErrorResponse) || error.status !== 503) {
            return throwError(() => error);
          }
          return this.fetch({ area, referenceId, referenceIds, limit }).pipe(
            map((data) => ({ ...data, evidenceUnavailable: true })),
          );
        }),
      );
  }

  private cached(key: string): DiscoverySearch | undefined {
    const entry = this.cache.get(key);
    if (entry && entry.expires > Date.now()) {
      return entry.data;
    }

    this.cache.delete(key);
    return undefined;
  }
}
