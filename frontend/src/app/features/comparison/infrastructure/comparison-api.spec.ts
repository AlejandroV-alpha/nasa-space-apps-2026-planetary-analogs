import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ComparisonApi } from './comparison-api';

describe('ComparisonApi', () => {
  const request = {
    reference_region_id: 'jezero-sector',
    site_ids: ['siloli-sector', 'coipasa-sector'],
  };
  let api: ComparisonApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ComparisonApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends the API contract and preserves a signed zero and missing differences', async () => {
    const result = firstValueFrom(api.compare(request));
    const outgoing = http.expectOne('/api/v1/compare');
    expect(outgoing.request.method).toBe('POST');
    expect(outgoing.request.body).toEqual(request);
    outgoing.flush({
      ...request,
      dataset_status: 'draft',
      notice: 'Diferencias descriptivas',
      rows: [
        {
          key: 'slope-median',
          reference: null,
          sites: [null, null],
          comparable: false,
          signed_differences: [0, null],
          reason: 'Sin dato',
        },
      ],
    });
    expect((await result).rows[0].signed_differences).toEqual([0, null]);
  });

  it('rejects a mismatched response without displaying stale results', async () => {
    const result = firstValueFrom(api.compare(request));
    const assertion = expect(result).rejects.toThrow('Respuesta de comparación inesperada.');
    http
      .expectOne('/api/v1/compare')
      .flush({ ...request, site_ids: [], rows: [], notice: 'Inválida' });
    await assertion;
  });

  it('preserves the backend validation status for the application layer', async () => {
    const result = firstValueFrom(api.compare(request));
    const assertion = expect(result).rejects.toMatchObject({ status: 422 });
    http.expectOne('/api/v1/compare').flush(
      { detail: 'Candidatos incompatibles' },
      {
        status: 422,
        statusText: 'Unprocessable Entity',
      },
    );
    await assertion;
  });
});
