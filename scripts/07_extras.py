import pandas as pd, glob, numpy as np, re, json
USE=['MonitoringLocationIdentifier','ActivityStartDate','CharacteristicName','ResultSampleFractionText','ResultMeasureValue','ResultMeasure/MeasureUnitCode','ResultStatusIdentifier','ResultDetectionConditionText','MeasureQualifierCode']
def load(pat):
    out=[]
    for f in glob.glob(pat):
        try: out.append(pd.read_csv(f,dtype=str,usecols=lambda c:c in USE))
        except Exception as e: print('bad',f,e)
    return pd.concat(out)
d=pd.concat([load('all_canal/*.csv'),load('all_ref/*.csv')])
names=set(open('extra_names.txt').read().split('|'))
d=d[d.CharacteristicName.isin(names)]
d=d[~d.ResultStatusIdentifier.fillna('').str.contains('Rejected',case=False)]
d['frac']=d.ResultSampleFractionText.fillna('')
d=d[~((d.CharacteristicName=='Phosphorus')&(d.frac.isin(['Total',''])))]
# canonical keys (merge fraction/label quirks)
def canon(c,f):
    if c in ('pH','Temperature, water','True color','Apparent color','Specific conductance','Dissolved oxygen saturation','Depth, Secchi disk depth'): return c
    if c.startswith('Inorganic nitrogen (nitrate and nitrite)') or c=='Nitrate + Nitrite': return 'Nitrate + Nitrite'+(' (dissolved)' if f=='Dissolved' else '')
    if c=='Kjeldahl nitrogen': return 'Total Kjeldahl nitrogen (Organic N & NH3)'
    if c=='Ammonia-nitrogen': return 'Ammonia'+(' (dissolved)' if f=='Dissolved' else '')
    if c=='Ammonia': return 'Ammonia'+(' (dissolved)' if f=='Dissolved' else '')
    if c=='Orthophosphate' or c=='Phosphate-phosphorus': return 'Orthophosphate'+(' (dissolved)' if f=='Dissolved' else ' (total)')
    if f=='Dissolved': return c+' (dissolved)'
    return c
d['key']=[canon(c,f) for c,f in zip(d.CharacteristicName,d.frac)]
d['v']=pd.to_numeric(d.ResultMeasureValue,errors='coerce')
nd=d.ResultDetectionConditionText.fillna('').str.contains('Not Detected|Below|Not Present|Present Below|Detected Not Quantified|<',case=False)
q=d.MeasureQualifierCode.fillna('').str.upper().str.split(r'[;,\s]+')
nd=nd|d.ResultMeasureValue.fillna('').str.contains('non-detect|<|ND',case=False)
d['nd']=nd|q.apply(lambda L: any(x in ('U','K','<','ND','BDL') for x in L))
d=d[d.v.notna()|d.nd]
d['u']=d['ResultMeasure/MeasureUnitCode'].fillna('').str.strip().str.lower().replace({'ppm':'mg/l','ppb':'ug/l','mg/l as p':'mg/l','mg/l as n':'mg/l','mg/l po4':'mg/l','umho/cm':'us/cm','mmho/cm':'ms/cm','mg/m3':'ug/l','std units':'','none':'','#/100ml':'cfu/100ml'})
dom=d[d.v.notna()].groupby(['key','u']).size().reset_index(name='n').sort_values('n',ascending=False).drop_duplicates('key').set_index('key').u
d['dom']=d.key.map(dom)
CF={('ug/l','mg/l'):1e-3,('mg/l','ug/l'):1e3,('ng/l','ug/l'):1e-3,('us/cm','ms/cm'):1e-3,('ms/cm','us/cm'):1e3,('ft','m'):0.3048,('in','m'):0.0254,('deg f','deg c'):'F'}
f=[]
for a,b in zip(d.u,d.dom):
    f.append(1.0 if a==b else CF.get((a,b),np.nan))
d['f']=f
d=d[(d.f.notna())|(d.nd&d.v.isna())]
ff=pd.to_numeric(d.f,errors='coerce')
d['val']=np.where(d.f=='F',(d.v-32)*5/9,d.v*ff)
d.loc[d.nd,'val']=np.nan   # non-detects carried as NaN with nd flag
d['date']=pd.to_datetime(d.ActivityStartDate,errors='coerce'); d=d[d.date.notna()]
# plausibility trims
lim={'pH':(2,12),'Temperature, water':(5,40),'Dissolved oxygen saturation':(0,300),'Depth, Secchi disk depth':(0,30)}
for k,(a,b) in lim.items(): d=d[~((d.key==k)&d.val.notna()&~d.val.between(a,b))]
d=d[~(d.val<0)]
st=pd.read_csv('station_summary.csv',usecols=['MonitoringLocationIdentifier','setting'])
d=d[d.MonitoringLocationIdentifier.isin(st.MonitoringLocationIdentifier)]
def floor_share(x):
    x=x.dropna()
    if len(x)<10: return 0.0
    m=x.mode().iloc[0]
    return float((x==m).mean()) if m<=x.quantile(.1) else 0.0
summ=d.groupby('key').agg(floor=('val',floor_share),stations=('MonitoringLocationIdentifier','nunique'),rows=('nd','size'),nd_share=('nd','mean'),unit=('dom','first'),med=('val','median'),p95=('val',lambda x:x.quantile(.95)))
cst=d.merge(st,on='MonitoringLocationIdentifier').query("setting=='Canal'").groupby('key').MonitoringLocationIdentifier.nunique()
summ['canal_stations']=cst; summ=summ[summ.canal_stations>=30]
d=d[d.key.isin(summ.index)]
print(summ.sort_values('canal_stations',ascending=False).to_string())
summ.to_csv('extras_summary.csv')
d[['MonitoringLocationIdentifier','date','key','val','nd']].to_parquet('extras_clean.parquet')
