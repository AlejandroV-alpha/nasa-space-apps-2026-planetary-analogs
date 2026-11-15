"""Read an immutable, schema-checked snapshot; API requests never process rasters."""
from hashlib import sha256
import json
from functools import lru_cache
from pathlib import Path
from threading import Lock
from typing import TypeVar

from fastapi import HTTPException
from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import ValidationError
from pydantic import BaseModel

from .characterization import PlanetaryThermalExport, ProductEvidenceExport, StudiesExport
from .science_exports import CandidateDiscovery, CompleteCandidateDiscovery, EnvironmentExport

ROOT = Path(__file__).resolve().parents[2]
PRODUCT_EVIDENCE_FILE = 'candidate-product-evidence.v1.json'
ANALOG_STUDIES_FILE = 'analog-studies.v1.json'
PLANETARY_THERMAL_FILE = 'planetary-thermal-context.v1.json'
Export = TypeVar('Export', bound=BaseModel)


class Repository:
    def __init__(self, root: Path = ROOT):
        self.root = root
        self._lock = Lock()
        self._dataset = None
        self._provenance = None
        self._discovery = None
        self._full_discovery = None
        self._environment = None
        self._product_evidence = None
        self._analog_studies = None
        self._planetary_thermal = None
        self._export_hashes: dict[str, str] = {}

    def load(self):
        with self._lock:
            if self._dataset is not None:
                return self._dataset
            try:
                data = self._read_json('frontend/public/data/analogs.v1.json')
                schema = self._read_json('schema/planetary-analogs.schema.json')
                Draft202012Validator(schema, format_checker=FormatChecker()).validate(data)
                self._provenance = self._read_json('frontend/public/data/analogs.v1.provenance.json')
            except (OSError, ValueError, ValidationError) as error:
                raise HTTPException(503, 'Catálogo no disponible o inválido. Ejecutar el procesamiento y reiniciar la API.') from error
            self._dataset = data
            return data

    def _read_json(self, relative_path: str):
        return json.loads((self.root / relative_path).read_text(encoding='utf-8'))

    def _read_export(self, filename: str, model: type[Export]) -> Export:
        try:
            path = self.root / 'data/processed' / filename
            payload = path.read_bytes()
            export = model.model_validate_json(payload, strict=True)
            self._export_hashes[filename] = sha256(payload).hexdigest()
            return export
        except (OSError, ValueError) as error:
            raise HTTPException(
                503, f'Exportación científica no disponible o inválida: {filename}. Regenerar la salida y reiniciar la API.'
            ) from error

    def provenance(self):
        self.load()
        exports = {}
        for filename, load in (
            (PRODUCT_EVIDENCE_FILE, self.product_evidence),
            (ANALOG_STUDIES_FILE, self.analog_studies),
            (PLANETARY_THERMAL_FILE, self.planetary_thermal),
        ):
            try:
                export = load()
            except HTTPException as error:
                if error.status_code != 503:
                    raise
                continue
            exports[filename] = {
                'path': f'data/processed/{filename}',
                'version': export.schemaVersion,
                'sha256': self._export_hashes[filename],
            }
        return {**self._provenance, 'characterizationExports': exports}

    def discovery(self) -> CandidateDiscovery:
        with self._lock:
            if self._discovery is None:
                self._discovery = self._read_export('discovered-candidates.v1.json', CandidateDiscovery)
            return self._discovery

    def full_discovery(self) -> CompleteCandidateDiscovery:
        with self._lock:
            if self._full_discovery is None:
                self._full_discovery = self._read_export('discovered-candidates.full.v1.json', CompleteCandidateDiscovery)
            return self._full_discovery

    def environment(self) -> EnvironmentExport:
        with self._lock:
            if self._environment is None:
                self._environment = self._read_export('terrestrial-environment.v1.json', EnvironmentExport)
            return self._environment

    def product_evidence(self) -> ProductEvidenceExport:
        with self._lock:
            if self._product_evidence is None:
                self._product_evidence = self._read_export(PRODUCT_EVIDENCE_FILE, ProductEvidenceExport)
            return self._product_evidence

    def planetary_thermal(self) -> PlanetaryThermalExport:
        with self._lock:
            if self._planetary_thermal is None:
                self._planetary_thermal = self._read_export(PLANETARY_THERMAL_FILE, PlanetaryThermalExport)
            return self._planetary_thermal

    def analog_studies(self) -> StudiesExport:
        with self._lock:
            if self._analog_studies is None:
                self._analog_studies = self._read_export(ANALOG_STUDIES_FILE, StudiesExport)
            return self._analog_studies

    def find(self, collection: str, entity_id: str):
        for item in self.load()[collection]:
            if item['id'] == entity_id:
                return item
        raise HTTPException(404, f'No existe {entity_id} en {collection}.')


@lru_cache
def get_repository():
    return Repository()
