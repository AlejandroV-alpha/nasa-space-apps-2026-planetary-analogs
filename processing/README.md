> La implementación del procesamiento se encuentra ahora en `backend/processing/`.
> Los comandos de esta guía siguen funcionando mediante entradas de compatibilidad.
> Para ejecutar el flujo completo y servir datos HTTP, ver [backend/README.md](../backend/README.md).

# Ciencia y datos GIS — Persona 3

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

## Exportación para el frontend (contrato 1.1.0)

Después de recalcular el catálogo:

```bash
python processing/export_frontend.py
python processing/export_frontend.py --check
npm --prefix frontend run validate:data
```

La exportación usa solo la biblioteca estándar. Conserva valores y fuentes, traduce claves/estados al contrato y mantiene `draft`: `analysis_computed` no significa validación científica independiente. Genera además `analogs.v1.provenance.json` para conservar sensibilidad y trazabilidad estructuradas. CI comprueba que ambas salidas estén actualizadas. No editar los números exportados manualmente.

Los marcos planetarios nativos y el método de diferencias centrales se preservan explícitamente. Ver [guía de entrega](../docs/entrega-persona-1.md).

## Entrega de Persona 3

El caso inicial propuesto es **Payún Matrú frente al sector del polo sur lunar**. Las ventanas, coordenadas y productos están en [study-config.json](../data/study-config.json). A 1 km, el candidato tiene pendiente mediana de 7,06° frente a 6,64°, pendiente P90 de 12,24° frente a 12,56° y relieve P95–P5 de 1.174,35 m frente a 1.663,01 m. Es un candidato preliminar para estudiar recorridos en terreno inclinado. Los valores describen relieve regional. La verificación de la ruta, obstáculos, condiciones del suelo y acceso requiere evaluación de campo. Véanse las [fichas científicas](../docs/fichas-cientificas.md).

### Verificar la entrega

Ejecutar desde la raíz, con las dependencias de procesamiento y pruebas instaladas.

```powershell
python processing/validate_catalog.py
python processing/export_frontend.py --check
python -m pytest processing/tests backend/tests -q
```

La procedencia de la exportación calcula el SHA-256 del catálogo con finales de línea LF, incluso si Git lo materializa como CRLF. Los hashes de los archivos ráster y de los metadatos originales se verifican sobre sus bytes.

### Contexto ambiental terrestre

El archivo [terrestrial-environment.v1.json](../data/processed/terrestrial-environment.v1.json) contiene las series diarias de NASA POWER de los cuatro sitios, del 1 de enero al 31 de diciembre de 2025 en hora solar local. Cada sitio contiene el ID compartido con el catálogo, coordenadas solicitadas, coordenadas devueltas, URL de consulta, versión de la API y productos citados por el proveedor. Cada variable incluye unidad, serie, días válidos y media del período. Los faltantes se representan como `null`.

```powershell
python -m backend.processing.export_environment --start 2025-01-01 --end 2025-12-31
```

Para integrar con FastAPI, Persona 2 puede leer el JSON por `sites[].siteId`. El JSON topográfico se entrega en [analogs.v1.json](../frontend/public/data/analogs.v1.json) con su [procedencia](../frontend/public/data/analogs.v1.provenance.json). Mantener el contexto ambiental aparte de las diferencias Tierra–Luna y Tierra–Marte. El período elegido sirve como ejemplo histórico para la ficha del ensayo.

### Prueba de OpenTopography

El proveedor principal del pipeline es Microsoft Planetary Computer. Para verificar el acceso alternativo a NASADEM con OpenTopography, configura una clave personal en la variable de entorno `OPENTOPOGRAPHY_API_KEY` y ejecuta lo siguiente.

```powershell
python -m backend.processing.check_opentopography --site payun-sector
```

