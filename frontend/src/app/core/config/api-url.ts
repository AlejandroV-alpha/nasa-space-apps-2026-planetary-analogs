import { InjectionToken } from '@angular/core';

declare const PLANETARY_API_BASE_URL: string;

export const DEFAULT_API_BASE_URL = '/api/v1';

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => {
    // Angular's --define can supply an absolute HTTPS URL for static hosting.
    if (typeof PLANETARY_API_BASE_URL === 'string' && PLANETARY_API_BASE_URL) {
      return PLANETARY_API_BASE_URL.replace(/\/+$/, '');
    }

    return DEFAULT_API_BASE_URL;
  },
});
