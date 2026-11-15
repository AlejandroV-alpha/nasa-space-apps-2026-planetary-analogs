"""Read-only routes for scientific evidence, potential applications and curated studies."""
from dataclasses import dataclass
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from .candidate_search import window_detail
from .characterization import (
    ApplicationsResponse, CandidatePair, EvidenceDimension, EvidenceDimensions, EvidenceResponse,
    GeologyComparison, GeologyResponse, GeologySide, LocalizedSpectra, MappedGeology, MissionType, PlanetaryThermalContext,
    ProductEvidence,
    RegionalGeology, ScientificReview, ScientificSource, StudyResponse, StudySummary, ThermalComparison,
    ThermalResponse, ThermalSide, candidate_applications, common_mineral_families, supplement_availability,
)
from .repository import Repository, get_repository
from .science_exports import DiscoveredWindowDetail, WindowReferenceComparison

router = APIRouter(prefix='/api/v1', tags=['Ciencia'])
Repo = Annotated[Repository, Depends(get_repository)]
ReferenceId = Annotated[str, Query(min_length=1)]
WINDOW_ROUTE = '/discovered-candidates/{window_id}'

EMIT = ScientificSource(
    id='emit-l2bmin-001', title='NASA EMIT L2B Estimated Mineral Identification V001',
    url='https://doi.org/10.5067/EMIT/EMITL2BMIN.001',
)
MODIS = ScientificSource(
    id='modis-mod11a2-061', title='NASA MODIS Terra MOD11A2 V061',
    url='https://doi.org/10.5067/MODIS/MOD11A2.061',
)
CRISM = ScientificSource(
    id='crism-jezero-regional', title='NASA/JPL CRISM y CTX: minerales en Jezero',
    url='https://science.nasa.gov/resource/jezero-crater-minerals/',
)
THERMAL_PRODUCTS = {
    'moon': ScientificSource(
        id='lro-diviner-prp', title='NASA PDS LRO Diviner Polar Resource Products',
        url='https://pds-geosciences.wustl.edu/missions/lro/diviner.htm',
    ),
    'mars': ScientificSource(
        id='odyssey-themis', title='NASA PDS Mars Odyssey THEMIS',
        url='https://pds-geosciences.wustl.edu/missions/odyssey/themis.html',
    ),
}
POWER_TS_ID = 'nasa-power-merra2-ts'


@dataclass
class WindowScope:
    window: DiscoveredWindowDetail
    terrain: WindowReferenceComparison
    reference_source_ids: list[str]

    @property
    def pair(self) -> CandidatePair:
        return CandidatePair(windowId=self.window.id, referenceRegionId=self.terrain.reference.id)


def scoped_window(repo: Repository, window_id: str, reference_id: str) -> WindowScope:
    reference = repo.find('referenceRegions', reference_id)
    window = window_detail(repo.full_discovery(), window_id)
    if window is None:
        raise HTTPException(404, f'No existe la ventana {window_id}.')
    terrain = next((item for item in window.comparisons if item.reference.id == reference_id), None)
    if terrain is None:
        raise HTTPException(404, 'No hay comparación publicada para esa ventana y referencia.')
    return WindowScope(
        window=window,
        terrain=terrain,
        reference_source_ids=sorted({
            source_id for metric in reference['metrics'] for source_id in metric['sourceIds']
        }),
    )


