// Gestor → Outlook: las alarmas a fecha y hora que se crean en el Gestor se reflejan como eventos del calendario de Outlook (categoría «Alarma»).
// planificar() y sinDuplicadas() son puras (se prueban con node); aplicar() llama a outlook_escribir.ps1 (automatización de Outlook clásico).
const fs = require('fs'), os = require('os'), path = require('path'), { execFile } = require('child_process');

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const huella = a => `${a.nombre}|${a.objetivo}`;

// Qué hay que hacer en Outlook: crear las nuevas (a fecha, futuras y propias), actualizar las que cambiaron y borrar las eliminadas en el Gestor.
function planificar(alarmas, pendientesBorrar, ahora) {
  const ops = [];
  for (const a of alarmas) {
    if (a.tipo !== 'fecha' || a.origen || a.deAgenda || a.descartada || !(a.objetivo > ahora)) continue;
    if (!a.outlookId) ops.push({ op: 'crear', id: a.id, nombre: a.nombre, inicio: a.objetivo });
    else if (a.outlookHuella !== huella(a)) ops.push({ op: 'actualizar', id: a.id, nombre: a.nombre, inicio: a.objetivo, entryId: a.outlookId });
  }
  for (const entryId of pendientesBorrar || []) ops.push({ op: 'borrar', id: 'borrar:' + entryId, entryId });
  return ops;
}

// El evento que el Gestor creó vuelve a leerse desde Outlook: no se muestra dos veces (misma hora y mismo título que una alarma propia).
function sinDuplicadas(propias, externas) {
  const p = propias.filter(a => a.tipo === 'fecha');
  return externas.filter(e => e.origen !== 'outlook' || !p.some(a => norm(a.nombre) === norm(e.nombre) && Math.abs(a.objetivo - e.objetivo) < 6e4));
}

// Outlook manda: las alarmas propias a fecha ligadas a un evento (`outlookId` si se exportaron, `eventoId` si se pusieron desde la Agenda) copian su título, hora, color y categoría.
// Devuelve [{ id, cambios }] solo con lo que cambia. No toca lo que no se encuentra (fuera de los días leídos), una ocurrencia de serie movida ni una edición local aún sin exportar.
const COLOR = /^#[0-9a-f]{6}$/i;
function reconciliar(alarmas, agenda, ahora) {
  const out = [];
  for (const a of alarmas || []) {
    if (a.origen || a.tipo !== 'fecha' || a.descartada || !(a.objetivo > ahora - 60000)) continue;
    const eid = a.eventoId || a.outlookId; if (!eid) continue;
    if (a.outlookId && a.outlookHuella !== huella(a)) continue; // editada aquí y pendiente de exportar: gana lo de aquí
    const ev = (agenda || []).find(e => e.id === eid && (!e.recurrente || e.inicio === a.inicioEv)); if (!ev) continue;
    const c = {}, nombre = String(ev.titulo || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (nombre && nombre !== a.nombre) c.nombre = nombre;
    const d = new Date(ev.inicio), ms = ev.todoDia ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9).getTime() : d.getTime();
    if (Number.isFinite(ms) && ms !== a.objetivo) c.objetivo = ms;
    if (COLOR.test(ev.color) && ev.color !== a.color) c.color = ev.color;
    const cat = typeof ev.categoria === 'string' ? ev.categoria.slice(0, 60) : '';
    if (cat !== (a.categoria || '')) c.categoria = cat;
    if (a.eventoId && !ev.recurrente && ev.inicio && ev.inicio !== a.inicioEv) c.inicioEv = ev.inicio;
    if (Object.keys(c).length) out.push({ id: a.id, cambios: c });
  }
  return out;
}

// Aplica las operaciones en Outlook → [{id, ok, entryId, error}] (o lanza si Outlook no está disponible)
function aplicar(ops, calendario = '', ps1 = path.join(__dirname, 'outlook_escribir.ps1')) {
  const f = path.join(os.tmpdir(), 'gestor-outlook-' + process.pid + '-' + Date.now() + '.json');
  fs.writeFileSync(f, JSON.stringify(ops));
  return new Promise((res, rej) => execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-Entrada', f, '-Calendario', calendario],
    { windowsHide: true, timeout: 180000, maxBuffer: 8 << 20, encoding: 'utf8' }, (err, out, errOut) => {
      try { fs.unlinkSync(f); } catch {}
      if (err) return rej(new Error((errOut || err.message || '').trim().split('\n')[0] || 'fallo de Outlook'));
      try { res([].concat(JSON.parse(out))); } catch { rej(new Error('respuesta de Outlook no válida')); }
    }));
}

// Quita de la agenda las copias «Alarma» que el Gestor exportó antes de un evento que ya existe (mismo título e inicio, otra categoría); las «Alarma» sin original se quedan.
function sinCopiasAlarma(agenda, etiqueta = 'Alarma') {
  const et = norm(etiqueta), t = e => new Date(e.inicio).getTime();
  return agenda.filter(e => norm(e.categoria) !== et || !agenda.some(o => o !== e && norm(o.categoria) !== et && norm(o.titulo) === norm(e.titulo) && Math.abs(t(o) - t(e)) < 6e4));
}

module.exports = { planificar, reconciliar, sinDuplicadas, sinCopiasAlarma, aplicar, huella, norm };
