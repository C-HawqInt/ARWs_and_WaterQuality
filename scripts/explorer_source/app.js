(() => {
'use strict';
const $ = (id) => document.getElementById(id);
const raw = (id) => $(id).textContent;
const num = (x) => (x === '' || x == null || x === 'NA') ? NaN : +x;
const fmt = (f, v) => Number.isFinite(v) ? d3.format(f)(v) : '—';
const jit = (i) => { const t = Math.sin((i + 1) * 12.9898) * 43758.5453; return t - Math.floor(t); };

// ---------------- constants ----------------
const P = {
  DO:{label:'Dissolved oxygen',unit:'mg/L',col:'med_DO',n:'n_DO',log:false,f:'.2f',hi:'good',s:'DO'},
  pct_DO_lt4:{label:'Readings below 4 mg/L oxygen',unit:'%',col:'pct_DO_lt4',n:'n_DO',log:false,f:'.0f',hi:'bad',s:'DO'},
  TN:{label:'Total nitrogen',unit:'mg/L',col:'med_TN',n:'n_TN',log:true,f:'.2f',hi:'bad',s:'TN'},
  TP:{label:'Total phosphorus',unit:'mg/L',col:'med_TP',n:'n_TP',log:true,f:'.3f',hi:'bad',s:'TP'},
  CHLA:{label:'Chlorophyll a (algae)',unit:'µg/L',col:'med_CHLA',n:'n_CHLA',log:true,f:'.1f',hi:'bad',s:'CHLA'},
  ENT:{label:'Enterococci (fecal bacteria)',unit:'per 100 mL',col:'med_ENT',n:'n_ENT',log:true,f:',.0f',hi:'bad',s:'ENT'},
  TURB:{label:'Turbidity (cloudiness)',unit:'NTU',col:'med_TURB',n:'n_TURB',log:true,f:'.1f',hi:'bad',s:'TURB'},
  SAL:{label:'Salinity',unit:'ppt',col:'med_SAL',n:'n_SAL',log:false,f:'.1f',hi:null,s:'SAL'}
};
const SUNIT = {DO:'mg/L',TN:'mg/L',TP:'mg/L',CHLA:'ug/L',ENT:'per 100 mL',SAL:'ppt',TURB:'NTU'};
const FACT = {TYP_FORM:'Canal form',TYP_CONNEC:'Connectivity',TYP_SCALE:'Size class',mouth_class:'Number of mouths',TYP_RECWAT:'Receiving water',WMDNAME:'Water management district'};
const ORDER = {TYP_FORM:['Open basin','Single channel','Finger','Branching/Dendritic'],TYP_CONNEC:['Dead-End','Single-Mouth','Through-Flow/Multi-Mouth'],TYP_SCALE:['Small','Moderate','Large','Very Large/Mega'],mouth_class:['0 / unknown','1 mouth','2+ mouths']};
const METRIC = {n_junctions:{label:'Junctions in the canal network',scale:'symlog'},net_len_km:{label:'Navigable network length (km)',scale:'log'},km_per_mouth:{label:'Network km per mouth',scale:'log'},area_acres:{label:'Canal polygon area (acres)',scale:'log'}};
// brand tokens
const C = {navy:'#1f396d',navy900:'#142749',navy500:'#3a5ea0',navy300:'#7a90bb',sky:'#48c5e3',sky700:'#2aa3c2',sky900:'#1d7c94',sky100:'#d0eff7',green:'#3f886c',green500:'#5ba988',green900:'#255241',warn:'#d98e1a',danger:'#b4331f',muted:'#8a94a9'};
const FORMCOL = {'Open basin':C.sky,'Single channel':C.green500,'Finger':C.navy500,'Branching/Dendritic':C.navy900};
const DOBIN = [{t:'Healthy (5+ mg/L)',c:C.green,test:v=>v>=5},{t:'Some stress (2–5)',c:C.warn,test:v=>v>=2&&v<5},{t:'Low (below 2)',c:C.danger,test:v=>v<2}];
const RAMP = [C.sky100,C.sky,C.sky900,C.navy500,C.navy900];
const SERIES = [C.navy,C.sky700,C.green,C.warn,C.danger,C.navy300,C.sky900,C.green900,'#65728c',C.green500];
const SETCOL = {Canal:C.navy,'Open water':C.sky700};
const NUMS = ['lat','lon','dist_to_canal_m','NumMouth','HCon_Num','SYS_NPOLY','area_acres','poly_cl_km','net_len_km','n_junctions','n_tips','km_per_mouth','d_centerline_m','med_DO','med_DOsat','med_TN','med_TP','med_CHLA','med_ENT','med_SAL','med_TEMP','med_TURB','pct_DO_lt4','pct_DO_lt2','n_DO','n_TN','n_TP','n_CHLA','n_ENT','n_SAL','n_TURB','n_dates','CHAWQ_ID'];
const D0 = Date.UTC(2015, 0, 1), DAY = 864e5;

// ---------------- data ----------------
const csv = (id, f) => { const t = d3.csvParse(raw(id).trim(), f); return t; };
const ST = csv('d-stations', (r) => { NUMS.forEach(k => r[k] = num(r[k])); return r; });
const ST_COLS = Object.keys(ST[0] || {});
const BYID = new Map(ST.map(r => [r.station_id, r]));
const POLY = csv('d-polygons');
const POLY_COLS = POLY.columns.filter(c => c !== 'geom');
const CL = csv('d-centerlines');
const CNTY = csv('d-counties');
const nz = (cols) => (r) => { cols.forEach(k => r[k] = num(r[k])); return r; };
const CVO = csv('d-cvo', nz(['canal_median','open_median','canal_n','open_n','mw_p','paired_n','paired_canal_median','paired_open_median','paired_median_diff','paired_pct_canal_worse','wilcoxon_p']));
const TYPO = csv('d-typo', nz(['median','n','H','p']));
const SPEAR = csv('d-spear', nz(['rho','p','n']));
const REG = csv('d-reg', nz(['coef','lo','hi','p','n','r2']));
const PAIRS = csv('d-pairs', nz(['canal','open','CHAWQ_ID']));
const ANNUAL = csv('d-annual', nz(['year','median','n','stations']));
const SAMPLES = JSON.parse(raw('d-samples'));
const STATS_RAW = {canal_vs_open:raw('d-cvo').trim(),typology_groups:raw('d-typo').trim(),spearman:raw('d-spear').trim(),regression:raw('d-reg').trim(),paired_canals:raw('d-pairs').trim(),annual_medians:raw('d-annual').trim()};
const parseGeom = (s) => (s || '').split('|').filter(Boolean).map(part => part.split(';').map(r => r.split(' ').map(p => { const i = p.indexOf(','); return [+p.slice(0, i), +p.slice(i + 1)]; })));
POLY.forEach(r => { r._parts = parseGeom(r.geom); });
CL.forEach(r => { r._line = parseGeom(r.geom)[0] ? parseGeom(r.geom)[0][0] : []; });
CNTY.forEach(r => { r._parts = parseGeom(r.geom.replace(/;/g, '|')); });

// ---------------- state ----------------
const DEF = {param:'DO', setting:'all', wmd:'', county:'', form:'', factor:'TYP_FORM', metric:'n_junctions'};
const S = Object.assign({}, DEF, {page:'map', tool:'pan', compare:[], sel:null});
const set = (patch) => { Object.assign(S, patch); render(); };
function filt(list, opt = {}) {
  return list.filter(r => (opt.noSetting || S.setting === 'all' || r.setting === S.setting)
    && (!S.wmd || r.WMDNAME === S.wmd) && (!S.county || r.County === S.county) && (!S.form || r.TYP_FORM === S.form));
}
const polyFilt = (r) => (!S.wmd || r.WMDNAME === S.wmd) && (!S.county || r.County === S.county) && (!S.form || r.TYP_FORM === S.form);

// ---------------- helpers ----------------
function tip(box, lines, x, y) {
  let t = box.querySelector(':scope > .tt'); if (!t) { t = document.createElement('div'); t.className = 'tt'; box.appendChild(t); }
  if (!lines) { t.style.display = 'none'; return; }
  t.replaceChildren(...lines); t.style.display = 'block';
  const bw = box.clientWidth, tw = t.offsetWidth, th = t.offsetHeight;
  t.style.left = Math.max(4, Math.min(bw - tw - 4, x + 14)) + 'px'; t.style.top = Math.max(4, y - th - 10) + 'px';
}
const L = (k, v) => { const d = document.createElement('div'); if (k) { const s = document.createElement('span'); s.className = 'k'; s.textContent = k + ' '; d.appendChild(s); } d.appendChild(document.createTextNode(v)); return d; };
const axisStyle = (g) => g.attr('font-size', null).attr('font-family', null).attr('class', 'axis');
const emptyMsg = (box, msg) => { const p = document.createElement('p'); p.className = 'note'; p.textContent = msg; box.replaceChildren(p); };
const fv = (k, v) => fmt(P[k].f, v);
const ylab = (svg, H, m, text) => svg.append('text').attr('class', 'lbl16').attr('transform', `translate(14,${(m.t + H - m.b) / 2}) rotate(-90)`).attr('text-anchor', 'middle').text(text);
const xlab = (svg, W, H, m, text) => svg.append('text').attr('class', 'lbl16').attr('x', (m.l + W - m.r) / 2).attr('y', H - 4).attr('text-anchor', 'middle').text(text);
const ticksN = (W) => Math.max(3, Math.min(7, Math.floor(W / 110)));
const yscale = (meta, ext, H, m) => meta.log ? d3.scaleLog([ext[0] / 1.15, ext[1] * 1.15], [H - m.b, m.t]) : d3.scaleLinear([Math.max(0, ext[0] - (ext[1] - ext[0]) * 0.06), ext[1] + (ext[1] - ext[0]) * 0.06 || 1], [H - m.b, m.t]);
const logTicks = (sc, n) => sc.ticks(n).filter(v => ['1','2','5'].includes(d3.format('.0e')(v)[0]));
const svgBox = (W, H) => d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
function gridY(svg, y, W, m, meta) { svg.append('g').attr('class', 'gridl').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(meta && meta.log ? logTicks(y, 6) : y.ticks(5)).tickSize(-(W - m.l - m.r)).tickFormat('')); }
function axisY(svg, y, m, meta) { svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(meta && meta.log ? logTicks(y, 6) : y.ticks(5)).tickFormat(d3.format('~g'))).call(axisStyle); }
const csvCell = (v) => { if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return ''; const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCSV = (list, cols) => [cols.join(','), ...list.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\n');

// ---------------- downloads ----------------
let dlCap;
async function getDl() {
  if (dlCap !== undefined) return dlCap;
  dlCap = null;
  if (window.claude && typeof window.claude.use === 'function') { try { dlCap = await window.claude.use('downloads'); } catch (e) { dlCap = null; } }
  return dlCap;
}
async function saveFile(filename, data, statusEl) {
  const blob = data instanceof Blob ? data : new Blob([data], {type: filename.endsWith('.csv') ? 'text/csv' : 'application/json'});
  statusEl.textContent = 'Preparing ' + filename + '…';
  const cap = await getDl();
  if (cap) {
    try { await cap.save({filename, data: blob}); statusEl.textContent = 'Saved ' + filename + '.'; }
    catch (e) { statusEl.textContent = e && e.code === 'declined' ? 'Download cancelled.' : 'Download did not complete (' + ((e && e.code) || 'error') + ').'; }
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  statusEl.textContent = 'Downloaded ' + filename + '.';
}
function polyFeature(r) {
  const props = {}; POLY_COLS.forEach(c => { const v = r[c]; props[c] = v === '' ? null : (isFinite(+v) && c !== 'WBID' && c !== 'HUC' ? +v : v); });
  return {type:'Feature', properties:props, geometry: r._parts.length === 1 ? {type:'Polygon', coordinates:r._parts[0]} : {type:'MultiPolygon', coordinates:r._parts}};
}
const clFeature = (r) => ({type:'Feature', properties:{CHAWQ_ID:num(r.CHAWQ_ID), network_id:num(r.network_id), length_m:num(r.LEN_M)}, geometry:{type:'LineString', coordinates:r._line}});
const fc = (features) => JSON.stringify({type:'FeatureCollection', name:'chawq', crs:{type:'name', properties:{name:'urn:ogc:def:crs:OGC:1.3:CRS84'}}, features});
function samplesCSV(ids) {
  const out = ['station_id,setting,date,parameter,value,unit'];
  ids.forEach(id => { const s = SAMPLES[id]; if (!s) return; const st = BYID.get(id);
    Object.keys(s).forEach(p => { const [d, v] = s[p]; for (let i = 0; i < d.length; i++) out.push([id, st ? st.setting : '', new Date(D0 + d[i] * DAY).toISOString().slice(0, 10), p, v[i], SUNIT[p] || ''].map(csvCell).join(',')); }); });
  return out.join('\n');
}
async function zipAndSave(files, name, statusEl) {
  if (files.length === 1) return saveFile(files[0][0], files[0][1], statusEl);
  if (typeof JSZip === 'undefined') { statusEl.textContent = 'Zip library unavailable; saving files one at a time.'; for (const f of files) await saveFile(f[0], f[1], statusEl); return; }
  const z = new JSZip(); files.forEach(([n, d]) => z.file(n, d));
  z.file('README.txt', 'C-HAWQ Canal Water Quality Explorer export, ' + new Date().toISOString().slice(0, 10) + '\nGeometry: WGS84 longitude/latitude, simplified to about 5 m.\nWater quality: Water Quality Portal (waterqualitydata.us), results 2015-2026, downloaded 2026-10-16.\nStation medians use all samples since 2015; tests use stations with 3+ samples.\n');
  statusEl.textContent = 'Building zip…';
  const blob = await z.generateAsync({type:'blob', compression:'DEFLATE'});
  return saveFile(name, blob, statusEl);
}

// ---------------- controls ----------------
Object.keys(P).forEach(k => $('f-param').add(new Option(P[k].label, k)));
const bind = (id, key) => $(id).addEventListener('change', (e) => set({[key]: e.target.value}));
bind('f-param', 'param'); bind('f-setting', 'setting'); bind('f-wmd', 'wmd'); bind('f-county', 'county'); bind('f-form', 'form'); bind('f-factor', 'factor'); bind('f-metric', 'metric');
$('f-reset').addEventListener('click', () => set(Object.assign({}, DEF)));
function fillSelect(el, values, allLabel, cur) {
  const key = values.join('|');
  if (el.dataset.k !== key) { el.replaceChildren(new Option(allLabel, ''), ...values.map(v => new Option(v, v))); el.dataset.k = key; }
  el.value = cur || '';
}
const uniq = (key, list) => [...new Set(list.map(r => r[key]).filter(Boolean))].sort();

// ---------------- pages ----------------
const PAGES = ['map','findings','types','network','data','methods'];
function route() {
  const h = (location.hash || '#map').slice(1); S.page = PAGES.includes(h) ? h : 'map';
  PAGES.forEach(p => { $('page-' + p).hidden = p !== S.page; });
  document.querySelectorAll('.mk-nav a').forEach(a => a.classList.toggle('active', a.dataset.page === S.page));
  $('hero').hidden = S.page !== 'map';
  $('filters').hidden = S.page === 'methods';
  render();
}
window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });

// ---------------- hero ----------------
function drawHero() {
  const r = CVO.find(x => x.param === 'DO');
  if (r) { $('s1').textContent = d3.format('+.2f')(r.paired_median_diff); $('s2').textContent = d3.format('.0f')(r.paired_pct_canal_worse) + '%'; }
  $('s3').textContent = d3.format(',')(ST.filter(s => s.setting === 'Canal').length);
}

// ================= MAP =================
const mapBox = $('mapbox'), cv = $('mapcv');
let proj = null, base = null, baseKey = '', zt = d3.zoomIdentity, qt = null, picked = null, hovered = null, mapVis = [], mapColor = null, drawPath = null;
const zoom = d3.zoom().scaleExtent([1, 1200])
  .filter((e) => S.tool === 'pan' ? (!e.ctrlKey || e.type === 'wheel') && !e.button : e.type === 'wheel')
  .on('zoom', (e) => { zt = e.transform; drawCanvas(); });
d3.select(cv).call(zoom);
function buildBase(W, H) {
  const key = W + 'x' + H; if (key === baseKey && base) return;
  const pts = CNTY.flatMap(c => c._parts.flat(2));
  proj = d3.geoMercator().fitExtent([[12, 12], [W - 12, H - 12]], {type:'MultiPoint', coordinates:pts});
  const pr = (parts) => parts.map(rings => rings.map(r => r.map(p => proj(p))));
  base = {
    counties: CNTY.map(c => pr(c._parts)),
    polys: POLY.map(r => { const parts = pr(r._parts); const ext = parts[0] ? parts[0][0] : []; const c = ext.length > 2 ? d3.polygonCentroid(ext) : (ext[0] || [0, 0]); return {r, parts, cx:c[0], cy:c[1]}; }),
    cl: CL.map(r => { const l = r._line.map(p => proj(p)); const m = l[Math.floor(l.length / 2)] || [0, 0]; return {r, l, mx:m[0], my:m[1]}; }),
    st: ST.map(r => { const p = proj([r.lon, r.lat]); return {r, x:p[0], y:p[1]}; })
  };
  baseKey = key;
}
function colorFor(k, vals) {
  if (k === 'DO') return {f:(v) => (DOBIN.find(b => b.test(v)) || {}).c, legend:DOBIN.map(b => [b.c, b.t])};
  if (vals.length < 5) return {f:() => C.navy500, legend:[]};
  const q = d3.scaleQuantile(vals, RAMP), th = q.quantiles();
  return {f:q, legend:RAMP.map((c, i) => [c, i === 0 ? 'below ' + fv(k, th[0]) : i === RAMP.length - 1 ? fv(k, th[th.length - 1]) + ' and up' : fv(k, th[i - 1]) + '–' + fv(k, th[i])])};
}
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function drawMap() {
  const W = mapBox.clientWidth, H = mapBox.clientHeight; if (!W) return;
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  buildBase(W, H);
  const meta = P[S.param];
  const vis = new Set(filt(ST).map(r => r.station_id));
  mapVis = base.st.filter(s => vis.has(s.r.station_id));
  mapColor = colorFor(S.param, mapVis.map(s => s.r[meta.col]).filter(Number.isFinite));
  qt = d3.quadtree(mapVis, s => s.x, s => s.y);
  const lg = $('map-legend'); lg.replaceChildren();
  const t = document.createElement('span'); t.textContent = meta.label + ', station median (' + meta.unit + '):'; lg.appendChild(t);
  mapColor.legend.forEach(([c, txt]) => { const s = document.createElement('span'); const w = document.createElement('i'); w.className = 'sw'; w.style.background = c; s.append(w, txt); lg.appendChild(s); });
  const nd = document.createElement('span'); const w0 = document.createElement('i'); w0.className = 'sw'; w0.style.background = C.muted; nd.append(w0, 'not measured'); lg.appendChild(nd);
  Object.entries(FORMCOL).forEach(([f, c]) => { const s = document.createElement('span'); const w = document.createElement('i'); w.className = 'sq'; w.style.background = c; s.append(w, f + ' canal'); lg.appendChild(s); });
  const cnt = document.createElement('span'); cnt.textContent = '· ' + d3.format(',')(mapVis.length) + ' stations shown'; lg.appendChild(cnt);
  drawCanvas();
}
function drawCanvas() {
  if (!base || S.page !== 'map') return;
  const ctx = cv.getContext('2d'), dpr = window.devicePixelRatio || 1, k = zt.k;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * zt.x, dpr * zt.y);
  const path = (parts) => { ctx.beginPath(); parts.forEach(rings => rings.forEach(r => { r.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); })); };
  ctx.fillStyle = css('--map-land') || '#f2f4f8'; ctx.strokeStyle = css('--map-line') || '#d9dde6'; ctx.lineWidth = 1 / k;
  base.counties.forEach(c => { path(c); ctx.fill('evenodd'); ctx.stroke(); });
  const selPoly = S.sel ? new Set(S.sel.polys) : null;
  base.polys.forEach(p => { if (!polyFilt(p.r)) return; const col = FORMCOL[p.r.TYP_FORM] || C.muted; ctx.globalAlpha = selPoly && !selPoly.has(p.r) ? 0.25 : 0.7; ctx.fillStyle = col; path(p.parts); ctx.fill('evenodd'); if (k < 40) { ctx.strokeStyle = col; ctx.lineWidth = 1.4 / k; ctx.stroke(); } });
  ctx.globalAlpha = 1;
  if (k > 30) { ctx.strokeStyle = css('--ink-3') || '#65728c'; ctx.lineWidth = 1 / k; ctx.setLineDash([4 / k, 3 / k]); ctx.beginPath(); base.cl.forEach(c => c.l.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); ctx.setLineDash([]); }
  const col = P[S.param].col, rad = (k > 80 ? 5.5 : k > 10 ? 4.5 : 3) / k;
  const selSt = S.sel ? new Set(S.sel.stations) : null, cmp = new Set(S.compare);
  ctx.lineWidth = 1 / k; ctx.strokeStyle = '#ffffff';
  mapVis.forEach(s => { const v = s.r[col]; ctx.globalAlpha = selSt && !selSt.has(s.r) ? 0.3 : 1; ctx.beginPath(); ctx.arc(s.x, s.y, s.r.setting === 'Canal' ? rad * 1.15 : rad * 0.85, 0, 2 * Math.PI); ctx.fillStyle = Number.isFinite(v) ? (mapColor.f(v) || C.muted) : C.muted; ctx.fill(); ctx.stroke(); });
  ctx.globalAlpha = 1;
  mapVis.forEach(s => { if (!cmp.has(s.r.station_id)) return; const i = S.compare.indexOf(s.r.station_id); ctx.beginPath(); ctx.arc(s.x, s.y, rad * 2.4, 0, 2 * Math.PI); ctx.lineWidth = 3 / k; ctx.strokeStyle = SERIES[i % SERIES.length]; ctx.stroke(); });
  [picked, hovered].forEach(s => { if (!s) return; ctx.beginPath(); ctx.arc(s.x, s.y, rad * 2.1, 0, 2 * Math.PI); ctx.lineWidth = 2 / k; ctx.strokeStyle = css('--ink') || '#152545'; ctx.stroke(); });
  const shape = drawPath || (S.sel && S.sel.shape);
  if (shape && shape.length > 1) { ctx.beginPath(); shape.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fillStyle = 'rgba(72,197,227,0.12)'; ctx.fill(); ctx.strokeStyle = C.sky900; ctx.lineWidth = 2 / k; ctx.setLineDash([6 / k, 4 / k]); ctx.stroke(); ctx.setLineDash([]); }
}
// hover / click (pan mode)
const pickAt = (e) => { if (!qt) return null; const [mx, my] = d3.pointer(e, cv); const [x, y] = zt.invert([mx, my]); return qt.find(x, y, 10 / zt.k) || null; };
cv.addEventListener('mousemove', (e) => {
  if (S.tool !== 'pan') return;
  const s = pickAt(e); if (s !== hovered) { hovered = s; drawCanvas(); }
  if (!s) { tip(mapBox, null); return; }
  const meta = P[S.param], [mx, my] = d3.pointer(e, mapBox);
  tip(mapBox, [L('', s.r.station_name || s.r.station_id), L(s.r.setting, (s.r.TYP_FORM || '') + (s.r.County ? ' · ' + s.r.County : '')), L(meta.label, fv(S.param, s.r[meta.col]) + ' ' + meta.unit)], mx, my);
});
cv.addEventListener('mouseleave', () => { hovered = null; tip(mapBox, null); drawCanvas(); });
cv.addEventListener('click', (e) => { if (S.tool !== 'pan') return; picked = pickAt(e); drawDetail(); drawCanvas(); });
// drawing tools
document.querySelectorAll('.tools .btn').forEach(b => b.addEventListener('click', () => {
  S.tool = b.dataset.tool; document.querySelectorAll('.tools .btn').forEach(x => x.setAttribute('aria-pressed', x === b));
  mapBox.classList.toggle('drawing', S.tool !== 'pan'); tip(mapBox, null);
  $('maphint').textContent = S.tool === 'rect' ? 'Drag to draw a rectangle. Scroll still zooms.' : S.tool === 'lasso' ? 'Hold and trace around an area. Scroll still zooms.' : 'Scroll to zoom, drag to pan. Click a station for details.';
}));
let dragStart = null;
cv.addEventListener('pointerdown', (e) => {
  if (S.tool === 'pan' || e.button) return;
  cv.setPointerCapture(e.pointerId); const p = zt.invert(d3.pointer(e, cv)); dragStart = p; drawPath = [p]; e.preventDefault();
});
cv.addEventListener('pointermove', (e) => {
  if (!dragStart) return; const p = zt.invert(d3.pointer(e, cv));
  if (S.tool === 'rect') drawPath = [dragStart, [p[0], dragStart[1]], p, [dragStart[0], p[1]]];
  else { const last = drawPath[drawPath.length - 1]; if (Math.hypot((p[0] - last[0]) * zt.k, (p[1] - last[1]) * zt.k) > 3) drawPath.push(p); }
  drawCanvas();
});
cv.addEventListener('pointerup', () => {
  if (!dragStart) return; const shape = drawPath; dragStart = null; drawPath = null;
  if (!shape || shape.length < 3 || Math.abs(d3.polygonArea(shape)) * zt.k * zt.k < 40) { drawCanvas(); return; }
  makeSelection(shape);
});
function makeSelection(shape) {
  const inside = (x, y) => d3.polygonContains(shape, [x, y]);
  const stSet = new Set(filt(ST));
  S.sel = {
    shape,
    stations: base.st.filter(s => stSet.has(s.r) && inside(s.x, s.y)).map(s => s.r),
    polys: base.polys.filter(p => polyFilt(p.r) && inside(p.cx, p.cy)).map(p => p.r),
    cls: base.cl.filter(c => inside(c.mx, c.my)).map(c => c.r)
  };
  drawSelection(); drawCanvas();
}
function drawSelection() {
  const sel = S.sel;
  $('sel-body').hidden = !sel;
  $('sel-note').textContent = sel ? 'Your area holds:' : 'Choose Rectangle or Lasso, then drag on the map. Everything inside that matches your filters is selected.';
  if (!sel) return;
  const dl = $('sel-counts'); dl.replaceChildren();
  const nc = sel.stations.filter(r => r.setting === 'Canal').length;
  const nsmp = sel.stations.reduce((a, r) => a + Object.values(SAMPLES[r.station_id] || {}).reduce((b, x) => b + x[0].length, 0), 0);
  [['Canal polygons', d3.format(',')(sel.polys.length)], ['Centerline segments', d3.format(',')(sel.cls.length)], ['Stations', d3.format(',')(sel.stations.length) + ' (' + d3.format(',')(nc) + ' in canals)'], ['Samples at those stations', d3.format(',')(nsmp)]]
    .forEach(([a, b]) => { const dt = document.createElement('dt'); dt.textContent = a; const dd = document.createElement('dd'); dd.textContent = b; dl.append(dt, dd); });
  $('sel-cmp').disabled = !sel.stations.length;
}
$('sel-clear').addEventListener('click', () => { S.sel = null; drawSelection(); drawCanvas(); $('sel-status').textContent = ''; });
$('sel-cmp').addEventListener('click', () => {
  if (!S.sel) return;
  const nk = P[S.param].n; const ids = S.sel.stations.slice().sort((a, b) => ((b[nk] || 0) - (a[nk] || 0)) || ((b.n_dates || 0) - (a.n_dates || 0))).map(r => r.station_id);
  const merged = [...new Set([...S.compare, ...ids])].slice(0, 10);
  set({compare: merged}); $('cmp-h').scrollIntoView({behavior:'smooth'});
});
$('sel-dl').addEventListener('click', async () => {
  const sel = S.sel; if (!sel) return; const files = [], stamp = new Date().toISOString().slice(0, 10);
  if ($('c-poly').checked) files.push(['canal_polygons.geojson', fc(sel.polys.map(polyFeature))]);
  if ($('c-cl').checked) files.push(['canal_centerlines.geojson', fc(sel.cls.map(clFeature))]);
  if ($('c-st').checked) files.push(['stations.csv', toCSV(sel.stations, ST_COLS)]);
  if ($('c-smp').checked) files.push(['station_samples.csv', samplesCSV(sel.stations.map(r => r.station_id))]);
  if (!files.length) { $('sel-status').textContent = 'Tick at least one layer.'; return; }
  await zipAndSave(files, 'chawq_canal_selection_' + stamp + '.zip', $('sel-status'));
});
$('z-in').addEventListener('click', () => d3.select(cv).transition().duration(300).call(zoom.scaleBy, 2));
$('z-out').addEventListener('click', () => d3.select(cv).transition().duration(300).call(zoom.scaleBy, 0.5));
function fitVisible() {
  const W = mapBox.clientWidth, H = mapBox.clientHeight;
  if (!mapVis.length || !W) { d3.select(cv).transition().duration(500).call(zoom.transform, d3.zoomIdentity); return; }
  const xs = d3.extent(mapVis, s => s.x), ys = d3.extent(mapVis, s => s.y);
  const k = Math.min(1200, 0.85 * Math.min(W / Math.max(xs[1] - xs[0], 0.4), H / Math.max(ys[1] - ys[0], 0.4)));
  d3.select(cv).transition().duration(700).call(zoom.transform, d3.zoomIdentity.translate(W / 2 - k * (xs[0] + xs[1]) / 2, H / 2 - k * (ys[0] + ys[1]) / 2).scale(k));
}
$('z-fit').addEventListener('click', fitVisible);

