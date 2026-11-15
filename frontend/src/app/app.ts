import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SiteHeader } from './shared/layout/site-header';

@Component({
  imports: [RouterOutlet, SiteHeader],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {}
