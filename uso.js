// Seguimiento de uso de apps: convierte las líneas del vigía (pantalla_completa.ps1) en tramos por día (<dir>/AAAA-MM-DD.jsonl). Solo recoge y guarda.
// Tramo: { i, f, n, exe, d, t?, cpu? } con i/f en ms; n = a (activa) | v (visible) | s (segundo plano) | b (fondo) | i (inactivo).
const fs = require('fs'), path = require('path');
const HUECO = 30e3, LARGO = 5 * 60e3, MIN = 1e3; // huecos > 30 s cierran todo; los tramos se parten cada 5 min; menos de 1 s se descarta
const p2 = n => String(n).padStart(2, '0');
const dia = ms => { const d = new Date(ms); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const sigMedianoche = ms => { const d = new Date(ms); d.setHours(24, 0, 0, 0); return d.getTime(); };
const txt = (x, n) => typeof x === 'string' ? x.slice(0, n) : '';
const clave = o => o.n === 'b' ? 'b|' + o.exe : o.n + '|' + o.exe + '|' + (o.t || '');

function crear({ dir, ahora = Date.now }) {
  const abiertos = new Map(); // clave -> { i, n, exe, d, t?, cpu0?, cpu? }
  let ultima = 0, pausaHasta = 0; // ms de la última línea recibida; 0 = sin pausa

  function escribir(tr) {
    try { fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(path.join(dir, dia(tr.i) + '.jsonl'), JSON.stringify(tr) + '\n'); } catch {}
  }
  function cerrarUno(o, f) { // guarda el tramo, partido por medianoche local
    const cpu = o.n === 'b' ? Math.max(0, (o.cpu || 0) - (o.cpu0 || 0)) : null, total = f - o.i;
    for (let i = o.i; i < f;) {
      const m = sigMedianoche(i), fin = Math.min(f, m);
      if (fin - i >= MIN) {
        const tr = { i, f: fin, n: o.n, exe: o.exe, d: o.d };
        if (o.t) tr.t = o.t;
        if (cpu !== null) tr.cpu = Math.round(cpu * (fin - i) / total * 10) / 10;
        escribir(tr);
      }
      i = fin;
    }
  }
  const cerrarTodos = f => { abiertos.forEach(o => cerrarUno(o, f)); abiertos.clear(); };
  const abrir = (o, t) => { const k = clave(o); if (!abiertos.has(k)) abiertos.set(k, { ...o, i: t }); return k; };
  function sincronizar(ns, vivos, t) { // cierra los abiertos de esos niveles que ya no están en `vivos` (set de claves)
    for (const [k, o] of [...abiertos]) if (ns.includes(o.n) && !vivos.has(k)) { cerrarUno(o, t); abiertos.delete(k); }
  }
  function partir(t) { // tramos largos: se cierran y se reabren, así un cierre brusco pierde ≤ 5 min
    for (const o of abiertos.values()) if (t - o.i >= LARGO) { cerrarUno(o, t); o.i = t; o.cpu0 = o.cpu; }
  }
  const fich = (x, n) => x && typeof x === 'object' ? { n, exe: txt(x.exe, 260).toLowerCase(), d: txt(x.d, 200), ...(typeof x.t === 'string' && x.t ? { t: x.t.slice(0, 300) } : {}) } : null;

  function entrada(linea, t) {
    try {
      let j; try { j = JSON.parse(linea); } catch { return; }
      if (!j || typeof j !== 'object' || !Number.isFinite(t)) return;
      if (pausaHasta) { if (t < pausaHasta) return; pausaHasta = 0; ultima = 0; }
      if (ultima && t - ultima > HUECO) cerrarTodos(ultima); // PC suspendido o vigía caído: se cierra en la hora de la última línea
      ultima = t; partir(t);
      if (j.k === 'a') {
        const vivos = new Set();
        if (j.i === true) vivos.add(abrir({ n: 'i', exe: '', d: '' }, t));
        else if (typeof j.exe === 'string' && j.exe) vivos.add(abrir(fich(j, 'a'), t));
        sincronizar(['a', 'i'], vivos, t);
      } else if (j.k === 'v' && Array.isArray(j.l)) {
        const vivos = new Set();
        for (const x of j.l) { const o = (x && (x.n === 'v' || x.n === 's') && typeof x.exe === 'string' && x.exe) ? fich(x, x.n) : null; if (o) vivos.add(abrir(o, t)); }
        sincronizar(['v', 's'], vivos, t);
      } else if (j.k === 'b' && Array.isArray(j.l)) {
        const vivos = new Set();
        for (const x of j.l) {
          const o = x && typeof x.exe === 'string' && x.exe ? fich({ exe: x.exe, d: x.d }, 'b') : null; if (!o) continue;
          const cpu = Number.isFinite(x.cpu) ? x.cpu : 0, k = abrir({ ...o, cpu0: cpu }, t); abiertos.get(k).cpu = cpu; vivos.add(k);
        }
        sincronizar(['b'], vivos, t);
      }
    } catch {}
  }
  function pausar(hastaMs) {
    try { if (!hastaMs) { pausaHasta = 0; return; } cerrarTodos(ultima && ahora() - ultima > HUECO ? ultima : ahora()); pausaHasta = hastaMs; ultima = 0; } catch {}
  }
  const pausado = () => pausaHasta !== 0 && ahora() < pausaHasta;
  function cerrar(t = ahora()) { try { cerrarTodos(ultima && t - ultima > HUECO ? ultima : t); } catch {} }
  function leerDias(desde, hasta) { // desde/hasta: AAAAMMDD (con o sin guiones), ambos incluidos
    const d0 = String(desde).replace(/\D/g, ''), d1 = String(hasta).replace(/\D/g, ''), r = [];
    let fs_ = []; try { fs_ = fs.readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort(); } catch {}
    for (const f of fs_) {
      const k = f.slice(0, 10).replace(/\D/g, ''); if (k < d0 || k > d1) continue;
      let c = ''; try { c = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
      for (const l of c.split('\n')) { if (!l) continue; try { const o = JSON.parse(l); if (o && typeof o === 'object') r.push(o); } catch {} }
    }
    return r;
  }
  function abiertosAhora(t = ahora()) { // copia de los tramos abiertos como si se cerraran en t (sin tocar el estado, sin cpu)
    const r = [];
    try { for (const o of abiertos.values()) if (t - o.i >= MIN) { const tr = { i: o.i, f: t, n: o.n, exe: o.exe, d: o.d }; if (o.t) tr.t = o.t; r.push(tr); } } catch {}
    return r;
  }
  function limpiar(t = ahora()) { // borra los ficheros de hace más de 365 días
    try {
      for (const f of fs.readdirSync(dir)) {
        const m = /^(\d{4})-(\d{2})-(\d{2})\.jsonl$/.exec(f);
        if (m && new Date(+m[1], +m[2] - 1, +m[3]).getTime() < t - 365 * 864e5) try { fs.unlinkSync(path.join(dir, f)); } catch {}
      }
    } catch {}
  }
  return { entrada, pausar, pausado, cerrar, leerDias, abiertos: abiertosAhora, limpiar };
}
module.exports = { crear };
