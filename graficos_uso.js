// Gráficos de la pestaña Uso: agregación de tramos (puro, también se prueba en node) y constructores de HTML/SVG (devuelven texto; sin style= ni on…=).
// Tramo que llega del main: { i, f, n, c, d } (ms; n = a|v|s|b|i; c = categoría). Por defecto solo cuenta el nivel 'a'; 'Inactivo' (n:'i') solo se ve en la línea del día.
const GraficosUso = (() => {
  const GRIS = '#8a8f99', NIV = ['a'], INICIAL = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  const e = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hex = c => /^#[0-9a-f]{3,8}$/i.test(c) ? c : GRIS;
  const p2 = n => String(n).padStart(2, '0');
  const inicioDia = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
  const sigDia = ms => { const d = new Date(ms); d.setHours(24, 0, 0, 0); return d.getTime(); };
  const hhmm = ms => { const d = new Date(ms); return p2(d.getHours()) + ':' + p2(d.getMinutes()); };
  const fmtMin = m => { if (m > 0 && m < 0.5) return '<1 min'; m = Math.round(m); if (m <= 0) return '0 min'; if (m < 60) return m + ' min'; const h = Math.floor(m / 60), r = m % 60; return r ? h + ' h ' + r + ' min' : h + ' h'; };
  const corto = m => { m = Math.round(m); return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h' + (m % 60 ? p2(m % 60) : ''); };
  const colorDe = (cats, n) => { const c = (cats || []).find(x => x.nombre === n); return n === 'Inactivo' ? GRIS : hex(c && c.color); };
  const vale = (t, niv) => t && Number.isFinite(t.i) && Number.isFinite(t.f) && t.f > t.i && (niv || NIV).includes(t.n);

  // ---- agregación
  function porBloques(tramos, desdeMs, hastaMs, paso, niveles) { // -> { cats: [nombre], m: [[min por bloque]] } (solo categorías con datos, por orden de aparición)
    const nb = Math.max(1, Math.ceil((hastaMs - desdeMs) / paso - 1e-9)), idx = new Map(), cats = [], m = [];
    for (const t of tramos || []) {
      if (!vale(t, niveles)) continue;
      const a = Math.max(t.i, desdeMs), b = Math.min(t.f, hastaMs); if (b <= a) continue;
      let k = idx.get(t.c); if (k === undefined) { k = cats.length; idx.set(t.c, k); cats.push(t.c); m.push(new Array(nb).fill(0)); }
      for (let j = Math.floor((a - desdeMs) / paso); j < nb; j++) {
        const x = desdeMs + j * paso, y = x + paso; if (x >= b) break;
        const s = Math.min(b, y) - Math.max(a, x); if (s > 0) m[k][j] += s / 60e3;
      }
    }
    return { cats, m };
  }
  function porDia(tramos, dias, niveles) { // -> { cats, m: [[min por día]] }
    const cats = [], m = [], idx = new Map();
    dias.forEach((d, j) => {
      const a = inicioDia(d), r = porBloques(tramos, a, sigDia(a), sigDia(a) - a, niveles);
      r.cats.forEach((c, i) => { let k = idx.get(c); if (k === undefined) { k = cats.length; idx.set(c, k); cats.push(c); m.push(new Array(dias.length).fill(0)); } m[k][j] = r.m[i][0]; });
    });
    return { cats, m };
  }
  function reparto(tramos, niveles) { // -> [{ c, min, apps: [{ d, min }] }] por minutos desc; apps = las 5 con más tiempo
    const cs = new Map();
    for (const t of tramos || []) {
      if (!vale(t, niveles)) continue;
      const min = (t.f - t.i) / 60e3; let c = cs.get(t.c); if (!c) cs.set(t.c, c = { c: t.c, min: 0, ap: new Map() });
      c.min += min; const d = t.d || '(sin nombre)'; c.ap.set(d, (c.ap.get(d) || 0) + min);
    }
    return [...cs.values()].map(c => ({ c: c.c, min: c.min, apps: [...c.ap].map(([d, min]) => ({ d, min })).sort((x, y) => y.min - x.min).slice(0, 5) })).sort((x, y) => y.min - x.min);
  }
  function lineaDia(tramos, diaMs) { // -> [{ i, f, c }] solo nivel 'a' e 'i'; funde contiguos de la misma categoría (hueco < 60 s)
    const fin = sigDia(diaMs), r = [];
    for (const t of [...(tramos || [])].filter(t => vale(t, ['a', 'i'])).sort((x, y) => x.i - y.i)) {
      const i = Math.max(t.i, diaMs), f = Math.min(t.f, fin); if (f <= i) continue;
      const u = r[r.length - 1]; if (u && u.c === t.c && i - u.f < 60e3) u.f = Math.max(u.f, f); else r.push({ i, f, c: t.c });
    }
    return r;
  }
  const total = rep => rep.reduce((s, c) => s + c.min, 0);

  // ---- constructores
  const vacio = '<div class="vacio">Sin datos</div>';
  function leyenda(nombres, cats) {
    return nombres.length ? `<div class="uso-g-ley">${nombres.map(n => `<span class="uso-g-lg"><i class="punto" data-c="${e(colorDe(cats, n))}"></i>${e(n)}</span>`).join('')}</div>` : '';
  }
  function suavizar(v) { return v.map((_, i) => { let s = 0, n = 0; for (let j = i - 1; j <= i + 1; j++) if (j >= 0 && j < v.length) { s += v[j]; n++; } return s / n; }); }
  function areaSvg(r, cats, marcas, aria, suave) { // áreas apiladas; marcas: [{ x (0..1), t }]
    if (!r.cats.length || !r.m.some(f => f.some(v => v > 0))) return vacio;
    const W = 420, H = 118, X0 = 6, X1 = 414, Y0 = 8, Y1 = 92, nb = r.m[0].length;
    const ser = r.m.map(f => suave ? suavizar(f) : f), pila = [new Array(nb).fill(0)];
    ser.forEach((f, k) => pila.push(f.map((v, j) => pila[k][j] + v)));
    const max = Math.max(1, ...pila[pila.length - 1]), x = j => X0 + (j + .5) / nb * (X1 - X0), y = v => Y1 - v / max * (Y1 - Y0);
    let s = `<svg class="uso-g-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${e(aria)}" xmlns="http://www.w3.org/2000/svg">`;
    s += `<line class="uso-g-eje" x1="${X0}" y1="${Y1}" x2="${X1}" y2="${Y1}"/>`;
    marcas.forEach(m => { const px = (X0 + m.x * (X1 - X0)).toFixed(1); s += `<line class="uso-g-eje" x1="${px}" y1="${Y1}" x2="${px}" y2="${Y1 + 3}"/>`; });
    for (let k = r.cats.length - 1; k >= 0; k--) {
      const arriba = pila[k + 1].map((v, j) => `${x(j).toFixed(1)},${y(v).toFixed(1)}`), abajo = pila[k].map((v, j) => `${x(j).toFixed(1)},${y(v).toFixed(1)}`).reverse();
      s += `<polygon fill="${e(colorDe(cats, r.cats[k]))}" fill-opacity=".85" points="${arriba.concat(abajo).join(' ')}"><title>${e(r.cats[k])}</title></polygon>`;
    }
    marcas.forEach(m => { s += `<text class="uso-g-t" x="${(X0 + m.x * (X1 - X0)).toFixed(1)}" y="${Y1 + 15}">${e(m.t)}</text>`; });
    return s + `<text class="uso-g-t uso-g-max" x="${X0}" y="${Y0 - 1}">máx. ${e(corto(max))}</text></svg>` + leyenda(r.cats, cats);
  }
  function areaDia(tramos, dia, niveles, cats) { // 96 bloques de 15 min, alisado ligero
    const a = inicioDia(dia), b = sigDia(a), r = porBloques(tramos, a, b, (b - a) / 96, niveles);
    return areaSvg(r, cats, [0, 6, 12, 18, 24].map(h => ({ x: h / 24, t: String(h) })), 'Uso por hora del día', true);
  }
  function areaSemana(tramos, dias, niveles, cats) { // 7 días × bloques de 1 h
    const a = inicioDia(dias[0]), b = sigDia(inicioDia(dias[dias.length - 1])), r = porBloques(tramos, a, b, (b - a) / (24 * dias.length), niveles);
    return areaSvg(r, cats, dias.map((d, j) => ({ x: (j + .5) / dias.length, t: INICIAL[new Date(inicioDia(d)).getDay()] })), 'Uso por hora de la semana', false);
  }
  function lineaHtml(tramos, dia, cats) { // banda 0–24 h con las categorías; inactivo en gris tenue
    const a = inicioDia(dia), b = sigDia(a), seg = lineaDia(tramos, a), W = 420, X0 = 6, X1 = 414, px = ms => X0 + (ms - a) / (b - a) * (X1 - X0);
    if (!seg.length) return vacio;
    let s = `<svg class="uso-g-svg uso-g-lin" viewBox="0 0 ${W} 40" role="img" aria-label="Línea del día" xmlns="http://www.w3.org/2000/svg"><rect class="uso-g-pista" x="${X0}" y="4" width="${X1 - X0}" height="22" rx="5"/>`;
    for (const g of seg) s += `<rect fill="${e(colorDe(cats, g.c))}" fill-opacity="${g.c === 'Inactivo' ? .55 : .9}" x="${px(g.i).toFixed(1)}" y="4" width="${Math.max(1, px(g.f) - px(g.i)).toFixed(1)}" height="22"><title>${e(g.c)} · ${hhmm(g.i)}–${hhmm(g.f)}</title></rect>`;
    for (const h of [0, 6, 12, 18, 24]) s += `<text class="uso-g-t" x="${px(a + h / 24 * (b - a)).toFixed(1)}" y="38">${h}</text>`;
    return s + '</svg>' + leyenda([...new Set(seg.map(g => g.c))], cats);
  }
  function repartoHtml(rep, cats) { // barras horizontales; cada fila despliega sus 5 apps
    const tot = total(rep); if (!(tot > 0)) return vacio;
    return rep.map(c => {
      const pc = c.min / tot * 100, col = e(colorDe(cats, c.c));
      return `<details class="uso-g-fila"><summary><span class="uso-g-n"><i class="punto" data-c="${col}"></i>${e(c.c)}</span><span class="uso-g-m">${e(fmtMin(c.min))} · ${Math.round(pc)}%</span>` +
        `<svg class="uso-g-barra" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect class="uso-g-pista" width="100" height="6" rx="3"/><rect fill="${col}" width="${Math.max(1.5, pc).toFixed(1)}" height="6" rx="3"/></svg></summary>` +
        `<div class="uso-g-apps">${c.apps.map(a => `<div><span>${e(a.d)}</span><span>${e(fmtMin(a.min))}</span></div>`).join('')}</div></details>`;
    }).join('');
  }
  function semanaHtml(tramos, dias, niveles, cats) { // 7 barras verticales apiladas con el total encima
    const r = porDia(tramos, dias, niveles), tot = dias.map((_, j) => r.m.reduce((s, f) => s + f[j], 0)), max = Math.max(...tot);
    if (!(max > 0)) return vacio;
    const W = 420, H = 140, Y0 = 20, Y1 = 118, n = dias.length, paso = (W - 12) / n, bw = Math.min(40, paso - 10);
    let s = `<svg class="uso-g-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Uso por día de la semana" xmlns="http://www.w3.org/2000/svg"><line class="uso-g-eje" x1="6" y1="${Y1}" x2="${W - 6}" y2="${Y1}"/>`;
    dias.forEach((d, j) => {
      const cx = 6 + (j + .5) * paso; let base = Y1;
      r.cats.forEach((c, k) => { const h = r.m[k][j] / max * (Y1 - Y0); if (h <= 0) return; base -= h; s += `<rect fill="${e(colorDe(cats, c))}" fill-opacity=".9" x="${(cx - bw / 2).toFixed(1)}" y="${base.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}"><title>${e(c)} · ${e(fmtMin(r.m[k][j]))}</title></rect>`; });
      s += `<text class="uso-g-t uso-g-k" x="${cx.toFixed(1)}" y="${(base - 4).toFixed(1)}">${tot[j] > 0 ? e(corto(tot[j])) : ''}</text><text class="uso-g-t" x="${cx.toFixed(1)}" y="${Y1 + 15}">${INICIAL[new Date(inicioDia(d)).getDay()]}</text>`;
    });
    return s + '</svg>' + leyenda(r.cats, cats);
  }
  return { porBloques, porDia, reparto, lineaDia, total, fmtMin, leyenda, areaDia, areaSemana, lineaHtml, repartoHtml, semanaHtml, inicioDia };
})();
if (typeof module !== 'undefined') module.exports = GraficosUso;
