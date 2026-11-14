#!/usr/bin/env node
// Valida datasets de análogos planetarios contra el contrato (schema/planetary-analogs.schema.json)
// y comprueba reglas que JSON Schema no expresa: referencias, coordenadas, unidades y estados.
//
// Uso:
//   node scripts/validate-data.mjs [archivo.json ...] [--release]
//   --release  rechaza cualquier dato fixture (usar antes de la entrega final).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const SCHEMA_URL = new URL('../../schema/planetary-analogs.schema.json', import.meta.url);
const DEFAULT_DATASET = fileURLToPath(new URL('../public/data/analogs.v1.json', import.meta.url));

export const METRIC_UNITS = {
  'slope-median': 'deg',
  'slope-p90': 'deg',
  'relief-p95-p5': 'm',
  roughness: 'm',
  'lst-day-night-diff': 'K',
};

export const BODY_CRS = {
  moon: 'IAU_2015:30100',
  mars: 'IAU_2015:49900',
};

export const ACCEPTED_BODY_CRS = {
  moon: [BODY_CRS.moon, 'MOON_ME_DE421_PLANETOCENTRIC'],
  mars: [BODY_CRS.mars, 'MARS_IAU2000_PLANETOCENTRIC'],
};
const planetaryFrames = new Set(Object.values(ACCEPTED_BODY_CRS).flat());

let compiledSchema;

function getSchemaValidator() {
  if (!compiledSchema) {
    const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
    addFormats(ajv);
    compiledSchema = ajv.compile(JSON.parse(readFileSync(SCHEMA_URL, 'utf8')));
  }
  return compiledSchema;
}

/**
 * @param {unknown} dataset
 * @param {{ release?: boolean }} [options]
 * @returns {{ errors: { code: string, path: string, message: string }[], warnings: { code: string, path: string, message: string }[] }}
 */
