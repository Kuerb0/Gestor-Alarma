const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, screen, nativeImage, shell, nativeTheme, systemPreferences, Notification, clipboard, desktopCapturer, powerMonitor } = require('electron');
const fs = require('fs'), path = require('path'), { spawn, execFile } = require('child_process');
const Act = require('./actualizar'); // versiones nuevas en GitHub Releases
const Salida = require('./outlook_salida'), limpiar = c => c && Array.isArray(c.agenda) ? { ...c, agenda: Salida.sinCopiasAlarma(c.agenda) } : c; // sin las copias «Alarma» que el Gestor exportó
const PosW = require('./posicion_widgets'); // posición/tamaño guardados de los widgets: la función pura que decide a dónde devolverlos
const Ocultos = require('./ocultos'); // estado compartido «widgets escondidos» (Ctrl+Alt+J) con Consumo y Bancos: fichero %LOCALAPPDATA%\Kuerb0\widgets-ocultos.json
const TemaFondo = require('./tema_fondo'); // tema de contraste automático de los widgets (mide el fondo del escritorio)
const Alarmas = require('./alarmas'); // motor del antiguo Gestor-Alarmas (overlay, datos, Post-It/Outlook)

const HUMO = process.argv.includes('--humo'); // prueba: userData temporal, datos inventados, captura y salir
const ICONO = path.join(__dirname, 'assets', 'icon.png');
const PW = 380; // ancho del panel
let widgetsOcultos = false; // Ctrl+Alt+J: los widgets del escritorio están escondidos (ventanas ocultas, no cerradas)
const widgets = new Map(); // widgets del escritorio abiertos: id -> BrowserWindow (varios por tipo; ver tipoDe)
let AJUSTES, ajustes = { fijado: false, iniciarConWindows: true, lugar: null }, win, raya, tray, anim = 0, acento = '#4a9eff';
nativeTheme.themeSource = HUMO && process.env.PANEL_TEMA === 'light' ? 'light' : 'system'; // el CSS sigue prefers-color-scheme
let diasAgenda = 7, cerradoDesde = 0, extraHumo = [], abierto = false, fuera = 0, ultCorreo = 0, leyendoCorreo = false, tSistema = null, bueno = {}, cache = {};

if (HUMO) app.setPath('userData', fs.mkdtempSync(path.join(require('os').tmpdir(), 'panel-humo-')));
const LOG = path.join(app.getPath('userData'), 'panel.log');
const log = m => { try { if (fs.existsSync(LOG) && fs.statSync(LOG).size > 2e5) fs.renameSync(LOG, LOG + '.old'); fs.appendFileSync(LOG, new Date().toISOString() + ' ' + m + '\n'); } catch {} };
process.on('uncaughtException', e => log('ERROR ' + (e && e.stack || e)));
process.on('unhandledRejection', e => log('RECHAZO ' + (e && e.stack || e)));
// ---- Virtualización por paquete MSIX (la app de escritorio de Claude): si arrancamos heredando su AppData virtual, nos relanzamos fuera con explorer.
// Lo escrito en %APPDATA%\panel iría a Packages\Claude_…\LocalCache y el resto de Windows no lo vería. Sin registrar nada aquí: escribir crearía la copia virtual.
const RELANZADO = process.argv.includes('--relanzado');
let relanzandoFuera = false;
if (process.platform === 'win32' && !HUMO) {
  try {
    const { detectarVirtualizacion, argumentosRelanzar } = require('./virtualizacion');
    const paquete = detectarVirtualizacion({ userData: app.getPath('userData'), localAppData: process.env.LOCALAPPDATA });
    if (!paquete && RELANZADO) {
      log('relanzado fuera del paquete de Claude (estaba virtualizado)');
    } else if (paquete && RELANZADO) {
      log('sigue virtualizado por un paquete (' + paquete + ') aunque viene relanzado: se continúa sin relanzar');
    } else if (paquete) {
      const comillas = a => (/[\s"]/.test(a) ? '"' + a.replace(/"/g, '\\"') + '"' : a);
      const lnk = path.join(require('os').tmpdir(), 'gestor-alarma-relanzar.lnk');
      const ok = shell.writeShortcutLink(lnk, 'create', { target: process.execPath, args: argumentosRelanzar(process.argv).map(comillas).join(' '), cwd: __dirname });
      if (!ok) throw new Error('no se pudo crear el acceso directo de relanzado');
      spawn('explorer.exe', [lnk], { detached: true, stdio: 'ignore' }).unref();
      relanzandoFuera = true;
      app.exit(0);
    }
  } catch (e) { log('no se pudo relanzar fuera del paquete: ' + (e && e.message)); }
}
if (!relanzandoFuera) {
  log('inicio pid=' + process.pid + ' args=' + process.argv.slice(1).join(' '));
  app.on('quit', (_, c) => log('salida código=' + c));
}
// Instancia única. La copia relanzada reintenta ~5 s: la instancia anterior puede estar terminando de salir.
const bloqueoListo = relanzandoFuera ? Promise.resolve(false) : new Promise(res => {
  if (app.requestSingleInstanceLock()) return res(true);
  if (!RELANZADO) { log('ya hay otra instancia: salgo'); app.quit(); return res(false); }
  let n = 0;
  const t = setInterval(() => {
    if (app.requestSingleInstanceLock()) { clearInterval(t); res(true); }
    else if (++n >= 10) { clearInterval(t); log('ya hay otra instancia (tras reintentar): salgo'); app.quit(); res(false); }
  }, 500);
});
app.on('second-instance', () => abrir());
app.on('window-all-closed', () => {}); // vive en la bandeja

// fuentes: protegidas para que la app arranque aunque falte alguna
const cargar = n => { try { return require('./' + n); } catch (e) { log('sin módulo ' + n + ': ' + e.message); return null; } };
const Correo = HUMO ? null : cargar('correo'), Meteo = HUMO ? null : cargar('meteo'), Sistema = HUMO ? null : cargar('sistema');

const guardarAjustes = () => { try { fs.writeFileSync(AJUSTES, JSON.stringify(ajustes)); } catch (e) { log('ajustes ' + e.message); } };
const enviar = (canal, dato) => { cache[canal] = dato; win && !win.isDestroyed() && win.webContents.send(canal, dato); widgets.forEach(w => !w.isDestroyed() && w.webContents.send(canal, dato)); if (canal === 'correo') agendaAlOverlay(); };
// agenda para el overlay: pinta como rectángulo el evento en curso (con hora) y colorea las alarmas
const eventosOverlay = () => ((cache.correo && cache.correo.agenda) || []).map(e => ({ titulo: e.titulo, inicio: e.inicio, fin: e.fin, todoDia: e.todoDia, color: e.color, ...Alarmas.cuadroArriba(e.categoria) })); // también los de todo el día: dan color a las alarmas del mismo nombre
function agendaAlOverlay() { const ov = Alarmas.overlay(); if (ov && !ov.isDestroyed()) ov.webContents.send('agenda', eventosOverlay()); }
ipcMain.handle('agenda:lista', eventosOverlay);

// ---- no molestar: silencia los pitidos del overlay (las tarjetas siguen viéndose). Solo en memoria: al reiniciar se quita.
let silencioHasta = 0;
const silenciando = () => Date.now() < silencioHasta;
const horaSilencio = () => new Date(silencioHasta).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
function silenciar(minutos) {
  silencioHasta = minutos ? Date.now() + minutos * 6e4 : 0;
  const ov = Alarmas.overlay(); if (ov && !ov.isDestroyed()) ov.webContents.send('silencio', silencioHasta);
  tray && tray.setContextMenu(menu());
}
ipcMain.handle('silencio:hasta', () => silencioHasta);
// ---- seguimiento de uso (uso.js): la pausa solo vive en memoria; al reiniciar vuelve a recoger
let tPausaUso = null;
function pausarUso(hasta) {
  uso && uso.pausar(hasta); tray && tray.setContextMenu(menu());
  clearTimeout(tPausaUso); if (hasta && Number.isFinite(hasta)) tPausaUso = setTimeout(() => tray && tray.setContextMenu(menu()), Math.max(0, hasta - Date.now()) + 1e3); // al caducar, el menú deja de decir «en pausa»
}
// ---- Ctrl+Alt+H: oculta o enseña las fichas de alarmas y eventos (el overlay). Solo en memoria: al reiniciar vuelven a verse.
// Si con ellas ocultas empieza a sonar una alarma nueva, vuelven a salir solas (lo que ya sonaba al ocultarlas no cuenta).
let fichasOcultas = false, sonabanAlOcultar = new Set();
function verFichas() { const ov = Alarmas.overlay(); if (ov && !ov.isDestroyed()) completa || fichasOcultas ? ov.hide() : ov.showInactive(); }
function ocultarFichas(v = !fichasOcultas) {
  fichasOcultas = v; sonabanAlOcultar = new Set(v ? Alarmas.sonando() : []);
  verFichas(); tray && tray.setContextMenu(menu());
}
function vigilarFichas() { if (fichasOcultas && Alarmas.sonando().some(id => !sonabanAlOcultar.has(id))) ocultarFichas(false); }
const estado = () => enviar('estado', { abierto, fijado: ajustes.fijado });

// ---- lecturas (si falla, se conserva el último dato bueno y se marca `obsoleto`)
const conservar = (canal, r) => { if (r && r.ok) { bueno[canal] = r; if (canal === 'correo') guardarCacheCorreo(r); } enviar(canal, r && r.ok ? r : bueno[canal] ? { ...bueno[canal], obsoleto: r && r.motivo || 'error' } : r || { ok: false, motivo: 'error' }); };
// Los últimos datos de Outlook se guardan en un texto (correo-cache.json, en los datos de la app): al arrancar se ven al instante y siguen ahí aunque Outlook esté cerrado o tarde en abrir.
const CACHE_CORREO = () => path.join(app.getPath('userData'), 'correo-cache.json');
let cacheCorreoTxt = '';
function guardarCacheCorreo(r) {
  if (HUMO) return;
  try { const d = JSON.stringify(r); if (d === cacheCorreoTxt) return; cacheCorreoTxt = d; fs.writeFile(CACHE_CORREO(), JSON.stringify({ guardado: Date.now(), datos: r }), e => e && log('caché correo ' + e.message)); } catch (e) { log('caché correo ' + e.message); }
}
function cargarCacheCorreo() {
  if (!Correo || HUMO) return;
  try { const c = limpiar(Correo.desdeCache(fs.readFileSync(CACHE_CORREO(), 'utf8'))); if (c && !bueno.correo) { bueno.correo = c; enviar('correo', { ...c, dias: diasAgenda }); } } catch { /* sin caché todavía */ }
}
// Outlook clásico: si no está abierto se abre minimizado al arrancar la app y se espera a que acepte conexiones, para que la primera lectura no falle (ajustes.abrirOutlook = false lo desactiva).
const outlookAbierto = () => new Promise(res => execFile('tasklist', ['/FI', 'IMAGENAME eq OUTLOOK.EXE', '/NH'], { windowsHide: true, timeout: 8000 }, (e, out) => res(e ? true : /OUTLOOK\.EXE/i.test(out || '')))); // si tasklist falla se da por abierto (no se hace nada)
let abriendoOutlook = false;
async function asegurarOutlook() {
  if (HUMO || !Correo || ajustes.abrirOutlook === false || abriendoOutlook) return;
  abriendoOutlook = true; // mientras tanto leerCorreo no lee: se ve la caché
  try {
    if (await outlookAbierto()) return;
    log('Outlook cerrado: se abre');
    // cwd = carpeta de usuario: Outlook se queda abierto y heredaría la carpeta de la app como directorio de trabajo, bloqueándola (el instalador no podría borrarla)
    spawn('cmd', ['/c', 'start', '/min', '', 'outlook'], { detached: true, windowsHide: true, stdio: 'ignore', cwd: require('os').homedir() }).unref();
    for (let i = 0; i < 20 && !(await outlookAbierto()); i++) await new Promise(r => setTimeout(r, 3000)); // hasta 1 min a que aparezca el proceso
    await new Promise(r => setTimeout(r, 8000)); // y unos segundos más hasta que acepta conexiones
  } catch (e) { log('abrir Outlook ' + e.message); }
  finally { abriendoOutlook = false; leerCorreo(); }
}
let pendienteCorreo = false;
async function leerCorreo() { // nunca dos lecturas de Outlook a la vez; si llega otra petición con una en curso, se encadena al acabar
  if (!Correo || abriendoOutlook) return;
  if (leyendoCorreo) { pendienteCorreo = true; return; }
  leyendoCorreo = true;
  try {
    const r = await Correo.leer({ dias: Math.max(diasAgenda, 14) }), c = r.ok ? limpiar({ ...r, dias: diasAgenda }) : r; conservar('correo', c);
    if (c.ok && Array.isArray(c.agenda)) try { Alarmas.seguirOutlook(c.agenda); } catch (e) { log('seguir Outlook ' + (e && e.stack || e)); } // las alarmas ligadas a un evento siguen sus cambios en Outlook
  } // se leen ≥14 días (el overlay colorea alarmas lejanas); la pestaña pinta solo `dias`
  catch (e) { log('correo ' + e.message); conservar('correo', { ok: false, motivo: 'error' }); }
  finally { leyendoCorreo = false; ultCorreo = Date.now(); if (pendienteCorreo) { pendienteCorreo = false; leerCorreo(); } }
}
// Ciudades del tiempo: ajustes.lugares (hasta 6). `meteo` viaja como { lista: [{ clave, nombre, r }] } con el resultado de cada una.
const MAX_LUGARES = 6;
const claveLugar = l => `${l.nombre}|${Number(l.lat).toFixed(2)}|${Number(l.lon).toFixed(2)}`;
const lugares = () => Array.isArray(ajustes.lugares) ? ajustes.lugares : ajustes.lugar ? [ajustes.lugar] : []; // `lugar` = formato anterior (una sola ciudad)
const lugarValido = l => l && typeof l.nombre === 'string' && l.nombre.trim() && Number.isFinite(l.lat) && Number.isFinite(l.lon) && Math.abs(l.lat) <= 90 && Math.abs(l.lon) <= 180;
const limpiarLugar = l => ({ nombre: l.nombre.trim().slice(0, 60), lat: Number(l.lat.toFixed(4)), lon: Number(l.lon.toFixed(4)) });
let leyendoMeteo = false;
async function leerMeteo() {
  if (!Meteo || leyendoMeteo) return;
  leyendoMeteo = true;
  try {
    if (!lugares().length) { // primera vez: ciudad por la IP
      const r0 = await Meteo.leer(undefined);
      if (!r0.ok) { enviar('meteo', { lista: [{ clave: '?', nombre: '', r: r0 }] }); return; }
      ajustes.lugares = [r0.lugar]; delete ajustes.lugar; guardarAjustes();
    }
    const ls = lugares();
    const rs = await Promise.all(ls.map(l => Meteo.leer(l)));
    enviar('meteo', { lista: ls.map((l, i) => {
      const k = claveLugar(l), r = rs[i];
      if (r && r.ok) bueno['meteo:' + k] = r;
      return { clave: k, nombre: l.nombre, r: r && r.ok ? r : bueno['meteo:' + k] ? { ...bueno['meteo:' + k], obsoleto: r && r.motivo || 'error' } : r || { ok: false, motivo: 'error' } };
    }) });
  } catch (e) { log('meteo ' + e.message); }
  finally { leyendoMeteo = false; }
}
async function leerSistema() { if (!Sistema) return; try { enviar('sistema', await Sistema.leer()); } catch (e) { log('sistema ' + e.message); } }
const actualizar = () => { leerCorreo(); leerMeteo(); if (abierto || abiertosDe('sistema').length) leerSistema(); };
function vigilarSistema() { // CPU/RAM/disco cada 2 s solo si alguien los está mirando: el panel abierto o el widget de Sistema
  clearInterval(tSistema); tSistema = null;
  if (abierto || abiertosDe('sistema').length) { leerSistema(); tSistema = setInterval(leerSistema, 2000); }
}

// ---- ventana: acrílico nativo (cubre toda la ventana), así que escondida se oculta; la «raya» del borde es otra ventanita aparte
const pantallaHumo = () => screen.getAllDisplays().find(d => d.bounds.x < 0) || screen.getPrimaryDisplay(); // la prueba de humo usa la pantalla de la izquierda (no la principal)
const area = () => (HUMO ? pantallaHumo() : screen.getPrimaryDisplay()).workArea;
const xAbierto = () => { const a = area(); return a.x + a.width - PW; };
function crearVentana() {
  const a = area();
  win = new BrowserWindow({
    x: a.x + a.width, y: a.y, width: PW, height: a.height, frame: false, backgroundMaterial: 'acrylic', backgroundColor: '#00000000', roundedCorners: false, resizable: false, skipTaskbar: true, focusable: true, show: false, icon: ICONO,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'pop-up-menu');
  win.loadFile('panel.html');
  win.webContents.on('did-finish-load', () => Object.entries(cache).forEach(([c, d]) => win.webContents.send(c, d)));
}
const rayaUrl = () => 'data:text/html;charset=utf-8,' + encodeURIComponent(`<body style="margin:0;background:transparent;overflow:hidden"><div style="height:100vh;border-radius:2px 0 0 2px;background:${acento};opacity:.6"></div>`);
function crearRaya() { // 3 px × tercio central del borde derecho: transparente, click-through, sin foco
  raya = new BrowserWindow({ width: 3, height: 100, frame: false, transparent: true, resizable: false, skipTaskbar: true, focusable: false, hasShadow: false, show: false, thickFrame: false, webPreferences: { sandbox: true, backgroundThrottling: false } });
  raya.setAlwaysOnTop(true, 'pop-up-menu'); raya.setIgnoreMouseEvents(true);
  colocar(); raya.loadURL(rayaUrl());
  raya.once('ready-to-show', () => { if (!abierto) raya.showInactive(); });
}
function colocar() {
  const a = area();
  if (raya && !raya.isDestroyed()) raya.setBounds({ x: a.x + a.width - 3, y: a.y + Math.round(a.height / 3), width: 3, height: Math.round(a.height / 3) });
  if (abierto) win.setBounds({ x: xAbierto(), y: a.y, width: PW, height: a.height });
}
function deslizar(v) { // setBounds animado ~180 ms, ease-out; una animación nueva anula la anterior
  const id = ++anim, a = area(), N = 13, fuera = a.x + a.width, x0 = win.isVisible() ? win.getBounds().x : fuera, x1 = v ? xAbierto() : fuera;
  win.setBounds({ x: x0, y: a.y, width: PW, height: a.height });
  if (v && !win.isVisible()) win.showInactive();
  let i = 0;
  (function paso() {
    if (id !== anim || win.isDestroyed()) return;
    i++; const t = 1 - Math.pow(1 - i / N, 3);
    win.setBounds({ x: Math.round(x0 + (x1 - x0) * t), y: a.y, width: PW, height: a.height });
    if (i < N) setTimeout(paso, 14); else if (!v) win.hide();
  })();
}
function poner(v) { // abre/cierra de verdad
  if (v === abierto) return; abierto = v; fuera = 0;
  deslizar(v);
  if (raya && !raya.isDestroyed()) v ? raya.hide() : raya.showInactive();
  estado();
  if (!v) cerradoDesde = Date.now(); else if (diasAgenda > 7 && Date.now() - cerradoDesde > 6e5) { diasAgenda = 7; if (!HUMO) leerCorreo(); } // tras 10 min cerrado, la agenda vuelve a 7 días
  vigilarSistema();
  if (v && !HUMO && Date.now() - ultCorreo > 15e3) leerCorreo();
}
// tono de Windows: el acento va al panel y al overlay (el claro/oscuro lo resuelve el CSS con prefers-color-scheme)
function enviarTema() {
  try { const c = systemPreferences.getAccentColor(); if (/^[0-9a-f]{8}$/i.test(c)) acento = '#' + c.slice(0, 6); } catch {}
  enviar('tema', { acento });
  const ov = Alarmas.overlay(); if (ov && !ov.isDestroyed()) ov.webContents.send('tema', { acento });
  if (raya && !raya.isDestroyed()) raya.loadURL(rayaUrl());
}
const abrir = () => poner(true);
function cerrar() { ajustes.fijado = false; guardarAjustes(); poner(false); estado(); }
// Ctrl+Alt+A: abre fijado en la pestaña Alarmas (con foco); si ya está en Alarmas, cierra
const pestanaActual = () => win.webContents.executeJavaScript(`document.querySelector('[data-tab][aria-selected="true"]')?.dataset.tab`).catch(() => null);
function abrirAlarmas() { fijar(true); win.focus(); win.webContents.send('pestana', 'alarmas'); Alarmas.sincronizar(); }
function nuevoEvento() { fijar(true); win.focus(); win.webContents.send('nuevo-evento'); } // Alt+C: abre la Agenda con el formulario de nuevo evento listo para escribir
async function atajoAlarmas() { if (abierto && await pestanaActual() === 'alarmas') cerrar(); else abrirAlarmas(); }
function fijar(b) { ajustes.fijado = !!b; guardarAjustes(); if (b) abrir(); estado(); tray && tray.setContextMenu(menu()); }
function alternar() { // Ctrl+Alt+P: abre fijado / cierra
  if (abierto) cerrar(); else fijar(true);
}

// sondeo del cursor cada 80 ms: borde derecho -> abre; 700 ms fuera -> cierra (si no está fijado)
function sondear() {
  if (HUMO) return;
  const p = screen.getCursorScreenPoint(), a = area(), enY = p.y >= a.y && p.y < a.y + a.height;
  if (!abierto) { if (!completa && enY && p.x >= a.x + a.width - 2) abrir(); return; }
  if (ajustes.fijado || (enY && p.x >= a.x + a.width - PW)) { fuera = 0; return; }
  if (!fuera) fuera = Date.now(); else if (Date.now() - fuera >= 700) poner(false);
}

// ---- pantalla completa (juego, vídeo, presentación): ni la rayita ni las fichas, y el borde no abre el panel (los atajos sí)
let completa = false, vigia = null, uso = null;
function aplicarCompleta() {
  if (completa && abierto && !ajustes.fijado) poner(false);
  if (raya && !raya.isDestroyed()) completa || abierto ? raya.hide() : raya.showInactive();
  verFichas();
  widgets.forEach(w => !w.isDestroyed() && (completa || widgetsOcultos ? w.hide() : w.showInactive())); // al salir de pantalla completa se vuelve a medir el fondo y se devuelven a su sitio (los juegos cambian la resolución)
  if (!completa) { medirTodos(); programarRecolocar(); }
  pintarAct();
}
function vigilarCompleta() {
  try {
    vigia = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'pantalla_completa.ps1'), '-Excluir', String(process.pid), '-Propio', process.execPath], { windowsHide: true });
    let resto = ''; // el vigía escribe por líneas: «0»/«1» (pantalla completa) y «U {json}» (uso de apps); un trozo puede partir una línea
    vigia.stdout.setEncoding('utf8');
    vigia.stdout.on('data', d => {
      const ls = (resto + d).split('\n'); resto = ls.pop();
      for (const l0 of ls) {
        const l = l0.trim();
        if (l.startsWith('U ')) { try { uso && uso.entrada(l.slice(2), Date.now()); } catch (e) { log('uso ' + e.message); } continue; }
        if (l !== '0' && l !== '1') continue;
        const v = l === '1'; if (v !== completa) { completa = v; log('pantalla completa ' + v); aplicarCompleta(); }
      }
    });
    vigia.on('exit', c => { log('vigía de pantalla completa salió ' + c); vigia = null; if (completa) { completa = false; aplicarCompleta(); } });
  } catch (e) { log('vigía ' + e.message); }
}
app.on('will-quit', () => { try { uso && uso.cerrar(); } catch {} try { vigia && vigia.kill(); } catch {} });

