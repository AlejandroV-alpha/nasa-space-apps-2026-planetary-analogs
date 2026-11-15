import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Inicio',
    loadComponent: () => import('./features/home/presentation/home').then((page) => page.Home),
  },
  {
    path: 'explorar',
    pathMatch: 'full',
    title: 'Explorar',
    loadComponent: () =>
      import('./features/explorer/presentation/discovery-explorer').then(
        (page) => page.DiscoveryExplorer,
      ),
  },
  {
    path: 'explorar/catalogo',
    title: 'Sitios del catálogo',
    loadComponent: () =>
      import('./features/explorer/presentation/explorer').then((page) => page.Explorer),
  },
  {
    path: 'sitios/:siteId',
    title: 'Ficha científica',
    loadComponent: () =>
      import('./features/site-detail/presentation/site-detail').then((page) => page.SiteDetail),
  },
  {
    path: 'comparar',
    title: 'Comparar',
    loadComponent: () =>
      import('./features/comparison/presentation/comparison').then((page) => page.Comparison),
  },
  {
    path: 'metodologia',
    title: 'Metodología',
    loadComponent: () =>
      import('./features/methodology/presentation/methodology').then((page) => page.Methodology),
  },
  {
    path: '**',
    title: 'Página no encontrada',
    loadComponent: () => import('./shared/layout/not-found').then((page) => page.NotFound),
  },
];
