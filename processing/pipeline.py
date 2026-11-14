"""Reproducible regional terrain screening; never validates analog suitability.

Run from any directory: python processing/pipeline.py [--offline]
"""
from __future__ import annotations

import argparse
from contextlib import ExitStack
import hashlib
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET

import numpy as np
import requests
import rasterio
from affine import Affine
from pyproj import CRS, Transformer
from rasterio.merge import merge
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject, transform_bounds
from rasterio.windows import Window, from_bounds

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
RAW = DATA / 'raw'
META = DATA / 'metadata'
OUT = DATA / 'processed'
METHOD = 'regional-dem-average-central-difference-v1'
MOON_BASE = ('https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/'
             'lrolol_1xxx/data/lola_gdr/polar/float_img/ldem_75s_240m_float')
MARS_BASE = ('https://pds-geosciences.wustl.edu/mgs/'
             'urn-nasa-pds-mgs_mola_topography_derived/meg128/megt44n000hb')
SESSION = requests.Session()
SESSION.headers['User-Agent'] = 'PlanetaryAnalogsTeam3/0.1 (regional research prototype)'


def save_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n')


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def get(url: str, **kwargs) -> requests.Response:
    response = SESSION.get(url, timeout=(20, 120), **kwargs)
    response.raise_for_status()
    return response


def label_field(text: str, key: str) -> str:
    match = re.search(r'^\s*' + re.escape(key) + r'\s*=\s*([^\r\n]+)', text, re.MULTILINE)
    if not match:
        raise ValueError(f'Missing label field: {key}')
    return match.group(1).strip().strip('"')


def label_number(text: str, key: str) -> float:
    return float(label_field(text, key).split()[0])


def xml_number(root, key: str) -> float:
    element = root.find('.//{*}' + key)
    if element is None or element.text is None:
        raise ValueError(f'Missing PDS4 cartography field: {key}')
    return float(element.text)


def coordinate_systems(region: dict) -> tuple[CRS, CRS]:
    lon, lat = region['center']
    if region['body'] == 'earth':
        geographic = CRS.from_epsg(4326)
        local = CRS.from_proj4(f'+proj=aeqd +lat_0={lat} +lon_0={lon} +datum=WGS84 +units=m +no_defs')
    else:
        radius = 1737400 if region['body'] == 'moon' else 3396000
        geographic = CRS.from_proj4(f'+proj=longlat +R={radius} +no_defs')
        local = CRS.from_proj4(f'+proj=aeqd +lat_0={lat} +lon_0={lon} +R={radius} +units=m +no_defs')
    return geographic, local


def study_geometry(region: dict) -> dict:
    geographic, local = coordinate_systems(region)
    inverse = Transformer.from_crs(local, geographic, always_xy=True)
    half = region['studySideM'] / 2
    # Densify projected square edges, because their image in longitude/latitude is curved.
    coordinates = []
    corners = [(-half,-half),(half,-half),(half,half),(-half,half),(-half,-half)]
    for (x0,y0),(x1,y1) in zip(corners, corners[1:]):
        for fraction in np.linspace(0, 1, 16, endpoint=False):
            lon, lat = inverse.transform(x0 + fraction*(x1-x0), y0 + fraction*(y1-y0))
            coordinates.append([round(lon,9),round(lat,9)])
    coordinates.append(coordinates[0])
    return {'type':'Polygon','coordinates':[coordinates]}


def bounds_for(region: dict, destination_crs, margin_m: int = 6000):
    _, local = coordinate_systems(region)
    extent = region['studySideM']/2 + margin_m
    return transform_bounds(local, destination_crs, -extent, -extent, extent, extent, densify_pts=41)


def cache_record(path: Path, url: str, **extra) -> None:
    # Never persist signed SAS URLs or authentication query strings.
    if urlsplit(url).query:
        raise ValueError('Only stable unsigned URLs may enter provenance records')
    save_json(path.with_suffix(path.suffix+'.provenance.json'), dict(
        url=url, localPath=str(path.relative_to(ROOT)), sha256=sha256(path),
        downloadedAt=datetime.now(timezone.utc).isoformat(), bytes=path.stat().st_size, **extra))


