import { httpResource } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_BASE_URL } from '../../../core/config/api-url';
import type {
  Discovery,
  DiscoveredWindow,
  WindowComparison,
  WindowQuality,
} from '../domain/discovery';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
    nullableNumber(value['distance']) &&
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

export function parseDiscovery(raw: unknown): Discovery {
  if (
    !record(raw) ||
    raw['schemaVersion'] !== '1.0.0' ||
    !record(raw['search']) ||
    !record(raw['method']) ||
    !array(raw['results'])
  ) {
    throw new Error('Contrato de descubrimiento inválido.');
  }

  const search = raw['search'];
  const method = raw['method'];
  const measuredWindows = search['measuredWindows'];
  const windowSideM = search['windowSideM'];
  const tiles = search['tiles'];
  if (
    !finite(measuredWindows) ||
    !finite(windowSideM) ||
    !array(tiles) ||
    typeof method['distance'] !== 'string' ||
    typeof method['ordering'] !== 'string' ||
    !array(method['limitations']) ||
    !method['limitations'].every((item) => typeof item === 'string')
  ) {
    throw new Error('Metadatos de descubrimiento inválidos.');
  }

  const sources = tiles.map((tile) => {
    if (
      !record(tile) ||
      typeof tile['tileId'] !== 'string' ||
      typeof tile['url'] !== 'string' ||
      typeof tile['sha256'] !== 'string'
    ) {
      throw new Error('Tesela inválida.');
    }
    return { tileId: tile['tileId'], url: tile['url'], sha256: tile['sha256'] };
  });

  return {
    schemaVersion: raw['schemaVersion'],
    search: { measuredWindows, windowSideM, tiles: sources },
    method: {
      distance: method['distance'],
      ordering: method['ordering'],
      limitations: method['limitations'],
    },
    results: raw['results'].map((group) => {
      if (
        !record(group) ||
        group['type'] !== 'FeatureCollection' ||
        !record(group['reference']) ||
        !array(group['features']) ||
        !finite(group['comparableWindows'])
      ) {
        throw new Error('Colección de ventanas inválida.');
      }

      const { id, name, body } = group['reference'];
      if (
        typeof id !== 'string' ||
        typeof name !== 'string' ||
        (body !== 'moon' && body !== 'mars')
      ) {
        throw new Error('Referencia de descubrimiento inválida.');
      }

      const features = group['features'].filter(windowFeature);
      return {
        type: 'FeatureCollection',
        reference: { id, name, body },
        comparableWindows: group['comparableWindows'],
        invalidWindows: group['features'].length - features.length,
        features,
      };
    }),
  };
}

@Injectable({ providedIn: 'root' })
export class DiscoveryData {
  private readonly api = inject(API_BASE_URL);
  readonly resource = httpResource<Discovery>(
    () => ({ url: this.api + '/discovered-candidates', timeout: 12000 }),
    { parse: parseDiscovery },
  );
}
