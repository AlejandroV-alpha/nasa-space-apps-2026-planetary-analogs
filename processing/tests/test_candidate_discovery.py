import json

import numpy as np
from rasterio.io import MemoryFile
from rasterio.transform import from_origin

from backend.processing.discover_candidates import (
    DATA, rank_candidates, relative_distance, requested_tiles, scan_tile,
)


def test_grid_discovers_new_windows_inside_dem_with_both_scales():
    with MemoryFile() as source:
        with source.open(driver='GTiff', width=400, height=400, count=1,
                         dtype='int16', crs='EPSG:4326',
                         transform=from_origin(-69, -22, 0.0025, 0.0025),
                         nodata=-32768) as raster:
            elevation = np.full((400, 400), 4000, dtype='int16')
            raster.write(elevation, 1)
            candidates = list(scan_tile(raster, 'NASADEM_HGT_s23w069'))
            assert len(candidates) > 1
            assert list(scan_tile(raster, 'NASADEM_HGT_s23w069', (-69, -23, -68.99, -22.99))) == []
            assert all(candidate['studyArea']['sideM'] == 20_000 for candidate in candidates)

    for candidate in candidates:
        assert all(metric['value'] == 0 for metric in candidate['metrics'])
        assert all(metric['value'] == 0 for metric in candidate['sensitivity']['metrics'])

    catalog = json.loads((DATA / 'processed/catalog.json').read_bytes())
    group = rank_candidates(candidates, catalog['references'][0], limit=2)
    assert group['comparableWindows'] == len(candidates)
    assert len(group['features']) == 2
    assert all(feature['geometry']['type'] == 'Polygon' for feature in group['features'])
    assert group['features'][0]['properties']['sensitivity']['analysisScaleM'] == 2000


def test_tile_bounds_and_distance_preserve_zero_and_missing():
    assert requested_tiles((-66, -23, -65, -22)) == ['NASADEM_HGT_s23w066']
    assert relative_distance([
        {'candidateValue': 0, 'referenceValue': 0},
        {'candidateValue': 10, 'referenceValue': 20},
    ]) == 0.25
    assert relative_distance([{'candidateValue': None, 'referenceValue': 0}]) is None