// detail
function drawDetail() {
  const body = $('d-body');
  if (!picked) { $('d-title').textContent = 'Station details'; $('d-sub').textContent = 'Click any dot on the map.'; body.replaceChildren(); return; }
  const r = picked.r, n2 = (v, f) => fmt(f, v);
  $('d-title').textContent = r.station_name || r.station_id;
  $('d-sub').textContent = r.station_id + ' · ' + (r.organization || '');
  const dl = (pairs) => { const d = document.createElement('dl'); d.className = 'kv'; pairs.forEach(([a, b]) => { const dt = document.createElement('dt'); dt.textContent = a; const dd = document.createElement('dd'); dd.textContent = b; d.append(dt, dd); }); return d; };
  const h = (t) => { const e = document.createElement('h4'); e.textContent = t; return e; };
  const inCmp = S.compare.includes(r.station_id);
  const btn = document.createElement('button'); btn.className = 'btn ' + (inCmp ? '' : 'primary'); btn.textContent = inCmp ? 'Remove from comparison' : 'Add to comparison';
  btn.disabled = !inCmp && S.compare.length >= 10;
  btn.addEventListener('click', () => { set({compare: inCmp ? S.compare.filter(x => x !== r.station_id) : [...S.compare, r.station_id]}); });
  const can = r.setting === 'Canal' ? 'Canal this station sits in' : 'Nearest canal (station is ' + n2(r.dist_to_canal_m, ',.0f') + ' m outside it)';
  body.replaceChildren(btn,
    h('Water quality, ' + String(r.first || '').slice(0, 4) + '–' + String(r.last || '').slice(0, 4)),
    dl([...Object.keys(P).map(k => [P[k].label, Number.isFinite(r[P[k].col]) ? fv(k, r[P[k].col]) + ' ' + P[k].unit + (k === 'pct_DO_lt4' ? '' : ' (n=' + n2(r[P[k].n], ',') + ')') : '—']), ['Sample dates', n2(r.n_dates, ',')]]),
    h(can),
    dl([['Canal ID', n2(r.CHAWQ_ID, 'd')], ['County', r.County || '—'], ['District', r.WMDNAME || '—'], ['Waterbody', r.WATERBODY_ || '—'], ['Form', r.TYP_FORM || '—'], ['Connectivity', r.TYP_CONNEC || '—'], ['Size class', r.TYP_SCALE || '—'], ['Receiving water', r.TYP_RECWAT || '—'], ['Mouths', n2(r.NumMouth, 'd')], ['Area', n2(r.area_acres, ',.1f') + ' acres'], ['Network length', n2(r.net_len_km, ',.2f') + ' km'], ['Junctions', n2(r.n_junctions, ',')], ['Km per mouth', n2(r.km_per_mouth, ',.2f')]])
  );
}

