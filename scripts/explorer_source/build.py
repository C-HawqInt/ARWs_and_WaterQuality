import base64
D='/home/claude/data/'
logo_c='data:image/png;base64,'+base64.b64encode(open('/mnt/skills/plugins/chawq-design/assets/logo-color.png','rb').read()).decode()
logo_w='data:image/png;base64,'+base64.b64encode(open('/mnt/skills/plugins/chawq-design/assets/logo-white.png','rb').read()).decode()
tok=open('/mnt/skills/plugins/chawq-design/assets/chawq-tokens.css').read()
comp=open('/mnt/skills/plugins/chawq-design/assets/chawq-components.css').read()
body=open('body.html').read().replace('__LOGO_COLOR__',logo_c).replace('__LOGO_WHITE__',logo_w)
def blk(id,path,typ='text/csv'):
    t=open(path).read().strip(); assert '</script' not in t.lower()
    return f'<script type="{typ}" id="{id}">\n{t}\n</script>\n'
data=''.join([blk('d-stations',D+'dash/stations.csv'),blk('d-polygons',D+'emb_polygons.csv'),blk('d-centerlines',D+'emb_centerlines.csv'),blk('d-counties',D+'dash/fl_counties.csv'),
 blk('d-cvo',D+'dash/canal_vs_open.csv'),blk('d-typo',D+'dash/typology_groups.csv'),blk('d-spear',D+'dash/spearman.csv'),blk('d-reg',D+'dash/regression.csv'),blk('d-pairs',D+'dash/paired_canals.csv'),blk('d-annual',D+'dash/annual_medians.csv'),
 blk('d-samples',D+'samples_compact.json','application/json')])
html=f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>C-HAWQ Canal Water Quality Explorer</title>
<link rel="icon" href="{logo_c}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700;800;900&family=Source+Sans+3:ital,wght@0,300;0,400;0,600;0,700;1,400&display=swap" rel="stylesheet">
<style>
{tok}
{comp}
{open('app.css').read()}
</style>
</head>
<body>
{body}
{data}<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script>
{open('app.js').read()}
</script>
</body>
</html>
'''
open('/mnt/user-data/outputs/chawq_canal_wq_explorer.html','w').write(html)
print(len(html)/1e6)
