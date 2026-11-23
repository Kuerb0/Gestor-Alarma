// Widget del escritorio: la misma gráfica que una pestaña del panel (tipo = tiempo | sistema), en su propia ventana.
const $ = id => document.getElementById(id);
const tipo = ['sistema', 'agenda', 'notas'].includes(new URLSearchParams(location.search).get('tipo')) ? new URLSearchParams(location.search).get('tipo') : 'tiempo';
let notas = null, correo = null, meteo = null, meteoT = 0, diaSel = 0, sis = null, bateria = null, ciudadSel = '';
try { ciudadSel = localStorage.getItem('wciudad') || ''; } catch {}
document.getElementById('w').classList.toggle('sis', tipo === 'sistema' || tipo === 'notas');
function pinta() {
  if (tipo === 'tiempo') { const o = htmlCiudades(meteo, ciudadSel, diaSel, meteoT, false, cfg); diaSel = o.dia; ciudadSel = o.sel; $('w-c').innerHTML = o.html; }
  else if (tipo === 'agenda') { diaSel = clamp(diaSel, 0, maxDiaAg(correo)); $('w-c').innerHTML = htmlAgenda(correo, { ...cfg, dia: diaSel }); colorea($('w-c')); }
  else if (tipo === 'notas') pintaNotasW();
  else $('w-c').innerHTML = sis || bateria ? htmlSistema(sis, bateria, cfg) : '<div class="vacio">Cargando…</div>';
}
function pintaNotasW() { // si se está escribiendo una nota, solo se repinta la lista (el cuadro conserva texto y foco)
  const t = $('wn-texto'), l = $('w-c').querySelector('.wn-lista');
  if (t && l && cfg.nueva !== false && (t.value || document.activeElement === t)) { const tmp = document.createElement('div'); tmp.innerHTML = htmlNotas(notas, cfg); l.replaceWith(tmp.querySelector('.wn-lista')); return; }
  $('w-c').innerHTML = htmlNotas(notas, cfg);
}
// ---- configuración: tamaño (pequeño/mediano/grande) y qué información se ve; se guarda en los ajustes y la ventana cambia de ancho sola
const SEC = tipo === 'notas' ? [['fecha', 'Fecha'], ['nueva', 'Añadir']] : tipo === 'agenda' ? [['todo', 'Todo el día'], ['lugar', 'Lugar']] : tipo === 'tiempo'
  ? [['ciu', 'Ciudades'], ['graf', 'Gráfico'], ['ico', 'Iconos'], ['lluvia', 'Lluvia'], ['tmp', 'Temp. cada 3 h'], ['res', 'Resumen'], ['det', 'Detalles'], ['dias', 'Próx. días']]
  : [['cpu', 'CPU'], ['ram', 'RAM'], ['disco', 'Disco'], ['disp', 'Dispositivos'], ['bat', 'Batería']];
const NIVELES = tipo === 'notas' ? { Mínimo: { fecha: 0, nueva: 0 }, Normal: { fecha: 1, nueva: 0 }, Completo: { fecha: 1, nueva: 1 } } : tipo === 'agenda' ? { Mínimo: { todo: 0, lugar: 0 }, Normal: { todo: 1, lugar: 0 }, Completo: { todo: 1, lugar: 1 } } : tipo === 'tiempo' // atajos: de «solo lo básico» a «todo»
  ? { Mínimo: { ciu: 0, graf: 1, ico: 0, lluvia: 0, tmp: 0, res: 0, det: 0, dias: 0 }, Normal: { ciu: 1, graf: 1, ico: 1, lluvia: 1, tmp: 1, res: 1, det: 0, dias: 1 }, Completo: { ciu: 1, graf: 1, ico: 1, lluvia: 1, tmp: 1, res: 1, det: 1, dias: 1 } }
  : { Mínimo: { cpu: 1, ram: 1, disco: 0, disp: 0, bat: 0 }, Normal: { cpu: 1, ram: 1, disco: 1, disp: 0, bat: 1 }, Completo: { cpu: 1, ram: 1, disco: 1, disp: 1, bat: 1 } };
