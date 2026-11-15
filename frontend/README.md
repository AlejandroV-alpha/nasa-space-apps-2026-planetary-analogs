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

Open `http://localhost:4200/`. Angular proxies `/api/**` to FastAPI. The app
uses the live catalog, comparison and provenance endpoints. Failed requests
show a retry action.

## Geographic discovery

`/explorar` loads the published windows once. Draw a rectangle on the map or
enter west, south, east and north. **Buscar candidatos** includes window
centers on the rectangle's boundaries and keeps the published order per
reference. Search areas crossing the antimeridian must be split into two
searches. The current export publishes ten windows per reference, and an
empty selection only means there are no published windows in the area.

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

Playwright starts Angular and uses controlled responses based on the
versioned export by default. Set `PLAYWRIGHT_LIVE_API=1` with FastAPI running
to exercise the real API. The retry scenario still simulates HTTP 503 and
the marker test intercepts basemap tiles to avoid network dependence.

```bash
npx playwright install chromium
npx playwright test
```

With an installed Chrome, `PLAYWRIGHT_CHROMIUM_PATH` can point to its executable.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
