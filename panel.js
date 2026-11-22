const $ = id => document.getElementById(id);
const p2 = n => String(n).padStart(2, '0');
const hhmm = d => p2(d.getHours()) + ':' + p2(d.getMinutes());
const dia0 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
let correo = null, bateria = null, sis = null;

// ---- cabecera
function reloj() {
  const n = new Date();
  $('hora').textContent = hhmm(n);
  $('fecha').textContent = n.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}
$('tiempo').addEventListener('click', e => {
  const b = e.target.closest('.fr-b'), c = e.target.closest('.ciu-n'), q = e.target.closest('.ciu-q');
  if (b && !b.disabled) { diaSel += +b.dataset.d; pintaMeteo(); }
  else if (c) { ciudadSel = c.dataset.c; try { localStorage.setItem('ciudad', ciudadSel); } catch {} pintaMeteo(); }
  else if (q) api.quitarCiudad(q.dataset.q);
});
// añadir ciudad: buscar por nombre (la búsqueda la hace main) y elegir entre los resultados
let ciOpc = [];
$('ci-abrir').onclick = () => { const f = $('ci-form'); f.hidden = !f.hidden; $('ci-abrir').setAttribute('aria-expanded', !f.hidden); if (!f.hidden) $('ci-texto').focus(); };
$('ci-cancelar').onclick = () => { $('ci-form').hidden = true; $('ci-abrir').setAttribute('aria-expanded', 'false'); $('ci-res').innerHTML = ''; };
$('ci-form').addEventListener('submit', async e => {
  e.preventDefault();
  const t = $('ci-texto').value.trim(); if (t.length < 2) return;
  $('ci-res').innerHTML = '<div class="vacio">Buscando…</div>';
  const r = await api.buscarCiudad(t);
  ciOpc = r && r.ok ? r.lugares : [];
  $('ci-res').innerHTML = !r || !r.ok ? '<div class="vacio">No se pudo buscar (¿sin conexión?)</div>' : ciOpc.length ? ciOpc.map((l, i) => `<button type="button" class="ci-op" data-i="${i}"><b>${esc(l.nombre)}</b><small>${esc(l.detalle)}</small></button>`).join('') : '<div class="vacio">Sin resultados</div>';
});
$('ci-res').addEventListener('click', async e => {
  const b = e.target.closest('.ci-op'), l = b && ciOpc[+b.dataset.i]; if (!l) return;
  const r = await api.anadirCiudad(l);
  if (!r || !r.ok) { $('ci-res').innerHTML = `<div class="vacio">${esc((r && r.motivo) || 'No se pudo añadir')}</div>`; return; }
  ciudadSel = `${l.nombre}|${l.lat.toFixed(2)}|${l.lon.toFixed(2)}`; try { localStorage.setItem('ciudad', ciudadSel); } catch {} pintaMeteo(); // la nueva queda elegida
  $('ci-texto').value = ''; $('ci-cancelar').click();
});
document.addEventListener('keydown', e => { // ← → en la pestaña Tiempo (con el foco fuera de las pestañas y los campos): cambia de día
  if ($('p-tiempo').hidden || e.target.closest('#tabs') || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  const b = document.querySelector('.fr-b[data-d="' + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0) + '"]');
  if (b && !b.disabled) { e.preventDefault(); b.click(); }
});
$('act').onclick = () => api.actualizar();
$('pin').onclick = () => api.fijar(!$('pin').classList.contains('on'));
// ---- pestañas
const TABS = [...document.querySelectorAll('[role=tab]')], NOMBRES = TABS.map(t => t.dataset.tab);
function ir(n, foco = true) {
  if (!NOMBRES.includes(n)) n = 'alarmas';
  TABS.forEach(t => { const on = t.dataset.tab === n; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; $('p-' + t.dataset.tab).hidden = !on; });
  $('tabs').style.setProperty('--i', NOMBRES.indexOf(n));
  try { localStorage.setItem('pestana', n); } catch {}
  if (n === 'alarmas' && foco) $('al-rapido').focus();
  if (n === 'widgets') queueMicrotask(pintaWidgets); else $('widgets-g').replaceChildren(); // fuera de la pestaña no queda nada (evita ids y gráficos duplicados)
  if (n === 'uso') queueMicrotask(() => usoCargar(false));
  if (n === 'notas') queueMicrotask(notasCargar); // tras cargar el script: `notas` ya existe
}
// ---- pestaña Uso: reglas y categorías (el gráfico va en #uso-graficos)
let usoCfg = null, usoSin = [], usoCatPend = null;
const usoOcupado = () => { const a = document.activeElement; return !!(a && $('p-uso').contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'color'))); };
const usoColor = n => ((usoCfg.categorias.find(c => c.nombre === n) || {}).color) || '#555a66';
const usoOpts = sel => usoCfg.categorias.map(c => `<option value="${esc(c.nombre)}"${c.nombre === sel ? ' selected' : ''}>${esc(c.nombre)}</option>`).join('');
const usoMin = s => s < 60 ? '<1 min' : s < 3600 ? Math.round(s / 60) + ' min' : Math.floor(s / 3600) + ' h ' + p2(Math.round(s % 3600 / 60)) + ' min';
function usoColores(raiz) { raiz.querySelectorAll('[data-color]').forEach(e => e.style.setProperty('--c', e.dataset.color)); }
async function usoCargar(fuerza) {
  if (!fuerza && usoOcupado()) return;
  try { [usoCfg, usoSin] = await Promise.all([api.usoCategorias(), api.usoSinClasificar()]); } catch { return; }
  if (!fuerza && usoOcupado()) return;
  usoPinta(); usoGraficos();
}
function usoPinta() {
  if (!usoCfg) return;
  const cats = usoCfg.categorias.filter(c => c.nombre !== 'Sin clasificar');
  $('uso-sin').innerHTML = usoSin.length ? usoSin.map((x, i) => `<div class="uso-fila"><span class="uso-n"><b>${esc(x.d || x.exe)}</b>${x.t ? `<small>${esc(x.t)}</small>` : ''}</span><span class="uso-m">${usoMin(x.seg)}</span><select class="campo uso-asig" data-i="${i}" aria-label="Categoría para ${esc(x.d || x.exe)}"><option value="">Elegir…</option>${cats.map(c => `<option value="${esc(c.nombre)}">${esc(c.nombre)}</option>`).join('')}</select></div>`).join('') : '<div class="vacio">Todo clasificado</div>';
  $('uso-reglas').innerHTML = usoCfg.reglas.length ? usoCfg.reglas.map((r, i) => `<div class="uso-regla" data-i="${i}"><span class="punto" data-color="${esc(usoColor(r.cat))}"></span><span class="uso-n">${r.campo === 'exe' ? 'Programa' : 'Título'} ${r.op} <b>${esc(r.valor)}</b> → ${esc(r.cat)}</span><button class="btn-sec uso-ar" type="button" data-a="sube" aria-label="Subir regla"${i ? '' : ' disabled'}>↑</button><button class="btn-sec uso-ar" type="button" data-a="baja" aria-label="Bajar regla"${i < usoCfg.reglas.length - 1 ? '' : ' disabled'}>↓</button><button class="btn-sec uso-ar" type="button" data-a="quita" aria-label="Quitar regla">✕</button></div>`).join('') : '<div class="vacio">Sin reglas</div>';
  const sel = $('uso-rcat').value; $('uso-rcat').innerHTML = usoOpts(sel);
  $('uso-cats').innerHTML = usoCfg.categorias.map(c => {
    if (c.nombre === usoCatPend) { const n = usoCfg.reglas.filter(r => r.cat === c.nombre).length; return `<span class="uso-chip pend" data-n="${esc(c.nombre)}">¿Quitar «${esc(c.nombre)}» y sus ${n} reglas? <button class="btn-sec" type="button" data-a="si">Quitar</button><button class="btn-sec" type="button" data-a="no">Cancelar</button></span>`; }
    return `<span class="uso-chip" data-n="${esc(c.nombre)}"><span class="punto" data-color="${esc(c.color)}"></span>${esc(c.nombre)}${c.nombre === 'Sin clasificar' ? '' : `<button class="uso-x" type="button" data-a="quita" aria-label="Quitar categoría ${esc(c.nombre)}">✕</button>`}</span>`;
  }).join('');
  usoColores($('p-uso'));
}
async function usoGuardar(cfg) { try { usoCfg = await api.usoGuardarCategorias(cfg); } catch {} usoCatPend = null; await usoCargar(true); }
$('uso-sin').addEventListener('change', e => {
  const s = e.target.closest('.uso-asig'); if (!s || !s.value) return;
  const x = usoSin[+s.dataset.i]; if (!x) return;
  const t = !!x.t, r = { campo: t ? 'titulo' : 'exe', op: t ? 'contiene' : 'es', valor: t ? x.t : x.exe, cat: s.value };
  usoGuardar({ ...usoCfg, reglas: t ? [r, ...usoCfg.reglas] : [...usoCfg.reglas, r] });
});
$('uso-reglas').addEventListener('click', e => {
  const b = e.target.closest('button[data-a]'), f = b && b.closest('.uso-regla'); if (!f) return;
  const i = +f.dataset.i, l = [...usoCfg.reglas], a = b.dataset.a;
  if (a === 'quita') l.splice(i, 1); else { const j = a === 'sube' ? i - 1 : i + 1; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; }
  usoGuardar({ ...usoCfg, reglas: l });
});
$('uso-rform').addEventListener('submit', e => {
  e.preventDefault(); const v = $('uso-rvalor').value.trim(); if (!v) { $('uso-rvalor').focus(); return; }
  const r = { campo: $('uso-rcampo').value, op: $('uso-rop').value, valor: v, cat: $('uso-rcat').value };
  $('uso-rvalor').value = '';
  usoGuardar({ ...usoCfg, reglas: r.campo === 'titulo' ? [r, ...usoCfg.reglas] : [...usoCfg.reglas, r] });
});
$('uso-cform').addEventListener('submit', e => {
  e.preventDefault(); const n = $('uso-cnombre').value.trim(); if (!n) { $('uso-cnombre').focus(); return; }
  if (usoCfg.categorias.some(c => norm(c.nombre) === norm(n))) { $('uso-cnombre').select(); return; }
  $('uso-cnombre').value = '';
  usoGuardar({ ...usoCfg, categorias: [...usoCfg.categorias, { nombre: n, color: $('uso-ccolor').value }] });
});
$('uso-cats').addEventListener('click', e => {
  const b = e.target.closest('button[data-a]'), c = b && b.closest('.uso-chip'); if (!c) return;
  const n = c.dataset.n, a = b.dataset.a;
  if (a === 'no') { usoCatPend = null; usoPinta(); return; }
  if (a === 'quita' && usoCfg.reglas.some(r => r.cat === n)) { usoCatPend = n; usoPinta(); return; }
  usoGuardar({ categorias: usoCfg.categorias.filter(x => x.nombre !== n), reglas: usoCfg.reglas.filter(r => r.cat !== n) });
});
$('uso-pedir').onclick = async () => {
  let r; try { r = await api.usoSugerencias(); } catch {}
  $('uso-aviso').textContent = r && r.ok ? 'Copiado: pégalo en Claude Code' + (r.n ? ' (' + r.n + ' sin clasificar)' : '') : 'No se pudo copiar';
};
$('uso-imp').onclick = async () => {
  const t = $('uso-resp').value.trim(); if (!t) { $('uso-resp').focus(); return; }
  let r; try { r = await api.usoImportar(t); } catch {}
  if (!r) { $('uso-res').textContent = 'No se pudo importar'; return; }
  $('uso-res').textContent = r.n + (r.n === 1 ? ' regla añadida' : ' reglas añadidas') + (r.errores.length ? ' · Descartadas: ' + r.errores.slice(0, 5).join('; ') : '');
  if (r.n) { $('uso-resp').value = ''; usoCfg = r.cfg; usoCargar(true); }
};
// ---- gráficos de la pestaña Uso: día elegido (la semana son los 7 días que acaban en él), periodo del reparto y niveles que cuentan
const ugFmt = ms => { const d = new Date(ms); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
const ugMas = (s, n) => { const [y, m, d] = s.split('-').map(Number); return ugFmt(new Date(y, m - 1, d + n).getTime()); };
let ugDia = ugFmt(Date.now()), ugSeq = 0;
const ugNiveles = () => [...document.querySelectorAll('#ug-niv input:checked')].map(i => i.value);
const ugSolape = (tr, a, b) => tr.filter(t => t.f > a && t.i < b).map(t => ({ ...t, i: Math.max(t.i, a), f: Math.min(t.f, b) }));
async function usoGraficos() {
  if (typeof GraficosUso === 'undefined' || !usoCfg) return;
  const hoy = ugFmt(Date.now()); if (ugDia > hoy) ugDia = hoy;
  const per = +$('ug-per').value, n = per === 30 ? 30 : 7, desde = ugMas(ugDia, -(n - 1)), sem = Array.from({ length: 7 }, (_, i) => ugMas(ugDia, i - 6)), seq = ++ugSeq;
  let r; try { r = await api.usoDatos(desde, ugDia); } catch { return; }
  if (seq !== ugSeq || !r) return;
  const G = GraficosUso, niv = ugNiveles(), cats = r.cats && r.cats.length ? r.cats : usoCfg.categorias, tr = r.tramos || [];
  const da = G.inicioDia(ugDia), ini = G.inicioDia(ugMas(ugDia, 1 - per)), fin = G.inicioDia(ugMas(ugDia, 1));
  const rep = G.reparto(ugSolape(tr, ini, fin), niv), dia = G.reparto(ugSolape(tr, da, fin), niv);
  const solo = niv.length === 1 && niv[0] === 'a', f = new Date(da), esHoy = ugDia === hoy;
  $('ug-fecha').textContent = esHoy ? 'Hoy' : f.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  $('ug-sig').disabled = esHoy;
  $('ug-total').textContent = (esHoy ? 'Hoy' : f.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })) + ': ' + G.fmtMin(G.total(dia)) + (solo ? ' activas' : ' de uso');
  $('ug-linea').innerHTML = G.lineaHtml(tr, ugDia, cats);
  $('ug-dia').innerHTML = G.areaDia(tr, ugDia, niv, cats);
  $('ug-sem').innerHTML = G.areaSemana(tr, sem, niv, cats);
  $('ug-acu').innerHTML = G.acumuladoSemana(tr, sem, niv, cats, Date.now());
  $('ug-sem2').innerHTML = G.semanaHtml(tr, sem, niv, cats);
  const abiertas = [...document.querySelectorAll('#ug-rep details[open] .uso-g-n')].map(x => x.textContent);
  $('ug-rep').innerHTML = G.repartoHtml(rep, cats);
  document.querySelectorAll('#ug-rep details').forEach(d => { if (abiertas.includes(d.querySelector('.uso-g-n').textContent)) d.open = true; });
  $('uso-graficos').querySelectorAll('[data-c]').forEach(x => x.style.setProperty('--c', x.dataset.c));
}
$('ug-ant').onclick = () => { ugDia = ugMas(ugDia, -1); usoGraficos(); };
$('ug-sig').onclick = () => { if (ugDia < ugFmt(Date.now())) { ugDia = ugMas(ugDia, 1); usoGraficos(); } };
$('ug-per').onchange = usoGraficos; $('ug-niv').onchange = usoGraficos;
setInterval(() => { if (!$('p-uso').hidden && ugDia === ugFmt(Date.now())) usoGraficos(); }, 60e3);
TABS.forEach(t => t.onclick = () => ir(t.dataset.tab));
$('tabs').addEventListener('keydown', e => {
  const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0, i = NOMBRES.indexOf(document.activeElement.dataset.tab);
  if (!d || i < 0) return;
  e.preventDefault(); ir(NOMBRES[(i + d + NOMBRES.length) % NOMBRES.length], false); $('t-' + document.querySelector('[role=tab][aria-selected=true]').dataset.tab).focus();
});
let ult = 'alarmas'; try { ult = localStorage.getItem('pestana') || ult; } catch {}
ir(ult, false);
document.addEventListener('keydown', e => { // Esc: vacía el campo con texto de la pestaña Alarmas; si no, cierra el panel
  if (e.key !== 'Escape') return;
  const t = document.activeElement;
  if (t && t.tagName === 'TEXTAREA') return; // escribiendo una nota: Esc no cierra el panel (no se pierde el texto)
  if (t && (t.closest('#p-alarmas') || t.id === 'ag-buscar') && t.tagName === 'INPUT' && t.type !== 'checkbox' && t.value) { t.value = ''; t.dispatchEvent(new Event('input')); } else api.cerrar();
});