// compare
$('cmp-clear').addEventListener('click', () => set({compare: []}));
function drawCompare() {
  const ids = S.compare.filter(id => BYID.has(id)); const meta = P[S.param];
  const chips = $('cmp-chips'); chips.replaceChildren(...ids.map((id, i) => {
    const r = BYID.get(id), c = document.createElement('span'); c.className = 'chip';
    const sw = document.createElement('i'); sw.className = 'sw'; sw.style.background = SERIES[i % SERIES.length];
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = (r.station_name || id) + ' · ' + r.setting; nm.title = id;
    const x = document.createElement('button'); x.textContent = '×'; x.setAttribute('aria-label', 'Remove ' + id); x.addEventListener('click', () => set({compare: S.compare.filter(v => v !== id)}));
    c.append(sw, nm, x); return c; }));
  $('cmp-empty').hidden = ids.length > 0; $('cmp-grid').hidden = ids.length === 0;
  $('cmp-h').textContent = ids.length ? 'Compare stations: ' + meta.label.toLowerCase() : 'Compare stations';
  if (!ids.length) return;
  // bar chart of medians
  const box = $('ch-cmp-bar'); const rows = ids.map((id, i) => ({id, i, r:BYID.get(id), v:BYID.get(id)[meta.col]}));
  const ok = rows.filter(d => Number.isFinite(d.v));
  $('cmp-bar-t').textContent = 'Station medians: ' + meta.label.toLowerCase();
  if (!ok.length) emptyMsg(box, 'None of these stations measured ' + meta.label.toLowerCase() + '.');
  else {
    const W = box.clientWidth, rowH = 34, m = {t:8, r:70, b:40, l:Math.min(230, W * 0.42)}, H = m.t + m.b + rowH * rows.length;
    const cvo = CVO.find(x => x.param === S.param);
    const refs = cvo ? [['Canal median', cvo.canal_median], ['Open water', cvo.open_median]] : [];
    const mx = d3.max([...ok.map(d => d.v), ...refs.map(x => x[1])]);
    const x = d3.scaleLinear([0, mx * 1.08 || 1], [m.l, W - m.r]), y = d3.scaleBand(rows.map(d => d.id), [m.t, H - m.b]).padding(0.28);
    const svg = svgBox(W, H);
    svg.append('g').attr('class', 'gridl').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(ticksN(W - m.l)).tickSize(-(H - m.t - m.b)).tickFormat(''));
    svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(ticksN(W - m.l)).tickFormat(d3.format('~g'))).call(axisStyle);
    rows.forEach(d => {
      const yy = y(d.id);
      const full = d.r.station_name || d.id, maxc = Math.max(6, Math.floor((m.l - 16) / 8.6));
      svg.append('text').attr('class', 'lbl16').attr('x', m.l - 10).attr('y', yy + y.bandwidth() / 2 + 5).attr('text-anchor', 'end').style('fill', 'var(--ink)').text(full.length > maxc ? full.slice(0, maxc - 1) + '…' : full);
      if (!Number.isFinite(d.v)) { svg.append('text').attr('class', 'lbl16').attr('x', m.l + 6).attr('y', yy + y.bandwidth() / 2 + 5).text('not measured'); return; }
      svg.append('rect').attr('x', m.l).attr('y', yy).attr('height', y.bandwidth()).attr('width', Math.max(2, x(d.v) - m.l)).attr('rx', 4).style('fill', SERIES[d.i % SERIES.length])
        .on('mousemove', (e) => { const [px, py] = d3.pointer(e, box); tip(box, [L('', d.r.station_name || d.id), L(d.r.setting, d.r.County || ''), L('Median', fv(S.param, d.v) + ' ' + meta.unit), L('Samples', fmt(',', d.r[meta.n]))], px, py); })
        .on('mouseleave', () => tip(box, null));
      svg.append('text').attr('class', 'lbl16').attr('x', x(d.v) + 6).attr('y', yy + y.bandwidth() / 2 + 5).style('fill', 'var(--ink)').text(fv(S.param, d.v));
    });
    refs.forEach(([nm, v], j) => { if (!Number.isFinite(v)) return; svg.append('line').attr('x1', x(v)).attr('x2', x(v)).attr('y1', m.t).attr('y2', H - m.b).style('stroke', j ? C.sky900 : C.navy).attr('stroke-dasharray', '5 4').attr('stroke-width', 1.5);
      svg.append('text').attr('class', 'lbl16').attr('x', x(v)).attr('y', H - m.b + 36).attr('text-anchor', j ? 'start' : 'end').attr('dx', j ? 4 : -4).style('fill', j ? C.sky900 : C.navy).text(nm + ' ' + fv(S.param, v)); });
    box.replaceChildren(svg.node());
  }
  // time series
  const tb = $('ch-cmp-ts'); const pk = meta.s;
  $('cmp-ts-t').textContent = 'Every sample over time: ' + P[pk].label.toLowerCase();
  const series = ids.map((id, i) => { const s = SAMPLES[id] && SAMPLES[id][pk]; return {id, i, r:BYID.get(id), pts: s ? s[0].map((d, j) => ({t:new Date(D0 + d * DAY), v:s[1][j]})) : []}; }).filter(s => s.pts.length);
  const pm = P[pk];
  if (!series.length) { emptyMsg(tb, 'None of these stations has samples for ' + pm.label.toLowerCase() + '.'); return; }
  const all = series.flatMap(s => s.pts).filter(p => !pm.log || p.v > 0);
  const W = tb.clientWidth, H = 340, m = {t:10, r:16, b:40, l:60};
  const x = d3.scaleUtc(d3.extent(all, p => p.t), [m.l, W - m.r]).nice();
  const y = yscale(pm, d3.extent(all, p => p.v), H, m);
  const svg = svgBox(W, H);
  gridY(svg, y, W, m, pm);
  svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(ticksN(W)).tickFormat(d3.utcFormat('%Y'))).call(axisStyle);
  axisY(svg, y, m, pm); ylab(svg, H, m, pm.label + ' (' + pm.unit + ')');
  if (pk === 'DO') [5, 2].forEach(v => { if (v > y.domain()[0] && v < y.domain()[1]) svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(v)).attr('y2', y(v)).style('stroke', v === 5 ? C.green : C.danger).attr('stroke-dasharray', '5 4'); });
  series.forEach(s => {
    const c = SERIES[s.i % SERIES.length], pts = s.pts.filter(p => !pm.log || p.v > 0);
    svg.append('path').datum(pts).attr('fill', 'none').style('stroke', c).attr('stroke-opacity', .45).attr('stroke-width', 1.5).attr('d', d3.line(p => x(p.t), p => y(p.v)));
    svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', p => x(p.t)).attr('cy', p => y(p.v)).attr('r', 2.6).style('fill', c).style('fill-opacity', .8)
      .on('mousemove', (e, p) => { const [px, py] = d3.pointer(e, tb); tip(tb, [L('', s.r.station_name || s.id), L(d3.utcFormat('%b %-d, %Y')(p.t), fmt(pm.f, p.v) + ' ' + pm.unit)], px, py); })
      .on('mouseleave', () => tip(tb, null));
  });
  tb.replaceChildren(svg.node());
}

