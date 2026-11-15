import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
import { EnvironmentData } from './environment-data';

it('carga contexto por sitio y conserva la ausencia publicada', async () => {
  TestBed.configureTestingModule({
    providers: [EnvironmentData, provideHttpClient(), provideHttpClientTesting()],
  });
  const id = signal('siloli-sector');
  const resource = TestBed.runInInjectionContext(() => TestBed.inject(EnvironmentData).forSite(id));
  const http = TestBed.inject(HttpTestingController);
  TestBed.tick();
  const request = http.expectOne('/api/v1/sites/siloli-sector/environment');
  expect(request.request.method).toBe('GET');
  request.flush({
    schemaVersion: '1.0.0',
    source: 'NASA POWER',
    sourceUrl: 'https://power.larc.nasa.gov',
    period: { start: '2025-01-01', end: '2025-12-31', timeStandard: 'LST' },
    limitations: [],
    site: {
      siteId: 'siloli-sector',
      variables: { T2M: { label: 'Temperatura', unit: 'C', validDays: 1, mean: 0 } },
    },
  });
  await TestBed.inject(ApplicationRef).whenStable();
  expect(resource.value()?.site.variables['T2M'].mean).toBe(0);

  id.set('coipasa-sector');
  TestBed.tick();
  http
    .expectOne('/api/v1/sites/coipasa-sector/environment')
    .flush({}, { status: 404, statusText: 'Not Found' });
  await TestBed.inject(ApplicationRef).whenStable();
  expect(resource.error()).toMatchObject({ status: 404 });
  http.verify();
});
