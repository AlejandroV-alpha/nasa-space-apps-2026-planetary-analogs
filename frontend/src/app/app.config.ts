import { provideHttpClient } from '@angular/common/http';
import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { TitleStrategy, provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import { routes } from './app.routes';
import { PRIMEUI_LICENSE } from './core/config/primeui-license';
import { AppTitleStrategy } from './core/router/app-title.strategy';
import { PLANETARY_THEME_PRESET } from './core/theme/planetary-theme.preset';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    provideRouter(routes),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    providePrimeNG({
      license: PRIMEUI_LICENSE,
      theme: {
        preset: PLANETARY_THEME_PRESET,
        options: {
          darkModeSelector: '.app-dark',
          cssLayer: {
            name: 'primeng',
            order: 'theme, base, primeng, components, utilities',
          },
        },
      },
    }),
  ],
};