def metadata(url: str, name: str, offline: bool) -> Path:
    path = META/name
    if not path.exists():
        if offline:
            raise FileNotFoundError(f'Offline metadata unavailable: {path}')
        path.write_bytes(get(url).content)
    return path


def nasadem_tile(item_id: str, offline: bool):
    item_url = f'https://planetarycomputer.microsoft.com/api/stac/v1/collections/nasadem/items/{item_id}'
    item_path = metadata(item_url, item_id+'.stac.json', offline)
    item = json.loads(item_path.read_text())
    stable_url = item['assets']['elevation']['href']
    path = RAW/(item_id+'.tif')
    if not path.exists():
        if offline:
            raise FileNotFoundError(f'Offline source unavailable: {path}')
        # Public delivery token is used in memory only. No user credentials needed.
        signed = get('https://planetarycomputer.microsoft.com/api/sas/v1/sign', params={'href': stable_url}).json()['href']
        partial = path.with_suffix('.part')
        try:
            with get(signed, stream=True) as response, partial.open('wb') as stream:
                for block in response.iter_content(1024*1024):
                    stream.write(block)
            with rasterio.open(partial) as ds:
                if ds.count != 1 or ds.crs.to_epsg() != 4326:
                    raise ValueError('Unexpected NASADEM COG structure')
            partial.replace(path)
        finally:
            partial.unlink(missing_ok=True)
        cache_record(path, stable_url, stacItemUrl=item_url, product='NASADEM_HGT.001')
    provenance_path=path.with_suffix(path.suffix+'.provenance.json')
    provenance=json.loads(provenance_path.read_text())
    if sha256(path)!=provenance['sha256']:
        raise ValueError('NASADEM tile failed SHA256 validation')
    return path,item_path,provenance


def nasa_dem(region: dict, offline: bool):
    left,bottom,right,top=bounds_for(region,CRS.from_epsg(4326))
    inputs=[]
    for latitude in range(math.floor(bottom),math.floor(top)+1):
        for longitude in range(math.floor(left),math.floor(right)+1):
            tile=f"NASADEM_HGT_{'n' if latitude>=0 else 's'}{abs(latitude):02d}{'e' if longitude>=0 else 'w'}{abs(longitude):03d}"
            inputs.append(nasadem_tile(tile,offline))
    with ExitStack() as stack:
        datasets=[stack.enter_context(rasterio.open(path)) for path,_,_ in inputs]
        array,transform=merge(datasets,bounds=(left,bottom,right,top),nodata=-32768,method='first')
        values=array[0].astype('float64')
        values[values==-32768]=np.nan
        crs=datasets[0].crs
        resolution=list(datasets[0].res)
    manifest=RAW/(region['id']+'-nasadem-inputs.json')
    payload=dict(regionId=region['id'],inputs=[record for _,_,record in inputs],
                 mergeBounds=[left,bottom,right,top],mergeMethod='first at native angular grid spacing',
                 overlapHandling='First tile wins on duplicated shared boundary samples.')
    if not manifest.exists():
        save_json(manifest,payload)
        cache_record(manifest,'https://planetarycomputer.microsoft.com/api/stac/v1/collections/nasadem',
                     kind='derived_input_manifest',inputs=payload['inputs'])
    elif json.loads(manifest.read_text())!=payload:
        raise ValueError('Study inputs changed; remove this region input manifest before reprocessing')
    info=dict(sourceId='nasadem',productFiles=[path.name for path,_,_ in inputs],originalUnits='m',appliedScale=1,
              nativePixelSize=resolution,nativePixelSizeUnit='degree',nativeNoData=-32768,
              originalMetadata=[str(path.relative_to(ROOT)) for _,path,_ in inputs],
              mergeBounds=[left,bottom,right,top],mergeMethod='first; native grid; no gap filling')
    return values,transform,crs,info,manifest


