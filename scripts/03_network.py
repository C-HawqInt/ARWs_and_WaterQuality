import geopandas as gpd, pandas as pd, numpy as np, networkx as nx
p=gpd.read_file('ResCanal_Polygons_10132026_WMDs/ResCanal_Polygons_10132026_WMDs.shp')
c=gpd.read_file('ResCanal_Centerlines_10132026_WMDs/ResCanal_Centerlines_10132026_WMDs.shp')
G=nx.Graph()
key=lambda xy:(round(xy[0],0),round(xy[1],0))
for i,g in enumerate(c.geometry):
    cs=g.coords; a,b=key(cs[0]),key(cs[-1])
    G.add_edge(a,b,seg=i,length=g.length) if not G.has_edge(a,b) else None
comp={}
for k,cc in enumerate(nx.connected_components(G)):
    for n in cc: comp[n]=k
c['net']=[comp[key(g.coords[0])] for g in c.geometry]
deg=dict(G.degree())
netstats=[]
for k,cc in enumerate(nx.connected_components(G)):
    sub=G.subgraph(cc)
    L=sum(d['length'] for *_,d in sub.edges(data=True))
    netstats.append(dict(net=k,net_len_km=L/1000,n_junctions=sum(1 for n in cc if deg[n]>=3),n_tips=sum(1 for n in cc if deg[n]==1)))
ns=pd.DataFrame(netstats)
# polygon -> network (by length-majority of its centerlines)
pc=c.groupby(['SRC_OID','net']).LEN_M.sum().reset_index().sort_values('LEN_M').drop_duplicates('SRC_OID',keep='last')
p=p.merge(pc[['SRC_OID','net']],left_on='CHAWQ_ID',right_on='SRC_OID',how='left')
poly_cl=c.groupby('SRC_OID').LEN_M.sum().rename('poly_cl_km')/1000
p=p.merge(poly_cl,left_on='CHAWQ_ID',right_index=True,how='left')
p=p.merge(ns,on='net',how='left')
print(ns.describe()); print(p[['poly_cl_km','net_len_km','n_junctions','n_tips']].describe())
p.drop(columns=['SRC_OID']).to_file('polys_net.gpkg')
c.to_file('cl_net.gpkg')
