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
$('act').onclick = () => api.actualizar();
$('pin').onclick = () => api.fijar(!$('pin').classList.contains('on'));
// ---- pestañas
const TABS = [...document.querySelectorAll('[role=tab]')], NOMBRES = TABS.map(t => t.dataset.tab);
function ir(n, foco = true) {
  if (!NOMBRES.includes(n)) n = 'alarmas';
  TABS.forEach(t => { const on = t.dataset.tab === n; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; $('p-' + t.dataset.tab).hidden = !on; });
  try { localStorage.setItem('pestana', n); } catch {}
  if (n === 'alarmas' && foco) $('al-rapido').focus();
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
  if (t && t.closest('#p-alarmas') && t.tagName === 'INPUT' && t.type !== 'checkbox' && t.value) { t.value = ''; t.dispatchEvent(new Event('input')); } else api.cerrar();
});


// ---- tiempo
function pintaMeteo(r) {
  const t = $('tiempo');
  if (!r || !r.ok) { t.innerHTML = '<div class="vacio">Tiempo no disponible</div>'; return; }
  const a = r.actual;
  t.innerHTML = `<div class="ahora"><div class="ic">${esc(a.icono)}</div><div class="t">${Math.round(a.temp)}°</div>
    <div class="x"><b>${esc(a.texto)}</b><br>${esc(r.lugar.nombre)} · viento ${Math.round(a.viento)} km/h</div></div>
    <div class="horas">${r.horas.slice(0, 12).map(h => `<div>${esc(String(h.hora).slice(11, 16))}<span class="ic">${esc(h.icono)}</span><span>${Math.round(h.temp)}°</span><span class="ll">${h.lluvia ? Math.round(h.lluvia) + '%' : '&nbsp;'}</span></div>`).join('')}</div>
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
    c.innerHTML = r.correos.length ? r.correos.map(m => `<div class="fila-correo${m.leido ? '' : ' nl'}" data-id="${esc(m.id)}" title="${esc(m.asunto)}"><span class="p"></span><span class="de">${esc(m.de)}</span><span class="h">${fechaCorta(m.fecha)}</span><span class="as">${esc(m.asunto)}</span></div>`).join('') : '<div class="vacio">Sin correos</div>';
  }
  pintaAgenda();
}
$('correo').onclick = e => { const f = e.target.closest('.fila-correo'); if (f) api.abrirCorreo(f.dataset.id); };

// ---- agenda
function pintaAgenda() {
  const h = dia0(new Date()), eventos = correo && correo.ok ? correo.agenda : [];
  const dia = (nombre, d) => {
    const i = d.getTime(), f = i + 864e5;
    const ev = eventos.filter(e => { const a = new Date(e.inicio).getTime(), b = new Date(e.fin || e.inicio).getTime(); return a < f && Math.max(b, a + 1) > i; }).sort((x, y) => new Date(x.inicio) - new Date(y.inicio));
    return `<div class="diah">${nombre}</div>` + (ev.length ? ev.map(e => `<div class="evento"><span class="h">${e.todoDia ? 'Todo el día' : hhmm(new Date(e.inicio)) + '–' + hhmm(new Date(e.fin))}</span><span class="tt" title="${esc(e.lugar)}">${esc(e.titulo)}</span></div>`).join('') : '<div class="vacio">Sin eventos</div>');
  };
  $('agenda').innerHTML = '<h2>Agenda</h2>' + dia('Hoy', h) + dia('Mañana', new Date(h.getFullYear(), h.getMonth(), h.getDate() + 1));
}

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
api.on('correo', pintaCorreo);
api.on('meteo', pintaMeteo);
api.on('pestana', n => ir(n));
api.on('sistema', s => { sis = s; pintaSistema(); });
api.on('estado', e => { document.body.classList.toggle('abierto', e.abierto); $('pin').classList.toggle('on', e.fijado); if (e.abierto) reloj(); });
reloj(); pintaAgenda();
setInterval(reloj, 1000);
setInterval(pintaAgenda, 6e4);
