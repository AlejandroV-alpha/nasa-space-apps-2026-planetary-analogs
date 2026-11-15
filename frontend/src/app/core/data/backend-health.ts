import { httpResource } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_BASE_URL } from '../config/api-url';

@Injectable({ providedIn: 'root' })
export class BackendHealth {
  private readonly api = inject(API_BASE_URL);
  readonly status = httpResource<{ status: string }>(() => ({
    url: this.api.replace(/\/api\/v1$/, '') + '/health',
    timeout: 5000,
  }));
}
