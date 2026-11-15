import type {
  DatasetStatus,
  Metric,
  MetricKey,
  MetricUnit,
  Position,
} from '../../core/data/analog-dataset.model';

const numberFormat = new Intl.NumberFormat('es', { maximumFractionDigits: 4 });

export const METRIC_LABELS: Record<MetricKey, string> = {
  'slope-median': 'Pendiente mediana',
  'slope-p90': 'Pendiente P90',
  'relief-p95-p5': 'Relieve P95–P5',
  roughness: 'Rugosidad',
  'lst-day-night-diff': 'Diferencia térmica día-noche',
};

export function metricValue(
  value: number | null | undefined,
  unit: MetricUnit,
  signed = false,
): string {
  if (value == null || !Number.isFinite(value)) {
    return 'Sin dato';
  }

  const prefix = signed && value > 0 ? '+' : '';
  const suffix = unit === 'deg' ? '°' : ' ' + unit;
  return prefix + numberFormat.format(value) + suffix;
}

export function formatMetric(metric: Metric | null): string {
  if (!metric) {
    return 'Sin dato';
  }

  return metricValue(metric.value, metric.unit);
}

export function catalogStatus(status: DatasetStatus): string {
  switch (status) {
    case 'draft':
      return 'Revisión científica pendiente';
    case 'fixture':
      return 'Datos de ejemplo';
    case 'release':
      return 'Catálogo publicado';
  }
}

export function validEarthPosition(coordinates: Position | undefined): coordinates is Position {
  return (
    Array.isArray(coordinates) &&
    coordinates.length === 2 &&
    coordinates.every(Number.isFinite) &&
    Math.abs(coordinates[0]) <= 180 &&
    Math.abs(coordinates[1]) <= 90
  );
}