def pds_strip(region: dict, offline: bool):
    moon = region['body']=='moon'
    base = MOON_BASE if moon else MARS_BASE
    name = base.rsplit('/',1)[1]
    label_path = metadata(base+'.lbl',name+'.lbl',offline)
    xml_path = metadata(base+'.xml',name+'.xml',offline)
    label = label_path.read_text()
    rows = int(label_number(label,'LINES'))
    columns = int(label_number(label,'LINE_SAMPLES'))
    if moon:
        crs = CRS.from_proj4('+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400 +units=m +no_defs')
        scale = label_number(label,'MAP_SCALE')
        x = -(label_number(label,'SAMPLE_PROJECTION_OFFSET')+.5)*scale
        y = (label_number(label,'LINE_PROJECTION_OFFSET')+.5)*scale
        transform = from_origin(x,y,scale,scale)
        dtype = np.dtype('<f4')
        unit_scale = 1000.0
        if label_field(label,'UNIT') != 'KILOMETER' or label_field(label,'SAMPLE_TYPE') != 'PC_REAL' or label_number(label,'SCALING_FACTOR') != 1:
            raise ValueError('Unexpected LOLA units or encoding')
    else:
        root = ET.fromstring(xml_path.read_bytes())
        scale = xml_number(root,'pixel_resolution_x')*1000
        scale_y = xml_number(root,'pixel_resolution_y')*1000
        crs = CRS.from_proj4('+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=180 +R=3396000 +units=m +no_defs')
        transform = from_origin(xml_number(root,'upperleft_corner_x'),xml_number(root,'upperleft_corner_y'),scale,scale_y)
        dtype = np.dtype('>i2')
        unit_scale=1.0
        if label_field(label,'UNIT') != 'METER' or label_field(label,'SAMPLE_TYPE') != 'MSB_INTEGER':
            raise ValueError('Unexpected MOLA units or encoding')
    left,bottom,right,top = bounds_for(region,crs)
    window = from_bounds(left,bottom,right,top,transform=transform)
    first = max(0,math.floor(window.row_off))
    last = min(rows,math.ceil(window.row_off+window.height))
    if first>=last or window.col_off<0 or window.col_off+window.width>columns:
        raise ValueError('Requested area outside PDS product')
    row_bytes = columns*dtype.itemsize
    start,end = first*row_bytes,last*row_bytes-1
    path = RAW/f'{name}.rows-{first}-{last}.bin'
    if not path.exists():
        if offline:
            raise FileNotFoundError(f'Offline PDS strip unavailable: {path}')
        # A unique non-secret cache key prevents caches from reusing another byte range.
        response = get(base+f'.img?study_rows={first}-{last}',headers={'Range':f'bytes={start}-{end}'})
        expected = f'bytes {start}-{end}/{rows*row_bytes}'
        if response.status_code != 206 or response.headers.get('Content-Range') != expected or len(response.content) != end-start+1:
            raise ValueError('Server did not return the exact requested PDS range')
        path.write_bytes(response.content)
        cache_record(path,base+'.img',rangeStart=start,rangeEndInclusive=end,contentRange=expected,
                     product=name,rowStart=first,rowStopExclusive=last,columns=columns,dtype=dtype.str)
    expected_bytes = (last-first)*row_bytes
    if path.stat().st_size != expected_bytes:
        raise ValueError('Corrupt cached PDS strip')
    raw = np.fromfile(path,dtype=dtype).reshape(last-first,columns)
    values = raw.astype('float64')
    if moon:
        values[~np.isfinite(values) | (np.abs(values)>100)] = np.nan
    else:
        values[values == -32768] = np.nan
    values *= unit_scale
    strip_transform = transform*Affine.translation(0,first)
    info = dict(sourceId='lola' if moon else 'mola',productFile=name+'.img',originalUnits='km' if moon else 'm',
                appliedScale=unit_scale,appliedVerticalOffset=0,
                offsetNote='LOLA OFFSET=1737.4 km is not added: these values are heights, not planetary radii.' if moon else 'MOLA product contains topography, not radius.',
                nativePixelSize=[scale,scale if moon else scale_y],nativePixelSizeUnit='projected metre',
                originalMetadata=[str(label_path.relative_to(ROOT)),str(xml_path.relative_to(ROOT))],
                sourceRange=dict(rowStart=first,rowStopExclusive=last,columns=columns),
                georeferencing='PDS3 polar offsets, checked against GDAL' if moon else 'Precise PDS4 XML pixel resolutions and upper-left corner; avoids rounded PDS3 MAP_SCALE')
    return values,strip_transform,crs,info,path


