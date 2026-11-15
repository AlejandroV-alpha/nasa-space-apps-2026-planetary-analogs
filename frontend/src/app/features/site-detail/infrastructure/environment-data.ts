import { httpResource } from '@angular/common/http';
import { Injectable, inject, type Signal } from '@angular/core';
import { API_BASE_URL } from '../../../core/config/api-url';

interface EnvironmentalVariable {
  label: string;
  unit: string;
  validDays: number;
  mean: number | null;
}

export interface SiteEnvironment {
  source: string;
  sourceUrl: string;
  period: { start: string; end: string; timeStandard: string };
  limitations: string[];
  site: { siteId: string; variables: Record<string, EnvironmentalVariable> };
}

function parseEnvironment(value: unknown, id: string | undefined): SiteEnvironment {
  if (typeof value !== 'object' || !value) {
    throw new Error('Respuesta ambiental inválida.');
  }
  const env = value as Partial<SiteEnvironment> & { schemaVersion?: string };
  if (
    env.schemaVersion !== '1.0.0' ||
    typeof env.source !== 'string' ||
    typeof env.sourceUrl !== 'string' ||
    !env.period ||
    typeof env.period.start !== 'string' ||
    typeof env.period.end !== 'string' ||
    typeof env.period.timeStandard !== 'string' ||
    !Array.isArray(env.limitations) ||
    env.limitations.some((item) => typeof item !== 'string') ||
    !env.site ||
    env.site.siteId !== id ||
    !env.site.variables ||
    typeof env.site.variables !== 'object' ||
    Array.isArray(env.site.variables) ||
    Object.values(env.site.variables).some(
      (variable) =>
        !variable ||
        typeof variable.label !== 'string' ||
        typeof variable.unit !== 'string' ||
        !Number.isInteger(variable.validDays) ||
        variable.validDays < 0 ||
        (variable.mean !== null && !Number.isFinite(variable.mean)),
    )
  ) {
    throw new Error('Respuesta ambiental inválida.');
  }

  return {
    source: env.source,
    sourceUrl: env.sourceUrl,
    period: env.period,
    limitations: env.limitations,
    site: env.site,
  };
}

@Injectable()
export class EnvironmentData {
  private readonly api = inject(API_BASE_URL);

  forSite(siteId: Signal<string | undefined>) {
    return httpResource<SiteEnvironment>(
      () => {
        const id = siteId();
        if (id) {
          return {
            url: this.api + '/sites/' + encodeURIComponent(id) + '/environment',
            timeout: 12000,
          };
        }
        return undefined;
      },
      { parse: (value) => parseEnvironment(value, siteId()) },
    );
  }
}
