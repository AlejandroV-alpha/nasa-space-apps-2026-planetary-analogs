// Tipos TypeScript del contrato schema/planetary-analogs.schema.json (v1.0.0).
// Si cambia el esquema, actualizar estos tipos y SUPPORTED_SCHEMA_MAJOR.

export const SUPPORTED_SCHEMA_MAJOR = 1;

export type TargetBody = 'moon' | 'mars';
export type DatasetStatus = 'fixture' | 'draft' | 'release';
export type EvidenceStatus = 'fixture' | 'candidate_investigated' | 'analysis_computed';
export type MetricKey =
  'slope-median' | 'slope-p90' | 'relief-p95-p5' | 'roughness' | 'lst-day-night-diff';
export type MetricUnit = 'deg' | 'm' | 'K';
export type MetricStatus = 'computed' | 'fixture' | 'missing' | 'not_applicable';

/** [longitud, latitud] en grados. */
export type Position = readonly [number, number];

export interface PointGeometry {
  readonly type: 'Point';
  readonly coordinates: Position;
}

export interface PolygonGeometry {
  readonly type: 'Polygon';
  readonly coordinates: readonly (readonly Position[])[];
}

export interface Source {
  readonly id: string;
  readonly agency: string;
  readonly product: string;
  readonly version: string;
  readonly doi?: string;
  readonly url: string;
  readonly file?: string;
  readonly accessedAt: string;
  readonly observationInterval?: { readonly start: string; readonly end: string };
  readonly nativeResolutionM?: number;
  readonly license: string;
  readonly attribution: string;
  readonly crs: string;
}

export interface Method {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly resampling?: string;
  readonly windowM?: number;
  readonly documentationUrl?: string;
}

interface MetricBase {
  readonly key: MetricKey;
  readonly unit: MetricUnit;
  readonly sourceIds: readonly string[];
}

export interface AvailableMetric extends MetricBase {
  readonly status: 'computed' | 'fixture';
  readonly value: number;
  readonly methodId: string;
  readonly analysisScaleM: number;
  readonly validCoverageFraction: number;
}

/** Ausencia explícita: value es null y missingReason explica por qué. Nunca un cero inventado. */
export interface MissingMetric extends MetricBase {
  readonly status: 'missing' | 'not_applicable';
  readonly value: null;
  readonly missingReason: string;
  readonly methodId: string | null;
  readonly analysisScaleM: number | null;
  readonly validCoverageFraction: number | null;
}

export type Metric = AvailableMetric | MissingMetric;

export interface ReferenceRegion {
  readonly id: string;
  readonly name: string;
  readonly targetBody: TargetBody;
  /** Coordenadas planetocéntricas del cuerpo, NO WGS84 terrestre. */
  readonly crs: 'IAU_2015:30100' | 'IAU_2015:49900';
  readonly center: PointGeometry;
  readonly geometry: PolygonGeometry;
  readonly description: string;
  readonly selectionRationale?: string;
  readonly sourceIds: readonly string[];
  readonly evidenceStatus: EvidenceStatus;
  readonly metrics: readonly Metric[];
}

export interface Assessment {
  readonly targetBody: TargetBody;
  readonly referenceRegionId: string;
  readonly testUseCase: string;
  readonly interpretation: string;
  readonly limitations: readonly string[];
  readonly evidenceStatus: EvidenceStatus;
}

export interface Site {
  readonly id: string;
  readonly name: string;
  /** ISO 3166-1 alfa-2. */
  readonly country: string;
  readonly kind: 'candidate' | 'known_reference';
  /** Punto representativo en WGS84, [lon, lat]. */
  readonly geometry: PointGeometry;
  readonly studyArea: PolygonGeometry;
  readonly summary: string;
  readonly evidenceStatus: EvidenceStatus;
  readonly sourceIds: readonly string[];
  readonly assessments: readonly Assessment[];
  readonly metrics: readonly Metric[];
}

export interface AnalogDataset {
  readonly schemaVersion: string;
  readonly datasetId: string;
  readonly generatedAt: string;
  readonly status: DatasetStatus;
  readonly notes?: string;
  readonly sources: readonly Source[];
  readonly methods: readonly Method[];
  readonly referenceRegions: readonly ReferenceRegion[];
  readonly sites: readonly Site[];
}

/** Una fila de la comparación: la misma métrica para la región de referencia y cada sitio. */
export interface ComparisonRow {
  readonly key: MetricKey;
  readonly unit: MetricUnit;
  readonly reference: Metric | null;
  /** Mismo orden que los sitios pedidos; null si el sitio no declara la métrica. */
  readonly sites: readonly (Metric | null)[];
  /** true solo si todos los valores existen y comparten escala de análisis. */
  readonly comparable: boolean;
}
