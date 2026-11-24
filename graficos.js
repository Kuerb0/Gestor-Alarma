// Gráficos compartidos: los usan el panel (pestañas Tiempo y Sistema) y los widgets del escritorio (widget.js). Solo devuelven HTML.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const W = 340, PX = 16, IY = 17, GT = 58, GB = 112, BY = 126, GH = 150; // ancho del gráfico (viewBox; se escala al ancho útil), margen lateral, y de iconos / máx / mín / base de la lluvia, alto
const clamp = (y, a, b) => Math.max(a, Math.min(b, y));
// Rango de horas editable (`o.h0`–`o.h1`, enteros 0–24, al menos 2 h): por defecto (a, b). El gráfico del Tiempo y la Agenda por horas lo usan.
const rangoH = (o, a, b) => { const h0 = Number.isInteger(o.h0) ? clamp(o.h0, 0, 22) : a; return [h0, clamp(Number.isInteger(o.h1) ? o.h1 : b, h0 + 2, 24)]; };
// Spline cúbico monótono (Fritsch–Carlson): pasa por todos los puntos y entre dos puntos nunca sube ni baja más que ellos
// (sin ondulaciones ni picos falsos), así que no hace falta alisar ni recortar nada.
function pendientes(p) {
  const n = p.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((p[i + 1][1] - p[i][1]) / (p[i + 1][0] - p[i][0]));
  for (let i = 0; i < n; i++) m.push(i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : 2 * d[i - 1] * d[i] / (d[i - 1] + d[i]));
  return m;
}
function curva(p, m = pendientes(p)) { // la curva como Béziers
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i], b = p[i + 1], dx = (b[0] - a[0]) / 3;
    d += `C${(a[0] + dx).toFixed(1)} ${(a[1] + m[i] * dx).toFixed(1)} ${(b[0] - dx).toFixed(1)} ${(b[1] - m[i + 1] * dx).toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  }
  return d;
}
function sobreCurva(p, m, x) { // y de la curva en x (Hermite, la misma que dibuja `curva`)
  let i = 0; while (i < p.length - 2 && p[i + 1][0] < x) i++;
  const a = p[i], b = p[i + 1], h = b[0] - a[0], t = h > 0 ? clamp((x - a[0]) / h, 0, 1) : 0, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a[1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * b[1] + (t3 - t2) * h * m[i + 1];
}
// Gráfico del día (0–24 h, sin scroll). `ah` = hora decimal de ahora (-1: otro día, sin «ahora»); `ta` = temperatura actual;
// `ref` = horas de HOY, que en otro día se dibujan como una curva translúcida para comparar (misma escala).
// `horas` puede ser de horas en punto (hd = índice) o de puntos cada 15 min (hd = hora decimal, 14.25 = 14:15).
// Máxima granularidad y luego suavizado: la curva parte de los puntos de 15 min con decimales (0,1°) y se alisa con una media gaussiana
// (sigma = 3 puntos = 45 min; bordes en espejo, sin sesgo al principio ni al final del día). Los textos son los valores reales redondeados.
const SIGMA = 3;
function alisar(v, sigma) {
  if (sigma <= 0 || v.length < 3) return v.slice();
  const n = v.length, R = Math.ceil(sigma * 3), w = Array.from({ length: 2 * R + 1 }, (_, k) => Math.exp(-((k - R) ** 2) / (2 * sigma * sigma))), sw = w.reduce((a, b) => a + b, 0);
  const g = i => { i = Math.abs(i); if (i > n - 1) i = 2 * (n - 1) - i; return v[clamp(i, 0, n - 1)]; };
  return v.map((_, i) => w.reduce((s, wk, k) => s + wk * g(i + k - R), 0) / sw);
}
function franja(horas, ah, ta, ref, nombre, o = {}) {
  const u = o.uid || ''; // sufijo para los id del SVG si hay varios gráficos a la vez en la página // `o`: ico/lluvia/tmp = false quitan los iconos, la lluvia o las temperaturas cada 3 h
  const [A, B] = rangoH(o, 0, 24), xh = h => PX + (h - A) / (B - A) * (W - 2 * PX); // el eje va de A a B horas
  const HD0 = horas.map((h, i) => h.hd ?? i), S0 = alisar(horas.map(h => h.temp), horas.length > 30 ? SIGMA : 0); // se suaviza el día entero y luego se recorta al rango
  const vis = HD0.map((_, i) => i).filter(i => HD0[i] >= A && HD0[i] <= B);
  if (vis.length < 2) return '';
  const S = vis.map(i => S0[i]); horas = vis.map(i => horas[i]);
  const refV = ref ? ref.map((h, i) => [i, h.temp]).filter(([i]) => i >= A && i <= B) : [], SR = refV.map(([, t]) => t);
  const n = horas.length, T = horas.map(h => Math.round(h.temp)), TR = SR;
  const HD = vis.map(i => HD0[i]), enHora = i => Number.isInteger(HD[i]), paso = B - A > 12 ? 3 : B - A > 6 ? 2 : 1; // paso = cada cuántas horas hay iconos, textos y marcas del eje
  const R = horas.map(h => h.temp); // R = valor real; S = curva suavizada
  const dmx = Math.max(...T), dmn = Math.min(...T), im = R.indexOf(Math.max(...R)), ii = R.indexOf(Math.min(...R)), hoy = ah >= 0, dentro = hoy && ah >= A && ah <= B;
  const hi = Math.max(...S, ...SR), lo = Math.min(...S, ...SR), cen = (hi + lo) / 2, semi = Math.max(hi - lo, 6) / 2; // rango mínimo de 6°: un día casi plano se ve plano
  const mx = cen + semi, mn = cen - semi, yt = v => GB - (v - mn) / (mx - mn) * (GB - GT);
  const X = HD.map(hd => xh(hd)), p = S.map((v, i) => [X[i], yt(v)]), m = pendientes(p), c = curva(p, m), xa = hoy ? clamp(xh(ah), PX, W - PX) : 0;
  const ya = dentro ? sobreCurva(p, m, xa) : 0; // el punto de «ahora» va sobre la curva
  const refCurva = TR.length > 1 ? `<path class="fr-hoy" d="${curva(refV.map(([i, v]) => [xh(i), yt(v)]))}"/>` : '';
  const fin = `L${p[n - 1][0].toFixed(1)} ${BY}L${p[0][0].toFixed(1)} ${BY}Z`;
  const grupo = cl => `<g clip-path="url(#${cl}${u})"><path class="fr-a" fill="url(#gr${u})" d="${c}${fin}"/><path class="fr-l" d="${c}"/></g>`;
  const marcas = new Set(dmx === dmn ? [] : [im, ii]); // temperaturas con texto: máx/mín y cada 3 h, sin pisar la de ahora ni las marcadas
  const lbl = [...marcas].map(i => [i, 1]).concat(Array.from({ length: n }, (_, i) => i).filter(i => o.tmp !== false && enHora(i) && HD[i] % paso === 0 && ![...marcas].some(m => Math.abs(HD[m] - HD[i]) < 2)).map(i => [i, 0]));
  const textos = lbl.filter(([i]) => Math.abs(HD[i] - ah) >= 2).map(([i, k]) => `<circle class="${k ? 'fr-k' : 'fr-p'}" cx="${p[i][0].toFixed(1)}" cy="${p[i][1].toFixed(1)}" r="${k ? 3.5 : 2}"/><text class="fr-t${k ? ' k' : ''}${HD[i] < ah ? ' pas' : ''}" x="${p[i][0].toFixed(1)}" y="${(p[i][1] - 8).toFixed(1)}">${T[i]}°</text>`).join('');
  const iconos = horas.map((h, i) => o.ico === false || !enHora(i) || HD[i] % paso || !h.icono ? '' : `<text class="fr-i${HD[i] < ah ? ' pas' : ''}" x="${X[i].toFixed(1)}" y="${IY}">${esc(h.icono)}</text>`).join('');
  const eje = Array.from({ length: Math.floor(B / paso) - Math.ceil(A / paso) + 1 }, (_, k) => (Math.ceil(A / paso) + k) * paso).map(h => `<text class="fr-h${h < ah ? ' pas' : ''}" x="${xh(h).toFixed(1)}" y="${GH - 4}">${h}h</text>`).join('');
  const lluvia = horas.map((h, i) => o.lluvia !== false && enHora(i) && h.lluvia > 0 ? `<rect class="fr-ll${HD[i] < ah ? ' pas' : ''}" x="${(X[i] - 1.25).toFixed(1)}" y="${(BY - Math.max(2, h.lluvia * .14)).toFixed(1)}" width="2.5" height="${Math.max(2, h.lluvia * .14).toFixed(1)}" rx="1.25"/>` : '').join('');
  return `<div class="franja"><svg class="fr-g" viewBox="0 0 ${W} ${GH}" role="img" aria-label="Temperatura de ${esc(nombre)}, de ${dmn}° a ${dmx}°${hoy ? `, ahora ${Math.round(ta)}°` : ''}">
    <defs><linearGradient id="gr${u}" x1="0" y1="0" x2="0" y2="1"><stop class="g1" offset="0"/><stop class="g2" offset="1"/></linearGradient>
      <clipPath id="cp${u}"><rect x="0" y="0" width="${xa.toFixed(1)}" height="${GH}"/></clipPath><clipPath id="cf${u}"><rect x="${xa.toFixed(1)}" y="0" width="${W}" height="${GH}"/></clipPath></defs>
    ${refCurva}<g class="pas">${grupo('cp')}</g>${grupo('cf')}<line class="fr-e" x1="${PX}" y1="${BY}" x2="${W - PX}" y2="${BY}"/>${lluvia}${iconos}${textos}
    ${dentro ? `<line class="fr-ya" x1="${xa.toFixed(1)}" y1="${IY + 8}" x2="${xa.toFixed(1)}" y2="${BY}"/><circle class="fr-k" cx="${xa.toFixed(1)}" cy="${ya.toFixed(1)}" r="4.5"/>
    <text class="fr-t k" x="${clamp(xa, 14, W - 14).toFixed(1)}" y="${(ya - 10).toFixed(1)}">${Math.round(ta)}°</text>` : ''}${eje}</svg></div>`;
}
// Resumen del día bajo el gráfico: máximos (viento, UV) o medias (humedad, sensación, presión, nubes) de sus horas
function detalles(hs, o = {}) {
  if (o.det === false) return '';
  const vals = k => hs.map(h => h[k]).filter(x => x != null);
  const media = k => { const v = vals(k); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const maximo = k => { const v = vals(k); return v.length ? Math.max(...v) : null; };
  const f = (nombre, v, u) => v == null ? '' : `<span>${nombre} <b>${Math.round(v)}${u}</b></span>`;
  const s = f('viento máx', maximo('viento'), ' km/h') + f('humedad', media('humedad'), '%') + f('sensación', media('sens'), '°') +
    f('UV máx', maximo('uv'), '') + f('presión', media('presion'), ' hPa') + f('nubes', media('nubes'), '%');
  return s ? `<div class="det">${s}</div>` : '';
}
// Galería de widgets (pestaña «Widgets»): cada variante = un tipo + su configuración completa. WANCHO = ancho real de la ventana (como en main.js).
const WANCHO = { tiempo: { p: 300, m: 380, g: 520 }, sistema: { p: 260, m: 320, g: 420 }, agenda: { p: 280, m: 340, g: 440 }, notas: { p: 260, m: 320, g: 420 }, alarmas: { p: 280, m: 340, g: 440 } };
const WVARIANTES = [
  { tipo: 'tiempo', nombre: 'Tiempo · Gráfico', cfg: { tam: 'p', ciu: false, graf: true, ico: false, lluvia: false, tmp: true, res: false, det: false, dias: false, ndias: 5 } },
  { tipo: 'tiempo', nombre: 'Tiempo · Ahora y próximos días', cfg: { tam: 'p', ciu: false, graf: false, ico: true, lluvia: true, tmp: true, res: true, det: false, dias: true, ndias: 3 } },
  { tipo: 'tiempo', nombre: 'Tiempo · Normal', cfg: { tam: 'm', ciu: true, graf: true, ico: true, lluvia: true, tmp: true, res: true, det: false, dias: true, ndias: 5 } },
  { tipo: 'tiempo', nombre: 'Tiempo · Completo', cfg: { tam: 'g', ciu: true, graf: true, ico: true, lluvia: true, tmp: true, res: true, det: true, dias: true, ndias: 7 } },
  { tipo: 'sistema', nombre: 'Sistema · CPU y RAM', cfg: { tam: 'p', cpu: true, ram: true, disco: false, disp: false, bat: false } },
  { tipo: 'sistema', nombre: 'Sistema · Normal', cfg: { tam: 'm', cpu: true, ram: true, disco: true, disp: false, bat: true } },
  { tipo: 'sistema', nombre: 'Sistema · Completo', cfg: { tam: 'g', cpu: true, ram: true, disco: true, disp: true, bat: true } },
  { tipo: 'agenda', nombre: 'Agenda · Hoy por horas', cfg: { tam: 'm', modo: 'horas', nh: 10, todo: true, lugar: false, ndias: 3 } },
  { tipo: 'agenda', nombre: 'Agenda · Próximos eventos', cfg: { tam: 'm', modo: 'eventos', nh: 10, todo: true, lugar: true, ndias: 3 } },
  { tipo: 'agenda', nombre: 'Agenda · Semana', cfg: { tam: 'g', modo: 'eventos', nh: 10, todo: true, lugar: true, ndias: 7 } },
  { tipo: 'notas', nombre: 'Notas · Lista', cfg: { tam: 'm', fecha: true, nueva: false } },
  { tipo: 'notas', nombre: 'Notas · Con añadir', cfg: { tam: 'm', fecha: false, nueva: true } },
  { tipo: 'alarmas', nombre: 'Alarmas · Lista', cfg: { tam: 'm', n: 5, crear: false, externas: true } },
  { tipo: 'alarmas', nombre: 'Alarmas · Con campo', cfg: { tam: 'm', n: 3, crear: true, externas: false } },
];
const NOM_DIA = ['Hoy', 'Mañana', 'Pasado mañana'];
// Todo el bloque del tiempo (flechas de día, gráfico, resumen, detalles y próximos días). `dia` = día elegido (0 = hoy), `t0` = cuándo llegó
// el dato (ms; la rayita de «ahora» avanza desde ahí). Devuelve { html, dia } con `dia` ya ajustado a los días que hay.
function htmlMeteo(r, dia, t0, o = {}) { // `o` (opcional, solo el widget): graf/res/det/dias = false ocultan esa parte; ndias = cuántos próximos días
  if (!r || !r.ok) return { html: '<div class="vacio">Tiempo no disponible</div>', dia };
  const horasDe = k => k === 0 ? (r.horas || []).slice(0, 24) : ((r.dias[k] && r.dias[k].horas) || []).slice(0, 24);
  let max = 0; while (max + 1 < r.dias.length && horasDe(max + 1).length > 1) max++;
  dia = clamp(dia, 0, max);
  const a = r.actual, hs = horasDe(dia), dsel = r.dias[dia], ah = dia ? -1 : clamp((Number.isFinite(r.ahora) ? r.ahora : new Date().getHours() + new Date().getMinutes() / 60) + (Date.now() - t0) / 36e5, 0, 24);
  const nombre = dia < 3 ? NOM_DIA[dia].toLowerCase() : String(dsel.nombre);
  const nav = max ? `<div class="fr-nav"><button class="fr-b" data-d="-1" aria-label="Día anterior"${dia ? '' : ' disabled'}>‹</button><span aria-live="polite">${esc(dia < 3 ? NOM_DIA[dia] : dsel.nombre)}</span><button class="fr-b" data-d="1" aria-label="Día siguiente"${dia < max ? '' : ' disabled'}>›</button></div>` : '';
  const resumen = dia ? `<div class="ahora"><div class="ic">${esc(dsel.icono)}</div><div class="t">${Math.round(dsel.max)}°</div>
    <div class="x"><b>${esc(dsel.texto)}</b><br>mín ${Math.round(dsel.min)}° · lluvia ${Math.round(dsel.lluvia || 0)}%</div></div>` : `<div class="ahora"><div class="ic">${esc(a.icono)}</div><div class="t">${Math.round(a.temp)}°</div>
    <div class="x"><b>${esc(a.texto)}</b><br>${esc(r.lugar.nombre)} · viento ${Math.round(a.viento)} km/h</div></div>`;
  const pts = (dia ? dsel.puntos : r.puntos) || [], serie = pts.length > 1 ? pts : hs; // cada 15 min si Open-Meteo los dio (se suavizan en `franja`); si no, por horas
  return { dia, html: nav + (serie.length > 1 && o.graf !== false ? franja(serie, ah, a.temp, dia ? horasDe(0) : null, nombre, o) : '') + (o.res === false ? '' : resumen) + detalles(hs, o) + (o.dias === false ? '' : `
    <div class="dias">${r.dias.slice(0, o.ndias || 5).map(d => `<div>${esc(String(d.nombre).slice(0, 3))}<span class="ic">${esc(d.icono)}</span><span>${Math.round(d.max)}° <small>${Math.round(d.min)}°</small></span><span class="ll">${Math.round(d.lluvia || 0)}%</span></div>`).join('')}</div>`) };
}
// Varias ciudades: pestañitas (si hay más de una) + el tiempo de la elegida. `m` = { lista: [{ clave, nombre, r }] }, `sel` = clave elegida;
// `editar` pone una × para quitar la elegida (solo en el panel). Devuelve { html, dia, sel } con `dia` y `sel` ya ajustados.
function htmlCiudades(m, sel, dia, t0, editar, o = {}) {
  const l = (m && m.lista) || [];
  if (!l.length) return { html: '<div class="vacio">Tiempo no disponible</div>', dia, sel };
  const e = l.find(x => x.clave === sel) || l[0], o2 = htmlMeteo(e.r, dia, t0, o);
  const chips = l.length > 1 && o.ciu !== false ? `<div class="ciudades">${l.map(x => `<span class="ciu${x === e ? ' on' : ''}"><button class="ciu-n" data-c="${esc(x.clave)}" aria-pressed="${x === e}">${esc(x.nombre)}</button>${editar && x === e ? `<button class="ciu-q" data-q="${esc(x.clave)}" aria-label="Quitar ${esc(x.nombre)}" title="Quitar esta ciudad">×</button>` : ''}</span>`).join('')}</div>` : '';
  return { html: chips + o2.html, dia: o2.dia, sel: e.clave };
}
// Barras de Sistema: CPU, RAM, disco C:, dispositivos con batería y la batería del equipo (`bateria` = BatteryManager o null)
const barra = (n, v, txt, inv) => `<div class="barra">${n} · ${txt}<progress max="100" value="${Math.min(100, Math.max(0, Math.round(v)))}" class="${(inv ? v < 15 : v > 85) ? 'alto' : ''}"></progress></div>`;
const iconoDisp = n => /mando|controller|gamepad|xbox|dualsense|dualshock|joy-?con/i.test(n) ? '🎮' : /mouse|rat[oó]n|mx master|m[x]? anywhere/i.test(n) ? '🖱️' : /keyboard|teclado|mx keys|k\d{2,3}/i.test(n) ? '⌨️' : /buds|airpods|head|auric|wh-|speaker|altavoz|earbud/i.test(n) ? '🎧' : '🔋';
function htmlSistema(sis, bateria, o = {}) { // `o` (opcional, solo el widget): cpu/ram/disco/disp/bat = false ocultan esa barra o sección
  let h = '';
  if (sis) {
    const gb = b => (b / 1e9).toFixed(1);
    if (o.cpu !== false) h += barra('CPU', sis.cpu, Math.round(sis.cpu) + '%');
    if (o.ram !== false) h += barra('RAM', sis.ramUsada / sis.ramTotal * 100, `${gb(sis.ramUsada)}/${gb(sis.ramTotal)} GB`);
    const u = sis.discoTotal - sis.discoLibre;
    if (o.disco !== false) h += barra('Disco C:', u / sis.discoTotal * 100, `${Math.round(sis.discoLibre / 1e9)} GB libres`);
    if (o.disp !== false) {
      h += '<h3 class="sub">Dispositivos</h3>';
      const ds = sis.dispositivos;
      if (!ds) h += '<div class="vacio">Buscando dispositivos…</div>';
      else if (!ds.length) h += '<div class="vacio">Ningún dispositivo con batería detectado. Los que usan receptor USB propio (2,4 GHz) no la comunican a Windows.</div>';
      else h += ds.map(d => barra(iconoDisp(d.nombre) + ' ' + esc(d.nombre), d.nivel, (d.aprox ? '≈ ' : '') + d.nivel + '%', true)).join('');
    }
  }
  if (bateria && o.bat !== false) h += barra('Batería' + (bateria.charging ? ' ⚡' : ''), bateria.level * 100, Math.round(bateria.level * 100) + '%', true);
  return '<div class="barras">' + h + '</div>';
}
// Agenda (widget y galería). `r` = resultado de «correo» ({ ok, agenda: [{ titulo, inicio, fin, todoDia, lugar, color }] }).
// modo 'eventos': lista por días (ndias) · modo 'horas': hoy en una línea de tiempo vertical de h0 a h1 horas (fijas, editables), con los eventos solapados en columnas.
// todo = false oculta los de todo el día; lugar = false oculta el lugar. Los colores van en data-c: después de poner el HTML se llama a colorea(raiz) (CSP: sin style inline).
const HEX = /^#[0-9a-f]{6}$/i, hhmm2 = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
const colorea = raiz => { // CSP sin style inline: los colores (data-c), el nº de horas (data-nh) y las posiciones en % de la agenda por horas (data-y/h/x/w) se ponen aquí
  raiz.querySelectorAll('[data-c]').forEach(e => e.style.setProperty('--c', e.dataset.c));
  raiz.querySelectorAll('[data-col]').forEach(e => { e.style.color = e.dataset.col; }); // color de la cuenta atrás de Alarmas (Tiempo.color)
  raiz.querySelectorAll('[data-nh]').forEach(e => e.style.setProperty('--nh', e.dataset.nh));
  raiz.querySelectorAll('.wh [data-y]').forEach(e => { const d = e.dataset; e.style.top = d.y + '%'; if (d.h) e.style.height = d.h + '%'; if (d.x) { e.style.left = d.x + '%'; e.style.width = d.w + '%'; } });
};
const maxDiaAg = r => clamp(((r && r.dias) || 14) - 1, 0, 13); // último día al que se puede ir con las flechas (el widget guarda el día elegido y lo ajusta con esto)
function htmlAgenda(r, o = {}, ahora = new Date()) {
  if (!r || !r.ok) return '<div class="vacio">Agenda no disponible</div>';
  const ev = (r.agenda || []).map(e => ({ ...e, i: +new Date(e.inicio), f: +new Date(e.fin || e.inicio) })).filter(e => Number.isFinite(e.i)).sort((a, b) => a.i - b.i);
  const d0 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()), dia = k => +new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + k), now = +ahora;
  const cdata = e => HEX.test(e.color) ? ` data-c="${e.color}"` : '';
  const sel = clamp(o.dia || 0, 0, maxDiaAg(r)); // día elegido con las flechas (0 = hoy)
  const delDia = k => ev.filter(e => e.i < dia(k + 1) && Math.max(e.f, e.i + 1) > dia(k) && (o.todo !== false || !e.todoDia));
  const nom = k => k === 0 ? 'Hoy' : k === 1 ? 'Mañana' : new Date(dia(k)).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' }).replace(/^./, c => c.toUpperCase());
  const nav = o.nav === false ? '' : `<div class="fr-nav"><button class="fr-b" data-d="-1" aria-label="Día anterior"${sel ? '' : ' disabled'}>‹</button><span aria-live="polite">${esc(nom(sel))}</span><button class="fr-b" data-d="1" aria-label="Día siguiente"${sel < maxDiaAg(r) ? '' : ' disabled'}>›</button></div>`;
  if (o.modo === 'horas') { // HTML (no SVG): letra real como la lista; las posiciones van en % del alto (data-*, colorea las aplica) y el alto lo pone CSS con --nh
    const [h0, h1] = rangoH(o, 8, 20), nh = h1 - h0, nowH = (now - dia(sel)) / 36e5, pc = h => ((h - h0) / nh * 100).toFixed(3); // ventana fija de h0 a h1 (editable)
    const hoy = delDia(sel), todos = hoy.filter(e => e.todoDia), con = hoy.filter(e => !e.todoDia).map(e => ({ ...e, s: Math.max(h0, (e.i - dia(sel)) / 36e5), t: Math.min(h1, (e.f - dia(sel)) / 36e5) })).filter(e => e.t > e.s);
    let fin = -1, col = [], grupo = []; const grupos = []; // columnas: cada evento a la primera libre; el ancho lo da el máximo de columnas de su grupo de solapados
    con.forEach(e => { if (e.s >= fin) { grupos.push(grupo); grupo = []; col = []; fin = -1; } let c = col.findIndex(x => x <= e.s); if (c < 0) c = col.length; col[c] = e.t; e.c = c; grupo.push(e); fin = Math.max(fin, e.t); });
    grupos.push(grupo); grupos.forEach(g => { const n = Math.max(1, ...g.map(e => e.c + 1)); g.forEach(e => e.n = n); });
    const rej = Array.from({ length: nh }, (_, k) => `<div class="wh-l" data-y="${pc(h0 + k)}"><span class="wh-h">${String(h0 + k).padStart(2, '0')}:00</span></div>`).join('');
    const bloques = con.map(e => {
      const hora = hhmm2(new Date(e.i)) + '–' + hhmm2(new Date(e.f)), dur = e.t - e.s, lug = o.lugar !== false && e.lugar ? `<small>${esc(e.lugar)}</small>` : '';
      return `<div class="wh-b${e.f < now ? ' pas' : ''}${dur < .75 ? ' corto' : ''}${HEX.test(e.color) ? '' : ' sc'}"${cdata(e)} data-y="${pc(e.s)}" data-h="${(dur / nh * 100).toFixed(3)}" data-x="${(e.c / e.n * 100).toFixed(3)}" data-w="${(100 / e.n).toFixed(3)}" title="${esc(hora + ' · ' + e.titulo + (e.lugar ? ' · ' + e.lugar : ''))}">` +
        `<div class="wh-in"><span class="tt">${esc(e.titulo)}</span><span class="s">${hora}</span>${lug}</div></div>`;
    }).join('');
    const ya = nowH >= h0 && nowH <= h1 ? `<div class="wh-ya" data-y="${pc(nowH)}"></div>` : '';
    const chips = o.todo !== false && todos.length ? `<div class="wtodo">${todos.map(e => `<span class="wchip"${cdata(e)}>${esc(e.titulo)}</span>`).join('')}</div>` : '';
    return nav + chips + `<div class="wh" data-nh="${nh}" role="img" aria-label="Agenda de ${esc(nom(sel).toLowerCase())}, de ${h0} a ${h1} h">${rej}<div class="wh-ev">${bloques}</div>${ya}</div>`;
  }
  const nd = [1, 3, 7].includes(o.ndias) ? o.ndias : 3;
  let h = '';
  for (let j = 0; j < nd; j++) { // desde el día elegido, `nd` días
    const k = sel + j, l = delDia(k).filter(e => k > 0 || e.todoDia || e.f > now);
    if (!l.length && j) continue;
    h += `<div class="wdia">${nom(k)}</div>` + (l.length ? l.map(e => `<div class="wev"${cdata(e)}><span class="h">${e.todoDia ? 'Todo el día' : hhmm2(new Date(e.i)) + (e.fin ? '–' + hhmm2(new Date(e.f)) : '')}</span><span class="tt">${esc(e.titulo)}${o.lugar !== false && e.lugar ? `<small>${esc(e.lugar)}</small>` : ''}</span></div>`).join('') : '<div class="vacio">Sin eventos</div>');
  }
  return nav + (h || '<div class="vacio">Sin eventos</div>');
}

// Notas rápidas (widget y galería). `lista` = [{ id, texto, creada }] (null = aún sin cargar). fecha = false oculta la fecha; nueva = false quita el cuadro de «nueva nota»
// (tampoco sale en la galería: `uid`). Los saltos de línea se conservan por CSS (.wn-t); el alto de la lista lo limita CSS según el tamaño (o.tam).
const fechaNotaW = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', ''); };
function htmlNotas(lista, o = {}) {
  const nueva = o.nueva !== false && !o.uid ? '<textarea id="wn-texto" class="campo" rows="2" maxlength="5000" aria-label="Nueva nota" placeholder="Nueva nota… (Intro para guardar)"></textarea>' : '';
  const cuerpo = !lista ? '<div class="vacio">Cargando…</div>' : !lista.length ? '<div class="vacio">Sin notas todavía</div>'
    : lista.map(n => `<article class="wn-nota"><div class="wn-t">${esc(n.texto)}</div>${o.fecha !== false && fechaNotaW(n.creada) ? `<time>${esc(fechaNotaW(n.creada))}</time>` : ''}</article>`).join('');
  return nueva + `<div class="wn-lista wn-${['p', 'm', 'g'].includes(o.tam) ? o.tam : 'm'}">${cuerpo}</div>`;
}

// Alarmas (widget y galería). `lista` = alarmas del motor (null = aún sin cargar), `ahora` en ms y `formato` 'adaptativo' | 'completo' (lo manda alarmas.js). Usa el global Tiempo (tiempo.js).
// o.n = cuántas filas (3/5/8), o.externas = false quita las de Post-It y Outlook, o.crear = false quita el campo (en la galería, uid, sale desactivado). Cada fila lleva data-id: `ticAlarmas` solo
// actualiza el tiempo, la fase y el color de las que ya están pintadas (sin rehacer el DOM cada segundo). Los colores van en data-col (colorea) o los pone ticAlarmas.
const ETIQ_ORIGEN = { outlook: 'Outlook', postit: 'Post-It' };
function visiblesAlarmas(lista, o = {}, ahora = Date.now()) { // las que se enseñan, en orden (lo que suena primero) y cuántas quedan fuera
  const n = [3, 5, 8].includes(o.n) ? o.n : 5;
  const ord = Tiempo.ordenar((lista || []).filter(a => (o.externas !== false || !a.origen) && Tiempo.fase(a, ahora).fase !== 'fin'), ahora);
  return { vis: ord.slice(0, n), resto: Math.max(0, ord.length - n) };
}
const textoAl = (a, f, formato) => f.fase === 'perdida' ? 'PERDIDA' : f.fase === 'sonando' && f.ms === undefined ? '00:00' : Tiempo.formatear(f.ms, a.tipo === 'crono', formato);
const colorAl = (a, f) => f.fase === 'activa' ? Tiempo.color(a.tipo === 'crono' ? Infinity : f.ms) : ''; // sonando y perdida las colorea el CSS
function htmlFilasAlarmas(lista, o = {}, ahora = Date.now(), formato = 'adaptativo') {
  if (!lista) return '<div class="vacio">Cargando…</div>';
  const { vis, resto } = visiblesAlarmas(lista, o, ahora);
  if (!vis.length) return '<div class="vacio">Sin alarmas</div>';
  return vis.map(a => {
    const f = Tiempo.fase(a, ahora), col = colorAl(a, f);
    return `<div class="wa-f${f.fase === 'sonando' ? ' sonando' : f.fase === 'perdida' ? ' perdida' : ''}" data-id="${esc(a.id)}"><span class="wa-n">${esc(a.nombre)}${a.origen ? `<small>${ETIQ_ORIGEN[a.origen] || esc(a.origen)}</small>` : ''}</span>` +
      `<span class="wa-t"${col ? ` data-col="${col}"` : ''}>${esc(textoAl(a, f, formato))}</span>${a.origen ? '<span></span>' : `<button class="wa-x" data-id="${esc(a.id)}" aria-label="Borrar ${esc(a.nombre)}" title="Borrar">×</button>`}</div>`;
  }).join('') + (resto ? `<div class="wa-mas">+${resto} más</div>` : '');
}
function htmlAlarmas(lista, o = {}, ahora = Date.now(), formato = 'adaptativo') {
  const campo = o.crear === false ? '' : `<input ${o.uid ? 'disabled' : 'id="wa-texto"'} class="campo" autocomplete="off" maxlength="120" aria-label="Nueva alarma" placeholder="Pizza 25m · Dentista mañana 10:00">${o.uid ? '' : '<div id="wa-vista"></div>'}`;
  return campo + `<div class="wa-lista">${htmlFilasAlarmas(lista, o, ahora, formato)}</div>`;
}
function ticAlarmas(raiz, lista, formato, ahora = Date.now()) { // actualiza en su sitio las filas ya pintadas
  raiz.querySelectorAll('.wa-f').forEach(e => {
    const a = (lista || []).find(x => x.id === e.dataset.id); if (!a) return;
    const f = Tiempo.fase(a, ahora), t = e.querySelector('.wa-t'), txt = textoAl(a, f, formato), col = colorAl(a, f);
    e.classList.toggle('sonando', f.fase === 'sonando'); e.classList.toggle('perdida', f.fase === 'perdida');
    if (t.textContent !== txt) t.textContent = txt;
    if (t.dataset.col !== col) { t.dataset.col = col; t.style.color = col; }
  });
}
