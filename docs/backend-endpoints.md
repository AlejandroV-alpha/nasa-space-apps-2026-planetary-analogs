# Endpoints del backend FastAPI y objetivo de cada uno

Base local: **http://localhost:8000**. Los enlaces de esta página requieren que la API esté encendida. Instrucciones de instalación: [backend/README.md](../backend/README.md).

## Acceso desde el navegador

- [Swagger: probar los endpoints y ver sus parámetros](http://localhost:8000/docs).
- [ReDoc: documentación de la API](http://localhost:8000/redoc).
- [Contrato OpenAPI en JSON](http://localhost:8000/openapi.json).
- [Abrir el catálogo científico](http://localhost:8000/api/v1/catalog).

## Rutas, objetivos y respuestas

| Método | Endpoint | Objetivo | Qué devuelve |
| --- | --- | --- | --- |
| GET | [/health](http://localhost:8000/health) | Comprobar que el servidor puede cargar datos válidos | Estado, versión del contrato, estado del dataset y cantidades |
| GET | [/api/v1/catalog](http://localhost:8000/api/v1/catalog) | Alimentar la aplicación con el contrato completo | `schemaVersion`, `datasetId`, `generatedAt`, `status`, `notes`, `sources`, `methods`, `referenceRegions`, `sites` |
| GET | [/api/v1/sites](http://localhost:8000/api/v1/sites) | Buscar candidatos terrestres con filtros | `{ "total": 4, "items": [...] }` sin filtros |
| GET | [/api/v1/sites/siloli-sector](http://localhost:8000/api/v1/sites/siloli-sector) | Abrir la ficha de un sitio mediante `/sites/{site_id}` | Sitio, geometría, área, métricas, evaluaciones, límites y referencias de fuentes |
| GET | [/api/v1/reference-regions](http://localhost:8000/api/v1/reference-regions) | Elegir región lunar o marciana | `{ "total": 2, "items": [...] }` sin filtros |
| GET | [/api/v1/reference-regions/jezero-sector](http://localhost:8000/api/v1/reference-regions/jezero-sector) | Consultar `/reference-regions/{region_id}` | Geometría planetaria, marco nativo, descripción y métricas |
| GET | [/api/v1/sources](http://localhost:8000/api/v1/sources) | Consultar procedencia científica y bibliografía | `{ "total": ..., "items": [...] }` con producto, versión, URL, atribución, referencias y fechas |
| GET | [/api/v1/methods](http://localhost:8000/api/v1/methods) | Explicar los cálculos mostrados | `{ "total": ..., "items": [...] }` con diferencias centrales, escalas y remuestreo |
| GET | [/api/v1/provenance](http://localhost:8000/api/v1/provenance) | Auditar origen de resultados y sensibilidad | Hash del catálogo, entradas, polígonos con CRS y métricas a 2 km |
| GET | [/api/v1/geojson/sites](http://localhost:8000/api/v1/geojson/sites) | Proporcionar puntos terrestres directamente a MapLibre | GeoJSON `FeatureCollection`; propiedades `id`, `name`, `country`, `evidenceStatus` |
| POST | `/api/v1/compare` | Contrastar 2–3 candidatos frente a una región | Filas de métricas, compatibilidad y diferencias firmadas candidato menos referencia |

Las listas son envoltorios `{total, items}`; las fichas individuales y `/catalog` devuelven directamente el objeto. Las fuentes y métodos se resuelven mediante `sourceIds` y `methodId`. Los datos planetarios nunca se interpretan como WGS84 terrestre.

## Filtros

`GET /api/v1/sites` admite parámetros opcionales combinables:

| Parámetro | Valores | Objetivo |
| --- | --- | --- |
| `target_body` | `moon` o `mars` | Filtrar por destino de la evaluación |
| `country` | Código ISO de dos letras mayúsculas, por ejemplo `BO` | Filtrar por país |
| `reference_region_id` | ID existente, por ejemplo `jezero-sector` | Exigir una evaluación frente a esa región |

Ejemplo para el explorador:

[Consultar candidatos de Bolivia para Marte](http://localhost:8000/api/v1/sites?target_body=mars&country=BO)

`GET /api/v1/reference-regions` y `GET /api/v1/geojson/sites` admiten `target_body`.

## Comparación

Probar desde [Swagger](http://localhost:8000/docs), abriendo **POST /api/v1/compare → Try it out**, o desde terminal:

```bash
curl -X POST http://localhost:8000/api/v1/compare \
  -H 'Content-Type: application/json' \
  -d '{"reference_region_id":"jezero-sector","site_ids":["siloli-sector","coipasa-sector"]}'
```

Entrada:

```json
{
  "reference_region_id": "jezero-sector",
  "site_ids": ["siloli-sector", "coipasa-sector"]
}
```

La respuesta contiene `reference_region_id`, `site_ids`, `rows`, `dataset_status` y `notice`. Cada fila tiene:

- `key`: indicador.
- `reference`: métrica de la región planetaria.
- `sites`: métricas de los sitios, en el orden solicitado.
- `comparable`: si todas están calculadas y coinciden unidad, método y escala.
- `signed_differences`: diferencias candidato menos referencia, o `null` si no son comparables.
- `reason`: motivo cuando no se pueden comparar.

Se exigen 2–3 sitios distintos, evaluados contra la referencia indicada. El cero es válido; no se convierte una ausencia en cero. Una diferencia pequeña no equivale a probabilidad de similitud ni aptitud operacional. El estado científico sigue siendo `draft`.

## Errores y estado del catálogo

| Código HTTP | Significado |
| --- | --- |
| 200 | Consulta correcta; filtros sin coincidencias devuelven lista vacía |
| 404 | Sitio o región desconocidos |
| 422 | Parámetros/cuerpo inválidos, sitios repetidos o evaluados contra otra referencia |
| 503 | Catálogo o procedencia ausentes o inválidos |

El backend lee los resultados versionados, no descarga imágenes al abrir una ficha. Carga un snapshot en memoria en la primera consulta y lo mantiene hasta reiniciar el proceso. Tras recalcular, reiniciar la API. El snapshot y la procedencia corresponden a la entrega preparada; no hay actualización automática desde proveedores.

## Dónde se procesa

Todo el código de procesamiento está en `backend/processing/`. El comando desde la raíz:

```bash
backend/.venv/bin/python -m backend.process --offline
```

Ejecuta recorte, cálculos, validación, figura, informe y exportación. Quitar `--offline` permite descargar entradas que falten. Los originales pesados permanecen en `data/raw/`, ignorado por Git. Con `--export-only` se entrega el catálogo ya calculado sin recalcular rásteres.

El procesamiento se ejecuta por terminal, no mediante un endpoint HTTP. Esto mantiene las peticiones del mapa y las fichas independientes de descargas y cálculos largos.

## Conexión con Persona 1

La API completa se consume con `GET http://localhost:8000/api/v1/catalog`, cuya estructura es la misma de `frontend/public/data/analogs.v1.json`. El servicio Angular puede cambiar su URL a ese endpoint y conservar sus tipos.

Para consumir filtros del servidor, tratar `/sites` como `{ total, items }`, no como una lista directa. El comparador HTTP utiliza claves `reference_region_id` y `site_ids`; el helper local Angular sigue recibiendo argumentos TypeScript. Son dos maneras de consultar los mismos datos, no dos formatos intercambiables de llamada.

Angular consume los endpoints de catálogo, comparación y procedencia por HTTP. En desarrollo, el proxy de Angular reenvía las peticiones a FastAPI.

## Referencias técnicas

Estructura y CORS basados en la documentación oficial de [FastAPI: aplicaciones con varios archivos](https://fastapi.tiangolo.com/tutorial/bigger-applications/) y [FastAPI: CORS](https://fastapi.tiangolo.com/tutorial/cors/).
