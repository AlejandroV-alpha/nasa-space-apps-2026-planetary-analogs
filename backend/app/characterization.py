"""Contracts and interpretation of additional evidence for discovered windows."""
from typing import Annotated, Literal

from pydantic import BaseModel, Field, FiniteFloat, NonNegativeInt

from .science_exports import (
    Bounds, EnvironmentPeriod, Position, SupplementAvailability, SupplementState,
    WindowPolygon, WindowQuality, WindowReferenceComparison,
)

MissionType = Literal['rover_mobility', 'geological_sampling', 'field_operations']
EvidenceState = Literal['available'] | SupplementState


class CandidatePair(BaseModel):
    windowId: str
    referenceRegionId: str


class ScientificSource(BaseModel):
    id: str
    title: str
    url: str


class ProductCatalogCheck(BaseModel):
    product: str
    version: str
    boundsWgs84: Bounds
    temporal: str | None
    queryUrl: str
    catalogHits: NonNegativeInt
    exampleGranuleId: str | None


class SkinTemperature(BaseModel):
    parameter: Literal['TS']
    quantity: Literal['earth_skin_temperature']
    units: Literal['°C']
    period: EnvironmentPeriod
    requestedCoordinates: Position
    responseCoordinates: Position
    apiVersion: str
    products: list[str]
    aggregation: str
    validDays: NonNegativeInt
    expectedDays: NonNegativeInt
    mean: FiniteFloat
    minDaily: FiniteFloat
    maxDaily: FiniteFloat
    sourceUrl: str
    limitations: list[str]


class SpectralMatch(BaseModel):
    group: Literal[1, 2]
    libraryId: int
    label: str
    pixels: NonNegativeInt


class EmitScene(BaseModel):
    granule: str
    start: str
    end: str
    windowPixels: NonNegativeInt
    geolocatedPixels: NonNegativeInt
    validPixels: NonNegativeInt
    coveragePercent: Annotated[FiniteFloat, Field(ge=0, le=100)]
    sourceHashes: dict[str, str]
    matches: list[SpectralMatch]


class EmitObservations(BaseModel):
    screening: str
    selectedGranule: str
    scenes: list[EmitScene]

    @property
    def selected(self) -> EmitScene | None:
        return next((scene for scene in self.scenes if scene.granule == self.selectedGranule), None)


class ModisLSTPeriod(BaseModel):
    validPixels: NonNegativeInt
    coveragePercent: Annotated[FiniteFloat, Field(ge=0, le=100)]
    mean: FiniteFloat | None
    minimum: FiniteFloat | None
    maximum: FiniteFloat | None
    medianLocalSolarHour: FiniteFloat | None


class ModisObservations(BaseModel):
    granule: str
    sourceSha256: str
    start: str
    end: str
    units: Literal['K']
    windowPixels: NonNegativeInt
    daytime: ModisLSTPeriod
    nighttime: ModisLSTPeriod


class ProductEvidence(BaseModel):
    checkedAt: str
    emit: ProductCatalogCheck
    modis: ProductCatalogCheck
    earthSkinTemperature: SkinTemperature
    emitObservations: EmitObservations | None = None
    modisObservations: ModisObservations | None = None


class MappedUnit(BaseModel):
    code: str
    name: str
    percentOfWindow: Annotated[FiniteFloat, Field(ge=0, le=100)]


class MappedGeology(BaseModel):
    source: ScientificSource
    layer: str
    coveragePercent: Annotated[FiniteFloat, Field(ge=0, le=100)]
    units: list[MappedUnit]
    limitations: list[str]


class LocalizedSpectra(BaseModel):
    source: ScientificSource
    observation: str
    roi: str
    localizedSamples: Annotated[int, Field(gt=0)]
    bounds: Bounds
    mineralGroups: list[str]
    roiArchiveUrl: str
    ddrUrl: str
    sourceHashes: dict[str, str]
    limitations: list[str]


class ProductEvidenceExport(BaseModel):
    schemaVersion: Literal['1.0.0']
    windows: dict[str, ProductEvidence]
    mappedGeology: dict[str, MappedGeology] = Field(default_factory=dict)
    localizedSpectra: dict[str, LocalizedSpectra] = Field(default_factory=dict)


def common_mineral_families(
    product: ProductEvidence | None, spectra: LocalizedSpectra | None,
) -> list[str]:
    emit = product.emitObservations.selected if product and product.emitObservations else None
    if spectra and emit and 'carbonatos' in spectra.mineralGroups and any(
        match.label.lower().startswith(('calcite ', 'dolomite ')) for match in emit.matches
    ):
        return ['carbonatos']
    return []


def supplement_availability(
    reference_id: str, product: ProductEvidence | None, has_planetary_thermal: bool,
    spectra: LocalizedSpectra | None = None,
) -> SupplementAvailability:
    emit = product.emitObservations.selected if product and product.emitObservations else None
    if common_mineral_families(product, spectra):
        geology = 'qualitative'
    elif emit and emit.validPixels:
        geology = 'context_only'
    elif product is not None and product.emit.catalogHits > 0:
        geology = 'catalogued'
    elif reference_id == 'jezero-sector':
        geology = 'context_only'
    else:
        geology = 'not_evaluated'
    return SupplementAvailability(
        geology=geology, thermal='context_only' if product is not None or has_planetary_thermal else 'not_evaluated',
    )


