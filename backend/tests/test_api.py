from copy import deepcopy
import json

import pytest
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
    assert '/api/v1/sites/{site_id}/environment' in paths