// ================= FINDINGS =================
function drawTakeaway() {
  const r = CVO.find(x => x.param === 'DO'); if (!r) return;
  const none = CVO.filter(x => !['DO','pct_DO_lt4','SAL'].includes(x.param) && x.wilcoxon_p >= 0.05).map(x => P[x.param].label.toLowerCase().replace(/ \(.*\)/, ''));
  $('takeaway').textContent = 'Across ' + d3.format(',')(r.paired_n) + ' canals compared with open water within 500 m, the canal ran a median ' + d3.format('.2f')(Math.abs(r.paired_median_diff)) + ' mg/L lower in dissolved oxygen, and ' + d3.format('.0f')(r.paired_pct_canal_worse) + '% of canals came in lower (paired test p = ' + d3.format('.3f')(r.wilcoxon_p) + '). ' + (none.length ? 'No consistent canal-versus-open-water difference showed up for ' + (none.length > 1 ? none.slice(0, -1).join(', ') + ' or ' + none[none.length - 1] : none[0]) + '. ' : '') + 'Within canals, open basins carry the most oxygen, and finger and branching canals log more low-oxygen readings.';
}
function drawCvoTable() {
  $('t-cvo').querySelector('tbody').replaceChildren(...CVO.map(r => {
    const tr = document.createElement('tr'); const f = P[r.param] ? P[r.param].f : '.2f';
    [[r.label, ''], [fmt(f, r.canal_median), 'n'], [fmt(f, r.open_median), 'n'], [fmt(',', r.paired_n), 'n'], [fmt('+' + f.replace(',', ''), r.paired_median_diff), 'n'], [fmt('.0f', r.paired_pct_canal_worse) + '%', 'n'], [r.wilcoxon_p < 0.001 ? '<0.001' : fmt('.3f', r.wilcoxon_p), 'n']]
      .forEach(([t, c]) => { const td = document.createElement('td'); td.textContent = t; if (c) td.className = c; tr.appendChild(td); });
    return tr; }));
}
function drawPairs() {
  const box = $('ch-pairs'), k = S.param, meta = P[k];
  $('pairs-title').textContent = 'Each canal against the open water beside it: ' + meta.label.toLowerCase();
  const data = filt(PAIRS.filter(r => r.param === k), {noSetting:true}).filter(r => Number.isFinite(r.canal) && Number.isFinite(r.open) && (!meta.log || (r.canal > 0 && r.open > 0)));
  if (data.length < 3) { emptyMsg(box, 'Too few paired canals for this measure and filter.'); $('pairs-note').textContent = ''; return; }
  const W = box.clientWidth, H = 340, m = {t:10, r:14, b:46, l:60};
  const ext = d3.extent(data.flatMap(r => [r.canal, r.open]));
  const lo = meta.log ? ext[0] / 1.2 : Math.max(0, ext[0] - (ext[1] - ext[0]) * 0.05), hi = meta.log ? ext[1] * 1.2 : ext[1] + (ext[1] - ext[0]) * 0.05;
  const sc = meta.log ? d3.scaleLog : d3.scaleLinear;
  const x = sc([lo, hi], [m.l, W - m.r]), y = sc([lo, hi], [H - m.b, m.t]);
  const svg = svgBox(W, H);
  gridY(svg, y, W, m, meta);
  svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues(meta.log ? logTicks(x, ticksN(W)) : x.ticks(ticksN(W))).tickFormat(d3.format('~g'))).call(axisStyle);
  axisY(svg, y, m, meta);
  svg.append('line').attr('x1', x(lo)).attr('y1', y(lo)).attr('x2', x(hi)).attr('y2', y(hi)).style('stroke', C.navy300).attr('stroke-dasharray', '5 4');
  xlab(svg, W, H, m, 'Open water within 500 m (' + meta.unit + ')'); ylab(svg, H, m, 'Inside the canal (' + meta.unit + ')');
  const worse = (r) => meta.hi === 'good' ? r.canal < r.open : meta.hi === 'bad' ? r.canal > r.open : false;
  svg.append('g').selectAll('circle').data(data).join('circle').attr('cx', r => x(r.open)).attr('cy', r => y(r.canal)).attr('r', 5)
    .style('fill', r => worse(r) ? C.danger : C.sky700).style('fill-opacity', .75).style('stroke', '#fff').attr('stroke-width', .8)
    .on('mousemove', (e, r) => { const [mx, my] = d3.pointer(e, box); tip(box, [L('', (r.County || '') + ' · ' + (r.TYP_FORM || '')), L('Canal', fv(k, r.canal) + ' ' + meta.unit), L('Open water', fv(k, r.open) + ' ' + meta.unit), L('Canal ID', String(r.CHAWQ_ID))], mx, my); })
    .on('mouseleave', () => tip(box, null));
  box.replaceChildren(svg.node());
  const nw = data.filter(worse).length;
  $('pairs-note').textContent = d3.format(',')(data.length) + ' canals. ' + (meta.hi ? 'Red dots (' + d3.format(',')(nw) + ') are canals that read worse than the water beside them. ' : '') + 'The dashed line marks no difference.';
}
function drawAnnual() {
  const box = $('ch-annual'); let k = S.param; if (k === 'pct_DO_lt4') k = 'DO'; const meta = P[k];
  const data = ANNUAL.filter(r => r.param === k);
  $('annual-title').textContent = 'Year by year: ' + meta.label.toLowerCase();
  if (!data.length) { emptyMsg(box, 'Yearly medians cover oxygen, nitrogen, phosphorus, chlorophyll and Enterococci.'); return; }
  const W = box.clientWidth, H = 340, m = {t:12, r:110, b:36, l:56};
  const x = d3.scaleLinear(d3.extent(data, r => r.year), [m.l, W - m.r]);
  const y = yscale({log:false}, d3.extent(data, r => r.median), H, m);
  const svg = svgBox(W, H);
  gridY(svg, y, W, m);
  svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(Math.min(6, Math.floor(W / 90))).tickFormat(d3.format('d'))).call(axisStyle);
  axisY(svg, y, m);
  const ends = [];
  [['Canal', C.navy], ['Open water', C.sky700]].forEach(([s, c]) => {
    const pts = data.filter(r => r.setting === s).sort((a, b) => a.year - b.year);
    svg.append('path').datum(pts).attr('fill', 'none').style('stroke', c).attr('stroke-width', 2.5).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round').attr('d', d3.line(r => x(r.year), r => y(r.median)));
    svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', r => x(r.year)).attr('cy', r => y(r.median)).attr('r', 4).style('fill', c)
      .on('mousemove', (e, r) => { const [mx, my] = d3.pointer(e, box); tip(box, [L('', s + ', ' + r.year), L('Median', fv(k, r.median) + ' ' + meta.unit), L('Samples', d3.format(',')(r.n)), L('Stations', d3.format(',')(r.stations))], mx, my); })
      .on('mouseleave', () => tip(box, null));
    const last = pts[pts.length - 1]; if (last) ends.push({s, c, y:y(last.median), x:x(last.year)});
  });
  ends.sort((a, b) => a.y - b.y); if (ends.length === 2 && ends[1].y - ends[0].y < 20) { ends[0].y -= 10; ends[1].y += 10; }
  ends.forEach(e => svg.append('text').attr('class', 'lbl16').attr('x', e.x + 10).attr('y', e.y + 5).style('fill', e.c).style('font-weight', 600).text(e.s));
  box.replaceChildren(svg.node());
}

