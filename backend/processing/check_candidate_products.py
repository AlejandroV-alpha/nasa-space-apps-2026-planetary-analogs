"""Refresh public product discovery metadata and a NASA POWER skin-temperature summary."""
import argparse
from datetime import date, datetime, timedelta, timezone
import json
import math
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data/processed'
CMR = 'https://cmr.earthdata.nasa.gov/search/granules.json'
POWER = 'https://power.larc.nasa.gov/api/temporal/daily/point'
OUTPUT = DATA / 'candidate-product-evidence.v1.json'


def catalog_check(session, short_name, version, bounds, temporal=None):
    params = {
        'short_name': short_name,
        'version': version,
        'bounding_box': ','.join(map(str, bounds)),
        'page_size': 1,
    }
    if temporal:
        params['temporal'] = temporal
    response = session.get(CMR, params=params, timeout=30)
    response.raise_for_status()
    entries = response.json()['feed']['entry']
    return {
        'product': short_name,
        'version': version,
        'boundsWgs84': bounds,
        'temporal': temporal,
        'queryUrl': response.url,
        'catalogHits': int(response.headers['CMR-Hits']),
        'exampleGranuleId': entries[0]['id'] if entries else None,
    }


def skin_temperature(session, center, start, end):
    parameters = {
        'parameters': 'TS',
        'community': 'RE',
        'longitude': center[0],
        'latitude': center[1],
        'start': start.strftime('%Y%m%d'),
        'end': end.strftime('%Y%m%d'),
        'format': 'JSON',
        'time-standard': 'LST',
    }
    response = session.get(POWER, params=parameters, timeout=30)
    response.raise_for_status()
    payload = response.json()
    header = payload['header']
    if (header['start'], header['end'], header['time_standard'], payload['parameters']['TS']['units']) != (
        parameters['start'], parameters['end'], 'LST', 'C',
    ):
        raise ValueError('NASA POWER devolvió metadatos TS inesperados.')
    days = (end - start).days + 1
    daily = payload['properties']['parameter']['TS']
    values = []
    for i in range(days):
        value = daily.get((start + timedelta(days=i)).strftime('%Y%m%d'))
        if type(value) in (int, float) and math.isfinite(value) and value != header['fill_value']:
            values.append(value)
    if not values:
        raise ValueError('NASA POWER no devolvió observaciones TS válidas para este período.')
    return {
        'parameter': 'TS',
        'quantity': 'earth_skin_temperature',
        'units': '°C',
        'period': {'start': start.isoformat(), 'end': end.isoformat(), 'timeStandard': 'LST'},
        'requestedCoordinates': center,
        'responseCoordinates': payload['geometry']['coordinates'][:2],
        'apiVersion': header['api']['version'],
        'products': header['sources'],
        'aggregation': 'Media, mínimo y máximo de los valores diarios válidos de la celda de reanálisis.',
        'validDays': len(values),
        'expectedDays': days,
        'mean': round(sum(values) / len(values), 3),
        'minDaily': min(values),
        'maxDaily': max(values),
        'sourceUrl': response.url,
        'limitations': [
            'Estimación regional de reanálisis para la celda consultada, no un promedio del polígono de 20 km.',
            'Los extremos son de la serie diaria; no son extremos instantáneos, ni un contraste diurno/nocturno.',
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('window_id')
    args = parser.parse_args()
    discovery = json.loads((DATA / 'discovered-candidates.full.v1.json').read_bytes())
    feature = next((feature for group in discovery['results'] for feature in group['features']
                    if feature['id'] == args.window_id), None)
    if feature is None:
        parser.error('La ventana no se encuentra en la exportación científica completa.')

    xs, ys = zip(*feature['geometry']['coordinates'][0])
    bounds = [min(xs), min(ys), max(xs), max(ys)]
    with requests.Session() as session:
        record = {
            'checkedAt': datetime.now(timezone.utc).isoformat(),
            'emit': catalog_check(session, 'EMITL2BMIN', '001', bounds),
            'modis': catalog_check(
                session, 'MOD11A2', '061', bounds, '2025-01-01T00:00:00Z,2025-01-31T23:59:59Z',
            ),
            'earthSkinTemperature': skin_temperature(
                session, feature['properties']['center'], date(2025, 1, 1), date(2025, 12, 31),
            ),
        }

    export = json.loads(OUTPUT.read_bytes()) if OUTPUT.exists() else {'schemaVersion': '1.0.0', 'windows': {}}
    export['windows'][args.window_id] = record
    OUTPUT.write_text(json.dumps(export, ensure_ascii=False, indent=2, allow_nan=False) + '\n',
                      encoding='utf-8', newline='\n')
    print(f'{args.window_id}: EMIT {record["emit"]["catalogHits"]}, MODIS {record["modis"]["catalogHits"]}, '
          f'NASA POWER TS {record["earthSkinTemperature"]["validDays"]} días válidos.')


if __name__ == '__main__':
    main()