// ---- tiempo
let meteo = null, meteoT = 0, diaSel = 0, ciudadSel = ''; // diaSel: día que muestra el gráfico (0 = hoy, 1 = mañana…); el dibujo está en graficos.js
try { ciudadSel = localStorage.getItem('ciudad') || ''; } catch {}
function pintaMeteo() { const o = htmlCiudades(meteo, ciudadSel, diaSel, meteoT, true); diaSel = o.dia; ciudadSel = o.sel; $('tiempo').innerHTML = o.html; pintaWidgets(); }

// ---- correo
function fechaCorta(iso) {
  const f = new Date(iso), h = dia0(new Date()), dd = Math.round((h - dia0(f)) / 864e5);
  if (dd === 0) return hhmm(f);
  if (dd === 1) return 'ayer';
  return f.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '') + ' ' + f.getDate();
}
let ocultarLeidos = true; try { ocultarLeidos = localStorage.getItem('ocultarLeidos') !== '0'; } catch {} // por defecto, los leídos no se enseñan
function pintaCorreo(r) {
  correo = r; const c = $('correo'), chip = $('chip');
  $('obs').textContent = r && r.ok && r.obsoleto ? 'desactualizado' : '';
  if (!r || !r.ok) {
    chip.hidden = true;
    const m = r && r.motivo;
    c.innerHTML = m === 'cerrado' ? '<div class="vacio">Outlook está cerrado</div><button class="btn-txt" id="ab" title="Abrir Outlook" aria-label="Abrir Outlook">Abrir Outlook</button>'
      : m === 'no_instalado' ? '<div class="vacio">Necesita Outlook clásico</div>' : '<div class="vacio">No se pudo leer el correo</div>';
    const b = $('ab'); if (b) b.onclick = () => api.abrirOutlook();
  } else {
    chip.hidden = !r.noLeidos; chip.textContent = r.noLeidos;
    const lista = ocultarLeidos ? r.correos.filter(m => !m.leido) : r.correos;
    c.innerHTML = lista.length ? lista.map(m => `<div class="fila-correo${m.leido ? '' : ' nl'}" data-id="${esc(m.id)}" title="${esc(m.asunto)}" tabindex="0" aria-selected="false"><span class="p"></span><button class="chk" tabindex="-1" role="checkbox" aria-checked="false" aria-label="Seleccionar">${SVG_OK}</button><span class="de">${esc(m.de)}</span>${m.leido ? '' : `<button class="leer" tabindex="-1" title="Marcar como leído" aria-label="Marcar como leído">${SVG_SOBRE}</button>`}<span class="h">${fechaCorta(m.fecha)}</span><span class="as">${esc(m.asunto)}</span></div>`).join('') : (r.correos.length ? '<div class="vacio">Sin correos sin leer</div>' : '<div class="vacio">Sin correos</div>');
  }
  sel = new Set([...sel].filter(id => correo && correo.ok && correo.correos.some(m => m.id === id))); sel.size || (ancla = -1); marcaSel();
  pintaAgenda(); if (!evForm.hidden) evPintaChips();
}
// selección múltiple: Ctrl+clic alterna, Mayús+clic rango, Espacio alterna en la fila enfocada
const SVG_OK = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
const SVG_SOBRE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 9.5L12 4l8.5 5.5V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/><path d="M3.5 9.5L12 15l8.5-5.5"/></svg>';
let sel = new Set(), ancla = -1;
const filas = () => [...document.querySelectorAll('#correo .fila-correo')];
function marcaSel() {
  $('correo').classList.toggle('sel', sel.size > 0);
  filas().forEach(f => { const on = sel.has(f.dataset.id); f.classList.toggle('marcada', on); f.setAttribute('aria-selected', on); f.querySelector('.chk').setAttribute('aria-checked', on); });
  $('cbarra').hidden = !sel.size; $('cn').textContent = sel.size + (sel.size === 1 ? ' seleccionado' : ' seleccionados');
  $('c-todo').hidden = sel.size >= filas().length;
}
function alterna(f, rango) {
  const fs = filas(), i = fs.indexOf(f);
  if (rango && ancla >= 0) { const [a, b] = [Math.min(ancla, i), Math.max(ancla, i)]; fs.slice(a, b + 1).forEach(x => sel.add(x.dataset.id)); }
  else { sel.has(f.dataset.id) ? sel.delete(f.dataset.id) : sel.add(f.dataset.id); ancla = i; }
  marcaSel();
}
function leer(ids) { // optimista: quita negrita/punto, baja el contador y avisa a Outlook
  if (!correo || !correo.ok || !ids.length) return;
  const nuevos = correo.correos.filter(m => ids.includes(m.id) && !m.leido);
  nuevos.forEach(m => m.leido = true);
  if (ocultarLeidos) pintaCorreo(correo); // los leídos desaparecen de la lista
  else filas().filter(f => ids.includes(f.dataset.id)).forEach(f => { f.classList.remove('nl'); const b = f.querySelector('.leer'); if (b) b.remove(); });
  correo.noLeidos = Math.max(0, correo.noLeidos - nuevos.length); $('chip').hidden = !correo.noLeidos; $('chip').textContent = correo.noLeidos;
  api.marcarLeidos && api.marcarLeidos(ids);
}
$('correo').onclick = e => {
  const f = e.target.closest('.fila-correo'); if (!f) return;
  if (e.target.closest('.leer')) return leer([f.dataset.id]);
  if (e.target.closest('.chk')) return alterna(f, e.shiftKey);
  if (e.ctrlKey || e.metaKey || e.shiftKey || sel.size) alterna(f, e.shiftKey); else api.abrirCorreo(f.dataset.id);
};
$('correo').addEventListener('keydown', e => {
  const f = e.target.closest && e.target.closest('.fila-correo'); if (!f || e.target !== f) return;
  if (e.key === ' ') { e.preventDefault(); alterna(f, e.shiftKey); } else if (e.key === 'Enter') api.abrirCorreo(f.dataset.id);
});
$('c-leer').onclick = () => { leer([...sel]); sel.clear(); ancla = -1; marcaSel(); };
$('c-ocultar').setAttribute('aria-checked', ocultarLeidos);
$('c-ocultar').onclick = () => {
  ocultarLeidos = !ocultarLeidos; $('c-ocultar').setAttribute('aria-checked', ocultarLeidos);
  try { localStorage.setItem('ocultarLeidos', ocultarLeidos ? '1' : '0'); } catch {}
  if (correo) pintaCorreo(correo);
};
$('c-todo').onclick = () => { filas().forEach(f => sel.add(f.dataset.id)); marcaSel(); };
$('c-nada').onclick = () => { sel.clear(); ancla = -1; marcaSel(); };
// todo el buzón: cuenta primero y pide confirmación con el número real (puede ser muchísimo y no tiene deshacer)
const plural = (n, u) => n + ' ' + u + (n === 1 ? '' : 's');
$('c-buzon').onclick = async () => {
  $('c-buzon').disabled = true; $('c-buzon').textContent = 'Contando…';
  let r = null; try { r = await api.buzonContar(); } catch {}
  $('c-buzon').disabled = false; $('c-buzon').textContent = 'Marcar todo el buzón como leído';
  if (!r || !r.ok) return evAviso('No se pudo contar el correo');
  if (!r.total) return evAviso('No hay correos sin leer');
  $('c-conf-t').textContent = `¿Marcar ${plural(r.total, 'correo')} sin leer de todas las carpetas?`;
  $('c-conf').hidden = false; $('c-buzon').hidden = true;
};
$('c-conf-no').onclick = () => { $('c-conf').hidden = true; $('c-buzon').hidden = false; };
$('c-conf-ok').onclick = async () => {
  $('c-conf-ok').disabled = true; $('c-conf-ok').textContent = 'Marcando…';
  let r = null; try { r = await api.buzonMarcar(); } catch {}
  $('c-conf-ok').disabled = false; $('c-conf-ok').textContent = 'Sí, marcar';
  $('c-conf').hidden = true; $('c-buzon').hidden = false;
  evAviso(r && r.ok ? `Marcados ${plural(r.hechos, 'correo')}` + (r.fallos ? ` (${r.fallos} no se pudieron)` : '') : 'No se pudo marcar el buzón');
};

