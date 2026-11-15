import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Application } from '../domain/window-science';
import { SelectModule } from 'primeng/select';
import { rxResource } from '@angular/core/rxjs-interop';
import { DataState } from '../../../shared/components/data-state';
import { scienceError } from '../../../core/data/api-read';
import { WindowCharacterizationData } from '../infrastructure/window-characterization-data';
import { ScienceFindings } from './science-findings';

type Panel = 'geology' | 'thermal' | 'applications' | 'evidence';

@Component({
  selector: 'app-window-characterization',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataState, ScienceFindings, FormsModule, SelectModule],
  templateUrl: './window-characterization.html',
})
export class WindowCharacterization {
  private readonly data = inject(WindowCharacterizationData);
  readonly windowId = input.required<string>();
  readonly referenceId = input.required<string>();
  protected readonly mission = signal<Application['type'] | null>(null);
  protected readonly missions = [
    { label: 'Todos los usos', value: null },
    { label: 'Movilidad de rovers', value: 'rover_mobility' },
    { label: 'Muestreo geológico', value: 'geological_sampling' },
    { label: 'Operaciones de campo', value: 'field_operations' },
  ];
  private readonly expanded = signal(false);
  private readonly openPanels = signal<ReadonlySet<Panel>>(new Set());
  private readonly selection = computed(() => ({
    windowId: this.windowId(),
    referenceRegionId: this.referenceId(),
  }));
  protected readonly scienceError = scienceError;
  protected readonly geology = rxResource({
    params: () =>
      this.expanded() && this.openPanels().has('geology') ? this.selection() : undefined,
    stream: ({ params }) => this.data.geology(params),
  });
  protected readonly thermal = rxResource({
    params: () =>
      this.expanded() && this.openPanels().has('thermal') ? this.selection() : undefined,
    stream: ({ params }) => this.data.thermal(params),
  });
  protected readonly applications = rxResource({
    params: () =>
      this.expanded() && this.openPanels().has('applications')
        ? { selection: this.selection(), mission: this.mission() }
        : undefined,
    stream: ({ params }) => this.data.applications(params.selection, params.mission ?? undefined),
  });
  protected readonly evidence = rxResource({
    params: () =>
      this.expanded() && this.openPanels().has('evidence') ? this.selection() : undefined,
    stream: ({ params }) => this.data.evidence(params),
  });

  protected toggle(event: Event, panel?: Panel): void {
    if (!(event.target instanceof HTMLDetailsElement)) return;
    const open = event.target.open;
    if (!panel) {
      this.expanded.set(open);
      return;
    }
    this.openPanels.update((current) => {
      const next = new Set(current);
      if (open) next.add(panel);
      else next.delete(panel);
      return next;
    });
  }
}
