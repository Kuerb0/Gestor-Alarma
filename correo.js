// Lee Outlook clásico (COM vía outlook.ps1). Nunca lanza: devuelve { ok:false, motivo }.
const { execFile } = require('child_process');
const path = require('path');

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
      agenda: arr(j.agenda).map(a => ({ titulo: String(a.titulo || ''), inicio: String(a.inicio || ''), fin: String(a.fin || ''), todoDia: !!a.todoDia, lugar: String(a.lugar || '') })),
    };
  } catch (e) { return { ok: false, motivo: 'error', detalle: e.message }; }
}

async function leer() {
  try {
    const r = await ps([]);
    if (r.codigo !== 0) return { ok: false, motivo: MOTIVOS[r.codigo] || 'error', detalle: r.err.trim().slice(0, 300) || undefined };
    return normalizar(r.out);
  } catch (e) { return { ok: false, motivo: 'error', detalle: e.message }; }
}

async function abrir(id) {
  try { return !!id && (await ps(['-Abrir', String(id)])).codigo === 0; } catch { return false; }
}

module.exports = { leer, abrir, normalizar };
