import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header
      class="border-b border-surface-200 bg-surface-0 dark:border-surface-800 dark:bg-surface-950"
    >
      <div
        class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-4 sm:px-8"
      >
        <a routerLink="/" class="inline-flex items-center gap-3 font-semibold tracking-tight">
          <span
            class="grid size-9 place-items-center rounded-xl bg-primary text-primary-contrast"
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
              routerLinkActive="bg-primary-50 text-primary-800 dark:bg-surface-800 dark:text-primary"
              [routerLinkActiveOptions]="{ exact: item.path === '/' }"
              ariaCurrentWhenActive="page"
              class="rounded-lg px-2.5 py-2 font-medium hover:bg-surface-100 focus-visible:outline-2 focus-visible:outline-primary dark:hover:bg-surface-800 sm:px-3"
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
