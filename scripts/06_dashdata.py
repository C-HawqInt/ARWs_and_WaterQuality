import geopandas as gpd, pandas as pd, numpy as np, json
from shapely.geometry import mapping
OUT='dash/'
def enc(geom,prec=5):
    # encode polygon/line as "x,y x,y;..." rings in lon/lat
    gs=getattr(geom,'geoms',[geom]); parts=[]
    for g in gs:
        if g.geom_type=='Polygon': rings=[g.exterior]+list(g.interiors)
        else: rings=[g]
        for r in rings:
            parts.append(' '.join(f'{x:.{prec}f},{y:.{prec}f}' for x,y in r.coords))
    return ';'.join(parts)
# counties
c=gpd.read_file('cnty/cb_2023_us_county_20m.shp'); c=c[c.STATEFP=='12'].to_crs(4326)
c['geom']=c.geometry.simplify(0.003).apply(lambda g:enc(g,3))
c[['NAME','geom']].rename(columns={'NAME':'county'}).to_csv(OUT+'fl_counties.csv',index=False)
# canals
p=gpd.read_file('polys_net.gpkg')
p['TYP_FORM']=p.TYP_FORM.replace({'Single Channel':'Single channel'})
S=pd.read_csv('station_summary.csv')
cs=S[S.setting=='Canal'].groupby('CHAWQ_ID').agg(n_canal_stations=('MonitoringLocationIdentifier','size'),canal_DO=('med_DO','median'))
p=p.merge(cs,left_on='CHAWQ_ID',right_index=True,how='left')
p['n_canal_stations']=p.n_canal_stations.fillna(0).astype(int)
g=p.copy(); g['geometry']=g.geometry.simplify(8); g=g.to_crs(4326)
g['geom']=g.geometry.apply(enc)
cols=['CHAWQ_ID','County','WMDNAME','WATERBODY_','TYP_FORM','TYP_CONNEC','TYP_SCALE','TYP_RECWAT','NumMouth','area_acres','poly_cl_km','net_len_km','n_junctions','n_canal_stations','canal_DO','geom']
g=g[cols]; g['CHAWQ_ID']=g.CHAWQ_ID.astype('Int64')
for k in ['area_acres','poly_cl_km','net_len_km','canal_DO']: g[k]=g[k].round(3)
g.to_csv(OUT+'canal_polygons.csv',index=False)
# centerlines (simplified) 
cl=gpd.read_file('cl_net.gpkg'); cl['geometry']=cl.geometry.simplify(10); cl=cl.to_crs(4326)
cl['geom']=cl.geometry.apply(enc)
cl[['SRC_OID','LEN_M','geom']].assign(LEN_M=lambda d:d.LEN_M.round(1)).to_csv(OUT+'centerlines.csv',index=False)
# stations
keep=['MonitoringLocationIdentifier','MonitoringLocationName','OrganizationFormalName','setting','LatitudeMeasure','LongitudeMeasure','d_m','CHAWQ_ID','County','WMDNAME','WATERBODY_','TYP_FORM','TYP_CONNEC','TYP_SCALE','TYP_RECWAT','mouth_class','NumMouth','HCon_Num','SYS_NPOLY','area_acres','poly_cl_km','net_len_km','n_junctions','n_tips','km_per_mouth','d_centerline_m',
 'med_DO','med_DOsat','med_TN','med_TP','med_CHLA','med_ENT','med_SAL','med_TEMP','med_TURB','pct_DO_lt4','pct_DO_lt2','n_DO','n_TN','n_TP','n_CHLA','n_ENT','n_SAL','n_TURB','n_dates','first','last']
s=S[keep].copy()
s=s.rename(columns={'MonitoringLocationIdentifier':'station_id','MonitoringLocationName':'station_name','OrganizationFormalName':'organization','LatitudeMeasure':'lat','LongitudeMeasure':'lon','d_m':'dist_to_canal_m'})
s['CHAWQ_ID']=s.CHAWQ_ID.astype('Int64')
s['setting']=s.setting.replace({'Open water (≤500 m)':'Open water'})
num=s.select_dtypes('number').columns
s[num]=s[num].round(4); s['lat']=S.LatitudeMeasure.round(5); s['lon']=S.LongitudeMeasure.round(5)
s.to_csv(OUT+'stations.csv',index=False)
# stats
cmp=pd.read_csv('stat_canal_vs_open.csv'); cmp.round(4).to_csv(OUT+'canal_vs_open.csv',index=False)
kw=pd.read_csv('stat_typology_kw.csv'); rows=[]
for _,r in kw.iterrows():
    for lev,(m,n) in json.loads(r.groups).items(): rows.append(dict(factor=r.factor,param=r.param,level=lev,median=m,n=n,H=round(r.H,3),p=r.p))
pd.DataFrame(rows).to_csv(OUT+'typology_groups.csv',index=False)
pd.read_csv('stat_spearman.csv').round(4).to_csv(OUT+'spearman.csv',index=False)
pd.read_csv('stat_regression.csv').round(4).to_csv(OUT+'regression.csv',index=False)
# pairs
MINN=3; out=[]
for k in ['DO','pct_DO_lt4','TN','TP','CHLA','ENT','TURB','SAL']:
    colv=k if k.startswith('pct') else f'med_{k}'; ncol='n_DO' if k.startswith('pct') else f'n_{k}'
    d=S[(S[ncol]>=MINN)&S[colv].notna()]
    pp=d.groupby(['PID','setting'])[colv].median().unstack().dropna()
    pp.columns=['canal','open']; pp=pp.reset_index()
    meta=S[S.setting=='Canal'].drop_duplicates('PID').set_index('PID')[['CHAWQ_ID','County','TYP_FORM','WMDNAME']]
    pp=pp.join(meta,on='PID'); pp['param']=k
    out.append(pp)
pairs=pd.concat(out); pairs['CHAWQ_ID']=pairs.CHAWQ_ID.astype('Int64'); pairs['pair_id']=pairs.param+'_'+pairs.CHAWQ_ID.astype(str)
pairs[['pair_id','param','CHAWQ_ID','County','TYP_FORM','WMDNAME','canal','open']].round(4).to_csv(OUT+'paired_canals.csv',index=False)
# annual
r=pd.read_parquet('results_clean.parquet'); r['year']=r.date.dt.year
r=r[r.param.isin(['DO','TN','TP','CHLA','ENT'])]
a=r.groupby(['grp','param','year']).agg(median=('v','median'),n=('v','size'),stations=('sid','nunique')).reset_index()
a['setting']=a.grp.map({'canal':'Canal','ref':'Open water'}); a=a.drop(columns='grp')
a['row_id']=a.setting+'_'+a.param+'_'+a.year.astype(str)
a.round(4).to_csv(OUT+'annual_medians.csv',index=False)
import os
for f in sorted(os.listdir(OUT)): print(f, round(os.path.getsize(OUT+f)/1e6,2),'MB')
