import { Injectable, inject } from '@angular/core';
import type { FeatureCollection, Point } from 'geojson';
import type { Method, ReferenceRegion, Site, Source, TargetBody } from './analog-dataset.model';
import { ApiRead } from './api-read';

interface Items<T> {
  total: number;
  items: T[];
}
interface DatasetState {
  status: 'available' | 'unavailable';
  detail: string | null;
}
type ScienceStatus = Record<'catalog' | 'discovery' | 'environment', DatasetState>;
export type SitePoints = FeatureCollection<Point, { id: string; name: string }>;

@Injectable({ providedIn: 'root' })
export class CatalogApi {
  private readonly api = inject(ApiRead);

  sites(body: TargetBody, referenceId?: string, country?: string) {
    return this.api.get<Items<Site>>('/sites', {
      target_body: body,
      ...(referenceId ? { reference_region_id: referenceId } : {}),
      ...(country ? { country } : {}),
    });
  }

  site(id: string) {
    return this.api.get<Site>('/sites/' + encodeURIComponent(id));
  }

  regions() {
    return this.api.get<Items<ReferenceRegion>>('/reference-regions');
  }

  region(id: string) {
    return this.api.get<ReferenceRegion>('/reference-regions/' + encodeURIComponent(id));
  }

  sources() {
    return this.api.get<Items<Source>>('/sources');
  }

  methods() {
    return this.api.get<Items<Method>>('/methods');
  }

  points(body: TargetBody) {
    return this.api.get<SitePoints>('/geojson/sites', { target_body: body });
  }

  status() {
    return this.api.get<ScienceStatus>('/science-status');
  }
}
