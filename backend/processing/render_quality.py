"""Create a scientific contact sheet from the exact grids used for metrics."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import rasterio
if __package__:
    from .pipeline import ROOT, OUT, terrain_metrics
else:
    from pipeline import ROOT, OUT, terrain_metrics


def main():
    catalog=json.loads((OUT/'catalog.json').read_text())
    regions=catalog['sites']+catalog['references']
    fig,axes=plt.subplots(2,6,figsize=(19,7),layout='constrained')
    arrays=[]
    for region in regions:
        path=OUT/'rasters'/f'{region["id"]}-1000m.tif'
        with rasterio.open(path) as ds:
            padded=ds.read(1).astype(float)
        metrics,_,slopes=terrain_metrics(padded,1000)
        height=padded[2:-2,2:-2]
        arrays.append((height-np.nanmedian(height),slopes))
    max_rel=max(float(np.nanmax(np.abs(h))) for h,_ in arrays)
    max_slope=max(float(np.nanmax(s)) for _,s in arrays)
    for column,(region,(height,slopes)) in enumerate(zip(regions,arrays)):
        first=axes[0,column].imshow(height,cmap='RdBu_r',vmin=-max_rel,vmax=max_rel,extent=(-10,10,-10,10),interpolation='nearest')
        second=axes[1,column].imshow(slopes,cmap='magma',vmin=0,vmax=max_slope,extent=(-10,10,-10,10),interpolation='nearest')
        axes[0,column].set_title(region['name'].replace(' — ','\n'),fontsize=9)
        for row in range(2):
            axes[row,column].set_xlabel('Local x (km)',fontsize=8)
            axes[row,column].tick_params(labelsize=7)
        if column==0:
            axes[0,column].set_ylabel('Local y (km)\nHeight minus window median',fontsize=9)
            axes[1,column].set_ylabel('Local y (km)\nRegional slope',fontsize=9)
    fig.colorbar(first,ax=axes[0,:],shrink=.75,label='Height minus own-window median (m)')
    fig.colorbar(second,ax=axes[1,:],shrink=.75,label='Slope on averaged 1 km grid (degrees)')
    fig.suptitle('Regional terrain screening · 20 × 20 km windows · 1 km cells\nComputed from NASADEM / LOLA / MOLA; no analog validation or common vertical datum implied',fontsize=13)
    fig.savefig(OUT/'terrain-quality.png',dpi=150,metadata={'Software':'Matplotlib; processing/render_quality.py'})
    plt.close(fig)


if __name__=='__main__':main()
