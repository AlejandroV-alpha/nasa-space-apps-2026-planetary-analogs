import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
import { filterGroups } from '../domain/discovery';
import { DiscoveryData, parseDiscovery } from './discovery-data';

const block = {
  analysisScaleM: 1000,
  distance: 0,
  metrics: [
    {
      key: 'slope_median_deg',
      unit: 'deg',
      candidateValue: 0,
      referenceValue: 0,
      signedDifference: 0,
    },
  ],
};
const quality = {
  validHeightCellFraction: 1,
  validSlopeCellFraction: 1,
  coverageMeaning: 'celdas finitas',
};
const feature = {
  type: 'Feature',
  id: 'a',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    ],
  },
  properties: { center: [0, 0], tileId: 'test', comparison: block, sensitivity: null, quality },
};
const group = {
  type: 'FeatureCollection',
  reference: { id: 'mars', name: 'Marte', body: 'mars' },
  comparableWindows: 2,
  features: [feature, { ...feature, id: 'invalid', geometry: null }],
};
const fixture = {
  schemaVersion: '1.0.0',
  search: { measuredWindows: 2, windowSideM: 20000, tiles: [] },
  method: { distance: 'Distancia', ordering: 'Ascendente', limitations: [] },
  results: [group, { ...group, reference: { id: 'moon', name: 'Luna', body: 'moon' } }],
};

it('filtra ambos grupos sin mezclar referencias ni convertir cero a ausencia', () => {
  const data = parseDiscovery(fixture);
  const groups = filterGroups(data.results, ['mars', 'moon'], [0, 0, 1, 1]);
  expect(groups.map(({ rows }) => rows.map(({ key }) => key))).toEqual([['mars/a'], ['moon/a']]);
  expect(groups[0].rows[0].window.properties.comparison.metrics[0].signedDifference).toBe(0);
  expect(filterGroups(data.results, ['moon'], [2, 2, 3, 3])[0].rows).toEqual([]);
});

it('consulta descubrimiento sin parámetros geográficos y rechaza una respuesta inválida', async () => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const service = TestBed.inject(DiscoveryData);
  const http = TestBed.inject(HttpTestingController);
  TestBed.tick();
  const request = http.expectOne('/api/v1/discovered-candidates');
  expect(request.request.method).toBe('GET');
  request.flush({ schemaVersion: '2.0.0' });
  await TestBed.inject(ApplicationRef).whenStable();
  expect(service.resource.error()).toBeInstanceOf(Error);
  http.verify();
});