// ---- agenda
const SVG_PIN = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16.5V22"/><path d="M8.5 3h7l-1 6.5 3 3.2V15h-12v-2.3l3-3.2z"/></svg>';
const SVG_LAPIZ = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>';
const SVG_BASURA = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l1 12.5h9l1-12.5"/></svg>';
// borrar evento: la clave identifica la fila; la confirmación sigue abierta aunque la agenda se repinte cada minuto
const clave = e => (e.id || '') + '|' + e.inicio;
let borrarPend = null;
function confirmarBorrado(e) {
  if (!e.id || borrarPend !== clave(e)) return '';
  const botones = e.recurrente
    ? `<span>¿Borrar de Outlook?</span><button class="btn-sec" data-act="una">Solo esta</button><button class="btn-sec" data-act="serie">Toda la serie</button>`
    : `<span>¿Borrar de Outlook?</span><button class="btn-sec" data-act="una">Borrar</button>`;
  return `<div class="ev-conf" role="group" aria-label="Confirmar borrado" data-k="${esc(clave(e))}">${botones}<button class="btn-txt" data-act="no">Cancelar</button></div>`;
}
async function evConfirma(b) {
  const k = b.closest('.ev-conf').dataset.k, act = b.dataset.act;
  borrarPend = null;
  const ev = act === 'no' || !correo || !correo.agenda ? null : correo.agenda.find(x => clave(x) === k);
  if (!ev) return pintaAgenda();
  const serie = act === 'serie';
  correo.agenda = correo.agenda.filter(x => !(x.id === ev.id && (serie || x.inicio === ev.inicio))); // se quita ya; si falla, main vuelve a leer Outlook
  pintaAgenda();
  let r = null; try { r = await api.borrarEvento({ id: ev.id, inicio: ev.inicio, recurrente: ev.recurrente, serie }); } catch {}
  evAviso(r && r.ok ? (serie ? 'Serie borrada' : 'Evento borrado') : (r && r.motivo) || 'No se pudo borrar el evento');
}
let alarmasL = [];
const alarmaMs = e => e.todoDia ? dia0(new Date(e.inicio)).getTime() + 9 * 36e5 : new Date(e.inicio).getTime(); // todo el día: a las 09:00
const tituloEv = el => el.querySelector('.tt').firstChild.textContent;
const alarmaDe = el => alarmasL.find(a => a.tipo === 'fecha' && !a.origen && a.objetivo === +el.dataset.ms && a.nombre === tituloEv(el).replace(/\s+/g, ' ').trim().slice(0, 60));
function marcaEventos() { document.querySelectorAll('#agenda .evento').forEach(el => el.querySelector('.pin-ev').setAttribute('aria-pressed', !!alarmaDe(el))); }
async function evAlarma(el) { // alterna la alarma del Gestor de este evento
  const a = alarmaDe(el), ms = +el.dataset.ms;
  if (a) { await window.alarmas.borrar(a.id); return evAviso('Alarma quitada'); }
  if (ms <= Date.now()) return evAviso('Ya ha pasado');
  const g = await window.alarmas.crear({ nombre: tituloEv(el), tipo: 'fecha', objetivo: ms, deAgenda: true, ...(el.dataset.c && { color: el.dataset.c }) });
  if (!g.ok) return evAviso(g.error);
  const d = new Date(ms);
  evAviso('Alarma puesta ' + (dia0(d).getTime() === dia0(new Date()).getTime() ? '' : 'el ' + evFecha(d) + ' ') + 'a las ' + hhmm(d));
}
let agN = 7, agCarga = false, agScroll = false, agObs = null, agTimer = null; // días pintados · pidiendo más · el usuario ha hecho scroll · observador del botón
const AG_MAX = 120, norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); // sin tildes ni mayúsculas (buscador)
function agMas() { if (agCarga || agN >= AG_MAX) return; agCarga = true; agScroll = false; clearTimeout(agTimer); agTimer = setTimeout(() => { agCarga = false; pintaAgenda(); }, 3e4); $('ag-mas').textContent = 'Cargando…'; $('ag-mas').disabled = true; api.agendaMas(); }
$('p-agenda').addEventListener('scroll', () => { agScroll = true; }, { passive: true });
$('agenda').addEventListener('click', e => { if (e.target.closest('#ag-mas')) agMas(); });
$('ag-buscar').addEventListener('input', () => { $('p-agenda').scrollTop = 0; pintaAgenda(); });
function pintaAgenda() {
  const h = dia0(new Date()), eventos = correo && correo.ok ? correo.agenda || [] : [], n = correo && correo.ok && correo.dias || 7, top = $('p-agenda').scrollTop, q = norm($('ag-buscar').value.trim()), pal = q.split(/\s+/).filter(Boolean);
  const fecha = i => new Date(h.getFullYear(), h.getMonth(), h.getDate() + i);
  const largo = d => d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' });
  const nombre = (d, i) => i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : largo(d).replace(/^./, c => c.toUpperCase());
  const evDe = i => { const ini = fecha(i).getTime(), f = fecha(i + 1).getTime(); return eventos.filter(e => { const a = new Date(e.inicio).getTime(), b = new Date(e.fin || e.inicio).getTime(); return a < f && Math.max(b, a + 1) > ini; }).sort((x, y) => new Date(x.inicio) - new Date(y.inicio)).filter(e => !q || pal.every(p => norm(e.titulo + ' ' + (e.lugar || '') + ' ' + (e.categoria || '')).includes(p))); };
  const dia = (i, ev) => `<div class="diah" role="button" tabindex="0" data-i="${i}" title="Añadir evento este día">${nombre(fecha(i), i)}</div>` + (ev.length ? ev.map(e => `<div class="evento" tabindex="0" data-ms="${alarmaMs(e)}"${/^#[0-9a-f]{6}$/i.test(e.color) ? ` data-c="${e.color}"` : ''}><span class="h">${e.todoDia ? 'Todo el día' : hhmm(new Date(e.inicio)) + (e.fin ? '–' + hhmm(new Date(e.fin)) : '')}</span><span class="tt" title="${esc(e.lugar)}">${esc(e.titulo)}${e.lugar ? `<small>${esc(e.lugar)}</small>` : ''}</span>${e.categoria && e.color ? `<span class="cat">${esc(e.categoria)}</span>` : ''}${e.id ? `<button class="editar-ev" data-k="${esc(clave(e))}" aria-label="Editar evento: ${esc(e.titulo)}" title="Editar">${SVG_LAPIZ}</button><button class="borrar-ev" data-k="${esc(clave(e))}" aria-label="Borrar evento: ${esc(e.titulo)}" title="Borrar de Outlook">${SVG_BASURA}</button>` : ''}<button class="pin-ev" aria-pressed="false" aria-label="Poner como alarma: ${esc(e.titulo)}" title="Poner como alarma">${SVG_PIN}</button></div>${confirmarBorrado(e)}`).join('') : '<div class="vacio">Sin eventos</div>');
  let html = '', ini = -1, fin = -1; // racha de días vacíos (desde el día 8 se agrupan en una línea)
  const cierra = () => { if (ini >= 0) html += `<div class="vacio fino">Sin eventos ${ini === fin ? 'el' : 'hasta el'} ${largo(fecha(fin))}</div>`; ini = fin = -1; };
  if (q) { for (let i = 0; i < n; i++) { const ev = evDe(i); if (ev.length) html += dia(i, ev); } if (!html) html = `<div class="vacio">Sin resultados en los próximos ${n} días</div>`; } // búsqueda: solo días con coincidencias
  else for (let i = 0; i < n; i++) {
    const d = fecha(i), ev = evDe(i);
    if (i >= 7) { // separador discreto: mes nuevo, o lunes (semana nueva)
      const sep = d.getDate() === 1 ? d.toLocaleDateString('es-ES', { month: 'long' }).replace(/^./, c => c.toUpperCase()) : d.getDay() === 1 ? 'Semana del ' + d.getDate() : '';
      if (sep) { cierra(); html += `<div class="semh">${sep}</div>`; }
    }
    if (i >= 7 && !ev.length) { if (ini < 0) ini = i; fin = i; continue; }
    cierra(); html += dia(i, ev);
  }
  if (!q) cierra();
  agN = n; $('ag-dias').textContent = n;
  if (n < AG_MAX) html += `<button id="ag-mas" class="btn-txt"${agCarga ? ' disabled' : ''}>${agCarga ? 'Cargando…' : 'Cargar 2 semanas más'}</button>`;
  $('agenda').innerHTML = html;
  $('p-agenda').scrollTop = top;
  marcaEventos();
  $('agenda').querySelectorAll('.evento[data-c]').forEach(el => el.style.setProperty('--c', el.dataset.c)); // CSP: sin style inline en el HTML
  if (agObs) agObs.disconnect();
  const bt = $('ag-mas');
  if (bt && window.IntersectionObserver) { agObs = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting) && agScroll && !agCarga) agMas(); }, { root: $('p-agenda') }); agObs.observe(bt); } // carga sola al llegar al fondo (solo tras un scroll del usuario)
}

