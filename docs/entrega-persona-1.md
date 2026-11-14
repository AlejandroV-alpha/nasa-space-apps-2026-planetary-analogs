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