def geology_response(
    scope: WindowScope, products: ProductEvidence | None, mapped: MappedGeology | None,
    spectra: LocalizedSpectra | None,
) -> GeologyResponse:
    regional = None
    if scope.terrain.reference.id == 'jezero-sector':
        regional = RegionalGeology(
            source=CRISM,
            observation='NASA documenta olivino y carbonatos en sectores de Jezero. '
                        'La publicación se usa como contexto regional.',
        )
    observations = products.emitObservations if products else None
    scene = observations.selected if observations else None
    families = common_mineral_families(products, spectra)
    return GeologyResponse(
        **scope.pair.model_dump(),
        status='qualitative' if families else 'unavailable',
        earth=GeologySide(
            catalogCheck=products.emit if products else None,
            emitObservations=observations,
            coveragePercent=scene.coveragePercent if scene else None,
            source=EMIT if scene and scene.validPixels else None,
            minerals=list(dict.fromkeys(match.label for match in scene.matches)) if scene else [],
        ),
        planetary=GeologySide(
            regionalContext=regional, mappedGeology=mapped, localizedSpectra=spectra,
            source=spectra.source if spectra else None,
            minerals=spectra.mineralGroups if spectra else [],
        ),
        comparison=GeologyComparison(
            commonMinerals=families,
            interpretation=(
                'EMIT y la muestra CRISM publicada presentan evidencia compatible con la familia de los '
                'carbonatos. La coincidencia es cualitativa y queda limitada a las áreas observadas.'
                if families else None
            ),
            limitations=[
                'Los conteos EMIT corresponden a píxeles que pasaron el filtro, con etiquetas de una biblioteca espectral.',
                'La cobertura EMIT publicada corresponde al polígono en una escena concreta.',
                'La comparación espectral por familias deja pendiente la verificación de especies y abundancias.',
                *(spectra.limitations if spectra else []),
            ],
        ),
    )


def thermal_response(
    scope: WindowScope, products: ProductEvidence | None, planetary: PlanetaryThermalContext | None,
) -> ThermalResponse:
    skin = products.earthSkinTemperature if products else None
    modis = products.modisObservations if products else None
    return ThermalResponse(
        **scope.pair.model_dump(),
        status='context_only' if skin or planetary else 'unavailable',
        earth=ThermalSide(
            surfaceTemperature=skin,
            daytime=modis.daytime.mean if modis else None,
            nighttime=modis.nighttime.mean if modis else None,
            modisObservations=modis,
            source=ScientificSource(id=POWER_TS_ID, title='NASA POWER / MERRA-2 — Earth Skin Temperature', url=skin.sourceUrl)
            if skin else None,
            catalogCheck=products.modis if products else None,
        ),
        planetary=ThermalSide(
            surfaceTemperature=planetary,
            source=ScientificSource(id=planetary.sourceId, title=planetary.product, url=planetary.sourceUrl)
            if planetary else None,
        ),
        comparison=ThermalComparison(
            comparable=False,
            reason='Los productos disponibles tienen magnitudes, escalas espaciales o condiciones temporales '
                   'distintas. Se requiere armonizarlas antes de calcular una diferencia entre mundos.',
        ),
        candidateSources=[MODIS, THERMAL_PRODUCTS[scope.terrain.reference.body]],
    )


def evidence_response(
    repo: Repository, scope: WindowScope, products: ProductEvidence | None,
    planetary: PlanetaryThermalContext | None, mapped: MappedGeology | None,
    spectra: LocalizedSpectra | None,
) -> EvidenceResponse:
    geology = geology_response(scope, products, mapped, spectra)
    thermal = thermal_response(scope, products, planetary)
    topography_ids = ['nasadem', *scope.reference_source_ids]
    sources = [
        ScientificSource(id=source['id'], title=source['product'], url=source['url'])
        for source in (repo.find('sources', source_id) for source_id in topography_ids)
    ]
    availability = supplement_availability(scope.terrain.reference.id, products, planetary is not None, spectra)
    geology_ids = []
    if products:
        sources.append(EMIT)
        geology_ids.append(EMIT.id)
    if geology.planetary.regionalContext:
        sources.append(geology.planetary.regionalContext.source)
        geology_ids.append(geology.planetary.regionalContext.source.id)
    if mapped:
        sources.append(mapped.source)
        geology_ids.append(mapped.source.id)
    if spectra:
        sources.append(spectra.source)
        geology_ids.append(spectra.source.id)
    thermal_ids = []
    if thermal.earth.source:
        sources.extend([thermal.earth.source, MODIS])
        thermal_ids.extend([thermal.earth.source.id, MODIS.id])
    if thermal.planetary.source:
        sources.append(thermal.planetary.source)
        thermal_ids.append(thermal.planetary.source.id)
    return EvidenceResponse(
        **scope.pair.model_dump(),
        dimensions=EvidenceDimensions(
            topography=EvidenceDimension(
                status='available' if scope.terrain.comparison.distance is not None else 'not_evaluated',
                sourceIds=topography_ids,
                quality={
                    scope.terrain.comparison.analysisScaleM: scope.window.quality,
                    scope.terrain.sensitivity.analysisScaleM: scope.terrain.sensitivity.quality,
                },
            ),
            geology=EvidenceDimension(status=availability.geology, sourceIds=geology_ids),
            thermal=EvidenceDimension(status=availability.thermal, sourceIds=thermal_ids),
        ),
        scientificReview=ScientificReview(),
        sources=sources,
        limitations=[
            *repo.full_discovery().method.limitations,
            *geology.comparison.limitations,
            thermal.comparison.reason,
        ],
    )