// ================= TYPES =================
function drawType() {
  const box = $('ch-type'), k = S.param, meta = P[k], fac = S.factor;
  $('type-title').textContent = meta.label + ' by ' + FACT[fac].toLowerCase();
  const tr = TYPO.find(r => r.factor === fac && r.param === k);
  $('type-kw').textContent = tr ? 'Statewide test across groups (Kruskal–Wallis): p ' + (tr.p < 0.001 ? '< 0.001' : '= ' + d3.format('.3f')(tr.p)) + (tr.p < 0.05 ? ', a real difference between groups.' : ', not distinguishable from chance.') + ' Filters change the dots, not this test.' : 'No statewide test for this measure and grouping.';
  const data = filt(ST, {noSetting:true}).filter(r => r.setting === 'Canal' && r[meta.n] >= 3 && Number.isFinite(r[meta.col]) && r[fac] && (!meta.log || r[meta.col] > 0));
  const groups = d3.group(data, r => r[fac]);
  const levels = (ORDER[fac] || [...groups.keys()].sort((a, b) => d3.median(groups.get(a), r => r[meta.col]) - d3.median(groups.get(b), r => r[meta.col]))).filter(l => groups.has(l));
  if (!levels.length) { emptyMsg(box, 'No canal stations with 3 or more samples match these filters.'); return; }
  const W = box.clientWidth, H = 400, m = {t:28, r:12, b:70, l:62};
  const x = d3.scaleBand(levels, [m.l, W - m.r]).padding(0.3);
  const y = yscale(meta, d3.extent(data, r => r[meta.col]), H, m);
  const svg = svgBox(W, H);
  gridY(svg, y, W, m, meta);
  if (k === 'DO') [5, 2].forEach(v => { if (v > y.domain()[0] && v < y.domain()[1]) { svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(v)).attr('y2', y(v)).style('stroke', v === 5 ? C.green : C.danger).attr('stroke-dasharray', '5 4'); svg.append('text').attr('class', 'lbl16').attr('x', m.l + 6).attr('y', y(v) - 6).attr('text-anchor', 'start').style('fill', v === 5 ? C.green : C.danger).text(v === 5 ? 'healthy above 5' : 'dangerous below 2'); } });
  const xa = svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x)).call(axisStyle);
  xa.selectAll('text').each(function () { const t = d3.select(this), words = t.text().split(/[\/ ]/); if (words.length > 1 && x.bandwidth() < 150) { t.text(''); words.forEach((w, i) => t.append('tspan').attr('x', 0).attr('dy', i ? '1.15em' : '0.75em').text(w)); } });
  axisY(svg, y, m, meta); ylab(svg, H, m, meta.label + ' (' + meta.unit + ')');
  levels.forEach((l, gi) => {
    const g = groups.get(l), vals = g.map(r => r[meta.col]).sort(d3.ascending), q1 = d3.quantile(vals, .25), q2 = d3.quantile(vals, .5), q3 = d3.quantile(vals, .75), bx = x(l), bw = x.bandwidth();
    const col = FORMCOL[l] || SERIES[gi % SERIES.length];
    svg.append('rect').attr('x', bx).attr('width', bw).attr('y', y(q3)).attr('height', Math.max(1, y(q1) - y(q3))).attr('rx', 6).style('fill', col).style('fill-opacity', .14).style('stroke', col).style('stroke-opacity', .6);
    svg.append('g').selectAll('circle').data(g).join('circle').attr('cx', (r, i) => bx + bw * (0.12 + 0.76 * jit(i))).attr('cy', r => y(r[meta.col])).attr('r', 3).style('fill', col).style('fill-opacity', .6)
      .on('mousemove', (e, r) => { const [mx, my] = d3.pointer(e, box); tip(box, [L('', r.station_name || r.station_id), L(r.County || '', l), L(meta.label, fv(k, r[meta.col]) + ' ' + meta.unit)], mx, my); })
      .on('mouseleave', () => tip(box, null));
    svg.append('line').attr('x1', bx - 4).attr('x2', bx + bw + 4).attr('y1', y(q2)).attr('y2', y(q2)).style('stroke', 'var(--head)').attr('stroke-width', 3).attr('stroke-linecap', 'round');
    svg.append('text').attr('class', 'lbl16').attr('x', bx + bw / 2).attr('y', Math.max(m.t - 8, y(vals[vals.length - 1]) - 10)).attr('text-anchor', 'middle').style('fill', 'var(--ink)').style('font-weight', 600).text(fv(k, q2) + ' · n=' + g.length);
  });
  box.replaceChildren(svg.node());
}