// ---- widgets del escritorio: la gráfica del Tiempo, Sistema, Agenda o Notas en su propia ventanita transparente, arrastrable y sin ser «siempre encima»
// (se queda con las demás ventanas). Puede haber varios del mismo tipo (también duplicados): cada uno tiene su id y su entrada en ajustes.widgets[id]
// ({ tipo, cfg, estilo, x, y, ancho, alto, abierto }). El primero de cada tipo usa el propio tipo como id (así siguen valiendo los ajustes de antes).
const WIDGETS = { tiempo: { ancho: { p: 300, m: 380, g: 520 }, nombre: 'Tiempo' }, sistema: { ancho: { p: 260, m: 320, g: 420 }, nombre: 'Sistema' }, agenda: { ancho: { p: 280, m: 340, g: 440 }, nombre: 'Agenda' }, notas: { ancho: { p: 260, m: 320, g: 420 }, nombre: 'Notas' }, alarmas: { ancho: { p: 280, m: 340, g: 440 }, nombre: 'Alarmas' } };
const CFG_BOOL = { tiempo: ['ciu', 'graf', 'ico', 'lluvia', 'tmp', 'res', 'det', 'dias'], sistema: ['cpu', 'ram', 'disco', 'disp', 'bat'], agenda: ['todo', 'lugar'], notas: ['fecha', 'nueva'], alarmas: ['crear', 'externas'] }; // qué se puede mostrar/ocultar en cada widget
const WMIN = { ancho: 160, alto: 80 }, WMAX = 1400; // límites del tamaño a mano
const gw = id => (ajustes.widgets && ajustes.widgets[id]) || {};
const ponGw = (id, v) => { ajustes.widgets = { ...ajustes.widgets, [id]: { ...gw(id), ...v } }; };
// Tema de contraste (ajustes.widgets.<id>.tema): auto | claro | oscuro | claroscuro | velado | contraste. En 'auto', medirFondo() mide el escritorio detrás del widget y decide (temaEf: id -> último tema efectivo).
const TEMAS = ['auto', 'claro', 'oscuro', 'claroscuro', 'velado', 'contraste'], temaEf = new Map(), medirT = new Map();
const temaDe = id => TEMAS.includes(gw(id).tema) ? gw(id).tema : 'auto';
const efectivoDe = id => { const t = temaDe(id); return t === 'auto' ? temaEf.get(id) || 'claroscuro' : t; }; // sin medir todavía: claroscuro, el más seguro
const enviarTemaW = id => { const w = widgets.get(id); w && !w.isDestroyed() && w.webContents.send('widget:tema', { tema: temaDe(id), efectivo: efectivoDe(id) }); };
const tipoDe = id => { const t = gw(id).tipo || id; return WIDGETS[t] ? t : null; };
const abiertosDe = tipo => [...widgets.keys()].filter(id => tipoDe(id) === tipo);
function cfgWidget(id, c = gw(id).cfg) { // configuración saneada: tamaño (p/m/g) + interruptores (todos activos por defecto)
  const tipo = tipoDe(id);
  c = c && typeof c === 'object' ? c : {};
  const n = { tam: ['p', 'm', 'g'].includes(c.tam) ? c.tam : 'm' };
  CFG_BOOL[tipo].forEach(k => n[k] = c[k] !== false);
  if (tipo === 'tiempo') { n.ndias = [3, 5, 7].includes(c.ndias) ? c.ndias : 5; if (typeof c.ciudad === 'string' && c.ciudad) n.ciudad = c.ciudad.slice(0, 120); } // cada widget del Tiempo recuerda su ciudad
  if (tipo === 'alarmas') n.n = [3, 5, 8].includes(c.n) ? c.n : 5; // cuántas alarmas se enseñan
  if (tipo === 'agenda') { n.modo = c.modo === 'horas' ? 'horas' : 'eventos'; n.ndias = [1, 3, 7].includes(c.ndias) ? c.ndias : 3; }
  { const d0 = tipo === 'agenda' ? 8 : 0, d1 = tipo === 'agenda' ? 20 : 24; if (tipo === 'tiempo' || tipo === 'agenda') { n.h0 = Number.isInteger(c.h0) ? Math.max(0, Math.min(22, c.h0)) : d0; n.h1 = Math.max(n.h0 + 2, Math.min(24, Number.isInteger(c.h1) ? c.h1 : d1)); } } // rango de horas editable: eje del gráfico del Tiempo / línea de tiempo de la Agenda
  return n;
}
// Tamaño a mano (arrastrando bordes o esquinas): ancho/alto guardados en ajustes.widgets[id]; sin ellos, el ancho sale del tamaño p/m/g y el alto del contenido
const anchoWidget = id => { const g = gw(id); return Number.isFinite(g.ancho) ? Math.round(Math.max(WMIN.ancho, Math.min(WMAX, g.ancho))) : WIDGETS[tipoDe(id)].ancho[cfgWidget(id).tam]; };
const altoFijo = id => { const g = gw(id); return Number.isFinite(g.alto) ? Math.round(Math.max(WMIN.alto, Math.min(WMAX, g.alto))) : 0; };
const sinTamanoManual = id => { const { ancho, alto, ...resto } = gw(id); ajustes.widgets = { ...ajustes.widgets, [id]: resto }; };
const pintarWidgets = () => { const ids = [...widgets.keys()]; enviar('widgets', ids.map(tipoDe)); enviar('widgetsCfg', ids.map(id => ({ tipo: tipoDe(id), cfg: cfgWidget(id), tema: efectivoDe(id) }))); tray && tray.setContextMenu(menu()); };
const areasPantallas = () => screen.getAllDisplays().map(d => d.workArea);
function posicionWidget(id) { // la guardada si sigue dentro de alguna pantalla; si no, arriba a la izquierda del monitor principal (en cascada si ya hay otros del mismo tipo)
  const g = gw(id), a = area(), tipo = tipoDe(id), w = anchoWidget(id), cascada = abiertosDe(tipo).filter(x => x !== id).length * 30;
  if (PosW.posicionValida(g, areasPantallas())) return { x: Math.round(g.x), y: Math.round(g.y) };
  return { x: a.x + 40 + Object.keys(WIDGETS).indexOf(tipo) * (w + 20) + cascada, y: a.y + 60 + cascada };
}
// Lo guardado manda: la posición solo se guarda cuando el usuario suelta el widget (widget:mover / widget:tam con fin) o al duplicar; abrir y cerrar solo tocan «abierto».
function guardarPosWidget(id) { const w = widgets.get(id); if (!w || w.isDestroyed()) return; const b = w.getBounds(); ponGw(id, { x: b.x, y: b.y }); guardarAjustes(); }
// Devuelve cada widget vivo a su posición y tamaño guardados (Windows los mueve/reescala al cambiar pantallas, resolución o al despertar). No toca ajustes.
// ---- Ctrl+Alt+J: esconde o devuelve los widgets del escritorio a la vez que los de Consumo y Bancos (lo que se comparte es el estado, en un fichero)
function aplicarOcultos(v) { // poner (no alternar): idempotente
  widgetsOcultos = !!v;
  widgets.forEach(w => !w.isDestroyed() && (completa || widgetsOcultos ? w.hide() : w.showInactive()));
  if (!widgetsOcultos && !completa) medirTodos();
  tray && tray.setContextMenu(menu());
}
function ponerOcultos(v) { Ocultos.escribir(v, 'gestoralarma'); aplicarOcultos(v); } // escribe el estado compartido y lo aplica
function iniciarOcultos() {
  if (HUMO) Ocultos.fijarRuta(path.join(app.getPath('userData'), 'widgets-ocultos.json')); // la prueba no toca el fichero real
  Ocultos.vigilar(v => { if (v !== widgetsOcultos) aplicarOcultos(v); }, 300);
  if (HUMO) return;
  let avisado = false;
  const registrar = () => {
    if (globalShortcut.register('CommandOrControl+Alt+J', () => ponerOcultos(!Ocultos.leer()))) return;
    if (!avisado) { avisado = true; log('Ctrl+Alt+J lo tiene otra app: se reintenta cada 5 s (el estado se sigue compartiendo por fichero)'); }
    setTimeout(registrar, 5000);
  };
  registrar();
}
function recolocarWidgets(forzar) {
  if (HUMO && !forzar) return;
  const areas = areasPantallas();
  widgets.forEach((w, id) => {
    if (w.isDestroyed() || origenMov.has(id) || anclas.has(id)) return; // no mientras el usuario lo arrastra o redimensiona
    const g = gw(id), d = PosW.destinoWidget({ x: g.x, y: g.y, ancho: anchoWidget(id), alto: altoFijo(id) || undefined }, w.getBounds(), areas, anchoWidget(id));
    if (d) { log('widget «' + id + '» recolocado: ' + JSON.stringify(w.getBounds()) + ' -> ' + JSON.stringify(d)); w.setBounds(d); medirLuego(id); }
  });
}
let recolocarT1 = null, recolocarT2 = null;
function programarRecolocar() { // tras un cambio de pantallas o de sesión: Windows tarda en asentarse, así que a los ~1,5 s y otra vez a los ~5 s
  clearTimeout(recolocarT1); clearTimeout(recolocarT2);
  recolocarT1 = setTimeout(recolocarWidgets, 1500); recolocarT2 = setTimeout(recolocarWidgets, 5000);
}
const cargarWidget = (w, id) => w.loadFile('widget.html', { query: { tipo: tipoDe(id), cfg: JSON.stringify(cfgWidget(id)), estilo: gw(id).estilo || 'consumo', tema: temaDe(id), ef: efectivoDe(id), fijo: altoFijo(id) ? '1' : '' } });
function ponerWidget(id, v, c) { // abre (v) o quita el widget `id`; `c` (opcional): configuración que se aplica al abrirlo; si ya está abierto se recarga con ella
  if (!tipoDe(id)) return;
  const w0 = widgets.get(id);
  if (v && c && typeof c === 'object') {
    ponGw(id, { cfg: cfgWidget(id, c) }); guardarAjustes();
    if (w0 && !w0.isDestroyed()) { const b = w0.getBounds(); w0.setBounds({ x: b.x, y: b.y, width: anchoWidget(id), height: b.height }); cargarWidget(w0, id); pintarWidgets(); return; }
  }
  if (!v) {
    if (!w0) return; ponGw(id, { abierto: false }); guardarAjustes(); widgets.delete(id); if (!w0.isDestroyed()) w0.destroy();
    if (id !== tipoDe(id)) { const { [id]: _, ...resto } = ajustes.widgets; ajustes.widgets = resto; guardarAjustes(); } // las copias no dejan rastro; el primero de cada tipo recuerda posición y ajustes
    clearTimeout(medirT.get(id)); medirT.delete(id); temaEf.delete(id);
    pintarWidgets(); vigilarSistema(); return;
  }
  if (w0 && !w0.isDestroyed()) return;
  const p = HUMO ? { x: -30000, y: -30000 } : posicionWidget(id); // en la prueba de humo los widgets nacen fuera de pantalla: no se ven ni mueven los de verdad
  const w = new BrowserWindow({ ...p, width: anchoWidget(id), height: altoFijo(id) || 200, frame: false, transparent: true, hasShadow: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true, show: false, icon: ICONO,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
  widgets.set(id, w);
  cargarWidget(w, id);
  w.webContents.on('did-finish-load', () => { ['tema', 'meteo', 'sistema', 'correo', 'notas'].forEach(c => cache[c] !== undefined && w.webContents.send(c, cache[c])); enviarTemaW(id); medirLuego(id, 900); });
  w.once('ready-to-show', () => { if (!completa && !widgetsOcultos) w.showInactive(); });
  w.on('moved', () => { if (widgets.get(id) === w) medirLuego(id); }); // no se guarda: puede haberla movido Windows; el arrastre del usuario se guarda en widget:mover
  w.on('resized', () => { if (widgets.get(id) === w) medirLuego(id); });
  w.on('closed', () => { if (widgets.get(id) === w) { widgets.delete(id); pintarWidgets(); } });
  const g = gw(id); // al abrir solo se marca «abierto»; la posición solo si no había ninguna guardada (una guardada no válida no se pisa: recolocar la llevará a su sitio)
  ponGw(id, Number.isFinite(g.x) && Number.isFinite(g.y) || HUMO ? { abierto: true } : { abierto: true, x: p.x, y: p.y }); guardarAjustes();
  pintarWidgets(); vigilarSistema();
}
function nuevoWidget(tipo, c, desde) { // añade otro widget de `tipo`; `desde`: id del que se duplica (copia ajustes, estilo y tamaño, y sale desplazado)
  if (!WIDGETS[tipo]) return;
  if (widgetsOcultos) ponerOcultos(false); // sacar uno a mano con los widgets escondidos: vuelven todos (aquí y en las otras apps)
  const id = !widgets.has(tipo) ? tipo : tipo + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  if (id !== tipo) ajustes.widgets = { ...ajustes.widgets, [id]: { tipo } };
  if (desde && widgets.has(desde)) { const o = gw(desde), b = widgets.get(desde).getBounds(); ponGw(id, { cfg: o.cfg, estilo: o.estilo, tema: o.tema, ancho: o.ancho, alto: o.alto, x: b.x + 28, y: b.y + 28 }); }
  ponerWidget(id, true, c);
  return id;
}
const idWidget = wc => [...widgets].find(([, w]) => !w.isDestroyed() && w.webContents === wc)?.[0];
ipcMain.on('widget:poner', (_, tipo, v, c) => v === true ? nuevoWidget(tipo, c) : abiertosDe(tipo).forEach(id => ponerWidget(id, false))); // desde el panel: añadir otro / quitar los de ese tipo
ipcMain.on('widget:duplicar', e => { const id = idWidget(e.sender); if (id) nuevoWidget(tipoDe(id), undefined, id); });
ipcMain.on('widget:estilo', (e, est) => { const id = idWidget(e.sender); if (!id || !['consumo', 'cristal', 'fino', 'flotante', 'solido'].includes(est)) return; ponGw(id, { estilo: est }); guardarAjustes(); });
ipcMain.on('widget:tema', (e, t) => {
  const id = idWidget(e.sender); if (!id || !TEMAS.includes(t)) return;
  ponGw(id, { tema: t }); guardarAjustes(); enviarTemaW(id); pintarWidgets();
  if (t === 'auto') medirLuego(id, 150); // al volver a automático, se mide ya
});
ipcMain.on('widget:cfg', (e, c) => {
  const id = idWidget(e.sender); if (!id || !c || typeof c !== 'object') return;
  const tamAntes = cfgWidget(id).tam;
  ponGw(id, { cfg: cfgWidget(id, c) });
  if (cfgWidget(id).tam !== tamAntes) sinTamanoManual(id); // elegir Pequeño/Mediano/Grande vuelve al tamaño automático
  guardarAjustes();
  const w = widgets.get(id), b = w.getBounds(); w.setBounds({ x: b.x, y: b.y, width: anchoWidget(id), height: b.height }); pintarWidgets();
});
// Tamaño a mano. Con `ancla` (arrastre de un borde o esquina: 'n','s','e','w' y combinaciones) llegan dx/dy en px desde que se pulsó, y se aplican a los límites
// que tenía la ventana entonces: con 'w'/'n' el borde contrario se queda quieto (con el escalado de pantalla, innerWidth no coincide con getBounds: no se usa).
// Sin `ancla`: ancho y alto directos. ancho null = doble clic: vuelve al tamaño automático. fin = soltó: se guarda.
const anclas = new Map(); // id -> límites de la ventana al empezar a arrastrar
ipcMain.on('widget:tam', (e, ancho, alto, fin, ancla) => {
  const id = idWidget(e.sender); if (!id) return;
  const w = widgets.get(id), b = w.getBounds();
  if (ancho === null) { sinTamanoManual(id); guardarAjustes(); w.setBounds({ x: b.x, y: b.y, width: anchoWidget(id), height: b.height }); return; }
  if (!Number.isFinite(ancho) || !Number.isFinite(alto)) return;
  const an = typeof ancla === 'string' ? ancla : '', o = an ? anclas.get(id) || anclas.set(id, b).get(id) : b;
  if (an) { ancho = o.width + (an.includes('e') ? ancho : an.includes('w') ? -ancho : 0); alto = o.height + (an.includes('s') ? alto : an.includes('n') ? -alto : 0); }
  const a = screen.getDisplayMatching(b).workArea, W = Math.round(Math.max(WMIN.ancho, Math.min(WMAX, a.width, ancho))), H = Math.round(Math.max(WMIN.alto, Math.min(WMAX, a.height, alto)));
  const x = an.includes('w') ? o.x + o.width - W : o.x, y = an.includes('n') ? o.y + o.height - H : o.y;
  w.setBounds({ x, y, width: W, height: H });
  if (fin === true) { anclas.delete(id); ponGw(id, { ancho: W, alto: H, x, y }); guardarAjustes(); medirLuego(id); }
});
const origenMov = new Map(); // id -> posición al empezar a mover (dx/dy llegan desde ahí)
ipcMain.on('widget:mover', (e, dx, dy, fin) => {
  const id = idWidget(e.sender); if (!id || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const w = widgets.get(id); if (!origenMov.has(id)) origenMov.set(id, w.getBounds());
  const o = origenMov.get(id); w.setBounds({ ...o, x: Math.round(o.x + dx), y: Math.round(o.y + dy) }); // setPosition agranda la ventana con el escalado de pantalla
  if (fin === true) { origenMov.delete(id); guardarPosWidget(id); medirLuego(id); }
});
ipcMain.on('widget:cerrar', e => { const id = idWidget(e.sender); if (id) ponerWidget(id, false); });
ipcMain.on('widget:alto', (e, h) => { // el widget mide su contenido; la ventana se ajusta (80–900 px)
  const id = idWidget(e.sender); if (!id || !Number.isFinite(h) || altoFijo(id)) return; // con alto a mano, no se ajusta al contenido
  const w = widgets.get(id), b = w.getBounds(); w.setBounds({ x: b.x, y: b.y, width: anchoWidget(id), height: Math.round(Math.min(900, Math.max(80, h))) });
});

// ---- tema automático: mide el escritorio detrás del widget. Se pone la ventana del widget a opacidad 0 (si no, se vería a sí mismo), se captura la pantalla donde está,
// se recorta el rectángulo del cuadro y TemaFondo.decidirTema elige el tema (con histéresis respecto al anterior). Cuándo: al abrirse, al terminar de moverlo o cambiarle
// el tamaño (600 ms de calma), y cada 5 min (escalonados). No en pantalla completa ni en la prueba de humo. Si algo falla: claroscuro, el tema que se lee sobre cualquier fondo.
const pausaMs = ms => new Promise(r => setTimeout(r, ms));
let midiendo = Promise.resolve(); // las mediciones van de una en una (comparten la captura de pantalla y la opacidad de las ventanas)
function medirLuego(id, ms = 600) { // debounce por widget; solo los que están en automático
  clearTimeout(medirT.get(id));
  if (HUMO || widgetsOcultos || temaDe(id) !== 'auto') { medirT.delete(id); return; } // escondidos no se miden (medir los enseñaría un instante)
  medirT.set(id, setTimeout(() => { medirT.delete(id); midiendo = midiendo.then(() => medirFondo(id)).catch(e => log('tema: ' + (e && e.message || e))); }, ms));
}
async function medirFondo(id) {
  const w = widgets.get(id);
  if (HUMO || completa || widgetsOcultos || !w || w.isDestroyed() || temaDe(id) !== 'auto' || !w.isVisible()) return;
  let tema = 'claroscuro', opacidad = w.getOpacity();
  try {
    w.setOpacity(0); await pausaMs(120); // da tiempo a que el escritorio se repinte sin el widget
    const b = w.getBounds(), d = screen.getDisplayMatching(b), pantallas = screen.getAllDisplays();
    const fuentes = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) } });
    const f = fuentes.find(s => s.display_id === String(d.id)) || (fuentes.length === pantallas.length ? fuentes[pantallas.findIndex(x => x.id === d.id)] : null) || (fuentes.length === 1 ? fuentes[0] : null);
    if (!f || f.thumbnail.isEmpty()) throw new Error('sin captura de la pantalla ' + d.id);
    const { width: iw, height: ih } = f.thumbnail.getSize(), ex = iw / d.bounds.width, ey = ih / d.bounds.height, m = 10; // m: margen transparente de la ventana (10 px) alrededor del cuadro
    const x0 = Math.max(0, Math.round((b.x - d.bounds.x + m) * ex)), y0 = Math.max(0, Math.round((b.y - d.bounds.y + m) * ey));
    const x1 = Math.min(iw, Math.round((b.x - d.bounds.x + b.width - m) * ex)), y1 = Math.min(ih, Math.round((b.y - d.bounds.y + b.height - m) * ey));
    if (x1 - x0 < 4 || y1 - y0 < 4) throw new Error('widget fuera de la pantalla');
    const trozo = f.thumbnail.crop({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }), { width, height } = trozo.getSize();
    tema = TemaFondo.decidirTema(trozo.toBitmap(), width, height, temaEf.get(id)).tema;
  } catch (e) { log('tema: no se pudo medir el fondo de «' + id + '» (' + (e && e.message || e) + '); claroscuro'); }
  finally { if (!w.isDestroyed()) w.setOpacity(opacidad || 1); }
  if (!widgets.has(id) || temaDe(id) !== 'auto') return; // lo quitaron o cambió a mano mientras se medía
  const antes = temaEf.get(id); temaEf.set(id, tema); enviarTemaW(id);
  if (antes !== tema) { log('tema de «' + id + '»: ' + (antes || '—') + ' -> ' + tema); pintarWidgets(); }
}
function medirTodos() { [...widgets.keys()].filter(id => temaDe(id) === 'auto').forEach((id, i) => medirLuego(id, 1000 + i * 8000)); } // cada 5 min, uno cada 8 s
setInterval(medirTodos, 3e5);

