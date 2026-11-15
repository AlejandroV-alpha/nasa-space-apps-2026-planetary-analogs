import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { DataState } from '../../../shared/components/data-state';
import { EnvironmentData } from '../infrastructure/environment-data';

@Component({
  selector: 'app-environment-panel',
  imports: [DataState],
  providers: [EnvironmentData],
  templateUrl: './environment-panel.html',
})
export class EnvironmentPanel {
  readonly siteId = input.required<string>();
  protected readonly resource = inject(EnvironmentData).forSite(this.siteId);
  protected readonly absent = computed(() => {
    const error = this.resource.error();
    return error instanceof HttpErrorResponse && error.status === 404;
  });
  protected readonly variables = computed(() =>
    this.resource.hasValue() ? Object.entries(this.resource.value().site.variables) : [],
  );
  protected readonly format = new Intl.NumberFormat('es', { maximumFractionDigits: 3 });
}
