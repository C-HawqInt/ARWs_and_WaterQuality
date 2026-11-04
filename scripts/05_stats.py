import pandas as pd, numpy as np, scipy.stats as ss, statsmodels.formula.api as smf, json
S=pd.read_csv('station_summary.csv')
P={'DO':'Dissolved oxygen (mg/L)','pct_DO_lt4':'Samples below 4 mg/L DO (%)','TN':'Total nitrogen (mg/L)','TP':'Total phosphorus (mg/L)','CHLA':'Chlorophyll a (µg/L)','ENT':'Enterococci (per 100 mL)','TURB':'Turbidity (NTU)','SAL':'Salinity (ppt)'}
def col(k): return k if k.startswith('pct') else f'med_{k}'
MINN=3
def ok(df,k):
    n = df['n_DO'] if k.startswith('pct') else df[f'n_{k}']
    return df[(n>=MINN)&df[col(k)].notna()]
rows=[]
# 1 canal vs open water, unpaired + paired by canal polygon
for k,lab in P.items():
    d=ok(S,k); a=d[d.setting=='Canal'][col(k)]; b=d[d.setting!='Canal'][col(k)]
    mw=ss.mannwhitneyu(a,b) if len(a)>5 and len(b)>5 else None
    pp=d.groupby(['PID','setting'])[col(k)].median().unstack().dropna()
    pp.columns=['canal','open']
    w=ss.wilcoxon(pp.canal,pp.open) if len(pp)>=8 else None
    rows.append(dict(param=k,label=lab,canal_median=a.median(),open_median=b.median(),canal_n=len(a),open_n=len(b),mw_p=mw.pvalue if mw else None,
        paired_n=len(pp),paired_canal_median=pp.canal.median(),paired_open_median=pp.open.median(),paired_median_diff=(pp.canal-pp.open).median(),
        paired_pct_canal_worse=None,wilcoxon_p=w.pvalue if w else None))
cmp=pd.DataFrame(rows)
# "worse" direction
worse={'DO':-1,'pct_DO_lt4':1,'TN':1,'TP':1,'CHLA':1,'ENT':1,'TURB':1,'SAL':0}
for i,rw in cmp.iterrows():
    k=rw.param; d=ok(S,k); pp=d.groupby(['PID','setting'])[col(k)].median().unstack().dropna(); pp.columns=['canal','open']
    if worse[k]!=0 and len(pp): cmp.loc[i,'paired_pct_canal_worse']=100*((pp.canal-pp.open)*worse[k]>0).mean()
print(cmp.round(3).to_string())
cmp.to_csv('stat_canal_vs_open.csv',index=False)
# 2 within canals by typology: Kruskal-Wallis
CA=S[S.setting=='Canal'].copy()
CA["log_net"]=np.log10(CA.net_len_km)
kw=[]
for fac in ['TYP_FORM','TYP_CONNEC','TYP_SCALE','mouth_class','TYP_RECWAT','WMDNAME']:
    for k in ['DO','pct_DO_lt4','TN','TP','CHLA','ENT']:
        d=ok(CA,k); grp=[g[col(k)].values for _,g in d.groupby(fac) if len(g)>=5]
        if len(grp)>=2:
            h=ss.kruskal(*grp)
            meds=d.groupby(fac)[col(k)].agg(['median','count'])
            kw.append(dict(factor=fac,param=k,H=h.statistic,p=h.pvalue,groups=json.dumps({i:[round(m,3),int(n)] for i,(m,n) in meds.iterrows()})))
kw=pd.DataFrame(kw); print(kw[['factor','param','H','p']].round(4).to_string()); kw.to_csv('stat_typology_kw.csv',index=False)
# 3 Spearman with network size metrics
sp=[]
for x in ['net_len_km','km_per_mouth','n_junctions','area_acres','d_centerline_m']:
    for k in ['DO','pct_DO_lt4','TN','TP','CHLA','ENT']:
        d=ok(CA,k).dropna(subset=[x]); r=ss.spearmanr(d[x],d[col(k)])
        sp.append(dict(metric=x,param=k,rho=r.statistic,p=r.pvalue,n=len(d)))
sp=pd.DataFrame(sp); print(sp.round(4).to_string()); sp.to_csv('stat_spearman.csv',index=False)
# 4 regression with controls: log outcome ~ form + log network km + salinity + WMD, cluster SE by network
reg=[]
for k in ['DO','TN','TP','CHLA','ENT']:
    d=ok(CA,k).dropna(subset=['med_SAL','net_len_km','TYP_FORM','net']).copy()
    y=d[col(k)] if k=='DO' else np.log10(d[col(k)].clip(lower=1e-3))
    d['y']=y; d['log_net']=np.log10(d.net_len_km)
    m=smf.ols("y ~ C(TYP_FORM, Treatment('Open basin')) + log_net + med_SAL + C(WMDNAME)",data=d).fit(cov_type='cluster',cov_kwds={'groups':d.net.astype(int)})
    for term in m.params.index:
        if 'WMD' in term or term=='Intercept': continue
        reg.append(dict(param=k,term=term.replace("C(TYP_FORM, Treatment('Open basin'))[T.","Form: ").replace(']',''),coef=m.params[term],lo=m.conf_int().loc[term,0],hi=m.conf_int().loc[term,1],p=m.pvalues[term],n=int(m.nobs),r2=m.rsquared,scale='mg/L' if k=='DO' else 'log10'))
reg=pd.DataFrame(reg); print(reg.round(4).to_string()); reg.to_csv('stat_regression.csv',index=False)
