import pandas as pd, requests, sys, os, concurrent.futures as cf
ids=list(pd.read_csv(sys.argv[1]).MonitoringLocationIdentifier.unique()); tag=sys.argv[2]
chars=sys.argv[3].split('|') if len(sys.argv)>3 else None
os.makedirs('all_'+tag,exist_ok=True)
def get(i):
    fn=f'all_{tag}/b{i:05d}.csv'
    if os.path.exists(fn) and os.path.getsize(fn)>0: return i,'cached'
    body={"siteid":ids[i:i+150],"startDateLo":"01-01-2015","dataProfile":"narrowResult"}
    if chars: body["characteristicName"]=chars
    for a in range(3):
        try:
            r=requests.post("https://www.waterqualitydata.us/data/Result/search?mimeType=csv&zip=no&dataProfile=narrowResult",json=body,timeout=900)
            if r.status_code==200: open(fn,'wb').write(r.content); return i,len(r.content)
        except Exception as e: pass
    return i,'fail'
with cf.ThreadPoolExecutor(6) as ex:
    for res in ex.map(get, range(0,len(ids),150)): print(res, flush=True)
