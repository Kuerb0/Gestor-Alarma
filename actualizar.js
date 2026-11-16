// Actualización: mira la última Release de GitHub, baja el instalador (solo de este repo) y lo ejecuta en silencio; el instalador cierra la app y se reabre sola.
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
let net; try { net = require('electron').net; } catch {} // sin Electron (tests) se usa el fetch de Node
const REPO = 'Kuerb0/Gestor-Alarma', ORIGEN = `https://github.com/${REPO}/releases/download/`, MAX = 400e6, NOMBRE = 'GestorAlarma'; // NOMBRE = app.json "nombre" (carpeta y .exe instalados)
const VERSION = require('./package.json').version;
const get = (u, o) => net && net.fetch ? net.fetch(u, o) : fetch(u, o);
const versionMayor = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
function urlValida(u) { try { return typeof u === 'string' && new URL(u).href.startsWith(ORIGEN); } catch { return false; } }
const hostValido = h => h === 'github.com' || h.endsWith('.githubusercontent.com'); // adonde GitHub redirige la descarga de un asset
const VER = /^\d+(\.\d+){1,3}$/;

async function comprobar(f = get) { // {nueva:false} | {nueva:true, version, url, nombre} | {error}. Nunca lanza.
  try {
    const r = await f(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Gestor-Alarma' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { error: 'HTTP ' + r.status };
    const j = await r.json(), v = String(j.tag_name || '').replace(/^v/, '');
    if (!VER.test(v)) return { error: 'etiqueta no válida' };
    if (!versionMayor(v, VERSION)) return { nueva: false };
    const a = (j.assets || []).find(x => /\.exe$/i.test(x.name) && /Instalador/.test(x.name) && urlValida(x.browser_download_url));
    return a ? { nueva: true, version: v, url: a.browser_download_url, nombre: a.name } : { error: 'la versión ' + v + ' no trae instalador' };
  } catch (e) { return { error: String(e.message || e) }; }
}

async function descargar({ version, url }, f = get) { // → ruta del instalador en %TEMP%; lanza si algo no cuadra
  if (!urlValida(url) || !VER.test(version)) throw new Error('URL no permitida');
  const r = await f(url, { signal: AbortSignal.timeout(10 * 6e4) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  if (r.url && !(r.url.startsWith('https://') && hostValido(new URL(r.url).hostname))) throw new Error('redirección no permitida');
  if (Number(r.headers.get('content-length')) > MAX) throw new Error('fichero demasiado grande');
  const dest = path.join(os.tmpdir(), `Gestor-Alarma ${version} - Instalador.exe`), part = dest + '.part', fd = fs.openSync(part, 'w');
  let n = 0, ok = false;
  try {
    for await (const c of r.body) { n += c.length; if (n > MAX) throw new Error('fichero demasiado grande'); fs.writeSync(fd, c); }
    ok = n > 1e5; if (!ok) throw new Error('descarga incompleta');
  } finally { fs.closeSync(fd); if (!ok) fs.rmSync(part, { force: true }); }
  fs.renameSync(part, dest); return dest;
}

// cmd que espera al instalador (/S: sin ventana; cierra la app y copia encima, conservando %APPDATA%) y abre la app instalada. Instalada: <dir>\electron\electron.exe.
function ordenInstalar(inst, exec = process.execPath) {
  const dir = path.dirname(path.dirname(exec)), exe = path.join(dir, NOMBRE + '.exe'), ahi = fs.existsSync(exe);
  const dest = ahi ? exe : path.join(process.env.LOCALAPPDATA || '', 'Programs', NOMBRE, NOMBRE + '.exe');
  if ([inst, dir, dest].some(p => /[&%^"!<>|]/.test(p))) throw new Error('ruta con caracteres no permitidos');
  return `start "" /wait "${inst}" /S${ahi ? ` "/DIR=${dir}"` : ''} & start "" "${dest}"`;
}
function instalar(inst) { // proceso independiente: sigue vivo cuando el instalador cierra esta app
  spawn('cmd.exe', ['/d', '/s', '/c', `"${ordenInstalar(inst)}"`], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true }).unref();
}

module.exports = { VERSION, versionMayor, urlValida, comprobar, descargar, instalar, ordenInstalar };
