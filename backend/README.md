# Backend · Planetary Analogs

FastAPI sirve los resultados científicos y permite filtrar sitios y comparar candidatos. El procesamiento de NASADEM, LOLA y MOLA pertenece a `backend/processing/` y se ejecuta por lotes, fuera de las peticiones HTTP.

## Instalar y levantar la API

Desde la raíz del repositorio (Python 3.14 utilizado en esta entrega):

```bash
python -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
backend/.venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

En Windows (PowerShell), desde la raíz:

```powershell
python -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\backend\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

- [Documentación interactiva Swagger](http://localhost:8000/docs)
- [Catálogo completo](http://localhost:8000/api/v1/catalog)
- [Estado](http://localhost:8000/health)
- [Endpoints y objetivos](../docs/backend-endpoints.md)

La API puede arrancar con los resultados versionados, sin descargar rásteres ni instalar los paquetes GIS. Los primeros datos se cargan y validan contra JSON Schema al consultarlos. Se conserva un snapshot en memoria; reiniciar la API después de regenerar datos para servir una entrega coherente.

Las rutas de descubrimiento y contexto ambiental leen y validan bajo demanda `data/processed/discovered-candidates.v1.json` y `data/processed/terrestrial-environment.v1.json`. Si una exportación falta o es inválida, la ruta correspondiente devuelve `503` y el catálogo sigue disponible. Los comandos que producen estas salidas están en la [guía de procesamiento](../processing/README.md).

## Ejecutar todo el procesamiento

```bash
backend/.venv/bin/pip install -r backend/processing/requirements.txt
cd frontend
npm ci
cd ..
backend/.venv/bin/python -m backend.process --offline
```

`--offline` utiliza los originales ya descargados en `data/raw/`. Si no existen, ejecutar sin esa opción para descargarlos:

```bash
backend/.venv/bin/python -m backend.process
```

El flujo ejecuta, en orden y deteniéndose ante un error:

1. `backend/processing/pipeline.py`: descarga/recortes, proyecciones, métricas a 1 y 2 km y catálogo científico.
2. `validate_catalog.py`: comprobaciones científicas y hashes.
3. `render_quality.py`: figura de control.
4. `write_report.py`: fichas científicas.
5. `export_frontend.py`: contrato para la aplicación y procedencia.
6. Comprobación de exportación y validador Node del contrato, sin fixtures.

Solo reexportar el catálogo versionado, sin paquetes GIS ni descargas:

```bash
backend/.venv/bin/python -m backend.process --export-only
```

Este último comando también necesita Node y las dependencias de validación del frontend (`npm ci`). Las salidas siguen en `data/processed/`, `docs/` y `frontend/public/data/`. Hay una única implementación de los cálculos: los archivos antiguos de `processing/` son entradas de compatibilidad.

## API y Angular

Angular utiliza FastAPI para el catálogo, las comparaciones y la procedencia. En desarrollo, el proxy de Angular reenvía `/api/**` al puerto 8000. Para publicar la web, consulta [la configuración de la URL HTTPS](../frontend/README.md#connect-a-deployed-frontend-to-fastapi).

CORS permite por defecto `http://localhost:4200` y `http://127.0.0.1:4200`. Para otro origen, configurar `CORS_ORIGINS` como lista separada por comas antes de arrancar.

## Pruebas

Las pruebas de API usan los JSON versionados y solo requieren las dependencias del backend:

```bash
backend/.venv/bin/pip install -r backend/requirements-dev.txt
backend/.venv/bin/python -m pytest backend/tests -q
```

```powershell
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
.\backend\.venv\Scripts\python.exe -m pytest backend/tests -q
```

Para incluir también las pruebas científicas:

```bash
backend/.venv/bin/pip install -r backend/processing/requirements.txt
backend/.venv/bin/python -m pytest backend/tests processing/tests -q
```

La API no ejecuta procesos pesados al leer un endpoint y no expone una operación HTTP para modificar o recalcular el catálogo. El recálculo se inicia con el comando por lotes anterior. Los datos siguen en estado `draft`, pendientes de revisión científica independiente.
