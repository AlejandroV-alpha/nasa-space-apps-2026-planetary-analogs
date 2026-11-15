import type {
  DiscoveryGroup,
  DiscoverySearch,
  DiscoverySource,
  WindowComparison,
  WindowQuality,
} from './discovery';

type WindowSensitivity = WindowComparison & { quality: WindowQuality };

export interface ApplicationsResponse {
  windowId: string;
  referenceRegionId: string;
  applications: Application[];
}

export interface EvidenceResponse {
  windowId: string;
  referenceRegionId: string;
  dimensions: EvidenceDimensions;
  scientificReview: ScientificReview;
  relatedStudies: StudySummary[];
  sources: ScientificSource[];
  limitations: string[];
}

export interface ThermalResponse {
  windowId: string;
  referenceRegionId: string;
  status: 'unavailable' | 'context_only' | 'available';
  earth: ThermalSide<SkinTemperature>;
  planetary: ThermalSide<PlanetaryThermalContext>;
  comparison: ThermalComparison;
  candidateSources: ScientificSource[];
}

export interface GeologyResponse {
  windowId: string;
  referenceRegionId: string;
  status: 'unavailable' | 'qualitative';
  earth: GeologySide;
  planetary: GeologySide;
  comparison: GeologyComparison;
}

export interface StudyResponse {
  windowId: string;
  referenceRegionId: string;
  id: string;
  title: string;
  researchQuestion: string;
  reviewStatus: 'pending';
  limitations: string[];
  geometry: WindowPolygon;
  center: [number, number];
  terrainResults: WindowReferenceComparison;
  geologyResults: GeologyResponse;
  thermalResults: ThermalResponse;
  potentialApplications: Application[];
  sources: ScientificSource[];
}

export interface DiscoveredWindowDetail {
  id: string;
  geometry: WindowPolygon;
  center: [number, number];
  tileId: string;
  quality: WindowQuality;
  comparisons: WindowReferenceComparison[];
}

export interface CandidateDiscovery {
  schemaVersion: '1.0.0';
  search: DiscoverySource;
  method: DiscoverySearch['method'];
  results: DiscoveryGroup[];
}

export interface Application {
  type: 'rover_mobility' | 'geological_sampling' | 'field_operations';
  status: 'potential' | 'insufficient_evidence';
  description: string;
  supportingMetrics: string[];
  missingEvidence: string[];
  validatedForOperations: false;
}

export interface EvidenceDimensions {
  topography: EvidenceDimension;
  geology: EvidenceDimension;
  thermal: EvidenceDimension;
}

export interface ScientificReview {
  status: 'pending';
}

export interface StudySummary {
  id: string;
  title: string;
}

export interface ScientificSource {
  id: string;
  title: string;
  url: string;
}

export interface ThermalSide<T> {
  surfaceTemperature: T | null;
  daytime: number | null;
  nighttime: number | null;
  source: ScientificSource | null;
  catalogCheck: ProductCatalogCheck | null;
  modisObservations: ModisObservations | null;
}

export interface ThermalComparison {
  comparable: boolean;
  differenceK: number | null;
  reason: string;
}

export interface GeologySide {
  minerals: string[];
  source: ScientificSource | null;
  coveragePercent: number | null;
  catalogCheck: ProductCatalogCheck | null;
  regionalContext: RegionalGeology | null;
  mappedGeology: MappedGeology | null;
  emitObservations: EmitObservations | null;
  localizedSpectra: LocalizedSpectra | null;
}

export interface GeologyComparison {
  commonMinerals: string[];
  interpretation: string | null;
  limitations: string[];
}

export interface WindowPolygon {
  type: 'Polygon';
  coordinates: [number, number][][];
}

export interface WindowReferenceComparison {
  reference: Reference;
  comparison: WindowComparison;
  sensitivity: WindowSensitivity;
}

export interface EvidenceDimension {
  status: 'available' | 'qualitative' | 'context_only' | 'catalogued' | 'not_evaluated';
  sourceIds: string[];
  quality: Record<string, WindowQuality> | null;
}

export interface SkinTemperature {
  parameter: 'TS';
  quantity: 'earth_skin_temperature';
  units: '°C';
  period: EnvironmentPeriod;
  requestedCoordinates: [number, number];
  responseCoordinates: [number, number];
  apiVersion: string;
  products: string[];
  aggregation: string;
  validDays: number;
  expectedDays: number;
  mean: number;
  minDaily: number;
  maxDaily: number;
  sourceUrl: string;
  limitations: string[];
}

export interface PlanetaryThermalContext {
  sourceId: string;
  product: string;
  sourceUrl: string;
  labelUrl: string;
  sourceSha256: string;
  selection: string;
  quantity:
    'modeled_annual_maximum_surface_temperature' | 'blackbody_equivalent_radiometric_temperature';
  summary: string;
  units: 'K';
  samples: number;
  median: number;
  minimum: number;
  maximum: number;
  coordinates: [number, number] | null;
  locationSourceUrl: string | null;
  limitations: string[];
}

export interface ProductCatalogCheck {
  product: string;
  version: string;
  boundsWgs84: [number, number, number, number];
  temporal: string | null;
  queryUrl: string;
  catalogHits: number;
  exampleGranuleId: string | null;
}

export interface ModisObservations {
  granule: string;
  sourceSha256: string;
  start: string;
  end: string;
  units: 'K';
  windowPixels: number;
  daytime: ModisLSTPeriod;
  nighttime: ModisLSTPeriod;
}

export interface RegionalGeology {
  observation: string;
  source: ScientificSource;
}

export interface MappedGeology {
  source: ScientificSource;
  layer: string;
  coveragePercent: number;
  units: MappedUnit[];
  limitations: string[];
}

export interface EmitObservations {
  screening: string;
  selectedGranule: string;
  scenes: EmitScene[];
}

export interface LocalizedSpectra {
  source: ScientificSource;
  observation: string;
  roi: string;
  localizedSamples: number;
  bounds: [number, number, number, number];
  mineralGroups: string[];
  roiArchiveUrl: string;
  ddrUrl: string;
  sourceHashes: Record<string, string>;
  limitations: string[];
}

export interface Reference {
  id: string;
  name: string;
  body: 'moon' | 'mars';
}

export interface EnvironmentPeriod {
  start: string;
  end: string;
  timeStandard: string;
}

export interface ModisLSTPeriod {
  validPixels: number;
  coveragePercent: number;
  mean: number | null;
  minimum: number | null;
  maximum: number | null;
  medianLocalSolarHour: number | null;
}

export interface MappedUnit {
  code: string;
  name: string;
  percentOfWindow: number;
}

export interface EmitScene {
  granule: string;
  start: string;
  end: string;
  windowPixels: number;
  geolocatedPixels: number;
  validPixels: number;
  coveragePercent: number;
  sourceHashes: Record<string, string>;
  matches: SpectralMatch[];
}

export interface SpectralMatch {
  group: 1 | 2;
  libraryId: number;
  label: string;
  pixels: number;
}
