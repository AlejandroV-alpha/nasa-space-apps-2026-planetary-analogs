from copy import deepcopy
import json

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from backend.app.main import create_app
from backend.app.repository import Repository, get_repository


@pytest.fixture
def client():
    app=create_app()
    repository=Repository()
    app.dependency_overrides[get_repository]=lambda:repository
    with TestClient(app) as client:
        yield client


def test_catalog_preserves_real_contract(client):
    assert client.get('/health').json()['sites']==4
    data=client.get('/api/v1/catalog').json()
    assert data['schemaVersion']=='1.1.0'
    assert data['status']=='draft'
    assert len(data['sites'])==4 and len(data['referenceRegions'])==2
    assert next(s for s in data['sites'] if s['id']=='coipasa-sector')['metrics'][0]['value']==0


def test_filters_and_geojson(client):
    items=client.get('/api/v1/sites?target_body=mars&country=BO').json()
    assert items['total']==2
    assert client.get('/api/v1/sites?country=ZZ').json()['total']==0
    assert client.get('/api/v1/sites?target_body=earth').status_code==422
    assert client.get('/api/v1/sites?country=Bolivia').status_code==422
    assert client.get('/api/v1/sites?reference_region_id=unknown').status_code==404
    points=client.get('/api/v1/geojson/sites?target_body=moon').json()
    assert len(points['features'])==2
    assert all(p['geometry']['type']=='Point' for p in points['features'])


@pytest.mark.parametrize('route',['sites/siloli-sector','reference-regions/jezero-sector','reference-regions?target_body=moon','sources','methods','provenance'])
def test_read_routes(client,route):
    assert client.get('/api/v1/'+route).status_code==200


def test_missing_entities(client):
    assert client.get('/api/v1/sites/unknown').status_code==404
    assert client.get('/api/v1/reference-regions/unknown').status_code==404


def test_discovered_candidates_preserve_science_export(client):
    path = Repository().root / 'data/processed/discovered-candidates.v1.json'
    export = json.loads(path.read_text(encoding='utf-8'))
    url = '/api/v1/discovered-candidates'
    response = client.get(url)
    assert response.status_code == 200
    assert response.json() == export

    response = client.get(url, params={'reference_region_id': 'jezero-sector'})
    assert response.status_code == 200
    assert response.json() == {
        **export,
        'results': [result for result in export['results'] if result['reference']['id'] == 'jezero-sector'],
    }
    assert client.get(url, params={'reference_region_id': 'unknown'}).status_code == 404
    assert client.get(url).json() == export


SEARCH_URL = '/api/v1/discovered-candidates/search'


def test_full_discovery_preserves_both_rankings_and_existing_values(client):
    base = client.get('/api/v1/discovered-candidates').json()
    response = client.get(SEARCH_URL, params={'west': -180, 'south': -90, 'east': 180, 'north': 90, 'limit': 81})
    assert response.status_code == 200
    data = response.json()
    assert data['sourceSearch'] == base['search']
    assert data['coverage']['status'] == 'measured'
    assert data['coverage']['windowCount'] == 81
    coverage_ids = {feature['id'] for feature in data['coverage']['features']}
    assert len(coverage_ids) == 81
    assert len(data['results']) == len(base['results']) == 2
    for full, previous in zip(data['results'], base['results'], strict=True):
        assert full['reference'] == previous['reference']
        assert full['comparableWindows'] == len(full['features']) == 81
        assert {feature['id'] for feature in full['features']} == coverage_ids
        assert full['features'][:len(previous['features'])] == previous['features']
    assert client.get('/api/v1/discovered-candidates').json() == base


