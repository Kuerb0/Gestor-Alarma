// Widget del escritorio: la misma gráfica que una pestaña del panel (tipo = tiempo | sistema), en su propia ventana.
const $ = id => document.getElementById(id);
const tipo = new URLSearchParams(location.search).get('tipo') === 'sistema' ? 'sistema' : 'tiempo';
let meteo = null, meteoT = 0, diaSel = 0, sis = null, bateria = null, ciudadSel = '';
try { ciudadSel = localStorage.getItem('wciudad') || ''; } catch {}
document.getElementById('w').classList.toggle('sis', tipo === 'sistema');
function pinta() {
  if (tipo === 'tiempo') { const o = htmlCiudades(meteo, ciudadSel, diaSel, meteoT, false); diaSel = o.dia; ciudadSel = o.sel; $('w-c').innerHTML = o.html; }
  else $('w-c').innerHTML = sis || bateria ? htmlSistema(sis, bateria) : '<div class="vacio">Cargando…</div>';
}
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
else {
  api.on('sistema', s => { sis = s; pinta(); });
  if (navigator.getBattery) navigator.getBattery().then(b => { bateria = b; b.onlevelchange = b.onchargingchange = pinta; pinta(); }).catch(() => {});
}
pinta();
