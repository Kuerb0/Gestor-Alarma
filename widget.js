// Widget del escritorio: la misma gráfica que una pestaña del panel (tipo = tiempo | sistema), en su propia ventana.
const $ = id => document.getElementById(id);
const tipo = ['sistema', 'agenda'].includes(new URLSearchParams(location.search).get('tipo')) ? new URLSearchParams(location.search).get('tipo') : 'tiempo';
let correo = null, meteo = null, meteoT = 0, diaSel = 0, sis = null, bateria = null, ciudadSel = '';
try { ciudadSel = localStorage.getItem('wciudad') || ''; } catch {}
document.getElementById('w').classList.toggle('sis', tipo === 'sistema');
function pinta() {
  if (tipo === 'tiempo') { const o = htmlCiudades(meteo, ciudadSel, diaSel, meteoT, false, cfg); diaSel = o.dia; ciudadSel = o.sel; $('w-c').innerHTML = o.html; }
  else if (tipo === 'agenda') { $('w-c').innerHTML = htmlAgenda(correo, cfg); colorea($('w-c')); }
  else $('w-c').innerHTML = sis || bateria ? htmlSistema(sis, bateria, cfg) : '<div class="vacio">Cargando…</div>';
}
// ---- configuración: tamaño (pequeño/mediano/grande) y qué información se ve; se guarda en los ajustes y la ventana cambia de ancho sola
const SEC = tipo === 'agenda' ? [['todo', 'Todo el día'], ['lugar', 'Lugar']] : tipo === 'tiempo'
  ? [['ciu', 'Ciudades'], ['graf', 'Gráfico'], ['ico', 'Iconos'], ['lluvia', 'Lluvia'], ['tmp', 'Temp. cada 3 h'], ['res', 'Resumen'], ['det', 'Detalles'], ['dias', 'Próx. días']]
  : [['cpu', 'CPU'], ['ram', 'RAM'], ['disco', 'Disco'], ['disp', 'Dispositivos'], ['bat', 'Batería']];
const NIVELES = tipo === 'agenda' ? { Mínimo: { todo: 0, lugar: 0 }, Normal: { todo: 1, lugar: 0 }, Completo: { todo: 1, lugar: 1 } } : tipo === 'tiempo' // atajos: de «solo lo básico» a «todo»
  ? { Mínimo: { ciu: 0, graf: 1, ico: 0, lluvia: 0, tmp: 0, res: 0, det: 0, dias: 0 }, Normal: { ciu: 1, graf: 1, ico: 1, lluvia: 1, tmp: 1, res: 1, det: 0, dias: 1 }, Completo: { ciu: 1, graf: 1, ico: 1, lluvia: 1, tmp: 1, res: 1, det: 1, dias: 1 } }
  : { Mínimo: { cpu: 1, ram: 1, disco: 0, disp: 0, bat: 0 }, Normal: { cpu: 1, ram: 1, disco: 1, disp: 0, bat: 1 }, Completo: { cpu: 1, ram: 1, disco: 1, disp: 1, bat: 1 } };
