# Frontend

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.5.

## Development server

Start FastAPI from the repository root.

```powershell
uv run --with-requirements backend/requirements.txt python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

From `frontend/`, install the locked dependencies and start Angular:

```bash
npm ci
npm start
```

Open `http://localhost:4200/`. Angular proxies `/api/**` and `/health` to FastAPI.
Set `PRIMEUI_LICENSE` in the environment before starting Angular to validate the
Community license for the installed version.

## Geographic discovery

`/explorar` searches the inventory of 81 processed windows through FastAPI.
Draw a rectangle or enter west, south, east and north, then choose **Buscar
candidatos**. The ranking includes comparable window centers on the boundary.
The coverage layer shows measured footprints intersecting the area. Searches
crossing the antimeridian are split automatically. **Ambos** keeps each
reference's ranking and links results for the same window by ID.

Use **Abrir ficha de ventana** for a shareable view. The geology, thermal,
mission uses and evidence panels load on demand, with separate recovery
actions. **Cobertura global** loads the entire footprint layer on request.
The Home page links to the published exploratory case study and the
separate, summarized rankings.

Open **Sitios del catálogo** for the original site explorer and comparison.
Site detail loads the NASA POWER export separately. To forward the backend
status check in a same-origin deployment, route `/health` to FastAPI as well
as `/api/v1/**`.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
npm run build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

### PrimeUI Community license

Set `PRIMEUI_LICENSE` in your local environment before running `npm start` to
use your Community license. For a local development build, run `npm run build:dev`.
Development can start without a key and PrimeUI reports its license status.

`npm run build` requires a valid license for the installed PrimeNG package.
In GitHub Actions, create a secret named `PRIMEUI_LICENSE` and pass it to the
build step after `npm ci` has installed the frontend dependencies:

```yaml
- name: Build frontend
  working-directory: frontend
  env:
    PRIMEUI_LICENSE: ${{ secrets.PRIMEUI_LICENSE }}
  run: npm run build
```

The npm scripts generate `src/app/core/config/primeui-license.ts`, which Git
ignores. Angular embeds the value in the compiled JavaScript. Deploy the usual
static build output and treat its license value as visible to browsers.

### Connect a deployed frontend to FastAPI

For same-origin deployment, forward `/api/v1/**` to FastAPI and serve
`index.html` for Angular routes. With a separate HTTPS API, including when
using GitHub Pages, pass the complete API prefix at build time. On PowerShell:

```powershell
$definition = "PLANETARY_API_BASE_URL='https://api.example.org/api/v1'"
npm run build -- --define $definition
```

Add the deployed frontend origin to FastAPI's `CORS_ORIGINS`.
The GitHub Pages workflow reads the repository variable
`PLANETARY_API_BASE_URL`, with the full HTTPS prefix ending in `/api/v1`.
MapLibre worker assets are included in the Angular build. The browser loads
the attributed OpenStreetMap basemap and the candidate list remains
available when the map cannot load.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
npm test -- --watch=false
```

## Running end-to-end tests

Playwright starts Angular if the development server is not already running.
By default, the navigation tests use controlled responses based on the
versioned export. Set `PLAYWRIGHT_LIVE_API=1` with FastAPI running to enable
the live discovery and scientific tests and query the real API. The recovery
tests simulate failures, and the marker test intercepts basemap tiles.

```bash
npx playwright install chromium
npx playwright test
```

With an installed Chrome, `PLAYWRIGHT_CHROMIUM_PATH` can point to its executable.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
