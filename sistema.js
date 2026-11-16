// CPU, RAM y disco C:\ (la batería la lee el renderer).
const os = require('os');
const fs = require('fs');

const muestra = () => os.cpus().reduce((s, c) => ({ t: s.t + Object.values(c.times).reduce((a, b) => a + b, 0), i: s.i + c.times.idle }), { t: 0, i: 0 });
let previa = null;

async function leer() {
  if (!previa) { previa = muestra(); await new Promise(r => setTimeout(r, 300)); }
  const m = muestra(), dt = m.t - previa.t, di = m.i - previa.i;
  previa = m;
  const cpu = dt > 0 ? Math.min(100, Math.max(0, Math.round(100 * (1 - di / dt)))) : 0;
  let discoLibre = 0, discoTotal = 0;
  try { const s = await fs.promises.statfs('C:\\'); discoLibre = s.bavail * s.bsize; discoTotal = s.blocks * s.bsize; } catch { }
  return { cpu, ramUsada: os.totalmem() - os.freemem(), ramTotal: os.totalmem(), discoLibre, discoTotal };
}

module.exports = { leer };
