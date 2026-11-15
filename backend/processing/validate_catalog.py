"""Offline structural and scientific sanity checks on generated artifacts."""
import json
import math
from pathlib import Path
if __package__:
    from .pipeline import OUT, ROOT, METHOD, sha256
else:
    from pipeline import OUT, ROOT, METHOD, sha256


def validate():
    catalog=json.loads((OUT/'catalog.json').read_text(encoding='utf-8'))
    sources={s['id'] for s in catalog['sources']}
    refs={r['id']:r for r in catalog['references']}
    assert len(catalog['sites'])==4 and len(refs)==2
    assert catalog['status']=='computed_unreviewed'
    for item in catalog['sites']+catalog['references']:
        assert all(source in sources for source in item['sourceIds']+item['contextSourceIds'])
        assert item['studyArea']['sideM']==20000
        assert item['studyArea']['coordinateBody']==item['body']
        assert item['analogyStatus']=='hypothesis_not_validated'
        assert item['quality']['totalCells']==400
        assert item['quality']['finiteHeightCells']<=400
        assert item['quality']['finiteSlopeCells']<=400
        metrics={m['key']:m for m in item['metrics']}
        assert metrics['slope_median_deg']['value']<=metrics['slope_p90_deg']['value']<90
        assert metrics['relief_p95_p5_m']['value']>=0
        for metric in item['metrics']:
            assert metric['methodId']==METHOD and metric['analysisScaleM']==1000
            assert metric['value'] is None or math.isfinite(metric['value'])
            assert 0<=metric['validCoverageFraction']<=1
            assert metric['sourceIds'] and all(source in sources for source in metric['sourceIds'])
        assert sha256(ROOT/item['analysisRaster'])==item['analysisRasterSha256']
        for path,digest in item['sourceDetails']['metadataSha256'].items():
            assert sha256(ROOT/path)==digest
        for sensitivity in item['sensitivity']:
            assert sensitivity['analysisScaleM']==2000
            assert sensitivity['quality']['totalCells']==100
            path=ROOT/sensitivity['raster']
            assert sha256(path)==sensitivity['rasterSha256']
        if item['body']=='earth':
            assert item['referenceRegionId'] in refs
            comparison=item['assessments'][0]['comparison']
            for delta in comparison['metrics']:
                if delta['signedDifference'] is not None:
                    assert abs(delta['signedDifference']-(delta['candidateValue']-delta['referenceValue']))<.00011
    for filename in ['candidates.geojson','study-areas-earth.geojson']:
        features=json.loads((OUT/filename).read_text(encoding='utf-8'))['features']
        assert len(features)==4
        for feature in features:
            geometry=feature['geometry']
            coordinates=geometry['coordinates'] if geometry['type']=='Polygon' else [[geometry['coordinates']]]
            for ring in coordinates:
                for longitude,latitude in ring:
                    assert -180<=longitude<=180 and -90<=latitude<=90
    print('Validated: four candidates, two body-specific references, sources, units, scales, finite values, differences, Earth GeoJSON and raster hashes.')


if __name__=='__main__':validate()
