# Frontend

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.5.

## Development server

To start a local development server, run:

```bash
npm start
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

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

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
npm test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
