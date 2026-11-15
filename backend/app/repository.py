"""Read an immutable, schema-checked snapshot; API requests never process rasters."""
import json
from functools import lru_cache
from pathlib import Path
from threading import Lock
from typing import TypeVar

from fastapi import HTTPException
from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import ValidationError
from pydantic import BaseModel

from .science_exports import CandidateDiscovery, CompleteCandidateDiscovery, EnvironmentExport

ROOT = Path(__file__).resolve().parents[2]
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
            return model.model_validate_json(path.read_bytes(), strict=True)
        except (OSError, ValueError) as error:
            raise HTTPException(
                503, f'Exportación científica no disponible o inválida: {filename}. Regenerar la salida y reiniciar la API.'
            ) from error

    def provenance(self):
        self.load()
        return self._provenance

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

    def find(self, collection: str, entity_id: str):
        for item in self.load()[collection]:
            if item['id'] == entity_id:
                return item
        raise HTTPException(404, f'No existe {entity_id} en {collection}.')


@lru_cache
def get_repository():
    return Repository()