def grid_for(region: dict, scale: int, padding: int = 2):
    if region['studySideM'] % scale:
        raise ValueError('Study side must be an integer number of cells')
    half=region['studySideM']/2
    dimension=region['studySideM']//scale+padding*2
    return (dimension,dimension),from_origin(-half-padding*scale,half+padding*scale,scale,scale)


def average_grid(values, src_transform, src_crs, region, scale):
    _,local=coordinate_systems(region)
    shape,transform=grid_for(region,scale)
    destination=np.full(shape,np.nan,dtype='float64')
    reproject(source=values,destination=destination,src_transform=src_transform,src_crs=src_crs,
              src_nodata=np.nan,dst_transform=transform,dst_crs=local.to_wkt(),dst_nodata=np.nan,
              resampling=Resampling.average,num_threads=1)
    return destination,transform,local


def terrain_metrics(padded: np.ndarray, scale: float, padding: int = 2):
    if scale<=0 or padding<1 or min(padded.shape)<=2*padding:
        raise ValueError('Invalid scale, padding or raster dimensions')
    z=padded[padding:-padding,padding:-padding]
    east=(padded[padding:-padding,padding+1:-(padding-1) or None]-padded[padding:-padding,padding-1:-(padding+1)])/(2*scale)
    south=(padded[padding+1:-(padding-1) or None,padding:-padding]-padded[padding-1:-(padding+1),padding:-padding])/(2*scale)
    slopes=np.degrees(np.arctan(np.hypot(east,south)))
    slopes[~np.isfinite(z)]=np.nan
    slope_values=slopes[np.isfinite(slopes)]
    height_values=z[np.isfinite(z)]
    metric_values={
        'slope_median_deg':float(np.median(slope_values)) if len(slope_values) else None,
        'slope_p90_deg':float(np.percentile(slope_values,90,method='linear')) if len(slope_values) else None,
        'relief_p95_p5_m':float(np.percentile(height_values,95,method='linear')-np.percentile(height_values,5,method='linear')) if len(height_values) else None,
    }
    quality=dict(totalCells=z.size,finiteHeightCells=int(len(height_values)),finiteSlopeCells=int(len(slope_values)),
                 validHeightCellFraction=float(len(height_values)/z.size),validSlopeCellFraction=float(len(slope_values)/z.size),
                 coverageMeaning='Fraction of finite output cells; NOT fraction of direct observations or a confidence score.')
    return metric_values,quality,slopes


def export_metrics(values,quality,scale,source_id):
    definitions=[('slope_median_deg','Pendiente mediana','deg'),('slope_p90_deg','Pendiente P90','deg'),('relief_p95_p5_m','Relieve P95–P5','m')]
    result=[]
    for key,label,unit in definitions:
        value=values[key]
        coverage=quality['validHeightCellFraction' if key.startswith('relief') else 'validSlopeCellFraction']
        if coverage<.95:
            value=None
        result.append(dict(key=key,label=label,value=round(value,4) if value is not None else None,unit=unit,
                           sourceIds=[source_id],methodId=METHOD,analysisScaleM=scale,validCoverageFraction=coverage,
                           status='computed_unreviewed' if value is not None else 'unavailable',
                           missingReason=None if value is not None else 'Less than 95% finite output cells for this statistic.'))
    return result


