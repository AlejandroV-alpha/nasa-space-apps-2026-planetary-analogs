"""HTTP access to computed planetary analog data; see /docs for the API contract."""
from collections.abc import Callable
import os
from typing import Annotated
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from .candidate_search import measured_coverage, search_candidates, window_detail
from .repository import Repository, get_repository
from .science_exports import (
    Body, CandidateDiscovery, CandidateSearchResult, DatasetAvailability, DiscoveredWindowDetail,
    MeasuredCoverage, ScienceStatus, SiteEnvironmentResponse,
)

Repo = Annotated[Repository, Depends(get_repository)]


class ComparisonRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reference_region_id: str = Field(min_length=1, examples=['jezero-sector'])
    site_ids: list[str] = Field(min_length=2, max_length=3, examples=[['siloli-sector', 'coipasa-sector']])


def availability(*loaders: Callable[[], object]) -> DatasetAvailability:
    try:
        for load in loaders:
            load()
    except HTTPException as error:
        if error.status_code != 503:
            raise
        return DatasetAvailability(status='unavailable', detail=str(error.detail))
    return DatasetAvailability(status='available')


def create_app() -> FastAPI:
    api = FastAPI(title='Planetary Analogs API', version='1.0.0',
        description='Catálogo científico exploratorio. Indicadores calculados; validación de analogía pendiente. Procesamiento por lotes desde backend/process.py.')
    origins = [value.strip() for value in os.getenv('CORS_ORIGINS', 'http://localhost:4200,http://127.0.0.1:4200').split(',') if value.strip()]
    api.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])

    @api.get('/health', tags=['Estado'], summary='Comprobar servidor y disponibilidad del catálogo')
    def health(repo: Repo):
        data = repo.load()
        return {'status':'ok', 'dataset_status':data['status'], 'schema_version':data['schemaVersion'],
                'sites':len(data['sites']), 'reference_regions':len(data['referenceRegions'])}

    @api.get('/api/v1/catalog', tags=['Catálogo'], summary='Obtener el contrato completo que puede consumir Angular')
    def catalog(repo: Repo):
        return repo.load()

    @api.get('/api/v1/provenance', tags=['Ciencia'], summary='Consultar fuentes, hashes y sensibilidad a 2 km')
    def provenance(repo: Repo):
        return repo.provenance()

    @api.get(
        '/api/v1/discovered-candidates', tags=['Ciencia'],
        summary='Consultar ventanas terrestres detectadas y sus comparaciones precalculadas',
        responses={404: {'description': 'Referencia planetaria desconocida'},
                   503: {'description': 'Exportación científica ausente o inválida'}},
    )
    def discovered_candidates(repo: Repo, reference_region_id: str | None = None) -> CandidateDiscovery:
        if reference_region_id is not None:
            repo.find('referenceRegions', reference_region_id)
        discovery = repo.discovery()
        if reference_region_id is None:
            return discovery
        results = [result for result in discovery.results if result.reference.id == reference_region_id]
        return discovery.model_copy(update={'results': results})

    @api.get(
        '/api/v1/discovered-candidates/search', tags=['Ciencia'],
        summary='Ordenar candidatos medidos por similitud topográfica dentro de un área',
        responses={404: {'description': 'Referencia planetaria desconocida'},
                   503: {'description': 'Exportación científica completa ausente o inválida'}},
    )
    def search_discovered_candidates(
        repo: Repo,
        west: Annotated[float, Query(ge=-180, le=180)],
        south: Annotated[float, Query(ge=-90, le=90)],
        east: Annotated[float, Query(ge=-180, le=180)],
        north: Annotated[float, Query(ge=-90, le=90)],
        reference_region_id: str | None = None,
        limit: Annotated[int, Query(ge=1)] = 5,
    ) -> CandidateSearchResult:
        if west >= east or south >= north:
            raise HTTPException(422, 'Usa oeste < este y sur < norte dentro de WGS84, sin cruzar el antimeridiano.')
        if reference_region_id is not None:
            repo.find('referenceRegions', reference_region_id)
        discovery = repo.full_discovery()
        return search_candidates(discovery, (west, south, east, north), reference_region_id, limit)

    @api.get(
        '/api/v1/discovered-candidates/{window_id}', tags=['Ciencia'],
        summary='Consultar la ventana medida y sus comparaciones con Luna y Marte',
        responses={404: {'description': 'Ventana desconocida'},
                   503: {'description': 'Exportación científica completa ausente o inválida'}},
    )
    def discovered_candidate(window_id: str, repo: Repo) -> DiscoveredWindowDetail:
        detail = window_detail(repo.full_discovery(), window_id)
        if detail is None:
            raise HTTPException(404, f'No existe la ventana {window_id}.')
        return detail

    @api.get(
        '/api/v1/discovery-coverage', tags=['Ciencia'],
        summary='Obtener las huellas de todas las ventanas terrestres medidas',
        responses={503: {'description': 'Exportación científica completa ausente o inválida'}},
    )
    def discovery_coverage(repo: Repo) -> MeasuredCoverage:
        return measured_coverage(repo.full_discovery())

    @api.get('/api/v1/science-status', tags=['Ciencia'], summary='Consultar disponibilidad de los datos científicos')
    def science_status(repo: Repo) -> ScienceStatus:
        return ScienceStatus(
            catalog=availability(repo.load),
            discovery=availability(repo.discovery, repo.full_discovery),
            environment=availability(repo.environment),
        )

    @api.get('/api/v1/sites', tags=['Sitios'], summary='Listar y filtrar candidatos terrestres')
    def sites(repo: Repo, target_body: Body | None = None,
              country: Annotated[str | None, Query(pattern='^[A-Z]{2}$')] = None,
              reference_region_id: str | None = None):
        if reference_region_id:
            repo.find('referenceRegions', reference_region_id)
        items = repo.load()['sites']
        items = [s for s in items if (not country or s['country'] == country) and
                 any((not target_body or a['targetBody'] == target_body) and
                     (not reference_region_id or a['referenceRegionId'] == reference_region_id)
                     for a in s['assessments'])]
        return {'total':len(items), 'items':items}

    @api.get('/api/v1/sites/{site_id}', tags=['Sitios'], summary='Obtener la ficha completa de un candidato')
    def site(site_id: str, repo: Repo):
        return repo.find('sites', site_id)

    @api.get(
        '/api/v1/sites/{site_id}/environment', tags=['Sitios'],
        summary='Consultar el contexto ambiental terrestre histórico de un candidato',
        responses={404: {'description': 'Sitio desconocido o sin datos ambientales publicados'},
                   503: {'description': 'Exportación científica ausente o inválida'}},
    )
    def site_environment(site_id: str, repo: Repo) -> SiteEnvironmentResponse:
        repo.find('sites', site_id)
        environment = repo.environment()
        for site_data in environment.sites:
            if site_data.siteId == site_id:
                return SiteEnvironmentResponse(site=site_data, **environment.model_dump(exclude={'sites'}))
        raise HTTPException(404, f'No hay datos ambientales publicados para {site_id}.')

    @api.get('/api/v1/reference-regions', tags=['Referencias'], summary='Listar regiones de la Luna y Marte')
    def references(repo: Repo, target_body: Body | None = None):
        items = [r for r in repo.load()['referenceRegions'] if not target_body or r['targetBody'] == target_body]
        return {'total':len(items), 'items':items}

    @api.get('/api/v1/reference-regions/{region_id}', tags=['Referencias'], summary='Consultar una región planetaria y sus métricas')
    def reference(region_id: str, repo: Repo):
        return repo.find('referenceRegions', region_id)

    @api.get('/api/v1/sources', tags=['Ciencia'], summary='Consultar productos, versiones, atribución y marcos de referencia')
    def sources(repo: Repo):
        items = repo.load()['sources']
        return {'total':len(items), 'items':items}

    @api.get('/api/v1/methods', tags=['Ciencia'], summary='Explicar cómo se calcularon las métricas')
    def methods(repo: Repo):
        items = repo.load()['methods']
        return {'total':len(items), 'items':items}

    @api.get('/api/v1/geojson/sites', tags=['Mapa'], summary='Obtener puntos terrestres para MapLibre')
    def geojson(repo: Repo, target_body: Body | None = None):
        items = sites(repo, target_body=target_body)
        return {'type':'FeatureCollection', 'features':[
            {'type':'Feature', 'id':s['id'], 'geometry':s['geometry'],
             'properties':{'id':s['id'], 'name':s['name'], 'country':s['country'], 'evidenceStatus':s['evidenceStatus']}}
            for s in items['items']]}

    @api.post('/api/v1/compare', tags=['Comparación'], summary='Contrastar 2–3 candidatos frente a una referencia explícita')
    def compare(request: ComparisonRequest, repo: Repo):
        if len(set(request.site_ids)) != len(request.site_ids):
            raise HTTPException(422, 'Los candidatos deben ser diferentes.')
        region = repo.find('referenceRegions', request.reference_region_id)
        candidates = [repo.find('sites', item) for item in request.site_ids]
        if any(not any(a['referenceRegionId'] == region['id'] for a in s['assessments']) for s in candidates):
            raise HTTPException(422, 'Todos los candidatos deben estar evaluados contra la misma región seleccionada.')
        keys = list(dict.fromkeys(m['key'] for e in [region, *candidates] for m in e['metrics']))
        rows = []
        for key in keys:
            metrics = [next((m for m in e['metrics'] if m['key'] == key), None) for e in [region, *candidates]]
            compatible = all(m is not None and m['value'] is not None and m['status'] == 'computed' for m in metrics)
            if compatible:
                compatible = all(len({m[field] for m in metrics}) == 1 for field in ['unit','methodId','analysisScaleM'])
            rows.append({'key':key, 'reference':metrics[0], 'sites':metrics[1:], 'comparable':compatible,
                'signed_differences':[round(m['value'] - metrics[0]['value'],4) for m in metrics[1:]] if compatible else [None]*len(candidates),
                'reason':None if compatible else 'Faltan mediciones calculadas o no coinciden unidad, método y escala.'})
        return {'reference_region_id':region['id'], 'site_ids':request.site_ids, 'rows':rows,
            'dataset_status':repo.load()['status'], 'notice':'Diferencias descriptivas, no ranking ni probabilidad de similitud. Revisión científica pendiente.'}

    return api


app = create_app()
