import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="border-b border-mission-border bg-mission text-surface-0">
      <div
        class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-5 py-3 sm:px-8"
      >
        <a routerLink="/" class="inline-flex items-center gap-3 font-semibold tracking-tight">
          <span
            class="grid size-9 place-items-center rounded-full border border-primary-700 text-primary-200"
            aria-hidden="true"
            ><i class="pi pi-globe"></i
          ></span>
          Planetary Analogs
        </a>
        <nav
          aria-label="Navegación principal"
          class="flex w-full flex-wrap gap-1 text-sm sm:w-auto sm:gap-2"
        >
          @for (item of navigation; track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="bg-surface-800 text-primary-200"
              [routerLinkActiveOptions]="{ exact: item.path === '/' }"
              ariaCurrentWhenActive="page"
              class="rounded-lg px-2.5 py-2.5 font-medium motion-safe:transition-colors hover:bg-surface-800 focus-visible:outline-2 focus-visible:outline-primary-300 sm:px-3"
              >{{ item.label }}</a
            >
          }
        </nav>
      </div>
    </header>
  `,
})
export class SiteHeader {
  protected readonly navigation = [
    { path: '/', label: 'Inicio' },
    { path: '/explorar', label: 'Explorar' },
    { path: '/comparar', label: 'Comparar' },
    { path: '/metodologia', label: 'Metodología' },
  ];
}
