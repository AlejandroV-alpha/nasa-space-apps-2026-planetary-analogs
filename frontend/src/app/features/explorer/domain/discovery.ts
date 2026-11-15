import type { Feature, Polygon } from 'geojson';
import type { Position, TargetBody } from '../../../core/data/analog-dataset.model';
import { containsCenter, type Area } from './geographic-area';

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
  invalidWindows: number;
  features: DiscoveredWindow[];
}
export interface Discovery {
  schemaVersion: '1.0.0';
  search: {
    measuredWindows: number;
    windowSideM: number;
    tiles: { tileId: string; url: string; sha256: string }[];
  };
  method: { distance: string; ordering: string; limitations: string[] };
  results: DiscoveryGroup[];
}
export interface RankedWindow {
  key: string;
  rank: number;
  window: DiscoveredWindow;
}
export function filterGroups(
  groups: readonly DiscoveryGroup[],
  regionIds: readonly string[],
  area: Area | undefined,
) {
  return regionIds.map((regionId) => {
    const group = groups.find((item) => item.reference.id === regionId);
    const rows: RankedWindow[] = [];
    if (area && group) {
      for (const window of group.features) {
        if (containsCenter(area, window.properties.center)) {
          rows.push({ key: regionId + '/' + window.id, rank: rows.length + 1, window });
        }
      }
    }

    return { regionId, rows };
  });
}
export const WINDOW_METRICS: Readonly<Record<string, string>> = {
  slope_median_deg: 'Pendiente mediana',
  slope_p90_deg: 'Pendiente P90',
  relief_p95_p5_m: 'Relieve P95–P5',
};
