# Recursos verificados y plan de trabajo para tres integrantes

Revisión: 14 de noviembre de 2026. Propuesta de implementación del equipo, no validación científica de candidatos.

## 1. Qué exige el desafío

[Enunciado oficial](https://www.spaceappschallenge.org/2026/challenges/permanent-moon-base-locations-and-mars/?tab=details).
[Recursos oficiales](https://www.spaceappschallenge.org/2026/challenges/permanent-moon-base-locations-and-mars/?tab=resources).

Identificar y caracterizar uno o más lugares, ambientes o procesos terrestres útiles como análogos para futuras bases lunares o exploración de Marte, usando datos abiertos. Explicar semejanzas, diferencias y utilidad para una actividad concreta. El enunciado fomenta buscar lugares poco estudiados y considerar la escala.

No exige una web, IA, un porcentaje, un número mínimo de lugares ni utilizar todos los recursos. Mapa, aplicación, informe y visualización son formatos posibles. El selector Luna/Marte, comparador y 4–8 candidatos pertenecen a nuestra propuesta de producto.

La revisión incluyó Details, Background, Objectives, Potential Considerations y los once enlaces científicos de Resources. Se inspeccionaron páginas de producto y directorios de archivos relevantes. No se descargaron rásteres completos, no se probaron descargas autenticadas ni se calcularon métricas. El video enlazado no fue transcrito ni analizado. La pestaña Teams no aporta datasets y no se auditó.

## 2. Auditoría de los once recursos enlazados

Prioridades propuestas: P0 = base del MVP; P1 = complemento; P2 = ampliación.

| Recurso | Qué contiene / función | Uso en el proyecto | Acceso observado y prioridad |
| --- | --- | --- | --- |
| [NASA Earthdata Search](https://search.earthdata.nasa.gov/) | Buscador de colecciones y observaciones terrestres; no es un único dataset | Encontrar SRTM y productos ambientales por área/fecha | Abre en Chrome; usa JavaScript. Preparar Earthdata Login para descargas que lo requieran. P0 |
| [NASA Worldview](https://worldview.earthdata.nasa.gov/) | Visor de capas satelitales con acceso a datos subyacentes | Reconocimiento, contexto visual, selección de fechas y evidencia gráfica | Abre en Chrome. Una imagen coloreada no sustituye valores científicos. P1 |
| [NASA PDS](https://pds.nasa.gov/) | Archivo científico de misiones planetarias y herramientas | Acceder a productos lunares y marcianos y sus metadatos | Página accesible; productos públicos. P0 |
| [LRO](https://pds-geosciences.wustl.edu/missions/lro/) | Índice de instrumentos/archivos: LOLA, Diviner, LROC, LEND, Mini-RF y otros | Elegir topografía lunar y evidencia complementaria | Página accesible. Es una misión/índice, hay que elegir un producto. P0 |
| [Diviner](https://pds-geosciences.wustl.edu/missions/lro/diviner.htm) | Datos térmicos y productos derivados globales, regionales y polares | Contextualizar condiciones térmicas lunares; extensión de análisis | Página y directorio PRP accesibles. Preferir derivados frente a observaciones crudas. P1 |
| [RCM](https://donnees-data.asc-csa.gc.ca/en/dataset/rcm) | Radar SAR terrestre y recursos asociados | Estudios de hielo/superficie si existe cobertura útil | Consulta web dio 502, pero página accesible en Chrome. EODMS requiere registro para acceso público; no todo el archivo está disponible para todos. Revisar licencia del producto. P2 |
| [RADARSAT-1](https://donnees-data.asc-csa.gc.ca/en/dataset/radarsat1) | Archivo SAR terrestre abierto | Evidencia adicional en regiones con imágenes útiles | Consulta web dio 502, página accesible en Chrome; enlaces a EODMS y COG en AWS. P2 |
| [Tutorial SAR de CSA](https://github.com/asc-csa/Synthetic_Aperture_Radar_Tutorial) | Guías QGIS y notebook Python; ejemplos RADARSAT | Aprender lectura y visualización de radar | Repositorio accesible. Es un tutorial, no un catálogo de análogos. P2 |
| [Copernicus Data Space](https://dataspace.copernicus.eu/) | Observaciones Sentinel, buscador y APIs | Sentinel-2 para contexto óptico/vegetación; Sentinel-1 para radar; Sentinel-3 para variables ambientales | Portal y descripción de misiones accesibles. Confirmar cuenta, cobertura y acceso del servicio elegido. P1 |
| [ESA Open Science Catalogue](https://opensciencedata.esa.int/) | Catálogo de productos, proyectos y recursos con acceso API | Descubrir productos adicionales si falta una variable | Interfaz accesible en Chrome; contenido dinámico. No se seleccionó ni validó un dataset específico. P2 |
| [JAXA G-Portal](https://gportal.jaxa.jp/gpr/index/index) | Búsqueda por satélite/sensor y magnitud física | Buscar productos complementarios de precipitación, nieve u otras variables | Redirige a [G-Portal actual](https://www.gportal.jaxa.jp/?lang=en). Portal accesible; descarga/cobertura por producto pendientes. P2 |

Documentación de apoyo:

- [Worldview: funciones y acceso a datos subyacentes](https://github.com/nasa-gibs/worldview/blob/main/README.md).
- [RCM: registro y tipos de usuario](https://www.asc-csa.gc.ca/eng/satellites/radarsat/access-to-data/how-to-become-a-user.asp).
- [RADARSAT-1 COG en AWS](https://registry.opendata.aws/radarsat-1/): acceso público sin cuenta AWS al bucket `radarsat-r1-l1-cog`.
- [Misiones Sentinel disponibles](https://dataspace.copernicus.eu/data-collections/copernicus-sentinel-missions).
- El enlace API mostrado por el catálogo ESA lleva a [esta documentación](https://eoapi.workspace.earthcode.eox.at/stac/api.html); no se probó una consulta API.

## 3. Productos concretos para empezar

### Tierra: SRTMGL1 versión 003 — P0

[Ficha y cita NASA](https://www.earthdata.nasa.gov/data/catalog/lpcloud-srtmgl1-003).

- Elevación, formato HGT, malla de 1 segundo de arco (~30 m en el ecuador).
- Cobertura: 60° N a 56° S. No cubre Antártida ni todo el Ártico.
- Adquisición: febrero de 2000. No representa cambios recientes del terreno.
- Versión 3 rellena vacíos con otros modelos; registrar esa limitación y usar información de procedencia si es relevante.
- Derivar pendiente y relieve local; no llamar a esos resultados mediciones publicadas directamente por NASA.
- La consulta web recibió 403; la ficha completa sí abrió en Chrome y se verificaron cobertura, formato y versión.

### Luna: LOLA GDR / LDEM — P0

[Archivo LOLA](https://pds-geosciences.wustl.edu/missions/lro/lola.htm).
[Directorio GDR](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/).
[Modelos polares flotantes](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/).

- Usar productos de elevación LDEM; el directorio también contiene otros productos.
- Elegir una región lunar de referencia delimitada. Propuesta inicial: entorno del polo sur; selección exacta pendiente de evidencia.
- Descargar imagen con su etiqueta LBL/XML; verificar unidades, factor/offset, proyección, datum y NoData.
- Hay productos de diferentes resoluciones y archivos de varios GB. Elegir un recorte o producto manejable.
- Un candidato terrestre puede reproducir aspectos del relieve sin reproducir el vacío, gravedad, iluminación ni frío del polo lunar.

### Marte: MOLA MEGDR — P0

[Archivo MOLA](https://pds-geosciences.wustl.edu/missions/mgs/mola.html).
[Bundle PDS4 mantenido](https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/).
[Descripción de colecciones](https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/readme.txt).

- Mapas topográficos a 4, 16, 32, 64 y 128 píxeles/grado, además de productos polares.
- 128 píxeles/grado equivale aproximadamente a 463 m en el ecuador marciano; el espaciado físico depende de latitud/proyección. Es una conversión aproximada, no precisión del instrumento.
- No permite inferir obstáculos de centímetros ni certificar transitabilidad de un rover.
- Elegir elevación/topografía, no confundirla con radio planetario, conteo de observaciones u otros archivos del bundle.
- Seleccionar un área marciana concreta y documentar por qué es relevante para exploración. Jezero/Gale son opciones a investigar, no referencias ya aprobadas.
- Si el objetivo requiere detalle de movilidad, investigar un DTM de mayor resolución y verificar cobertura antes de comprometer el alcance.

### Tierra: MOD11A2 versión 061 — P1

[Ficha NASA](https://www.earthdata.nasa.gov/data/catalog/lpcloud-mod11a2-061).
[Guía oficial MOD11 V6.1](https://modis-land.gsfc.nasa.gov/pdf/MOD11_User_Guide_V61.pdf).

- Temperatura de superficie diurna/nocturna y emisividad; 1 km; promedio de ocho días; formato HDF.
- Incluye capas de calidad, tiempos de observación y cobertura de cielo despejado.
- Aplicar controles de calidad y factores/unidades de la documentación antes de calcular estadísticas.
- No es temperatura del aire ni registro continuo de extremos diarios. La diferencia día/noche muestreada no equivale a la amplitud térmica diaria completa.
- Ficha accesible en Chrome pese al 403 de la consulta web.

### Luna: Diviner derivados — P1

[Productos polares PRP](https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/).

- El directorio contiene tablas norte/sur (~605 MB cada una) y etiquetas. No cargar estas tablas completas en el navegador.
- Verificar en las etiquetas qué magnitudes contiene el producto elegido; no asumir que cualquier derivado es una temperatura instantánea.
- El archivo informa valores faltantes `-9999` en la columna `tb` de determinados RDR. No aplicar esa convención a todos los productos sin leer sus metadatos.
- MODIS y Diviner pueden contextualizar diferencias térmicas; requieren compatibilidad de magnitudes, escalas, hora local y estadísticos antes de calcular una distancia.

## 4. Método propuesto para un MVP defendible

Pregunta inicial: **¿qué zonas terrestres ofrecen un relieve comparable, a escala regional, al de una región lunar o marciana seleccionada, para preparar campañas de reconocimiento y ensayos de campo?**

1. Definir una referencia lunar y una marciana, con polígonos y fuentes.
2. Seleccionar inicialmente cuatro candidatos terrestres, con hipótesis de utilidad. Investigar Siloli y sectores volcánicos del altiplano; su idoneidad y novedad siguen pendientes. Usar lugares conocidos como referencia contextual cuando aporte valor.
3. Delimitar áreas con tamaño físico comparable; registrar el criterio y evitar elegir recortes solo porque producen mejores resultados.
4. Inspeccionar metadatos, vacíos y cobertura; preparar proyecciones métricas apropiadas para cada cuerpo, respetando su radio y sistema de coordenadas.
5. Armonizar la escala efectiva antes de derivar métricas. Interpolar MOLA a 30 m no crea detalle nuevo. Mantener además estadísticas nativas si ayudan, claramente separadas.
6. Calcular pendiente mediana y percentil 90 en grados; relieve P95–P5 en metros. Añadir rugosidad solo con definición y ventana física documentadas.
7. Registrar método de remuestreo, malla final, ventana, cobertura válida y efectos de resolución. Estas estadísticas describen topografía, no transitabilidad certificada.
8. Complementar la interpretación con evidencia geológica identificable; una imagen o baja vegetación no demuestra composición mineral ni aridez.
9. Exportar resultados pequeños a JSON/GeoJSON. Datos ausentes: `null` con motivo; nunca cero inventado.
10. Mostrar comparación por variable y explicación de utilidad/límites. Un ranking queda fuera del primer incremento; incorporarlo solo con normalización, pesos, cobertura y sensibilidad explícitos.

Criterio de éxito propuesto por el equipo: cuatro candidatos navegables y al menos tres fichas con evidencia real; una comparación Tierra–Luna y otra Tierra–Marte. Si no se consiguen datos compatibles, reducir candidatos y explicar la carencia.

## 5. Reparto de tareas

### Persona 1 — Frontend y experiencia

| ID | Tarea | Terminado cuando |
| --- | --- | --- |
| F1 | Crear navegación Inicio, Explorador, Comparación y Metodología en Angular existente | Todas las vistas son accesibles y adaptables a móvil |
| F2 | Incorporar MapLibre, puntos y selección de candidatos | Seleccionar marcador/lista abre la misma ficha; hay atribución del mapa |
| F3 | Implementar selector Luna/Marte y filtros | Solo muestra asociaciones/candidatos correspondientes sin perder coherencia de selección |
| F4 | Construir ficha de sitio y evidencia | Muestra área, ensayo previsto, métricas/unidades, fuente, referencia planetaria y límites |
| F5 | Comparar 2–3 candidatos respecto de la misma referencia | Variables compatibles quedan alineadas y ausencias aparecen como no disponibles |
| F6 | Integrar dataset validado y revisar accesibilidad | Flujo usable con teclado, estados vacíos/error y diseño móvil revisados |

Entrega: aplicación navegable con fixtures identificados al inicio y datos reales al integrar. Responsable de `frontend/src/app` y presentación. Coordinar con Persona 3 cambios en configuración/build.

### Persona 2 — Ciencia, selección de sitios y GIS

| ID | Tarea | Terminado cuando |
| --- | --- | --- |
| D1 | Definir ensayo, referencias Luna/Marte y cuatro candidatos | Cada área tiene polígono, hipótesis y justificación; se distingue referencia conocida de candidato nuevo |
| D2 | Conseguir recortes SRTM/LOLA/MOLA | Cada archivo tiene producto/versión, etiqueta, URL, fecha y cobertura registrada |
| D3 | Preparar pipeline Python/GDAL/Rasterio | Se puede repetir recorte, limpieza, armonización y cálculo desde instrucciones |
| D4 | Calcular indicadores y evaluar calidad | Incluye unidades, escala de análisis, cobertura válida y límites; revisión visual en QGIS |
| D5 | Redactar fichas científicas y metodología | Cada afirmación tiene evidencia o se presenta explícitamente como hipótesis |
| D6 | Evaluar complemento ambiental | Solo integrar MODIS/Sentinel/Diviner si responde a la pregunta y permite interpretación correcta |

Entrega: dataset científico, fuentes, recortes/metadatos referenciados y procedimiento reproducible. Responsable propuesto de `data/`, `processing/` y documentación científica; evitar subir rásteres pesados al repositorio.

### Persona 3 — Contrato, integración, calidad y publicación

| ID | Tarea | Terminado cuando |
| --- | --- | --- |
| I1 | Acordar contrato con Persona 2 y validar con Persona 1 | Hay esquema versionado y un ejemplo consumible con métricas ausentes representadas correctamente |
| I2 | Preparar validación y fixtures | Detecta coordenadas inválidas, IDs/fuentes rotos, unidades/estado incoherentes y referencias inexistentes |
| I3 | Publicar JSON/GeoJSON estáticos y conectarlos al frontend | No necesita descargar rásteres ni ejecutar procesamiento al abrir la aplicación |
| I4 | Preparar build y despliegue | Demo pública funciona, rutas cargan por enlace directo y licencia PrimeUI usa configuración existente |
| I5 | Ejecutar pruebas de integración con el equipo | Flujo Luna y Marte, comparación, enlaces, ausencias y móvil revisados |
| I6 | Preparar README, demo y material de entrega | Instrucciones reproducibles, atribuciones, contribuciones y video/pitch listos |

Entrega: dataset integrado y validado, demo publicada y documentación de ejecución. FastAPI es opcional; añadirlo si existe una necesidad que los archivos estáticos no cubren.

## 6. Acuerdo de datos para desbloquear a los tres

Persona 3 facilita el esquema; Persona 2 define significado científico y Persona 1 confirma que se puede presentar. Propuesta de campos, pendiente de concretar en JSON Schema:

- `schemaVersion`, `id`, `name`, `country`, `geometry` terrestre GeoJSON en WGS84 y `studyArea`.
- `assessments[]`: `targetBody`, `referenceRegionId`, `testUseCase`, `interpretation`, `limitations` y `evidenceStatus`.
- `metrics[]`: `key`, `value` numérico o `null`, `unit`, `sourceIds`, `methodId`, `analysisScaleM`, `validCoverageFraction`, `status` y `missingReason` cuando corresponda.
- `sources[]`: agencia, producto, versión, DOI/URL, archivo, fecha de acceso, intervalo de observación, resolución nativa, licencia/atribución y metadatos de coordenadas.
- Registro separado de regiones lunares/marcianas con cuerpo y CRS explícitos; no interpretar sus coordenadas como WGS84 terrestre.
- Estado que distinga fixture, candidato investigado y análisis calculado. Separar observaciones, indicadores derivados e interpretación del equipo.

## 7. Orden de ejecución y dependencias

| Momento relativo | Persona 1 | Persona 2 | Persona 3 | Punto de integración |
| --- | --- | --- | --- | --- |
| Primera hora | Validar estructura de ficha | Definir pregunta y referencias | Esquema y ejemplo | Un objeto compartido acordado |
| Primer bloque | Navegación/mapa con fixtures | Obtener primer conjunto de recortes | Validador y carga estática | Un candidato de extremo a extremo |
| Segundo bloque | Ficha y selección | Primera comparación real y revisión de escala | Integrar datos/versiones | Una ficha con fuente y cálculo reproducible |
| Tercer bloque | Comparador y metodología | Completar candidatos y límites | Build/despliegue y pruebas | Flujo Luna y Marte publicado |
| Cierre | Correcciones de interfaz | Revisar afirmaciones del pitch | README, video y entrega | Los tres verifican la demo |

La prioridad inmediata es lograr una comparación científica reproducible. Ampliar a más sitios, radar, capas térmicas, ranking, 3D o IA después de ese hito. Este cronograma es una propuesta relativa de trabajo, no el calendario oficial del evento.
