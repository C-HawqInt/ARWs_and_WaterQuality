import pandas as pd, requests, json, sys, os, concurrent.futures as cf, io
ids=list(pd.read_csv(sys.argv[1]).MonitoringLocationIdentifier.unique())
tag=sys.argv[2]; os.makedirs('res_'+tag,exist_ok=True)
chars=["Dissolved oxygen (DO)","Dissolved oxygen saturation","Nitrogen","Total Nitrogen, mixed forms","Nitrogen, mixed forms (NH3), (NH4), organic, (NO2) and (NO3)","Phosphorus","Chlorophyll a, corrected for pheophytin","Chlorophyll a","Chlorophyll a, uncorrected for pheophytin","Enterococcus","Salinity","Temperature, water","Turbidity"]
def get(i):
    fn=f'res_{tag}/b{i:04d}.csv'
    if os.path.exists(fn) and os.path.getsize(fn)>0: return i,'cached'
    body={"siteid":ids[i:i+200],"characteristicName":chars,"startDateLo":"01-01-2015","dataProfile":"narrowResult"}
    for a in range(3):
        try:
            r=requests.post("https://www.waterqualitydata.us/data/Result/search?mimeType=csv&zip=no&dataProfile=narrowResult",json=body,timeout=600)
            if r.status_code==200:
                open(fn,'wb').write(r.content); return i,len(r.content)
        except Exception as e: err=e
    return i,'fail'
with cf.ThreadPoolExecutor(6) as ex:
    for res in ex.map(get, range(0,len(ids),200)): print(res, flush=True)
