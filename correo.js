// Lee Outlook clásico (COM vía outlook.ps1). Nunca lanza: devuelve { ok:false, motivo }.
const { execFile } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');

const PS1 = path.join(__dirname, 'outlook.ps1').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
const MOTIVOS = { 3: 'cerrado', 4: 'no_instalado' };

// Ejecuta el .ps1; resuelve { codigo, out, err } sin rechazar nunca
function ps(args) {
  return new Promise(res => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PS1, ...args],
      { timeout: 20000, windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' },
      (e, out, err) => res({ codigo: e ? (typeof e.code === 'number' ? e.code : -1) : 0, out: out || '', err: (err || '') + (e && typeof e.code !== 'number' ? e.message : '') }));
  });
}

// Pura: JSON crudo (texto u objeto) de PowerShell -> resultado del contrato
function normalizar(crudo) {
  try {
    const j = typeof crudo === 'string' ? JSON.parse(crudo.replace(/^﻿/, '')) : crudo;
    if (!j || j.ok !== true) return { ok: false, motivo: 'error', detalle: 'salida inesperada' };
    const arr = x => [].concat(x || []);
    return {
      ok: true,
      noLeidos: Number(j.noLeidos) || 0,
      correos: arr(j.correos).map(c => ({ id: String(c.id || ''), de: String(c.de || ''), asunto: String(c.asunto || ''), fecha: String(c.fecha || ''), leido: !!c.leido })),
      agenda: arr(j.agenda).map(a => ({ titulo: String(a.titulo || ''), inicio: String(a.inicio || ''), fin: String(a.fin || ''), todoDia: !!a.todoDia, lugar: String(a.lugar || ''), categoria: String(a.categoria || ''), color: /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : null })),
      categorias: arr(j.categorias).filter(c => c && c.nombre).map(c => ({ nombre: String(c.nombre), color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : null })),
    };
  } catch (e) { return { ok: false, motivo: 'error', detalle: e.message }; }
}

// dias: cuántos días de agenda (1–120, por defecto 7); la respuesta lo incluye para que la UI sepa cuántos pintar
async function leer({ dias = 7 } = {}) {
  try {
    if (!Number.isInteger(dias) || dias < 1 || dias > 120) return { ok: false, motivo: 'error', detalle: 'dias no válido' };
    const r = await ps(['-Dias', String(dias)]);
    if (r.codigo !== 0) return { ok: false, motivo: MOTIVOS[r.codigo] || 'error', detalle: r.err.trim().slice(0, 300) || undefined };
    const n = normalizar(r.out);
    return n.ok ? { ...n, dias } : n;
  } catch (e) { return { ok: false, motivo: 'error', detalle: e.message }; }
}

async function abrir(id) {
  try { return !!id && (await ps(['-Abrir', String(id)])).codigo === 0; } catch { return false; }
}

// Marca como leídos varios EntryIDs (máx. 200). Los pasa por fichero temporal (pueden ser muchos y largos).
async function marcarLeidos(ids) {
  const mal = { ok: false, hechos: 0, fallos: 0 };
  if (!Array.isArray(ids) || ids.length > 200 || !ids.every(i => typeof i === 'string' && i)) return mal;
  if (!ids.length) return { ok: true, hechos: 0, fallos: 0 };
  const f = path.join(os.tmpdir(), `panel-leidos-${process.pid}-${Date.now()}.json`);
  try {
    fs.writeFileSync(f, JSON.stringify(ids));
    const r = await ps(['-Leidos', f]);
    if (r.codigo !== 0) return mal;
    const j = JSON.parse(r.out.replace(/^﻿/, ''));
    return { ok: j.ok === true, hechos: Number(j.hechos) || 0, fallos: Number(j.fallos) || 0 };
  } catch { return mal; }
  finally { try { fs.unlinkSync(f); } catch {} }
}

// Pura: valida el evento a crear. Devuelve null si está bien o el motivo.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
function validarEvento(ev) {
  if (!ev || typeof ev !== 'object') return 'evento no válido';
  const t = typeof ev.titulo === 'string' ? ev.titulo.trim() : '';
  if (t.length < 1 || t.length > 200) return 'el título debe tener de 1 a 200 caracteres';
  if (typeof ev.inicio !== 'string' || typeof ev.fin !== 'string' || !ISO.test(ev.inicio) || !ISO.test(ev.fin)) return 'fechas no válidas';
  const a = new Date(ev.inicio), b = new Date(ev.fin);
  if (isNaN(a) || isNaN(b)) return 'fechas no válidas';
  if (a >= b) return 'el inicio debe ser anterior al fin';
  if (ev.categoria != null && typeof ev.categoria !== 'string') return 'categoría no válida';
  if (ev.lugar != null && typeof ev.lugar !== 'string') return 'lugar no válido';
  return null;
}

// Crea un evento en el calendario predeterminado. Con { ensayo } valida y monta todo en Outlook pero no guarda nada.
async function crearEvento(ev, { ensayo = false } = {}) {
  const mal = validarEvento(ev);
  if (mal) return { ok: false, motivo: mal };
  const f = path.join(os.tmpdir(), `panel-evento-${process.pid}-${Date.now()}.json`);
  try {
    fs.writeFileSync(f, JSON.stringify({ titulo: ev.titulo.trim(), inicio: ev.inicio, fin: ev.fin, todoDia: !!ev.todoDia, lugar: (ev.lugar || '').trim(), categoria: ev.categoria || '' }));
    const r = await ps(['-Crear', f, ...(ensayo ? ['-Ensayo'] : [])]);
    if (r.codigo !== 0) return { ok: false, motivo: r.codigo === 3 ? 'Outlook está cerrado' : r.codigo === 4 ? 'Falta Outlook clásico' : 'No se pudo crear el evento' + (r.err.trim() ? ': ' + r.err.trim().slice(0, 150) : '') };
    const j = JSON.parse(r.out.replace(/^﻿/, ''));
    if (j.ok !== true) return { ok: false, motivo: 'No se pudo crear el evento' };
    return ensayo ? { ok: true, ensayo: true } : { ok: true, id: String(j.id || '') };
  } catch (e) { return { ok: false, motivo: 'No se pudo crear el evento: ' + e.message }; }
  finally { try { fs.unlinkSync(f); } catch {} }
}

module.exports = { leer, abrir, marcarLeidos, normalizar, crearEvento, validarEvento };
