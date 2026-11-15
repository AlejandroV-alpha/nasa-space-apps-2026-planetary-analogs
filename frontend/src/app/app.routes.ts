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
    path: 'ventanas/:windowId',
    title: 'Ventana terrestre',
    loadComponent: () =>
      import('./features/explorer/presentation/scientific-detail').then(
        (page) => page.ScientificDetail,
      ),
  },
  {
    path: 'estudios/:studyId',
    title: 'Caso de estudio',
    loadComponent: () =>
      import('./features/explorer/presentation/scientific-detail').then(
        (page) => page.ScientificDetail,
      ),
  },
  {
    path: 'referencias/:regionId',
    title: 'Referencia planetaria',
    loadComponent: () =>
      import('./features/methodology/presentation/reference-detail').then(
        (page) => page.ReferenceDetail,
      ),
  },
  {
    path: '**',
    title: 'Página no encontrada',
    loadComponent: () => import('./shared/layout/not-found').then((page) => page.NotFound),
  },
];
