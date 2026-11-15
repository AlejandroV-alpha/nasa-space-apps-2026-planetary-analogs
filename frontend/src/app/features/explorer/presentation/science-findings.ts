import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type {
  Application,
  EvidenceResponse,
  GeologyResponse,
  ThermalResponse,
} from '../domain/window-science';
import { WINDOW_METRICS } from '../domain/discovery';

@Component({
  selector: 'app-science-findings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RouterLink],
  templateUrl: './science-findings.html',
})
export class ScienceFindings {
  readonly geology = input<GeologyResponse>();
  readonly thermal = input<ThermalResponse>();
  readonly applications = input<Application[]>();
  readonly evidence = input<EvidenceResponse>();
  protected readonly labels = WINDOW_METRICS;
  protected readonly dimensions = [
    { id: 'topography', label: 'Topografía' },
    { id: 'geology', label: 'Geología' },
    { id: 'thermal', label: 'Térmica' },
  ] as const;
  protected readonly availability = {
    available: 'Indicadores calculados',
    qualitative: 'Comparación cualitativa por familia',
    catalogued: 'Productos identificados en catálogo',
    context_only: 'Contexto disponible',
    not_evaluated: 'Pendiente de evaluación',
  } as const;
  protected readonly emit = computed(() => {
    const observations = this.geology()?.earth.emitObservations;
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
}
