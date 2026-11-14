# Contrato de datos v1.0.0

Este contrato define qué datos entrega ciencia (Persona 2) y qué datos consume el frontend (Persona 1). Persona 3 lo mantiene, valida los datos y los publica.

| Archivo | Para qué sirve |
| --- | --- |
| [`planetary-analogs.schema.json`](planetary-analogs.schema.json) | El contrato, escrito en JSON Schema 2020-12 |
| [`../frontend/public/data/analogs.v1.json`](../frontend/public/data/analogs.v1.json) | El dataset publicado. Ahora mismo es un **FIXTURE** |
| [`../frontend/scripts/validate-data.mjs`](../frontend/scripts/validate-data.mjs) | El validador: revisa el esquema y además las reglas de abajo |
| [`../frontend/src/app/core/data/`](../frontend/src/app/core/data/) | Los tipos TypeScript y `AnalogDataService` |

## Estructura

```text
dataset
├── schemaVersion, datasetId, generatedAt, status (fixture | draft | release)
├── sources[]            fuente: producto, versión, URL/DOI, licencia, atribución, CRS
├── methods[]            método de cálculo: remuestreo, ventana
├── referenceRegions[]   región en la Luna o Marte, en coordenadas IAU del cuerpo (no WGS84)
│   └── metrics[]
└── sites[]              sitio terrestre: punto y studyArea en WGS84 (EPSG:4326)
    ├── assessments[]    evaluación contra una región de referencia: uso de ensayo, interpretación, límites
    └── metrics[]
```

### Métricas

| `key` | Unidad | Qué mide |
| --- | --- | --- |
| `slope-median` | `deg` | Mediana de la pendiente |
| `slope-p90` | `deg` | Percentil 90 de la pendiente |
| `relief-p95-p5` | `m` | Relieve P95–P5 |
| `roughness` | `m` | Rugosidad (exige documentar `methods[].windowM`) |
| `lst-day-night-diff` | `K` | Diferencia de temperatura de superficie entre el día y la noche (MODIS, P1) |

Cada métrica tiene un `status`, y este decide qué campos son obligatorios:

- `computed` o `fixture`: hacen falta `value` numérico, `methodId`, `analysisScaleM`, `validCoverageFraction` y al menos un `sourceIds`.
- `missing` o `not_applicable`: `value` **debe ser `null`** y hay que indicar el motivo en `missingReason`. Una ausencia **nunca** se representa con `0`.

### Estado de la evidencia (`evidenceStatus`)

- `fixture`: datos inventados para desarrollar la interfaz.
- `candidate_investigated`: una hipótesis que ya tiene fuentes, pero todavía sin cálculo.
- `analysis_computed`: métricas calculadas de forma reproducible.

## Reglas que comprueba el validador

Además del propio esquema, el validador rechaza un dataset en estos casos:

- Hay IDs duplicados, o hay referencias (`sourceIds`, `methodId`, `referenceRegionId`) que no apuntan a nada existente.
- Una coordenada está fuera de rango, el punto de un sitio queda fuera de su `studyArea`, o un polígono no está cerrado.
- Una unidad no corresponde a su métrica, o una pendiente supera los 90°.
- El CRS de una región no corresponde a su cuerpo. También cuando una métrica de la Luna usa una fuente de Marte, o un sitio terrestre usa una fuente planetaria.
- Una evaluación declara un `targetBody` distinto al de su región.
- Aparece un valor `fixture` dentro de una entidad marcada como `analysis_computed`.
- En modo `--release`, el dataset contiene cualquier dato fixture.

El validador también **avisa**, sin rechazar el dataset, en estos casos:

- Se comparan métricas calculadas a escalas de análisis distintas.
- Una métrica tiene poca cobertura válida.
- Un dataset `draft` todavía contiene fixtures.

## Comandos (desde `frontend/`)

```bash
npm run validate:data                        # valida public/data/analogs.v1.json
npm run validate:data -- otro.json           # valida otro archivo
npm run validate:data -- --release           # exige que no haya fixtures (antes de la entrega)
npm run test:data                            # prueba el validador contra 25 tipos de datos rotos
```

## Cómo entrega Persona 2 los datos reales

1. El pipeline genera un JSON que cumple este esquema. Los rásteres no se suben al repositorio; solo se sube el JSON pequeño.
2. Hay que reemplazar `frontend/public/data/analogs.v1.json`, poner `status: "draft"` y marcar cada entidad real con `analysis_computed` o `candidate_investigated`.
3. `npm run validate:data` tiene que pasar. El CI lo ejecuta en cada pull request.
4. Antes de la entrega final, poner `status: "release"` y comprobar que `npm run validate:data -- --release` pasa.

## Versionado

`schemaVersion` sigue semver.

- **Cambio incompatible** (renombrar o eliminar un campo, o cambiar su significado): sube el número mayor, se crea `analogs.v2.json` y se actualiza `SUPPORTED_SCHEMA_MAJOR` en `analog-dataset.model.ts`.
- **Cambio compatible** (añadir un campo opcional o un valor nuevo en un `enum`): sube el número menor.

Cualquier cambio del contrato se acuerda antes con Persona 1 y Persona 2.
