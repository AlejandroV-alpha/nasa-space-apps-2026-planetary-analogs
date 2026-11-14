# Entrega de ciencia e integración para Persona 1

## Estado

El archivo que consume Angular, `frontend/public/data/analogs.v1.json`, contiene **datos reales**: cuatro sectores terrestres y dos referencias planetarias. Ya no es un fixture. Está en estado **draft**, porque el cálculo no valida la idoneidad de los análogos ni sustituye revisión científica independiente.

Base de esta entrega: rama de integración de Personas 2 y 3, commit `eab225e`. Los cambios adicionales se encuentran en `feat/science-contract-export`. El commit MapLibre de `dev` no está incorporado aquí; Persona 1 debe conservarlo o integrarlo si parte de `dev`.

## Empezar

Integrar la rama `feat/science-contract-export` en la rama de trabajo de Persona 1. Si también se integra `dev`, resolver las dependencias de MapLibre conservando las herramientas de validación de esta entrega y actualizar el lockfile con npm.

Desde `frontend/`:

```bash
npm ci
npm run validate:data
npm run test:data
npm test -- --watch=false
npm run build:dev
npm start
```

`provideHttpClient()` ya está registrado. El servicio `AnalogDataService` está en `src/app/core/data/analog-data.service.ts`. La interfaz inicial de Angular sigue siendo la base: corresponde a Persona 1 construir las pantallas.

## Endpoints y enlaces para abrir los datos

El servicio obtiene un **archivo JSON estático servido por Angular**, mediante una petición GET. No hace falta iniciar FastAPI ni procesar rásteres cuando se abre la web.

