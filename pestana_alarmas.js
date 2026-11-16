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
      if (a.origen) { f.classList.add('ext'); f.append(n, t, el('small', '', a.origen === 'outlook' ? 'Outlook' : 'Post-It')); } // traídas de fuera: solo lectura
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
  al.syncEstado().then(s => { sync = s; pintarSync(); });
  al.alSync(s => { sync = s; pintarSync(); });
  setInterval(pintarSync, 1000);

  [[1, 'L'], [2, 'M'], [3, 'X'], [4, 'J'], [5, 'V'], [6, 'S'], [0, 'D']].forEach(([v, l]) => { // casillas de los días (0 = domingo)
    const lab = el('label', 'dia'), inp = document.createElement('input');
    inp.type = 'checkbox'; inp.value = v; lab.append(inp, el('span', '', l)); $('al-dias').append(lab);
  });
  al.formato().then(f => { formato = f; tic(); });
  al.alFormato(f => { formato = f; tic(); });
  reiniciar();
})();
