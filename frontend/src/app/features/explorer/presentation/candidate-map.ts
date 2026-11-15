import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  ControlComponent,
  GeoJSONSourceComponent,
  LayerComponent,
  MapComponent,
  MarkerComponent,
  NavigationControlDirective,
} from '@maplibre/ngx-maplibre-gl';
import { provideMaplibreWorker } from '@maplibre/ngx-maplibre-gl/config';
import type { FeatureCollection, Point, Polygon } from 'geojson';
import { LngLatBounds, type Map as MapLibreMap, type MapGeoJSONFeature } from 'maplibre-gl';
import { ButtonModule } from 'primeng/button';
import { TerraDraw, TerraDrawRectangleMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import type { Site } from '../../../core/data/analog-dataset.model';
import { validEarthPosition } from '../../../shared/utils/science-format';
import { EARTH_MAP_STYLE } from '../infrastructure/earth-map-style';
import { areaFromPolygon, areaPolygon, areaSegments, type Area } from '../domain/geographic-area';
import type { MeasuredCoverage, RankedWindow } from '../domain/discovery';

@Component({
  selector: 'app-candidate-map',
  imports: [
    MapComponent,
    MarkerComponent,
    GeoJSONSourceComponent,
    LayerComponent,
    ControlComponent,
    NavigationControlDirective,
    ButtonModule,
  ],
  providers: [provideMaplibreWorker('maplibre/maplibre-gl-worker.mjs')],
  templateUrl: './candidate-map.html',
})
export class CandidateMap {
  private readonly document = inject(DOCUMENT);
  private readonly map = signal<MapLibreMap | undefined>(undefined);
  readonly sites = input.required<readonly Site[]>();
  readonly selectedId = input<string>();
  readonly siteSelected = output<string>();
  readonly discovery = input(false);
  readonly windows = input<readonly RankedWindow[]>([]);
  readonly area = input<Area>();
  readonly coverage = input<MeasuredCoverage>();
  protected readonly crossesAntimeridian = computed(() => {
    const area = this.area();
    return !!area && area[0] > area[2];
  });
  readonly selectedWindow = input<string>();
  readonly windowSelected = output<string>();
  readonly areaChanged = output<Area | undefined>();
  private draw?: TerraDraw;
  readonly drawing = signal(false);
  protected readonly drawError = signal(false);
  private readonly hoveredKey = signal<string | undefined>(undefined);
  protected readonly hoveredWindow = computed(() =>
    this.windows().find(({ key }) => key === this.hoveredKey()),
  );
  protected readonly colors = signal({ land: '#1473D2', window: '#E87932', coverage: '#536581' });
  protected readonly coverageShape = computed<FeatureCollection<Polygon>>(
    () => this.coverage() ?? { type: 'FeatureCollection', features: [] },
  );
  private readonly mapWindows = computed(() => {
    const windows = new Map<string, RankedWindow>();
    for (const row of this.windows()) {
      if (!windows.has(row.window.id) || row.key === this.selectedWindow()) {
        windows.set(row.window.id, row);
      }
    }

    return Array.from(windows.values());
  });
  protected readonly polygons = computed<FeatureCollection<Polygon>>(() => ({
    type: 'FeatureCollection',
    features: this.mapWindows().map(({ window, key }) => ({
      type: 'Feature',
      geometry: window.geometry,
      properties: { key, selected: key === this.selectedWindow() },
    })),
  }));
  protected readonly centers = computed<FeatureCollection<Point>>(() => ({
    type: 'FeatureCollection',
    features: this.mapWindows().map(({ window, key }) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: Array.from(window.properties.center) },
      properties: { key, selected: key === this.selectedWindow() },
    })),
  }));
  protected readonly areaShape = computed<FeatureCollection<Polygon>>(() => {
    const area = this.area();
    return {
      type: 'FeatureCollection',
      features: area
        ? areaSegments(area).map((part) => ({
            type: 'Feature',
            geometry: areaPolygon(part),
            properties: {},
          }))
        : [],
    };
  });

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
    inject(DestroyRef).onDestroy(() => this.stopDraw());
    effect(() => {
      const map = this.map();
      const area = this.area();
      if (map && area && !this.drawing()) {
        map.fitBounds(
          [
            [area[0], area[1]],
            [this.crossesAntimeridian() ? area[2] + 360 : area[2], area[3]],
          ],
          { padding: 32, maxZoom: 11, duration: 0 },
        );
      }
    });
    effect(() => {
      const map = this.map();
      if (this.discovery()) {
        return;
      }
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

  protected onLoad(map: MapLibreMap): void {
    this.map.set(map);
    if (!this.discovery()) {
      return;
    }

    const tokens = getComputedStyle(this.document.documentElement);
    this.colors.set({
      land: tokens.getPropertyValue('--p-primary-600').trim(),
      window: tokens.getPropertyValue('--p-mars-orange-600').trim(),
      coverage: tokens.getPropertyValue('--p-surface-600').trim(),
    });
    this.draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map, coordinatePrecision: 6 }),
      modes: [
        new TerraDrawRectangleMode({
          styles: { fillColor: this.colors().land as `#${string}`, fillOpacity: 0.18 },
        }),
      ],
    });
    this.draw.on('finish', (id) => {
      const feature = this.draw?.getSnapshot().find((item) => item.id === id);
      const area =
        feature?.geometry.type === 'Polygon' ? areaFromPolygon(feature.geometry) : undefined;
      this.cancelDraw();
      this.drawError.set(!area);
      this.areaChanged.emit(area);
    });
    this.draw.start();
    const bounds = new LngLatBounds();
    for (const point of this.points().features) {
      bounds.extend([point.geometry.coordinates[0], point.geometry.coordinates[1]]);
    }
    if (!this.area() && !bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 70, maxZoom: 7, duration: 0 });
    }
  }

  protected beginDraw(): void {
    if (!this.draw) {
      return;
    }
    this.previewWindow();
    this.drawError.set(false);
    this.areaChanged.emit(undefined);
    this.drawing.set(true);
    this.draw.setMode('rectangle');
  }

  cancelDraw(): void {
    if (!this.drawing()) {
      return;
    }
    this.draw?.setMode('static');
    this.draw?.clear();
    this.drawing.set(false);
  }

  protected chooseWindow(features?: MapGeoJSONFeature[]): void {
    const key: unknown = features?.[0]?.properties['key'];
    if (!this.drawing() && typeof key === 'string') {
      this.windowSelected.emit(key);
    }
  }

  protected previewWindow(features?: MapGeoJSONFeature[]): void {
    const key: unknown = features?.[0]?.properties['key'];
    const hovered = !this.drawing() && typeof key === 'string';
    this.hoveredKey.set(hovered ? key : undefined);
    const canvas = this.map()?.getCanvas();
    if (canvas && !this.drawing()) {
      canvas.style.cursor = hovered ? 'pointer' : '';
    }
  }

  private stopDraw(): void {
    this.draw?.stop();
    this.draw = undefined;
  }

  protected retry(): void {
    this.stopDraw();
    this.drawing.set(false);
    this.failed.set(false);
    this.map.set(undefined);
    this.hoveredKey.set(undefined);
    this.available.set(false);
    requestAnimationFrame(() => this.available.set(this.supportsWebGl()));
  }

  private supportsWebGl(): boolean {
    const context = this.document.createElement('canvas').getContext('webgl2');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return context !== null;
  }
}