let cfg = { tam: 'm', ndias: tipo === 'agenda' ? 3 : 5, modo: 'eventos', h0: tipo === 'agenda' ? 8 : 0, h1: tipo === 'agenda' ? 20 : 24 }; try { cfg = { ...cfg, ...JSON.parse(new URLSearchParams(location.search).get('cfg')) }; } catch {}
if (cfg.ciudad) ciudadSel = cfg.ciudad; // cada widget del Tiempo guarda su ciudad (dos widgets pueden enseñar ciudades distintas)
const guardaCfg = () => { api.widgetCfg(cfg); pinta(); pintaCfg(); };
function pintaCfg() {
  const tam = [['p', 'Pequeño'], ['m', 'Mediano'], ['g', 'Grande']].map(([k, n]) => `<button class="cfg-b" data-tam="${k}" aria-pressed="${cfg.tam === k}">${n}</button>`).join('');
  const niv = Object.keys(NIVELES).map(n => `<button class="cfg-b" data-niv="${n}">${n}</button>`).join('');
  const sw = SEC.map(([k, n]) => `<label class="cfg-c"><input type="checkbox" data-k="${k}"${cfg[k] !== false ? ' checked' : ''}> ${n}</label>`).join('');
  const nd = tipo === 'tiempo' ? `<div class="cfg-f"><span>Próx. días</span>${[3, 5, 7].map(n => `<button class="cfg-b" data-nd="${n}" aria-pressed="${cfg.ndias === n}">${n}</button>`).join('')}</div>` : '';
  const hop = (de, a, v) => Array.from({ length: a - de + 1 }, (_, k) => de + k).map(h => `<option value="${h}"${h === v ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join(''); // rango de horas editable (mín. 2 h entre Desde y Hasta)
  const selHoras = `<div class="cfg-f"><span>Horas</span><select class="cfg-s" data-hh="h0" aria-label="Hora inicial">${hop(0, 22, cfg.h0)}</select><span>a</span><select class="cfg-s" data-hh="h1" aria-label="Hora final">${hop(Math.min(cfg.h0 + 2, 24), 24, cfg.h1)}</select></div>`;
  const ag = tipo !== 'agenda' ? '' : `<div class="cfg-f"><span>Ver</span>${[['eventos', 'Eventos'], ['horas', 'Horas']].map(([k, n]) => `<button class="cfg-b" data-modo="${k}" aria-pressed="${cfg.modo === k}">${n}</button>`).join('')}</div>${cfg.modo === 'horas' ? selHoras : `<div class="cfg-f"><span>Días</span>${[1, 3, 7].map(n => `<button class="cfg-b" data-nd="${n}" aria-pressed="${cfg.ndias === n}">${n}</button>`).join('')}</div>`}`;
  $('w-cfg').innerHTML = `${ag}${tipo === 'tiempo' && cfg.graf !== false ? selHoras : ''}<div class="cfg-f"><span>Tamaño</span>${tam}</div><div class="cfg-f"><span>Detalle</span>${niv}</div><div class="cfg-g">${sw}</div>${nd}`;
}
$('w-g').onclick = () => { const h = $('w-cfg').hidden; $('w-cfg').hidden = !h; $('w-g').setAttribute('aria-expanded', h); if (h) pintaCfg(); };
document.addEventListener('contextmenu', e => { // clic derecho: abre el panel de ajustes (con el rango de horas) y lo deja a la vista
  e.preventDefault(); if ($('w-cfg').hidden) { $('w-cfg').hidden = false; $('w-g').setAttribute('aria-expanded', true); pintaCfg(); }
  const s = $('w-cfg').querySelector('[data-hh]'); if (s) s.focus();
});
$('w-cfg').addEventListener('click', e => {
  const b = e.target.closest('.cfg-b'); if (!b) return;
  if (b.dataset.tam) { cfg.tam = b.dataset.tam; $('w').classList.remove('fijo'); } // elegir un tamaño vuelve al automático
  else if (b.dataset.nd) cfg.ndias = +b.dataset.nd;
  else if (b.dataset.modo) cfg.modo = b.dataset.modo;
  else if (b.dataset.niv) Object.entries(NIVELES[b.dataset.niv]).forEach(([k, v]) => cfg[k] = !!v);
  guardaCfg();
});
$('w-cfg').addEventListener('change', e => { // desplegables «Desde» / «Hasta»: siempre quedan al menos 2 h entre uno y otro
  const hh = e.target.dataset.hh;
  if (hh) { const v = +e.target.value; if (hh === 'h0') { cfg.h0 = v; cfg.h1 = Math.max(cfg.h1, v + 2); } else { cfg.h1 = v; cfg.h0 = Math.min(cfg.h0, v - 2); } guardaCfg(); return; }
  const k = e.target.dataset.k; if (!k) return; cfg[k] = e.target.checked; guardaCfg(); });
// tamaño a mano: cualquier borde o esquina (franjas en el margen) y la esquina visible de abajo a la derecha. Arrastrar fija ancho y alto;
// desde arriba o la izquierda el borde contrario se queda quieto. Doble clic: vuelve al automático (el alto se ajusta otra vez al contenido)
if (new URLSearchParams(location.search).get('fijo')) $('w').classList.add('fijo');
['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'].forEach(d => { const h = document.createElement('div'); h.className = 'w-h'; h.dataset.d = d; h.title = 'Arrastra para cambiar el tamaño · doble clic: tamaño automático'; document.body.append(h); });
document.querySelectorAll('[data-d]').forEach(g => {
  g.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); g.setPointerCapture(e.pointerId); g.classList.add('activo');
    const d = g.dataset.d, x0 = e.screenX, y0 = e.screenY; let movido = false, raf = 0, dx = 0, dy = 0; // se manda cuánto se ha movido el ratón; el proceso principal lo aplica a los límites de la ventana
    const calc = ev => { dx = ev.screenX - x0; dy = ev.screenY - y0; };
    const mueve = ev => { calc(ev); if (!movido) { movido = true; $('w').classList.add('fijo'); } if (!raf) raf = requestAnimationFrame(() => { raf = 0; api.widgetTam(dx, dy, false, d); }); };
    const fin = ev => { g.removeEventListener('pointermove', mueve); g.removeEventListener('pointerup', fin); g.removeEventListener('pointercancel', fin); g.removeEventListener('lostpointercapture', fin); g.classList.remove('activo'); cancelAnimationFrame(raf); if (movido) { calc(ev); api.widgetTam(dx, dy, true, d); } };
    g.addEventListener('pointermove', mueve); g.addEventListener('pointerup', fin); g.addEventListener('pointercancel', fin); g.addEventListener('lostpointercapture', fin); // si Windows quita la captura, el arrastre termina igual
  });
  g.addEventListener('dblclick', () => { $('w').classList.remove('fijo'); api.widgetTam(null); });
});
let alto = 0;
new ResizeObserver(() => { if ($('w').classList.contains('fijo')) return; const h = Math.ceil($('w').getBoundingClientRect().height) + 20; if (h !== alto) { alto = h; api.widgetAlto(h); } }).observe($('w'));
const ESTILOS = ['consumo', 'cristal', 'fino', 'flotante', 'solido'];
let estilo = new URLSearchParams(location.search).get('estilo'); if (!ESTILOS.includes(estilo)) estilo = 'consumo';
try { if (!localStorage.getItem('estilo-consumo-' + tipo)) { localStorage.setItem('estilo-consumo-' + tipo, '1'); if (estilo !== 'consumo') { estilo = 'consumo'; api.widgetEstilo(estilo); } } } catch {} // una vez: todos los widgets pasan al estilo de Consumo
const aplicaEstilo = () => { $('w').dataset.estilo = estilo; $('w-e').title = 'Estilo: ' + estilo + ' (clic para cambiar)'; };
aplicaEstilo();
$('w-e').onclick = () => { estilo = ESTILOS[(ESTILOS.indexOf(estilo) + 1) % ESTILOS.length]; aplicaEstilo(); api.widgetEstilo(estilo); };
$('w-c').addEventListener('keydown', e => { // Intro guarda la nota nueva; Mayús+Intro = salto de línea
  if (e.target.id !== 'wn-texto' || e.key !== 'Enter' || e.shiftKey) return;
  e.preventDefault(); const v = e.target.value.trim(); if (!v) return; e.target.value = ''; api.notasAnadir(v);
});
// mover: arrastrando cualquier parte del cuadro que no sea un control (a mano, no con -webkit-app-region: así los botones reciben los clics en Windows)
$('w').addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.target.closest('button, input, textarea, select, label, a, [data-d], .ciu-n')) return;
  const w = $('w'), x0 = e.screenX, y0 = e.screenY; let raf = 0, dx = 0, dy = 0, movido = false;
  w.setPointerCapture(e.pointerId);
  const mueve = ev => { dx = ev.screenX - x0; dy = ev.screenY - y0; if (!movido && Math.abs(dx) + Math.abs(dy) < 3) return; movido = true; w.classList.add('moviendo'); if (!raf) raf = requestAnimationFrame(() => { raf = 0; api.widgetMover(dx, dy, false); }); };
  const fin = () => { ['pointermove', 'pointerup', 'pointercancel', 'lostpointercapture'].forEach((t, i) => w.removeEventListener(t, i ? fin : mueve)); cancelAnimationFrame(raf); w.classList.remove('moviendo'); if (movido) api.widgetMover(dx, dy, true); };
  w.addEventListener('pointermove', mueve); ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => w.addEventListener(t, fin));
});
$('w-x').onclick = () => api.widgetCerrar();
$('w-d').onclick = () => api.widgetDuplicar();
$('w-c').addEventListener('click', e => {
  const b = e.target.closest('.fr-b'), c = e.target.closest('.ciu-n');
  if (b && !b.disabled) { diaSel += +b.dataset.d; pinta(); }
  else if (c) { ciudadSel = c.dataset.c; try { localStorage.setItem('wciudad', ciudadSel); } catch {} cfg.ciudad = ciudadSel; api.widgetCfg(cfg); pinta(); }
});
api.on('tema', t => t && /^#[0-9a-f]{6}$/i.test(t.acento) && document.documentElement.style.setProperty('--acento', t.acento));
if (tipo === 'tiempo') { api.on('meteo', r => { meteo = r; meteoT = Date.now(); pinta(); }); setInterval(pinta, 6e4); } // la rayita de ahora avanza sola
else if (tipo === 'notas') api.on('notas', l => { notas = l; pinta(); });
else if (tipo === 'agenda') { api.on('correo', r => { correo = r; pinta(); }); setInterval(pinta, 6e4); } // la línea de «ahora» avanza sola
else {
  api.on('sistema', s => { sis = s; pinta(); });
  if (navigator.getBattery) navigator.getBattery().then(b => { bateria = b; b.onlevelchange = b.onchargingchange = pinta; pinta(); }).catch(() => {});
}
pinta();
