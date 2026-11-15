"""Process downloaded EMIT mineral retrievals and a MODIS LST composite for a window."""
import argparse
from collections import Counter
import json
import math
import re

from affine import Affine
from netCDF4 import Dataset
import numpy as np
from pyhdf.SD import SD
from pyproj import CRS, Transformer
from rasterio.features import bounds, geometry_mask
from rasterio.windows import from_bounds

from .pipeline import DATA, OUT, sha256, save_json

RAW = DATA / 'raw/earthdata'
MODIS_FILE = 'MOD11A2.A2025001.h11v11.061.2025011011148.hdf'
OUTPUT = OUT / 'candidate-product-evidence.v1.json'


def grid_selection(geometry, transform, shape):
    """Count window pixel centers even when parts of the window are outside the source."""
    footprint = from_bounds(*bounds(geometry), transform=transform)
    left, top = math.floor(footprint.col_off), math.floor(footprint.row_off)
    right = math.ceil(footprint.col_off + footprint.width)
    bottom = math.ceil(footprint.row_off + footprint.height)
    selected = geometry_mask(
        [geometry], (bottom-top, right-left), transform * Affine.translation(left, top), invert=True,
    )
    x0, x1 = max(left, 0), min(right, shape[1])
    y0, y1 = max(top, 0), min(bottom, shape[0])
    total = int(np.count_nonzero(selected))
    if x1 <= x0 or y1 <= y0:
        return total, slice(0, 0), slice(0, 0), selected[:0, :0]
    return total, slice(y0, y1), slice(x0, x1), selected[y0-top:y1-top, x0-left:x1-left]


def emit_scene(mineral_file, uncertainty_file, geometry):
    with Dataset(mineral_file) as minerals, Dataset(uncertainty_file) as uncertainty:
        transform = Affine.from_gdal(*minerals.geotransform)
        if (CRS.from_wkt(minerals.spatial_ref).to_epsg() != 4326
                or minerals.time_coverage_start != uncertainty.time_coverage_start
                or minerals.time_coverage_end != uncertainty.time_coverage_end
                or not np.array_equal(minerals.geotransform, uncertainty.geotransform)):
            raise ValueError('Expected a matched EMIT identification and uncertainty pair in WGS84.')
        gx, gy = minerals['location/glt_x'], minerals['location/glt_y']
        denominator, rows, cols, inside = grid_selection(geometry, transform, gx.shape)
        grid_x = gx[rows, cols].filled(0)
        grid_y = gy[rows, cols].filled(0)
        covered = inside & (grid_x > 0) & (grid_y > 0)
        x, y = grid_x[covered] - 1, grid_y[covered] - 1
        metadata = minerals['mineral_metadata']
        names = {int(i): str(name) for i, name in zip(metadata['index'][:], metadata['name'][:], strict=True)}
        spectral_matches = []
        valid_any = np.zeros(len(x), dtype=bool)
        for group in (1, 2):
            prefix = f'group_{group}_'
            ident = minerals[prefix + 'mineral_id'][:].filled(0)[y, x]
            depth = minerals[prefix + 'band_depth'][:].filled(np.nan)[y, x]
            error = uncertainty[prefix + 'band_depth_unc'][:].filled(np.nan)[y, x]
            fit = uncertainty[prefix + 'fit'][:].filled(np.nan)[y, x]
            valid = ((ident > 0) & np.isfinite(depth) & np.isfinite(error) & np.isfinite(fit)
                     & (error > 0) & (depth >= 3 * error))
            valid_any |= valid
            spectral_matches.extend(
                {'group': group, 'libraryId': int(i), 'label': names[int(i)], 'pixels': count}
                for i, count in sorted(Counter(ident[valid]).items(), key=lambda entry: (-entry[1], entry[0]))
            )
        return {
            'granule': mineral_file.stem,
            'start': minerals.time_coverage_start,
            'end': minerals.time_coverage_end,
            'windowPixels': denominator,
            'geolocatedPixels': int(covered.sum()),
            'validPixels': int(valid_any.sum()),
            'coveragePercent': round(100 * valid_any.sum() / denominator, 2) if denominator else 0,
            'sourceHashes': {file.name: sha256(file) for file in (mineral_file, uncertainty_file)},
            'matches': spectral_matches,
        }


def modis_metadata(text, name):
    block = re.search(rf'OBJECT\s*=\s*{name}\s*(.*?)END_OBJECT', text, re.S)
    return re.search(r'VALUE\s*=\s*"([^"]+)"', block[1])[1]