def write_grid(path,values,transform,crs):
    path.parent.mkdir(parents=True,exist_ok=True)
    with rasterio.open(path,'w',driver='GTiff',height=values.shape[0],width=values.shape[1],count=1,
                       dtype='float32',crs=crs,transform=transform,nodata=np.nan,compress='deflate') as ds:
        ds.write(values.astype('float32'),1)
        ds.update_tags(method=METHOD,units='m',purpose='Regional screening, not analog validation')


def comparison(site,reference):
    if site['studyArea']['sideM']!=reference['studyArea']['sideM']:
        raise ValueError('Mismatched study area size')
    result=[]
    for metric in site['metrics']:
        other=next(m for m in reference['metrics'] if m['key']==metric['key'])
        if any(metric[k]!=other[k] for k in ['unit','methodId','analysisScaleM']):
            raise ValueError('Incompatible metrics')
        delta=None if metric['value'] is None or other['value'] is None else round(metric['value']-other['value'],4)
        result.append(dict(key=metric['key'],unit=metric['unit'],candidateValue=metric['value'],referenceValue=other['value'],
                           signedDifference=delta,meaning='Candidate minus reference; descriptive difference, not suitability or similarity probability.'))
    return dict(referenceRegionId=reference['id'],analysisScaleM=1000,metrics=result,ranking=None,
                conclusion='Contrast of regional terrain only. No validated analog or preferred site follows from these statistics.')


