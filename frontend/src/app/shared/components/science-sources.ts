import { Component, input } from '@angular/core';
import type { Source } from '../../core/data/analog-dataset.model';

@Component({
  selector: 'app-science-sources',
  template: `
    @if (sources().length) {
      <ul class="divide-y divide-surface-200 dark:divide-surface-700">
        @for (source of sources(); track source.id) {
          <li class="py-4">
            <a
              class="font-semibold text-primary underline underline-offset-4"
              [href]="source.url"
              >{{ source.product }}</a
            >
            <p class="mt-1 text-sm text-muted-color">
              {{ source.agency }} · {{ source.version }} · {{ source.license }}
            </p>
            <p class="mt-1 text-sm">{{ source.attribution }}</p>
          </li>
        }
      </ul>
    } @else {
      <p class="text-sm text-muted-color">No hay fuentes disponibles.</p>
    }
  `,
})
export class ScienceSources {
  readonly sources = input.required<readonly Source[]>();
}
