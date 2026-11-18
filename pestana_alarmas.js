// Pestaña Alarmas: el formulario del Gestor de alarmas integrado en el panel (usa window.alarmas y el global Tiempo).
(() => {
  const $ = id => document.getElementById(id), al = window.alarmas;
  if (!al) { $('al-lista').textContent = 'Alarmas no disponibles'; return; }
  let datos = [], editId = null, formato = 'adaptativo', sync = null;
  const p2 = n => String(n).padStart(2, '0');
  const hm = t => new Date(t).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
  const aLocal = t => new Date(t - new Date(t).getTimezoneOffset() * 6e4).toISOString().slice(0, 16); // para <input type=datetime-local>
  const ETIQ = { cuenta: 'cuenta atrás', fecha: 'alarma', crono: 'cronómetro', recurrente: 'repetición' };
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  function aviso(txt, mal, negrita) {
    const v = $('al-vista'); v.className = mal ? 'mal' : ''; v.textContent = '';
    if (negrita) v.append(el('b', '', negrita), ' ' + txt); else v.textContent = txt;
  }
  // ---- texto rápido con vista previa
  $('al-rapido').addEventListener('input', () => {
    const t = $('al-rapido').value; if (!t.trim()) return aviso('');
    const r = Tiempo.parsear(t, Date.now());
    if (!r.ok) return aviso(r.error, true);
    const c = r.rec, rep = c.tipo === 'recurrente' ? ' ' + Tiempo.etiquetaDias(c.dias) + ' ' + p2(c.hh) + ':' + p2(c.mm) : '';
    aviso('· ' + ETIQ[c.tipo] + rep + (c.tipo === 'crono' ? '' : ' · ' + (c.tipo === 'recurrente' ? 'próxima en ' : '') + Tiempo.formatear(c.objetivo - Date.now(), false, formato) + ' (' + hm(c.objetivo) + ')'), false, c.nombre);
  });
  $('al-rapido').addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    const r = Tiempo.parsear($('al-rapido').value, Date.now());
    if (!r.ok) return aviso(r.error, true);
    const g = await al.crear(r.rec);
    if (!g.ok) return aviso(g.error, true);
    $('al-rapido').value = ''; aviso('Añadida ✔');
  });

  // ---- campos detallados (también sirven para editar)
  const tipoUI = () => { const t = $('al-tipo').value; $('al-dcuenta').hidden = t !== 'cuenta'; $('al-dfecha').hidden = t !== 'fecha'; $('al-drec').hidden = t !== 'recurrente'; };
  $('al-tipo').addEventListener('change', tipoUI);
  const masc = () => { $('al-masc').textContent = editId ? 'Editando alarma ▴' : 'Campos detallados ' + ($('al-det').hidden ? '▾' : '▴'); };
  $('al-masc').onclick = () => { $('al-det').hidden = !$('al-det').hidden; if ($('al-det').hidden && editId) reiniciar(); masc(); if (!$('al-det').hidden) $('al-nombre').focus(); };
  function reiniciar() {
    editId = null; $('al-anadir').textContent = 'Añadir';
    $('al-nombre').value = ''; $('al-tipo').value = 'cuenta'; $('al-dd').value = 0; $('al-hh').value = 0; $('al-mm').value = 5; $('al-cuando').value = aLocal(Date.now() + 36e5);
    document.querySelectorAll('#al-dias input').forEach(i => i.checked = false); $('al-hora').value = '08:00'; tipoUI(); masc();
  }
  $('al-anadir').onclick = async () => {
    const tipo = $('al-tipo').value, rec = { nombre: $('al-nombre').value, tipo };
    if (tipo === 'cuenta') rec.objetivo = Date.now() + ($('al-dd').value * 864e5 + $('al-hh').value * 36e5 + $('al-mm').value * 6e4);
    if (tipo === 'fecha') rec.objetivo = new Date($('al-cuando').value).getTime();
    if (tipo === 'recurrente') { const [hh, mm] = $('al-hora').value.split(':').map(Number); Object.assign(rec, { hh, mm, dias: [...document.querySelectorAll('#al-dias input:checked')].map(i => +i.value) }); }
    const g = editId ? await al.editar(editId, rec) : await al.crear(rec);
    if (!g.ok) return aviso(g.error, true);
    reiniciar(); $('al-det').hidden = true; masc(); aviso('Guardada ✔'); $('al-rapido').focus();
  };
  function editar(a) {
    editId = a.id; $('al-det').hidden = false; $('al-anadir').textContent = 'Guardar';
    $('al-nombre').value = a.nombre; $('al-tipo').value = a.tipo; tipoUI(); masc();
    if (a.tipo === 'cuenta') { const s = Math.max(60, Math.round((a.objetivo - Date.now()) / 1e3)); $('al-dd').value = Math.floor(s / 86400); $('al-hh').value = Math.floor(s % 86400 / 3600); $('al-mm').value = Math.ceil(s % 3600 / 60); }
    if (a.tipo === 'fecha') $('al-cuando').value = aLocal(a.objetivo);
    if (a.tipo === 'recurrente') { $('al-hora').value = p2(a.hh) + ':' + p2(a.mm); document.querySelectorAll('#al-dias input').forEach(i => i.checked = a.dias.includes(+i.value)); }
    $('al-nombre').focus();
  }

  // ---- lista de alarmas
  function pintarLista() {
    const ahora = Date.now(), l = $('al-lista'); l.textContent = '';
    const ord = Tiempo.ordenar(datos.filter(a => Tiempo.fase(a, ahora).fase !== 'fin'), ahora);
    $('al-cuenta').textContent = 'Activas (' + ord.length + ')';
    if (!ord.length) l.append(el('div', 'vacio', 'No hay alarmas. Escribe una arriba y pulsa Intro.'));
    ord.forEach(a => {
      const f = el('div', 'fila'), n = el('span', 'n', a.nombre), t = el('span', 't'), s = el('small', '', a.tipo === 'crono' ? '▲' : a.tipo === 'fecha' ? hm(a.objetivo) : a.tipo === 'recurrente' ? '↻ ' + Tiempo.etiquetaDias(a.dias) + ' ' + p2(a.hh) + ':' + p2(a.mm) : '▼');
      f.dataset.id = a.id; n.title = s.textContent; n.append(' ', s);
      if (/^#[0-9a-f]{6}$/i.test(a.color)) { n.classList.add('c'); n.style.setProperty('--c', a.color); } // color de su etiqueta de Outlook
      if (a.origen) { // traídas de fuera: solo lectura; las de Outlook se pueden quitar de aquí (siguen en Outlook)
        f.classList.add('ext'); f.append(n, t, el('small', '', a.origen === 'outlook' ? 'Outlook' : 'Post-It'));
        if (a.origen === 'outlook') { const bq = el('button', 'btn-sec', 'Quitar'); bq.title = 'Quitar de las alarmas (sigue en Outlook)'; bq.onclick = () => al.ocultar(a.id); f.append(bq); }
      }
      else {
        const be = el('button', 'btn-sec', 'Editar'), bb = el('button', 'btn-sec', 'Borrar');
        be.onclick = () => editar(a); bb.onclick = () => al.borrar(a.id); f.append(n, t, be, bb);
      }
      l.append(f);
    });
    tic();
  }
  function tic() { // solo actualiza los tiempos, sin reconstruir la lista (no pierde el foco de los botones)
    const ahora = Date.now(); let sonando = 0, perdidas = 0;
    datos.forEach(a => { const f = Tiempo.fase(a, ahora).fase; if (f === 'sonando') sonando++; else if (f === 'perdida') perdidas++; });
    const g = $('g-alarmas'); g.hidden = !(sonando + perdidas); g.textContent = sonando + perdidas; g.className = 'globo ' + (sonando ? 'suena' : 'mal');
    document.querySelectorAll('#al-lista .fila').forEach(f => {
      const a = datos.find(x => x.id === f.dataset.id); if (!a) return;
      const ph = Tiempo.fase(a, ahora);
      f.classList.toggle('perdida', ph.fase === 'perdida'); f.classList.toggle('sonando', ph.fase === 'sonando');
      f.querySelector('.t').textContent = ph.fase === 'perdida' ? 'PERDIDA' : ph.fase === 'sonando' ? '00:00' : Tiempo.formatear(ph.ms, a.tipo === 'crono', formato);
    });
  }
  al.lista().then(l => { datos = l; pintarLista(); });
  al.alCambiar(l => { datos = l; pintarLista(); });
  setInterval(tic, 500);

  // ---- sincronización con Outlook y Post-It
  function pintarSync() {
    if (!sync) return;
    const b = $('al-refrescar'), e = $('al-estado'), u = sync.ultimo;
    b.disabled = sync.trabajando; b.textContent = sync.trabajando ? '⟳ Sincronizando…' : '⟳ Sincronizar';
    if (document.activeElement !== $('al-ventana')) $('al-ventana').value = sync.ventanaDias;
    if (!u) { e.className = ''; e.textContent = 'Aún sin sincronizar'; return; }
    const seg = Math.max(0, Math.round((Date.now() - u.t) / 1e3)), hace = seg < 60 ? 'hace ' + seg + ' s' : 'hace ' + Math.round(seg / 60) + ' min';
    if (u.error) { e.className = 'mal'; e.textContent = 'Error: ' + u.error + ' · ' + hace; return; }
    const fu = { outlook: 'Outlook', ics: 'ICS de Outlook', ninguna: 'Sin Outlook ni ICS', error: 'ICS no disponible' }[u.fuente] || u.fuente;
    e.className = ''; e.textContent = fu + ' · ' + (u.outlook === null ? 'sin lectura' : u.outlook + ' de Outlook') + ' · ' + u.postit + ' de Post-It · ' + hace;
  }
  $('al-refrescar').onclick = async () => { $('al-refrescar').disabled = true; sync = await al.syncAhora(); pintarSync(); };
  $('al-ventana').addEventListener('change', async () => { sync = await al.syncVentana($('al-ventana').value); pintarSync(); });
  al.syncEstado().then(s => { sync = s; pintarSync(); pintarEtiquetas(); });
  al.alSync(s => { const nueva = !sync || JSON.stringify(s.etiquetas) !== JSON.stringify(sync.etiquetas); sync = s; pintarSync(); if (nueva) pintarEtiquetas(); });
  setInterval(pintarSync, 1000);

  // ---- etiquetas de Outlook elegidas, cada una con su límite de días (las del buzón salen del canal «correo»; se pueden añadir otras a mano)
  let cats = [];
  const casilla = (cls, txt, on) => { const l = el('label', 'etq-c'), c = document.createElement('input'); c.type = 'checkbox'; c.className = cls; c.checked = on; l.append(c, ' ' + txt); return l; };
  function pintarEtiquetas() { // por etiqueta: «Suena como alarma» (con sus días) y «Sale arriba como evento»; con las dos, se pone como alarma
    const sel = (sync && sync.etiquetas) || [], l = $('al-etq-l'); if (!sync || l.contains(document.activeElement)) return;
    const nombres = [...cats.map(c => c.nombre), ...sel.map(s => s.nombre)].filter((n, i, a) => a.findIndex(m => m.toLowerCase() === n.toLowerCase()) === i);
    l.textContent = '';
    nombres.forEach(n => {
      const s = sel.find(x => x.nombre.toLowerCase() === n.toLowerCase()), c = cats.find(x => x.nombre === n), f = el('div', 'etq'), top = el('div', 'etq-t'), fila = el('div', 'etq-f');
      const p = el('i', 'punto'); if (c && c.color) p.style.setProperty('background', c.color);
      const d = document.createElement('input'); d.type = 'number'; d.min = 1; d.max = 365; d.className = 'campo e-d'; d.value = s ? s.dias : sync.ventanaDias; d.setAttribute('aria-label', 'Días de ' + n);
      const al = s ? s.alarma : false, ev = s ? s.evento : true, am = s ? s.antes : 60; // sin entrada: sale como evento (como siempre)
      const [av, au] = am && am % 1440 === 0 ? [am / 1440, 1440] : am && am % 60 === 0 ? [am / 60, 60] : [am, 1]; // lo mayor que sea exacto: días, horas o minutos
      const da = document.createElement('input'); da.type = 'number'; da.min = 0; da.className = 'campo e-an'; da.value = av; da.disabled = !ev; da.setAttribute('aria-label', 'Cuánto antes sale ' + n);
      const ua = document.createElement('select'); ua.className = 'campo e-au'; ua.disabled = !ev; ua.setAttribute('aria-label', 'Unidad');
      [[1, 'min'], [60, 'horas'], [1440, 'días']].forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; o.selected = v === au; ua.append(o); });
      f.dataset.n = n; d.disabled = !al; top.append(p, el('span', 'n', n));
      fila.append(casilla('e-al', 'Suena como alarma', al), d, el('small', '', 'días'), casilla('e-ev', 'Sale arriba como evento', ev), el('small', '', 'desde'), da, ua, el('small', '', 'antes'));
      f.append(top, fila);
      if (al && ev) f.append(el('small', 'etq-nota', 'Con las dos: se pone como alarma'));
      l.append(f);
    });
    filtrarEtiquetas();
  }
  const quitaAcentos = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function filtrarEtiquetas() { // el buscador esconde las que no contienen el texto (sin mayúsculas ni acentos)
    const q = quitaAcentos($('al-etq-b').value.trim()); let n = 0;
    document.querySelectorAll('#al-etq-l .etq').forEach(f => { const ok = !q || quitaAcentos(f.dataset.n).includes(q); f.hidden = !ok; if (ok) n++; });
    $('al-etq-vacio').hidden = n > 0 || !document.querySelector('#al-etq-l .etq');
  }
  $('al-etq-b').addEventListener('input', filtrarEtiquetas);
  async function guardarEtiquetas() {
    const lista = [...document.querySelectorAll('#al-etq-l .etq')].map(f => ({ nombre: f.dataset.n, dias: +f.querySelector('.e-d').value || 14, alarma: f.querySelector('.e-al').checked, evento: f.querySelector('.e-ev').checked, antes: Math.round((+f.querySelector('.e-an').value || 0) * +f.querySelector('.e-au').value) }));
    sync = await al.syncEtiquetas(lista); pintarSync(); pintarEtiquetas();
  }
  $('al-etq-l').addEventListener('change', e => { if (!['checkbox', 'number', 'select-one'].includes(e.target.type)) return;
    const f = e.target.closest('.etq'); f.querySelector('.e-d').disabled = !f.querySelector('.e-al').checked; f.querySelector('.e-an').disabled = f.querySelector('.e-au').disabled = !f.querySelector('.e-ev').checked; // el foco sigue en la casilla: no se repinta
    guardarEtiquetas(); });
  const añadirEtq = () => { const n = $('al-etq-n').value.trim(); if (!n) return; $('al-etq-n').value = ''; const ya = [...document.querySelectorAll('#al-etq-l .etq')].find(f => f.dataset.n.toLowerCase() === n.toLowerCase()); if (ya) return; sync.etiquetas = [...sync.etiquetas, { nombre: n, dias: sync.ventanaDias, alarma: true, evento: false, antes: 60 }]; pintarEtiquetas(); guardarEtiquetas(); };
  $('al-etq-a').onclick = añadirEtq; $('al-etq-n').addEventListener('keydown', e => { if (e.key === 'Enter') añadirEtq(); });
  window.api && window.api.on('correo', r => { if (r && r.ok && Array.isArray(r.categorias)) { cats = r.categorias; pintarEtiquetas(); } });

  [[1, 'L'], [2, 'M'], [3, 'X'], [4, 'J'], [5, 'V'], [6, 'S'], [0, 'D']].forEach(([v, l]) => { // casillas de los días (0 = domingo)
    const lab = el('label', 'dia'), inp = document.createElement('input');
    inp.type = 'checkbox'; inp.value = v; lab.append(inp, el('span', '', l)); $('al-dias').append(lab);
  });
  al.formato().then(f => { formato = f; tic(); });
  al.alFormato(f => { formato = f; tic(); });
  reiniciar();
})();