// ================= NETWORK =================
function drawNet() {
  const box = $('ch-net'), k = S.param, meta = P[k], mk = S.metric, mm = METRIC[mk];
  $('net-title').textContent = meta.label + ' versus ' + mm.label.toLowerCase();
  const r0 = SPEAR.find(x => x.metric === mk && x.param === k);
  $('net-rho').textContent = r0 ? 'Rank correlation (Spearman) ρ = ' + d3.format('+.2f')(r0.rho) + ', p ' + (r0.p < 0.001 ? '< 0.001' : '= ' + d3.format('.3f')(r0.p)) + ', ' + d3.format(',')(r0.n) + ' canal stations statewide. Near 0 means no relationship; ±0.1 to 0.3 is weak.' : 'Correlation not computed for this measure; oxygen, nitrogen, phosphorus, chlorophyll and Enterococci are available.';
  const data = filt(ST, {noSetting:true}).filter(r => r.setting === 'Canal' && r[meta.n] >= 3 && Number.isFinite(r[meta.col]) && Number.isFinite(r[mk]) && (mm.scale !== 'log' || r[mk] > 0) && (!meta.log || r[meta.col] > 0));
  if (data.length < 3) { emptyMsg(box, 'Too few canal stations for this combination.'); return; }
  const W = box.clientWidth, H = 360, m = {t:10, r:16, b:48, l:62};
  const xe = d3.extent(data, r => r[mk]);
  const x = mm.scale === 'log' ? d3.scaleLog([xe[0] / 1.2, xe[1] * 1.2], [m.l, W - m.r]) : d3.scaleSymlog([0, xe[1] * 1.1], [m.l, W - m.r]);
  const y = yscale(meta, d3.extent(data, r => r[meta.col]), H, m);
  const xt = mm.scale === 'log' ? logTicks(x, 8) : [0, 1, 2, 5, 10, 20, 50, 100, 200, 500].filter(v => v <= xe[1] * 1.1);
  const svg = svgBox(W, H);
  gridY(svg, y, W, m, meta);
  svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues(xt.length > ticksN(W) + 2 ? xt.filter((v, i) => i % 2 === 0) : xt).tickFormat(d3.format('~g'))).call(axisStyle);
  axisY(svg, y, m, meta); xlab(svg, W, H, m, mm.label); ylab(svg, H, m, meta.label + ' (' + meta.unit + ')');
  svg.append('g').selectAll('circle').data(data).join('circle').attr('cx', r => x(r[mk])).attr('cy', r => y(r[meta.col])).attr('r', 3.6).style('fill', r => FORMCOL[r.TYP_FORM] || C.muted).style('fill-opacity', .7)
    .on('mousemove', (e, r) => { const [mx, my] = d3.pointer(e, box); tip(box, [L('', r.station_name || r.station_id), L(r.County || '', r.TYP_FORM || ''), L(mm.label, d3.format(',.2~f')(r[mk])), L(meta.label, fv(k, r[meta.col]) + ' ' + meta.unit)], mx, my); })
    .on('mouseleave', () => tip(box, null));
  box.replaceChildren(svg.node());
}
function drawReg() {
  const box = $('ch-reg'); let k = S.param; if (!REG.some(r => r.param === k)) k = 'DO';
  const data = REG.filter(r => r.param === k);
  const lab = (t) => t === 'log_net' ? 'Network length (per 10× longer)' : t === 'med_SAL' ? 'Salinity (per 1 ppt)' : t;
  $('reg-note').textContent = (k !== S.param ? 'Shown for dissolved oxygen; this model wasn’t run for the chosen measure. ' : '') + (k === 'DO' ? 'Difference in mg/L compared with open-basin canals.' : 'Difference on a log scale compared with open-basin canals: +0.30 is about double, −0.30 about half.') + ' Bars are 95% confidence intervals; one crossing zero is not a clear effect. ' + d3.format(',')(data[0] ? data[0].n : 0) + ' canal stations.';
  const W = box.clientWidth, rowH = 42, m = {t:10, r:18, b:40, l:Math.min(250, W * 0.45)}, H = m.t + m.b + rowH * data.length;
  const ext = d3.extent(data.flatMap(r => [r.lo, r.hi, 0])), pad = (ext[1] - ext[0]) * 0.08;
  const x = d3.scaleLinear([ext[0] - pad, ext[1] + pad], [m.l, W - m.r]), y = d3.scaleBand(data.map(r => r.term), [m.t, H - m.b]).padding(0.4);
  const svg = svgBox(W, H);
  svg.append('g').attr('class', 'gridl').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(ticksN(W - m.l)).tickSize(-(H - m.t - m.b)).tickFormat(''));
  svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(ticksN(W - m.l))).call(axisStyle);
  svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', m.t).attr('y2', H - m.b).style('stroke', C.navy300).attr('stroke-width', 1.5);
  data.forEach(r => {
    const cy = y(r.term) + y.bandwidth() / 2, c = r.p < 0.05 ? C.danger : C.navy300;
    svg.append('text').attr('class', 'lbl16').attr('x', m.l - 10).attr('y', cy + 5).attr('text-anchor', 'end').style('fill', 'var(--ink)').text(lab(r.term));
    svg.append('line').attr('x1', x(r.lo)).attr('x2', x(r.hi)).attr('y1', cy).attr('y2', cy).style('stroke', c).attr('stroke-width', 4).attr('stroke-linecap', 'round');
    svg.append('circle').attr('cx', x(r.coef)).attr('cy', cy).attr('r', 6).style('fill', c)
      .on('mousemove', (e) => { const [mx, my] = d3.pointer(e, box); tip(box, [L('', lab(r.term)), L('Estimate', d3.format('+.3f')(r.coef) + (k === 'DO' ? ' mg/L' : ' (×' + d3.format('.2f')(Math.pow(10, r.coef)) + ')')), L('95% interval', d3.format('+.3f')(r.lo) + ' to ' + d3.format('+.3f')(r.hi)), L('p', r.p < 0.001 ? '< 0.001' : d3.format('.3f')(r.p))], mx, my); })
      .on('mouseleave', () => tip(box, null));
  });
  box.replaceChildren(svg.node());
}

