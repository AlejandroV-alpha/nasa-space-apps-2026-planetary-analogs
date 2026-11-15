"""Export historical NASA POWER daily conditions for the terrestrial study sites."""
import argparse
from datetime import date, datetime, timedelta, timezone
import json
import math
from pathlib import Path
from tempfile import TemporaryDirectory

import requests

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / 'data/study-config.json'
OUTPUT = ROOT / 'data/processed/terrestrial-environment.v1.json'
ENDPOINT = 'https://power.larc.nasa.gov/api/temporal/daily/point'
PARAMETERS = {
    'T2M': 'Temperatura del aire a 2 m',
    'WS10M': 'Velocidad del viento a 10 m',
    'ALLSKY_SFC_SW_DWN': 'Irradiación solar de onda corta en superficie',
}


def read_site(session, region, start, end):
    longitude, latitude = region['center']
    response = session.get(
        ENDPOINT,
        params={
            'parameters': ','.join(PARAMETERS),
            'community': 'RE',
            'longitude': longitude,
            'latitude': latitude,
            'start': start.strftime('%Y%m%d'),
            'end': end.strftime('%Y%m%d'),
            'time-standard': 'LST',
            'format': 'JSON',
        },
        timeout=(15, 60),
    )
    response.raise_for_status()
    payload = response.json()
    header = payload['header']
    if (header['start'], header['end'], header['time_standard']) != (
        start.strftime('%Y%m%d'), end.strftime('%Y%m%d'), 'LST'
    ):
        raise ValueError('NASA POWER devolvió un período o estándar horario inesperado.')
    raw_series = payload['properties']['parameter']
    missing = header['fill_value']
    variables = {}
    for parameter, label in PARAMETERS.items():
        unit = payload['parameters'][parameter]['units']
        if not unit:
            raise ValueError(f'Falta la unidad de {parameter}.')
        series = raw_series[parameter]
        daily = {}
        for offset in range((end - start).days + 1):
            day = start + timedelta(days=offset)
            value = series.get(day.strftime('%Y%m%d'))
            if value is not None and (type(value) not in (int, float) or not math.isfinite(value)):
                raise ValueError(f'Valor inválido para {parameter} el {day}.')
            daily[day.isoformat()] = None if value == missing else value
        available = [value for value in daily.values() if value is not None]
        variables[parameter] = {
            'label': label,
            'unit': unit,
            'validDays': len(available),
            'mean': round(sum(available) / len(available), 3) if available else None,
            'daily': daily,
        }
    return {
        'siteId': region['id'],
        'requestedCoordinates': [longitude, latitude],
        'responseCoordinates': payload['geometry']['coordinates'][:2],
        'requestUrl': response.url,
        'apiVersion': header['api']['version'],
        'products': header['sources'],
        'variables': variables,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--start', type=date.fromisoformat, default=date(2025, 1, 1))
    parser.add_argument('--end', type=date.fromisoformat, default=date(2025, 12, 31))
    args = parser.parse_args()
    if args.end < args.start:
        parser.error('--end debe ser igual o posterior a --start.')

    regions = json.loads(CONFIG.read_text(encoding='utf-8'))['regions']
    sites = []
    with requests.Session() as session:
        for region in regions:
            if region['body'] == 'earth':
                try:
                    sites.append(read_site(session, region, args.start, args.end))
                except (requests.RequestException, ValueError, KeyError, TypeError) as error:
                    raise SystemExit(f"NASA POWER, {region['id']}: {error}") from error

    dataset = {
        'schemaVersion': '1.0.0',
        'source': 'NASA POWER Daily API',
        'sourceUrl': 'https://power.larc.nasa.gov/docs/services/api/temporal/daily/',
        'retrievedAt': datetime.now(timezone.utc).isoformat(),
        'period': {'start': args.start.isoformat(), 'end': args.end.isoformat(), 'timeStandard': 'LST'},
        'limitations': [
            'Series históricas regionales de la celda de cada producto, no mediciones in situ ni pronósticos.',
            'Un solo período de estudio no caracteriza la climatología del sitio.',
            'Contexto para el ensayo terrestre, excluido de las diferencias Tierra–Luna y Tierra–Marte.',
        ],
        'sites': sites,
    }
    with TemporaryDirectory(dir=OUTPUT.parent) as temp:
        pending = Path(temp) / OUTPUT.name
        pending.write_text(json.dumps(dataset, ensure_ascii=False, indent=2, allow_nan=False) + '\n',
                           encoding='utf-8', newline='\n')
        pending.replace(OUTPUT)
    print(f'NASA POWER: {len(sites)} sitios exportados a {OUTPUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