@router.get(WINDOW_ROUTE + '/geology', summary='Consultar evidencia geológica por ventana')
def geology(window_id: str, reference_region_id: ReferenceId, repo: Repo) -> GeologyResponse:
    scope = scoped_window(repo, window_id, reference_region_id)
    products = repo.product_evidence()
    return geology_response(
        scope, products.windows.get(window_id),
        products.mappedGeology.get(reference_region_id), products.localizedSpectra.get(reference_region_id),
    )


@router.get(WINDOW_ROUTE + '/applications', summary='Consultar ensayos potenciales y su fundamento')
def applications(
    window_id: str, reference_region_id: ReferenceId, repo: Repo, mission_type: MissionType | None = None,
) -> ApplicationsResponse:
    scope = scoped_window(repo, window_id, reference_region_id)
    return ApplicationsResponse(**scope.pair.model_dump(), applications=candidate_applications(scope.terrain, mission_type))


@router.get(WINDOW_ROUTE + '/evidence', summary='Consultar fuentes, calidad y limitaciones por ventana')
def evidence(window_id: str, reference_region_id: ReferenceId, repo: Repo) -> EvidenceResponse:
    scope = scoped_window(repo, window_id, reference_region_id)
    products = repo.product_evidence()
    result = evidence_response(
        repo, scope, products.windows.get(window_id),
        repo.planetary_thermal().references.get(reference_region_id),
        products.mappedGeology.get(reference_region_id),
        products.localizedSpectra.get(reference_region_id),
    )
    try:
        studies = repo.analog_studies().studies
    except HTTPException as error:
        if error.status_code != 503:
            raise
        return result
    return result.model_copy(update={'relatedStudies': [
        StudySummary(id=study.id, title=study.title)
        for study in studies
        if study.windowId == window_id and study.referenceRegionId == reference_region_id
    ]})


@router.get(WINDOW_ROUTE + '/thermal', summary='Consultar información térmica y compatibilidad de la comparación')
def thermal(window_id: str, reference_region_id: ReferenceId, repo: Repo) -> ThermalResponse:
    scope = scoped_window(repo, window_id, reference_region_id)
    return thermal_response(
        scope, repo.product_evidence().windows.get(window_id),
        repo.planetary_thermal().references.get(reference_region_id),
    )


@router.get('/analog-studies/{study_id}', summary='Consultar un caso de estudio científico publicado')
def analog_study(study_id: str, repo: Repo) -> StudyResponse:
    study = next((study for study in repo.analog_studies().studies if study.id == study_id), None)
    if study is None:
        raise HTTPException(404, f'No existe el estudio {study_id}.')
    scope = scoped_window(repo, study.windowId, study.referenceRegionId)
    evidence = repo.product_evidence()
    products = evidence.windows.get(study.windowId)
    mapped = evidence.mappedGeology.get(study.referenceRegionId)
    spectra = evidence.localizedSpectra.get(study.referenceRegionId)
    planetary = repo.planetary_thermal().references.get(study.referenceRegionId)
    return StudyResponse(
        **study.model_dump(),
        geometry=scope.window.geometry,
        center=scope.window.center,
        terrainResults=scope.terrain,
        geologyResults=geology_response(scope, products, mapped, spectra),
        thermalResults=thermal_response(scope, products, planetary),
        potentialApplications=candidate_applications(scope.terrain, None),
        sources=evidence_response(repo, scope, products, planetary, mapped, spectra).sources,
    )