// ================= DATA =================
const TCOLS = [['station_id','Station ID'],['station_name','Name'],['setting','Setting'],['County','County'],['TYP_FORM','Canal form'],['TYP_CONNEC','Connectivity'],['NumMouth','Mouths'],['net_len_km','Network km'],['med_DO','DO mg/L'],['pct_DO_lt4','% DO < 4'],['med_TN','TN mg/L'],['med_TP','TP mg/L'],['med_CHLA','Chl a µg/L'],['med_ENT','Entero /100 mL'],['n_dates','Sample dates'],['last','Last sample']];
const TF = {NumMouth:'d', net_len_km:',.2f', med_DO:'.2f', pct_DO_lt4:'.0f', med_TN:'.2f', med_TP:'.3f', med_CHLA:'.1f', med_ENT:',.0f', n_dates:','};
let sortKey = 'station_id', sortDir = 1;
$('t-st').querySelector('thead tr').replaceChildren(...TCOLS.map(([k, l]) => { const th = document.createElement('th'); th.textContent = l; th.dataset.k = k; if (TF[k]) th.className = 'n'; th.addEventListener('click', () => { if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; } drawTable(); }); return th; }));
$('t-q').addEventListener('input', () => drawTable());
function tableRows() {
  const q = $('t-q').value.trim().toLowerCase(); let list = filt(ST);
  if (q) list = list.filter(r => [r.station_id, r.station_name, r.County, r.WATERBODY_, r.organization].some(v => v && String(v).toLowerCase().includes(q)));
  const isNum = NUMS.includes(sortKey);
  return list.slice().sort((a, b) => { const va = a[sortKey], vb = b[sortKey]; if (isNum) { const na = Number.isFinite(va), nb = Number.isFinite(vb); if (!na || !nb) return nb - na; return (va - vb) * sortDir; } return String(va || '').localeCompare(String(vb || '')) * sortDir; });
}
function drawTable() {
  const list = tableRows(), LIM = 400;
  $('t-st').querySelectorAll('th').forEach(th => th.setAttribute('aria-sort', th.dataset.k === sortKey ? (sortDir > 0 ? 'ascending' : 'descending') : 'none'));
  $('t-st').querySelector('tbody').replaceChildren(...list.slice(0, LIM).map(r => { const tr = document.createElement('tr'); TCOLS.forEach(([c]) => { const td = document.createElement('td'); const v = r[c]; td.textContent = TF[c] ? fmt(TF[c], v) : (v == null || v === '' ? '—' : String(v)); if (TF[c]) td.className = 'n'; tr.appendChild(td); }); tr.addEventListener('click', () => { const s = base && base.st.find(b => b.r === r); picked = s || {r, x:0, y:0}; location.hash = '#map'; setTimeout(() => { drawDetail(); if (s) { const W = mapBox.clientWidth, H = mapBox.clientHeight, k = 300; d3.select(cv).transition().duration(700).call(zoom.transform, d3.zoomIdentity.translate(W / 2 - k * s.x, H / 2 - k * s.y).scale(k)); } }, 50); }); tr.style.cursor = 'pointer'; return tr; }));
  $('t-note').textContent = (list.length > LIM ? 'Showing the first ' + d3.format(',')(LIM) + ' of ' + d3.format(',')(list.length) + ' matching stations. Downloads include all of them, with every column.' : d3.format(',')(list.length) + ' matching stations.') + ' Click a header to sort, or a row to see it on the map.';
}
$('dl-st').addEventListener('click', () => saveFile('chawq_canal_wq_stations.csv', toCSV(tableRows(), ST_COLS), $('dl-status')));
$('dl-smp').addEventListener('click', () => saveFile('chawq_canal_wq_samples.csv', samplesCSV(tableRows().map(r => r.station_id)), $('dl-status')));
$('dl-cn').addEventListener('click', () => saveFile('chawq_canal_polygons.geojson', fc(POLY.filter(polyFilt).map(polyFeature)), $('dl-status')));
$('dl-stats').addEventListener('click', () => zipAndSave(Object.entries(STATS_RAW).map(([n, t]) => [n + '.csv', t]), 'chawq_canal_wq_statistics.zip', $('dl-status')));

// ================= render =================
function render() {
  $('f-param').value = S.param; $('f-setting').value = S.setting; $('f-factor').value = S.factor; $('f-metric').value = S.metric;
  fillSelect($('f-wmd'), uniq('WMDNAME', ST), 'All districts', S.wmd);
  fillSelect($('f-county'), uniq('County', ST.filter(r => !S.wmd || r.WMDNAME === S.wmd)), 'All counties', S.county);
  fillSelect($('f-form'), uniq('TYP_FORM', ST), 'All forms', S.form);
  $('f-status').textContent = d3.format(',')(filt(ST).length) + ' stations match';
  if (S.page === 'map') { drawMap(); drawDetail(); drawSelection(); drawCompare(); if (S.county !== lastCounty) { lastCounty = S.county; if (S.county) fitVisible(); } }
  if (S.page === 'findings') { drawTakeaway(); drawPairs(); drawAnnual(); drawCvoTable(); }
  if (S.page === 'types') drawType();
  if (S.page === 'network') { drawNet(); drawReg(); }
  if (S.page === 'data') drawTable();
}
let lastCounty = '';
drawHero();
let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(render, 150); });
route();
})();