// ---- actualización: pastilla en el panel y entradas en la bandeja; en pantalla completa no se enseña nada nuevo
let nueva = null, estAct = 'disponible', msgAct = '', ocupado = false;
const aviso = body => new Notification({ title: 'Gestor-Alarma', body, silent: true }).show();
function pintarAct() {
  enviar('actualizacion', nueva && !completa && ajustes.masTarde !== nueva.version ? { version: nueva.version, estado: estAct, mensaje: msgAct } : null);
  tray && tray.setContextMenu(menu());
}
const estadoAct = (e, m = '') => { estAct = e; msgAct = m; pintarAct(); };
async function buscar(aMano) {
  if (ocupado) return;
  const r = await Act.comprobar();
  if (r.error) { log('actualización: ' + r.error); if (aMano) aviso('No se pudo comprobar las actualizaciones.'); return; }
  if (ocupado) return;
  nueva = r.nueva ? r : null; estAct = 'disponible'; msgAct = '';
  if (nueva && aMano && ajustes.masTarde) { delete ajustes.masTarde; guardarAjustes(); }
  pintarAct();
  if (aMano && !nueva) aviso(`Tienes la última versión (${Act.VERSION}).`);
}
async function instalarAct() {
  if (!nueva || ocupado) return;
  if (!LANZADOR) { aviso('Versión de desarrollo: actualiza con git pull'); return; }
  ocupado = true; estadoAct('descargando');
  try { const f = await Act.descargar(nueva); estadoAct('instalando'); Act.instalar(f); setTimeout(() => app.quit(), 500); } // el instalador cierra y reabre la app
  catch (e) { log('actualizar ' + e.message); ocupado = false; estadoAct('error', 'No se pudo actualizar'); aviso('No se pudo actualizar: ' + e.message); }
}

