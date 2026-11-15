import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, expect, it } from 'vitest';
import type { DiscoveryQuery } from '../domain/discovery';
import type { Area } from '../domain/geographic-area';
import { DiscoveryData, parseSearch, searchErrorText } from './discovery-data';

const endpoint = '/api/v1/discovered-candidates/search';
const area: Area = [-66, -23, -65, -22];
const quality = {
  validHeightCellFraction: 1,
  validSlopeCellFraction: 1,
  coverageMeaning: 'celdas finitas',
};
const geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [-66, -23],
      [-65, -23],
      [-65, -22],
      [-66, -23],
    ],
  ],
};
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
function windowFeature(id: string, distance: number) {
  return {
    type: 'Feature',
    id,
    geometry,
    properties: {
      center: [-65.5, -22.5],
      tileId: 'test',
      comparison: { ...block, distance },
      sensitivity: null,
      quality,
    },
  };
}

function response(boundsWgs84: Area, features = [windowFeature('a', 0)], centerInArea = true) {
  return {
    schemaVersion: '1.0.0',
    boundsWgs84,
    sourceSearch: {
      boundsWgs84: null,
      measuredWindows: 2,
      windowSideM: 20000,
      centerSpacingM: 20000,
      tiles: [],
      skippedTiles: [],
    },
    method: { distance: 'Distancia', ordering: 'Ascendente', limitations: [] },
    coverage: {
      type: 'FeatureCollection',
      status: 'measured',
      windowCount: features.length,
      features: features.map(({ id }) => ({
        type: 'Feature',
        id,
        geometry,
        properties: { tileId: 'test', centerInArea },
      })),
    },
    results: ['mars', 'moon'].map((body) => ({
      type: 'FeatureCollection',
      reference: { id: body, name: body, body },
      comparableWindows: features.length,
      features,
    })),
  };
}

beforeEach(() => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
});

it('valida el contrato espacial, conserva cero y rechaza una geometría inválida', () => {
  const fixture = response(area);
  expect(parseSearch(fixture).results[0].features[0].properties.comparison.distance).toBe(0);
  expect(() => parseSearch({ ...fixture, sourceSearch: undefined })).toThrow();
  fixture.coverage.features[0].geometry = { ...geometry, coordinates: [[[0, 0]]] };
  expect(() => parseSearch(fixture)).toThrow();
});

it('envía el rectángulo, la referencia y el límite opcional', async () => {
  const service = TestBed.inject(DiscoveryData);
  const http = TestBed.inject(HttpTestingController);
  const payload = response(area);
  const result = firstValueFrom(service.search({ area, referenceId: 'mars', limit: 3 }));
  const req = http.expectOne(({ url }) => url === endpoint);
  expect(req.request.method).toBe('GET');
  expect(
    Object.fromEntries(req.request.params.keys().map((key) => [key, req.request.params.get(key)])),
  ).toEqual({
    west: '-66',
    south: '-23',
    east: '-65',
    north: '-22',
    reference_region_id: 'mars',
    limit: '3',
  });
  req.flush({ ...payload, results: [payload.results[0]] });
  expect((await result).results[0].reference.id).toBe('mars');
  http.verify();
});

it('reutiliza la respuesta para Ambos al alternar a una referencia', async () => {
  const service = TestBed.inject(DiscoveryData);
  const http = TestBed.inject(HttpTestingController);
  const result = firstValueFrom(service.search({ area }));
  http.expectOne(({ url }) => url === endpoint).flush(response(area));
  await result;

  expect(
    (await firstValueFrom(service.search({ area, referenceId: 'moon' }))).results,
  ).toHaveLength(1);
  http.expectNone(({ url }) => url === endpoint);
  http.verify();
});

it('reutiliza ambos rankings cuando las referencias ya se consultaron por separado', async () => {
  const service = TestBed.inject(DiscoveryData);
  const http = TestBed.inject(HttpTestingController);
  const payload = response(area);
  for (const group of payload.results) {
    const result = firstValueFrom(service.search({ area, referenceId: group.reference.id }));
    http.expectOne(({ url }) => url === endpoint).flush({ ...payload, results: [group] });
    await result;
  }

  const result = await firstValueFrom(service.search({ area, referenceIds: ['mars', 'moon'] }));
  expect(result.results.map(({ reference }) => reference.id)).toEqual(['mars', 'moon']);
  http.expectNone(({ url }) => url === endpoint);
  http.verify();
});

it('combina ambos lados del antimeridiano, deduplica y limita después de ordenar', async () => {
  const service = TestBed.inject(DiscoveryData);
  const http = TestBed.inject(HttpTestingController);
  const result = firstValueFrom(service.search({ area: [170, -10, -170, 10], limit: 2 }));
  const [west, east] = http.match(({ url }) => url === endpoint);
  expect(west.request.params.get('east')).toBe('180');
  expect(east.request.params.get('west')).toBe('-180');
  expect(west.request.params.has('limit')).toBe(false);
  expect(east.request.params.has('limit')).toBe(false);
  west.flush(
    response([170, -10, 180, 10], [windowFeature('a', 0.3), windowFeature('c', 0.5)], false),
  );
  east.flush(response([-180, -10, -170, 10], [windowFeature('b', 0.3), windowFeature('a', 0.3)]));
  const merged = await result;
  expect(merged.coverage.windowCount).toBe(3);
  expect(merged.coverage.features.find(({ id }) => id === 'a')?.properties.centerInArea).toBe(true);
  expect(merged.results[0].comparableWindows).toBe(3);
  expect(merged.results[0].features.map(({ id }) => id)).toEqual(['a', 'b']);
  http.verify();
});

it('lee errores de FastAPI con detalle de texto y de lista', () => {
  for (const detail of ['Orden inválido', [{ msg: 'Orden inválido' }]]) {
    expect(searchErrorText(new HttpErrorResponse({ status: 422, error: { detail } }))).toContain(
      'Orden inválido',
    );
  }
  expect(searchErrorText(new HttpErrorResponse({ status: 503 }))).toContain('inventario');
  expect(searchErrorText(new HttpErrorResponse({ status: 404 }))).toContain('referencia');
  expect(searchErrorText(new HttpErrorResponse({ status: 0 }))).toContain('conectar');
  expect(searchErrorText(new Error())).toContain('inválida');
});

it('cancela una búsqueda sustituida y publica solo la respuesta vigente', async () => {
  const service = TestBed.inject(DiscoveryData);
  const http = TestBed.inject(HttpTestingController);
  const query = signal<DiscoveryQuery>({ area });
  const resource = TestBed.runInInjectionContext(() =>
    rxResource({ params: query, stream: ({ params }) => service.search(params) }),
  );
  TestBed.tick();
  const previous = http.expectOne(({ url }) => url === endpoint);

  const next: Area = [-69, -23, -68, -22];
  query.set({ area: next });
  TestBed.tick();
  expect(previous.cancelled).toBe(true);
  http
    .expectOne(({ url, params }) => url === endpoint && params.get('west') === '-69')
    .flush(response(next));
  await TestBed.inject(ApplicationRef).whenStable();
  expect(resource.value()?.boundsWgs84).toEqual(next);
  http.verify();
});
