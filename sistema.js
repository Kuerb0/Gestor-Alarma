// CPU, RAM y disco C:\ (la batería la lee el renderer).
const os = require('os');
const fs = require('fs'), path = require('path');
const { execFile } = require('child_process');

const muestra = () => os.cpus().reduce((s, c) => ({ t: s.t + Object.values(c.times).reduce((a, b) => a + b, 0), i: s.i + c.times.idle }), { t: 0, i: 0 });
let previa = null;

// Dispositivos con batería (dispositivos.ps1 tarda unos 10 s): se refresca en segundo plano cada minuto y leer() devuelve lo último que hay
const PS1 = path.join(__dirname, 'dispositivos.ps1').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
let dispositivos = null, midiendo = false, ultDisp = 0;
function medirDispositivos() {
  if (midiendo || Date.now() - ultDisp < 6e4) return;
  midiendo = true;
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PS1], { timeout: 30000, windowsHide: true, encoding: 'utf8' }, (e, out) => {
    midiendo = false; ultDisp = Date.now();
    if (e) return;
    try { const j = JSON.parse(String(out).replace(/^﻿/, '').trim() || '[]'); dispositivos = [].concat(j).filter(d => d && d.nombre && Number.isFinite(d.nivel)).map(d => ({ nombre: String(d.nombre).slice(0, 60), nivel: Math.min(100, Math.max(0, Math.round(d.nivel))), aprox: !!d.aprox })); } catch { }
  });
}

async function leer() {
  medirDispositivos();
  if (!previa) { previa = muestra(); await new Promise(r => setTimeout(r, 300)); }
  const m = muestra(), dt = m.t - previa.t, di = m.i - previa.i;
  previa = m;
  const cpu = dt > 0 ? Math.min(100, Math.max(0, Math.round(100 * (1 - di / dt)))) : 0;
  let discoLibre = 0, discoTotal = 0;
  try { const s = await fs.promises.statfs('C:\\'); discoLibre = s.bavail * s.bsize; discoTotal = s.blocks * s.bsize; } catch { }
  return { cpu, ramUsada: os.totalmem() - os.freemem(), ramTotal: os.totalmem(), discoLibre, discoTotal, dispositivos };
}

module.exports = { leer };
