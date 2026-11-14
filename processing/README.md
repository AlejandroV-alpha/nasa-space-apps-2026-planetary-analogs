# Ciencia y datos GIS — Persona 2

Este directorio prepara un análisis exploratorio de relieve regional. No selecciona sitios aptos para instalar bases, no calcula probabilidades de similitud y no certifica movilidad.

## Ejecutar

Desde la raíz del repositorio, con Python 3.14 (entorno utilizado para esta entrega):

```bash
python -m venv processing/.venv
processing/.venv/bin/pip install -r processing/requirements.txt
processing/.venv/bin/python processing/pipeline.py
processing/.venv/bin/python processing/validate_catalog.py
processing/.venv/bin/python processing/render_quality.py
processing/.venv/bin/python processing/write_report.py
processing/.venv/bin/python -m pytest processing/tests -q
```

La primera ejecución descarga datos abiertos desde Microsoft Planetary Computer y NASA PDS. No necesita credenciales del usuario. Los enlaces temporales de entrega de Azure se solicitan en memoria y no se guardan. El volumen depende de las teselas necesarias para las ventanas; se conservan en `data/raw/`, excluido de Git. El servidor debe admitir solicitudes HTTP Range para los recortes PDS. Si no entrega exactamente los bytes solicitados, el proceso falla.

Repetir el cálculo con los archivos ya descargados, sin acceso a internet:

```bash
processing/.venv/bin/python processing/pipeline.py --offline
```

El modo offline requiere tanto las teselas NASADEM como las franjas PDS y sus registros de procedencia en `data/raw/`. El repositorio conserva resultados pequeños y metadatos; no contiene las descargas originales. Los GeoTIFF procesados permiten revisar los resultados sin descargar originales, aunque recalcular desde el inicio sí requiere las entradas.

## Entradas y salidas

| Ruta | Contenido |
| --- | --- |
| `data/study-config.json` | Pregunta, áreas elegidas antes del cálculo, hipótesis, fuentes y limitaciones |
| `data/metadata/` | Etiquetas originales LOLA/MOLA y metadatos STAC de NASADEM |
| `data/raw/` | Teselas COG, franjas binarias y registros de URL estable, bytes, fecha y SHA256; ignorado por Git |
| `data/processed/catalog.json` | Cuatro candidatos, dos referencias planetarias, indicadores, calidad y diferencias descriptivas |
| `data/processed/candidates.geojson` | Puntos terrestres WGS84 para el mapa |
| `data/processed/study-areas-earth.geojson` | Polígonos terrestres de las ventanas analizadas |
| `data/processed/rasters/` | Mallas de alturas en metros, a 1 y 2 km, con borde de dos celdas; CRS propio en cada GeoTIFF |
| `data/processed/results-table.md` | Resumen numérico a 1 km |
| `data/processed/terrain-quality.png` | Revisión visual de altura relativa a la mediana y pendiente de cada ventana |
| `docs/metodologia-cientifica.md` | Definiciones, decisiones y límites científicos |
| `docs/fichas-cientificas.md` | Lectura de los candidatos y resultados |

Los polígonos lunares y marcianos permanecen en `catalog.json`, acompañados de cuerpo y CRS. No se mezclan con GeoJSON terrestre.

## Cómo funciona

1. Lee los centros y cuadrados de 20 km definidos en `study-config.json`. No ajusta las áreas para mejorar los resultados.
2. Determina las teselas NASADEM que cubren cada ventana con margen, verifica su SHA256 y combina bordes duplicados conservando la primera tesela.
3. Descarga únicamente las filas de LOLA/MOLA necesarias. Registra el intervalo exacto de bytes y conserva etiquetas. LOLA se convierte de km a m. MOLA usa georreferenciación precisa del XML PDS4, porque la escala de la etiqueta PDS3 está redondeada.
4. Reproyecta cada ventana a su proyección azimutal equidistante local, con WGS84 en Tierra y radios propios de Luna/Marte. Agrega alturas mediante `rasterio.warp.reproject` y `Resampling.average`.
5. Calcula diferencias centrales de altura para pendiente y percentiles para relieve sobre la ventana interior, utilizando celdas de margen para no inventar vecinos en los bordes.
6. Exporta valores solo si al menos el 95 % de las celdas requeridas por la estadística son finitas. Ese umbral es un control del equipo, no una medida de certeza. Celdas interpoladas de los productos cuentan como finitas, no como observaciones directas.
7. Repite en una malla de 2 km como análisis de sensibilidad. Exporta diferencias candidato–referencia a 1 km; no genera ranking.

## Contrato científico provisional

Versión `0.1-science`, pendiente de acuerdo con Persona 3. Los datos calculados se etiquetan `computed_unreviewed`: cálculo efectuado, revisión independiente y validación de analogía pendientes.

Cada métrica incluye `key`, `label`, `value`, `unit`, `sourceIds`, `methodId`, `analysisScaleM`, `validCoverageFraction`, `status` y `missingReason`. Ausencias se expresan como `null`, nunca como cero. Las fuentes contextuales están separadas en `contextSourceIds`; no se atribuyen automáticamente a las métricas del ráster.

`sourceDetails` documenta formato, conversión y georreferenciación. `provenance` conserva URLs estables y hashes; en NASADEM incluye manifiestos de las teselas utilizadas. `studyArea` define la geometría exacta, su cuerpo y la proyección local. `sensitivity` contiene los resultados a 2 km.

## Revisión y ampliaciones

Las pruebas usan superficies con pendientes analíticas, planos de altura cero, huecos, compatibilidad de escala y distancias sobre distintos cuerpos. La validación de catálogo comprueba consistencia estructural y numérica; no sustituye revisión geológica independiente.

Abrir `data/processed/rasters/*.tif` en QGIS para inspección externa: cada archivo contiene su CRS. La revisión visual de esta entrega usa una figura reproducible de Matplotlib; no se afirma que haya sido revisada en QGIS.

Para cambiar áreas o productos, editar la configuración y retirar únicamente el manifiesto de entradas de la región modificada en `data/raw/`, si el proceso detecta cambios. Mantener el dataset anterior versionado para comparar. No editar manualmente los números del catálogo.
