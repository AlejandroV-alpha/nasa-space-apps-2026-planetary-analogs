import { Component, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';

@Component({
  selector: 'app-data-state',
  imports: [ButtonModule, MessageModule, SkeletonModule],
  template: `
    @if (loading()) {
      <div class="space-y-3 py-6" role="status">
        <p class="text-sm text-muted-color">Cargando datos…</p>
        <p-skeleton height="3rem" />
        <p-skeleton height="3rem" />
      </div>
    } @else if (failed()) {
      <div class="space-y-4 py-6">
        <p-message severity="error">{{ errorText() }}</p-message>
        <button pButton type="button" (click)="retry.emit()">Reintentar</button>
      </div>
    } @else {
      <ng-content />
    }
  `,
})
export class DataState {
  readonly loading = input(false);
  readonly failed = input(false);
  readonly errorText = input('No pudimos cargar los datos de FastAPI.');
  readonly retry = output();
}
