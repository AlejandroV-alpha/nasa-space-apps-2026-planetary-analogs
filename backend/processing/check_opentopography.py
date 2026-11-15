"""Download and verify a NASADEM sample from OpenTopography for a study area."""
import argparse
import hashlib
import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

import rasterio
import requests
from rasterio.warp import transform_bounds

ROOT = Path(__file__).resolve().parents[2]
ENDPOINT = 'https://portal.opentopography.org/API/globaldem'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', default='payun-sector')
    args = parser.parse_args()
    key = os.environ.get('OPENTOPOGRAPHY_API_KEY', '').strip()
    if not key:
        parser.error('Define OPENTOPOGRAPHY_API_KEY con tu clave personal de OpenTopography.')

    catalog = json.loads((ROOT / 'data/processed/catalog.json').read_text(encoding='utf-8'))
    site = next((site for site in catalog['sites'] if site['id'] == args.site), None)
    if site is None:
        parser.error(f'Sitio terrestre desconocido: {args.site}')
    points = site['studyArea']['geometry']['coordinates'][0]
    longitudes, latitudes = zip(*points)
    west, south, east, north = min(longitudes), min(latitudes), max(longitudes), max(latitudes)
    params = {
        'demtype': 'NASADEM',
        'south': south,
        'north': north,
        'west': west,
        'east': east,
        'outputFormat': 'GTiff',
    }
    output = ROOT / 'data/raw/opentopography' / f"{site['id']}.tif"
    output.parent.mkdir(parents=True, exist_ok=True)
    # Stage in the destination directory so the file inherits its Windows permissions.
    with NamedTemporaryFile(dir=output.parent, suffix='.tif', delete=False) as file:
        sample = Path(file.name)
    try:
        digest = hashlib.sha256()
        try:
            with requests.get(ENDPOINT, params={**params, 'API_Key': key},
                              stream=True, timeout=(15, 90)) as response:
                response.raise_for_status()
                with sample.open('wb') as file:
                    for chunk in response.iter_content(chunk_size=1024 * 1024):
                        file.write(chunk)
                        digest.update(chunk)
        except requests.RequestException as error:
            status = error.response.status_code if error.response is not None else 'sin respuesta'
            # The upstream request URL includes a personal key.
            raise SystemExit(f'OpenTopography: descarga fallida ({status}).') from None
        with rasterio.open(sample) as raster:
            if raster.driver != 'GTiff' or raster.crs is None or raster.count != 1:
                raise SystemExit('OpenTopography no devolvió un GeoTIFF de elevación georreferenciado.')
            bounds = transform_bounds(raster.crs, 'EPSG:4326', *raster.bounds)
            if not (bounds[0] < east and west < bounds[2] and bounds[1] < north and south < bounds[3]):
                raise SystemExit('El GeoTIFF no intersecta el área solicitada.')
            metadata = {
                'siteId': site['id'],
                'source': ENDPOINT,
                'request': params,
                'productDoi': '10.5067/MEaSUREs/NASADEM/NASADEM_HGT.001',
                'crs': str(raster.crs),
                'resolution': list(raster.res),
                'boundsWgs84': list(bounds),
                'sha256': digest.hexdigest(),
            }
        sample.replace(output)
        output.with_suffix('.json').write_text(json.dumps(metadata, indent=2) + '\n',
                                               encoding='utf-8', newline='\n')
    finally:
        sample.unlink(missing_ok=True)
    print(f'GeoTIFF y procedencia guardados en {output.parent.relative_to(ROOT)}.')


if __name__ == '__main__':
    main()
