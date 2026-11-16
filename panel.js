const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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
$('tiempo').addEventListener('click', e => { const b = e.target.closest('.fr-b'); if (b && !b.disabled) { diaSel += +b.dataset.d; pintaMeteo(); } });
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
  if (n === 'notas') queueMicrotask(notasCargar); // tras cargar el script: `notas` ya existe
}
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
  if (t && t.closest('#p-alarmas') && t.tagName === 'INPUT' && t.type !== 'checkbox' && t.value) { t.value = ''; t.dispatchEvent(new Event('input')); } else api.cerrar();
});


// ---- tiempo
const W = 340, PX = 16, IY = 17, GT = 58, GB = 112, BY = 126, GH = 150; // ancho del gráfico (viewBox; se escala al ancho útil), margen lateral, y de iconos / máx / mín / base de la lluvia, alto
const xh = h => PX + h / 24 * (W - 2 * PX), clamp = (y, a, b) => Math.max(a, Math.min(b, y));
let meteo = null, meteoT = 0;
function curva(p) { // spline Catmull-Rom -> Béziers, sin salirse de la franja de la curva
  const q = i => p[Math.max(0, Math.min(p.length - 1, i))], c = y => clamp(y, GT, GB).toFixed(1);
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = q(i - 1), b = q(i), e = q(i + 1), f = q(i + 2);
    d += `C${(b[0] + (e[0] - a[0]) / 6).toFixed(1)} ${c(b[1] + (e[1] - a[1]) / 6)} ${(e[0] - (f[0] - b[0]) / 6).toFixed(1)} ${c(e[1] - (f[1] - b[1]) / 6)} ${e[0].toFixed(1)} ${e[1].toFixed(1)}`;
  }
  return d;
}
// Gráfico del día (0–24 h, sin scroll). `ah` = hora decimal de ahora (-1: otro día, sin «ahora»); `ta` = temperatura actual;
// `ref` = horas de HOY, que en otro día se dibujan como una curva translúcida para comparar (misma escala).
// `horas` puede ser de horas en punto (hd = índice) o de puntos cada 15 min (hd = hora decimal, 14.25 = 14:15).
function franja(horas, ah, ta, ref, nombre) {
  const n = horas.length, T = horas.map(h => Math.round(h.temp)), TR = ref ? ref.map(h => Math.round(h.temp)) : [];
  const HD = horas.map((h, i) => h.hd ?? i), enHora = i => Number.isInteger(HD[i]);
  const dmx = Math.max(...T), dmn = Math.min(...T), mx = Math.max(dmx, ...TR), mn = Math.min(dmn, ...TR), im = T.indexOf(dmx), ii = T.indexOf(dmn), hoy = ah >= 0;
  const yt = v => GB - (mx === mn ? .5 : clamp((v - mn) / (mx - mn), 0, 1)) * (GB - GT);
  const X = HD.map(hd => xh(hd)), p = T.map((v, i) => [X[i], yt(v)]), c = curva(p), xa = hoy ? xh(ah) : 0, ya = hoy ? yt(ta) : 0;
  const refCurva = TR.length > 1 ? `<path class="fr-hoy" d="${curva(TR.map((v, i) => [xh(i), yt(v)]))}"/>` : '';
  const fin = `L${p[n - 1][0].toFixed(1)} ${BY}L${p[0][0].toFixed(1)} ${BY}Z`;
  const grupo = cl => `<g clip-path="url(#${cl})"><path class="fr-a" d="${c}${fin}"/><path class="fr-l" d="${c}"/></g>`;
  const marcas = new Set(dmx === dmn ? [] : [im, ii]); // temperaturas con texto: máx/mín y cada 3 h, sin pisar la de ahora ni las marcadas
  const lbl = [...marcas].map(i => [i, 1]).concat(Array.from({ length: n }, (_, i) => i).filter(i => enHora(i) && HD[i] % 3 === 0 && ![...marcas].some(m => Math.abs(HD[m] - HD[i]) < 2)).map(i => [i, 0]));
  const textos = lbl.filter(([i]) => Math.abs(HD[i] - ah) >= 2).map(([i, k]) => `<circle class="${k ? 'fr-k' : 'fr-p'}" cx="${p[i][0].toFixed(1)}" cy="${p[i][1].toFixed(1)}" r="${k ? 3.5 : 2}"/><text class="fr-t${k ? ' k' : ''}${HD[i] < ah ? ' pas' : ''}" x="${p[i][0].toFixed(1)}" y="${(p[i][1] - 8).toFixed(1)}">${T[i]}°</text>`).join('');
  const iconos = horas.map((h, i) => !enHora(i) || HD[i] % 3 || !h.icono ? '' : `<text class="fr-i${HD[i] < ah ? ' pas' : ''}" x="${X[i].toFixed(1)}" y="${IY}">${esc(h.icono)}</text>`).join('');
  const eje = Array.from({ length: 8 }, (_, k) => `<text class="fr-h${k * 3 < ah ? ' pas' : ''}" x="${xh(k * 3).toFixed(1)}" y="${GH - 4}">${k * 3}h</text>`).join('');
  const lluvia = horas.map((h, i) => enHora(i) && h.lluvia > 0 ? `<rect class="fr-ll${HD[i] < ah ? ' pas' : ''}" x="${(X[i] - 1.25).toFixed(1)}" y="${(BY - Math.max(2, h.lluvia * .14)).toFixed(1)}" width="2.5" height="${Math.max(2, h.lluvia * .14).toFixed(1)}" rx="1.25"/>` : '').join('');
  return `<div class="franja"><svg class="fr-g" viewBox="0 0 ${W} ${GH}" role="img" aria-label="Temperatura de ${esc(nombre)}, de ${dmn}° a ${dmx}°${hoy ? `, ahora ${Math.round(ta)}°` : ''}">
    <defs><linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop class="g1" offset="0"/><stop class="g2" offset="1"/></linearGradient>
      <clipPath id="cp"><rect x="0" y="0" width="${xa.toFixed(1)}" height="${GH}"/></clipPath><clipPath id="cf"><rect x="${xa.toFixed(1)}" y="0" width="${W}" height="${GH}"/></clipPath></defs>
    ${refCurva}<g class="pas">${grupo('cp')}</g>${grupo('cf')}<line class="fr-e" x1="${PX}" y1="${BY}" x2="${W - PX}" y2="${BY}"/>${lluvia}${iconos}${textos}
    ${hoy ? `<line class="fr-ya" x1="${xa.toFixed(1)}" y1="${IY + 8}" x2="${xa.toFixed(1)}" y2="${BY}"/><circle class="fr-k" cx="${xa.toFixed(1)}" cy="${ya.toFixed(1)}" r="4.5"/>
    <text class="fr-t k" x="${clamp(xa, 14, W - 14).toFixed(1)}" y="${(ya - 10).toFixed(1)}">${Math.round(ta)}°</text>` : ''}${eje}</svg></div>`;
}
// Resumen del día bajo el gráfico: máximos (viento, UV) o medias (humedad, sensación, presión, nubes) de sus horas
function detalles(hs) {
  const vals = k => hs.map(h => h[k]).filter(x => x != null);
  const media = k => { const v = vals(k); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const maximo = k => { const v = vals(k); return v.length ? Math.max(...v) : null; };
  const f = (nombre, v, u) => v == null ? '' : `<span>${nombre} <b>${Math.round(v)}${u}</b></span>`;
  const s = f('viento máx', maximo('viento'), ' km/h') + f('humedad', media('humedad'), '%') + f('sensación', media('sens'), '°') +
    f('UV máx', maximo('uv'), '') + f('presión', media('presion'), ' hPa') + f('nubes', media('nubes'), '%');
  return s ? `<div class="det">${s}</div>` : '';
}
let diaSel = 0; // día que muestra el gráfico: 0 = hoy, 1 = mañana…
const NOM_DIA = ['Hoy', 'Mañana', 'Pasado mañana'];
function pintaMeteo() {
  const r = meteo, t = $('tiempo');
  if (!r || !r.ok) { t.innerHTML = '<div class="vacio">Tiempo no disponible</div>'; return; }
  const horasDe = k => k === 0 ? (r.horas || []).slice(0, 24) : ((r.dias[k] && r.dias[k].horas) || []).slice(0, 24);
  let max = 0; while (max + 1 < r.dias.length && horasDe(max + 1).length > 1) max++;
  diaSel = clamp(diaSel, 0, max);
  const a = r.actual, hs = horasDe(diaSel), dsel = r.dias[diaSel], ah = diaSel ? -1 : clamp((Number.isFinite(r.ahora) ? r.ahora : new Date().getHours() + new Date().getMinutes() / 60) + (Date.now() - meteoT) / 36e5, 0, 24);
  const nombre = diaSel < 3 ? NOM_DIA[diaSel].toLowerCase() : String(dsel.nombre);
  const nav = max ? `<div class="fr-nav"><button class="fr-b" data-d="-1" aria-label="Día anterior"${diaSel ? '' : ' disabled'}>‹</button><span aria-live="polite">${esc(diaSel < 3 ? NOM_DIA[diaSel] : dsel.nombre)}</span><button class="fr-b" data-d="1" aria-label="Día siguiente"${diaSel < max ? '' : ' disabled'}>›</button></div>` : '';
  const resumen = diaSel ? `<div class="ahora"><div class="ic">${esc(dsel.icono)}</div><div class="t">${Math.round(dsel.max)}°</div>
    <div class="x"><b>${esc(dsel.texto)}</b><br>mín ${Math.round(dsel.min)}° · lluvia ${Math.round(dsel.lluvia || 0)}%</div></div>` : `<div class="ahora"><div class="ic">${esc(a.icono)}</div><div class="t">${Math.round(a.temp)}°</div>
    <div class="x"><b>${esc(a.texto)}</b><br>${esc(r.lugar.nombre)} · viento ${Math.round(a.viento)} km/h</div></div>`;
  const pts = (diaSel ? dsel.puntos : r.puntos) || [], serie = pts.length > 1 ? pts : hs; // cada 15 min si Open-Meteo los dio; si no, por horas
  t.innerHTML = nav + (serie.length > 1 ? franja(serie, ah, a.temp, diaSel ? horasDe(0) : null, nombre) : '') + resumen + detalles(hs) + `
    <div class="dias">${r.dias.slice(0, 5).map(d => `<div>${esc(String(d.nombre).slice(0, 3))}<span class="ic">${esc(d.icono)}</span><span>${Math.round(d.max)}° <small>${Math.round(d.min)}°</small></span><span class="ll">${Math.round(d.lluvia || 0)}%</span></div>`).join('')}</div>`;
}

// ---- correo
function fechaCorta(iso) {
  const f = new Date(iso), h = dia0(new Date()), dd = Math.round((h - dia0(f)) / 864e5);
  if (dd === 0) return hhmm(f);
  if (dd === 1) return 'ayer';
  return f.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '') + ' ' + f.getDate();
}
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
    c.innerHTML = r.correos.length ? r.correos.map(m => `<div class="fila-correo${m.leido ? '' : ' nl'}" data-id="${esc(m.id)}" title="${esc(m.asunto)}" tabindex="0" aria-selected="false"><span class="p"></span><button class="chk" tabindex="-1" role="checkbox" aria-checked="false" aria-label="Seleccionar">${SVG_OK}</button><span class="de">${esc(m.de)}</span>${m.leido ? '' : `<button class="leer" tabindex="-1" title="Marcar como leído" aria-label="Marcar como leído">${SVG_SOBRE}</button>`}<span class="h">${fechaCorta(m.fecha)}</span><span class="as">${esc(m.asunto)}</span></div>`).join('') : '<div class="vacio">Sin correos</div>';
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
  filas().filter(f => ids.includes(f.dataset.id)).forEach(f => { f.classList.remove('nl'); const b = f.querySelector('.leer'); if (b) b.remove(); });
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
  const g = await window.alarmas.crear({ nombre: tituloEv(el), tipo: 'fecha', objetivo: ms, ...(el.dataset.c && { color: el.dataset.c }) });
  if (!g.ok) return evAviso(g.error);
  const d = new Date(ms);
  evAviso('Alarma puesta ' + (dia0(d).getTime() === dia0(new Date()).getTime() ? '' : 'el ' + evFecha(d) + ' ') + 'a las ' + hhmm(d));
}
let agN = 7, agCarga = false, agScroll = false, agObs = null, agTimer = null; // días pintados · pidiendo más · el usuario ha hecho scroll · observador del botón
const AG_MAX = 120;
function agMas() { if (agCarga || agN >= AG_MAX) return; agCarga = true; agScroll = false; clearTimeout(agTimer); agTimer = setTimeout(() => { agCarga = false; pintaAgenda(); }, 3e4); $('ag-mas').textContent = 'Cargando…'; $('ag-mas').disabled = true; api.agendaMas(); }
$('p-agenda').addEventListener('scroll', () => { agScroll = true; }, { passive: true });
$('agenda').addEventListener('click', e => { if (e.target.closest('#ag-mas')) agMas(); });
function pintaAgenda() {
  const h = dia0(new Date()), eventos = correo && correo.ok ? correo.agenda || [] : [], n = correo && correo.ok && correo.dias || 7, top = $('p-agenda').scrollTop;
  const fecha = i => new Date(h.getFullYear(), h.getMonth(), h.getDate() + i);
  const largo = d => d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' });
  const nombre = (d, i) => i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : largo(d).replace(/^./, c => c.toUpperCase());
  const evDe = i => { const ini = fecha(i).getTime(), f = fecha(i + 1).getTime(); return eventos.filter(e => { const a = new Date(e.inicio).getTime(), b = new Date(e.fin || e.inicio).getTime(); return a < f && Math.max(b, a + 1) > ini; }).sort((x, y) => new Date(x.inicio) - new Date(y.inicio)); };
  const dia = (i, ev) => `<div class="diah" role="button" tabindex="0" data-i="${i}" title="Añadir evento este día">${nombre(fecha(i), i)}</div>` + (ev.length ? ev.map(e => `<div class="evento" tabindex="0" data-ms="${alarmaMs(e)}"${/^#[0-9a-f]{6}$/i.test(e.color) ? ` data-c="${e.color}"` : ''}><span class="h">${e.todoDia ? 'Todo el día' : hhmm(new Date(e.inicio)) + (e.fin ? '–' + hhmm(new Date(e.fin)) : '')}</span><span class="tt" title="${esc(e.lugar)}">${esc(e.titulo)}${e.lugar ? `<small>${esc(e.lugar)}</small>` : ''}</span>${e.categoria && e.color ? `<span class="cat">${esc(e.categoria)}</span>` : ''}${e.id ? `<button class="borrar-ev" data-k="${esc(clave(e))}" aria-label="Borrar evento: ${esc(e.titulo)}" title="Borrar de Outlook">${SVG_BASURA}</button>` : ''}<button class="pin-ev" aria-pressed="false" aria-label="Poner como alarma: ${esc(e.titulo)}" title="Poner como alarma">${SVG_PIN}</button></div>${confirmarBorrado(e)}`).join('') : '<div class="vacio">Sin eventos</div>');
  let html = '', ini = -1, fin = -1; // racha de días vacíos (desde el día 8 se agrupan en una línea)
  const cierra = () => { if (ini >= 0) html += `<div class="vacio fino">Sin eventos ${ini === fin ? 'el' : 'hasta el'} ${largo(fecha(fin))}</div>`; ini = fin = -1; };
  for (let i = 0; i < n; i++) {
    const d = fecha(i), ev = evDe(i);
    if (i >= 7) { // separador discreto: mes nuevo, o lunes (semana nueva)
      const sep = d.getDate() === 1 ? d.toLocaleDateString('es-ES', { month: 'long' }).replace(/^./, c => c.toUpperCase()) : d.getDay() === 1 ? 'Semana del ' + d.getDate() : '';
      if (sep) { cierra(); html += `<div class="semh">${sep}</div>`; }
    }
    if (i >= 7 && !ev.length) { if (ini < 0) ini = i; fin = i; continue; }
    cierra(); html += dia(i, ev);
  }
  cierra();
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
let evDia = null, evDur = 60, evCat = '', evBusy = false, evAvisoT = 0;
const evIso = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:00`;
const evFecha = d => d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'numeric' }).replace('.', '').replace(/, /, ' ');
// Texto -> { ev, ini, fin } o { error }. Sin fecha en el texto usa el día elegido (evDia); sin hora = todo el día.
function evLeer() {
  const t = $('ev-texto').value.trim(); if (!t) return { error: '' };
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
  const todoDia = evDur === 0 || !hayHora;
  if (todoDia) ini = dia0(ini);
  const fin = todoDia ? new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + 1) : new Date(ini.getTime() + (evDur || 60) * 6e4);
  return { ev: { titulo, inicio: evIso(ini), fin: evIso(fin), todoDia, lugar: $('ev-lugar-i').value, categoria: evCat }, ini, fin };
}
function evVista() {
  const v = $('ev-vista'), r = evLeer(); v.className = ''; v.textContent = '';
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
  evDia = dia || null; evForm.hidden = false; $('ev-abrir').setAttribute('aria-expanded', 'true'); evPintaChips(); evVista(); $('ev-texto').focus();
}
function evCerrar() {
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
  evDur = +b.dataset.m; document.querySelectorAll('.ev-dur').forEach(x => x.setAttribute('aria-pressed', x === b)); evVista();
};
evForm.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); evCerrar(); $('ev-abrir').focus(); } });
evForm.onsubmit = async e => {
  e.preventDefault(); if (evBusy) return;
  const r = evVista(); if (!r.ev) { if (!r.error) { $('ev-vista').className = 'mal'; $('ev-vista').textContent = 'Escribe el evento'; } return; }
  evBusy = true; $('ev-crear').disabled = true; $('ev-crear').textContent = 'Creando…';
  let g; try { g = await api.crearEvento(r.ev); } catch { g = { ok: false, motivo: 'No se pudo crear el evento' }; }
  evBusy = false; $('ev-crear').disabled = false; $('ev-crear').textContent = 'Añadir a Outlook';
  if (g && g.ok) { evCerrar(); evAviso('Añadido a Outlook'); } else { $('ev-vista').className = 'mal'; $('ev-vista').textContent = (g && g.motivo) || 'No se pudo crear el evento'; }
};
const evDiaClic = e => {
  const d = e.target.closest('.diah'); if (!d || (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault(); const h = dia0(new Date()); evAbrir(new Date(h.getFullYear(), h.getMonth(), h.getDate() + +d.dataset.i));
};
$('agenda').addEventListener('click', evDiaClic); $('agenda').addEventListener('keydown', evDiaClic);

$('agenda').addEventListener('click', e => {
  const b = e.target.closest('.borrar-ev'); if (b) { borrarPend = b.dataset.k; return pintaAgenda(); }
  const c = e.target.closest('.ev-conf'); if (c) { const bt = e.target.closest('button[data-act]'); if (bt) evConfirma(bt); return; }
  const el = e.target.closest('.evento'); if (el) evAlarma(el);
});
$('agenda').addEventListener('keydown', e => { if (e.target.classList.contains('evento') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); evAlarma(e.target); } });
if (window.alarmas) { window.alarmas.lista().then(l => { alarmasL = l; marcaEventos(); }); window.alarmas.alCambiar(l => { alarmasL = l; marcaEventos(); }); }

// ---- notas rápidas (main las guarda en %APPDATA%\panel\notas.json; cada cambio manda la lista entera)
let notas = null, notaEdit = null, notaBorrar = null, notaT = 0;
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
const barra = (n, v, txt, inv) => `<div class="barra">${n} · ${txt}<progress max="100" value="${Math.min(100, Math.max(0, Math.round(v)))}" class="${(inv ? v < 15 : v > 85) ? 'alto' : ''}"></progress></div>`;
function pintaSistema() {
  let h = '';
  if (sis) {
    const gb = b => (b / 1e9).toFixed(1);
    h += barra('CPU', sis.cpu, Math.round(sis.cpu) + '%');
    h += barra('RAM', sis.ramUsada / sis.ramTotal * 100, `${gb(sis.ramUsada)}/${gb(sis.ramTotal)} GB`);
    const u = sis.discoTotal - sis.discoLibre;
    h += barra('Disco C:', u / sis.discoTotal * 100, `${Math.round(sis.discoLibre / 1e9)} GB libres`);
  }
  if (bateria) h += barra('Batería' + (bateria.charging ? ' ⚡' : ''), bateria.level * 100, Math.round(bateria.level * 100) + '%', true);
  $('sistema').innerHTML = '<div class="barras">' + h + '</div>';
}
if (navigator.getBattery) navigator.getBattery().then(b => { bateria = b; b.onlevelchange = b.onchargingchange = pintaSistema; pintaSistema(); }).catch(() => {});

// ---- IPC
api.on('correo', r => { if (!r || !r.ok || r.obsoleto || (r.dias || 7) > agN) { agCarga = false; clearTimeout(agTimer); } pintaCorreo(r); });
api.on('meteo', r => { meteo = r; meteoT = Date.now(); pintaMeteo(); });
api.on('pestana', n => ir(n));
api.on('tema', t => t && /^#[0-9a-f]{6}$/i.test(t.acento) && document.documentElement.style.setProperty('--acento', t.acento));
api.on('actualizacion', a => { // pastilla «Nueva versión X» (solo si hay y no es pantalla completa)
  $('nueva').hidden = !a; if (!a) return;
  const ocupado = a.estado === 'descargando' || a.estado === 'instalando';
  $('nueva-txt').textContent = a.estado === 'descargando' ? 'Descargando…' : a.estado === 'instalando' ? 'Instalando…' : a.estado === 'error' ? a.mensaje || 'Error' : 'Nueva versión ' + a.version;
  $('nueva-ok').textContent = a.estado === 'error' ? 'Reintentar' : 'Actualizar'; $('nueva-ok').hidden = $('nueva-tarde').hidden = ocupado;
});
$('nueva-ok').onclick = () => api.instalarActualizacion(); $('nueva-tarde').onclick = () => api.masTarde();
api.on('sistema', s => { sis = s; pintaSistema(); });
api.on('estado', e => { document.body.classList.toggle('abierto', e.abierto); $('pin').classList.toggle('on', e.fijado); $('pin').setAttribute('aria-pressed', !!e.fijado); if (e.abierto) reloj(); });
reloj(); pintaAgenda();
setInterval(reloj, 1000);
setInterval(pintaAgenda, 6e4);
setInterval(pintaMeteo, 6e4); // la rayita de ahora avanza sola
