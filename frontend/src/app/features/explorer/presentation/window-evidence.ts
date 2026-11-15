import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { AnalogDataService } from '../../../core/data/analog-data.service';
import type { ReferenceRegion } from '../../../core/data/analog-dataset.model';
import { ScienceSources } from '../../../shared/components/science-sources';
import { metricValue } from '../../../shared/utils/science-format';
import {
  WINDOW_METRICS,
  type DiscoveredWindow,
  type Discovery,
  type WindowMetric,
} from '../domain/discovery';

@Component({
  selector: 'app-window-evidence',
  imports: [ScienceSources, NgTemplateOutlet],
  templateUrl: './window-evidence.html',
})
export class WindowEvidence {
  private readonly catalog = inject(AnalogDataService);
  readonly window = input.required<DiscoveredWindow>();
  readonly reference = input.required<ReferenceRegion>();
  readonly discovery = input.required<Discovery>();
  protected readonly labels = WINDOW_METRICS;
  protected readonly metricValue = metricValue;
  protected readonly sources = computed(() =>
    this.catalog.sourcesFor(Array.from(new Set(['nasadem', ...this.reference().sourceIds]))),
  );
  protected readonly tile = computed(() =>
    this.discovery().search.tiles.find((tile) => tile.tileId === this.window().properties.tileId),
  );
  protected readonly interpretation = computed(() => {
    const slopes = this.window().properties.comparison.metrics.filter(
      (metric): metric is WindowMetric & { signedDifference: number } =>
        metric.unit === 'deg' && metric.signedDifference !== null,
    );
    const nearest = slopes.reduce<(typeof slopes)[number] | undefined>((best, metric) => {
      if (!best || Math.abs(metric.signedDifference) < Math.abs(best.signedDifference)) {
        return metric;
      }
      return best;
    }, undefined);
    if (!nearest) {
      return 'No hay diferencias de pendiente comparables a esta escala.';
    }
    return (
      'Entre las pendientes, el menor contraste absoluto corresponde a ' +
      this.labels[nearest.key] +
      ' (' +
      metricValue(nearest.signedDifference, 'deg', true) +
      ').'
    );
  });
}