| Recurso | Ruta HTTP | Abrir en el navegador local |
| --- | --- | --- |
| Dataset que consume la interfaz | `GET /data/analogs.v1.json` | [Ver el JSON del contrato](http://localhost:4200/data/analogs.v1.json) |
| Procedencia y sensibilidad a 2 km | `GET /data/analogs.v1.provenance.json` | [Ver procedencia y sensibilidad](http://localhost:4200/data/analogs.v1.provenance.json) |

Los enlaces locales funcionan después de ejecutar `npm start` desde `frontend/`. `localhost` corresponde a la computadora de quien abre el enlace. Si Angular elige otro puerto, usar el puerto que indique la terminal.

Para consultar la entrega en el navegador de GitHub, con una sesión que tenga acceso al repositorio:

- [Ver el dataset JSON en GitHub — entrega 7cde1be](https://github.com/AlejandroV-alpha/nasa-space-apps-2026-planetary-analogs/blob/7cde1beb7a968423ecf209557443769c71c62a49/frontend/public/data/analogs.v1.json).
- [Ver procedencia y sensibilidad en GitHub — entrega 7cde1be](https://github.com/AlejandroV-alpha/nasa-space-apps-2026-planetary-analogs/blob/7cde1beb7a968423ecf209557443769c71c62a49/frontend/public/data/analogs.v1.provenance.json).

Estos enlaces están fijados al commit de la entrega. La consulta anónima al repositorio y a su contenido raw devolvió HTTP 404 durante esta comprobación; no se ofrece un enlace raw como endpoint público verificado. Si GitHub muestra 404, iniciar sesión con una cuenta con acceso o usar el endpoint local del clon.

La aplicación debe usar su archivo local mediante `AnalogDataService`, para mantener juntos código y versión de datos. Al publicar la web en un subdirectorio, la ruta será `<base-href>/data/analogs.v1.json`: conservar la ruta relativa `data/analogs.v1.json` del servicio. No se ha verificado una URL de aplicación desplegada en esta entrega.

### Qué devuelve el contrato

```text
AnalogDataset
├── schemaVersion        "1.1.0"
├── datasetId            identificador de esta colección
├── generatedAt          fecha de exportación, no de observación satelital
├── status               "draft"
├── notes                alcance, revisión y limitaciones generales
├── sources[]            productos, versiones, URLs, unidades de referencia y atribución
├── methods[]            procedimiento y escala del cálculo
├── referenceRegions[]   2 sectores: polo sur lunar y Jezero
│   └── metrics[]        indicadores de la referencia planetaria
└── sites[]              4 candidatos terrestres
    ├── id, name, country, kind
    ├── geometry         Point terrestre [longitud, latitud]
    ├── studyArea        Polygon terrestre del área calculada
    ├── summary, evidenceStatus, sourceIds
    ├── metrics[]        pendiente mediana, pendiente P90 y relieve P95–P5
    └── assessments[]    destino, referencia, uso, interpretación y limitaciones
```

Una métrica real, la pendiente mediana de Coipasa:

```json
{
  "key": "slope-median",
  "value": 0.0,
  "unit": "deg",
  "sourceIds": ["nasadem"],
  "methodId": "regional-dem-average-central-difference-v1",
  "analysisScaleM": 1000,
  "validCoverageFraction": 1.0,
  "status": "computed"
}
```

`sourceIds` se resuelve contra `sources[]`; `methodId`, contra `methods[]`; y `referenceRegionId`, contra `referenceRegions[]`. Los filtros y comparaciones se realizan en memoria tras cargar el catálogo completo: no existen endpoints separados `/sites`, `/moon` o `/compare` en esta implementación.

Si una métrica falta, `value` es `null`, el estado es `missing` o `not_applicable` y `missingReason` explica el motivo. Una métrica `computed` no lleva `missingReason`. `analysis_computed` describe el cálculo de la entidad; `draft` conserva la revisión pendiente del conjunto.

## Consumir los datos

```typescript
readonly data = inject(AnalogDataService);

// En la plantilla: data.isLoading(), data.error(), data.dataset().
// Listas para el selector:
this.data.sitesFor('moon');
this.data.sitesFor('mars');
this.data.regionsFor('moon');

// Fichas y fuentes:
this.data.siteById('siloli-sector');
this.data.sourcesFor(site.sourceIds);
this.data.methodById(site.metrics[0].methodId);

// Comparar dos candidatos frente a la referencia que realmente tienen:
this.data.compare('jezero-sector', ['siloli-sector', 'coipasa-sector']);
this.data.compare('lunar-south-sector', ['amboy-sector', 'payun-sector']);
```

El servicio devuelve `comparable: false` si faltan valores o no coinciden referencia, unidad, método, escala o estado. Acepta entre uno y tres sitios; la pantalla de comparación puede requerir dos como mínimo para contrastar candidatos. No interpretar `null` como cero. La pendiente mediana cero de Coipasa es un resultado real de esta malla.

## Pantallas a desarrollar

1. **Explorador:** selector Luna/Marte, mapa terrestre con `sites[].geometry` y polígonos `studyArea`, filtros y lista.
2. **Ficha:** nombre, país, resumen, métricas, método, uso propuesto, interpretación, limitaciones y fuentes.
3. **Comparador:** seleccionar dos o tres sitios de una misma región de referencia; alinear con las métricas planetarias mediante el servicio.
4. **Metodología:** explicar escala, indicadores, procedencia y límites.

Países: BO = Bolivia, AR = Argentina, US = Estados Unidos. `referenceRegions` utiliza coordenadas planetarias: **no dibujar esos polígonos sobre el mapa terrestre**.

## Textos científicos que deben permanecer visibles

- «Análisis exploratorio del relieve regional. Revisión científica pendiente.»
- «Ventana de estudio de 20 × 20 km; malla principal de 1 km.»
- «La cobertura expresa celdas finitas, incluidas interpolaciones; no es confianza ni cobertura de observaciones directas.»
- «Las semejanzas topográficas no demuestran equivalencia geológica ni idoneidad para un ensayo.»

Usar `assessments[].interpretation` y `limitations` para el detalle. `isFixture()` será falso, pero eso **no significa validación científica**: el dataset es `draft` y las evaluaciones incluyen el aviso explícito. No mostrar porcentajes de similitud, ranking o aprobación NASA.

## Fuentes y escalas

Los resultados principales son a 1000 m; no reutilizar el nombre de método Horn del antiguo fixture. El método real es `regional-dem-average-central-difference-v1`.

El contrato **1.1.0** acepta los marcos nativos del modelo lunar ME/DE421 y marciano IAU2000. Son identificadores internos documentados, no códigos oficiales de autoridad. No se realizó una transformación a IAU2015. `sources[].nativeCrs`, `verticalReference` y `nativeResolutionDescription` explican los productos.

La sensibilidad estructurada a 2000 m, polígonos con CRS y procedencia se conservan en `frontend/public/data/analogs.v1.provenance.json`; el resumen a 2 km también figura en las interpretaciones. El catálogo científico completo sigue en `data/processed/catalog.json`.

## Actualizar datos sin repetir descargas

Desde la raíz:

```bash
python processing/export_frontend.py
python processing/export_frontend.py --check
npm --prefix frontend run validate:data
```

El exportador solo usa la biblioteca estándar de Python y el catálogo versionado. No requiere rásteres, servicios locales, credenciales ni paquetes GIS. Los números y fuentes se transfieren sin recalcular ni alterar valores. Para recalcular indicadores desde originales, seguir `processing/README.md` y luego volver a exportar.

Los fixtures originales se conservan únicamente en `frontend/scripts/fixtures/analogs.fixture.json`, para las pruebas del validador. La aplicación no los consume.

## Guía práctica para implementar la interfaz

### 1. Crear la vista y conectar el estado

Ejemplo de componente standalone en `frontend/src/app/features/explorer/explorer.ts`. Solo utiliza controles HTML y el servicio existente; Persona 1 puede sustituirlos por los componentes visuales elegidos.

```typescript
import { Component, computed, inject, signal } from '@angular/core';
import { AnalogDataService } from '../../core/data/analog-data.service';
import type { TargetBody } from '../../core/data/analog-dataset.model';

@Component({
  selector: 'app-explorer',
  standalone: true,
  template: `
    <h1>Explorador de análogos</h1>
    @if (data.isLoading()) {
      <p role="status">Cargando catálogo…</p>
    } @else if (data.error()) {
      <p role="alert">No se pudieron cargar los datos.</p>
      <button type="button" (click)="data.reload()">Reintentar</button>
    } @else {
      <p>Análisis exploratorio del relieve regional. Revisión científica pendiente.</p>
      <div role="group" aria-label="Destino de referencia">
        <button type="button" [attr.aria-pressed]="body() === 'moon'"
          (click)="chooseBody('moon')">Luna</button>
        <button type="button" [attr.aria-pressed]="body() === 'mars'"
          (click)="chooseBody('mars')">Marte</button>
      </div>
      @for (region of regions(); track region.id) {
        <button type="button" [attr.aria-pressed]="regionId() === region.id"
          (click)="chooseRegion(region.id)">{{ region.name }}</button>
      }
      @for (site of sites(); track site.id) {
        <article>
          <button type="button" (click)="selectedId.set(site.id)">
            {{ site.name }} — {{ site.country }}
          </button>
          <label>
            <input type="checkbox" [checked]="comparisonIds().includes(site.id)"
              [disabled]="comparisonIds().length >= 3 && !comparisonIds().includes(site.id)"
              (change)="toggleComparison(site.id)">
            Comparar
          </label>
        </article>
      } @empty {
        <p>No hay candidatos para esta referencia.</p>
      }
      @if (selected(); as site) {
        <h2>{{ site.name }}</h2>
        <p>{{ site.summary }}</p>
        @for (metric of site.metrics; track metric.key) {
          <p>{{ metric.key }}:
            @if (metric.status === 'missing' || metric.status === 'not_applicable') {
              No disponible — {{ metric.missingReason }}
            } @else {
              {{ metric.value }} {{ metric.unit }}
            }
          </p>
        }
      }
    }
  `,
})
export class Explorer {
  readonly data = inject(AnalogDataService);
  readonly body = signal<TargetBody>('mars');
  readonly regionId = signal('jezero-sector');
  readonly selectedId = signal<string | null>(null);
  readonly comparisonIds = signal<string[]>([]);
  readonly regions = computed(() => this.data.regionsFor(this.body()));
  readonly sites = computed(() => this.data.sitesForRegion(this.regionId()));
  readonly selected = computed(() => this.data.siteById(this.selectedId() ?? ''));
  readonly rows = computed(() => this.data.compare(this.regionId(), this.comparisonIds()));

  chooseBody(body: TargetBody): void {
    this.body.set(body);
    this.chooseRegion(this.data.regionsFor(body)[0]?.id ?? '');
  }

  chooseRegion(id: string): void {
    this.regionId.set(id);
    this.selectedId.set(null);
    this.comparisonIds.set([]);
  }

  toggleComparison(id: string): void {
    if (!this.sites().some(site => site.id === id)) return;
    this.comparisonIds.update(ids => ids.includes(id)
      ? ids.filter(value => value !== id)
      : ids.length < 3 ? [...ids, id] : ids);
  }
}
```

Registrar la vista en `app.routes.ts`, conservando las demás rutas que tenga el equipo:

```typescript
{
  path: 'explorar',
  title: 'Explorar',
  loadComponent: () => import('./features/explorer/explorer').then(m => m.Explorer),
}
```

Este ejemplo conecta carga, errores, selección y datos; el mapa, diseño final, tabla de comparación y ficha completa se implementan con los pasos siguientes.

### 2. Conectar MapLibre con la misma selección

- Construir una colección GeoJSON terrestre desde `sites()`: cada punto usa `site.geometry`, con propiedades `id` y `name`.
- Usar `site.studyArea` para una capa de polígonos si se quiere mostrar el cuadrado estudiado.
- Al pulsar un marcador o punto, actualizar `selectedId` con el ID del sitio. La lista y la ficha deben utilizar esa misma selección.
- Al cambiar destino o referencia, actualizar las capas con los sitios visibles y reiniciar selección/comparación.
- Conservar la atribución del mapa base y permitir abrir fichas desde la lista si el mapa falla.
- Destruir la instancia de MapLibre cuando se destruya el componente.

### 3. Completar la ficha

Resolver la evaluación activa con `site.assessments.find(a => a.referenceRegionId === regionId())`. Mostrar su `testUseCase`, `interpretation` y `limitations`, además del `summary` del sitio.

Para cada indicador, mostrar etiqueta, valor, unidad y escala; obtener el método con `data.methodById(metric.methodId)` y sus fuentes con `data.sourcesFor(metric.sourceIds)`. Las fuentes contextuales del sitio se consultan por `site.sourceIds`; no atribuirlas automáticamente a una métrica.

Etiquetas sugeridas:

| Clave | Etiqueta | Unidad visible |
| --- | --- | --- |
| `slope-median` | Pendiente mediana | ° |
| `slope-p90` | Pendiente P90 | ° |
| `relief-p95-p5` | Relieve P95–P5 | m |

### 4. Renderizar el comparador

`rows()` devuelve una fila por indicador:

```text
{ key, unit, reference, sites, comparable }
```

- La primera columna numérica muestra `row.reference`, la región planetaria.
- Las columnas siguientes muestran `row.sites` en el mismo orden de `comparisonIds()`.
- Acceder al número mediante `metric?.value`. Comprobar `null` explícitamente para conservar ceros reales.
- Con menos de dos candidatos, pedir seleccionar otro para la pantalla de comparación entre candidatos.
- Si `row.comparable` es falso, mostrar el motivo o «No comparable»; no generar diferencias ni gráficos como si fueran compatibles.
- Cuando es verdadero, se puede presentar la diferencia candidato menos referencia, con la unidad original y sin convertirla en porcentaje de similitud.

### 5. Verificar el flujo completo

Comprobar Marte → Jezero → Siloli y Coipasa; después Luna → sector polar → Amboy y Payún Matrú. El cambio de destino debe limpiar la selección anterior. Revisar la ficha de Coipasa para confirmar que el cero se muestra como cero.

Probar también error de carga y reintento, lista vacía por filtros, navegación por teclado, vista móvil y enlaces de fuentes. La pantalla de metodología debe explicar el estado `draft`, la ventana, las escalas y las diferencias entre cálculo y validación científica.

## Backend FastAPI disponible

Además del archivo estático, existe una API real con el mismo catálogo:

- [Abrir catálogo del backend](http://localhost:8000/api/v1/catalog).
- [Swagger y pruebas interactivas](http://localhost:8000/docs).
- [Documento de endpoints, objetivos y respuestas](backend-endpoints.md).
- [Instalación y procesamiento desde backend](../backend/README.md).

Angular puede consumir `http://localhost:8000/api/v1/catalog` cambiando `ANALOG_DATASET_URL`. La opción estática sigue siendo el valor actual del servicio. CORS admite los orígenes locales del puerto 4200. Al desplegar, configurar URL y origen correspondientes al entorno.

El procesamiento vive en `backend/processing/`, con un comando conjunto `python -m backend.process`. Las rutas anteriores en `processing/` se mantienen compatibles. La API sirve resultados precomputados; no procesa rásteres al abrir una ficha.
