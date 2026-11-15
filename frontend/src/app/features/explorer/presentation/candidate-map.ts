import { DOCUMENT } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import {
  ControlComponent,
  GeoJSONSourceComponent,
  MapComponent,
  MarkerComponent,
  NavigationControlDirective,
} from '@maplibre/ngx-maplibre-gl';
import { provideMaplibreWorker } from '@maplibre/ngx-maplibre-gl/config';
import type { FeatureCollection, Point } from 'geojson';
import { LngLatBounds, type Map } from 'maplibre-gl';
import { ButtonModule } from 'primeng/button';
import type { Site } from '../../../core/data/analog-dataset.model';
import { validEarthPosition } from '../../../shared/utils/science-format';
import { EARTH_MAP_STYLE } from '../infrastructure/earth-map-style';

@Component({
  selector: 'app-candidate-map',
  imports: [
    MapComponent,
    MarkerComponent,
    GeoJSONSourceComponent,
    ControlComponent,
    NavigationControlDirective,
    ButtonModule,
  ],
  providers: [provideMaplibreWorker('maplibre/maplibre-gl-worker.mjs')],
  templateUrl: './candidate-map.html',
})
export class CandidateMap {
  private readonly document = inject(DOCUMENT);
  private readonly map = signal<Map | undefined>(undefined);
  readonly sites = input.required<readonly Site[]>();
  readonly selectedId = input<string>();
  readonly siteSelected = output<string>();

  protected readonly style = EARTH_MAP_STYLE;
  protected readonly failed = signal(false);
  protected readonly available = signal(this.supportsWebGl());
  protected readonly ready = computed(() => !!this.map());
  protected readonly points = computed<FeatureCollection<Point, { id: string; name: string }>>(
    () => {
      const features: FeatureCollection<Point, { id: string; name: string }>['features'] = [];
      for (const site of this.sites()) {
        const coordinates = site.geometry?.coordinates;
        if (validEarthPosition(coordinates)) {
          features.push({
            type: 'Feature',
            id: site.id,
            geometry: { type: 'Point', coordinates: [coordinates[0], coordinates[1]] },
            properties: { id: site.id, name: site.name },
          });
        }
      }

      return { type: 'FeatureCollection', features };
    },
  );

  constructor() {
    effect(() => {
      const map = this.map();
      const points = this.points().features;
      const selectedId = this.selectedId();
      const selected = points.find((point) => point.properties.id === selectedId);
      if (!map || points.length === 0) {
        return;
      }

      const duration = this.document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)')
        .matches
        ? 0
        : 350;
      if (selected) {
        const [longitude, latitude] = selected.geometry.coordinates;
        map.easeTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), 5), duration });
        return;
      }

      const bounds = new LngLatBounds();
      for (const point of points) {
        const [longitude, latitude] = point.geometry.coordinates;
        bounds.extend([longitude, latitude]);
      }
      map.fitBounds(bounds, { padding: 65, maxZoom: 7, duration });
    });
  }

  protected onLoad(map: Map): void {
    this.map.set(map);
  }

  protected retry(): void {
    this.failed.set(false);
    this.map.set(undefined);
    this.available.set(false);
    requestAnimationFrame(() => this.available.set(this.supportsWebGl()));
  }

  private supportsWebGl(): boolean {
    const context = this.document.createElement('canvas').getContext('webgl2');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return context !== null;
  }
}
