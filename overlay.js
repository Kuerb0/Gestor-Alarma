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
    const cls = 'tarjeta ' + (f.fase === 'sonando' ? 'sonando' : f.fase === 'perdida' ? 'perdida' : '') + (/^#[0-9a-f]{6}$/i.test(a.color) ? ' c' : '');
    if (a.color && e.style.getPropertyValue('--nc') !== a.color) e.style.setProperty('--nc', a.color); // nombre con el color de su etiqueta
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
  pintarAgenda(ahora);
  if (suena && ahora - ultimoPitido >= 1000) { ultimoPitido = ahora; pitido(); }
}
// ---- agenda: cuadrado con borde del color de la etiqueta para el evento en curso (cuenta atrás hasta su fin, «−12:34») y, la hora anterior, hasta su inicio (borde discontinuo)
const MAXQ = 3, cuadros = document.getElementById('cuadros'), elsQ = new Map();
let agenda = [];
function pintarAgenda(ahora) {
  const en = agenda.map(e => ({ ...e, i: +new Date(e.inicio), f: +new Date(e.fin), k: e.titulo + '|' + e.inicio })).filter(e => e.i - 36e5 <= ahora && ahora < e.f)
    .sort((a, b) => (a.i > ahora) - (b.i > ahora) || (a.i > ahora ? a.i - b.i : a.f - b.f)).slice(0, MAXQ); // primero los en curso (el que acaba antes), luego los próximos
  for (const [k, e] of elsQ) if (!en.some(x => x.k === k)) { e.remove(); elsQ.delete(k); }
  en.forEach((ev, n) => {
    let e = elsQ.get(ev.k);
    if (!e) { e = document.createElement('div'); e.className = 'cuadro'; e.innerHTML = '<div class="nom"></div><div class="hora"></div>'; elsQ.set(ev.k, e); }
    if (/^#[0-9a-f]{6}$/i.test(ev.color)) e.style.setProperty('--bc', ev.color); else e.style.removeProperty('--bc');
    dibujar(e.querySelector('.nom'), ev.titulo.toUpperCase().slice(0, 16));
    const pronto = ev.i > ahora; e.classList.toggle('pronto', pronto);
    dibujar(e.querySelector('.hora'), '−' + Tiempo.formatear((pronto ? ev.i : ev.f) - ahora, false, formato));
    e.title = ev.titulo + (pronto ? ' · empieza a las ' : ' · hasta ') + new Date(pronto ? ev.i : ev.f).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    if (cuadros.children[n] !== e) cuadros.insertBefore(e, cuadros.children[n] || null);
  });
}
alarmas.agenda().then(l => { agenda = l; });
alarmas.alAgenda(l => { agenda = l; });
alarmas.lista().then(l => { datos = l; pintar(); });
alarmas.alCambiar(l => { datos = l; pintar(); });
alarmas.formato().then(f => { formato = f; pintar(); });
alarmas.alFormato(f => { formato = f; pintar(); });
setInterval(pintar, 250);