export function validateDataset(dataset, options = {}) {
  const errors = [];
  const warnings = [];
  const error = (code, path, message) => errors.push({ code, path, message });
  const warn = (code, path, message) => warnings.push({ code, path, message });

  const validateSchema = getSchemaValidator();
  if (!validateSchema(dataset)) {
    for (const e of validateSchema.errors ?? []) {
      error(
        'schema',
        e.instancePath || '/',
        `${e.message}${e.params ? ` ${JSON.stringify(e.params)}` : ''}`,
      );
    }
    // Las reglas semánticas asumen la estructura del esquema.
    return { errors, warnings };
  }

  const ds = /** @type {any} */ (dataset);

  // --- Identificadores únicos -------------------------------------------------
  const indexById = (items, collection) => {
    const map = new Map();
    items.forEach((item, i) => {
      if (map.has(item.id)) {
        error(
          'duplicate-id',
          `/${collection}/${i}/id`,
          `ID duplicado "${item.id}" en ${collection}.`,
        );
      }
      map.set(item.id, item);
    });
    return map;
  };
  const sources = indexById(ds.sources, 'sources');
  const methods = indexById(ds.methods, 'methods');
  const regions = indexById(ds.referenceRegions, 'referenceRegions');
  indexById(ds.sites, 'sites');
  for (const site of ds.sites) {
    if (regions.has(site.id)) {
      error(
        'duplicate-id',
        `/sites`,
        `El ID "${site.id}" se usa en un sitio y en una región de referencia.`,
      );
    }
  }

  // --- Fuentes -------------------------------------------------------------------
  ds.sources.forEach((source, i) => {
    const interval = source.observationInterval;
    if (interval && interval.start > interval.end) {
      error(
        'invalid-interval',
        `/sources/${i}/observationInterval`,
        'La fecha de inicio es posterior a la de fin.',
      );
    }
  });

  const checkSourceRefs = (ids, path) => {
    ids.forEach((id, j) => {
      if (!sources.has(id))
        error('unknown-source', `${path}/${j}`, `La fuente "${id}" no existe en sources.`);
    });
  };

  // --- Métricas ------------------------------------------------------------------
  const checkMetrics = (metrics, path, entity, expectedCrs) => {
    const seen = new Set();
    metrics.forEach((metric, i) => {
      const mPath = `${path}/${i}`;
      if (seen.has(metric.key))
        error('duplicate-metric', mPath, `La métrica "${metric.key}" aparece dos veces.`);
      seen.add(metric.key);

      const expectedUnit = METRIC_UNITS[metric.key];
      if (metric.unit !== expectedUnit) {
        error(
          'unit-mismatch',
          `${mPath}/unit`,
          `"${metric.key}" debe expresarse en ${expectedUnit}, no en ${metric.unit}.`,
        );
      }

      checkSourceRefs(metric.sourceIds, `${mPath}/sourceIds`);
      for (const id of metric.sourceIds) {
        const source = sources.get(id);
        if (!source) continue;
        const isPlanetary = source.crs.startsWith('IAU_') || planetaryFrames.has(source.crs);
        if (expectedCrs === 'EPSG:4326' ? isPlanetary : source.crs !== expectedCrs) {
          error(
            'source-body-mismatch',
            `${mPath}/sourceIds`,
            `La fuente "${id}" (${source.crs}) no corresponde al cuerpo de "${entity.id}" (${expectedCrs}).`,
          );
        }
      }

      if (metric.methodId !== null && !methods.has(metric.methodId)) {
        error(
          'unknown-method',
          `${mPath}/methodId`,
          `El método "${metric.methodId}" no existe en methods.`,
        );
      }

      if (metric.status === 'fixture' && entity.evidenceStatus !== 'fixture') {
        error(
          'status-mismatch',
          `${mPath}/status`,
          `Valor fixture dentro de "${entity.id}", cuyo evidenceStatus es ${entity.evidenceStatus}.`,
        );
      }
      if (metric.status === 'computed' && entity.evidenceStatus === 'fixture') {
        warn(
          'status-mismatch',
          `${mPath}/status`,
          `Métrica calculada en "${entity.id}", que sigue marcado como fixture.`,
        );
      }
      if (metric.key.startsWith('slope') && metric.value !== null && metric.value > 90) {
        error('out-of-range', `${mPath}/value`, 'Una pendiente no puede superar 90°.');
      }
      if (metric.value !== null && metric.value < 0) {
        error('out-of-range', `${mPath}/value`, `"${metric.key}" no puede ser negativo.`);
      }
      if (
        metric.status === 'computed' &&
        metric.validCoverageFraction !== null &&
        metric.validCoverageFraction < 0.5
      ) {
        warn(
          'low-coverage',
          `${mPath}/validCoverageFraction`,
          `Cobertura válida baja (${metric.validCoverageFraction}).`,
        );
      }
    });
  };

  // --- Geometría -----------------------------------------------------------------
  const checkPolygon = (polygon, path, maxLon) => {
    polygon.coordinates.forEach((ring, r) => {
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        error(
          'unclosed-ring',
          `${path}/coordinates/${r}`,
          'El anillo del polígono no está cerrado (primer punto ≠ último).',
        );
      }
      ring.forEach(([lon], k) => {
        if (lon > maxLon)
          error(
            'invalid-coordinate',
            `${path}/coordinates/${r}/${k}`,
            `Longitud ${lon} fuera de rango.`,
          );
      });
    });
  };

  // --- Regiones de referencia -----------------------------------------------------
  ds.referenceRegions.forEach((region, i) => {
    const path = `/referenceRegions/${i}`;
    if (!ACCEPTED_BODY_CRS[region.targetBody].includes(region.crs)) {
      error(
        'crs-mismatch',
        `${path}/crs`,
        `${region.crs} no es el CRS de ${region.targetBody} (${BODY_CRS[region.targetBody]}).`,
      );
    }
    checkPolygon(region.geometry, `${path}/geometry`, 360);
    if (!pointInPolygon(region.center.coordinates, region.geometry.coordinates[0])) {
      warn('center-outside', `${path}/center`, 'El centro no está dentro de la geometría.');
    }
    checkSourceRefs(region.sourceIds, `${path}/sourceIds`);
    checkMetrics(region.metrics, `${path}/metrics`, region, region.crs);
  });

  // --- Sitios terrestres ----------------------------------------------------------
  ds.sites.forEach((site, i) => {
    const path = `/sites/${i}`;
    const [lon] = site.geometry.coordinates;
    if (lon > 180)
      error(
        'invalid-coordinate',
        `${path}/geometry`,
        `Longitud WGS84 ${lon} fuera de [-180, 180].`,
      );
    checkPolygon(site.studyArea, `${path}/studyArea`, 180);
    if (!pointInPolygon(site.geometry.coordinates, site.studyArea.coordinates[0])) {
      error(
        'point-outside-area',
        `${path}/geometry`,
        'El punto del sitio está fuera de su studyArea.',
      );
    }
    checkSourceRefs(site.sourceIds, `${path}/sourceIds`);
    checkMetrics(site.metrics, `${path}/metrics`, site, 'EPSG:4326');

    const assessedRegions = new Set();
    site.assessments.forEach((assessment, j) => {
      const aPath = `${path}/assessments/${j}`;
      const region = regions.get(assessment.referenceRegionId);
      if (!region) {
        error(
          'unknown-region',
          `${aPath}/referenceRegionId`,
          `La región "${assessment.referenceRegionId}" no existe.`,
        );
        return;
      }
      if (assessedRegions.has(region.id))
        error(
          'duplicate-assessment',
          aPath,
          `"${site.id}" se evalúa dos veces contra "${region.id}".`,
        );
      assessedRegions.add(region.id);
      if (region.targetBody !== assessment.targetBody) {
        error(
          'body-mismatch',
          `${aPath}/targetBody`,
          `La evaluación dice ${assessment.targetBody} pero "${region.id}" pertenece a ${region.targetBody}.`,
        );
      }
      // Comparabilidad: misma métrica a escalas distintas no se debe comparar directamente.
      for (const sm of site.metrics) {
        const rm = region.metrics.find((m) => m.key === sm.key);
        if (
          rm &&
          sm.analysisScaleM !== null &&
          rm.analysisScaleM !== null &&
          sm.analysisScaleM !== rm.analysisScaleM
        ) {
          warn(
            'scale-mismatch',
            aPath,
            `"${sm.key}": sitio a ${sm.analysisScaleM} m y región a ${rm.analysisScaleM} m.`,
          );
        }
      }
    });
  });

  // --- Modo release ----------------------------------------------------------------
  if (options.release || ds.status === 'release') {
    const fixtureEntities = [...ds.referenceRegions, ...ds.sites].filter(
      (e) =>
        e.evidenceStatus === 'fixture' ||
        e.metrics.some((m) => m.status === 'fixture') ||
        e.assessments?.some((a) => a.evidenceStatus === 'fixture'),
    );
    if (ds.status === 'fixture')
      error('fixture-in-release', '/status', 'El dataset completo está marcado como fixture.');
    for (const e of fixtureEntities) {
      error(
        'fixture-in-release',
        `/${e.targetBody ? 'referenceRegions' : 'sites'}`,
        `"${e.id}" contiene datos fixture.`,
      );
    }
  } else if (ds.status !== 'fixture') {
    const hasFixtures = [...ds.referenceRegions, ...ds.sites].some(
      (e) => e.evidenceStatus === 'fixture',
    );
    if (hasFixtures && ds.status === 'draft')
      warn('fixture-in-draft', '/status', 'El dataset draft todavía contiene entidades fixture.');
  }

  return { errors, warnings };
}

