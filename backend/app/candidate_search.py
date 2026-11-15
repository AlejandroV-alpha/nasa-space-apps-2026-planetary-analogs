"""Query and rank measured footprints within a WGS84 rectangle."""
from .science_exports import (
    Bounds, CandidateDiscovery, CandidateSearchResult, DiscoveredWindowDetail,
    MeasuredCoverage, MeasuredFootprint, Position, WindowReferenceComparison,
)


def inside(position: Position, bounds: Bounds) -> bool:
    x, y = position
    west, south, east, north = bounds
    return west <= x <= east and south <= y <= north


def clip_edge(points: list[Position], axis: int, edge: float, direction: int) -> list[Position]:
    """Clip the exterior ring to a single side of the rectangle."""
    if not points:
        return []
    clipped = []
    previous = points[-1]
    was_inside = direction * (previous[axis] - edge) >= 0
    for point in points:
        is_inside = direction * (point[axis] - edge) >= 0
        if is_inside != was_inside:
            fraction = (edge - previous[axis]) / (point[axis] - previous[axis])
            other = 1 - axis
            cross = previous[other] + fraction * (point[other] - previous[other])
            clipped.append((edge, cross) if axis == 0 else (cross, edge))
        if is_inside:
            clipped.append(point)
        previous, was_inside = point, is_inside
    return clipped


def overlaps_area(ring: list[Position], bounds: Bounds) -> bool:
    west, south, east, north = bounds
    points = ring
    for axis, edge, direction in ((0, west, 1), (0, east, -1), (1, south, 1), (1, north, -1)):
        points = clip_edge(points, axis, edge, direction)
    if len(points) < 3:
        return False
    # Translate before taking the signed area to avoid subtracting large coordinates.
    x0, y0 = points[0]
    vectors = [(x - x0, y - y0) for x, y in points]
    return sum(x * next_y - y * next_x for (x, y), (next_x, next_y) in zip(vectors, vectors[1:])) != 0


def measured_coverage(discovery: CandidateDiscovery, bounds: Bounds | None = None) -> MeasuredCoverage:
    measured = {}
    for group in discovery.results:
        for feature in group.features:
            measured.setdefault(feature.id, feature)

    footprints = [
        MeasuredFootprint(
            type='Feature', id=feature.id, geometry=feature.geometry,
            properties={
                'tileId': feature.properties.tileId,
                'centerInArea': bounds is None or inside(feature.properties.center, bounds),
            },
        )
        for feature in measured.values()
        if bounds is None or overlaps_area(feature.geometry.coordinates[0], bounds)
    ]
    return MeasuredCoverage(
        type='FeatureCollection',
        status='measured' if footprints else 'no_measured_windows',
        windowCount=len(footprints),
        features=footprints,
    )


def window_detail(discovery: CandidateDiscovery, window_id: str) -> DiscoveredWindowDetail | None:
    matches = [
        (group.reference, feature)
        for group in discovery.results
        for feature in group.features
        if feature.id == window_id
    ]
    if not matches:
        return None
    window = matches[0][1]
    return DiscoveredWindowDetail(
        id=window.id,
        geometry=window.geometry,
        center=window.properties.center,
        tileId=window.properties.tileId,
        quality=window.properties.quality,
        comparisons=[
            WindowReferenceComparison(
                reference=reference,
                comparison=feature.properties.comparison,
                sensitivity=feature.properties.sensitivity,
            )
            for reference, feature in matches
        ],
    )


def search_candidates(
    discovery: CandidateDiscovery, bounds: Bounds, reference_id: str | None, limit: int | None,
) -> CandidateSearchResult:
    results = []
    for group in discovery.results:
        if reference_id is None or group.reference.id == reference_id:
            eligible = []
            for feature in group.features:
                if feature.properties.comparison.distance is not None and inside(feature.properties.center, bounds):
                    eligible.append(feature)
            eligible.sort(key=lambda feature: (feature.properties.comparison.distance, feature.id))
            results.append(group.model_copy(update={'comparableWindows': len(eligible), 'features': eligible[:limit]}))
    return CandidateSearchResult(
        schemaVersion=discovery.schemaVersion, boundsWgs84=bounds,
        sourceSearch=discovery.search, method=discovery.method,
        coverage=measured_coverage(discovery, bounds),
        results=results,
    )
