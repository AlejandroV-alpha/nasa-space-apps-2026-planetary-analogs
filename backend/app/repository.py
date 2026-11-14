"""Read an immutable, schema-checked snapshot; API requests never process rasters."""
import json
from functools import lru_cache
from pathlib import Path
from fastapi import HTTPException
from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import ValidationError

ROOT = Path(__file__).resolve().parents[2]


class Repository:
    def __init__(self, root: Path = ROOT):
        self.root = root
        self._dataset = None
        self._provenance = None

    def load(self):
        if self._dataset is not None:
            return self._dataset
        try:
            data = json.loads((self.root / 'frontend/public/data/analogs.v1.json').read_text())
            schema = json.loads((self.root / 'schema/planetary-analogs.schema.json').read_text())
            Draft202012Validator(schema, format_checker=FormatChecker()).validate(data)
            provenance = json.loads((self.root / 'frontend/public/data/analogs.v1.provenance.json').read_text())
        except (OSError, json.JSONDecodeError, ValidationError) as error:
            raise HTTPException(503, 'Catálogo no disponible o inválido. Ejecutar el procesamiento y reiniciar la API.') from error
        self._dataset, self._provenance = data, provenance
        return data

    def provenance(self):
        self.load()
        return self._provenance

    def find(self, collection: str, entity_id: str):
        for item in self.load()[collection]:
            if item['id'] == entity_id:
                return item
        raise HTTPException(404, f'No existe {entity_id} en {collection}.')


@lru_cache
def get_repository():
    return Repository()