// ---- inicio con Windows y bandeja
// Copia instalada = la del instalador de herramientas-apps (<carpeta>\GestorAlarma.exe + <carpeta>\app\). Corre con un electron.exe normal,
// así que app.isPackaged es siempre false: no sirve para distinguirla de la copia de desarrollo.
const LANZADOR = (f => fs.existsSync(f) ? f : null)(path.join(__dirname, '..', 'GestorAlarma.exe'));
const LNK = () => path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Gestor-Alarma.lnk');
function aplicarInicio() { // acceso directo en la carpeta Inicio (la entrada de Run la omite Windows en este equipo)
  if (HUMO || process.env.PANEL_SIN_INICIO === '1') return;
  try {
    app.setLoginItemSettings({ openAtLogin: false, name: 'Panel', path: process.execPath, args: [__dirname] }); // borra la entrada antigua de Run
    fs.rmSync(path.join(path.dirname(LNK()), 'Panel.lnk'), { force: true }); // acceso directo del nombre anterior
    if (ajustes.iniciarConWindows) shell.writeShortcutLink(LNK(), 'create', { target: LANZADOR || process.execPath, args: LANZADOR ? '' : `"${__dirname}"`, cwd: __dirname, icon: path.join(__dirname, 'assets', 'icon.ico') });
    else fs.rmSync(LNK(), { force: true });
  } catch (e) { log('inicio ' + e.message); }
}
const menu = () => Menu.buildFromTemplate([
  { label: 'Abrir panel', click: abrir },
  { label: 'Fijar abierto', type: 'checkbox', checked: !!ajustes.fijado, click: i => fijar(i.checked) },
  { label: 'Actualizar ahora', click: actualizar },
  ...(nueva ? [{ label: `Actualizar a la ${nueva.version}…`, click: instalarAct }] : []),
  { label: 'Buscar actualizaciones…', click: () => buscar(true) },
  { label: 'Abrir Outlook al iniciar', type: 'checkbox', checked: ajustes.abrirOutlook !== false, click: i => { ajustes.abrirOutlook = i.checked; guardarAjustes(); } },
  { type: 'separator' },
  ...Alarmas.menuItems(),
  { label: 'Ocultar alarmas y eventos (Ctrl+Alt+H)', type: 'checkbox', checked: fichasOcultas, click: i => ocultarFichas(i.checked) },
  { label: 'Esconder widgets (Ctrl+Alt+J)', type: 'checkbox', checked: widgetsOcultos, click: i => ponerOcultos(i.checked) },
  { type: 'separator' },
  { label: silenciando() ? `No molestar · hasta las ${horaSilencio()}` : 'No molestar', submenu: [
    { label: '30 minutos', click: () => silenciar(30) },
    { label: '1 hora', click: () => silenciar(60) },
    { label: '2 horas', click: () => silenciar(120) },
    ...(silenciando() ? [{ type: 'separator' }, { label: 'Quitar', click: () => silenciar(0) }] : []),
  ] },
  { label: uso && uso.pausado() ? 'Seguimiento de uso · en pausa' : 'Seguimiento de uso', submenu: [
    { label: 'Pausar 1 hora', click: () => pausarUso(Date.now() + 36e5) },
    { label: 'Pausar hasta reanudar', click: () => pausarUso(Infinity) },
    ...(uso && uso.pausado() ? [{ type: 'separator' }, { label: 'Reanudar', click: () => pausarUso(0) }] : []),
  ] },
  { label: 'Widgets en el escritorio', submenu: [...Object.entries(WIDGETS).map(([t, w]) => { const n = abiertosDe(t).length; return { label: 'Añadir ' + w.nombre + (n ? ` (${n} en el escritorio)` : ''), click: () => nuevoWidget(t) }; }),
    { type: 'separator' }, { label: 'Quitar todos', enabled: widgets.size > 0, click: () => [...widgets.keys()].forEach(id => ponerWidget(id, false)) }] },
  { label: 'Iniciar con Windows', type: 'checkbox', checked: !!ajustes.iniciarConWindows, click: i => { ajustes.iniciarConWindows = i.checked; guardarAjustes(); aplicarInicio(); } },
  { label: 'Salir', click: () => app.quit() },
]);
function crearBandeja() {
  tray = new Tray(nativeImage.createFromPath(ICONO).resize({ width: 16, height: 16 }));
  tray.setToolTip('Gestor-Alarma · Ctrl+Alt+P abrir/cerrar · Ctrl+Alt+A nueva alarma · Ctrl+Alt+D descartar · Ctrl+Alt+H ocultar alarmas · Ctrl+Alt+J esconder widgets');
  tray.setContextMenu(menu());
  tray.on('click', () => abierto ? cerrar() : abrir());
}

// ---- IPC
ipcMain.on('abrir-correo', (_, id) => { if (Correo && typeof id === 'string') Promise.resolve(Correo.abrir(id)).catch(e => log('abrir correo ' + e.message)); });
ipcMain.on('agenda-mas', () => { // +2 semanas de agenda (tope 120 días)
  if (diasAgenda >= 120) return;
  diasAgenda = Math.min(120, diasAgenda + 14);
  if (HUMO) { const c = cache.correo; if (c && c.agenda) { c.dias = diasAgenda; c.agenda.push(...extraHumo.filter(x => x[0] < diasAgenda).map(x => x[1])); extraHumo = extraHumo.filter(x => x[0] >= diasAgenda); enviar('correo', c); } return; }
  leerCorreo();
});
ipcMain.on('marcar-leidos', (_, ids) => {
  if (!Array.isArray(ids) || !ids.every(i => typeof i === 'string' && i)) return;
  if (HUMO) { const c = cache.correo; if (c && c.correos) { c.correos.forEach(x => { if (ids.includes(x.id)) x.leido = true; }); c.noLeidos = c.correos.filter(x => !x.leido).length; enviar('correo', c); } return; }
  if (Correo) Correo.marcarLeidos(ids).then(r => { if (!r.ok) log('marcar leídos falló'); leerCorreo(); }).catch(e => log('marcar leídos ' + e.message));
});
ipcMain.handle('crear-evento', async (_, ev) => {
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
  if (HUMO) { // sin Outlook: el evento se añade a los datos inventados
    const c = cache.correo;
    if (!ev || typeof ev.titulo !== 'string' || !iso.test(ev.inicio) || !iso.test(ev.fin) || !c || !c.agenda) return { ok: false, motivo: 'evento no válido' };
    const k = (c.categorias || []).find(x => x.nombre === ev.categoria);
    c.agenda.push({ titulo: ev.titulo, inicio: ev.inicio, fin: ev.fin, todoDia: !!ev.todoDia, lugar: ev.lugar || '', categoria: k ? k.nombre : '', color: k ? k.color : null });
    enviar('correo', c); return { ok: true, id: 'humo' };
  }
  if (!Correo) return { ok: false, motivo: 'Outlook no disponible' };
  try { const r = await Correo.crearEvento(ev); if (r.ok) leerCorreo(); return r; } catch (e) { log('crear evento ' + e.message); return { ok: false, motivo: 'No se pudo crear el evento' }; }
});
ipcMain.handle('buzon:contar', async () => {
  if (HUMO) return { ok: true, total: (cache.correo && cache.correo.noLeidos) || 0 };
  return Correo ? Correo.contarBuzon() : { ok: false, motivo: 'error' };
});
ipcMain.handle('buzon:marcar', async () => {
  if (HUMO) { const c = cache.correo; if (c && c.correos) { c.correos.forEach(x => { x.leido = true; }); c.noLeidos = 0; enviar('correo', c); } return { ok: true, hechos: 0, fallos: 0 }; }
  if (!Correo) return { ok: false, hechos: 0, fallos: 0 };
  const r = await Correo.marcarBuzon(); if (!r.ok) log('marcar buzón falló'); leerCorreo(); return r;
});
ipcMain.handle('agenda:editar', async (_, ev) => {
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
  if (!ev || typeof ev.id !== 'string' || !ev.id || !iso.test(ev.inicioOriginal) || typeof ev.titulo !== 'string' || !iso.test(ev.inicio) || !iso.test(ev.fin)) return { ok: false, motivo: 'evento no válido' };
  if (HUMO) {
    const c = cache.correo, x = c && c.agenda && c.agenda.find(y => y.id === ev.id && y.inicio === ev.inicioOriginal); if (!x) return { ok: false, motivo: 'evento no válido' };
    Object.assign(x, { titulo: ev.titulo, inicio: ev.inicio, fin: ev.fin, todoDia: !!ev.todoDia, lugar: ev.lugar || '' });
    if (typeof ev.categoria === 'string') { const k = (c.categorias || []).find(z => z.nombre === ev.categoria); x.categoria = k ? k.nombre : ''; x.color = k ? k.color : null; }
    enviar('correo', c); return { ok: true };
  }
  if (!Correo) return { ok: false, motivo: 'Outlook no disponible' };
  const r = await Correo.editarEvento(ev); leerCorreo(); return r; // relee siempre: si falló, la agenda vuelve a lo que hay en Outlook
});
ipcMain.handle('agenda:borrar', async (_, ev) => {
  if (!ev || typeof ev.id !== 'string' || !ev.id) return { ok: false, motivo: 'evento no válido' };
  if (HUMO) { const c = cache.correo; if (c && c.agenda) { c.agenda = c.agenda.filter(x => !(x.id === ev.id && (ev.serie || x.inicio === ev.inicio))); enviar('correo', c); } return { ok: true }; }
  if (!Correo) return { ok: false, motivo: 'Outlook no disponible' };
  const r = await Correo.borrarEvento(ev); leerCorreo(); return r; // relee siempre: si falló, la agenda vuelve a lo que hay en Outlook
});