def test_search_filters_then_limits_local_ranking(client):
    bounds = {'west': -66, 'south': -23, 'east': -65, 'north': -22}
    params = {**bounds, 'reference_region_id': 'jezero-sector'}
    response = client.get(SEARCH_URL, params={**params, 'limit': 2})
    assert response.status_code == 200
    data = response.json()
    (group,) = data['results']
    assert group['reference']['id'] == 'jezero-sector'
    assert data['coverage']['windowCount'] == group['comparableWindows'] == 9
    assert len(group['features']) == 2
    assert all(
        bounds['west'] <= feature['properties']['center'][0] <= bounds['east']
        and bounds['south'] <= feature['properties']['center'][1] <= bounds['north']
        for feature in group['features']
    )
    (first, second) = group['features']
    assert first['properties']['comparison']['distance'] <= second['properties']['comparison']['distance']
    preview = client.get('/api/v1/discovered-candidates', params={'reference_region_id': 'jezero-sector'}).json()
    preview_ids = {feature['id'] for feature in preview['results'][0]['features']}
    (top_five,) = client.get(SEARCH_URL, params=params).json()['results']
    assert top_five['comparableWindows'] == 9
    assert len(top_five['features']) == 5
    (local,) = client.get(SEARCH_URL, params={**params, 'limit': 9}).json()['results']
    assert top_five['features'] == local['features'][:5]
    assert len(local['features']) == 9
    assert group['features'] == local['features'][:2]
    assert {feature['id'] for feature in local['features']} - preview_ids


def test_search_distinguishes_partial_overlap_from_absent_coverage(client):
    measured = client.get(SEARCH_URL, params={'west': -66, 'south': -23, 'east': -65, 'north': -22}).json()
    feature = measured['coverage']['features'][0]
    west = min(point[0] for point in feature['geometry']['coordinates'][0])
    south = min(point[1] for point in feature['geometry']['coordinates'][0])
    bounds = {'west': west + .04, 'south': south + .02, 'east': west + .05, 'north': south + .03}
    partial = client.get(SEARCH_URL, params=bounds).json()
    assert partial['coverage']['status'] == 'measured'
    assert all(not group['features'] for group in partial['results'])

    empty = client.get(SEARCH_URL, params={'west': 0, 'south': 0, 'east': .1, 'north': .1})
    assert empty.status_code == 200
    assert empty.json()['coverage'] == {
        'type': 'FeatureCollection', 'status': 'no_measured_windows', 'windowCount': 0, 'features': [],
    }
    assert all(group['comparableWindows'] == 0 and not group['features'] for group in empty.json()['results'])


def test_search_rejects_invalid_area_and_unknown_reference(client):
    params = {'west': -66, 'south': -23, 'east': -65, 'north': -22}
    assert client.get(SEARCH_URL, params={**params, 'west': -64}).status_code == 422
    assert client.get(SEARCH_URL, params={**params, 'north': 91}).status_code == 422
    assert client.get(SEARCH_URL, params={**params, 'limit': 0}).status_code == 422
    assert client.get(SEARCH_URL, params={**params, 'reference_region_id': 'unknown'}).status_code == 404


def test_coverage_and_detail_match_the_science_export(client):
    export = Repository().full_discovery()
    coverage = client.get('/api/v1/discovery-coverage')
    assert coverage.status_code == 200
    body = coverage.json()
    assert body['type'] == 'FeatureCollection'
    assert body['status'] == 'measured'
    assert body['windowCount'] == len(body['features']) == 81
    original_windows = {feature.id: feature for feature in export.results[0].features}
    assert {feature['id'] for feature in body['features']} == set(original_windows)
    for feature in body['features']:
        assert feature['geometry'] == original_windows[feature['id']].geometry.model_dump(mode='json')

    window_id = export.results[0].features[-1].id
    detail = client.get(f'/api/v1/discovered-candidates/{window_id}')
    assert detail.status_code == 200
    data = detail.json()
    assert data['id'] == window_id
    assert data['geometry'] == original_windows[window_id].geometry.model_dump(mode='json')
    for comparison, group in zip(data['comparisons'], export.results, strict=True):
        window = next(feature for feature in group.features if feature.id == window_id)
        assert comparison['reference'] == group.reference.model_dump(mode='json')
        assert comparison['comparison'] == window.properties.comparison.model_dump(mode='json')
        assert comparison['sensitivity'] == window.properties.sensitivity.model_dump(mode='json')
    assert client.get('/api/v1/discovered-candidates/unknown').status_code == 404


def test_science_status_reports_each_dataset(client, monkeypatch):
    response = client.get('/api/v1/science-status')
    assert response.status_code == 200
    assert response.json() == {
        name: {'status': 'available', 'detail': None}
        for name in ('catalog', 'discovery', 'environment')
    }

    def unavailable_full_discovery(self):
        raise HTTPException(503, 'Exportación completa no disponible.')

    monkeypatch.setattr(Repository, 'full_discovery', unavailable_full_discovery)
    response = client.get('/api/v1/science-status')
    assert response.status_code == 200
    assert response.json() == {
        'catalog': {'status': 'available', 'detail': None},
        'discovery': {'status': 'unavailable', 'detail': 'Exportación completa no disponible.'},
        'environment': {'status': 'available', 'detail': None},
    }


