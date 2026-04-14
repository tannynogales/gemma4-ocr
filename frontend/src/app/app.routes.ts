import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'extraer',
  },
  {
    path: 'extraer',
    title: 'Extraer cédula',
    loadComponent: () =>
      import('./features/identity-extraction/pages/identity-extraction-page.component').then(
        (module) => module.IdentityExtractionPageComponent,
      ),
  },
  {
    path: 'historial',
    title: 'Historial',
    loadComponent: () =>
      import('./features/history/pages/history-page.component').then(
        (module) => module.HistoryPageComponent,
      ),
  },
  {
    path: 'historial/:id',
    title: 'Detalle del registro',
    loadComponent: () =>
      import('./features/history/pages/history-detail-page.component').then(
        (module) => module.HistoryDetailPageComponent,
      ),
  },
  {
    path: '**',
    redirectTo: 'extraer',
  },
];
