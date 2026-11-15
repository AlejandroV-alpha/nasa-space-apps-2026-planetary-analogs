import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <section class="mx-auto max-w-3xl px-5 py-20">
      <h1 class="text-3xl font-semibold">Página no encontrada</h1>
      <a routerLink="/explorar" class="mt-5 inline-block text-primary underline"
        >Volver al explorador</a
      >
    </section>
  `,
})
export class NotFound {}
