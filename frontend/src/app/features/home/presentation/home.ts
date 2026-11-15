import { Component, inject } from '@angular/core';
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
  protected readonly catalog = inject(AnalogDataService);
  protected readonly catalogStatus = catalogStatus;
}
