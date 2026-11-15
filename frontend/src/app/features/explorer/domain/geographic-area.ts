import type { Polygon } from 'geojson';

export type Area = readonly [west: number, south: number, east: number, north: number];

export function areaFrom(values: readonly (number | string)[]): Area | undefined {
  if (values.length !== 4 || values.some((value) => String(value).trim() === '')) {
    return;
  }

  const [west, south, east, north] = values.map(Number);
  // Keep rectangles inside the terrestrial Mercator map and reject ambiguous dateline spans.
  if (
    [west, south, east, north].every(Number.isFinite) &&
    west >= -180 &&
    east <= 180 &&
    south >= -85 &&
    north <= 85 &&
    west < east &&
    south < north &&
    east - west <= 180
  ) {
    return [west, south, east, north];
  }

  return undefined;
}

export function areaFromPolygon(polygon: Polygon): Area | undefined {
  const [ring] = polygon.coordinates;
  if (
    polygon.coordinates.length !== 1 ||
    ring?.length !== 5 ||
    ring.some((point) => point.length !== 2 || !point.every(Number.isFinite)) ||
    ring[0][0] !== ring[4][0] ||
    ring[0][1] !== ring[4][1]
  ) {
    return;
  }

  const xs = ring.slice(0, 4).map((position) => position[0]);
  const ys = ring.slice(0, 4).map((position) => position[1]);
  if (
    new Set(xs).size !== 2 ||
    new Set(ys).size !== 2 ||
    new Set(ring.slice(0, 4).map((point) => point.join(','))).size !== 4 ||
    ring.slice(0, 4).some(([x, y], i) => (x === ring[i + 1][0]) === (y === ring[i + 1][1]))
  ) {
    return;
  }

  return areaFrom([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
}

export function areaPolygon([west, south, east, north]: Area): Polygon {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
}

export function containsCenter(
  [west, south, east, north]: Area,
  [longitude, latitude]: readonly [number, number],
): boolean {
  return longitude >= west && longitude <= east && latitude >= south && latitude <= north;
}
