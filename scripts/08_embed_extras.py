import pandas as pd, numpy as np, json, re
s=pd.read_csv('extras_summary.csv').sort_values('canal_stations',ascending=False).reset_index(drop=True)
d=pd.read_parquet('extras_clean.parquet')
LBL={'Total Kjeldahl nitrogen (Organic N & NH3)':'Total Kjeldahl nitrogen (organic N + ammonia)','Temperature, water':'Water temperature','Depth, Secchi disk depth':'Secchi depth (water clarity)',
 'Dissolved oxygen saturation':'Dissolved oxygen saturation','Specific conductance':'Specific conductance','Biochemical oxygen demand, standard conditions':'Biochemical oxygen demand (BOD)',
 'Benzeneacetic acid, .alpha.-methyl-4-(2-methylpropyl)-':'Ibuprofen','Aminomethylphosphonic acid':'AMPA (glyphosate breakdown product)','Fecal Streptococcus Group Bacteria':'Fecal streptococci',
 'Escherichia coli':'E. coli','Fecal Coliform':'Fecal coliform','Alkalinity, total':'Total alkalinity','Organic carbon':'Total organic carbon','Silvex':'Silvex (2,4,5-TP)','Calcium carbonate':'Calcium carbonate (as CaCO3)'}
UN={'mg/l':'mg/L','ug/l':'µg/L','deg c':'°C','us/cm':'µS/cm','m':'m','%':'%','pcu':'PCU','mpn/100ml':'MPN/100 mL','cfu/100ml':'CFU/100 mL','':'pH units'}
METALS={'Copper','Arsenic','Lead','Zinc','Cadmium','Iron','Chromium','Nickel','Silver','Selenium','Barium','Antimony','Aluminum','Manganese','Molybdenum','Beryllium','Thallium'}
IONS={'Chloride','Fluoride','Total dissolved solids','Sulfate','Calcium','Magnesium','Total hardness','Sodium','Potassium','Calcium carbonate','Alkalinity, total','Total suspended solids'}
FIELD={'Temperature, water','Specific conductance','pH','Dissolved oxygen saturation','Depth, Secchi disk depth','True color','Apparent color'}
def group(k):
    b=k.replace(' (dissolved)','').replace(' (total)','')
    if b in FIELD: return 'Field measurements'
    if re.search(r'nitrogen|Ammonia|Nitrate|Nitrite|Orthophosphate|Phosph|Organic carbon|Biochemical',b,re.I): return 'Nutrients and organic matter'
    if re.search(r'Chlorophyll|Pheophytin|Microcystin|toxin|Nodularin|Cylindro|Anatoxin',b,re.I): return 'Algae and algal toxins'
    if re.search(r'coli|Coliform|Strep',b,re.I): return 'Bacteria'
    if b in METALS: return 'Metals'
    if b in IONS: return 'Major ions and solids'
    return 'Pesticides, medicines and wastewater tracers'
meta=[]; code={}
for i,r in s.iterrows():
    c='x%d'%i; code[r.key]=c
    p95,med=r.p95,r.med
    f=',.0f' if p95>=100 else '.1f' if p95>=10 else '.2f' if p95>=1 else '.3f' if p95>=0.05 else '.4f'
    base=r.key.replace(' (dissolved)','').replace(' (total)','')
    lab=LBL.get(base,base)+(' (dissolved)' if '(dissolved)' in r.key else ' (total)' if '(total)' in r.key else '')
    logq = base not in ('pH','Temperature, water','Dissolved oxygen saturation','Depth, Secchi disk depth') and med>0 and p95/med>8
    meta.append(dict(code=c,key=r.key,label=lab,unit=UN.get(str(r.unit) if r.unit==r.unit else '',str(r.unit)),group=group(r.key),stations=int(r.stations),canal_stations=int(r.canal_stations),nd_share=round(float(max(r.nd_share,r.floor)),3),log=bool(logq),f=f))
json.dump(meta,open('extras_meta.json','w'),separators=(',',':'))
d['code']=d.key.map(code); d=d[d.code.notna()]
d['dd']=(d.date-pd.Timestamp('2015-01-01')).dt.days.astype(int)
S=json.load(open('samples_compact.json'))
sig=lambda v: None if (v!=v) else float(f'{v:.3g}')
for (sid,c),g in d.sort_values('dd').groupby(['MonitoringLocationIdentifier','code']):
    S.setdefault(sid,{})[c]=[g.dd.tolist(),[sig(v) for v in g.val]]
t=json.dumps(S,separators=(',',':')); open('samples_all.json','w').write(t)
print(len(meta), len(t)/1e6, 'MB'); import collections; print(collections.Counter(m['group'] for m in meta))