def test_site_environment_preserves_nasa_power_export(client):
    path = Repository().root / 'data/processed/terrestrial-environment.v1.json'
    export = json.loads(path.read_text(encoding='utf-8'))
    sites = export.pop('sites')
    response = client.get('/api/v1/sites/coipasa-sector/environment')
    assert response.status_code == 200
    assert response.json() == {
        **export,
        'site': next(site for site in sites if site['siteId'] == 'coipasa-sector'),
    }
    assert client.get('/api/v1/sites/unknown/environment').status_code == 404


@pytest.mark.parametrize(('route', 'filename'), [
    ('discovered-candidates', 'discovered-candidates.v1.json'),
    ('discovered-candidates/search?west=-66&south=-23&east=-65&north=-22', 'discovered-candidates.full.v1.json'),
    ('sites/coipasa-sector/environment', 'terrestrial-environment.v1.json'),
])
def test_unavailable_science_export_does_not_break_catalog(tmp_path, route, filename):
    repository = Repository()
    repository.load()
    original_root = repository.root
    repository.root = tmp_path
    export_path = tmp_path / 'data/processed' / filename
    export_path.parent.mkdir(parents=True)
    app = create_app()
    app.dependency_overrides[get_repository] = lambda: repository

    with TestClient(app) as client:
        url = '/api/v1/' + route
        assert client.get(url).status_code == 503
        export_path.write_text('{"schemaVersion": "1.0.0"}', encoding='utf-8')
        assert client.get(url).status_code == 503
        assert client.get('/api/v1/catalog').status_code == 200
        export_path.write_bytes((original_root / 'data/processed' / filename).read_bytes())
        assert client.get(url).status_code == 200


def test_compare_difference_and_zero(client):
    response=client.post('/api/v1/compare',json={'reference_region_id':'jezero-sector','site_ids':['siloli-sector','coipasa-sector']})
    assert response.status_code==200
    data=response.json()
    row=data['rows'][0]
    assert row['comparable'] is True
    assert row['sites'][1]['value']==0
    assert row['signed_differences'][1]==round(0-row['reference']['value'],4)


@pytest.mark.parametrize('ids',[['siloli-sector'],['siloli-sector','siloli-sector'],['siloli-sector','amboy-sector']])
def test_compare_rejects_invalid_selection(client,ids):
    assert client.post('/api/v1/compare',json={'reference_region_id':'jezero-sector','site_ids':ids}).status_code==422


def test_compare_missing_data_is_not_zero():
    repo=Repository();data=deepcopy(repo.load());repo._dataset=data
    data['sites'][0]['metrics'][0].update(value=None,status='missing',missingReason='No data')
    app=create_app();app.dependency_overrides[get_repository]=lambda:repo
    with TestClient(app) as client:
        row=client.post('/api/v1/compare',json={'reference_region_id':'jezero-sector','site_ids':['siloli-sector','coipasa-sector']}).json()['rows'][0]
        assert row['comparable'] is False
        assert row['signed_differences']==[None,None]


def test_unavailable_catalog_is_503(tmp_path):
    app=create_app();app.dependency_overrides[get_repository]=lambda:Repository(tmp_path)
    with TestClient(app) as client:
        assert client.get('/api/v1/catalog').status_code==503


def test_cors_and_openapi(client):
    response=client.options('/api/v1/catalog',headers={'Origin':'http://localhost:4200','Access-Control-Request-Method':'GET'})
    assert response.headers['access-control-allow-origin']=='http://localhost:4200'
    assert client.get('/docs').status_code==200
    paths=client.get('/openapi.json').json()['paths']
    assert '/api/v1/compare' in paths
    assert '/api/v1/discovered-candidates' in paths
    assert SEARCH_URL in paths
    assert '/api/v1/discovered-candidates/{window_id}' in paths
    assert '/api/v1/discovery-coverage' in paths
    assert '/api/v1/science-status' in paths
    assert '/api/v1/sites/{site_id}/environment' in paths
