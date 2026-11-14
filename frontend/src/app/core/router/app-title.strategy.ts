import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

const APPLICATION_TITLE = 'Planetary Analogs';

@Injectable()
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const routeTitle = (this.buildTitle(snapshot) ?? '').trim();
    const prefix = `${APPLICATION_TITLE} |`;

    if (!routeTitle || routeTitle === APPLICATION_TITLE || routeTitle === prefix) {
      this.title.setTitle(APPLICATION_TITLE);
      return;
    }

    if (routeTitle.startsWith(`${prefix} `)) {
      this.title.setTitle(routeTitle);
      return;
    }

    this.title.setTitle(`${prefix} ${routeTitle}`);
  }
}
