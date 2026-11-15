"""Contracts for the versioned outputs of the scientific pipeline."""
from typing import Literal

from pydantic import BaseModel, FiniteFloat, NonNegativeInt

Position = tuple[FiniteFloat, FiniteFloat]
Bounds = tuple[FiniteFloat, FiniteFloat, FiniteFloat, FiniteFloat]
Body = Literal['moon', 'mars']


class SearchTile(BaseModel):
    tileId: str
    url: str
    sha256: str


class SkippedTile(BaseModel):
    tileId: str
    reason: str


class SearchCoverage(BaseModel):
    boundsWgs84: Bounds | None
    windowSideM: int
    centerSpacingM: int
    measuredWindows: NonNegativeInt
    tiles: list[SearchTile]
    skippedTiles: list[SkippedTile]


class DiscoveryMethod(BaseModel):
    distance: str
    ordering: str
    limitations: list[str]


class Reference(BaseModel):
    id: str
    name: str
    body: Body


class WindowQuality(BaseModel):
    totalCells: NonNegativeInt
    finiteHeightCells: NonNegativeInt
    finiteSlopeCells: NonNegativeInt
    validHeightCellFraction: FiniteFloat
    validSlopeCellFraction: FiniteFloat
    coverageMeaning: str


class WindowMetric(BaseModel):
    key: str
    unit: str
    candidateValue: FiniteFloat | None
    referenceValue: FiniteFloat | None
    signedDifference: FiniteFloat | None
    meaning: str


class WindowComparison(BaseModel):
    analysisScaleM: int
    metrics: list[WindowMetric]
    distance: FiniteFloat | None


class WindowSensitivity(WindowComparison):
    quality: WindowQuality


class WindowProperties(BaseModel):
    center: Position
    tileId: str
    quality: WindowQuality
    comparison: WindowComparison
    sensitivity: WindowSensitivity


class WindowPolygon(BaseModel):
    type: Literal['Polygon']
    coordinates: list[list[Position]]


class DiscoveredWindow(BaseModel):
    type: Literal['Feature']
    id: str
    geometry: WindowPolygon
    properties: WindowProperties


class DiscoveredWindows(BaseModel):
    type: Literal['FeatureCollection']
    reference: Reference
    comparableWindows: NonNegativeInt
    features: list[DiscoveredWindow]


class CandidateDiscovery(BaseModel):
    schemaVersion: Literal['1.0.0']
    search: SearchCoverage
    method: DiscoveryMethod
    results: list[DiscoveredWindows]


class EnvironmentPeriod(BaseModel):
    start: str
    end: str
    timeStandard: str


class EnvironmentalVariable(BaseModel):
    label: str
    unit: str
    validDays: NonNegativeInt
    mean: FiniteFloat | None
    daily: dict[str, FiniteFloat | None]


class SiteEnvironment(BaseModel):
    siteId: str
    requestedCoordinates: Position
    responseCoordinates: Position
    requestUrl: str
    apiVersion: str
    products: list[str]
    variables: dict[str, EnvironmentalVariable]


class EnvironmentMetadata(BaseModel):
    schemaVersion: Literal['1.0.0']
    source: str
    sourceUrl: str
    retrievedAt: str
    period: EnvironmentPeriod
    limitations: list[str]


class EnvironmentExport(EnvironmentMetadata):
    sites: list[SiteEnvironment]


class SiteEnvironmentResponse(EnvironmentMetadata):
    site: SiteEnvironment