def process(region,offline):
    values,transform,crs,source_info,source_path = nasa_dem(region,offline) if region['body']=='earth' else pds_strip(region,offline)
    metadata_paths=source_info['originalMetadata']
    if isinstance(metadata_paths,str): metadata_paths=[metadata_paths]
    source_info['metadataSha256']={name:sha256(ROOT/name) for name in metadata_paths}
    polygon=study_geometry(region)
    source_id=source_info['sourceId']
    all_scales=[]
    for scale in region['analysisScalesM']:
        grid,grid_transform,local=average_grid(values,transform,crs,region,scale)
        measures,quality,_=terrain_metrics(grid,scale)
        path=OUT/'rasters'/f'{region["id"]}-{scale}m.tif'
        write_grid(path,grid,grid_transform,local.to_wkt())
        all_scales.append(dict(analysisScaleM=scale,metrics=export_metrics(measures,quality,scale,source_id),quality=quality,
                               raster=str(path.relative_to(ROOT)),rasterSha256=sha256(path)))
    geographic,local=coordinate_systems(region)
    result={k:v for k,v in region.items() if k not in ['tile','analysisScalesM','studySideM']}
    result.update(evidenceStatus='computed_unreviewed',analogyStatus='hypothesis_not_validated',
                  coordinates=dict(order='longitude_latitude',values=region['center'],crs=geographic.to_wkt()),
                  studyArea=dict(sideM=region['studySideM'],areaKm2=region['studySideM']**2/1e6,
                    shape='Square in local azimuthal equidistant projection; densified boundary',
                    coordinateBody=region['body'],geometry=polygon,analysisCrs=local.to_wkt()),
                  sourceIds=[source_id],sourceDetails=source_info,metrics=all_scales[0]['metrics'],sensitivity=all_scales[1:],quality=all_scales[0]['quality'],
                  analysisRaster=all_scales[0]['raster'],analysisRasterSha256=all_scales[0]['rasterSha256'])
    provenance=json.loads(source_path.with_suffix(source_path.suffix+'.provenance.json').read_text())
    if sha256(source_path)!=provenance['sha256']:
        raise ValueError('Cached source failed SHA256 validation')
    result['provenance']=provenance
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--offline',action='store_true',help='Use only cached metadata and raw sources; never access network.')
    args=parser.parse_args()
    for path in [RAW,META,OUT]:path.mkdir(parents=True,exist_ok=True)
    config=json.loads((DATA/'study-config.json').read_text())
    # Save provider metadata without signed delivery credentials.
    metadata('https://planetarycomputer.microsoft.com/api/stac/v1/collections/nasadem','nasadem-collection.stac.json',args.offline)
    results=[]
    for region in config['regions']:
        print(f'Processing {region["id"]}...',flush=True)
        results.append(process(region,args.offline))
    references=[r for r in results if r['body']!='earth']
    sites=[r for r in results if r['body']=='earth']
    for site in sites:
        ref=next(r for r in references if r['id']==site['referenceRegionId'])
        site['assessments']=[dict(targetBody=site['targetBody'],referenceRegionId=ref['id'],
                                 testUseCase=site['hypothesis'],comparison=comparison(site,ref),
                                 limitations=site['limitations'],evidenceStatus='computed_unreviewed')]
    catalog=dict(schemaVersion='0.1-science',status='computed_unreviewed',methodId=METHOD,question=config['question'],
                 sources=config['sources'],references=references,sites=sites,
                 software=dict(python=sys.version.split()[0],numpy=np.__version__,rasterio=rasterio.__version__,gdal=rasterio.__gdal_version__),
                 methods=[dict(id=METHOD,studySideM=20000,analysisScalesM=[1000,2000],
                   projection='Per-region azimuthal equidistant; WGS84 Earth, 1737400 m Moon sphere, 3396000 m Mars sphere',
                   resampling='GDAL average',slope='atan(hypot(central_difference_x,central_difference_y)), converted to degrees',
                   slopeStencil='four cardinal neighbours, spacing 2 cells',
                   percentiles='NumPy percentile, method=linear',heightStatistic='P95 minus P5 within the interior window',
                   minimumFiniteCellFraction=.95,coverageDoesNotMeanDirectObservations=True,scientificReview='pending')])
    save_json(OUT/'catalog.json',catalog)
    save_json(OUT/'candidates.geojson',dict(type='FeatureCollection',features=[
        dict(type='Feature',id=s['id'],geometry=dict(type='Point',coordinates=s['center']),
             properties=dict(id=s['id'],name=s['name'],country=s['country'],targetBody=s['targetBody'],
                             evidenceStatus=s['evidenceStatus'],referenceRegionId=s['referenceRegionId'],metrics=s['metrics'])) for s in sites]))
    save_json(OUT/'study-areas-earth.geojson',dict(type='FeatureCollection',features=[
        dict(type='Feature',id=s['id'],geometry=s['studyArea']['geometry'],properties=dict(id=s['id'],name=s['name'],sideM=20000)) for s in sites]))
    # Planetary polygons intentionally remain in catalog with explicit body/CRS, not Earth GeoJSON.
    rows=['| Area | Body | Slope median (deg) | Slope P90 (deg) | Relief P95-P5 (m) | Finite height cells |',
          '| --- | --- | ---: | ---: | ---: | ---: |']
    for r in results:
        cells=[m['value'] for m in r['metrics']]
        rows.append(f'| {r["name"]} | {r["body"]} | '+ ' | '.join(str(v) for v in cells)+f' | {r["quality"]["finiteHeightCells"]}/{r["quality"]["totalCells"]} |')
    (OUT/'results-table.md').write_text('# Regional screening results at 1000 m\n\nComputed by the team; scientific review pending. No similarity score.\n\n'+'\n'.join(rows)+'\n')
    print(f'Wrote {len(sites)} candidates and {len(references)} planetary references to {OUT}',flush=True)


if __name__=='__main__':
    try:
        main()
    except (requests.RequestException, ValueError, OSError) as error:
        # Do not print network exception text: requests may include a temporary signed URL.
        detail='Network request failed; signed URLs omitted.' if isinstance(error,requests.RequestException) else str(error)
        print(f'Pipeline failed ({type(error).__name__}): {detail}. No results fabricated.',file=sys.stderr)
        sys.exit(1)
