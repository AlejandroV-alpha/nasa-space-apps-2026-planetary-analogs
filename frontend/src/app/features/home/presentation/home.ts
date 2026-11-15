import { Component, signal, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { scienceError } from '../../../core/data/api-read';
import { WindowCharacterizationData } from '../../explorer/infrastructure/window-characterization-data';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AnalogDataService } from '../../../core/data/analog-data.service';
import { DataState } from '../../../shared/components/data-state';
import { catalogStatus } from '../../../shared/utils/science-format';

@Component({
  selector: 'app-home',
  imports: [RouterLink, ButtonModule, DataState],
  templateUrl: './home.html',
})
export class Home {
  private readonly science = inject(WindowCharacterizationData);
  protected readonly showHighlights = signal(false);
  protected readonly scienceError = scienceError;
  protected readonly highlights = rxResource({
    params: () => (this.showHighlights() ? true : undefined),
    stream: () => this.science.highlights(),
  });
  protected readonly catalog = inject(AnalogDataService);
  protected readonly catalogStatus = catalogStatus;
}
