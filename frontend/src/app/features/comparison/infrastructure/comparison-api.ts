import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api-url';
import type { ComparisonRequest, ComparisonResult } from '../domain/comparison';

@Injectable({ providedIn: 'root' })
export class ComparisonApi {
  private readonly http = inject(HttpClient);
  private readonly apiBase = inject(API_BASE_URL);

  compare(request: ComparisonRequest) {
    return this.http
      .post<ComparisonResult>(this.apiBase + '/compare', request, { timeout: 12000 })
      .pipe(
        map((result) => {
          if (
            !result ||
            result.reference_region_id !== request.reference_region_id ||
            !Array.isArray(result.site_ids) ||
            result.site_ids.length !== request.site_ids.length ||
            result.site_ids.some((id, index) => id !== request.site_ids[index]) ||
            !Array.isArray(result.rows) ||
            typeof result.notice !== 'string'
          ) {
            throw new Error('Respuesta de comparación inesperada.');
          }

          for (const row of result.rows) {
            if (
              !row ||
              !Array.isArray(row.sites) ||
              !Array.isArray(row.signed_differences) ||
              row.sites.length !== result.site_ids.length ||
              row.signed_differences.length !== result.site_ids.length ||
              typeof row.comparable !== 'boolean' ||
              row.signed_differences.some(
                (value: unknown) =>
                  value !== null && (typeof value !== 'number' || !Number.isFinite(value)),
              )
            ) {
              throw new Error('Fila de comparación inesperada.');
            }
          }

          return result;
        }),
      );
  }
}