La prueba solicita el rectángulo envolvente de la ventana de estudio y guarda el GeoTIFF y su procedencia en `data/raw/opentopography/`. El producto [NASADEM_HGT.001](https://www.earthdata.nasa.gov/data/catalog/lpcloud-nasadem-hgt-001) tiene resolución nominal de 1 segundo de arco. Para cobertura y condiciones de uso, consultar la ficha del producto y la [documentación de OpenTopography](https://opentopography.org/developers).

La descarga real para Payún Matrú se completó. El recorte devuelto está en EPSG:4326, con un paso de 1 segundo de arco y extensión aproximada de 69,353° O a 69,129° O y de 36,512° S a 36,332° S. El JSON local registra el DOI, los límites y el SHA-256 del GeoTIFF. El catálogo científico conserva los resultados del pipeline principal.

### Buscar candidatos automáticamente

El módulo `backend.processing.discover_candidates` genera ventanas terrestres de 20 km de lado a partir de las teselas NASADEM. Calcula pendiente mediana, pendiente P90 y relieve P95–P5 a 1 km y 2 km con las funciones del pipeline. Usa las referencias planetarias disponibles en el catálogo y calcula las diferencias de cada ventana con ellas.

```powershell
# Buscar en todas las teselas NASADEM ya descargadas
uv run --with-requirements backend/processing/requirements.txt python -m backend.processing.discover_candidates

# Buscar y descargar datos de otra área, con límites oeste sur este norte en grados
uv run --with-requirements backend/processing/requirements.txt python -m backend.processing.discover_candidates --bounds -66 -23 -65 -22 --download --limit 3
```

El resultado se guarda en `data/processed/discovered-candidates.v1.json`. Usa `--output` para guardar otra búsqueda en un archivo separado y `--reference` para limitarla a una referencia planetaria. Cada entrada de `results` contiene una colección GeoJSON de ventanas para esa referencia. Las ventanas incluyen geometría, centro, tesela, comparaciones y cobertura a ambas escalas. Las teselas sin datos se reportan en `search.skippedTiles`.

La búsqueda ordena por la media de las tres diferencias relativas absolutas a 1 km, con igual peso por indicador. Cada diferencia se divide por el mayor valor absoluto del par y el caso cero contra cero aporta cero. Las ventanas con mediciones incompletas quedan fuera del orden. El orden describe cercanía topográfica en el área muestreada. La búsqueda evalúa ventanas contenidas en una tesela con margen para calcular pendientes, por lo que puede omitir zonas entre teselas. Revisar las mediciones a 2 km, el contexto del terreno y las condiciones de campo antes de interpretar la utilidad de una ventana.

Para generar la exportación completa que consume la consulta espacial de FastAPI, ejecuta el mismo módulo con `--all`. El comando guarda `data/processed/discovered-candidates.full.v1.json` y conserva todas las ventanas medidas por referencia. Incluye las huellas medidas aunque falten métricas para el ranking. La exportación resumida se sigue generando sin esa opción.


### Rastrear productos geológicos y térmicos de una ventana

```powershell
uv run --with-requirements backend/processing/requirements.txt python -m backend.processing.check_candidate_products 'NASADEM_HGT_s23w066:0:1'
```

El script guarda las coincidencias de NASA CMR para EMIT L2BMIN y MODIS MOD11A2 y un resumen reproducible de temperatura superficial regional NASA POWER TS para 2025. El producto TS es un reanálisis regional y la consulta usa el centro de la ventana. El resumen no debe atribuirse a todos los puntos del polígono. El archivo `data/processed/candidate-product-evidence.v1.json` conserva URL, versión, período y alcance de cada dato.

En el caso publicado se encontraron 24 registros EMIT, sin filtro de fechas, y 4 registros MODIS para enero de 2025. Las descargas de los archivos científicos muestreados requirieron Earthdata Login. Para avanzar en mineralogía, descargar los productos de identificación y de incertidumbre, georreferenciar según su guía, recortar al polígono y aplicar el control de calidad antes de reportar clases y cobertura. La referencia requiere un producto mineralógico espacialmente cotejado. Para temperatura, procesar la calidad y las horas de observación MODIS y contrastarlas con Diviner o THEMIS antes de publicar una diferencia.


### Reproducir el contexto térmico planetario

```powershell
uv run --with-requirements backend/processing/requirements.txt python -m backend.processing.export_planetary_thermal
```

El script guarda `data/processed/planetary-thermal-context.v1.json`. Para Luna, selecciona los centroides del producto polar Diviner con coordenadas planetocéntricas en la ventana de estudio y resume sus máximos modelados de superficie. Verifica el rango solicitado al servidor y conserva su SHA-256. Para Marte, verifica que el sitio de aterrizaje documentado de Perseverance esté dentro de la ventana y usa un intervalo del sol 1, previo al primer desplazamiento. Convierte la irradiancia ascendente publicada por MEDA/TIRS a temperatura radiométrica equivalente con la relación de Stefan–Boltzmann y emisividad unitaria. Conserva el SHA-256 de la tabla original. La ausencia de una bandera de obstrucción por rueda queda indicada como límite del resultado.

Los tres contextos (reanálisis terrestre, máximo anual lunar y muestra radiométrica marciana) describen cantidades, escalas y tiempos distintos. El API los presenta con su procedencia y marca la diferencia como no comparable.


### Reproducir las unidades geológicas cartografiadas en Jezero

Descarga y extrae el ZIP de la [base de datos oficial de USGS SIM 3464](https://pubs.usgs.gov/sim/3464/sim3464_database.zip). Pasa la carpeta extraída `Nili.gdb` al script desde la raíz del repositorio.

```powershell
uv run --with-requirements backend/processing/requirements.txt --with pyogrio --with shapely python -m backend.processing.export_jezero_geology 'ruta/a/Nili.gdb'
```

La capa `GeoUnits_v1` se recorta en la proyección MTM del mapa y se publican sus fracciones de área en `candidate-product-evidence.v1.json`. La publicación actual identifica ocho unidades y cobertura cartográfica completa en ese polígono según el mapa. Los porcentajes corresponden a unidades geológicas cartografiadas. La abundancia mineral y el cotejo espectral Tierra–Marte quedan pendientes.


### Descargar los archivos científicos indexados

Los enlaces exactos se pueden consultar sin iniciar sesión:

```powershell
uv run --with requests python -m backend.processing.download_earthdata_products 'NASADEM_HGT_s23w066:0:1'
```

Para descargarlos, inicia sesión de forma interactiva con una cuenta personal de [NASA Earthdata](https://urs.earthdata.nasa.gov/):

```powershell
uv run --with earthaccess python -m backend.processing.download_earthdata_products 'NASADEM_HGT_s23w066:0:1' --download
```

El comando descarga los dos NetCDF de EMIT y el HDF de MODIS en `data/raw/earthdata/`, excluido de Git. Conserva los archivos de identificación e incertidumbre juntos para el control de calidad. Se requiere procesar los archivos y comprobar su cobertura antes de publicar nuevas métricas.


### Reproducir la comparación de superficie en el caso Andes–Jezero

El código de acceso descarga el granulo EMIT registrado y, con `--emit-granule`, los pares de dos escenas adicionales. Usa estos IDs para reproducir exactamente el conjunto de entrada.

```powershell
uv run --with earthaccess python -m backend.processing.download_earthdata_products 'NASADEM_HGT_s23w066:0:1' --emit-granule G2733662962-LPCLOUD --emit-granule G3240664743-LPCLOUD --download
uv run --with-requirements backend/processing/requirements.txt --with netcdf4 --with pyhdf python -m backend.processing.export_earth_observations 'NASADEM_HGT_s23w066:0:1'
uv run --with-requirements backend/processing/requirements.txt --with remotezip python -m backend.processing.export_jezero_spectral_context
```

- **EMIT.** Las tablas GLT sitúan las recuperaciones en la cuadrícula del polígono. El filtro exploratorio exige ID positivo, ajuste finito, incertidumbre positiva y profundidad de banda de al menos tres veces su incertidumbre. Retiene las etiquetas originales de la biblioteca, incluidas mezclas. La mejor escena tiene 118.625 celdas válidas de 119.214 (99,51 %). Esta es cobertura de datos, no abundancia de minerales.
- **CRISM.** El DDR de PDS geolocaliza los índices de ROI #444, figura 9 de [Tarnas et al. (2021)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8597593/). Los 117 índices de la muestra caen dentro de la ventana de Jezero con ambas convenciones de origen de índices. Se usa la interpretación publicada para la familia de los carbonatos. La comparación deja pendiente la equivalencia de especies y abundancias.
- **MODIS.** El HDF de MOD11A2 se recorta en su proyección sinusoidal. Se aplican los rangos del archivo, bits QA de temperatura recuperada, calidad de datos buena, error estimado de hasta 2 K y hora local válida. Se reportan aparte las franjas diurna y nocturna del compuesto de ocho días. El contraste interplanetario sigue marcado como no comparable debido a las distintas magnitudes, escalas y condiciones temporales.