class RegionalGeology(BaseModel):
    observation: str
    source: ScientificSource


class GeologySide(BaseModel):
    minerals: list[str] = Field(default_factory=list)
    source: ScientificSource | None = None
    coveragePercent: Annotated[FiniteFloat | None, Field(ge=0, le=100)] = None
    catalogCheck: ProductCatalogCheck | None = None
    regionalContext: RegionalGeology | None = None
    mappedGeology: MappedGeology | None = None
    emitObservations: EmitObservations | None = None
    localizedSpectra: LocalizedSpectra | None = None


class GeologyComparison(BaseModel):
    commonMinerals: list[str] = Field(default_factory=list)
    interpretation: str | None = None
    limitations: list[str]


class GeologyResponse(CandidatePair):
    status: Literal['unavailable', 'qualitative']
    earth: GeologySide
    planetary: GeologySide
    comparison: GeologyComparison


class PlanetaryThermalContext(BaseModel):
    sourceId: str
    product: str
    sourceUrl: str
    labelUrl: str
    sourceSha256: str
    selection: str
    quantity: Literal['modeled_annual_maximum_surface_temperature', 'blackbody_equivalent_radiometric_temperature']
    summary: str
    units: Literal['K']
    samples: Annotated[int, Field(gt=0)]
    median: FiniteFloat
    minimum: FiniteFloat
    maximum: FiniteFloat
    coordinates: Position | None = None
    locationSourceUrl: str | None = None
    limitations: list[str]


class PlanetaryThermalExport(BaseModel):
    schemaVersion: Literal['1.0.0']
    references: dict[str, PlanetaryThermalContext]


class ThermalSide(BaseModel):
    surfaceTemperature: SkinTemperature | PlanetaryThermalContext | None = None
    daytime: FiniteFloat | None = None
    nighttime: FiniteFloat | None = None
    source: ScientificSource | None = None
    catalogCheck: ProductCatalogCheck | None = None
    modisObservations: ModisObservations | None = None


class ThermalComparison(BaseModel):
    comparable: bool
    differenceK: FiniteFloat | None = None
    reason: str


class ThermalResponse(CandidatePair):
    status: Literal['unavailable', 'context_only', 'available']
    earth: ThermalSide
    planetary: ThermalSide
    comparison: ThermalComparison
    candidateSources: list[ScientificSource]


class Application(BaseModel):
    type: MissionType
    status: Literal['potential', 'insufficient_evidence']
    description: str
    supportingMetrics: list[str]
    missingEvidence: list[str]
    validatedForOperations: Literal[False] = False


class ApplicationsResponse(CandidatePair):
    applications: list[Application]


class EvidenceDimension(BaseModel):
    status: EvidenceState
    sourceIds: list[str]
    quality: dict[int, WindowQuality] | None = None


class EvidenceDimensions(BaseModel):
    topography: EvidenceDimension
    geology: EvidenceDimension
    thermal: EvidenceDimension


class ScientificReview(BaseModel):
    status: Literal['pending'] = 'pending'


class StudySummary(BaseModel):
    id: str
    title: str


class EvidenceResponse(CandidatePair):
    dimensions: EvidenceDimensions
    scientificReview: ScientificReview
    relatedStudies: list[StudySummary] = Field(default_factory=list)
    sources: list[ScientificSource]
    limitations: list[str]


class StudyDefinition(CandidatePair):
    id: str
    title: str
    researchQuestion: str
    reviewStatus: Literal['pending']
    limitations: list[str]


class StudiesExport(BaseModel):
    schemaVersion: Literal['1.0.0']
    studies: list[StudyDefinition]


class StudyResponse(StudyDefinition):
    geometry: WindowPolygon
    center: Position
    terrainResults: WindowReferenceComparison
    geologyResults: GeologyResponse
    thermalResults: ThermalResponse
    potentialApplications: list[Application]
    sources: list[ScientificSource]


APPLICATION_RULES = (
    ('rover_mobility', ['surface_bearing_strength', 'obstacle_distribution', 'rover_specific_limits'],
     'El relieve regional permite plantear ensayos preliminares de planificación de rutas y navegación en pendientes.'),
    ('geological_sampling', ['verified_surface_materials', 'sampling_access'],
     'La selección para ensayos de muestreo requiere evidencia mineralógica localizada y revisión del terreno.'),
    ('field_operations', ['site_access', 'permits', 'local_hazards'],
     'Las variaciones de relieve pueden orientar la planificación de recorridos y procedimientos de campo.'),
)


def candidate_applications(
    terrain: WindowReferenceComparison, mission_type: MissionType | None,
) -> list[Application]:
    calculated = [
        metric.key for metric in terrain.comparison.metrics
        if metric.candidateValue is not None and metric.referenceValue is not None
        and metric.signedDifference is not None
    ]
    applications = []
    for kind, missing, description in APPLICATION_RULES:
        if mission_type is not None and kind != mission_type:
            continue
        enough = kind != 'geological_sampling' and terrain.comparison.distance is not None and bool(calculated)
        applications.append(Application(
            type=kind,
            status='potential' if enough else 'insufficient_evidence',
            description=description if enough or kind == 'geological_sampling'
            else 'Faltan indicadores topográficos comparables para proponer esta aplicación.',
            supportingMetrics=calculated if enough else [],
            missingEvidence=missing if enough or kind == 'geological_sampling'
            else ['comparable_regional_topography', *missing],
        ))
    return applications