def modis_summary(path, geometry):
    ds = SD(str(path))
    try:
        metadata = ds.attributes()['StructMetadata.0']
        if 'Projection=GCTP_SNSOID' not in metadata:
            raise ValueError('Unexpected MODIS grid projection.')
        radius = float(re.search(r'ProjParams=\(([^,]+)', metadata)[1])
        proj = CRS.from_proj4(f'+proj=sinu +R={radius} +lon_0=0 +units=m +no_defs')
        to_grid = Transformer.from_crs(4326, proj, always_xy=True)
        projected = {'type': 'Polygon', 'coordinates': [
            [to_grid.transform(*point) for point in ring] for ring in geometry['coordinates']
        ]}
        ul = [float(value) for value in re.search(r'UpperLeftPointMtrs=\(([^)]+)\)', metadata)[1].split(',')]
        lr = [float(value) for value in re.search(r'LowerRightMtrs=\(([^)]+)\)', metadata)[1].split(',')]
        data = ds.select('LST_Day_1km').get()
        height, width = data.shape
        transform = Affine((lr[0]-ul[0])/width, 0, ul[0], 0, (lr[1]-ul[1])/height, ul[1])
        total, rows, cols, inside = grid_selection(projected, transform, data.shape)
        core = ds.attributes()['CoreMetadata.0']
        result = {
            'granule': path.stem, 'sourceSha256': sha256(path),
            'start': modis_metadata(core, 'RANGEBEGINNINGDATE'),
            'end': modis_metadata(core, 'RANGEENDINGDATE'),
            'units': 'K', 'windowPixels': total,
        }
        for period, key in (('Day', 'daytime'), ('Night', 'nighttime')):
            lst = ds.select(f'LST_{period}_1km')
            attrs = lst.attributes()
            raw = lst.get()[rows, cols]
            qc = ds.select(f'QC_{period}').get()[rows, cols]
            view = ds.select(f'{period}_view_time')
            time = view.get()[rows, cols]
            # Keep retrieved LST, good data quality and reported LST error no greater than 2 K.
            valid = (inside & (raw >= attrs['valid_range'][0]) & (raw <= attrs['valid_range'][1])
                     & ((qc & 3) <= 1) & (((qc >> 2) & 3) == 0) & ((qc >> 6) <= 1)
                     & (time <= 240))
            values = (raw[valid].astype(float) - attrs['add_offset']) * attrs['scale_factor']
            times = time[valid] * view.attributes()['scale_factor']
            result[key] = {
                'validPixels': int(values.size),
                'coveragePercent': round(100 * values.size / total, 2) if total else 0,
                'mean': round(float(values.mean()), 2) if values.size else None,
                'minimum': round(float(values.min()), 2) if values.size else None,
                'maximum': round(float(values.max()), 2) if values.size else None,
                'medianLocalSolarHour': round(float(np.median(times)), 2) if times.size else None,
            }
        return result
    finally:
        ds.end()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('window_id')
    parser.add_argument('--modis', default=MODIS_FILE, help='Name of the downloaded MOD11A2 HDF file.')
    args = parser.parse_args()
    export = json.loads(OUTPUT.read_bytes())
    if args.window_id not in export['windows']:
        parser.error('No hay una consulta de satélites registrada para este ID.')
    discovery = json.loads((OUT / 'discovered-candidates.full.v1.json').read_bytes())
    geometry = next(feature['geometry'] for feature in discovery['results'][0]['features']
                    if feature['id'] == args.window_id)
    scenes = []
    for mineral_file in sorted(RAW.glob('EMIT_L2B_MIN_*.nc')):
        uncertainty_file = mineral_file.with_name(mineral_file.name.replace('_MIN_', '_MINUNCERT_', 1))
        if uncertainty_file.is_file():
            scenes.append(emit_scene(mineral_file, uncertainty_file, geometry))
    if not scenes:
        parser.error('Descarga al menos un par de identificación e incertidumbre EMIT.')
    selected = max(scenes, key=lambda scene: (scene['coveragePercent'], scene['granule']))
    modis = modis_summary(RAW / args.modis, geometry)
    export['windows'][args.window_id].update(
        emitObservations={
            'screening': 'Identificación positiva, ajuste finito e incertidumbre positiva; profundidad de banda ≥ 3 veces su incertidumbre.',
            'selectedGranule': selected['granule'],
            'scenes': scenes,
        },
        modisObservations=modis,
    )
    save_json(OUTPUT, export)
    for scene in scenes:
        print(f'{scene["granule"]}: {scene["validPixels"]}/{scene["windowPixels"]} passed')
    print('MODIS', modis['daytime'], modis['nighttime'])


if __name__ == '__main__':
    main()
