"""Find terrestrial terrain windows automatically from NASADEM elevation tiles."""
import argparse
import json
import math
from pathlib import Path
import re

import numpy as np
import rasterio
from pyproj import CRS, Transformer
from rasterio.warp import transform_bounds
from rasterio.windows import Window, from_bounds
import requests

from .pipeline import (
    DATA, META, OUT, RAW, average_grid, bounds_for, comparison, coordinate_systems,
    export_metrics, nasadem_tile, save_json, study_geometry, terrain_metrics,
)

WGS84 = CRS.from_epsg(4326)
SIDE_M = 20_000
SCALES_M = (1_000, 2_000)
TILE_ID = re.compile(r'NASADEM_HGT_[ns]\d{2}[ew]\d{3}')
OUTPUT = OUT / 'discovered-candidates.v1.json'


def requested_tiles(bounds):
    west, south, east, north = bounds
    return [
        f"NASADEM_HGT_{'n' if lat >= 0 else 's'}{abs(lat):02d}"
        f"{'e' if lon >= 0 else 'w'}{abs(lon):03d}"
        for lat in range(math.floor(south), math.ceil(north))
        for lon in range(math.floor(west), math.ceil(east))
    ]


def intersect(first, second):
    return (
        max(first[0], second[0]), max(first[1], second[1]),
        min(first[2], second[2]), min(first[3], second[3]),
    )


def contains(outer, inner):
    return (
        outer[0] <= inner[0] <= inner[2] <= outer[2]
        and outer[1] <= inner[1] <= inner[3] <= outer[3]
    )


def scan_tile(raster, tile_id, bounds=None):
    tile_bounds = transform_bounds(raster.crs, WGS84, *raster.bounds)
    west, south, east, north = intersect(tile_bounds, bounds) if bounds else tile_bounds
    if west >= east or south >= north:
        return
    tile_center = [(tile_bounds[0] + tile_bounds[2]) / 2, (tile_bounds[1] + tile_bounds[3]) / 2]
    _, local = coordinate_systems({'body': 'earth', 'center': tile_center})
    inverse = Transformer.from_crs(local, WGS84, always_xy=True)
    left, bottom, right, top = transform_bounds(WGS84, local, west, south, east, north)
    for y in range(math.ceil(bottom / SIDE_M), math.floor(top / SIDE_M) + 1):
        for x in range(math.ceil(left / SIDE_M), math.floor(right / SIDE_M) + 1):
            center = list(inverse.transform(x * SIDE_M, y * SIDE_M))
            region = {'body': 'earth', 'center': center, 'studySideM': SIDE_M}
            if not contains((west, south, east, north), bounds_for(region, WGS84, margin_m=0)):
                continue

            # Require the padding in the source tile to calculate slopes at study edges.
            source_bounds = bounds_for(region, raster.crs)
            if not contains(raster.bounds, source_bounds):
                continue
            fractional = from_bounds(*source_bounds, raster.transform)
            col = math.floor(fractional.col_off)
            row = math.floor(fractional.row_off)
            width = math.ceil(fractional.col_off + fractional.width) - col
            height = math.ceil(fractional.row_off + fractional.height) - row
            window = Window(col, row, width, height)
            values = raster.read(1, window=window, masked=True).astype('float64').filled(np.nan)
            measurements = []
            for scale in SCALES_M:
                grid, _, _ = average_grid(values, raster.window_transform(window), raster.crs, region, scale)
                measures, quality, _ = terrain_metrics(grid, scale)
                measurements.append({
                    'analysisScaleM': scale,
                    'metrics': export_metrics(measures, quality, scale, 'nasadem'),
                    'quality': quality,
                })
            yield {
                'id': f'{tile_id}:{x}:{y}',
                'tileId': tile_id,
                'center': center,
                'studyArea': {'sideM': SIDE_M, 'geometry': study_geometry(region)},
                'metrics': measurements[0]['metrics'],
                'quality': measurements[0]['quality'],
                'sensitivity': measurements[1],
            }


def relative_distance(rows):
    """Mean symmetric relative difference, equally weighted across metrics."""
    differences = []
    for row in rows:
        candidate, reference = row['candidateValue'], row['referenceValue']
        if candidate is None or reference is None:
            return None
        denominator = max(abs(candidate), abs(reference))
        differences.append(abs(candidate - reference) / denominator if denominator else 0.0)
    return sum(differences) / len(differences)


def compare_at_scale(candidate, reference, scale):
    if scale == SCALES_M[1]:
        candidate = {**candidate, 'metrics': candidate['sensitivity']['metrics']}
        sensitivity = next(item for item in reference['sensitivity'] if item['analysisScaleM'] == scale)
        reference = {**reference, 'metrics': sensitivity['metrics']}
    rows = comparison(candidate, reference)['metrics']
    return {'analysisScaleM': scale, 'metrics': rows, 'distance': relative_distance(rows)}


