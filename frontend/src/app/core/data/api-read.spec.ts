import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, expect, it } from 'vitest';
import { ApiRead, scienceError } from './api-read';

beforeEach(() => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
});

it('shares a pending request and caches its validated response', async () => {
  const api = TestBed.inject(ApiRead);
  const http = TestBed.inject(HttpTestingController);
  const first = firstValueFrom(api.get<{ id: string }>('/analog-studies/study'));
  const second = firstValueFrom(api.get<{ id: string }>('/analog-studies/study'));
  http.expectOne('/api/v1/analog-studies/study').flush({ id: 'study' });
  expect(await first).toEqual({ id: 'study' });
  expect(await second).toEqual({ id: 'study' });
  expect(await firstValueFrom(api.get('/analog-studies/study'))).toEqual({ id: 'study' });
  http.verify();
});

it('cancels an obsolete request and retries a failed panel independently', async () => {
  const api = TestBed.inject(ApiRead);
  const http = TestBed.inject(HttpTestingController);
  const pending = api.get('/discovered-candidates/old/thermal').subscribe();
  const obsolete = http.expectOne('/api/v1/discovered-candidates/old/thermal');
  pending.unsubscribe();
  expect(obsolete.cancelled).toBe(true);

  const request = api.get('/discovered-candidates/new/thermal');
  const failure = firstValueFrom(request).catch((error: unknown) => scienceError(error));
  http.expectOne('/api/v1/discovered-candidates/new/thermal').flush(null, {
    status: 503,
    statusText: 'Unavailable',
  });
  expect(await failure).toContain('temporalmente inaccesible');
  const retry = firstValueFrom(request);
  http
    .expectOne('/api/v1/discovered-candidates/new/thermal')
    .flush({ comparison: { comparable: false } });
  expect(await retry).toEqual({ comparison: { comparable: false } });
  http.verify();
});
