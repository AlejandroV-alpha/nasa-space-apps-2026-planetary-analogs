"""Export the computed science catalog to contract 1.1 without recomputing metrics.

Standard library only; no rasters, network, GIS dependencies or credentials needed.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INPUT = ROOT / 'data/processed/catalog.json'
OUTPUT = ROOT / 'frontend/public/data/analogs.v1.json'
FRAMES = {'moon':'MOON_ME_DE421_PLANETOCENTRIC','mars':'MARS_IAU2000_PLANETOCENTRIC'}
KEYS = {'slope_median_deg':'slope-median','slope_p90_deg':'slope-p90','relief_p95_p5_m':'relief-p95-p5'}
COUNTRIES = {'Bolivia':'BO','Argentina':'AR','Estados Unidos':'US'}
METHOD = 'regional-dem-average-central-difference-v1'
REVIEW = 'Indicadores calculados; revisión científica independiente y validación del análogo pendientes. '
COVERAGE = 'La cobertura indica celdas finitas, incluidas interpolaciones, no observaciones directas ni confianza. '


def metrics(items):
    result=[]
    for m in items:
        if m['methodId'] != METHOD or m['analysisScaleM'] != 1000:
            raise ValueError('Unexpected scientific method or primary scale')
        if m['status'] not in ['computed_unreviewed','unavailable']:
            raise ValueError('Unsupported scientific metric state')
        out={k:m[k] for k in ['value','unit','sourceIds','methodId','analysisScaleM','validCoverageFraction']}
        out.update(key=KEYS[m['key']],status='missing' if m['value'] is None else 'computed')
        if m['value'] is None:
            if not m.get('missingReason'):raise ValueError('Missing measurement requires a reason')
            out['missingReason']=m['missingReason']
        result.append(out)
    return result


def build(catalog, generated_at):
    if catalog['status']!='computed_unreviewed':raise ValueError('Unexpected science review state')
    sources=[]
    versions={'nasadem':'001','lola':'2.1','mola':'2.0'}
    source_frames={'nasadem':'EPSG:4326','lola':FRAMES['moon'],'mola':FRAMES['mars']}
    for source in catalog['sources']:
        measured=source['id'] in versions
        out=dict(id=source['id'],agency=source['agency'],product=source.get('product',source.get('title')),
                 version=versions.get(source['id'],'Recurso contextual sin versión de producto declarada'),url=source['url'],
                 accessedAt=source['accessDate'],license=source.get('licenseNotes','Recurso bibliográfico: consultar las condiciones del editor; no se redistribuye su contenido.'),
                 attribution=source.get('attribution',source['agency']+' — '+source.get('title','')),
                 crs=source_frames.get(source['id'],'not_applicable'))
        if measured:
            out.update(nativeCrs=source['horizontalReference'],verticalReference=source['verticalReference'],nativeResolutionDescription=source['nativeResolution'])
            interval=source['observationInterval']
            out['observationInterval']={'start':interval[0][:10],'end':interval[1][:10]}
            if 'doi' in source:out['doi']=source['doi']
            if 'assetUrl' in source:out['file']=source['assetUrl'].rsplit('/',1)[1]
        sources.append(out)
    references=[]
    for region in catalog['references']:
        references.append(dict(id=region['id'],name=region['name'],targetBody=region['body'],crs=FRAMES[region['body']],
            center={'type':'Point','coordinates':region['center']},geometry=region['studyArea']['geometry'],
            description=REVIEW+COVERAGE+region['selectionReason']+' Ventana del equipo de 20 × 20 km. '+' '.join(region['limitations']),
            selectionRationale=region['selectionReason'],sourceIds=region['sourceIds']+region['contextSourceIds'],
            evidenceStatus='analysis_computed',metrics=metrics(region['metrics'])))
    sites=[]
    for site in catalog['sites']:
        primary=site['metrics'];secondary=site['sensitivity'][0]['metrics']
        description='; '.join(f"{m['label']}: {m['value']} {m['unit']}" for m in primary)
        sensitivity='; '.join(f"{m['label']}: {m['value']} {m['unit']}" for m in secondary)
        source_assessment=site['assessments'][0]
        differences='; '.join(f"{m['key']}: {m['signedDifference']} {m['unit']}" for m in source_assessment['comparison']['metrics'])
        notes=REVIEW+f'Ventana de 20 × 20 km. A 1 km: {description}. Diferencias candidato menos referencia: {differences}. '+f'A 2 km: {sensitivity}. Las coincidencias dependen de la escala; no constituyen un ranking ni una recomendación.'
        kind='known_reference' if site['id'] in ['coipasa-sector','amboy-sector'] else 'candidate'
        sites.append(dict(id=site['id'],name=site['name'],country=COUNTRIES[site['country']],kind=kind,
            geometry={'type':'Point','coordinates':site['center']},studyArea=site['studyArea']['geometry'],
            summary=site['geology']+' '+site['novelty'],evidenceStatus='analysis_computed',
            sourceIds=site['sourceIds']+site['contextSourceIds'],metrics=metrics(primary),
            assessments=[dict(targetBody=site['targetBody'],referenceRegionId=site['referenceRegionId'],testUseCase=site['hypothesis'],
                interpretation=notes,limitations=site['limitations']+[COVERAGE.strip(),'La clasificación candidate no demuestra novedad científica.'],evidenceStatus='analysis_computed')]))
    return {'$schema':'../../../schema/planetary-analogs.schema.json', 'schemaVersion':'1.1.0',
        'datasetId':'planetary-analogs-regional-terrain-draft','generatedAt':generated_at,'status':'draft',
        'notes':REVIEW+COVERAGE+'Cuatro sectores terrestres y dos referencias planetarias. Malla principal 1 km y sensibilidad 2 km. '+
        'analysis_computed significa cálculo reproducible, no validación científica ni validación NASA. '+
        'Las referencias conservan ME/DE421 lunar e IAU2000 marciano; no se realizó una transformación a IAU 2015. '+
        'Amboy y Coipasa son contrastes conocidos; no se afirma descubrimiento. La trazabilidad y sensibilidad estructuradas se conservan en analogs.v1.provenance.json y en el catálogo científico original.',
        'sources':sources,'methods':[dict(id=METHOD,name='Relieve regional y pendientes por diferencias centrales',
            description='Cuadrados locales de 20 × 20 km, agregación GDAL average a 1000 m, margen de dos celdas. '+
            'Pendiente = atan(hypot(dz/dx,dz/dy)) en grados con diferencias centrales de cuatro vecinos; no es Horn. '+
            'Mediana y P90 de pendientes; relieve P95–P5 de alturas, percentiles lineales. '+
            'Se exige 95% de celdas finitas. Tierra WGS84, Luna radio 1737400 m, Marte radio 3396000 m. '+
            'No se comparan altitudes absolutas ni se iguala la resolución efectiva observacional entre productos.',
            resampling='average',windowM=20000,documentationUrl='https://github.com/AlejandroV-alpha/nasa-space-apps-2026-planetary-analogs/blob/69583ce/docs/metodologia-cientifica.md')],
        'referenceRegions':references,'sites':sites}


def outputs(generated_at):
    original=INPUT.read_bytes()
    catalog=json.loads(original)
    dataset=build(catalog, generated_at)
    provenance=dict(schemaVersion='1.0-export-provenance',scientificCatalogPath='data/processed/catalog.json',
        scientificCatalogSha256=hashlib.sha256(original).hexdigest(),reviewStatus=catalog['status'],
        keyMapping=KEYS,coordinateFrames=FRAMES,
        note='Native frame identifiers are project-defined, not EPSG/IAU authority codes. No datum transformation was performed.',
        entities=[{k:item[k] for k in ['id','body','coordinates','studyArea','sourceDetails','provenance','quality','sensitivity','analysisRaster','analysisRasterSha256']} for item in catalog['sites']+catalog['references']])
    encode=lambda value:json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n'
    return {OUTPUT:encode(dataset),OUTPUT.with_name('analogs.v1.provenance.json'):encode(provenance)}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true',help='Fail if exported files differ; does not write files.')
    args=parser.parse_args()
    generated_at = json.loads(OUTPUT.read_text())['generatedAt'] if args.check and OUTPUT.exists() else datetime.now(timezone.utc).isoformat()
    for path,text in outputs(generated_at).items():
        if args.check:
            if not path.exists() or path.read_text()!=text:raise SystemExit(f'Outdated export: {path.relative_to(ROOT)}')
        else:
            path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text)
    print('Science export is current.' if args.check else 'Exported four real candidates and two references, draft contract 1.1.0.')


if __name__=='__main__':main()
