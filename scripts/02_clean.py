import pandas as pd, glob, numpy as np
dfs=[]
for tag in ['canal','ref']:
    for f in sorted(glob.glob(f'res_{tag}/*.csv')):
        d=pd.read_csv(f,low_memory=False,dtype=str); d['grp']=tag; dfs.append(d)
r=pd.concat(dfs)
r=r[['MonitoringLocationIdentifier','ActivityStartDate','ActivityStartTime/Time','CharacteristicName','ResultSampleFractionText','ResultMeasureValue','ResultMeasure/MeasureUnitCode','ResultStatusIdentifier','grp']].copy()
r.columns=['sid','date','time','char','frac','val','unit','status','grp']
r['v']=pd.to_numeric(r.val,errors='coerce')
u=r.unit.fillna('').str.strip().str.lower(); c=r.char.fillna('')
p=np.full(len(r),None,dtype=object); v=r.v.to_numpy(copy=True)
r=r.reset_index(drop=True); u=u.reset_index(drop=True); c=c.reset_index(drop=True); fr=r.frac.fillna('Total')
def setp(m,name,f=None):
    m=m.values; p[m]=name
    if f: v[m]=f(v[m])
setp((c=='Dissolved oxygen (DO)')&u.isin(['mg/l','ppm']),'DO')
setp((c=='Dissolved oxygen saturation')|((c=='Dissolved oxygen (DO)')&(u=='%')),'DOsat')
mN=c.str.startswith('Nitrogen, mixed')|(c=='Total Nitrogen, mixed forms')|((c=='Nitrogen')&(fr=='Total'))
setp(mN&u.isin(['mg/l','ppm']),'TN'); setp(mN&(u=='ug/l'),'TN',lambda x:x/1000)
mP=(c=='Phosphorus')&(fr=='Total')
setp(mP&u.isin(['mg/l','mg/l as p','ppm']),'TP'); setp(mP&(u=='ug/l'),'TP',lambda x:x/1000)
mC=c.str.startswith('Chlorophyll a')
setp(mC&u.isin(['ug/l','mg/m3','ppb']),'CHLA'); setp(mC&(u=='mg/l'),'CHLA',lambda x:x*1000)
setp((c=='Enterococcus')&u.isin(['mpn/100ml','cfu/100ml','#/100ml','mpn']),'ENT')
setp((c=='Salinity')&u.isin(['ppth','pss','ppt','psu']),'SAL')
setp((c=='Temperature, water')&(u=='deg c'),'TEMP'); setp((c=='Temperature, water')&(u=='deg f'),'TEMP',lambda x:(x-32)*5/9)
setp((c=='Turbidity')&u.isin(['ntu','fnu']),'TURB')
r['param']=p; r['v']=v
r=r[r.param.notna()&r.v.notna()]
r=r[~r.status.fillna('').str.contains('Rejected',case=False)]
lim={'DO':(0,25),'DOsat':(0,300),'TN':(0,20),'TP':(0,5),'CHLA':(0,500),'ENT':(0,1e6),'SAL':(0,50),'TEMP':(5,40),'TURB':(0,1000)}
keep=np.zeros(len(r),bool)
for k,(a,b) in lim.items(): keep|=((r.param==k)&r.v.between(a,b)).values
r=r[keep]
r['date']=pd.to_datetime(r.date,errors='coerce'); r=r[r.date.notna()]
r[['sid','date','time','param','v','grp']].to_parquet('results_clean.parquet')
print(r.groupby(['grp','param']).size().unstack(0)); print(r.groupby('grp').sid.nunique())
