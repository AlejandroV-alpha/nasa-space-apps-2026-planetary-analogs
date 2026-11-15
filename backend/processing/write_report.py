"""Build the Spanish scientific brief from the computed catalog, avoiding stale numbers."""
import json
if __package__:
    from .pipeline import ROOT, OUT
else:
    from pipeline import ROOT, OUT


def main():
    catalog=json.loads((OUT/'catalog.json').read_text(encoding='utf-8'))
    source_map={s['id']:s for s in catalog['sources']}
    refs={r['id']:r for r in catalog['references']}
    lines=['# Fichas científicas del análisis exploratorio','',
           'Persona 2 · 14 de noviembre de 2026. Generado mediante `processing/write_report.py` a partir de `data/processed/catalog.json`.',
           '', '**Estado: indicadores calculados con datos reales; analogías sin validar y revisión científica independiente pendiente.**',
           '', 'Se describen cuadrados del equipo de 20 × 20 km. Las cifras no representan accidentes geográficos completos. Las diferencias candidato–referencia no son un ranking.',
           '', '## Resumen a 1 km', '',
           '| Ventana | Destino | Pendiente mediana (°) | Pendiente P90 (°) | Relieve P95–P5 (m) |',
           '| --- | --- | ---: | ---: | ---: |']
    for r in catalog['sites']+catalog['references']:
        values=[m['value'] for m in r['metrics']]
        target={'moon':'Luna','mars':'Marte','earth':r.get('targetBody','Tierra')}.get(r['body'])
        target={'moon':'Luna','mars':'Marte'}.get(target,target)
        lines.append(f'| {r["name"]} | {target} | {values[0]:.2f} | {values[1]:.2f} | {values[2]:.1f} |')
    lines += ['', 'Los cuatro candidatos tienen 400/400 celdas finitas de altura y pendiente a 1 km. Esto incluye valores interpolados de los productos y no mide observaciones directas ni exactitud.', '']
    for r in catalog['sites']:
        ref=refs[r['referenceRegionId']]
        lines += [f'## {r["name"]}', '', f'- **Ubicación:** {r["country"]}, {r["region"]}; centro del equipo {r["center"][1]}° latitud, {r["center"][0]}° longitud.',
                  f'- **Destino y referencia:** {ref["name"]}.', f'- **Uso por investigar:** {r["hypothesis"]}',
                  f'- **Terreno/contexto:** {r["geology"]}',f'- **Novedad:** {r["novelty"]}', '',
                  '### Evidencia calculada y sensibilidad', '', '| Indicador | Candidato a 1 km | Referencia a 1 km | Diferencia | Candidato a 2 km |',
                  '| --- | ---: | ---: | ---: | ---: |']
        for m,delta in zip(r['metrics'],r['assessments'][0]['comparison']['metrics']):
            secondary=next(x['value'] for x in r['sensitivity'][0]['metrics'] if x['key']==m['key'])
            lines.append(f'| {m["label"]} ({m["unit"]}) | {m["value"]:.2f} | {delta["referenceValue"]:.2f} | {delta["signedDifference"]:+.2f} | {secondary:.2f} |')
        lines += ['', 'La tabla contrasta el relieve regional a las escalas indicadas. Las diferencias en signo o magnitud no determinan por sí solas la utilidad del sitio.']
        if r['id']=='siloli-sector':
            lines += ['', 'En esta selección, Siloli presenta pendientes y relieve mayores que la ventana de Jezero. No conviene describirlo como una reproducción de ese sector marciano. Puede mantenerse como candidato para investigar un objetivo diferente, una vez aportada evidencia geológica local.']
        elif r['id']=='coipasa-sector':
            lines += ['', 'La ventana de Coipasa es mucho más plana que la de Jezero en el modelo agregado. El interés regional de los salares para estudios marcianos no convierte a este cuadrado en equivalente de Jezero. La pendiente mediana cero requiere considerar aplanamientos y limitaciones de los DEM sobre salares.']
        elif r['id']=='amboy-sector':
            lines += ['', 'La ventana de Amboy tiene menores pendientes y relieve que la referencia polar lunar. El cono es menor que una celda y el cuadrado incluye otros terrenos. El contexto volcánico puede motivar estudios de campo, pero este cálculo no reproduce el relieve lunar ni su origen.']
        else:
            lines += ['', 'En esta ventana, la pendiente mediana y P90 de Payún Matrú están próximas a las de la referencia lunar a 1 km, mientras que el relieve P95–P5 es menor. A 2 km cambia la relación entre las medianas: la coincidencia depende de la escala. Es una observación topográfica preliminar, sin equivalencia mineralógica ni validación de ensayo.']
        lines += ['', '### Límites específicos', '']+[f'- {limit}' for limit in r['limitations'][:2]]
        lines += ['', '### Fuentes y trazabilidad', '']
        for key in r['sourceIds']+r['contextSourceIds']:
            source=source_map[key]
            label=source.get('title',source.get('product',key))
            lines.append(f'- [{label}]({source["url"]}).')
        if not r['contextSourceIds']:
            lines.append('- Fuente geológica específica del polígono: pendiente. NASADEM aporta elevación, no composición ni aridez.')
        lines += [f'- [Polígono terrestre](../data/processed/study-areas-earth.geojson) y [catálogo con productos, escalas, métodos y hashes](../data/processed/catalog.json).', '']
    lines += ['## Referencias planetarias', '']
    for r in catalog['references']:
        lines += [f'### {r["name"]}', '', r['selectionReason'], '',
                  'Ventana de 20 × 20 km con proyección local y cuerpo explícitos en el catálogo. Los centros no se declaran coordenadas oficiales de instalación de base ni de aterrizaje.', '']
    lines += ['## Complemento ambiental evaluado', '',
              'Se mantiene fuera del primer cálculo: MOD11A2 aporta temperatura de superficie terrestre promediada en ocho días; Diviner tiene productos térmicos lunares con muestreo y definiciones diferentes. Sin armonizar magnitud, estadístico, hora local, calidad y periodo, una distancia térmica sería engañosa. No se descargaron ni calcularon esos productos.', '',
              'Sentinel podría aportar contexto óptico y cobertura del suelo. No se utiliza una imagen o baja vegetación como prueba suficiente de aridez o composición. Radar, mineralogía, hielo y biología siguen fuera de los indicadores calculados.', '',
              '## Entrega y revisión pendiente', '',
              '- D1: cuatro ventanas terrestres y dos referencias delimitadas; hipótesis explícitas. Novedad científica y representatividad espacial no demostradas.',
              '- D2: datos reales obtenidos; NASADEM sustituye a SRTMGL1 y se registra esa diferencia. Metadatos y procedencia conservados.',
              '- D3: pipeline reproducible y modo offline con entradas locales.',
              '- D4: indicadores, sensibilidad y control visual generados. Inspección externa en QGIS y revisión científica independiente pendientes.',
              '- D5: fichas, metodología y bibliografía disponibles.',
              '- D6: complemento ambiental evaluado y pospuesto por falta de compatibilidad validada; sin variables inventadas.', '',
              '![Control visual del relieve y las pendientes](../data/processed/terrain-quality.png)', '',
              'La figura usa la misma escala de color entre ventanas. Alturas relativas a la mediana de cada ventana: no implica un datum vertical compartido. Véase [la metodología](metodologia-cientifica.md) para los límites.', '']
    (ROOT/'docs/fichas-cientificas.md').write_text('\n'.join(lines), encoding='utf-8', newline='\n')


if __name__=='__main__':main()
