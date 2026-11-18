// Gráficos compartidos: los usan el panel (pestañas Tiempo y Sistema) y los widgets del escritorio (widget.js). Solo devuelven HTML.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const W = 340, PX = 16, IY = 17, GT = 58, GB = 112, BY = 126, GH = 150; // ancho del gráfico (viewBox; se escala al ancho útil), margen lateral, y de iconos / máx / mín / base de la lluvia, alto
const xh = h => PX + h / 24 * (W - 2 * PX), clamp = (y, a, b) => Math.max(a, Math.min(b, y));
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
// Alisado: Open-Meteo da las temperaturas en enteros y, cada 15 min, eso dibuja escalones; se promedia con una ventana triangular (≈ ±1 h)
// para que la curva sea fluida. Los textos siguen siendo los valores reales.
function alisar(v, radio) {
  if (radio < 1) return v.slice();
  return v.map((_, i) => { let s = 0, w = 0; for (let k = -radio; k <= radio; k++) { const j = i + k; if (j < 0 || j >= v.length) continue; const p = radio + 1 - Math.abs(k); s += v[j] * p; w += p; } return s / w; });
}
function franja(horas, ah, ta, ref, nombre, o = {}) {
  const u = o.uid || ''; // sufijo para los id del SVG si hay varios gráficos a la vez en la página // `o`: ico/lluvia/tmp = false quitan los iconos, la lluvia o las temperaturas cada 3 h
  const n = horas.length, T = horas.map(h => Math.round(h.temp)), TR = ref ? ref.map(h => Math.round(h.temp)) : [];
  const HD = horas.map((h, i) => h.hd ?? i), enHora = i => Number.isInteger(HD[i]);
  const dmx = Math.max(...T), dmn = Math.min(...T), im = T.indexOf(dmx), ii = T.indexOf(dmn), hoy = ah >= 0;
  const S = alisar(horas.map(h => h.temp), n > 30 ? 6 : 0), SR = ref ? alisar(ref.map(h => h.temp), 0) : []; // curva alisada (pasa por encima de las marcas, a ±0,5°)
  const mx = Math.max(...S, ...SR), mn = Math.min(...S, ...SR);
  const yt = v => GB - (mx === mn ? .5 : clamp((v - mn) / (mx - mn), 0, 1)) * (GB - GT);
  const X = HD.map(hd => xh(hd)), p = S.map((v, i) => [X[i], yt(v)]), c = curva(p), xa = hoy ? xh(ah) : 0;
  const enAhora = () => { let i = 0; while (i < n - 2 && HD[i + 1] < ah) i++; const f = HD[i + 1] > HD[i] ? clamp((ah - HD[i]) / (HD[i + 1] - HD[i]), 0, 1) : 0; return S[i] + (S[i + 1] - S[i]) * f; };
  const ya = hoy && n > 1 ? yt(enAhora()) : 0; // el punto de «ahora» va sobre la curva
  const refCurva = TR.length > 1 ? `<path class="fr-hoy" d="${curva(SR.map((v, i) => [xh(i), yt(v)]))}"/>` : '';
  const fin = `L${p[n - 1][0].toFixed(1)} ${BY}L${p[0][0].toFixed(1)} ${BY}Z`;
  const grupo = cl => `<g clip-path="url(#${cl}${u})"><path class="fr-a" fill="url(#gr${u})" d="${c}${fin}"/><path class="fr-l" d="${c}"/></g>`;
  const marcas = new Set(dmx === dmn ? [] : [im, ii]); // temperaturas con texto: máx/mín y cada 3 h, sin pisar la de ahora ni las marcadas
  const lbl = [...marcas].map(i => [i, 1]).concat(Array.from({ length: n }, (_, i) => i).filter(i => o.tmp !== false && enHora(i) && HD[i] % 3 === 0 && ![...marcas].some(m => Math.abs(HD[m] - HD[i]) < 2)).map(i => [i, 0]));
  const textos = lbl.filter(([i]) => Math.abs(HD[i] - ah) >= 2).map(([i, k]) => `<circle class="${k ? 'fr-k' : 'fr-p'}" cx="${p[i][0].toFixed(1)}" cy="${p[i][1].toFixed(1)}" r="${k ? 3.5 : 2}"/><text class="fr-t${k ? ' k' : ''}${HD[i] < ah ? ' pas' : ''}" x="${p[i][0].toFixed(1)}" y="${(p[i][1] - 8).toFixed(1)}">${T[i]}°</text>`).join('');
  const iconos = horas.map((h, i) => o.ico === false || !enHora(i) || HD[i] % 3 || !h.icono ? '' : `<text class="fr-i${HD[i] < ah ? ' pas' : ''}" x="${X[i].toFixed(1)}" y="${IY}">${esc(h.icono)}</text>`).join('');
  const eje = Array.from({ length: 8 }, (_, k) => `<text class="fr-h${k * 3 < ah ? ' pas' : ''}" x="${xh(k * 3).toFixed(1)}" y="${GH - 4}">${k * 3}h</text>`).join('');
  const lluvia = horas.map((h, i) => o.lluvia !== false && enHora(i) && h.lluvia > 0 ? `<rect class="fr-ll${HD[i] < ah ? ' pas' : ''}" x="${(X[i] - 1.25).toFixed(1)}" y="${(BY - Math.max(2, h.lluvia * .14)).toFixed(1)}" width="2.5" height="${Math.max(2, h.lluvia * .14).toFixed(1)}" rx="1.25"/>` : '').join('');
  return `<div class="franja"><svg class="fr-g" viewBox="0 0 ${W} ${GH}" role="img" aria-label="Temperatura de ${esc(nombre)}, de ${dmn}° a ${dmx}°${hoy ? `, ahora ${Math.round(ta)}°` : ''}">
    <defs><linearGradient id="gr${u}" x1="0" y1="0" x2="0" y2="1"><stop class="g1" offset="0"/><stop class="g2" offset="1"/></linearGradient>
      <clipPath id="cp${u}"><rect x="0" y="0" width="${xa.toFixed(1)}" height="${GH}"/></clipPath><clipPath id="cf${u}"><rect x="${xa.toFixed(1)}" y="0" width="${W}" height="${GH}"/></clipPath></defs>
    ${refCurva}<g class="pas">${grupo('cp')}</g>${grupo('cf')}<line class="fr-e" x1="${PX}" y1="${BY}" x2="${W - PX}" y2="${BY}"/>${lluvia}${iconos}${textos}
    ${hoy ? `<line class="fr-ya" x1="${xa.toFixed(1)}" y1="${IY + 8}" x2="${xa.toFixed(1)}" y2="${BY}"/><circle class="fr-k" cx="${xa.toFixed(1)}" cy="${ya.toFixed(1)}" r="4.5"/>
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
const WANCHO = { tiempo: { p: 300, m: 380, g: 520 }, sistema: { p: 260, m: 320, g: 420 }, agenda: { p: 280, m: 340, g: 440 } };
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
  const pts = (dia ? dsel.puntos : r.puntos) || [], serie = pts.length > 1 ? pts : hs; // cada 15 min si Open-Meteo los dio; si no, por horas
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
// modo 'eventos': lista por días (ndias) · modo 'horas': hoy en una línea de tiempo vertical de `nh` horas desde 1 h antes de ahora, con los eventos solapados en columnas.
// todo = false oculta los de todo el día; lugar = false oculta el lugar. Los colores van en data-c: después de poner el HTML se llama a colorea(raiz) (CSP: sin style inline).
const HEX = /^#[0-9a-f]{6}$/i, hhmm2 = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
const colorea = raiz => raiz.querySelectorAll('[data-c]').forEach(e => e.style.setProperty('--c', e.dataset.c));
function htmlAgenda(r, o = {}, ahora = new Date()) {
  if (!r || !r.ok) return '<div class="vacio">Agenda no disponible</div>';
  const ev = (r.agenda || []).map(e => ({ ...e, i: +new Date(e.inicio), f: +new Date(e.fin || e.inicio) })).filter(e => Number.isFinite(e.i)).sort((a, b) => a.i - b.i);
  const d0 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()), dia = k => +new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + k), now = +ahora;
  const cdata = e => HEX.test(e.color) ? ` data-c="${e.color}"` : '';
  const delDia = k => ev.filter(e => e.i < dia(k + 1) && Math.max(e.f, e.i + 1) > dia(k) && (o.todo !== false || !e.todoDia));
  if (o.modo === 'horas') {
    const nh = [6, 10, 14].includes(o.nh) ? o.nh : 10, nowH = (now - dia(0)) / 36e5, h0 = clamp(Math.floor(nowH) - 1, 0, 24 - nh), h1 = h0 + nh, RH = 30, X0 = 44, H = nh * RH;
    const hoy = delDia(0), todos = hoy.filter(e => e.todoDia), con = hoy.filter(e => !e.todoDia).map(e => ({ ...e, s: Math.max(h0, (e.i - dia(0)) / 36e5), t: Math.min(h1, (e.f - dia(0)) / 36e5) })).filter(e => e.t > e.s);
    let fin = -1, col = [], grupo = []; const grupos = []; // columnas: cada evento a la primera libre; el ancho lo da el máximo de columnas de su grupo de solapados
    con.forEach(e => { if (e.s >= fin) { grupos.push(grupo); grupo = []; col = []; fin = -1; } let c = col.findIndex(x => x <= e.s); if (c < 0) c = col.length; col[c] = e.t; e.c = c; grupo.push(e); fin = Math.max(fin, e.t); });
    grupos.push(grupo); grupos.forEach(g => { const n = Math.max(1, ...g.map(e => e.c + 1)); g.forEach(e => e.n = n); });
    const ancho = W - X0 - PX, y = h => (h - h0) * RH;
    const rej = Array.from({ length: nh + 1 }, (_, k) => `<line class="wh-l" x1="${X0}" x2="${W - PX}" y1="${k * RH}" y2="${k * RH}"/>${k < nh ? `<text class="wh-h" x="${X0 - 6}" y="${k * RH + 11}">${String(h0 + k).padStart(2, '0')}:00</text>` : ''}`).join('');
    const bloques = con.map(e => {
      const x = X0 + e.c * ancho / e.n + 1, w = ancho / e.n - 2, top = y(e.s) + 1, alto = Math.max(15, (e.t - e.s) * RH - 2), c = HEX.test(e.color) ? e.color : '', max = Math.max(3, Math.floor((w - 10) / 6));
      const t = String(e.titulo); const tt = t.length > max ? t.slice(0, max - 1) + '…' : t;
      return `<g class="wh-b${e.f < now ? ' pas' : ''}"><rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${alto.toFixed(1)}" rx="8"${c ? ` fill="${c}" stroke="${c}"` : ' class="sc"'}/>` +
        `<text x="${(x + 7).toFixed(1)}" y="${(top + 11).toFixed(1)}">${esc(tt)}</text>${alto >= 30 ? `<text class="s" x="${(x + 7).toFixed(1)}" y="${(top + 24).toFixed(1)}">${hhmm2(new Date(e.i))}–${hhmm2(new Date(e.f))}</text>` : ''}</g>`;
    }).join('');
    const ya = nowH >= h0 && nowH <= h1 ? `<line class="wh-ya" x1="${X0 - 4}" x2="${W - PX}" y1="${y(nowH).toFixed(1)}" y2="${y(nowH).toFixed(1)}"/><circle class="wh-yc" cx="${X0 - 4}" cy="${y(nowH).toFixed(1)}" r="3.5"/>` : '';
    const chips = o.todo !== false && todos.length ? `<div class="wtodo">${todos.map(e => `<span class="wchip"${cdata(e)}>${esc(e.titulo)}</span>`).join('')}</div>` : '';
    return chips + `<svg class="wh" viewBox="0 0 ${W} ${H}" role="img" aria-label="Agenda de hoy, de ${h0} a ${h1} h">${rej}${bloques}${ya}</svg>`;
  }
  const nd = [1, 3, 7].includes(o.ndias) ? o.ndias : 3, nom = k => k === 0 ? 'Hoy' : k === 1 ? 'Mañana' : new Date(dia(k)).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' }).replace(/^./, c => c.toUpperCase());
  let h = '';
  for (let k = 0; k < nd; k++) {
    const l = delDia(k).filter(e => k > 0 || e.todoDia || e.f > now);
    if (!l.length && k) continue;
    h += `<div class="wdia">${nom(k)}</div>` + (l.length ? l.map(e => `<div class="wev"${cdata(e)}><span class="h">${e.todoDia ? 'Todo el día' : hhmm2(new Date(e.i)) + (e.fin ? '–' + hhmm2(new Date(e.f)) : '')}</span><span class="tt">${esc(e.titulo)}${o.lugar !== false && e.lugar ? `<small>${esc(e.lugar)}</small>` : ''}</span></div>`).join('') : '<div class="vacio">Sin eventos</div>');
  }
  return h || '<div class="vacio">Sin eventos</div>';
}
