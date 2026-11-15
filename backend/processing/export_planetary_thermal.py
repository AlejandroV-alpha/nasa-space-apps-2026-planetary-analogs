"""Export contextual PDS temperatures for the two published planetary references."""
import csv
from hashlib import sha256
import json
import math
import xml.etree.ElementTree as ET

import numpy as np
from pyproj import Transformer
import requests

from .pipeline import DATA, OUT, coordinate_systems, save_json

DIVINER = ('https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/'
           'data_derived_prp/dlre_prp_south')
TIRS = ('https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env/'
        'sol_0000_0089/sol_0001/WE__0001___________DER_TIRS________________P04')
LANDING = (77.45088, 18.44463)
LANDING_SOURCE = 'https://ntrs.nasa.gov/citations/20210024644'
STEFAN_BOLTZMANN = 5.670374419e-8


def local_transform(reference):
    region = {**reference, 'studySideM': reference['studyArea']['sideM']}
    geographic, local = coordinate_systems(region)
    return Transformer.from_crs(geographic, local, always_xy=True)


def diviner_context(session, reference):
    label = session.get(DIVINER + '.xml', timeout=30)
    label.raise_for_status()
    root = ET.fromstring(label.content)
    temperature = next(field for field in root.findall('.//{*}Field_Character')
                       if field.findtext('{*}name') == 'temp_max')
    if 'at the surface' not in ' '.join(temperature.findtext('{*}description').split()):
        raise ValueError('Unexpected definition of Diviner temp_max.')

    # The released south-pole mesh contains 1200 strips of 2400 triangles.
    # This verified strip range contains the full X span of the selected study square.
    first_strip, last_strip = 540, 600
    record_width, triangles_per_strip = 210, 2400
    start = (first_strip * triangles_per_strip + 1) * record_width
    stop = (last_strip * triangles_per_strip + 1) * record_width - 1
    url = DIVINER + '.tab'
    response = session.get(url + '?study_thermal_rows=540-600',
                           headers={'Range': f'bytes={start}-{stop}'}, timeout=(15, 120))
    response.raise_for_status()
    if (response.status_code != 206 or len(response.content) != stop - start + 1
            or response.headers.get('Content-Range') != f'bytes {start}-{stop}/604800210'):
        raise ValueError('Invalid byte range returned for the Diviner mesh.')
    table = np.loadtxt(response.content.splitlines(), delimiter=',', usecols=(9, 10, 13))
    lon, lat, temp_max = table.T
    x, y = local_transform(reference).transform(lon, lat)
    half = reference['studyArea']['sideM'] / 2
    inside = (np.abs(x) <= half) & (np.abs(y) <= half)
    valid = temp_max[inside & np.isfinite(temp_max) & (temp_max > 0)]
    # Confirm that the sample does not touch the outer strips of the byte range.
    if not valid.size or inside[:triangles_per_strip].any() or inside[-triangles_per_strip:].any():
        raise ValueError('The Diviner range does not bracket the complete study square.')
    return {
        'sourceId': 'lro-diviner-prp',
        'product': 'DLRE_PRP_SOUTH, temp_max',
        'sourceUrl': url,
        'labelUrl': label.url,
        'sourceSha256': sha256(response.content).hexdigest(),
        'selection': f'bytes={start}-{stop}; centroides dentro del cuadrado de estudio',
        'quantity': 'modeled_annual_maximum_surface_temperature',
        'summary': 'Mediana y rango espacial del máximo anual de superficie modelado por triángulo.',
        'units': 'K',
        'samples': int(valid.size),
        'median': round(float(np.median(valid)), 3),
        'minimum': float(valid.min()),
        'maximum': float(valid.max()),
        'limitations': [
            'Modelo de máximos anuales en superficie, asociado a centroides de un mallado triangular.',
            'Selección por coordenadas planetocéntricas. No se ajustaron diferencias entre marcos de referencia.',
            'Los extremos son espaciales entre los máximos de cada triángulo.',
        ],
    }


def meda_context(session, reference):
    x, y = local_transform(reference).transform(*LANDING)
    if max(abs(x), abs(y)) > reference['studyArea']['sideM'] / 2:
        raise ValueError('The documented landing point falls outside the study square.')
    label = session.get(TIRS + '.xml', timeout=30)
    label.raise_for_status()
    root = ET.fromstring(label.content)
    field = next(field for field in root.findall('.//{*}Field_Delimited')
                 if field.findtext('{*}name') == 'UPWARD_LW_IRRADIANCE')
    if field.findtext('{*}unit') != 'watt/m2':
        raise ValueError('Unexpected MEDA irradiance units.')
    response = session.get(TIRS + '.CSV', timeout=30)
    response.raise_for_status()
    samples = []
    for row in csv.DictReader(response.text.splitlines()):
        if row['ROVER_STILL'] != '1' or row['SUN_OUTSIDE_TIRS_FOV'] != '1' or not row['UPWARD_LW_IRRADIANCE']:
            continue
        flux = float(row['UPWARD_LW_IRRADIANCE'])
        if math.isfinite(flux) and flux > 0:
            samples.append((row['LTST'], (flux / STEFAN_BOLTZMANN) ** .25))
    if not samples:
        raise ValueError('No valid MEDA observations.')
    times, values = zip(*samples)
    return {
        'sourceId': 'perseverance-meda-tirs',
        'product': 'WE__0001___________DER_TIRS________________P04',
        'sourceUrl': response.url,
        'labelUrl': label.url,
        'sourceSha256': sha256(response.content).hexdigest(),
        'selection': f'{times[0]} a {times[-1]} LTST',
        'quantity': 'blackbody_equivalent_radiometric_temperature',
        'summary': 'Mediana y rango de temperatura radiométrica equivalente, inferida de la irradiancia ascendente.',
        'units': 'K',
        'samples': len(values),
        'median': round(float(np.median(values)), 3),
        'minimum': round(min(values), 3),
        'maximum': round(max(values), 3),
        'coordinates': list(LANDING),
        'locationSourceUrl': LANDING_SOURCE,
        'limitations': [
            'Muestra puntual del sol 1 cerca del sitio de aterrizaje, anterior al primer desplazamiento.',
            'Conversión de Stefan–Boltzmann con emisividad unitaria. No corrige emisividad ni obstrucción por rueda.',
            'Intervalo diurno breve. No representa toda la ventana, la noche ni un extremo estacional.',
        ],
    }


def main():
    catalog = json.loads((DATA / 'processed/catalog.json').read_bytes())
    references = {reference['id']: reference for reference in catalog['references']}
    with requests.Session() as session:
        contexts = {
            'lunar-south-sector': diviner_context(session, references['lunar-south-sector']),
            'jezero-sector': meda_context(session, references['jezero-sector']),
        }
    save_json(OUT / 'planetary-thermal-context.v1.json', {'schemaVersion': '1.0.0', 'references': contexts})
    for reference, value in contexts.items():
        print(f'{reference}: {value["samples"]} muestras, mediana {value["median"]} K.')


if __name__ == '__main__':
    main()
