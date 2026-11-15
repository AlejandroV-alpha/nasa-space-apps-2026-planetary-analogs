"""Clip the published USGS Jezero geological units to the reference polygon."""
import argparse
from collections import defaultdict
import json
from pathlib import Path

from pyogrio import read_info
from pyogrio.raw import read
from pyproj import CRS, Transformer
from shapely import from_wkb, make_valid, transform, union_all
from shapely.geometry import shape

from .pipeline import DATA, OUT, save_json

LAYER = 'GeoUnits_v1'
URL = 'https://pubs.usgs.gov/publication/sim3464'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('geodatabase', type=Path, help='Nili.gdb from the USGS SIM 3464 database ZIP')
    args = parser.parse_args()
    catalog = json.loads((DATA / 'processed/catalog.json').read_bytes())
    reference = next(item for item in catalog['references'] if item['id'] == 'jezero-sector')
    window = shape(reference['studyArea']['geometry'])

    crs = CRS.from_user_input(read_info(args.geodatabase, layer=LAYER)['crs'])
    project = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
    projected = transform(window, project.transform, interleaved=False)
    _, _, geometries, fields = read(
        args.geodatabase, layer=LAYER, columns=['unit', 'name'], bbox=projected.bounds,
    )
    fragments = defaultdict(list)
    for wkb, unit, name in zip(geometries, *fields, strict=True):
        if wkb is not None:
            fragment = make_valid(from_wkb(wkb)).intersection(projected)
            if fragment.area > 0:
                fragments[(unit, name)].append(fragment)
    covered = union_all([fragment for group in fragments.values() for fragment in group]).area
    if not covered:
        raise ValueError('No mapped USGS geologic units intersect the study window.')
    units = [
        {'code': code, 'name': name, 'percentOfWindow': round(100 * union_all(group).area / projected.area, 2)}
        for (code, name), group in fragments.items()
    ]

    output = OUT / 'candidate-product-evidence.v1.json'
    export = json.loads(output.read_bytes()) if output.exists() else {'schemaVersion': '1.0.0', 'windows': {}}
    export.setdefault('mappedGeology', {})['jezero-sector'] = {
        'source': {'id': 'usgs-jezero-sim3464', 'title': 'USGS SIM 3464 — Sun y Stack (2020)', 'url': URL},
        'layer': LAYER,
        'coveragePercent': round(100 * covered / projected.area, 2),
        'units': sorted(units, key=lambda unit: (-unit['percentOfWindow'], unit['code'])),
        'limitations': [
            'Fracciones de unidades cartográficas de USGS dentro del polígono, no abundancias minerales.',
            'Áreas calculadas en la proyección MTM de la fuente. Se interpretan las coordenadas angulares de la ventana en Mars 2000.',
        ],
    }
    save_json(output, export)
    print(f'USGS: {len(units)} unidades y {100 * covered / projected.area:.2f}% de cobertura cartográfica.')


if __name__ == '__main__':
    main()
