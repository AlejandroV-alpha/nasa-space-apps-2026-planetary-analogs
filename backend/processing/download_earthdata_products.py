"""Locate and download the Earthdata granules selected for a discovery window."""
import argparse
import json
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import urlsplit

import requests

ROOT = Path(__file__).resolve().parents[2]
CMR = 'https://cmr.earthdata.nasa.gov/search/granules.json'
LP_DAAC = 'data.lpdaac.earthdatacloud.nasa.gov'


def science_files(granule_id: str, extension: str) -> list[str]:
    response = requests.get(CMR, params={'concept_id': granule_id, 'page_size': 1}, timeout=30)
    response.raise_for_status()
    items = response.json()['feed']['entry']
    if len(items) != 1 or items[0]['id'] != granule_id:
        raise ValueError(f'Granule not found in NASA CMR: {granule_id}')
    urls = []
    for link in items[0]['links']:
        url = urlsplit(link['href'])
        if (url.scheme == 'https' and url.hostname == LP_DAAC and not url.query
                and url.path.startswith('/lp-prod-protected/') and url.path.endswith(extension)):
            urls.append(url.geturl())
    if not urls:
        raise ValueError(f'No science files found for {granule_id}')
    return list(dict.fromkeys(urls))


def download(session, url: str, target: Path) -> None:
    with NamedTemporaryFile(dir=target.parent, suffix='.part', delete=False) as file:
        pending = Path(file.name)
    try:
        with session.get(url, stream=True, timeout=(30, 180)) as response:
            response.raise_for_status()
            if 'html' in response.headers.get('Content-Type', '').lower():
                raise ValueError('Earthdata returned a sign-in page for ' + target.name)
            with pending.open('wb') as output:
                for block in response.iter_content(1024 * 1024):
                    output.write(block)
        with pending.open('rb') as source:
            magic = source.read(8)
        if not magic.startswith((b'\x89HDF\r\n\x1a\n', b'\x0e\x03\x13\x01', b'CDF')):
            raise ValueError('Unexpected scientific file format for ' + target.name)
        pending.replace(target)
    finally:
        pending.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('window_id')
    parser.add_argument('--emit-granule', action='append', default=[], metavar='CMR_ID',
                        help='Include an additional EMIT identification/uncertainty pair.')
    parser.add_argument('--download', action='store_true', help='Sign in interactively and download the files.')
    args = parser.parse_args()
    path = ROOT / 'data/processed/candidate-product-evidence.v1.json'
    windows = json.loads(path.read_bytes())['windows']
    if args.window_id not in windows:
        parser.error('No hay una consulta de productos registrada para esa ventana.')
    record = windows[args.window_id]
    urls = [
        url for key, extension in (('emit', '.nc'), ('modis', '.hdf'))
        if (granule := record[key]['exampleGranuleId'])
        for url in science_files(granule, extension)
    ]
    urls.extend(url for granule in args.emit_granule for url in science_files(granule, '.nc'))
    urls = list(dict.fromkeys(urls))
    for url in urls:
        print(url)
    if not args.download or not urls:
        return

    import earthaccess

    authorization = earthaccess.login(strategy='interactive', persist=False)
    if not authorization.authenticated:
        raise SystemExit('Autenticación Earthdata pendiente.')
    folder = ROOT / 'data/raw/earthdata'
    folder.mkdir(parents=True, exist_ok=True)
    with earthaccess.get_requests_https_session() as session:
        for url in urls:
            target = folder / Path(urlsplit(url).path).name
            download(session, url, target)
            print(f'Guardado: {target.name}')


if __name__ == '__main__':
    main()
