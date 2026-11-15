import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { defer, map, of, shareReplay, tap, type Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-url';

type Parameters = Record<string, string | number | boolean>;

@Injectable({ providedIn: 'root' })
export class ApiRead {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly cache = new Map<string, { value: Observable<unknown>; expiry: number }>();

  get<T>(path: string, params: Parameters = {}, validate?: (value: T) => T): Observable<T> {
    const key = JSON.stringify([path, params]);
    return defer(() => {
      const saved = this.cache.get(key);
      if (saved && saved.expiry > Date.now()) {
        return saved.value as Observable<T>;
      }

      const value = this.http.get<T>(this.base + path, { params, timeout: 12000 }).pipe(
        map((response) => (validate ? validate(response) : response)),
        tap({
          next: (response) => {
            if (this.cache.get(key)?.value === value) {
              this.cache.set(key, { value: of(response), expiry: Date.now() + 5 * 60_000 });
            }
          },
          error: () => {
            if (this.cache.get(key)?.value === value) this.cache.delete(key);
          },
        }),
        shareReplay({ bufferSize: 1, refCount: true }),
      );
      this.cache.delete(key);
      if (this.cache.size >= 64) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) this.cache.delete(oldest);
      }
      this.cache.set(key, { value, expiry: Date.now() + 5 * 60_000 });
      return value;
    });
  }
}

export function scienceError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse) || error.status === 200) {
    return 'La respuesta científica tiene un formato incompatible.';
  }
  switch (error.status) {
    case 0:
      return 'Se agotó el tiempo de espera o se perdió la conexión con FastAPI.';
    case 404:
      return 'El identificador solicitado no está disponible.';
    case 422:
      return 'FastAPI rechazó los parámetros de consulta.';
    case 503:
      return 'La exportación científica está temporalmente inaccesible.';
    default:
      return 'No se pudo completar la consulta científica.';
  }
}