// ---- nuevo evento (formulario de la Agenda)
const evForm = $('ev-form');
let evDia = null, evDur = 60, evCat = '', evBusy = false, evAvisoT = 0, evEdit = null; // evEdit: evento que se está editando { id, inicioOriginal, recurrente, cat }
const evEtq = () => evEdit ? 'Guardar cambios' : 'Añadir a Outlook';
const evIso = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:00`;
const evFecha = d => d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'numeric' }).replace('.', '').replace(/, /, ' ');
// Texto -> { ev, ini, fin } o { error }. Sin fecha en el texto usa el día elegido (evDia); sin hora = todo el día.
function evLeer() {
  const t0 = $('ev-texto').value.trim(); if (!t0) return { error: '' };
  const d = Tiempo.extraerDuracion(t0), t = d.resto; if (!t) return { error: '' };
  const hayHora = /(?<![\d:])\d{1,2}:\d{2}(?![\d:])/.test(t), hayFecha = /\d{1,2}\/\d{1,2}|(?<![\p{L}])(hoy|ma[ñn]ana|pasado|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)(?![\p{L}])/iu.test(t);
  let ini, titulo;
  if (evDia && !hayFecha) {
    const r = hayHora ? Tiempo.parsear(t, evDia.getTime()) : null;
    if (r && !r.ok) return { error: r.error };
    if (r && r.rec.tipo !== 'fecha') return { error: 'Escribe una hora (10:00) o déjalo sin hora para todo el día' };
    ini = r ? new Date(r.rec.objetivo) : new Date(evDia); titulo = r ? r.rec.nombre : t;
  } else {
    const r = Tiempo.parsear(t, Date.now());
    if (!r.ok) return { error: r.error };
    if (r.rec.tipo !== 'fecha') return { error: 'Falta la fecha: «mañana 10:00», «viernes 20:00», «20/11 09:30»' };
    ini = new Date(r.rec.objetivo); titulo = r.rec.nombre;
  }
  if (d.min && !hayHora) return { error: 'Falta la hora de inicio (10:00)' };
  const todoDia = !d.min && (evDur === 0 || !hayHora);
  if (todoDia) ini = dia0(ini);
  const fin = todoDia ? new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + 1) : new Date(ini.getTime() + (d.min || evDur || 60) * 6e4);
  return { ev: { titulo, inicio: evIso(ini), fin: evIso(fin), todoDia, lugar: $('ev-lugar-i').value, categoria: evCat }, ini, fin, min: d.min };
}
function evVista() {
  const v = $('ev-vista'), r = evLeer(); v.className = ''; v.textContent = '';
  const conDur = Tiempo.extraerDuracion($('ev-texto').value).min != null; // con duración en el texto, ningún botón queda marcado
  document.querySelectorAll('.ev-dur').forEach(b => b.setAttribute('aria-pressed', !conDur && +b.dataset.m === evDur));
  if (r.error != null) { if (r.error) { v.className = 'mal'; v.textContent = r.error; } else if (evDia) v.textContent = 'Día: ' + evFecha(evDia); return r; }
  v.append(Object.assign(document.createElement('b'), { textContent: r.ev.titulo }), ' · ' + evFecha(r.ini) + (r.ev.todoDia ? ' · todo el día' : ' ' + hhmm(r.ini) + '–' + hhmm(r.fin)));
  return r;
}
function evPintaChips() {
  const cats = correo && correo.ok ? correo.categorias || [] : [];
  if (evCat && !cats.some(c => c.nombre === evCat)) evCat = '';
  const box = $('ev-chips'); box.hidden = !cats.length; box.textContent = '';
  cats.forEach(c => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ev-chip'; b.textContent = c.nombre; b.setAttribute('aria-pressed', c.nombre === evCat);
    if (c.color) b.style.setProperty('--c', c.color); else b.classList.add('sin');
    b.onclick = () => { evCat = evCat === c.nombre ? '' : c.nombre; box.querySelectorAll('.ev-chip').forEach(x => x.setAttribute('aria-pressed', x.textContent === evCat)); };
    box.append(b);
  });
}
function evAbrir(dia) {
  if (evEdit) evCerrar();
  evDia = dia || null; evForm.hidden = false; $('ev-abrir').setAttribute('aria-expanded', 'true'); evPintaChips(); evVista(); $('ev-texto').focus();
}
function evEditar(e) { // abre el formulario con el evento: título + hora en el texto, día elegido, duración, etiqueta y lugar
  const ini = new Date(e.inicio), fin = new Date(e.fin || e.inicio), min = Math.round((fin - ini) / 6e4);
  evCerrar(); evForm.hidden = false; $('ev-abrir').setAttribute('aria-expanded', 'true');
  evDia = dia0(ini); evDur = e.todoDia ? 0 : (min > 0 ? min : 60); evCat = e.categoria || '';
  $('ev-texto').value = e.titulo + (e.todoDia ? '' : ' ' + hhmm(ini) + ([15, 30, 60, 120].includes(min) || min <= 0 ? '' : min < 60 ? ` ${min}min` : min % 60 ? ` ${Math.floor(min / 60)}h${min % 60}m` : ` ${min / 60}h`));
  $('ev-lugar-i').value = e.lugar || ''; if (e.lugar) { $('ev-lugar').hidden = false; $('ev-mas').hidden = true; }
  document.querySelectorAll('.ev-dur').forEach(b => b.setAttribute('aria-pressed', +b.dataset.m === evDur));
  evPintaChips(); evEdit = { id: e.id, inicioOriginal: e.inicio, recurrente: !!e.recurrente, cat: evCat }; $('ev-crear').textContent = evEtq();
  evVista(); $('ev-texto').focus(); evForm.scrollIntoView({ block: 'nearest' });
}
function evCerrar() {
  evEdit = null; $('ev-crear').textContent = evEtq();
  evForm.hidden = true; $('ev-abrir').setAttribute('aria-expanded', 'false'); evDia = null; evCat = ''; evDur = 60;
  $('ev-texto').value = ''; $('ev-lugar-i').value = ''; $('ev-lugar').hidden = true; $('ev-mas').hidden = false;
  document.querySelectorAll('.ev-dur').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === '60'));
}
function evAviso(txt) { // aviso breve en la pestaña que se ve (en Agenda, encima de la lista)
  let a = $('ev-aviso'); if (!a) { a = document.createElement('div'); a.id = 'ev-aviso'; a.setAttribute('role', 'status'); }
  const vis = document.querySelector('.pestana:not([hidden])') || $('paneles');
  if (vis.id === 'p-agenda') $('agenda').before(a); else vis.prepend(a);
  a.textContent = txt; clearTimeout(evAvisoT); evAvisoT = setTimeout(() => a.remove(), 3500);
}
$('ev-abrir').onclick = () => evForm.hidden ? evAbrir() : evCerrar();
$('ev-cancelar').onclick = () => { evCerrar(); $('ev-abrir').focus(); };
$('ev-texto').addEventListener('input', evVista); $('ev-lugar-i').addEventListener('input', evVista);
$('ev-mas').onclick = () => { $('ev-lugar').hidden = false; $('ev-mas').hidden = true; $('ev-lugar-i').focus(); };
$('ev-dur').onclick = e => {
  const b = e.target.closest('.ev-dur'); if (!b) return;
  const d = Tiempo.extraerDuracion($('ev-texto').value); if (d.min != null) $('ev-texto').value = d.resto; // el botón sustituye a la duración escrita
  evDur = +b.dataset.m; document.querySelectorAll('.ev-dur').forEach(x => x.setAttribute('aria-pressed', x === b)); evVista();
};
evForm.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); evCerrar(); $('ev-abrir').focus(); } });
evForm.onsubmit = async e => {
  e.preventDefault(); if (evBusy) return;
  const r = evVista(); if (!r.ev) { if (!r.error) { $('ev-vista').className = 'mal'; $('ev-vista').textContent = 'Escribe el evento'; } return; }
  const ed = evEdit; evBusy = true; $('ev-crear').disabled = true; $('ev-crear').textContent = ed ? 'Guardando…' : 'Creando…';
  let g;
  try {
    if (ed) { const d = { ...r.ev, id: ed.id, inicioOriginal: ed.inicioOriginal, recurrente: ed.recurrente }; if (evCat === ed.cat) delete d.categoria; g = await api.editarEvento(d); }
    else g = await api.crearEvento(r.ev);
  } catch { g = { ok: false, motivo: ed ? 'No se pudo editar el evento' : 'No se pudo crear el evento' }; }
  evBusy = false; $('ev-crear').disabled = false; $('ev-crear').textContent = evEtq();
  if (g && g.ok) { evCerrar(); evAviso(ed ? 'Evento actualizado' : 'Añadido a Outlook'); } else { $('ev-vista').className = 'mal'; $('ev-vista').textContent = (g && g.motivo) || 'No se pudo crear el evento'; }
};
const evDiaClic = e => {
  const d = e.target.closest('.diah'); if (!d || (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault(); const h = dia0(new Date()); evAbrir(new Date(h.getFullYear(), h.getMonth(), h.getDate() + +d.dataset.i));
};
$('agenda').addEventListener('click', evDiaClic); $('agenda').addEventListener('keydown', evDiaClic);

$('agenda').addEventListener('click', e => {
  const ed = e.target.closest('.editar-ev'); if (ed) { const ev = correo && correo.agenda && correo.agenda.find(x => clave(x) === ed.dataset.k); if (ev) evEditar(ev); return; }
  const b = e.target.closest('.borrar-ev'); if (b) { borrarPend = b.dataset.k; return pintaAgenda(); }
  const c = e.target.closest('.ev-conf'); if (c) { const bt = e.target.closest('button[data-act]'); if (bt) evConfirma(bt); return; }
  const el = e.target.closest('.evento'); if (el) evAlarma(el);
});
$('agenda').addEventListener('keydown', e => { if (e.target.classList.contains('evento') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); evAlarma(e.target); } });
if (window.alarmas) { window.alarmas.lista().then(l => { alarmasL = l; marcaEventos(); }); window.alarmas.alCambiar(l => { alarmasL = l; marcaEventos(); }); }

// ---- notas rápidas (main las guarda en %APPDATA%\panel\notas.json; cada cambio manda la lista entera)
let notasPidiendo = false, notas = null, notaEdit = null, notaBorrar = null, notaT = 0;
async function notasCargar() {
  if (!notas) { try { notas = await api.notasLeer(); } catch { notas = []; } }
  pintaNotas();
}
function notasGuardar() {
  const fallo = () => evAviso('No se pudieron guardar las notas');
  api.notasGuardar(notas).then(r => { if (!r || !r.ok) fallo(); }).catch(fallo);
}
const fechaNota = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
function pintaNotas() {
  if (!notas) return;
  $('nt-n').textContent = notas.length ? '· ' + notas.length : '';
  if (!notas.length) { $('nt-lista').innerHTML = '<div class="vacio">Sin notas todavía</div>'; return; }
  $('nt-lista').innerHTML = notas.map(n => n.id === notaEdit
    ? `<article class="nota" data-id="${esc(n.id)}"><textarea class="campo" rows="4" maxlength="5000" aria-label="Editar nota">${esc(n.texto)}</textarea><div class="ev-fila"><button class="btn-txt" data-act="guardar">Guardar</button><button class="btn-sec" data-act="cancelar">Cancelar</button></div></article>`
    : `<article class="nota" data-id="${esc(n.id)}"><p>${esc(n.texto)}</p><footer><time>${esc(fechaNota(n.creada))}</time><span class="acciones"><button class="btn-sec" data-act="editar">Editar</button><button class="btn-sec${notaBorrar === n.id ? ' peligro' : ''}" data-act="borrar">${notaBorrar === n.id ? '¿Borrar?' : 'Borrar'}</button></span></footer></article>`).join('');
}
$('nt-form').addEventListener('submit', e => {
  e.preventDefault();
  const t = $('nt-texto'), texto = t.value.trim(); if (!texto || !notas) return;
  notas.unshift({ id: crypto.randomUUID(), texto, creada: new Date().toISOString() });
  t.value = ''; notasGuardar(); pintaNotas();
});
$('nt-texto').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('nt-form').requestSubmit(); } });
$('nt-lista').addEventListener('click', e => {
  const art = e.target.closest('.nota'), b = e.target.closest('button[data-act]'); if (!art || !b || !notas) return;
  const n = notas.find(x => x.id === art.dataset.id); if (!n) return;
  const act = b.dataset.act;
  if (act === 'editar') { notaEdit = n.id; notaBorrar = null; }
  else if (act === 'cancelar') notaEdit = null;
  else if (act === 'guardar') { const v = art.querySelector('textarea').value.trim(); if (v) n.texto = v; notaEdit = null; notasGuardar(); }
  else if (act === 'borrar') { // dos pulsaciones: la primera pide confirmación durante 3 s
    if (notaBorrar !== n.id) { notaBorrar = n.id; clearTimeout(notaT); notaT = setTimeout(() => { notaBorrar = null; pintaNotas(); }, 3000); }
    else { clearTimeout(notaT); notaBorrar = null; notas = notas.filter(x => x.id !== n.id); notasGuardar(); }
  }
  pintaNotas();
});

// ---- sistema
const pintaSistema = () => { $('sistema').innerHTML = htmlSistema(sis, bateria); pintaWidgets(); };
// ---- pestaña Widgets: galería con vista previa en vivo; la estructura se crea una vez y solo se refrescan las vistas y los «en el escritorio»
let wAbiertos = [], wCfgs = {};
const wOn = v => wAbiertos.includes(v.tipo) && Object.keys(v.cfg).every(k => (wCfgs[v.tipo] || {})[k] === v.cfg[k]);
function pintaWidgets() {
  const g = $('widgets-g'); if (!g || $('p-widgets').hidden) return;
  if (!notas && !notasPidiendo) { notasPidiendo = true; notasCargar().finally(() => { notasPidiendo = false; pintaWidgets(); }); }
  if (!g.children.length) g.innerHTML = WVARIANTES.map((v, i) => `<button class="wg" data-i="${i}" aria-pressed="false"><div class="wg-v"></div><span class="wg-n">${esc(v.nombre)}</span><small></small></button>`).join('');
  const dispo = Math.max(160, g.clientWidth - 22);
  [...g.children].forEach((b, i) => {
    const v = WVARIANTES[i], ancho = WANCHO[v.tipo][v.cfg.tam], el = b.firstElementChild, on = wOn(v), cfg = { ...v.cfg, uid: 'v' + i };
    el.style.setProperty('width', ancho + 'px'); el.style.setProperty('zoom', Math.min(1, dispo / ancho));
    el.innerHTML = v.tipo === 'agenda' ? htmlAgenda(correo, cfg) : v.tipo === 'notas' ? htmlNotas(notas, cfg) : v.tipo === 'tiempo' ? htmlCiudades(meteo, ciudadSel, 0, meteoT, false, cfg).html : sis || bateria ? htmlSistema(sis, bateria, cfg) : '<div class="vacio">Cargando…</div>';
    colorea(el); b.setAttribute('aria-pressed', on); b.lastElementChild.textContent = on ? 'En el escritorio · pulsa para quitarlo' : 'Pulsa para añadirlo al escritorio';
  });
}
$('widgets-g').addEventListener('click', e => { const b = e.target.closest('.wg'), v = b && WVARIANTES[+b.dataset.i]; if (v) api.widget(v.tipo, !wOn(v), v.cfg); });
api.on('widgetsCfg', c => { wCfgs = c || {}; pintaWidgets(); });
if (navigator.getBattery) navigator.getBattery().then(b => { bateria = b; b.onlevelchange = b.onchargingchange = pintaSistema; pintaSistema(); }).catch(() => {});

// ---- IPC
api.on('correo', r => { if (!r || !r.ok || r.obsoleto || (r.dias || 7) > agN) { agCarga = false; clearTimeout(agTimer); } pintaCorreo(r); });
api.on('notas', l => { notas = l; if (notaEdit === null) pintaNotas(); pintaWidgets(); }); // cambios desde el widget de Notas
api.on('meteo', r => { meteo = r; meteoT = Date.now(); pintaMeteo(); });
api.on('pestana', n => ir(n));
api.on('nuevo-evento', () => { ir('agenda'); evAbrir(); }); // Alt+C
api.on('tema', t => t && /^#[0-9a-f]{6}$/i.test(t.acento) && document.documentElement.style.setProperty('--acento', t.acento));
api.on('actualizacion', a => { // pastilla «Nueva versión X» (solo si hay y no es pantalla completa)
  $('nueva').hidden = !a; if (!a) return;
  const ocupado = a.estado === 'descargando' || a.estado === 'instalando';
  $('nueva-txt').textContent = a.estado === 'descargando' ? 'Descargando…' : a.estado === 'instalando' ? 'Instalando…' : a.estado === 'error' ? a.mensaje || 'Error' : 'Nueva versión ' + a.version;
  $('nueva-ok').textContent = a.estado === 'error' ? 'Reintentar' : 'Actualizar'; $('nueva-ok').hidden = $('nueva-tarde').hidden = ocupado;
});
$('nueva-ok').onclick = () => api.instalarActualizacion(); $('nueva-tarde').onclick = () => api.masTarde();
api.on('sistema', s => { sis = s; pintaSistema(); });
document.querySelectorAll('.wd').forEach(b => b.onclick = () => api.widget(b.dataset.w, b.getAttribute('aria-pressed') !== 'true')); // widgets del escritorio
api.on('widgets', l => { wAbiertos = Array.isArray(l) ? l : []; pintaWidgets(); });
api.on('widgets', l => document.querySelectorAll('.wd').forEach(b => { const on = Array.isArray(l) && l.includes(b.dataset.w); b.setAttribute('aria-pressed', on); b.textContent = on ? '🖥️ Quitar widget' : '🖥️ Widget'; }));
api.on('estado', e => { document.body.classList.toggle('abierto', e.abierto); $('pin').classList.toggle('on', e.fijado); $('pin').setAttribute('aria-pressed', !!e.fijado); if (e.abierto) reloj(); });
reloj(); pintaAgenda();
setInterval(reloj, 1000);
setInterval(pintaAgenda, 6e4);
setInterval(pintaMeteo, 6e4); // la rayita de ahora avanza sola