// ---- ciudades del tiempo (buscar, añadir, quitar)
ipcMain.handle('lugares:buscar', async (_, texto) => {
  if (typeof texto !== 'string') return { ok: false, motivo: 'texto no válido' };
  if (HUMO) return { ok: true, lugares: /alcal/i.test(texto) ? [{ nombre: 'Alcalá de Henares', detalle: 'Comunidad de Madrid, España', lat: 40.4821, lon: -3.3635 }, { nombre: 'Alcalá la Real', detalle: 'Andalucía, España', lat: 37.4608, lon: -3.9235 }] : [] };
  return Meteo ? Meteo.buscar(texto) : { ok: false, motivo: 'error' };
});
ipcMain.handle('lugares:anadir', (_, l) => {
  if (!lugarValido(l)) return { ok: false, motivo: 'ciudad no válida' };
  const nuevo = limpiarLugar(l), ls = lugares();
  if (ls.some(x => claveLugar(x) === claveLugar(nuevo))) return { ok: true };
  if (ls.length >= MAX_LUGARES) return { ok: false, motivo: 'máximo ' + MAX_LUGARES + ' ciudades' };
  ajustes.lugares = [...ls, nuevo]; delete ajustes.lugar; guardarAjustes();
  if (HUMO) { const c = cache.meteo, base = c && c.lista && c.lista[0]; if (base) { c.lista.push({ clave: claveLugar(nuevo), nombre: nuevo.nombre, r: { ...base.r, lugar: { ...nuevo } } }); enviar('meteo', c); } } else leerMeteo();
  return { ok: true };
});
ipcMain.handle('lugares:quitar', (_, clave) => {
  const ls = lugares();
  if (typeof clave !== 'string' || ls.length < 2 || !ls.some(x => claveLugar(x) === clave)) return { ok: false, motivo: 'no se puede quitar' };
  ajustes.lugares = ls.filter(x => claveLugar(x) !== clave); delete ajustes.lugar; guardarAjustes();
  if (HUMO) { const c = cache.meteo; if (c && c.lista) { c.lista = c.lista.filter(x => x.clave !== clave); enviar('meteo', c); } } else leerMeteo();
  return { ok: true };
});

// ---- notas rápidas: una lista en %APPDATA%\panel\notas.json; cada cambio manda la lista entera
const NOTAS = () => path.join(app.getPath('userData'), 'notas.json');
function leerNotas() {
  try { const j = JSON.parse(fs.readFileSync(NOTAS(), 'utf8')); return Array.isArray(j) ? j.filter(n => n && typeof n.id === 'string' && typeof n.texto === 'string') : []; }
  catch { return []; }
}
function guardarNotas(lista) {
  if (!Array.isArray(lista) || lista.length > 500) return { ok: false, motivo: 'lista no válida' };
  const limpias = lista.map(n => ({ id: String(n && n.id || '').slice(0, 64), texto: String(n && n.texto || '').slice(0, 5000), creada: String(n && n.creada || '').slice(0, 40) }));
  if (limpias.some(n => !n.id)) return { ok: false, motivo: 'nota no válida' };
  try { fs.writeFileSync(NOTAS() + '.tmp', JSON.stringify(limpias)); fs.renameSync(NOTAS() + '.tmp', NOTAS()); return { ok: true }; }
  catch (e) { log('notas ' + e.message); return { ok: false, motivo: 'error' }; }
}
ipcMain.handle('notas:leer', leerNotas);
ipcMain.handle('notas:guardar', (_, lista) => { const r = guardarNotas(lista); if (r.ok) enviar('notas', leerNotas()); return r; });
ipcMain.handle('notas:anadir', (_, texto) => { // desde el widget de Notas: la nota nueva va la primera
  if (typeof texto !== 'string') return { ok: false, motivo: 'texto no válido' };
  texto = texto.trim().slice(0, 5000); if (!texto) return { ok: false, motivo: 'vacía' };
  const l = leerNotas(); l.unshift({ id: crypto.randomUUID(), texto, creada: new Date().toISOString() });
  const r = guardarNotas(l); if (r.ok) enviar('notas', leerNotas()); return r;
});
// ---- categorías del uso (reglas en categorias_uso.json; se aplican al leer)
const CatUso = require('./categorias_uso'), CATS_USO = () => path.join(app.getPath('userData'), 'categorias_uso.json');
let catsUso = null;
function leerCatsUso() { if (catsUso) return catsUso; try { catsUso = CatUso.sanear(JSON.parse(fs.readFileSync(CATS_USO(), 'utf8'))); } catch { catsUso = CatUso.porDefecto(); } return catsUso; }
function guardarCatsUso(cfg) { catsUso = CatUso.sanear(cfg); try { fs.writeFileSync(CATS_USO() + '.tmp', JSON.stringify(catsUso)); fs.renameSync(CATS_USO() + '.tmp', CATS_USO()); } catch (e) { log('categorias_uso ' + e.message); } return catsUso; }
const diaUso = ms => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const sinClasUso = dias => { if (!uso) return []; const h = Date.now(); try { return CatUso.sinClasificar(uso.leerDias(diaUso(h - dias * 864e5), diaUso(h)), leerCatsUso()); } catch (e) { log('uso ' + e.message); return []; } };
ipcMain.handle('uso:categorias', leerCatsUso);
ipcMain.handle('uso:guardarCategorias', (_, cfg) => guardarCatsUso(cfg));
ipcMain.handle('uso:sinClasificar', () => sinClasUso(7));
ipcMain.handle('uso:sugerencias', () => { const l = sinClasUso(30); clipboard.writeText(CatUso.textoSugerencias(l, leerCatsUso())); return { ok: true, n: l.length }; });
ipcMain.handle('uso:datos', (_, desde, hasta) => { // tramos de [desde, hasta] (AAAA-MM-DD) ya clasificados, con lo que está abierto ahora; máx. 60 días
  const vacio = { cats: [], tramos: [] };
  try {
    const re = /^\d{4}-\d{2}-\d{2}$/; if (!uso || !re.test(desde) || !re.test(hasta)) return vacio;
    const cfg = leerCatsUso(), p = s => { const [y, m_, d] = s.split('-').map(Number); return new Date(y, m_ - 1, d).getTime(); };
    const a = p(desde), b = Math.min(p(hasta) + 864e5, a + 60 * 864e5), hoy = diaUso(Date.now());
    let l = uso.leerDias(desde, hasta); if (hasta >= hoy) l = l.concat(uso.abiertos());
    return { cats: cfg.categorias, tramos: l.filter(t => t && t.f > a && t.i < b).map(t => ({ i: t.i, f: t.f, n: t.n, c: CatUso.clasificar(t, cfg), d: t.d })) };
  } catch (e) { log('uso ' + e.message); return vacio; }
});
ipcMain.handle('uso:importar', (_, texto) => { const r = CatUso.importar(String(texto || '').slice(0, 2e5), leerCatsUso()); if (r.n) guardarCatsUso(r.cfg); return { n: r.n, errores: r.errores, cfg: leerCatsUso() }; });

ipcMain.on('abrir-outlook', () => { try { spawn('cmd', ['/c', 'start', '', 'outlook'], { detached: true, windowsHide: true, stdio: 'ignore', cwd: require('os').homedir() }).unref(); } catch (e) { log('outlook ' + e.message); } });
ipcMain.on('fijar', (_, b) => fijar(b === true));
ipcMain.on('actualizar', actualizar);
ipcMain.on('cerrar', cerrar);
ipcMain.on('actualizacion:instalar', instalarAct);
ipcMain.on('actualizacion:tarde', () => { if (nueva && !ocupado) { ajustes.masTarde = nueva.version; guardarAjustes(); pintarAct(); } });

app.whenReady().then(async () => {
  if (!(await bloqueoListo)) return; // relanzando fuera del paquete, o ya hay otra instancia
  AJUSTES = path.join(app.getPath('userData'), 'ajustes.json');
  try { ajustes = { ...ajustes, ...JSON.parse(fs.readFileSync(AJUSTES, 'utf8')) }; } catch {}
  crearVentana();
  Alarmas.iniciar({ app, log, HUMO, alAbrir: abrirAlarmas, alEtiquetas: agendaAlOverlay, ventanas: () => [win, ...abiertosDe('alarmas').map(id => widgets.get(id))] }); // el panel y los widgets de Alarmas reciben los cambios del motor
  uso = require('./uso').crear({ dir: path.join(app.getPath('userData'), 'uso') }); uso.limpiar(); setInterval(() => uso.limpiar(), 864e5);
  if (HUMO) { // datos de uso inventados de ayer y hoy, para que los gráficos tengan algo que enseñar
    const d0 = new Date(); d0.setHours(0, 0, 0, 0); const H = 36e5, M = 6e4, udir = path.join(app.getPath('userData'), 'uso'); fs.mkdirSync(udir, { recursive: true });
    [[-1, [[9, 0, 120, 'a', 'code.exe', 'Visual Studio Code', 'panel.js'], [11, 30, 45, 'a', 'discord.exe', 'Discord', 'Discord'], [14, 0, 90, 'a', 'opera.exe', 'Opera', 'YouTube - música'], [16, 0, 60, 'a', 'winword.exe', 'Word', 'Apuntes']]],
     [0, [[8, 30, 100, 'a', 'code.exe', 'Visual Studio Code', 'main.js'], [10, 15, 25, 'a', 'discord.exe', 'Discord', 'Discord'], [10, 40, 20, 'i', '', '', ''], [11, 0, 70, 'a', 'opera.exe', 'Opera', 'YouTube - vídeo'], [12, 15, 40, 'a', 'winword.exe', 'Word', 'Informe'], [13, 0, 35, 'a', 'foo.exe', 'Foo', 'Algo'], [8, 30, 280, 'v', 'opera.exe', 'Opera', 'YouTube - vídeo']]]].forEach(([dd, l]) => {
      const b = d0.getTime() + dd * 864e5, nm = new Date(b); const fn = diaUso(nm.getTime()) + '.jsonl';
      fs.writeFileSync(path.join(udir, fn), l.map(([h, m, dur, n, exe, d, t]) => JSON.stringify({ i: b + h * H + m * M, f: b + h * H + (m + dur) * M, n, exe, d, ...(t ? { t } : {}) })).join('\n') + '\n');
    });
  }
  crearBandeja(); aplicarInicio();
  if (!globalShortcut.register('CommandOrControl+Alt+P', alternar)) log('no se pudo registrar Ctrl+Alt+P');
  if (!globalShortcut.register('CommandOrControl+Alt+A', atajoAlarmas)) log('no se pudo registrar Ctrl+Alt+A');
  if (!globalShortcut.register('CommandOrControl+Alt+D', Alarmas.descartar)) log('no se pudo registrar Ctrl+Alt+D');
  if (!globalShortcut.register('Alt+C', nuevoEvento)) log('no se pudo registrar Alt+C');
  if (!globalShortcut.register('CommandOrControl+Alt+H', () => ocultarFichas())) log('no se pudo registrar Ctrl+Alt+H');
  setInterval(vigilarFichas, 1000);
  screen.on('display-metrics-changed', colocar);
  ['display-added', 'display-removed', 'display-metrics-changed'].forEach(ev => screen.on(ev, programarRecolocar));
  powerMonitor.on('resume', programarRecolocar); powerMonitor.on('unlock-screen', programarRecolocar);
  setInterval(recolocarWidgets, 30000);
  setInterval(sondear, 80);
  cache.notas = leerNotas(); // para que los widgets de Notas la tengan al abrirse
  if (HUMO) { iniciarOcultos(); return humo().catch(e => { console.log('HUMO FALLA\nexcepción: ' + (e && e.stack || e)); app.exit(1); }); } // si la prueba lanza, sale en vez de quedarse colgada
  vigilarCompleta();
  Object.keys(ajustes.widgets || {}).forEach(id => gw(id).abierto && ponerWidget(id, true));
  aplicarOcultos(Ocultos.leer()); iniciarOcultos(); // tras restaurar los widgets: si el estado compartido está en «escondidos», salen escondidos
  estado(); if (ajustes.fijado) abrir();
  cargarCacheCorreo(); asegurarOutlook(); // primero lo guardado, luego se abre Outlook si hace falta (esa función ya hace la primera lectura al terminar)
  actualizar();
  setTimeout(() => buscar(false), 20e3); setInterval(() => buscar(false), 6 * 36e5);
  setInterval(leerCorreo, 6e4); setInterval(leerMeteo, 18e5);
});
app.on('will-quit', () => globalShortcut.unregisterAll());

