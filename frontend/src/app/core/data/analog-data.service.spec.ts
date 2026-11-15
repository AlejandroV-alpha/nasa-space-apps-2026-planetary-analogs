import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ANALOG_DATASET_URL, AnalogDataService, parseAnalogDataset } from './analog-data.service';
import type { AnalogDataset, Metric } from './analog-dataset.model';

const metric = (key: Metric['key'], value: number | null, scale = 500): Metric =>
  value === null
    ? {
        key,
        value,
        unit: key.startsWith('slope') ? 'deg' : 'm',
        status: 'missing',
        missingReason: 'Sin cobertura',
        sourceIds: [],
        methodId: null,
        analysisScaleM: null,
        validCoverageFraction: null,
      }
    : {
        key,
        value,
        unit: key.startsWith('slope') ? 'deg' : 'm',
        status: 'fixture',
        sourceIds: ['src'],
        methodId: 'm1',
        analysisScaleM: scale,
        validCoverageFraction: 1,
      };

const square = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
} as const;

const DATASET: AnalogDataset = {
  schemaVersion: '1.0.0',
  datasetId: 'test',
  generatedAt: '2026-11-14T00:00:00Z',
  status: 'fixture',
  sources: [
    {
      id: 'src',
      agency: 'NASA',
      product: 'P',
      version: '1',
      url: 'https://example.org',
      accessedAt: '2026-11-14',
      license: 'L',
      attribution: 'A',
      crs: 'EPSG:4326',
    },
  ],
  methods: [{ id: 'm1', name: 'M', description: 'D' }],
  referenceRegions: [
    {
      id: 'moon-ref',
      name: 'Luna',
      targetBody: 'moon',
      crs: 'IAU_2015:30100',
      center: { type: 'Point', coordinates: [0.5, 0.5] },
      geometry: square,
      description: 'd',
      sourceIds: [],
      evidenceStatus: 'fixture',
      metrics: [metric('slope-median', 9), metric('relief-p95-p5', 3000)],
    },
    {
      id: 'mars-ref',
      name: 'Marte',
      targetBody: 'mars',
      crs: 'IAU_2015:49900',
      center: { type: 'Point', coordinates: [0.5, 0.5] },
      geometry: square,
      description: 'd',
      sourceIds: [],
      evidenceStatus: 'fixture',
      metrics: [],
    },
  ],
  sites: [
    {
      id: 'a',
      name: 'A',
      country: 'BO',
      kind: 'candidate',
      geometry: { type: 'Point', coordinates: [0.5, 0.5] },
      studyArea: square,
      summary: 's',
      evidenceStatus: 'fixture',
      sourceIds: ['src'],
      assessments: [
        {
          targetBody: 'moon',
          referenceRegionId: 'moon-ref',
          testUseCase: 't',
          interpretation: 'i',
          limitations: ['l'],
          evidenceStatus: 'fixture',
        },
      ],
      metrics: [metric('slope-median', 3), metric('relief-p95-p5', null)],
    },
    {
      id: 'b',
      name: 'B',
      country: 'CL',
      kind: 'known_reference',
      geometry: { type: 'Point', coordinates: [0.5, 0.5] },
      studyArea: square,
      summary: 's',
      evidenceStatus: 'fixture',
      sourceIds: [],
      assessments: [
        {
          targetBody: 'mars',
          referenceRegionId: 'mars-ref',
          testUseCase: 't',
          interpretation: 'i',
          limitations: ['l'],
          evidenceStatus: 'fixture',
        },
      ],
      metrics: [metric('slope-median', 2, 30)],
    },
  ],
};

describe('AnalogDataService', () => {
  let service: AnalogDataService;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AnalogDataService);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
  });

  afterEach(() => http.verify());

  async function respond(body: object): Promise<void> {
    http.expectOne(ANALOG_DATASET_URL).flush(body);
    await TestBed.inject(ApplicationRef).whenStable();
  }

  it('carga el catálogo API y expone sitios y regiones', async () => {
    expect(service.isLoading()).toBe(true);
    await respond(DATASET);
    expect(service.isLoading()).toBe(false);
    expect(service.sites().length).toBe(2);
    expect(service.isFixture()).toBe(true);
    expect(service.siteById('a')?.name).toBe('A');
    expect(service.sourcesFor(['src', 'no-existe']).map((s) => s.id)).toEqual(['src']);
  });

  it('filtra por cuerpo para el selector Luna/Marte', async () => {
    await respond(DATASET);
    expect(service.sitesFor('moon').map((s) => s.id)).toEqual(['a']);
    expect(service.sitesFor('mars').map((s) => s.id)).toEqual(['b']);
    expect(service.regionsFor('mars').map((r) => r.id)).toEqual(['mars-ref']);
    expect(service.sitesForRegion('moon-ref').map((s) => s.id)).toEqual(['a']);
  });

  it('compara sin convertir ausencias en cero', async () => {
    await respond(DATASET);
    const rows = service.compare('moon-ref', ['a']);
    const slope = rows.find((r) => r.key === 'slope-median')!;
    const relief = rows.find((r) => r.key === 'relief-p95-p5')!;
    expect(slope.comparable).toBe(true);
    expect(relief.comparable).toBe(false);
    expect(relief.sites[0]?.value).toBeNull();
    expect(relief.sites[0]?.status).toBe('missing');
  });

  it('marca como no comparables métricas a escalas distintas', async () => {
    await respond(DATASET);
    const slope = service.compare('moon-ref', ['b']).find((r) => r.key === 'slope-median')!;
    expect(slope.comparable).toBe(false);
  });

  it('no compara métodos distintos aunque compartan escala', async () => {
    const changed = structuredClone(DATASET);
    Object.assign(changed.sites[0].metrics[0], { methodId: 'another-method' });
    await respond(changed);
    expect(service.compare('moon-ref', ['a'])[0].comparable).toBe(false);
  });

  it('no compara un sitio evaluado contra otra región', async () => {
    const changed = structuredClone(DATASET);
    Object.assign(changed.sites[1].metrics[0], { analysisScaleM: 500 });
    await respond(changed);
    expect(service.compare('moon-ref', ['b'])[0].comparable).toBe(false);
  });

  it('no mezcla valores calculados y de ejemplo', async () => {
    const changed = structuredClone(DATASET);
    Object.assign(changed.sites[0].metrics[0], { status: 'computed' });
    await respond(changed);
    expect(service.compare('moon-ref', ['a'])[0].comparable).toBe(false);
  });

  it('expone el error si el archivo no carga', async () => {
    http
      .expectOne(ANALOG_DATASET_URL)
      .flush('no encontrado', { status: 404, statusText: 'Not Found' });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(service.error()).toBeTruthy();
    expect(service.dataset()).toBeUndefined();
    expect(service.sites()).toEqual([]);
  });
});

describe('parseAnalogDataset', () => {
  it('rechaza una versión mayor de esquema no soportada', () => {
    expect(() => parseAnalogDataset({ ...DATASET, schemaVersion: '2.0.0' })).toThrow(
      /no soportada/,
    );
  });

  it('rechaza un dataset sin colecciones', () => {
    expect(() => parseAnalogDataset({ schemaVersion: '1.0.0' })).toThrow(/colección/);
  });
});
