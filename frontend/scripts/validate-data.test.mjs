// Pruebas del validador: el fixture publicado es válido y cada tipo de dato roto se detecta.
// Ejecutar con: npm run test:data
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { validateDataset } from './validate-data.mjs';

const fixture = JSON.parse(
  readFileSync(new URL('../public/data/analogs.v1.json', import.meta.url), 'utf8'),
);
const clone = () => structuredClone(fixture);
const codes = (dataset, options) => validateDataset(dataset, options).errors.map((e) => e.code);

describe('validateDataset', () => {
  it('acepta el fixture publicado', () => {
    assert.deepEqual(validateDataset(fixture).errors, []);
  });

  it('rechaza el fixture en modo release', () => {
    assert.ok(codes(fixture, { release: true }).includes('fixture-in-release'));
  });

  const cases = [
    [
      'coordenada WGS84 fuera de rango',
      'schema',
      (d) => (d.sites[0].geometry.coordinates = [-67.7, -95]),
    ],
    [
      'longitud terrestre mayor que 180',
      'invalid-coordinate',
      (d) => (d.sites[0].geometry.coordinates[0] = 200),
    ],
    [
      'punto fuera de su área de estudio',
      'point-outside-area',
      (d) => (d.sites[0].geometry.coordinates = [-60, -10]),
    ],
    [
      'polígono sin cerrar',
      'unclosed-ring',
      (d) => (d.sites[0].studyArea.coordinates[0][4] = [-67.9, -22.3]),
    ],
    ['ID duplicado', 'duplicate-id', (d) => (d.sites[1].id = d.sites[0].id)],
    ['ID con formato inválido', 'schema', (d) => (d.sites[0].id = 'Siloli Desert')],
    ['fuente inexistente', 'unknown-source', (d) => (d.sites[0].sourceIds = ['no-existe'])],
    [
      'fuente inexistente en métrica',
      'unknown-source',
      (d) => (d.sites[0].metrics[0].sourceIds = ['no-existe']),
    ],
    ['método inexistente', 'unknown-method', (d) => (d.sites[0].metrics[0].methodId = 'no-existe')],
    [
      'región de referencia inexistente',
      'unknown-region',
      (d) => (d.sites[0].assessments[0].referenceRegionId = 'no-existe'),
    ],
    [
      'cuerpo de la evaluación incoherente',
      'body-mismatch',
      (d) => (d.sites[0].assessments[0].targetBody = 'moon'),
    ],
    ['unidad incorrecta', 'unit-mismatch', (d) => (d.sites[0].metrics[0].unit = 'm')],
    [
      'métrica repetida',
      'duplicate-metric',
      (d) => d.sites[0].metrics.push(structuredClone(d.sites[0].metrics[0])),
    ],
    [
      'ausencia representada como cero',
      'schema',
      (d) => Object.assign(d.sites[3].metrics[0], { value: 0 }),
    ],
    ['valor nulo sin motivo', 'schema', (d) => delete d.sites[3].metrics[0].missingReason],
    [
      'valor nulo con estado computed',
      'schema',
      (d) => Object.assign(d.sites[3].metrics[0], { status: 'computed' }),
    ],
    ['cobertura mayor que 1', 'schema', (d) => (d.sites[0].metrics[0].validCoverageFraction = 1.5)],
    ['pendiente mayor que 90°', 'out-of-range', (d) => (d.sites[0].metrics[0].value = 120)],
    [
      'CRS de región incoherente',
      'crs-mismatch',
      (d) => (d.referenceRegions[0].crs = 'IAU_2015:49900'),
    ],
    [
      'fuente marciana en un sitio terrestre',
      'source-body-mismatch',
      (d) => (d.sites[0].metrics[0].sourceIds = ['mola-megdr']),
    ],
    [
      'fuente lunar en región marciana',
      'source-body-mismatch',
      (d) => (d.referenceRegions[1].metrics[0].sourceIds = ['lola-ldem-polar']),
    ],
    [
      'valor fixture en análisis calculado',
      'status-mismatch',
      (d) => (d.sites[0].evidenceStatus = 'analysis_computed'),
    ],
    [
      'intervalo de observación invertido',
      'invalid-interval',
      (d) => (d.sources[0].observationInterval = { start: '2001-01-01', end: '2000-01-01' }),
    ],
    ['campo desconocido', 'schema', (d) => (d.sites[0].rank = 1)],
    ['versión de esquema incompatible', 'schema', (d) => (d.schemaVersion = '2.0.0')],
  ];

  for (const [name, expectedCode, mutate] of cases) {
    it(`detecta: ${name}`, () => {
      const dataset = clone();
      mutate(dataset);
      const found = codes(dataset);
      assert.ok(
        found.includes(expectedCode),
        `esperaba "${expectedCode}", obtuvo ${JSON.stringify(found)}`,
      );
    });
  }

  it('avisa si se comparan métricas a escalas distintas', () => {
    const dataset = clone();
    dataset.sites[0].metrics[0].analysisScaleM = 30;
    const { errors, warnings } = validateDataset(dataset);
    assert.deepEqual(errors, []);
    assert.ok(warnings.some((w) => w.code === 'scale-mismatch'));
  });
});
