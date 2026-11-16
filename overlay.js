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

// ---- fichas split-flap
const crearFicha = () => { // contenido fijo, sin datos de la persona
  const f = document.createElement('span'); f.className = 'ficha'; f.dataset.c = ' ';
  f.innerHTML = '<i class="sup"><b> </b></i><i class="inf"><b> </b></i><i class="ab"><b> </b></i><i class="ba"><b> </b></i>';
  return f;
};
const crearSep = () => { const s = document.createElement('span'); s.className = 'sep'; return s; };
function girar(f, c, pos) {
  const ant = f.dataset.c; if (ant === c) return;
  f.dataset.c = c;
  const [sup, inf, ab, ba] = [...f.children].map(i => i.firstChild), d = ant === ' ' ? pos * 45 : 0; // al aparecer, en cascada
  ab.textContent = inf.textContent = ant; sup.textContent = ba.textContent = c;
  f.style.setProperty('--d', d + 'ms');
  f.classList.remove('gira'); void f.offsetWidth; f.classList.add('gira');
  clearTimeout(f._t);
  f._t = setTimeout(() => { inf.textContent = ab.textContent = c; f.classList.remove('gira'); }, d + 260);
}
function dibujar(cont, texto) { // una ficha por carácter; «:» y espacio son separadores fijos
  const t = [...texto];
  t.forEach((c, i) => {
    const sep = c === ':' || c === ' ';
    let e = cont.children[i];
    if (e && e.classList.contains('sep') !== sep) { const n = sep ? crearSep() : crearFicha(); cont.replaceChild(n, e); e = n; }
    if (!e) { e = sep ? crearSep() : crearFicha(); cont.append(e); }
    if (sep) { e.textContent = c === ' ' ? '' : c; e.classList.toggle('esp', c === ' '); } else girar(e, c, i);
  });
  while (cont.children.length > t.length) cont.lastChild.remove();
}
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
      e.innerHTML = '<div class="nom"></div><div class="hora"><span class="fichas" style="display:flex"></span></div>';
      els.set(a.id, e);
    }
    const f = Tiempo.fase(a, ahora);
    const cls = 'tarjeta ' + (f.fase === 'sonando' ? 'sonando' : f.fase === 'perdida' ? 'perdida' : '');
    if (e.className !== cls) e.className = cls;
    dibujar(e.querySelector('.nom'), a.nombre.toUpperCase().slice(0, NOMBRE_MAX));
    dibujar(e.querySelector('.fichas'), f.fase === 'perdida' ? 'PERDIDA' : f.fase === 'sonando' && f.ms === undefined ? '00:00' : Tiempo.formatear(f.ms, a.tipo === 'crono', formato));
    // cifras: azul > 1 h → ámbar a 10 min → rojo a 0 (el cronómetro, azul fijo); sonando y perdida las colorea el CSS
    if (f.fase === 'activa') { const c = Tiempo.color(a.tipo === 'crono' ? Infinity : f.ms); if (e.style.getPropertyValue('--th') !== c) e.style.setProperty('--th', c); }
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
