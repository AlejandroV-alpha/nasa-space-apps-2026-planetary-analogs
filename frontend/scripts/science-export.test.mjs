import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { validateDataset } from './validate-data.mjs';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const actual = read('../public/data/analogs.v1.json');
const science = read('../../data/processed/catalog.json');
const keys = { 'slope_median_deg': 'slope-median', 'slope_p90_deg': 'slope-p90', 'relief_p95_p5_m': 'relief-p95-p5' };

describe('real science export', () => {
  it('passes the contract and no-fixture checks while retaining draft review status', () => {
    assert.deepEqual(validateDataset(actual, { release: true }), { errors: [], warnings: [] });
    assert.equal(actual.status, 'draft');
    assert.equal(actual.sites.length, 4);
    assert.equal(actual.referenceRegions.length, 2);
    assert.match(actual.notes, /revisión científica/i);
  });
  it('preserves every primary value, zero, unit, source, scale and method', () => {
    for (const original of [...science.sites, ...science.references]) {
      const entity = [...actual.sites, ...actual.referenceRegions].find(e => e.id === original.id);
      for (const m of original.metrics) {
        const exported = entity.metrics.find(e => e.key === keys[m.key]);
        for (const key of ['value', 'unit', 'sourceIds', 'methodId', 'analysisScaleM', 'validCoverageFraction']) {
          assert.deepEqual(exported[key], m[key], `${original.id}: ${key}`);
        }
      }
    }
    assert.equal(actual.sites.find(s => s.id === 'coipasa-sector').metrics[0].value, 0);
    assert.match(actual.methods[0].description, /no es Horn/);
    assert.equal(actual.sources.find(s => s.id === 'nasadem').version, '001');
  });
  it('preserves native frames and rejects a lunar source on Earth', () => {
    assert.equal(actual.referenceRegions[0].crs, 'MOON_ME_DE421_PLANETOCENTRIC');
    assert.equal(actual.referenceRegions[1].crs, 'MARS_IAU2000_PLANETOCENTRIC');
    const broken = structuredClone(actual);
    broken.sites[0].metrics[0].sourceIds = ['lola'];
    assert.ok(validateDataset(broken).errors.some(e => e.code === 'source-body-mismatch'));
  });
  it('rejects a body mismatch or an unperformed datum conversion', () => {
    const wrongBody = structuredClone(actual);
    wrongBody.referenceRegions[0].crs = 'MARS_IAU2000_PLANETOCENTRIC';
    assert.ok(validateDataset(wrongBody).errors.some(e => e.code === 'crs-mismatch'));
    const relabeled = structuredClone(actual);
    relabeled.referenceRegions[0].crs = 'IAU_2015:30100';
    assert.ok(validateDataset(relabeled).errors.some(e => e.code === 'source-body-mismatch'));
  });
  it('retains 2 km sensitivity and source provenance in the companion file', () => {
    const provenance = read('../public/data/analogs.v1.provenance.json');
    for (const original of [...science.sites, ...science.references]) {
      const exported = provenance.entities.find(e => e.id === original.id);
      assert.deepEqual(exported.sensitivity, original.sensitivity);
      assert.deepEqual(exported.studyArea, original.studyArea);
      assert.deepEqual(exported.provenance, original.provenance);
    }
  });
});
