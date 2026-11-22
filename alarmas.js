// Motor de alarmas (antes Gestor-Alarmas): estado, disco, tic, sincronización con Post-It/Outlook, overlay split-flap e IPC.
const { BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const T = require('./tiempo'), Puente = require('./puente'), Salida = require('./outlook_salida');

const ICONO = path.join(__dirname, 'assets', 'icon.png');
const W = 260, H = 480; // el overlay es transparente y click-through: tener más espacio del necesario no estorba
let app, log, HUMO, ventanas = () => [], alAbrir = () => {}, alEtiquetas = () => {};
let DIR, DATOS, AJUSTES, alarmas = [], externas = [], descartadasExt = new Set(), sincronizando = false, promesaSync = null, ultimoSync = null, exportando = false, pendientesBorrar = [], proximoIntentoOutlook = 0, categorias = {}, ajustes = { formato: 'adaptativo', ventanaDias: 14, calendarioOutlook: '' }, overlay;

// ---- disco: escritura atómica con copia .bak de la versión anterior
const leer = (f, def) => { for (const x of [f, f + '.bak']) try { return JSON.parse(fs.readFileSync(x, 'utf8')); } catch {} return def; };
function escribir(f, obj) {
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  try { fs.copyFileSync(f, f + '.bak'); } catch {}
  fs.renameSync(tmp, f);
}
const guardar = () => { escribir(DATOS, alarmas); enviar(); };
const todas = () => [...alarmas, ...Salida.sinDuplicadas(alarmas, externas)]; // propias + las traídas de Post-It y Outlook (solo lectura, en memoria; sin repetir lo que se mandó a Outlook)
const destinos = () => [overlay, ...ventanas()].filter(w => w && !w.isDestroyed());
const enviar = () => destinos().forEach(w => w.webContents.send('alarmas', todas()));

// ---- ciclo de vida: marca las alarmas vistas sonando y elimina las que ya acabaron (cada segundo)
function tic() {
  const ahora = Date.now(); let cambio = false;
  const n0 = externas.length; externas = externas.filter(a => T.fase(a, ahora).fase !== 'fin'); if (externas.length !== n0) cambio = true;
  alarmas = alarmas.filter(a => {
    const f = T.fase(a, ahora).fase;
    if (f === 'sonando' && !a.avisada) { a.avisada = true; cambio = true; }
    if (f === 'fin') {
      cambio = true;
      if (a.tipo === 'recurrente') { a.objetivo = T.siguiente(a, ahora); delete a.avisada; delete a.descartada; return true; } // salta a la próxima ocurrencia
      return false;
    }
    return true;
  });
  if (cambio) guardar();
}
const sonando = () => { const ahora = Date.now(); return todas().filter(a => T.fase(a, ahora).fase === 'sonando').map(a => a.id); }; // ids de lo que está sonando ahora (para enseñar las fichas si estaban ocultas)
function descartar() { // Ctrl+Alt+D: silencia y descarta lo que suena y lo que se perdió
  const ahora = Date.now();
  let n = 0;
  todas().forEach(a => { if (['sonando', 'perdida'].includes(T.fase(a, ahora).fase)) { a.descartada = true; if (a.origen) descartadasExt.add(a.id); n++; } });
  if (n) tic();
}

// ---- Post-It y Outlook (solo lectura): cada 30 s, al abrir la pestaña y con su botón; si Outlook no se pudo leer se conserva lo último
const ventanaMs = () => Math.min(365, Math.max(1, Math.round(ajustes.ventanaDias) || 14)) * 864e5; // días que se ven por delante
// Etiquetas de Outlook que suenan como alarma, cada una con su límite de días. Sin elegir nada: solo «Alarma», con los días de `ventanaDias`.
// Cada etiqueta: `alarma` (suena como alarma, hasta `dias` días) y/o `evento` (se muestra arriba como cuadro del evento en curso). Si tiene las dos, se ve como alarma (sin cuadro).
// Una categoría sin entrada se muestra como evento, como siempre.
const etiquetas = () => Array.isArray(ajustes.etiquetas) ? ajustes.etiquetas : [{ nombre: Puente.ETIQUETA, dias: ventanaMs() / 864e5, alarma: true, evento: false, antes: 60 }];
const normE = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// ¿Sale el evento de esa categoría como cuadro arriba, y desde cuántos minutos antes de empezar? (`antes`, por etiqueta; 60 por defecto)
function cuadroArriba(categoria) { const t = etiquetas().find(x => normE(x.nombre) === normE(categoria)); return t ? { cuadro: !!t.evento && !t.alarma, antes: t.antes, listada: true } : { cuadro: true, antes: 60, listada: false }; } // los de todo el día solo salen si su etiqueta está en la lista
function limpiarEtiquetas(l) {
  const vistas = new Set(), out = [];
  for (const e of Array.isArray(l) ? l : []) {
    const nombre = e && typeof e.nombre === 'string' ? e.nombre.trim().slice(0, 60) : '', dias = Math.round(Number(e && e.dias)), k = nombre.toLowerCase();
    if (!nombre || !Number.isFinite(dias) || vistas.has(k) || out.length >= 200) continue;
    vistas.add(k); out.push({ nombre, dias: Math.min(365, Math.max(1, dias)), alarma: !e || e.alarma !== false, evento: !!(e && e.evento), antes: Number.isFinite(Number(e && e.antes)) ? Math.min(43200, Math.max(0, Math.round(Number(e.antes)))) : 60 });
  }
  return out;
}
// Alarmas de Outlook que el usuario ha quitado de la lista (siguen en Outlook; aquí ya no suenan ni salen). Se guardan por id.
const ocultas = () => Array.isArray(ajustes.ocultas) ? ajustes.ocultas : [];
const estadoSync = () => ({ ventanaDias: ventanaMs() / 864e5, etiquetas: etiquetas(), ultimo: ultimoSync, trabajando: sincronizando });
const avisarSync = () => destinos().forEach(w => w.webContents.send('sync', estadoSync()));
function sincronizar() { // si ya hay una lectura en curso, devuelve esa misma
  if (HUMO) return Promise.resolve(estadoSync());
  if (promesaSync) return promesaSync;
  sincronizando = true; avisarSync();
  promesaSync = (async () => {
    try {
      const antes = JSON.stringify(categorias);
      const r = await Puente.sincronizar(app.getPath('appData'), Date.now(), categorias, ventanaMs(), etiquetas().filter(t => t.alarma)); // rellena `categorias` (título→categoría) si Outlook está abierto
      if (JSON.stringify(categorias) !== antes) escribir(path.join(DIR, 'categorias.json'), categorias);
      if (!r.ok) ultimoSync = { t: Date.now(), error: r.motivo };
      else {
        const previoOutlook = externas.filter(a => a.origen === 'outlook');
        externas = [...r.postit, ...(r.outlook || previoOutlook)].filter(a => !ocultas().includes(a.id)).map(a => descartadasExt.has(a.id) ? { ...a, descartada: true } : a);
        ultimoSync = { t: Date.now(), fuente: r.fuente, postit: r.postit.length, outlook: r.outlook ? r.outlook.length : null };
        enviar(); exportarOutlook(); // aprovecha el ciclo para reintentar lo pendiente
      }
    } catch (e) { log('sincronizar ' + (e && e.stack || e)); ultimoSync = { t: Date.now(), error: String(e && e.message || e) }; }
    finally { sincronizando = false; promesaSync = null; avisarSync(); }
    return estadoSync();
  })();
  return promesaSync;
}

// ---- Alarmas → Outlook: las alarmas a fecha y hora se crean como eventos (categoría «Alarma») en el calendario `calendarioOutlook` de ajustes.json (vacío: el primero que haya).
// Se edita y se borra allí cuando se edita o borra aquí. Si Outlook falla se reintenta a los 5 min. ponytail: un borrado que falla se da por hecho (el evento pudo borrarse ya a mano).
const PEND = () => path.join(DIR, 'outlook-pendiente.json');
function borrarEnOutlook(entryId) { pendientesBorrar.push(entryId); escribir(PEND(), pendientesBorrar); }
async function exportarOutlook() {
  if (HUMO || exportando || Date.now() < proximoIntentoOutlook) return;
  const ops = Salida.planificar(alarmas, pendientesBorrar, Date.now()); if (!ops.length) return;
  exportando = true;
  try {
    const res = await Salida.aplicar(ops, ajustes.calendarioOutlook || '');
    for (const r of res) {
      if (!r.ok) log('Outlook ' + r.id + ': ' + r.error);
      if (r.id.startsWith('borrar:')) { pendientesBorrar = pendientesBorrar.filter(e => e !== r.id.slice(7)); continue; }
      const a = alarmas.find(x => x.id === r.id); if (!a) continue;
      if (r.ok) { a.outlookId = r.entryId; a.outlookHuella = Salida.huella(a); }
      else if (a.outlookId) { delete a.outlookId; delete a.outlookHuella; } // el evento ya no existe en Outlook: se recreará
    }
    escribir(PEND(), pendientesBorrar); guardar();
  } catch (e) { log('Outlook no disponible: ' + e.message); proximoIntentoOutlook = Date.now() + 3e5; }
  finally { exportando = false; }
}

// ---- overlay: fichas split-flap arriba a la derecha, click-through
function colocarOverlay() {
  const a = (HUMO ? screen.getAllDisplays().find(d => d.bounds.x < 0) || screen.getPrimaryDisplay() : screen.getPrimaryDisplay()).workArea; // en la prueba de humo: pantalla de la izquierda
  overlay.setBounds({ x: a.x + a.width - W - 12, y: a.y + 12, width: W, height: Math.min(H, a.height - 24) });
}
function crearOverlay() {
  overlay = new BrowserWindow({
    width: W, height: H, frame: false, transparent: true, resizable: false, focusable: false, skipTaskbar: true,
    hasShadow: false, show: false, icon: ICONO,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true);
  colocarOverlay();
  overlay.loadFile(path.join(__dirname, 'overlay.html'), HUMO ? { query: { humo: '1' } } : {}); // en la prueba de humo no suena
  overlay.once('ready-to-show', () => overlay.showInactive());
}

// ---- IPC: el renderer solo puede pedir estas operaciones
const ok = rec => ({ ok: true, rec });
ipcMain.handle('alarmas:lista', () => todas());
ipcMain.handle('sync:estado', () => estadoSync());
ipcMain.handle('sync:ahora', () => HUMO ? { ...estadoSync(), ultimo: { t: Date.now(), error: 'desactivada en la prueba de humo' } } : sincronizar());
ipcMain.handle('sync:ventana', async (_, d) => {
  const n = Math.round(Number(d)); if (!Number.isFinite(n)) return estadoSync();
  ajustes.ventanaDias = Math.min(365, Math.max(1, n)); escribir(AJUSTES, ajustes);
  if (HUMO) return estadoSync();
  await promesaSync; return sincronizar(); // una lectura ya en marcha usaba la ventana vieja
});
ipcMain.handle('sync:etiquetas', async (_, l) => { // elegir qué etiquetas de Outlook suenan como alarma y hasta cuántos días por delante
  ajustes.etiquetas = limpiarEtiquetas(l); escribir(AJUSTES, ajustes); alEtiquetas();
  if (HUMO) return estadoSync();
  await promesaSync; return sincronizar();
});
ipcMain.handle('ajustes:formato', () => ajustes.formato === 'completo' ? 'completo' : 'adaptativo');
ipcMain.handle('alarmas:crear', (_, r) => {
  const v = T.validar(r, Date.now()); if (!v.ok) return v;
  const color = r && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : undefined; // color de la etiqueta de Outlook (alarmas puestas desde la Agenda)
  alarmas.push({ id: crypto.randomUUID(), creada: Date.now(), ...v.rec, ...(color && { color }) }); guardar(); exportarOutlook(); return ok();
});
ipcMain.handle('alarmas:editar', (_, id, r) => {
  const i = alarmas.findIndex(a => a.id === id); if (i < 0) return { ok: false, error: 'Ya no existe' };
  const v = T.validar(r, Date.now()); if (!v.ok) return v;
  const ant = alarmas[i], nueva = { id, creada: Date.now(), ...v.rec, ...(ant.color && { color: ant.color }) };
  if (ant.outlookId) { if (nueva.tipo === 'fecha') { nueva.outlookId = ant.outlookId; nueva.outlookHuella = ant.outlookHuella; } else borrarEnOutlook(ant.outlookId); }
  alarmas[i] = nueva; guardar(); exportarOutlook(); return ok();
});
ipcMain.handle('alarmas:ocultar', (_, id) => {
  if (typeof id !== 'string' || !id.startsWith('outlook:') || id.length > 400) return { ok: false, error: 'No se puede quitar' };
  if (!ocultas().includes(id)) { ajustes.ocultas = [...ocultas(), id].slice(-500); escribir(AJUSTES, ajustes); }
  externas = externas.filter(a => a.id !== id); enviar(); return ok();
});
ipcMain.handle('alarmas:borrar', (_, id) => {
  const a = alarmas.find(x => x.id === id); if (a && a.outlookId) borrarEnOutlook(a.outlookId);
  alarmas = alarmas.filter(x => x.id !== id); guardar(); exportarOutlook(); return ok();
});

// ---- API
// Entradas de la bandeja (se piden al construir el menú, así los radios reflejan el formato actual)
const menuItems = () => [
  { label: 'Nueva alarma (Ctrl+Alt+A)', click: () => alAbrir() },
  { label: 'Descartar la que suena (Ctrl+Alt+D)', click: descartar },
  { label: 'Sincronizar con Post-It y Outlook ahora', click: sincronizar },
  { label: 'Formato del tiempo', submenu: [['adaptativo', 'Adaptativo (2d 03h · 03h 15m · 14:32)'], ['completo', 'Completo (2d 03h 15m 08s)']].map(([v, l]) => (
    { label: l, type: 'radio', checked: ajustes.formato === v, click: () => { ajustes.formato = v; escribir(AJUSTES, ajustes); destinos().forEach(w => w.webContents.send('formato', v)); } })) },
];

function iniciar(o) { // llamar con la app lista; `ventanas()` devuelve las ventanas del panel que también reciben los envíos
  ({ app, log, HUMO } = o); if (o.ventanas) ventanas = o.ventanas; if (o.alAbrir) alAbrir = o.alAbrir; if (o.alEtiquetas) alEtiquetas = o.alEtiquetas;
  DIR = HUMO ? app.getPath('userData') : path.join(app.getPath('appData'), 'gestor-alarmas'); // los datos del Gestor, para no perder nada
  fs.mkdirSync(DIR, { recursive: true });
  DATOS = path.join(DIR, 'alarmas.json'); AJUSTES = path.join(DIR, 'ajustes.json');
  const aj = leer(AJUSTES, {}); // de ahí solo lo nuestro; iniciarConWindows se ignora
  ['formato', 'ventanaDias', 'calendarioOutlook'].forEach(k => { if (aj[k] !== undefined) ajustes[k] = aj[k]; });
  if (Array.isArray(aj.ocultas)) ajustes.ocultas = aj.ocultas.filter(x => typeof x === 'string');
  if (Array.isArray(aj.etiquetas)) ajustes.etiquetas = limpiarEtiquetas(aj.etiquetas);
  categorias = leer(path.join(DIR, 'categorias.json'), {});
  pendientesBorrar = leer(PEND(), []).filter(x => typeof x === 'string');
  alarmas = leer(DATOS, []).filter(a => a && a.id && T.fase(a, 0)); // descarta registros dañados
  crearOverlay();
  screen.on('display-metrics-changed', colocarOverlay);
  tic(); setInterval(tic, 1000);
  if (!HUMO) { sincronizar(); setInterval(sincronizar, 3e4); }
}

// Datos inventados para la prueba de humo: 9 propias + 3 externas
function datosHumo() {
  const ahora = Date.now(), m = 6e4, h = 36e5, d = 864e5;
  alarmas = [
    { id: 'a', tipo: 'cuenta', nombre: 'Reunión', objetivo: ahora + 25 * m, creada: ahora - 5 * m },
    { id: 'b', tipo: 'cuenta', nombre: 'Pizza', objetivo: ahora + 45e3, creada: ahora - 10 * m },
    { id: 'c', tipo: 'fecha', nombre: 'Examen', objetivo: ahora + 2 * d + 3 * h, creada: ahora - d },
    { id: 'd', tipo: 'fecha', nombre: 'Dentista', objetivo: ahora + 3 * h + 15 * m, creada: ahora - h },
    { id: 'e', tipo: 'crono', nombre: 'Estudio', inicio: ahora - 14 * m - 32e3 },
    { id: 'f', tipo: 'cuenta', nombre: 'Sonando', objetivo: ahora - 3e3, creada: ahora - 20 * m },
    { id: 'g', tipo: 'cuenta', nombre: 'Perdida', objetivo: ahora - 2 * h, creada: ahora - 3 * h },
    { id: 'h', tipo: 'cuenta', nombre: 'Extra', objetivo: ahora + 9 * h, creada: ahora },
    { id: 'i', tipo: 'recurrente', nombre: 'Gimnasio', dias: [1, 2, 3, 4, 5], hh: 7, mm: 30, objetivo: T.siguiente({ dias: [1, 2, 3, 4, 5], hh: 7, mm: 30 }, ahora) },
  ];
  externas = [ // lo que traería el puente
    { id: 'x1', tipo: 'fecha', nombre: 'Reunión equipo', objetivo: ahora + 30 * m, origen: 'outlook', aviso: 10 * m, avisada: true },
    { id: 'x2', tipo: 'fecha', nombre: 'Llamar a Ana', objetivo: ahora + 9 * m, origen: 'outlook', aviso: 10 * m, avisada: true },
    { id: 'x3', tipo: 'fecha', nombre: 'Recoger paquete', objetivo: ahora + 2 * h, origen: 'postit', silencioso: true, avisada: true },
  ];
  guardar();
}

module.exports = { cuadroArriba, iniciar, descartar, sonando, sincronizar, menuItems, datosHumo, overlay: () => overlay };
