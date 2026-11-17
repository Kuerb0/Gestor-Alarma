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
function franja(horas, ah, ta, ref, nombre) {
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
const NOM_DIA = ['Hoy', 'Mañana', 'Pasado mañana'];
// Todo el bloque del tiempo (flechas de día, gráfico, resumen, detalles y próximos días). `dia` = día elegido (0 = hoy), `t0` = cuándo llegó
// el dato (ms; la rayita de «ahora» avanza desde ahí). Devuelve { html, dia } con `dia` ya ajustado a los días que hay.
function htmlMeteo(r, dia, t0) {
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
  return { dia, html: nav + (serie.length > 1 ? franja(serie, ah, a.temp, dia ? horasDe(0) : null, nombre) : '') + resumen + detalles(hs) + `
    <div class="dias">${r.dias.slice(0, 5).map(d => `<div>${esc(String(d.nombre).slice(0, 3))}<span class="ic">${esc(d.icono)}</span><span>${Math.round(d.max)}° <small>${Math.round(d.min)}°</small></span><span class="ll">${Math.round(d.lluvia || 0)}%</span></div>`).join('')}</div>` };
}
// Varias ciudades: pestañitas (si hay más de una) + el tiempo de la elegida. `m` = { lista: [{ clave, nombre, r }] }, `sel` = clave elegida;
// `editar` pone una × para quitar la elegida (solo en el panel). Devuelve { html, dia, sel } con `dia` y `sel` ya ajustados.
function htmlCiudades(m, sel, dia, t0, editar) {
  const l = (m && m.lista) || [];
  if (!l.length) return { html: '<div class="vacio">Tiempo no disponible</div>', dia, sel };
  const e = l.find(x => x.clave === sel) || l[0], o = htmlMeteo(e.r, dia, t0);
  const chips = l.length > 1 ? `<div class="ciudades">${l.map(x => `<span class="ciu${x === e ? ' on' : ''}"><button class="ciu-n" data-c="${esc(x.clave)}" aria-pressed="${x === e}">${esc(x.nombre)}</button>${editar && x === e ? `<button class="ciu-q" data-q="${esc(x.clave)}" aria-label="Quitar ${esc(x.nombre)}" title="Quitar esta ciudad">×</button>` : ''}</span>`).join('')}</div>` : '';
  return { html: chips + o.html, dia: o.dia, sel: e.clave };
}
// Barras de Sistema: CPU, RAM, disco C:, dispositivos con batería y la batería del equipo (`bateria` = BatteryManager o null)
const barra = (n, v, txt, inv) => `<div class="barra">${n} · ${txt}<progress max="100" value="${Math.min(100, Math.max(0, Math.round(v)))}" class="${(inv ? v < 15 : v > 85) ? 'alto' : ''}"></progress></div>`;
const iconoDisp = n => /mando|controller|gamepad|xbox|dualsense|dualshock|joy-?con/i.test(n) ? '🎮' : /mouse|rat[oó]n|mx master|m[x]? anywhere/i.test(n) ? '🖱️' : /keyboard|teclado|mx keys|k\d{2,3}/i.test(n) ? '⌨️' : /buds|airpods|head|auric|wh-|speaker|altavoz|earbud/i.test(n) ? '🎧' : '🔋';
function htmlSistema(sis, bateria) {
  let h = '';
  if (sis) {
    const gb = b => (b / 1e9).toFixed(1);
    h += barra('CPU', sis.cpu, Math.round(sis.cpu) + '%');
    h += barra('RAM', sis.ramUsada / sis.ramTotal * 100, `${gb(sis.ramUsada)}/${gb(sis.ramTotal)} GB`);
    const u = sis.discoTotal - sis.discoLibre;
    h += barra('Disco C:', u / sis.discoTotal * 100, `${Math.round(sis.discoLibre / 1e9)} GB libres`);
    h += '<h3 class="sub">Dispositivos</h3>';
    const ds = sis.dispositivos;
    if (!ds) h += '<div class="vacio">Buscando dispositivos…</div>';
    else if (!ds.length) h += '<div class="vacio">Ningún dispositivo con batería detectado. Los que usan receptor USB propio (2,4 GHz) no la comunican a Windows.</div>';
    else h += ds.map(d => barra(iconoDisp(d.nombre) + ' ' + esc(d.nombre), d.nivel, (d.aprox ? '≈ ' : '') + d.nivel + '%', true)).join('');
  }
  if (bateria) h += barra('Batería' + (bateria.charging ? ' ⚡' : ''), bateria.level * 100, Math.round(bateria.level * 100) + '%', true);
  return '<div class="barras">' + h + '</div>';
}
