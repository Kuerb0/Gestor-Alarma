const MAX = 5, NOMBRE_MAX = 11, lista = document.getElementById('lista'), mas = document.getElementById('mas'), els = new Map();
let datos = [], ultimoPitido = 0, ctx, formato = 'adaptativo';

function pitido() { // dos tonos; Web Audio, sin ficheros
  try {
    ctx = ctx || new AudioContext(); ctx.resume();
    [[880, 0], [660, .25]].forEach(([f, d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + d;
      o.type = 'square'; o.frequency.value = f; g.gain.value = .07; o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + .18);
    });
  } catch {}
}

// ---- texto por caracteres; solo el que cambia hace un leve fundido/desplazamiento (barato)
function dibujar(cont, texto) {
  const t = [...texto];
  t.forEach((c, i) => {
    let e = cont.children[i];
    if (!e) { e = document.createElement('span'); e.textContent = c; cont.append(e); return; }
    if (e.textContent !== c) { e.textContent = c; if (cont.classList.contains('hora')) { e.classList.remove('c'); void e.offsetWidth; e.classList.add('c'); } }
  });
  while (cont.children.length > t.length) cont.lastChild.remove();
}
// acento (canal 'tema'); cifras: acento > 1 h → ámbar a 10 min → rojo a 0 (Tiempo.color cubre ámbar→rojo)
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
let acento = [74, 158, 255];
function colorDe(ms) {
  if (ms < 6e5) return Tiempo.color(ms);
  const t = Math.min(1, (36e5 - ms) / 30e5), A = [255, 190, 40];
  return 'rgb(' + acento.map((v, i) => Math.round(v + (A[i] - v) * Math.max(0, t))).join(',') + ')';
}
if (window.api) window.api.on('tema', t => {
  if (t && /^#[0-9a-f]{6}$/i.test(t.acento)) { document.documentElement.style.setProperty('--acento', t.acento); acento = rgb(t.acento); pintar(); }
});
const hm = t => new Date(t).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');

function pintar() {
  const ahora = Date.now();
  const ord = Tiempo.ordenar(datos.filter(a => Tiempo.fase(a, ahora).fase !== 'fin'), ahora), vis = ord.slice(0, MAX);
  for (const [id, e] of els) if (!vis.some(a => a.id === id)) { e.remove(); els.delete(id); }
  let suena = false;
  vis.forEach((a, i) => {
    let e = els.get(a.id);
    if (!e) {
      e = document.createElement('div');
      e.innerHTML = '<div class="nom"></div><div class="hora"></div>';
      els.set(a.id, e);
    }
    const f = Tiempo.fase(a, ahora);
    const cls = 'tarjeta ' + (f.fase === 'sonando' ? 'sonando' : f.fase === 'perdida' ? 'perdida' : '');
    if (e.className !== cls) e.className = cls;
    dibujar(e.querySelector('.nom'), a.nombre.toUpperCase().slice(0, NOMBRE_MAX));
    dibujar(e.querySelector('.hora'), f.fase === 'perdida' ? 'PERDIDA' : f.fase === 'sonando' && f.ms === undefined ? '00:00' : Tiempo.formatear(f.ms, a.tipo === 'crono', formato));
    // cifras: acento > 1 h → ámbar a 10 min → rojo a 0 (el cronómetro, acento fijo); sonando y perdida las colorea el CSS
    if (f.fase === 'activa') { const c = colorDe(a.tipo === 'crono' ? Infinity : f.ms); if (e.style.getPropertyValue('--th') !== c) e.style.setProperty('--th', c); }
    else e.style.removeProperty('--th');
    e.title = a.nombre + (a.tipo === 'crono' ? '' : ' · ' + hm(a.objetivo));
    if (f.suena && !a.silencioso) suena = true; // las de Post-It solo se ven: ya suenan en Post-It
    if (lista.children[i] !== e) lista.insertBefore(e, lista.children[i] || null);
  });
  const resto = ord.length - vis.length;
  mas.style.display = resto ? 'block' : 'none'; mas.textContent = '+' + resto + ' más';
  if (suena && ahora - ultimoPitido >= 1000) { ultimoPitido = ahora; pitido(); }
}
alarmas.lista().then(l => { datos = l; pintar(); });
alarmas.alCambiar(l => { datos = l; pintar(); });
alarmas.formato().then(f => { formato = f; pintar(); });
alarmas.alFormato(f => { formato = f; pintar(); });
setInterval(pintar, 250);
