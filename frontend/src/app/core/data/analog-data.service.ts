import { httpResource } from '@angular/common/http';
import { Service, computed } from '@angular/core';
import {
  type AnalogDataset,
  type ComparisonRow,
  type Metric,
  type MetricKey,
  type ReferenceRegion,
  type Site,
  type Source,
  SUPPORTED_SCHEMA_MAJOR,
  type TargetBody,
} from './analog-dataset.model';

/**
 * Ruta relativa al <base href>, para que funcione también si la app se publica en un subdirectorio.
 * El archivo se genera/valida fuera del navegador (npm run validate:data); la app nunca procesa rásteres.
 */
export const ANALOG_DATASET_URL = 'data/analogs.v1.json';

/** Comprobación mínima en tiempo de ejecución. La validación completa corre en CI. */
export function parseAnalogDataset(raw: unknown): AnalogDataset {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('El dataset no es un objeto JSON.');
  }
  const candidate = raw as Partial<AnalogDataset>;
  const major = Number(String(candidate.schemaVersion ?? '').split('.')[0]);
  if (major !== SUPPORTED_SCHEMA_MAJOR) {
    throw new Error(
      `Versión de esquema no soportada: "${candidate.schemaVersion}" (se esperaba ${SUPPORTED_SCHEMA_MAJOR}.x).`,
    );
  }
  for (const key of ['sources', 'methods', 'referenceRegions', 'sites'] as const) {
    if (!Array.isArray(candidate[key])) {
      throw new Error(`El dataset no contiene la colección "${key}".`);
    }
  }
  return candidate as AnalogDataset;
}

@Service()
export class AnalogDataService {
  private readonly resource = httpResource<AnalogDataset>(() => ANALOG_DATASET_URL, {
    parse: parseAnalogDataset,
  });

  readonly isLoading = this.resource.isLoading;
  readonly error = this.resource.error;
  readonly dataset = computed(() => (this.resource.hasValue() ? this.resource.value() : undefined));

  /** true cuando la interfaz debe advertir que muestra datos de ejemplo. */
  readonly isFixture = computed(() => {
    const ds = this.dataset();
    return (
      ds !== undefined &&
      (ds.status === 'fixture' || ds.sites.some((s) => s.evidenceStatus === 'fixture'))
    );
  });

  readonly sites = computed(() => this.dataset()?.sites ?? []);
  readonly referenceRegions = computed(() => this.dataset()?.referenceRegions ?? []);

  private readonly sourceIndex = computed(
    () => new Map((this.dataset()?.sources ?? []).map((s) => [s.id, s])),
  );
  private readonly methodIndex = computed(
    () => new Map((this.dataset()?.methods ?? []).map((m) => [m.id, m])),
  );
  private readonly siteIndex = computed(() => new Map(this.sites().map((s) => [s.id, s])));
  private readonly regionIndex = computed(
    () => new Map(this.referenceRegions().map((r) => [r.id, r])),
  );

  reload(): void {
    this.resource.reload();
  }

  siteById(id: string): Site | undefined {
    return this.siteIndex().get(id);
  }

  regionById(id: string): ReferenceRegion | undefined {
    return this.regionIndex().get(id);
  }

  methodById(id: string | null) {
    return id === null ? undefined : this.methodIndex().get(id);
  }

  /** Fuentes en el orden pedido; omite IDs desconocidos (el validador ya los rechaza). */
  sourcesFor(ids: readonly string[]): Source[] {
    const index = this.sourceIndex();
    return ids.flatMap((id) => index.get(id) ?? []);
  }

  regionsFor(body: TargetBody): ReferenceRegion[] {
    return this.referenceRegions().filter((r) => r.targetBody === body);
  }

  /** Sitios con al menos una evaluación contra el cuerpo indicado (selector Luna/Marte). */
  sitesFor(body: TargetBody): Site[] {
    return this.sites().filter((s) => s.assessments.some((a) => a.targetBody === body));
  }

  /** Sitios evaluados contra una región de referencia concreta. */
  sitesForRegion(regionId: string): Site[] {
    return this.sites().filter((s) => s.assessments.some((a) => a.referenceRegionId === regionId));
  }

  /**
   * Alinea por métrica una región de referencia y 1–3 sitios.
   * Las ausencias se conservan como métricas "missing" o null, nunca como cero.
   */
  compare(regionId: string, siteIds: readonly string[]): ComparisonRow[] {
    const region = this.regionById(regionId);
    if (!region) return [];
    const sites = siteIds.map((id) => this.siteById(id));

    const keys: MetricKey[] = [];
    for (const metric of [...region.metrics, ...sites.flatMap((s) => s?.metrics ?? [])]) {
      if (!keys.includes(metric.key)) keys.push(metric.key);
    }

    return keys.map((key) => {
      const reference = region.metrics.find((m) => m.key === key) ?? null;
      const siteMetrics = sites.map((s) => s?.metrics.find((m) => m.key === key) ?? null);
      const all = [reference, ...siteMetrics];
      const unit = all.find((m): m is Metric => m !== null)!.unit;
      const scales = new Set(all.map((m) => m?.analysisScaleM));
      const comparable = all.every((m) => m !== null && m.value !== null) && scales.size === 1;
      return { key, unit, reference, sites: siteMetrics, comparable };
    });
  }
}