// ---- prueba de humo
async function humo() {
  const ahora = Date.now(), iso = ms => new Date(ms - new Date(ms).getTimezoneOffset() * 6e4).toISOString().slice(0, 19);
  const h = 36e5, d = 864e5, fallos = [], h0 = new Date().setHours(0, 0, 0, 0);
  const de = ['Ana García', 'Banco Norte', 'Equipo de Proyectos', 'Luis Pérez', 'GitHub', 'Marta Ruiz', 'Newsletter Semanal', 'Carlos Vega'];
  const as = ['Reunión de mañana: confirmar asistencia y orden del día', 'Resumen de tu cuenta', 'Planificación del trimestre', 'Re: presupuesto', 'Nuevo inicio de sesión', 'Cena del viernes', 'Las novedades de la semana', 'Factura 2026-114'];
  enviar('correo', { ok: true, dias: 7, noLeidos: 3, correos: de.map((x, i) => ({ id: 'c' + i, de: x, asunto: as[i], fecha: iso(ahora - i * 7 * h), leido: i > 2 })),
    categorias: [{ nombre: 'Trabajo', color: '#e5533d' }, { nombre: 'Salud', color: '#3a86ff' }, { nombre: 'Proyectos', color: '#3fa34d' }, { nombre: 'Urgente', color: '#f08c2e' }, { nombre: 'Personal', color: '#a06bff' }],
    agenda: [ // 9 eventos en 7 días: hoy 3 (uno de todo el día), mañana 1, +2 vacío, +3 2, +4 1, +5 vacío, +6 2
      { titulo: 'Cumpleaños de Marta', inicio: iso(h0), fin: iso(h0 + d), todoDia: true, lugar: '' },
      { titulo: 'Reunión de equipo', inicio: iso(ahora - h / 3), fin: iso(ahora + 35 * 6e4), /* en curso: sale como cuadrado en el overlay */ todoDia: false, lugar: '', categoria: 'Trabajo', color: '#e5533d' },
      { titulo: 'Llamada con el banco', inicio: iso(h0 + 0 * d + 17 * h), fin: iso(h0 + 0 * d + 18 * h), todoDia: false, lugar: '' },
      { titulo: 'Dentista', inicio: iso(h0 + 1 * d + 10 * h), fin: iso(h0 + 1 * d + 11 * h), todoDia: false, lugar: 'Clínica', categoria: 'Salud', color: '#3a86ff' },
      { titulo: 'Revisión de proyecto', inicio: iso(h0 + 3 * d + 9 * h), fin: iso(h0 + 3 * d + 10.5 * h), todoDia: false, lugar: 'Sala 2', categoria: 'Proyectos', color: '#3fa34d' },
      { titulo: 'Comida con Luis', inicio: iso(h0 + 3 * d + 13.5 * h), fin: iso(h0 + 3 * d + 15 * h), todoDia: false, lugar: 'Restaurante' },
      { titulo: 'Entrega de informe', inicio: iso(h0 + 4 * d + 16 * h), fin: iso(h0 + 4 * d + 17 * h), todoDia: false, lugar: '', categoria: 'Urgente', color: '#f08c2e' },
      { titulo: 'Visita al médico', inicio: iso(h0 + 6 * d + 11 * h), fin: iso(h0 + 6 * d + 12 * h), todoDia: false, lugar: 'Centro de salud' },
      { titulo: 'Cena de cumpleaños', inicio: iso(h0 + 6 * d + 19 * h), fin: iso(h0 + 6 * d + 21 * h), todoDia: false, lugar: 'Casa de Ana' }] });
  const ex = (i, hh, t, extra) => [i, { titulo: t, inicio: iso(h0 + i * d + hh * h), fin: iso(h0 + i * d + (hh + 1) * h), todoDia: false, lugar: '', ...extra }]; // eventos inventados más allá de 7 días: salen al «Cargar más»
  extraHumo = [ex(8, 10, 'Reunión de planificación', { categoria: 'Trabajo', color: '#e5533d' }), ex(10, 18, 'Gimnasio'), ex(15, 9, 'Revisión médica', { categoria: 'Salud', color: '#3a86ff' }), ex(15, 16, 'Entrega de proyecto', { categoria: 'Proyectos', color: '#3fa34d' }), ex(18, 20, 'Cena con amigos', { categoria: 'Personal', color: '#a06bff' }), ex(25, 11, 'Dentista'), ex(30, 12, 'Comida de empresa'), ex(33, 9, 'Vuelo a Lisboa', { categoria: 'Urgente', color: '#f08c2e' })];
  cache.correo.agenda.forEach((e, i) => { e.id = 'h' + i; }); // ids inventados: así la agenda enseña el botón de borrar
  const nd = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'], ic = ['☀️', '⛅', '🌧️', '☁️', '🌤️'];
  // horas con los mismos campos que meteo.js (viento, humedad, sensación, presión, nubes, UV) y puntos cada 15 min
  const hora = (k, t, i) => ({ hora: String(k).padStart(2, '0') + ':00', temp: t, icono: ic[(k / 3 | 0) % 5], lluvia: (k * 5 + i * 9) % 50, viento: 8 + (k * 3) % 14, humedad: 40 + (k * 4) % 50, sens: t - 1, presion: 1012 + i, nubes: (k * 9) % 100, uv: Math.max(0, Math.round(6 * Math.sin((k - 6) / 12 * Math.PI))) });
  const puntos = (i, horas) => Array.from({ length: 96 }, (_, q) => { const k = Math.floor(q / 4), hd = q / 4, f = horas[k] || horas[0]; return { hora: String(k).padStart(2, '0') + ':' + String(q % 4 * 15).padStart(2, '0'), hd, temp: Math.round(f.temp + (q % 4) * .25), lluvia: (q * 3 + i * 7) % 60, icono: q % 4 ? '' : f.icono }; });
  const hHoy = Array.from({ length: 24 }, (_, k) => hora(k, Math.round(13 + 6 * Math.cos((k - 15) / 24 * 2 * Math.PI)), 0));
  const dHoras = nd.map((n, i) => Array.from({ length: 24 }, (_, k) => hora(k, Math.round(13 + i * 1.5 + 6 * Math.cos((k - 15) / 24 * 2 * Math.PI)), i)));
  ajustes.lugares = [{ nombre: 'Madrid', lat: 40.4, lon: -3.7 }];
  const meteoHumo = { ok: true, lugar: { nombre: 'Madrid', lat: 40.4, lon: -3.7 }, actual: { temp: 18, codigo: 1, texto: 'Mayormente despejado', icono: '🌤️', viento: 14, humedad: 58, sens: 17, presion: 1016, nubes: 30 },
    horas: hHoy, puntos: puntos(0, hHoy),
    ahora: new Date().getHours() + new Date().getMinutes() / 60,
    dias: nd.map((n, i) => ({ fecha: iso(ahora + i * d).slice(0, 10), nombre: n, max: 20 + i, min: 9 + i, icono: ic[i], texto: 'Soleado', lluvia: i * 15,
      horas: dHoras[i], puntos: puntos(i, dHoras[i]) })) };
  enviar('meteo', { lista: [{ clave: claveLugar(meteoHumo.lugar), nombre: 'Madrid', r: meteoHumo }] });
  Alarmas.datosHumo();
  enviar('sistema', { cpu: 23, ramUsada: 9.5e9, ramTotal: 16e9, discoLibre: 180e9, discoTotal: 500e9, dispositivos: [{ nombre: 'Ratón', nivel: 72, aprox: false }, { nombre: 'Mando Xbox', nivel: 60, aprox: true }, { nombre: 'Teclado', nivel: 15, aprox: false }] });
  nueva = { version: '9.9.9' }; pintarAct(); // pastilla de «versión nueva» inventada
  abrir();
  await new Promise(r => setTimeout(r, 1500));
  const salida = path.join(require('os').tmpdir(), 'panel-humo'); fs.mkdirSync(salida, { recursive: true });
  const js = (w, c) => w.webContents.executeJavaScript(c), esp = ms => new Promise(r => setTimeout(r, ms));
  const captura = async (n, w) => { try { fs.writeFileSync(path.join(salida, n + '.png'), (await w.webContents.capturePage()).toPNG()); } catch (e) { fallos.push('captura ' + n + ': ' + e.message); } };
  for (const tema of ['', '-claro']) for (const t of ['alarmas', 'correo', 'agenda', 'tiempo', 'notas', 'sistema', 'uso', 'widgets']) {
    if (tema && t === 'alarmas') { nativeTheme.themeSource = 'light'; await esp(400); }
    if (!await js(win, `(b => b ? (b.click(), true) : false)(document.querySelector('button[data-tab="${t}"]'))`)) { fallos.push('falta el botón de la pestaña ' + t); continue; }
    if (t === 'alarmas' && !tema) { // el botón de sincronizar responde (en humo, sin leer nada real)
      await js(win, `document.getElementById('al-refrescar')?.click()`); await esp(500);
      const est = await js(win, `document.getElementById('al-estado')?.textContent || ''`);
      if (!/humo/.test(est)) fallos.push('botón sincronizar: ' + est);
      const vd = await js(win, `document.getElementById('al-ventana')?.value`);
      if (vd !== '14') fallos.push('ventana en días: ' + vd + ' (esperada 14)');
      // etiquetas de Outlook: lo que se cambia en la lista llega al disco y la lista lo conserva al repintarse
      const cambia = `(async () => { const f = document.querySelector('#al-etq-l .etq'); if (!f) return 'sin filas';
        const ck = f.querySelector('.e-al'); ck.checked = true; ck.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 300));
        const g = document.querySelector('#al-etq-l .etq'), an = g.querySelector('.e-an'), au = g.querySelector('.e-au'); au.value = '1440'; an.value = '3'; an.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 300)); return f.dataset.n; })()`;
      const nombreE = await js(win, cambia); await esp(600);
      let guardado = null; try { guardado = (JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'ajustes.json'), 'utf8')).etiquetas || []).find(e => e.nombre === nombreE); } catch {}
      if (!guardado || guardado.alarma !== true || guardado.antes !== 4320) fallos.push('etiquetas: no se guardan en disco (' + nombreE + ' → ' + JSON.stringify(guardado) + ')');
      const vuelta = await js(win, `(() => { const f = document.querySelector('#al-etq-l .etq'); return f ? [f.querySelector('.e-al').checked, f.querySelector('.e-an').value, f.querySelector('.e-au').value].join() : 'sin filas'; })()`);
      if (vuelta !== 'true,3,1440') fallos.push('etiquetas: la lista no conserva lo elegido (' + vuelta + ')');
      await js(win, `window.alarmas.syncEtiquetas([])`); await esp(200); // deja las etiquetas como estaban: si no, ese evento dejaría de salir como cuadro en el overlay
      // aspecto de las burbujas: la sección existe, y cambiar la forma pone la clase en el overlay y se guarda
      if (!await js(win, `!!document.querySelector('#al-asp summary') && /Aspecto de las burbujas/.test(document.querySelector('#al-asp summary').textContent)`)) fallos.push('falta la sección «Aspecto de las burbujas» en el panel');
      else {
        await js(win, `document.querySelector('#al-asp .asp-f[data-k="forma"] button[data-v="cuadrada"]').click()`); await esp(400);
        if (!await js(Alarmas.overlay(), `document.body.classList.contains('f-cuadrada')`)) fallos.push('burbujas: la forma no llega al overlay');
        let gb = null; try { gb = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'ajustes.json'), 'utf8')).burbujas; } catch {}
        if (!gb || gb.forma !== 'cuadrada') fallos.push('burbujas: no se guardan en disco (' + JSON.stringify(gb) + ')');
        await js(win, `document.getElementById('as-reset').click()`); await esp(400);
        if (await js(Alarmas.overlay(), `document.body.classList.contains('f-cuadrada')`)) fallos.push('burbujas: Restablecer no vuelve a la píldora');
      }
    }
    if (t === 'uso' && !tema) { // los gráficos con datos de uso inventados (escritos en el userData temporal antes de abrir la ventana)
      await esp(500);
      const gr = await js(win, `(() => { const g = document.getElementById('uso-graficos'); return { svg: g.querySelectorAll('svg').length, activas: /activas/.test(g.textContent) }; })()`);
      if (!(gr.svg > 0)) fallos.push('pestaña Uso: sin gráficos (svg ' + gr.svg + ')');
      if (!gr.activas) fallos.push('pestaña Uso: falta el total «activas»');
    }
    if (t === 'uso' && !tema) { // la pestaña Uso: tarjeta de reglas con alguna regla y el botón de sugerencias
      await esp(300);
      const nr = await js(win, `document.querySelectorAll('#uso-reglas-t .uso-regla').length`);
      if (!(nr > 0)) fallos.push('pestaña Uso: sin reglas (' + nr + ')');
      if (!await js(win, `/Pedir sugerencias/.test(document.getElementById('uso-pedir')?.textContent || '')`)) fallos.push('pestaña Uso: falta «Pedir sugerencias»');
    }
    await esp(700); await captura('panel-' + t + tema, win); // 700: deja acabar la gota de la pestaña
  }
  await captura('overlay', Alarmas.overlay());
  const n = (w, s) => js(w, `document.querySelectorAll('${s}').length`);
  for (const [s, esperadas] of [['.fila', 12], ['.fila-correo', 3], ['.evento', 9]]) { const v = await n(win, s); if (v !== esperadas) fallos.push(`${s}: ${v} (esperadas ${esperadas})`); }
  await js(win, `document.getElementById('c-ocultar').click()`); await esp(150); // el interruptor enseña también los leídos
  { const v = await n(win, '.fila-correo'); if (v !== 8) fallos.push(`.fila-correo con leídos: ${v} (esperadas 8)`); }
  await js(win, `document.getElementById('c-ocultar').click()`); await esp(150);
  // chincheta de la Agenda: primer evento futuro con hora -> alarma nueva (.fila +1, aria-pressed) y alternar de vuelta
  await js(win, `document.querySelector('button[data-tab="agenda"]').click()`); await esp(300);
  const pin = `[...document.querySelectorAll('#agenda .evento')].find(e => +e.dataset.ms > Date.now() && e.querySelector('.h').textContent !== 'Todo el día').querySelector('.pin-ev')`;
  const f0 = await n(win, '.fila'); await js(win, `${pin}.click()`); await esp(600);
  if (await n(win, '.fila') !== f0 + 1) fallos.push('chincheta: no aparece la alarma en Alarmas');
  if (await js(win, `${pin}.getAttribute('aria-pressed')`) !== 'true') fallos.push('chincheta: no queda activa');
  await captura('panel-agenda-chincheta-claro', win);
  nativeTheme.themeSource = 'system'; await esp(400); await captura('panel-agenda-chincheta', win);
  nativeTheme.themeSource = 'light'; await esp(300);
  await js(win, `${pin}.click()`); await esp(600);
  if (await n(win, '.fila') !== f0) fallos.push('chincheta: no se quita la alarma');
  if (await js(win, `${pin}.getAttribute('aria-pressed')`) !== 'false') fallos.push('chincheta: sigue activa tras quitar');

  // nuevo evento: abrir formulario, escribir, elegir la primera etiqueta, capturas (claro y oscuro) y crear
  await js(win, `document.querySelector('button[data-tab="agenda"]').click()`); await esp(300);
  await js(win, `document.getElementById('ev-abrir').click()`);
  if (!await js(win, `document.activeElement && document.activeElement.id === 'ev-texto'`)) fallos.push('el texto del evento no recibe el foco');
  await js(win, `(t => { t.value = 'Prueba humo mañana 10:00'; t.dispatchEvent(new Event('input')); document.querySelector('.ev-chip')?.click(); })(document.getElementById('ev-texto'))`);
  if (!/Prueba humo/.test(await js(win, `document.getElementById('ev-vista').textContent`))) fallos.push('sin vista previa del evento');
  if (await js(win, `document.querySelector('.ev-chip[aria-pressed="true"]') ? 1 : 0`) !== 1) fallos.push('no se pudo elegir la etiqueta');
  await esp(400); await captura('panel-agenda-nuevo-claro', win);
  nativeTheme.themeSource = 'system'; await esp(400); await captura('panel-agenda-nuevo', win);
  await js(win, `document.getElementById('ev-crear').click()`); await esp(600);
  if (await js(win, `document.getElementById('ev-form').hidden`) !== true) fallos.push('el formulario no se cerró tras crear');
  if (!/Añadido/.test(await js(win, `document.getElementById('ev-aviso')?.textContent || ''`))) fallos.push('sin aviso «Añadido a Outlook»');
  const nev = await n(win, '.evento'); if (nev !== 10) fallos.push(`.evento tras crear: ${nev} (esperadas 10)`);
  await js(win, `document.querySelector('.diah[data-i="2"]').click()`);
  await js(win, `document.getElementById('ev-cancelar').click()`);
  // «Cargar 2 semanas más»: más eventos y cabecera de 21 días; capturas; y la carga automática al llegar al fondo (35 días)
  await js(win, `document.querySelector('button[data-tab="agenda"]').click()`); await esp(300);
  await js(win, `document.getElementById('ag-mas').click()`); await esp(600);
  const nev2 = await n(win, '.evento'); if (nev2 <= nev) fallos.push(`.evento tras cargar más: ${nev2} (esperadas más de ${nev})`);
  const cab = await js(win, `document.querySelector('#p-agenda h2').textContent`); if (!/21 días/.test(cab)) fallos.push('cabecera de la Agenda: ' + cab);
  if (await js(win, `document.querySelectorAll('.semh').length`) < 1) fallos.push('sin separadores de semana/mes');
  if (await js(win, `document.querySelectorAll('#agenda .diah[data-i="14"], #agenda .pin-ev').length`) < 1) fallos.push('faltan elementos de los días nuevos');
  nativeTheme.themeSource = 'light'; await esp(300);
  await js(win, `document.getElementById('p-agenda').scrollTop = 420`); await esp(300);
  await captura('panel-agenda-mas-claro', win);
  nativeTheme.themeSource = 'system'; await esp(400); await captura('panel-agenda-mas', win);
  await js(win, `document.getElementById('p-agenda').scrollTop = 1e5`); await esp(900);
  const cab2 = await js(win, `document.getElementById('ag-dias').textContent`); if (cab2 !== '35') fallos.push('carga automática al llegar al fondo: ' + cab2 + ' días (esperados 35)');
  await js(win, `document.getElementById('p-agenda').scrollTop = 0`);
  await js(win, `document.querySelector('.diah[data-i="2"]').click()`);
  if (!/Día:/.test(await js(win, `document.getElementById('ev-vista').textContent`))) fallos.push('clic en el día no abre el formulario con ese día');
  if (await js(win, `document.getElementById('nueva')?.hidden`) !== false) fallos.push('la pastilla de versión nueva no se ve');
  completa = true; pintarAct(); await esp(200);
  if (await js(win, `document.getElementById('nueva')?.hidden`) !== true) fallos.push('la pastilla sigue en pantalla completa');
  completa = false;
  ocultarFichas(true); if (Alarmas.overlay().isVisible()) fallos.push('Ctrl+Alt+H no oculta las fichas');
  vigilarFichas(); if (!fichasOcultas) fallos.push('las fichas vuelven a salir por una alarma que ya sonaba al ocultarlas');
  sonabanAlOcultar.clear(); vigilarFichas(); if (fichasOcultas || !Alarmas.overlay().isVisible()) fallos.push('una alarma nueva sonando no vuelve a enseñar las fichas');
  const cuadros = await n(Alarmas.overlay(), '.cuadro'); if (cuadros < 1) fallos.push('cuadros de agenda en el overlay: ' + cuadros + ' (esperado al menos 1: el evento en curso)');
  const cu = await js(Alarmas.overlay(), `document.querySelector('.cuadro .hora').textContent`); if (!/^−\d\d:\d\d$/.test(cu)) fallos.push('cuenta atrás del cuadro: ' + cu);
  await captura('overlay-cuadros', Alarmas.overlay());
  await js(win, `document.querySelector('button[data-tab="tiempo"]').click()`); await esp(300);
  await js(win, `document.querySelector('.fr-b[data-d="1"]').click()`); await esp(200);
  if (await n(win, '.fr-hoy') !== 1) fallos.push('mañana: falta la curva translúcida de hoy');
  if (await n(win, '.fr-ya') !== 0) fallos.push('mañana: no debería haber línea de «ahora»');
  await captura('panel-tiempo-manana', win);
  await js(win, `document.querySelector('.fr-b[data-d="-1"]').click()`); await esp(100);
  if (await n(win, '.fr-hoy') !== 0 || await n(win, '.fr-ya') !== 1) fallos.push('volver a hoy: gráfico incorrecto');
  // widgets del escritorio: se abren, pintan el mismo gráfico/barras que la pestaña, se ajustan de alto y se quitan con la ×
  // galería: 7 variantes con vista previa; pulsar una abre el widget con esa configuración
  await js(win, `document.querySelector('button[data-tab="widgets"]').click()`); await esp(500);
  if (await js(win, `document.querySelectorAll('.wg').length`) !== 14 || await js(win, `document.querySelectorAll('.wg-v .fr-g, .wg-v .barra').length`) < 3) fallos.push('galería: faltan tarjetas o vistas previas');
  await captura('panel-widgets-galeria', win);
  await js(win, `document.querySelectorAll('.wg')[0].click()`); await esp(1200);
  if (!widgets.has('tiempo') || cfgWidget('tiempo').dias !== false || cfgWidget('tiempo').tam !== 'p') fallos.push('galería: pulsar una variante no abre el widget con su configuración');
  else if (await js(win, `document.querySelectorAll('.wg')[0].getAttribute('aria-pressed')`) !== 'true') fallos.push('galería: no marca la variante abierta');
  ponerWidget('tiempo', false); delete ajustes.widgets.tiempo.cfg; await esp(200);
  await js(win, `document.querySelector('button[data-tab="sistema"]').click()`); await esp(300); // la galería se vacía al salir de su pestaña
  ponerWidget('tiempo', true); ponerWidget('sistema', true); await esp(1200);
  const wt = widgets.get('tiempo'), ws = widgets.get('sistema');
  { // Ctrl+Alt+J: poner escondidos oculta los widgets sin cerrarlos; devolver los enseña; también por el fichero compartido (ruta temporal)
    aplicarOcultos(true);
    if (!widgetsOcultos || [...widgets.values()].some(w => w.isVisible())) fallos.push('Ctrl+Alt+J: esconder no oculta los widgets');
    if (widgets.size < 2) fallos.push('Ctrl+Alt+J: esconder cierra widgets');
    aplicarOcultos(false);
    if (widgetsOcultos || [...widgets.values()].some(w => !w.isVisible())) fallos.push('Ctrl+Alt+J: devolver no enseña los widgets');
    Ocultos.escribir(true, 'humo'); await esp(900);
    if (!widgetsOcultos || [...widgets.values()].some(w => w.isVisible())) fallos.push('Ctrl+Alt+J: el fichero compartido no esconde los widgets');
    nuevoWidget('tiempo'); await esp(900); // sacar uno a mano con el estado escondido: escribe false y devuelve todos
    if (widgetsOcultos || Ocultos.leer() || [...widgets.values()].some(w => !w.isVisible())) fallos.push('Ctrl+Alt+J: sacar un widget a mano no devuelve los demás');
    abiertosDe('tiempo').filter(id => id !== 'tiempo').forEach(id => ponerWidget(id, false)); await esp(200);
  }
  if (!wt || !ws) fallos.push('widgets: no se abren');
  else {
    if (await n(wt, '.fr-g') !== 1) fallos.push('widget Tiempo: sin gráfico');
    if (await n(ws, '.barra') < 3) fallos.push('widget Sistema: faltan barras');
    if (wt.getBounds().height <= 100 || ws.getBounds().height <= 100) fallos.push('widgets: el alto no se ajusta al contenido');
    // tamaño a mano: arrastrar la esquina fija ancho y alto (se guardan); doble clic vuelve al automático
    await js(wt, `api.widgetTam(470, 420, true)`); await esp(250);
    if (Math.abs(wt.getBounds().width - 470) > 2 || Math.abs(wt.getBounds().height - 420) > 2 || ajustes.widgets.tiempo.ancho !== 470 || ajustes.widgets.tiempo.alto !== 420) fallos.push('widget Tiempo: el tamaño a mano no se aplica/guarda (' + wt.getBounds().width + '×' + wt.getBounds().height + ')');
    await js(wt, `document.getElementById('w-r').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`); await esp(500);
    if (ajustes.widgets.tiempo.ancho !== undefined || ajustes.widgets.tiempo.alto !== undefined || Math.abs(wt.getBounds().width - 380) > 2 || wt.getBounds().height === 420) fallos.push('widget Tiempo: el doble clic en la esquina no vuelve al tamaño automático (' + wt.getBounds().width + '×' + wt.getBounds().height + ')');
    // tirar del borde izquierdo/superior: cambia el tamaño y el borde contrario (derecho/inferior) se queda quieto
    { wt.setPosition(-20000, -20000); await esp(100); const b0 = wt.getBounds(); await js(wt, `api.widgetTam(-60, -40, true, 'nw')`); await esp(250); const b1 = wt.getBounds();
      if (Math.abs(b1.x + b1.width - b0.x - b0.width) > 2 || Math.abs(b1.y + b1.height - b0.y - b0.height) > 2 || Math.abs(b1.width - b0.width - 60) > 2) fallos.push('widget: el borde de arriba a la izquierda no ancla el contrario ' + JSON.stringify([b0, b1]));
      await js(wt, `api.widgetTam(10, 10, true)`); await esp(250); if (Math.abs(wt.getBounds().width - 160) > 2 || Math.abs(wt.getBounds().height - 80) > 2) fallos.push('widget: el tamaño mínimo no es 160×80 (' + wt.getBounds().width + '×' + wt.getBounds().height + ')');
      await js(wt, `document.getElementById('w-r').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`); await esp(400); }
    // varios del mismo tipo: duplicar crea otro con los mismos ajustes; la galería añade otro más; quitar una copia no toca al original
    await js(wt, `document.getElementById('w-d').click()`); await esp(900);
    { const copias = abiertosDe('tiempo').filter(id => id !== 'tiempo');
      if (copias.length !== 1 || JSON.stringify(cfgWidget(copias[0])) !== JSON.stringify(cfgWidget('tiempo'))) fallos.push('widget: duplicar no crea una copia igual (' + copias.length + ')');
      else if (await n(widgets.get(copias[0]), '.fr-g') !== 1) fallos.push('widget duplicado: sin gráfico');
      nuevoWidget('tiempo', { tam: 'p' }); await esp(900);
      if (abiertosDe('tiempo').length !== 3) fallos.push('widget: no se pueden tener 3 del mismo tipo');
      abiertosDe('tiempo').filter(id => id !== 'tiempo').forEach(id => ponerWidget(id, false)); await esp(200);
      if (abiertosDe('tiempo').length !== 1 || !widgets.has('tiempo') || Object.keys(ajustes.widgets).some(id => id.startsWith('tiempo-'))) fallos.push('widget: quitar las copias deja rastro o quita el original'); }
    await js(wt, `document.querySelector('.fr-b[data-d="1"]').click()`); await esp(150);
    if (await n(wt, '.fr-hoy') !== 1) fallos.push('widget Tiempo: las flechas de día no funcionan');
    // configuración: tamaño grande (más ancho) y ocultar partes
    await js(wt, `document.getElementById('w-g').click()`); await esp(100);
    await js(wt, `document.querySelector('[data-tam=g]').click()`); await esp(300);
    if (Math.abs(wt.getBounds().width - 520) > 2 || (ajustes.widgets.tiempo.cfg || {}).tam !== 'g') fallos.push('widget Tiempo: el tamaño no cambia/guarda (' + wt.getBounds().width + ')');
    await js(wt, `document.querySelector('[data-niv=Mínimo]').click()`); await esp(200);
    if (await n(wt, '.dias') !== 0 || await n(wt, '.ahora') !== 0 || await n(wt, '.fr-g') !== 1) fallos.push('widget Tiempo: el nivel Mínimo no oculta partes');
    await js(wt, `document.querySelector('[data-niv=Completo]').click()`); await esp(150);
    await js(wt, `document.querySelector('[data-tam=m]').click()`); await esp(300);
    if (await n(wt, '.dias') !== 1 || await n(wt, '.det') < 1) fallos.push('widget Tiempo: el nivel Completo no muestra todo');
    await js(wt, `document.getElementById('w-g').click()`); await esp(100);
    await js(ws, `document.getElementById('w-g').click(); document.querySelector('[data-niv=Mínimo]').click()`); await esp(200);
    if (await n(ws, '.barra') !== 2) fallos.push('widget Sistema: el nivel Mínimo no deja CPU y RAM');
    await js(ws, `document.querySelector('[data-niv=Completo]').click(); document.getElementById('w-g').click()`); await esp(200);
    for (const est of ['cristal', 'fino', 'flotante', 'solido']) {
      await js(wt, `document.getElementById('w').dataset.estilo !== '${est}' && document.getElementById('w-e').click()`); await js(ws, `document.getElementById('w').dataset.estilo !== '${est}' && document.getElementById('w-e').click()`); await esp(300);
      await captura('widget-tiempo-' + est, wt); await captura('widget-sistema-' + est, ws);
    }
    if ((ajustes.widgets.tiempo || {}).estilo !== 'solido') fallos.push('widget: el estilo no se guarda');
    await js(wt, `document.getElementById('w-e').click()`); await esp(150); // vuelve a cristal
    await captura('widget-tiempo', wt); await captura('widget-sistema', ws);
    nativeTheme.themeSource = 'system'; await esp(400);
    // temas de contraste: por defecto 'auto' (en humo no se mide: claroscuro); cada tema cambia data-tema y se guarda; el selector del panel de ajustes los ofrece
    { const dt = w => js(w, `document.getElementById('w').dataset.tema`);
      if (temaDe('tiempo') !== 'auto' || await dt(wt) !== 'claroscuro') fallos.push('widget: el tema por defecto no es automático (claroscuro sin medir): ' + temaDe('tiempo') + '/' + await dt(wt));
      await js(wt, `document.getElementById('w-g').click()`); await esp(150);
      if (await js(wt, `document.querySelectorAll('#w-tema option').length`) !== 6) fallos.push('widget: el selector de tema no tiene las 6 opciones');
      if (!/Automático \(claroscuro\)/.test(await js(wt, `document.getElementById('w-g').title`))) fallos.push('widget: el título del botón no dice el tema efectivo');
      for (const t of ['claro', 'oscuro', 'claroscuro', 'velado', 'contraste']) {
        await js(wt, `api.widgetTema('${t}')`); await js(ws, `api.widgetTema('${t}')`); await esp(250);
        if (await dt(wt) !== t || temaDe('tiempo') !== t || (ajustes.widgets.tiempo || {}).tema !== t) fallos.push('widget: el tema ' + t + ' no se aplica/guarda (' + await dt(wt) + ')');
        if (t === 'claroscuro' && !(await js(wt, `getComputedStyle(document.querySelector('.fr-t')).strokeWidth`)).startsWith('3')) fallos.push('widget: el claroscuro no contornea el texto SVG');
        await captura('widget-tiempo-tema-' + t, wt); await captura('widget-sistema-tema-' + t, ws);
      }
      await js(wt, `api.widgetTema('inventado')`); await esp(100); if (temaDe('tiempo') !== 'contraste') fallos.push('widget: acepta un tema inválido');
      await js(wt, `api.widgetTema('auto')`); await js(ws, `api.widgetTema('auto')`); await esp(250);
      if (temaDe('tiempo') !== 'auto' || await dt(wt) !== 'claroscuro') fallos.push('widget: volver a automático falla');
      await js(wt, `document.getElementById('w-g').click()`); }
    await js(wt, `document.getElementById('w-x').click()`); await esp(300);
    if (widgets.has('tiempo')) fallos.push('widget Tiempo: la × no lo quita');
    { // «como Windows»: la ventana de Sistema se mueve y reescala ×1,2 sin que el usuario haga nada -> recolocarWidgets la devuelve y ajustes no cambia
      const a = screen.getPrimaryDisplay().workArea; ponGw('sistema', { x: a.x + 100, y: a.y + 100 });
      const bw = ws.getBounds(), antes = JSON.stringify(ajustes.widgets.sistema);
      ws.setBounds({ x: a.x + 500, y: a.y + 400, width: Math.round(bw.width * 1.2), height: Math.round(bw.height * 1.2) }); await esp(150);
      recolocarWidgets(true); await esp(150);
      const b2 = ws.getBounds();
      if (Math.abs(b2.x - (a.x + 100)) > 2 || Math.abs(b2.y - (a.y + 100)) > 2 || Math.abs(b2.width - anchoWidget('sistema')) > 2) fallos.push('widget: recolocarWidgets no devuelve la ventana a lo guardado ' + JSON.stringify(b2));
      if (JSON.stringify(ajustes.widgets.sistema) !== antes) fallos.push('widget: recolocarWidgets cambió ajustes');
      delete ajustes.widgets.sistema.x; delete ajustes.widgets.sistema.y; }
    ponerWidget('sistema', false); await esp(200);
    // widget Agenda: modo eventos (lista) y modo horas (línea de tiempo) con datos inventados
    {
      const d = new Date(), previo = cache.correo, hh = Math.min(d.getHours(), 22); // eventos desde esta hora, para que caigan dentro de la línea de tiempo
      const f = (h, mi) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, mi); const p = n => String(n).padStart(2, '0'); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}:00`; };
      enviar('correo', { ok: true, dias: 14, correos: [], categorias: [], agenda: [
        { titulo: 'Reunión', inicio: f(hh, 0), fin: f(23, 59), todoDia: false, lugar: 'Sala 2', categoria: 'Trabajo', color: '#4a9eff', id: 'x1' },
        { titulo: 'Solapado', inicio: f(hh, 30), fin: f(23, 59), todoDia: false, lugar: '', categoria: '', color: null, id: 'x2' },
        { titulo: 'Festivo', inicio: f(0, 0), fin: f(0, 0), todoDia: true, lugar: '', categoria: '', color: '#ff9500', id: 'x3' }] });
      ponerWidget('agenda', true, { tam: 'm', modo: 'eventos', ndias: 3, todo: true, lugar: true }); await esp(900);
      const wa = widgets.get('agenda');
      if (!wa) fallos.push('widget Agenda: no se abre');
      else {
        if (await n(wa, '.wev') < 2) fallos.push('widget Agenda: el modo eventos no pinta eventos');
        await captura('widget-agenda-eventos', wa);
        ponerWidget('agenda', true, { tam: 'm', modo: 'horas', h0: Math.max(0, hh - 1), h1: Math.min(24, Math.max(0, hh - 1) + 6), todo: true, lugar: false, ndias: 3 }); await esp(900);
        if (await n(wa, '.wh-b') < 2 || await n(wa, '.wchip') !== 1) fallos.push('widget Agenda: el modo horas no pinta bloques');
        await captura('widget-agenda-horas', wa);
      }
      ponerWidget('agenda', false); await esp(200);
      enviar('correo', previo); // deja los datos de la prueba como estaban
    }
    if (widgets.size) fallos.push('widgets: quedan abiertos');
  }
  // varias ciudades: buscar «Alcalá», añadirla, cambiar de ciudad con las pestañitas y quitarla
  if (await n(win, '.ciu') !== 0) fallos.push('ciudades: con una sola no debería haber pestañitas');
  await js(win, `document.getElementById('ci-abrir').click()`);
  await js(win, `(t => { t.value = 'Alcalá'; })(document.getElementById('ci-texto')); document.getElementById('ci-form').requestSubmit()`); await esp(400);
  if (await n(win, '.ci-op') !== 2) fallos.push('ciudades: la búsqueda no da resultados');
  await js(win, `document.querySelector('.ci-op').click()`); await esp(400);
  if (await n(win, '.ciu-n') !== 2) fallos.push('ciudades: no se añade la ciudad');
  if (!/Alcal/.test(await js(win, `document.querySelector('.ciu.on .ciu-n')?.textContent || ''`))) fallos.push('ciudades: la nueva no queda elegida');
  await captura('panel-tiempo-ciudades', win);
  await js(win, `document.querySelector('.ciu:not(.on) .ciu-n').click()`); await esp(150);
  if (!/Madrid/.test(await js(win, `document.querySelector('.ciu.on .ciu-n')?.textContent || ''`))) fallos.push('ciudades: no cambia de ciudad');
  await js(win, `document.querySelector('.ciu:not(.on) .ciu-n').click()`); await esp(150);
  await js(win, `document.querySelector('.ciu.on .ciu-q').click()`); await esp(400);
  if (await n(win, '.ciu') !== 0) fallos.push('ciudades: no se quita');
  const tarjetas = await n(Alarmas.overlay(), '.tarjeta');
  if (tarjetas !== 5) fallos.push('tarjetas visibles: ' + tarjetas + ' (esperadas 5)');
  // nuevo: borrar un evento de la agenda (con confirmación), marcar todo el buzón y la página de notas
  await js(win, `document.querySelector('button[data-tab="agenda"]').click()`); await esp(300);
  const evAntes = await n(win, '.evento');
  // editar: lápiz del primer evento con hora -> formulario precargado, cambiar título y 15 min, guardar
  await js(win, `[...document.querySelectorAll('#agenda .evento')].find(e => e.querySelector('.h').textContent !== 'Todo el día').querySelector('.editar-ev').click()`); await esp(200);
  if (await js(win, `document.getElementById('ev-crear').textContent`) !== 'Guardar cambios') fallos.push('editar evento: el formulario no pasa a modo edición');
  await js(win, `(() => { \document.querySelector('.ev-\dur[\data-m="15"]').click(); const t = \document.getElementByI\d('ev-texto'); t.value = 'E\dita\do humo ' + t.value.match(/\\d{1,2}:\\d{2}/)[0]; t.\dispatchEvent(new Event('input')); })()`);
  await js(win, `document.getElementById('ev-crear').click()`); await esp(400);
  if (!await js(win, `[...document.querySelectorAll('#agenda .evento .tt')].some(t => t.textContent.startsWith('Editado humo'))`)) fallos.push('editar evento: el cambio no sale en la agenda');
  await js(win, `document.querySelector('#agenda .borrar-ev').click()`); await esp(200);
  if (!await n(win, '.ev-conf')) fallos.push('borrar evento: no aparece la confirmación');
  await js(win, `document.querySelector('.ev-conf [data-act="una"]').click()`); await esp(600);
  if (await n(win, '.evento') !== evAntes - 1) fallos.push('borrar evento: no desaparece de la agenda');
  await js(win, `document.querySelector('button[data-tab="correo"]').click()`); await esp(300);
  await js(win, `document.getElementById('c-buzon').click()`); await esp(300);
  if (!/3 correos/.test(await js(win, `document.getElementById('c-conf-t').textContent`))) fallos.push('buzón: no pregunta cuántos correos');
  await js(win, `document.getElementById('c-conf-ok').click()`); await esp(500);
  if (await n(win, '.fila-correo.nl') !== 0) fallos.push('buzón: quedan correos sin leer');
  await js(win, `document.querySelector('button[data-tab="notas"]').click()`); await esp(300);
  await js(win, `(t => { t.value = 'Nota de prueba'; t.dispatchEvent(new Event('input')); document.getElementById('nt-form').requestSubmit(); })(document.getElementById('nt-texto'))`); await esp(300);
  if (await n(win, '.nota') !== 1) fallos.push('notas: no se añade la nota');
  await captura('panel-notas-nueva', win);
  // widget de Notas: pinta la lista, y una nota escrita en él (Intro) llega al panel
  ponerWidget('notas', true, { tam: 'm', fecha: true, nueva: true }); await esp(900);
  { const wn = widgets.get('notas');
    if (!wn) fallos.push('widget Notas: no se abre');
    else {
      if (!(await js(wn, `document.getElementById('w-c').textContent.includes('Nota de prueba')`))) fallos.push('widget Notas: no enseña la nota');
      await captura('widget-notas', wn);
      await js(wn, `(t => { t.value = 'Nota desde el widget'; t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); })(document.getElementById('wn-texto'))`); await esp(500);
      if (await n(win, '.nota') !== 2) fallos.push('widget Notas: la nota escrita no llega al panel');
      if (await n(wn, '.wn-nota') !== 2) fallos.push('widget Notas: no se actualiza tras añadir');
    }
    ponerWidget('notas', false); await esp(200); }
  // widget de Alarmas: pinta las alarmas de los datos de humo, y una escrita en su campo (Prueba 25m + Intro) llega al motor y a la lista del widget
  ponerWidget('alarmas', true, { tam: 'm', n: 8, crear: true, externas: true }); await esp(900);
  { const wa = widgets.get('alarmas');
    if (!wa) fallos.push('widget Alarmas: no se abre');
    else {
      const filas = await n(wa, '.wa-f'); if (filas < 1) fallos.push('widget Alarmas: no pinta ninguna alarma (' + filas + ')');
      if (!(await js(wa, `document.getElementById('w-c').textContent.includes('Reunión') && !!document.querySelector('.wa-x')`))) fallos.push('widget Alarmas: falta una alarma de los datos de humo o su ×');
      await captura('widget-alarmas', wa);
      await js(wa, `(t => { t.focus(); t.value = 'Prueba 25m'; t.dispatchEvent(new Event('input', { bubbles: true })); })(document.getElementById('wa-texto'))`); await esp(150);
      if (!/cuenta atrás/.test(await js(wa, `document.getElementById('wa-vista').textContent`))) fallos.push('widget Alarmas: sin vista previa al escribir');
      await js(wa, `document.getElementById('wa-texto').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`); await esp(600);
      if (!(await js(win, `window.alarmas.lista().then(l => l.some(a => a.nombre === 'Prueba' && a.tipo === 'cuenta'))`))) fallos.push('widget Alarmas: la alarma escrita no llega al motor');
      if (!(await js(wa, `[...document.querySelectorAll('.wa-n')].some(e => e.textContent.startsWith('Prueba'))`))) fallos.push('widget Alarmas: no se actualiza tras crear');
      if (await js(wa, `document.getElementById('wa-texto').value`) !== '' || !/Añadida/.test(await js(wa, `document.getElementById('wa-vista').textContent`))) fallos.push('widget Alarmas: no vacía el campo ni avisa «Añadida»');
      await js(wa, `[...document.querySelectorAll('.wa-x')].find(b => b.closest('.wa-f').textContent.startsWith('Prueba')).click()`); await esp(500);
      if (await js(wa, `[...document.querySelectorAll('.wa-n')].some(e => e.textContent.startsWith('Prueba'))`) || await js(win, `window.alarmas.lista().then(l => l.some(a => a.nombre === 'Prueba'))`)) fallos.push('widget Alarmas: la × no borra la alarma');
    }
    ponerWidget('alarmas', false); await esp(200); }
  console.log(fallos.length ? 'HUMO FALLA\n' + fallos.join('\n') : 'HUMO OK · capturas en ' + salida);
  app.exit(fallos.length ? 1 : 0);
}
