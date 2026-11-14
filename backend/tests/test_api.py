from copy import deepcopy
from pathlib import Path
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