let cfg = { tam: 'm', ndias: tipo === 'agenda' ? 3 : 5, modo: 'eventos', nh: 10 }; try { cfg = { ...cfg, ...JSON.parse(new URLSearchParams(location.search).get('cfg')) }; } catch {}
const guardaCfg = () => { api.widgetCfg(cfg); pinta(); pintaCfg(); };
function pintaCfg() {
  const tam = [['p', 'Pequeño'], ['m', 'Mediano'], ['g', 'Grande']].map(([k, n]) => `<button class="cfg-b" data-tam="${k}" aria-pressed="${cfg.tam === k}">${n}</button>`).join('');
  const niv = Object.keys(NIVELES).map(n => `<button class="cfg-b" data-niv="${n}">${n}</button>`).join('');
  const sw = SEC.map(([k, n]) => `<label class="cfg-c"><input type="checkbox" data-k="${k}"${cfg[k] !== false ? ' checked' : ''}> ${n}</label>`).join('');
  const nd = tipo === 'tiempo' ? `<div class="cfg-f"><span>Próx. días</span>${[3, 5, 7].map(n => `<button class="cfg-b" data-nd="${n}" aria-pressed="${cfg.ndias === n}">${n}</button>`).join('')}</div>` : '';
  const ag = tipo !== 'agenda' ? '' : `<div class="cfg-f"><span>Ver</span>${[['eventos', 'Eventos'], ['horas', 'Horas']].map(([k, n]) => `<button class="cfg-b" data-modo="${k}" aria-pressed="${cfg.modo === k}">${n}</button>`).join('')}</div><div class="cfg-f"><span>${cfg.modo === 'horas' ? 'Horas' : 'Días'}</span>${(cfg.modo === 'horas' ? [6, 10, 14] : [1, 3, 7]).map(n => `<button class="cfg-b" data-${cfg.modo === 'horas' ? 'nh' : 'nd'}="${n}" aria-pressed="${(cfg.modo === 'horas' ? cfg.nh : cfg.ndias) === n}">${n}</button>`).join('')}</div>`;
  $('w-cfg').innerHTML = `${ag}<div class="cfg-f"><span>Tamaño</span>${tam}</div><div class="cfg-f"><span>Detalle</span>${niv}</div><div class="cfg-g">${sw}</div>${nd}`;
}
$('w-g').onclick = () => { const h = $('w-cfg').hidden; $('w-cfg').hidden = !h; $('w-g').setAttribute('aria-expanded', h); if (h) pintaCfg(); };
$('w-cfg').addEventListener('click', e => {
  const b = e.target.closest('.cfg-b'); if (!b) return;
  if (b.dataset.tam) cfg.tam = b.dataset.tam;
  else if (b.dataset.nd) cfg.ndias = +b.dataset.nd;
  else if (b.dataset.nh) cfg.nh = +b.dataset.nh;
  else if (b.dataset.modo) cfg.modo = b.dataset.modo;
  else if (b.dataset.niv) Object.entries(NIVELES[b.dataset.niv]).forEach(([k, v]) => cfg[k] = !!v);
  guardaCfg();
});
$('w-cfg').addEventListener('change', e => { const k = e.target.dataset.k; if (!k) return; cfg[k] = e.target.checked; guardaCfg(); });
let alto = 0;
new ResizeObserver(() => { const h = Math.ceil($('w').getBoundingClientRect().height) + 20; if (h !== alto) { alto = h; api.widgetAlto(h); } }).observe($('w'));
const ESTILOS = ['cristal', 'fino', 'flotante', 'solido'];
let estilo = new URLSearchParams(location.search).get('estilo'); if (!ESTILOS.includes(estilo)) estilo = 'cristal';
const aplicaEstilo = () => { $('w').dataset.estilo = estilo; $('w-e').title = 'Estilo: ' + estilo + ' (clic para cambiar)'; };
aplicaEstilo();
$('w-e').onclick = () => { estilo = ESTILOS[(ESTILOS.indexOf(estilo) + 1) % ESTILOS.length]; aplicaEstilo(); api.widgetEstilo(estilo); };
$('w-x').onclick = () => api.widgetCerrar();
$('w-c').addEventListener('click', e => {
  const b = e.target.closest('.fr-b'), c = e.target.closest('.ciu-n');
  if (b && !b.disabled) { diaSel += +b.dataset.d; pinta(); }
  else if (c) { ciudadSel = c.dataset.c; try { localStorage.setItem('wciudad', ciudadSel); } catch {} pinta(); }
});
api.on('tema', t => t && /^#[0-9a-f]{6}$/i.test(t.acento) && document.documentElement.style.setProperty('--acento', t.acento));
if (tipo === 'tiempo') { api.on('meteo', r => { meteo = r; meteoT = Date.now(); pinta(); }); setInterval(pinta, 6e4); } // la rayita de ahora avanza sola
else if (tipo === 'agenda') { api.on('correo', r => { correo = r; pinta(); }); setInterval(pinta, 6e4); } // la línea de «ahora» avanza sola
else {
  api.on('sistema', s => { sis = s; pinta(); });
  if (navigator.getBattery) navigator.getBattery().then(b => { bateria = b; b.onlevelchange = b.onchargingchange = pinta; pinta(); }).catch(() => {});
}
pinta();
