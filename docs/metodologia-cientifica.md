# Metodología científica del primer análisis

Entrega de Persona 2 · 14 de noviembre de 2026. Estado: cálculo exploratorio realizado; revisión científica independiente pendiente.

## Pregunta y alcance

¿Qué diferencias de relieve regional presentan cuatro ventanas terrestres respecto de dos ventanas planetarias, y cómo pueden orientar la preparación de campañas de reconocimiento geológico y cartografía de campo?

Se estudian sectores de Siloli, Coipasa, Amboy y Payún Matrú; una ventana lunar centrada en 0° E, 89.5° S; y una marciana centrada en 77.58° E, 18.44° N, en el entorno de Jezero. Estos centros y cuadrados pertenecen al equipo. No son límites oficiales de accidentes geográficos ni polígonos oficiales de aterrizaje o instalación de bases. No se afirma que los candidatos sean nuevos en la literatura.

Las áreas se definieron en [la configuración](../data/study-config.json) antes de obtener los indicadores. No se optimizaron polígonos para favorecer una coincidencia. Siloli tiene interpretación geológica específica pendiente; Coipasa y los campos volcánicos tienen fuentes contextuales, separadas de las fuentes de elevación.

## Fuentes efectivamente utilizadas

| Cuerpo | Producto | Representación y unidades | Precaución |
| --- | --- | --- | --- |
| Tierra | NASADEM_HGT.001, copia COG en Microsoft Planetary Computer | Alturas en m referidas al geoide EGM96; malla angular de 1 segundo | Es un reprocesamiento de SRTM con datos auxiliares, no SRTMGL1 V003. La procedencia de cada celda NUM no se obtuvo del espejo |
| Luna | LOLA LDEM_75S_240M V2.1 | Float32 little-endian, alturas en km respecto de esfera de radio 1737.4 km; 240 m/píxel verdadero en el polo | Multiplicar alturas por 1000. No sumar OFFSET=1737.4: ese offset permite obtener radio planetario, no una elevación que deba compararse con Tierra |
| Marte | MOLA MEGT44N000HB, V2.0 / archivo PDS4 mantenido | Int16 big-endian, topografía en m respecto del areoide GMM3; 128 píxeles/grado | Contiene interpolaciones; resolución de malla no equivale a espaciado entre observaciones ni a resolución efectiva |

Documentación primaria:

- [NASA/USGS: guía NASADEM](https://lpdaac.usgs.gov/documents/2237/NASADEM_User_Guide_V13.pdf) y [catálogo del producto](https://www.earthdata.nasa.gov/data/catalog/lpcloud-nasadem-hgt-001).
- [Colección NASADEM del espejo utilizado](https://planetarycomputer.microsoft.com/api/stac/v1/collections/nasadem).
- [NASA PDS: archivo LOLA](https://pds-geosciences.wustl.edu/missions/lro/lola.htm), [etiqueta del modelo utilizado](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/ldem_75s_240m_float.lbl).
- [NASA PDS: archivo MOLA](https://pds-geosciences.wustl.edu/missions/mgs/mola.html), [etiqueta PDS3](https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg128/megt44n000hb.lbl) y [XML PDS4](https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg128/megt44n000hb.xml).

En la ruta MOLA hay una diferencia importante: la etiqueta PDS3 publica MAP_SCALE=0.463 km/píxel, redondeada. El XML PDS4 conservado especifica 0.4630576672 km/píxel y una transformación corregida. El pipeline usa los valores precisos de ese XML para evitar desplazar el recorte. Conserva los metadatos usados y sus hashes.

La colección STAC del espejo NASADEM declara `license: proprietary` sin enlace específico de licencia. Se conserva esa discrepancia en el registro de fuentes; no se transforma en una afirmación de licencia abierta nueva. Los datos descargados originales no se añaden a Git. Revisar condiciones y atribuciones antes de publicar recursos externos.

## Geometría y escala

Cada área es un cuadrado de 20 × 20 km en una proyección azimutal equidistante centrada en su centro. Su área nominal proyectada es de 400 km²; esta proyección no es de igual área. Se densifican los bordes antes de exportarlos como coordenadas geográficas.

- Tierra: WGS84, coordenadas longitud/latitud en grados.
- Luna: esfera de radio 1 737 400 m, longitudes positivas al este; referencia ME/DE421 del producto.
- Marte: esfera de radio 3 396 000 m, coordenadas planetocéntricas IAU2000, longitudes positivas al este.

Cada GeoTIFF contiene su CRS. Los polígonos planetarios tienen cuerpo y CRS explícitos dentro de `catalog.json`; no se publican como si fueran coordenadas WGS84 terrestres.

La comparación principal usa celdas de 1000 m y una repetición a 2000 m. El proceso agrega las alturas mediante `Resampling.average` de GDAL/Rasterio al reproyectar. Conserva un margen de dos celdas por lado para calcular vecinos fuera del cuadrado interior. Los resultados resumen 20 × 20 celdas a 1 km, y 10 × 10 a 2 km.

Una malla común permite un contraste descriptivo consistente, pero no iguala el soporte observacional de los productos. En particular, la etiqueta MOLA advierte de huecos entre perfiles de hasta 12 km y proporciona valores interpolados. No se puede interpretar su malla de ~463 m como observaciones independientes a esa separación.

## Indicadores

Sea `z[i,j]` la altura media de una celda y `s` el espaciado de la malla en metros. Se calculan diferencias centrales:

```text
gx = (z[i,j+1] - z[i,j-1]) / (2s)
gy = (z[i+1,j] - z[i-1,j]) / (2s)
pendiente = atan(sqrt(gx² + gy²)) × 180 / π
```

La pendiente se descarta si falta la celda central o alguno de sus cuatro vecinos cardinales. La dirección de crecimiento de las filas no afecta a la magnitud de la pendiente.

| Indicador | Unidad | Definición |
| --- | --- | --- |
| Pendiente mediana | grados | Mediana de pendientes finitas del cuadrado interior |
| Pendiente P90 | grados | Percentil 90 de pendientes finitas |
| Relieve P95–P5 | metros | Percentil 95 menos percentil 5 de alturas finitas del cuadrado interior |

Los percentiles usan interpolación lineal de NumPy. Son cálculos del equipo sobre productos NASA, no indicadores de analogía publicados o validados por NASA. Se conservan cuatro decimales para trazar resultados, sin que ello represente cuatro decimales de exactitud científica. Para presentación se recomienda redondear pendientes a dos decimales y relieve a una décima.

No se comparan altitudes absolutas entre mundos. Los estadísticos relativos evitan comparar directamente los ceros verticales, pero no eliminan diferencias espaciales entre geoide, esfera y areoide ni errores de los modelos.

## Calidad, ausencias e incertidumbre

`validCoverageFraction` expresa la proporción de celdas de salida finitas que intervienen en la estadística. **No es cobertura de observaciones directas, confianza científica ni certeza de similitud.**

El umbral del equipo es 95 % de celdas finitas. Bajo ese umbral, el indicador se exporta como `null` y se registra el motivo. Cero es un valor posible y válido; por ejemplo, la pendiente mediana de la ventana de Coipasa es cero en el modelo agregado. No significa que todo el terreno sea perfectamente plano ni que su relieve esté libre de error.

La máscara nativa se respeta en NASADEM, con -32768 también tratado como inválido. En MOLA se trata -32768 como inválido; no se descartan ceros. En el modelo lunar se descartan valores no finitos o fuera de ±100 km antes de convertir unidades, un control amplio de valores corruptos muy fuera del rango de alturas descrito por la etiqueta. No se rellenan huecos nuevos en el pipeline.

Limitaciones compartidas:

- Los cuadrados pueden incluir terrenos distintos del accidente que les da nombre. Sus indicadores no caracterizan un desierto, salar o campo volcánico entero.
- A 1 km no se describen piedras, polvo, cohesión, porosidad ni obstáculos de centímetros o metros. El cono de Amboy es menor que una celda de análisis.
- Las superficies muy planas, agua y aplanamientos del producto pueden dominar el resultado de Coipasa.
- NASADEM deriva principalmente de observaciones de 2000; LOLA y MOLA representan otros intervalos. No son un inventario de condiciones actuales del lugar.
- No se evaluaron acceso, permisos, seguridad de campañas, protección ambiental ni logística.
- No se midieron temperatura, aridez, hielo, sombras, radiación ni propiedades biológicas o mineralógicas.
- La Tierra no reproduce la gravedad, vacío o atmósfera de los otros mundos.

## Comparación y sensibilidad

Cada candidato tiene una referencia planetaria explícita. Solo se restan indicadores con la misma clave, unidad, método, tamaño de ventana y escala:

```text
diferencia = valor_del_candidato - valor_de_la_referencia
```

La diferencia describe una variable. No es una probabilidad, un porcentaje de similitud ni una recomendación de ensayo. No hay ranking ni combinación de pesos.

La repetición a 2 km muestra cómo el suavizado altera la descripción. Debe consultarse `sensitivity` antes de resumir que dos lugares tienen pendientes parecidas. Elegir otra región de referencia o mover el polígono también puede cambiar las conclusiones; esa sensibilidad espacial aún no se ha evaluado.

## Verificaciones realizadas y pendientes

Se calcularon resultados para cuatro ventanas terrestres y dos planetarias a ambas escalas. Las pruebas comprueban planos de pendiente conocida, invariancia ante un cambio constante de altura, valor cero, propagación de datos ausentes, radios planetarios, dimensiones de las ventanas y rechazo de escalas incompatibles.

La validación del catálogo comprueba fuentes, valores finitos, unidades/escalas, diferencias, geometrías terrestres y hashes de los rásteres. Se repitió el procesamiento en modo offline: los 15 archivos JSON, GeoJSON y GeoTIFF conservaron hashes SHA256 idénticos. La reproducción requiere conservar las entradas descargadas.

La figura de control usa escalas de color comunes y alturas relativas a la mediana de cada ventana. Se revisa para detectar vacíos, patrones extraños y diferencias de relieve; no valida geología ni exactitud del producto. No se afirma una revisión manual en QGIS ni una revisión científica independiente. Ambas siguen siendo útiles antes de presentar los lugares como análogos defendidos científicamente.
