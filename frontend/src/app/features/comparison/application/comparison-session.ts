import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, Subject, switchMap } from 'rxjs';
import type { ComparisonRequest, ComparisonResult } from '../domain/comparison';
import { ComparisonApi } from '../infrastructure/comparison-api';

interface ComparisonState {
  readonly loading?: boolean;
  readonly result?: ComparisonResult;
  readonly error?: string;
}

const initialState: ComparisonState = {};

@Injectable()
export class ComparisonSession {
  private readonly api = inject(ComparisonApi);
  private readonly submissions = new Subject<ComparisonRequest | null>();
  readonly state = toSignal(
    this.submissions.pipe(
      switchMap((request) => {
        if (!request) {
          return of<ComparisonState>({});
        }

        return this.api.compare(request).pipe(
          map((result): ComparisonState => ({ result })),
          startWith<ComparisonState>({ loading: true }),
          catchError((error: unknown) => of<ComparisonState>({ error: this.messageFor(error) })),
        );
      }),
    ),
    { initialValue: initialState },
  );

  submit(regionId: string, siteIds: readonly string[]): void {
    if (siteIds.length < 2 || siteIds.length > 3 || new Set(siteIds).size !== siteIds.length) {
      return;
    }

    this.submissions.next({ reference_region_id: regionId, site_ids: siteIds });
  }

  clear(): void {
    this.submissions.next(null);
  }

  private messageFor(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 422) {
        const detail: unknown = error.error?.detail;
        if (typeof detail === 'string') {
          return detail;
        }
        return 'Elige dos o tres candidatos distintos de la misma región.';
      }
      if (error.status === 404) {
        return 'La referencia o alguno de los candidatos ya no está disponible.';
      }
      if (error.status === 0 || error.status === 503) {
        return 'FastAPI no está disponible. Comprueba la conexión y vuelve a intentar.';
      }
    }

    return 'No se pudo obtener una comparación válida.';
  }
}
