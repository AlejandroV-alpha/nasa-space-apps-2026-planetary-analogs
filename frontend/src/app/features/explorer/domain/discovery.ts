import type { Feature, FeatureCollection, Polygon } from 'geojson';
import type { Position, TargetBody } from '../../../core/data/analog-dataset.model';
import type { Area } from './geographic-area';

export type Destination = TargetBody | 'both';

export interface WindowMetric {
  key: string;
  unit: 'deg' | 'm';
  candidateValue: number | null;
  referenceValue: number | null;
  signedDifference: number | null;
}
export interface WindowComparison {
  analysisScaleM: number;
  distance: number | null;
  metrics: WindowMetric[];
}
export interface WindowQuality {
  validHeightCellFraction: number;
  validSlopeCellFraction: number;
  coverageMeaning: string;
}
export interface WindowProperties {
  center: Position;
  tileId: string;
  comparison: WindowComparison;
  sensitivity: (WindowComparison & { quality: WindowQuality }) | null;
  quality: WindowQuality;
}
export interface DiscoveredWindow extends Feature<Polygon, WindowProperties> {
  id: string;
}
export interface DiscoveryGroup {
  type: 'FeatureCollection';
  reference: { id: string; name: string; body: TargetBody };
  comparableWindows: number;
  features: DiscoveredWindow[];
}
export interface DiscoverySource {
  boundsWgs84: Area | null;
  measuredWindows: number;
  windowSideM: number;
  centerSpacingM: number;
  tiles: { tileId: string; url: string; sha256: string }[];
  skippedTiles: { tileId: string; reason: string }[];
}

export interface FootprintProperties {
  tileId: string;
  centerInArea: boolean;
}
export interface MeasuredFootprint extends Feature<Polygon, FootprintProperties> {
  id: string;
}
export interface MeasuredCoverage extends FeatureCollection<Polygon, FootprintProperties> {
  status: 'measured' | 'no_measured_windows';
  windowCount: number;
  features: MeasuredFootprint[];
}

export interface DiscoverySearch {
  schemaVersion: '1.0.0';
  boundsWgs84: Area;
  sourceSearch: DiscoverySource;
  method: { distance: string; ordering: string; limitations: string[] };
  coverage: MeasuredCoverage;
  results: DiscoveryGroup[];
}

export interface DiscoveryQuery {
  area: Area;
  referenceId?: string;
  referenceIds?: readonly string[];
  limit?: number;
}

export interface RankedWindow {
  key: string;
  rank: number;
  window: DiscoveredWindow;
}
export function rankWindows(group: DiscoveryGroup): RankedWindow[] {
  return group.features.map((window, index) => ({
    key: group.reference.id + '/' + window.id,
    rank: index + 1,
    window,
  }));
}

export function mergeSearches(
  parts: DiscoverySearch[],
  { area, limit }: DiscoveryQuery,
): DiscoverySearch {
  const first = parts[0];
  const footprints = new Map<string, MeasuredFootprint>();
  const groups = new Map<
    string,
    { group: DiscoveryGroup; windows: Map<string, DiscoveredWindow> }
  >();

  for (const part of parts) {
    for (const footprint of part.coverage.features) {
      if (!footprints.has(footprint.id) || footprint.properties.centerInArea) {
        footprints.set(footprint.id, footprint);
      }
    }
    for (const group of part.results) {
      const entry = groups.get(group.reference.id) ?? { group, windows: new Map() };
      for (const window of group.features) {
        entry.windows.set(window.id, window);
      }
      groups.set(group.reference.id, entry);
    }
  }

  return {
    ...first,
    boundsWgs84: area,
    coverage: {
      type: 'FeatureCollection',
      status: footprints.size ? 'measured' : 'no_measured_windows',
      windowCount: footprints.size,
      features: Array.from(footprints.values()),
    },
    results: Array.from(groups.values(), ({ group, windows }) => ({
      ...group,
      comparableWindows: windows.size,
      features: Array.from(windows.values())
        .sort((a, b) => {
          const difference =
            (a.properties.comparison.distance ?? Infinity) -
            (b.properties.comparison.distance ?? Infinity);
          if (difference) {
            return difference;
          }
          // Match Python's ID tie-break for the ASCII identifiers in the inventory.
          if (a.id < b.id) return -1;
          if (a.id > b.id) return 1;
          return 0;
        })
        .slice(0, limit),
    })),
  };
}

export const WINDOW_METRICS: Readonly<Record<string, string>> = {
  slope_median_deg: 'Pendiente mediana',
  slope_p90_deg: 'Pendiente P90',
  relief_p95_p5_m: 'Relieve P95–P5',
};
