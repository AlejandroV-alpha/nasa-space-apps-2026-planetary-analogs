import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DataState } from '../../../shared/components/data-state';
import { WindowCharacterizationData } from '../infrastructure/window-characterization-data';

@Component({
  selector: 'app-window-characterization',
  imports: [DataState, DecimalPipe],
  templateUrl: './window-characterization.html',
})
export class WindowCharacterization {
  private readonly data = inject(WindowCharacterizationData);
  readonly windowId = input.required<string>();
  readonly referenceId = input.required<string>();
  private readonly expanded = signal(false);
  protected readonly selectedStudy = signal<string | undefined>(undefined);
  private readonly selection = computed(() => ({
    windowId: this.windowId(),
    referenceRegionId: this.referenceId(),
  }));
  protected readonly characterization = rxResource({
    params: () => (this.expanded() ? this.selection() : undefined),
    stream: ({ params }) => this.data.forWindow(params),
  });
  protected readonly emit = computed(() => {
    if (!this.characterization.hasValue()) return undefined;
    const observations = this.characterization.value().geology.earth.emitObservations;
    const selected = observations?.scenes.find(
      (scene) => scene.granule === observations.selectedGranule,
    );
    if (!selected) return undefined;
    return {
      ...selected,
      displayMatches: [1, 2].flatMap((group) =>
        selected.matches.filter((match) => match.group === group).slice(0, 3),
      ),
    };
  });
  protected readonly study = rxResource({
    params: () => {
      const id = this.selectedStudy();
      const selection = this.selection();
      if (
        this.expanded() &&
        id &&
        this.characterization.hasValue() &&
        this.characterization.value().evidence.relatedStudies.some((item) => item.id === id)
      ) {
        return { id, selection };
      }
      return undefined;
    },
    stream: ({ params }) => this.data.study(params.id, params.selection),
  });
  protected readonly availability = {
    available: 'Indicadores calculados',
    qualitative: 'Comparación cualitativa por familia',
    catalogued: 'Productos identificados en catálogo',
    context_only: 'Contexto disponible',
    not_evaluated: 'Pendiente de evaluación',
  };
  protected readonly applicationNames = {
    rover_mobility: 'Movilidad y navegación de rovers',
    geological_sampling: 'Muestreo geológico',
    field_operations: 'Operaciones de campo',
  };
  protected readonly conditionNames: Record<string, string> = {
    surface_bearing_strength: 'resistencia del suelo',
    obstacle_distribution: 'distribución y tamaño de obstáculos',
    rover_specific_limits: 'límites del rover',
    verified_surface_materials: 'materiales superficiales verificados',
    sampling_access: 'acceso para el muestreo',
    site_access: 'acceso al sitio',
    permits: 'permisos',
    local_hazards: 'riesgos locales',
    comparable_regional_topography: 'mediciones topográficas comparables',
  };

  protected onToggle(event: Event): void {
    if (event.target instanceof HTMLDetailsElement) {
      this.expanded.set(event.target.open);
    }
  }
}
