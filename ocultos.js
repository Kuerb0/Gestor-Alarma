// Estado compartido "widgets ocultos" entre Consumo, Bancos y Gestor-Alarma (Ctrl+Alt+J).
// Sin dependencia de electron: la ruta se puede inyectar para las pruebas.
const fs = require('fs'), path = require('path'), os = require('os');

const rutaPorDefecto = () => path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Kuerb0', 'widgets-ocultos.json');
let ruta = rutaPorDefecto();
const fijarRuta = r => { ruta = r || rutaPorDefecto(); };

function leer() { // nunca lanza: ausente, roto o no booleano → false
  try { return JSON.parse(fs.readFileSync(ruta, 'utf8')).ocultos === true; } catch { return false; }
}
function escribir(ocultos, por) { // atómica (tmp + rename); nunca lanza
  const tmp = `${ruta}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify({ ocultos: !!ocultos, t: Date.now(), por }));
    fs.renameSync(tmp, ruta);
    return true;
  } catch { try { fs.rmSync(tmp, { force: true }); } catch {} return false; }
}
function vigilar(cb, intervaloMs = 300) { // llama a cb(ocultos) cuando cambia la fecha de modificación; devuelve una función para parar
  const firma = () => { try { const s = fs.statSync(ruta); return s.mtimeMs + ':' + s.size; } catch { return ''; } };
  let ultima = firma();
  const id = setInterval(() => { const f = firma(); if (f !== ultima) { ultima = f; try { cb(leer()); } catch {} } }, intervaloMs);
  if (id.unref) id.unref();
  return () => clearInterval(id);
}
module.exports = { leer, escribir, vigilar, fijarRuta, rutaPorDefecto };