def rank_candidates(candidates, reference, limit):
    ranked = []
    for candidate in candidates:
        primary = compare_at_scale(candidate, reference, SCALES_M[0])
        if primary['distance'] is not None:
            ranked.append((primary['distance'], candidate['id'], candidate, primary))
    features = []
    for _, identifier, candidate, primary in sorted(ranked)[:limit]:
        features.append({
            'type': 'Feature',
            'id': identifier,
            'geometry': candidate['studyArea']['geometry'],
            'properties': {
                'center': candidate['center'],
                'tileId': candidate['tileId'],
                'quality': candidate['quality'],
                'comparison': primary,
                'sensitivity': {
                    **compare_at_scale(candidate, reference, SCALES_M[1]),
                    'quality': candidate['sensitivity']['quality'],
                },
            },
        })
    return {
        'type': 'FeatureCollection',
        'reference': {key: reference[key] for key in ('id', 'name', 'body')},
        'comparableWindows': len(ranked),
        'features': features,
    }


def discover(references, bounds=None, download=False, limit=10):
    tile_ids = requested_tiles(bounds) if bounds else sorted(
        path.stem for path in RAW.glob('NASADEM_HGT_*.tif') if TILE_ID.fullmatch(path.stem)
    )
    candidates, sources, skipped = [], [], []
    for tile_id in tile_ids:
        try:
            path, _, provenance = nasadem_tile(tile_id, offline=not download)
        except FileNotFoundError:
            skipped.append({'tileId': tile_id, 'reason': 'Tesela o metadatos ausentes en la caché.'})
            continue
        except requests.HTTPError as error:
            if error.response is not None and error.response.status_code == 404:
                skipped.append({'tileId': tile_id, 'reason': 'El proveedor no encontró la tesela.'})
                continue
            raise

        with rasterio.open(path) as raster:
            candidates.extend(scan_tile(raster, tile_id, bounds))
        sources.append({'tileId': tile_id, 'url': provenance['url'], 'sha256': provenance['sha256']})

    return {
        'schemaVersion': '1.0.0',
        'search': {
            'boundsWgs84': list(bounds) if bounds else None,
            'windowSideM': SIDE_M,
            'centerSpacingM': SIDE_M,
            'measuredWindows': len(candidates),
            'tiles': sources,
            'skippedTiles': skipped,
        },
        'method': {
            'distance': 'Media de abs(candidato - referencia) / max(abs(candidato), abs(referencia)). '
                        'Ambos valores en cero aportan cero. Los tres indicadores tienen igual peso.',
            'ordering': 'Distancia de menor a mayor a 1 km; 2 km se muestra como sensibilidad.',
            'limitations': [
                'Cribado topográfico exploratorio, sin validación de analogía ni aptitud de campo.',
                'Se evalúan ventanas de una cuadrícula dentro de cada tesela; se omiten bordes sin margen.',
                'La cobertura se limita a las teselas consultadas y a las ventanas completamente contenidas.',
            ],
        },
        'results': [rank_candidates(candidates, reference, limit) for reference in references],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference', help='ID de referencia planetaria. Por defecto usa todas las disponibles.')
    parser.add_argument('--bounds', nargs=4, type=float, metavar=('WEST', 'SOUTH', 'EAST', 'NORTH'))
    parser.add_argument('--download', action='store_true', help='Descarga teselas faltantes de la extensión indicada.')
    parser.add_argument('--limit', type=int, default=10, help='Máximo de ventanas devueltas por referencia.')
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args()
    if args.limit < 1:
        parser.error('--limit debe ser positivo.')
    if args.bounds:
        west, south, east, north = args.bounds
        if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
            parser.error('--bounds requiere oeste sur este norte en grados, sin cruzar el antimeridiano.')
    if args.download and not args.bounds:
        parser.error('--download requiere --bounds.')
    if args.download:
        RAW.mkdir(parents=True, exist_ok=True)
        META.mkdir(parents=True, exist_ok=True)

    catalog = json.loads((DATA / 'processed/catalog.json').read_text(encoding='utf-8'))
    references = [ref for ref in catalog['references'] if not args.reference or ref['id'] == args.reference]
    if not references:
        parser.error(f'Referencia desconocida: {args.reference}')
    try:
        results = discover(references, args.bounds, args.download, args.limit)
    except requests.RequestException as error:
        status = error.response.status_code if error.response is not None else 'sin respuesta'
        raise SystemExit(f'No se pudo consultar NASADEM ({status}).') from None

    save_json(args.output, results)
    print(f"Ventanas medidas: {results['search']['measuredWindows']}. Resultados: {args.output}")


if __name__ == '__main__':
    main()
