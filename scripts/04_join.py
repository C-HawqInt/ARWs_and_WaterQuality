import geopandas as gpd, pandas as pd, numpy as np
p=gpd.read_file('polys_net.gpkg'); p['PID']=range(len(p))
r=pd.read_parquet('results_clean.parquet')
st=pd.read_csv('fl_stations.csv',low_memory=False,usecols=['OrganizationFormalName','MonitoringLocationIdentifier','MonitoringLocationName','MonitoringLocationTypeName','LatitudeMeasure','LongitudeMeasure','ProviderName']).drop_duplicates('MonitoringLocationIdentifier')
cin=pd.read_csv('stations_in_canals.csv',usecols=['MonitoringLocationIdentifier','PID'])
ref=pd.read_csv('ref500.csv',usecols=['MonitoringLocationIdentifier','PID','d_m'])
cin['setting']='Canal'; ref['setting']='Open water (≤500 m)'; cin['d_m']=0
S=pd.concat([cin,ref]).merge(st,on='MonitoringLocationIdentifier')
# canal stations get networks; centerline snap distance
cl=gpd.read_file('cl_net.gpkg')
g=gpd.GeoDataFrame(S,geometry=gpd.points_from_xy(S.LongitudeMeasure,S.LatitudeMeasure),crs=4326).to_crs(p.crs)
sn=gpd.sjoin_nearest(g[g.setting=='Canal'][['MonitoringLocationIdentifier','geometry']],cl[['net','LEN_M','geometry']],distance_col='d_centerline_m').drop_duplicates('MonitoringLocationIdentifier')
S=S.merge(sn[['MonitoringLocationIdentifier','d_centerline_m']],on='MonitoringLocationIdentifier',how='left')
keep=['PID','CHAWQ_ID','County','WMDNAME','WATERBODY_','WBID','TYP_FORM','TYP_RECWAT','TYP_CONNEC','TYP_SCALE','TYP_ORIGIN','NumMouth','HCon_Num','SYSTEM_ID','SYS_NPOLY','area_acres','poly_cl_km','net','net_len_km','n_junctions','n_tips']
S=S.merge(pd.DataFrame(p[keep]),on='PID',how='left')
S['TYP_FORM']=S.TYP_FORM.replace({'Single Channel':'Single channel'})
S['mouth_class']=np.where(S.NumMouth>=2,'2+ mouths',np.where(S.NumMouth==1,'1 mouth','0 / unknown'))
S['km_per_mouth']=S.net_len_km/S.NumMouth.clip(lower=1)
# station summaries
r=r[r.sid.isin(S.MonitoringLocationIdentifier)]
agg=r.groupby(['sid','param']).v.agg(['median','count']).unstack()
med=agg['median']; med.columns=[f'med_{c}' for c in med.columns]
cnt=agg['count']; cnt.columns=[f'n_{c}' for c in cnt.columns]
do=r[r.param=='DO'].groupby('sid').v
extra=pd.DataFrame({'pct_DO_lt4':do.apply(lambda x:(x<4).mean()*100),'pct_DO_lt2':do.apply(lambda x:(x<2).mean()*100)})
yrs=r.groupby('sid').date.agg(first='min',last='max',n_dates='nunique')
summ=pd.concat([med,cnt,extra,yrs],axis=1).reset_index().rename(columns={'sid':'MonitoringLocationIdentifier'})
S=S.merge(summ,on='MonitoringLocationIdentifier',how='inner')
S['first']=S['first'].dt.date.astype(str); S['last']=S['last'].dt.date.astype(str)
S.to_csv('station_summary.csv',index=False)
print(S.setting.value_counts()); print(S[S.setting=='Canal'].TYP_FORM.value_counts())
print(S.groupby('setting')[['med_DO','med_TN','med_TP','med_CHLA','med_ENT','med_SAL']].median())