/** Ray casting en el plano lon/lat; suficiente para áreas de estudio pequeñas. */
export function pointInPolygon([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const onEdge =
      (x - xi) * (yj - yi) === (y - yi) * (xj - xi) &&
      x >= Math.min(xi, xj) &&
      x <= Math.max(xi, xj) &&
      y >= Math.min(yi, yj) &&
      y <= Math.max(yi, yj);
    if (onEdge) return true;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function main(argv) {
  const release = argv.includes('--release');
  const files = argv.filter((a) => !a.startsWith('--'));
  if (files.length === 0) files.push(DEFAULT_DATASET);

  let failed = false;
  for (const file of files) {
    let dataset;
    try {
      dataset = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      console.error(`✖ ${file}: no se pudo leer como JSON (${e.message})`);
      failed = true;
      continue;
    }
    const { errors, warnings } = validateDataset(dataset, { release });
    for (const w of warnings) console.warn(`  ⚠ [${w.code}] ${w.path}: ${w.message}`);
    for (const e of errors) console.error(`  ✖ [${e.code}] ${e.path}: ${e.message}`);
    if (errors.length) {
      failed = true;
      console.error(`✖ ${file}: ${errors.length} error(es), ${warnings.length} aviso(s)`);
    } else {
      const label = dataset.status === 'fixture' ? ' (FIXTURE: no apto para la entrega)' : '';
      console.log(
        `✔ ${file}: válido${label}, ${dataset.sites.length} sitios, ${dataset.referenceRegions.length} regiones, ${warnings.length} aviso(s)`,
      );
    }
  }
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}
