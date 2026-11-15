"""Locate the published CRISM carbonate-bearing ROI inside the Jezero study square."""
from hashlib import sha256
import json
import re
import xml.etree.ElementTree as ET

import numpy as np
from pyproj import Transformer
from remotezip import RemoteZip
import requests

from .pipeline import OUT, coordinate_systems, save_json

BASE = ('https://pds-geosciences.wustl.edu/mro/mro-m-crism-6-ddr-v1/mrocr_1001/ddr/'
        '2007/2007_029/hrl000040ff/hrl000040ff_07_de183l_ddr1')
ARCHIVE = 'https://zenodo.org/records/5525282/files/Data_Repository.zip?download=1'
ROI = 'Data_Repository/VNIR_analysis/ROIs/HRL000040FF/Figure_9/ROI444_new_bedrock.xml'
ARTICLE = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8597593/'


def main():
    catalog = json.loads((OUT / 'catalog.json').read_bytes())
    region = next(item for item in catalog['references'] if item['id'] == 'jezero-sector')
    geographic, local = coordinate_systems(region)
    project = Transformer.from_crs(geographic, local, always_xy=True)
    with RemoteZip(ARCHIVE, timeout=25) as archive:
        roi_bytes = archive.read(ROI)
    coords = np.fromstring(
        ET.fromstring(roi_bytes).findtext('.//PixelDef/Coordinates'), dtype=int, sep=' ',
    ).reshape(-1, 2)
    if not len(coords):
        raise ValueError('Empty CRISM region of interest.')
    with requests.Session() as session:
        label = session.get(BASE + '.lbl', timeout=25)
        label.raise_for_status()
        ddr = session.get(BASE + '.img', timeout=30)
        ddr.raise_for_status()
    bands = re.findall(r'"([^"]+)"', re.search(r'BAND_NAME\s*=\s*\((.*?)\)', label.text, re.S)[1])
    if not (re.search(r'SAMPLE_TYPE\s*=\s*PC_REAL', label.text)
            and re.search(r'BAND_STORAGE_TYPE\s*=\s*BAND_SEQUENTIAL', label.text)):
        raise ValueError('Unexpected CRISM DDR representation.')
    shape = tuple(int(re.search(rf'\b{name}\s*=\s*(\d+)', label.text)[1])
                  for name in ('BANDS', 'LINES', 'LINE_SAMPLES'))
    values = np.frombuffer(ddr.content, dtype='<f4').reshape(shape)
    latitude_band = next(i for i, name in enumerate(bands) if name.lower().startswith('latitude, areocentric'))
    longitude_band = next(i for i, name in enumerate(bands) if name.lower().startswith('longitude, areocentric'))
    lon_bounds, lat_bounds = [], []
    half = region['studyArea']['sideM'] / 2
    # Confirm the same spatial containment under either pixel-origin convention.
    for origin in (0, 1):
        columns, rows = (coords - origin).T
        if (np.any(columns < 0) or np.any(columns >= shape[2])
                or np.any(rows < 0) or np.any(rows >= shape[1])):
            raise ValueError('CRISM ROI indices fall outside the DDR.')
        lon, lat = values[longitude_band, rows, columns], values[latitude_band, rows, columns]
        x, y = project.transform(lon, lat)
        if not np.all(np.isfinite(x) & np.isfinite(y) & (abs(x) <= half) & (abs(y) <= half)):
            raise ValueError('CRISM ROI is not completely within the Jezero study area.')
        lon_bounds.extend((float(lon.min()), float(lon.max())))
        lat_bounds.extend((float(lat.min()), float(lat.max())))

    output = OUT / 'candidate-product-evidence.v1.json'
    evidence = json.loads(output.read_bytes())
    evidence.setdefault('localizedSpectra', {})['jezero-sector'] = {
        'source': {'id': 'crism-jezero-roi444', 'title': 'Tarnas et al. (2021) — espectros CRISM, figura 9',
                   'url': ARTICLE},
        'observation': 'HRL000040FF',
        'roi': 'ROI #444, figura 9',
        'localizedSamples': int(len(coords)),
        'bounds': [round(min(lon_bounds), 6), round(min(lat_bounds), 6),
                   round(max(lon_bounds), 6), round(max(lat_bounds), 6)],
        'mineralGroups': ['carbonatos', 'filosilicatos', 'olivino'],
        'roiArchiveUrl': ARCHIVE,
        'ddrUrl': BASE + '.img',
        'sourceHashes': {'roiXml': sha256(roi_bytes).hexdigest(), 'ddrImg': sha256(ddr.content).hexdigest()},
        'limitations': [
            'Se localizó la muestra del estudio original y se conserva su interpretación espectral.',
            'Los 117 píxeles pertenecen a un recorte de afloramiento, no a un inventario mineral de toda la ventana.',
            'La identificación se compara a nivel cualitativo de familias; las abundancias y especies exactas quedan por verificar.',
        ],
    }
    save_json(output, evidence)
    print(f'CRISM: {len(coords)} muestras de la ROI publicada dentro de Jezero.')


if __name__ == '__main__':
    main()
