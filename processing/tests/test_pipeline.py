import copy
import json
from pathlib import Path

import numpy as np
import pytest
from pyproj import Transformer

from pipeline import (
    METHOD, average_grid, comparison, coordinate_systems, export_metrics,
    grid_for, label_field, study_geometry, terrain_metrics, xml_number,
)
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[2]


def test_plane_slope_is_analytical_and_not_dependent_on_elevation_offset():
    y,x=np.mgrid[:24,:24]
    grid=(.1*x+.2*y)*1000
    metrics,quality,_=terrain_metrics(grid,1000)
    expected=np.degrees(np.arctan(np.hypot(.1,.2)))
    assert metrics['slope_median_deg']==pytest.approx(expected)
    assert metrics['slope_p90_deg']==pytest.approx(expected)
    shifted,_,_=terrain_metrics(grid+4000,1000)
    assert shifted==pytest.approx(metrics)
    assert quality['finiteSlopeCells']==400


def test_flat_zero_is_valid_data():
    metrics,quality,_=terrain_metrics(np.zeros((24,24)),1000)
    assert all(value==0 for value in metrics.values())
    exported=export_metrics(metrics,quality,1000,'nasadem')
    assert all(m['value']==0 and m['missingReason'] is None for m in exported)


def test_nodata_does_not_become_zero_or_poison_distant_cells():
    data=np.zeros((24,24)); data[12,12]=np.nan
    metrics,quality,slopes=terrain_metrics(data,1000)
    assert quality['finiteHeightCells']==399
    assert quality['finiteSlopeCells']==395
    assert np.isnan(slopes[10,10])
    assert metrics['slope_median_deg']==0


def test_all_missing_yields_json_null_and_not_nan():
    metrics,quality,_=terrain_metrics(np.full((24,24),np.nan),1000)
    assert all(value is None for value in metrics.values())
    result=export_metrics(metrics,quality,1000,'mola')
    assert all(m['value'] is None and m['status']=='unavailable' for m in result)
    assert 'null' in json.dumps(result,allow_nan=False)


def test_low_finite_coverage_suppresses_metrics():
    data=np.zeros((24,24)); data[2:12,2:12]=np.nan
    metrics,quality,_=terrain_metrics(data,1000)
    result=export_metrics(metrics,quality,1000,'mola')
    assert all(m['value'] is None and m['missingReason'] for m in result)


@pytest.mark.parametrize('body,radius',[('moon',1737400),('mars',3396000)])
def test_planetary_projection_uses_its_own_radius(body,radius):
    region=dict(body=body,center=[0,0])
    geographic,local=coordinate_systems(region)
    project=Transformer.from_crs(geographic,local,always_xy=True)
    x,y=project.transform(1,0)
    assert x==pytest.approx(radius*np.pi/180,rel=1e-9)
    assert abs(y)<1e-6


def test_square_has_matching_physical_dimensions_across_bodies():
    for body,center in [('earth',[-67.88,-22.12]),('moon',[0,-89.5]),('mars',[77.58,18.44])]:
        region=dict(body=body,center=center,studySideM=20000)
        geographic,local=coordinate_systems(region)
        project=Transformer.from_crs(geographic,local,always_xy=True)
        geometry=study_geometry(region)
        xy=np.array([project.transform(*p) for p in geometry['coordinates'][0]])
        assert np.ptp(xy[:,0])==pytest.approx(20000,abs=.1)
        assert np.ptp(xy[:,1])==pytest.approx(20000,abs=.1)
        assert geometry['coordinates'][0][0]==geometry['coordinates'][0][-1]
        shape,_=grid_for(region,1000)
        assert shape==(24,24)


def test_average_resampling_preserves_constant_height():
    region=dict(body='earth',center=[-67.88,-22.12],studySideM=20000)
    _,local=coordinate_systems(region)
    from rasterio.transform import from_origin
    values=np.full((640,640),1234.)
    output,_,_=average_grid(values,from_origin(-16000,16000,50,50),local,region,1000)
    assert np.allclose(output,1234.)


def test_incompatible_scale_is_not_compared():
    metric=dict(key='slope_median_deg',unit='deg',methodId=METHOD,analysisScaleM=1000,value=1)
    site=dict(id='candidate',studyArea=dict(sideM=20000),metrics=[metric])
    reference=copy.deepcopy(site);reference['id']='reference'
    reference['metrics'][0]['analysisScaleM']=2000
    with pytest.raises(ValueError,match='Incompatible'):
        comparison(site,reference)


def test_missing_metric_has_no_signed_difference():
    site=dict(id='candidate',studyArea=dict(sideM=20000),metrics=[dict(key='slope_median_deg',unit='deg',methodId=METHOD,analysisScaleM=1000,value=None)])
    reference=copy.deepcopy(site);reference['id']='reference'
    assert comparison(site,reference)['metrics'][0]['signedDifference'] is None


def test_lunar_height_is_kilometres_not_radius():
    text=(ROOT/'data/metadata/ldem_75s_240m_float.lbl').read_text()
    assert label_field(text,'UNIT')=='KILOMETER'
    assert label_field(text,'OFFSET')=='1737.4'
    # A digital number -1.2 is a height of -1200 m, not a 1736.2 km elevation.
    assert -1.2*1000==-1200


def test_mola_uses_precise_pds4_cartography_instead_of_rounded_pds3():
    root=ET.fromstring((ROOT/'data/metadata/megt44n000hb.xml').read_bytes())
    scale=xml_number(root,'pixel_resolution_x')*1000
    assert scale==pytest.approx(463.0576672)
    assert scale!=463
    assert xml_number(root,'upperleft_corner_x')==pytest.approx(-10668848.652)
