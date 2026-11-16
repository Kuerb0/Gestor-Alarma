const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, screen, nativeImage, shell } = require('electron');
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const Alarmas = require('./alarmas'); // motor del antiguo Gestor-Alarmas (overlay, datos, Post-It/Outlook)

const HUMO = process.argv.includes('--humo'); // prueba: userData temporal, datos inventados, captura y salir
const ICONO = path.join(__dirname, 'assets', 'icon.png');
const W = 400, PW = 380; // ventana (con margen izquierdo para la sombra) y ancho del panel
let AJUSTES, ajustes = { fijado: false, iniciarConWindows: true, lugar: null }, win, tray;
let abierto = false, fuera = 0, ultCorreo = 0, leyendoCorreo = false, tSistema = null, bueno = {}, cache = {};

if (HUMO) app.setPath('userData', fs.mkdtempSync(path.join(require('os').tmpdir(), 'panel-humo-')));
const LOG = path.join(app.getPath('userData'), 'panel.log');
const log = m => { try { if (fs.existsSync(LOG) && fs.statSync(LOG).size > 2e5) fs.renameSync(LOG, LOG + '.old'); fs.appendFileSync(LOG, new Date().toISOString() + ' ' + m + '\n'); } catch {} };
process.on('uncaughtException', e => log('ERROR ' + (e && e.stack || e)));
process.on('unhandledRejection', e => log('RECHAZO ' + (e && e.stack || e)));
log('inicio pid=' + process.pid + ' args=' + process.argv.slice(1).join(' '));
if (!app.requestSingleInstanceLock()) { log('ya hay otra instancia: salgo'); app.quit(); }
app.on('quit', (_, c) => log('salida código=' + c));
app.on('second-instance', () => abrir());
app.on('window-all-closed', () => {}); // vive en la bandeja

// fuentes: protegidas para que la app arranque aunque falte alguna
const cargar = n => { try { return require('./' + n); } catch (e) { log('sin módulo ' + n + ': ' + e.message); return null; } };
const Correo = HUMO ? null : cargar('correo'), Meteo = HUMO ? null : cargar('meteo'), Sistema = HUMO ? null : cargar('sistema');

const guardarAjustes = () => { try { fs.writeFileSync(AJUSTES, JSON.stringify(ajustes)); } catch (e) { log('ajustes ' + e.message); } };
const enviar = (canal, dato) => { cache[canal] = dato; win && !win.isDestroyed() && win.webContents.send(canal, dato); };
const estado = () => enviar('estado', { abierto, fijado: ajustes.fijado });

// ---- lecturas (si falla, se conserva el último dato bueno y se marca `obsoleto`)
const conservar = (canal, r) => { if (r && r.ok) bueno[canal] = r; enviar(canal, r && r.ok ? r : bueno[canal] ? { ...bueno[canal], obsoleto: r && r.motivo || 'error' } : r || { ok: false, motivo: 'error' }); };
async function leerCorreo() { // nunca dos lecturas de Outlook a la vez
  if (!Correo || leyendoCorreo) return; leyendoCorreo = true;
  try { conservar('correo', await Correo.leer()); } catch (e) { log('correo ' + e.message); conservar('correo', { ok: false, motivo: 'error' }); }
  finally { leyendoCorreo = false; ultCorreo = Date.now(); }
}
async function leerMeteo() {
  if (!Meteo) return;
  try { const r = await Meteo.leer(ajustes.lugar || undefined); if (r.ok && !ajustes.lugar) { ajustes.lugar = r.lugar; guardarAjustes(); } conservar('meteo', r); }
  catch (e) { log('meteo ' + e.message); conservar('meteo', { ok: false, motivo: 'error' }); }
}
async function leerSistema() { if (!Sistema) return; try { enviar('sistema', await Sistema.leer()); } catch (e) { log('sistema ' + e.message); } }
const actualizar = () => { leerCorreo(); leerMeteo(); if (abierto) leerSistema(); };

// ---- ventana: siempre 400 px de ancho y alto completo; escondida es click-through y el HTML desplaza el contenido con CSS
const area = () => screen.getPrimaryDisplay().workArea;
const colocar = () => { const a = area(); win.setBounds({ x: a.x + a.width - W, y: a.y, width: W, height: a.height }); };
function crearVentana() {
  win = new BrowserWindow({
    width: W, height: 800, frame: false, transparent: true, resizable: false, skipTaskbar: true, hasShadow: false, focusable: true, show: false, icon: ICONO,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'pop-up-menu');
  win.setIgnoreMouseEvents(true, { forward: true });
  colocar();
  win.loadFile('panel.html');
  win.webContents.on('did-finish-load', () => Object.entries(cache).forEach(([c, d]) => win.webContents.send(c, d)));
  win.once('ready-to-show', () => win.showInactive());
}
function poner(v) { // abre/cierra de verdad
  if (v === abierto) return; abierto = v; fuera = 0;
  win.setIgnoreMouseEvents(!v, { forward: true });
  estado();
  clearInterval(tSistema); tSistema = null;
  if (v) { leerSistema(); tSistema = setInterval(leerSistema, 2000); if (!HUMO && Date.now() - ultCorreo > 15e3) leerCorreo(); }
}
const abrir = () => poner(true);
function cerrar() { ajustes.fijado = false; guardarAjustes(); poner(false); estado(); }
// Ctrl+Alt+A: abre fijado en la pestaña Alarmas (con foco); si ya está en Alarmas, cierra
const pestanaActual = () => win.webContents.executeJavaScript(`document.querySelector('[data-tab][aria-selected="true"]')?.dataset.tab`).catch(() => null);
function abrirAlarmas() { fijar(true); win.focus(); win.webContents.send('pestana', 'alarmas'); Alarmas.sincronizar(); }
async function atajoAlarmas() { if (abierto && await pestanaActual() === 'alarmas') cerrar(); else abrirAlarmas(); }
function fijar(b) { ajustes.fijado = !!b; guardarAjustes(); if (b) abrir(); estado(); tray && tray.setContextMenu(menu()); }
function alternar() { // Ctrl+Alt+P: abre fijado / cierra
  if (abierto) cerrar(); else fijar(true);
}

// sondeo del cursor cada 80 ms: borde derecho -> abre; 700 ms fuera -> cierra (si no está fijado)
function sondear() {
  if (HUMO) return;
  const p = screen.getCursorScreenPoint(), a = area(), enY = p.y >= a.y && p.y < a.y + a.height;
  if (!abierto) { if (enY && p.x >= a.x + a.width - 2) abrir(); return; }
  if (ajustes.fijado || (enY && p.x >= a.x + a.width - PW)) { fuera = 0; return; }
  if (!fuera) fuera = Date.now(); else if (Date.now() - fuera >= 700) poner(false);
}

// ---- inicio con Windows y bandeja
const LNK = () => path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Panel.lnk');
function aplicarInicio() { // acceso directo en la carpeta Inicio (la entrada de Run la omite Windows en este equipo)
  if (HUMO || process.env.PANEL_SIN_INICIO === '1') return;
  try {
    app.setLoginItemSettings({ openAtLogin: false, name: 'Panel', path: process.execPath, args: [__dirname] }); // borra la entrada antigua de Run
    if (ajustes.iniciarConWindows) shell.writeShortcutLink(LNK(), 'create', { target: process.execPath, args: app.isPackaged ? '' : `"${__dirname}"`, cwd: __dirname, icon: process.execPath });
    else fs.rmSync(LNK(), { force: true });
  } catch (e) { log('inicio ' + e.message); }
}
const menu = () => Menu.buildFromTemplate([
  { label: 'Abrir panel', click: abrir },
  { label: 'Fijar abierto', type: 'checkbox', checked: !!ajustes.fijado, click: i => fijar(i.checked) },
  { label: 'Actualizar ahora', click: actualizar },
  { type: 'separator' },
  ...Alarmas.menuItems(),
  { type: 'separator' },
  { label: 'Iniciar con Windows', type: 'checkbox', checked: !!ajustes.iniciarConWindows, click: i => { ajustes.iniciarConWindows = i.checked; guardarAjustes(); aplicarInicio(); } },
  { label: 'Salir', click: () => app.quit() },
]);
function crearBandeja() {
  tray = new Tray(nativeImage.createFromPath(ICONO).resize({ width: 16, height: 16 }));
  tray.setToolTip('Panel · Ctrl+Alt+P abrir/cerrar · Ctrl+Alt+A nueva alarma · Ctrl+Alt+D descartar');
  tray.setContextMenu(menu());
  tray.on('click', () => abierto ? cerrar() : abrir());
}

// ---- IPC
ipcMain.on('abrir-correo', (_, id) => { if (Correo && typeof id === 'string') Promise.resolve(Correo.abrir(id)).catch(e => log('abrir correo ' + e.message)); });
ipcMain.on('abrir-outlook', () => { try { spawn('cmd', ['/c', 'start', '', 'outlook'], { detached: true, windowsHide: true, stdio: 'ignore' }).unref(); } catch (e) { log('outlook ' + e.message); } });
ipcMain.on('fijar', (_, b) => fijar(b === true));
ipcMain.on('actualizar', actualizar);
ipcMain.on('cerrar', cerrar);

app.whenReady().then(async () => {
  AJUSTES = path.join(app.getPath('userData'), 'ajustes.json');
  try { ajustes = { ...ajustes, ...JSON.parse(fs.readFileSync(AJUSTES, 'utf8')) }; } catch {}
  crearVentana();
  Alarmas.iniciar({ app, log, HUMO, alAbrir: abrirAlarmas, ventanas: () => [win] });
  crearBandeja(); aplicarInicio();
  if (!globalShortcut.register('CommandOrControl+Alt+P', alternar)) log('no se pudo registrar Ctrl+Alt+P');
  if (!globalShortcut.register('CommandOrControl+Alt+A', atajoAlarmas)) log('no se pudo registrar Ctrl+Alt+A');
  if (!globalShortcut.register('CommandOrControl+Alt+D', Alarmas.descartar)) log('no se pudo registrar Ctrl+Alt+D');
  screen.on('display-metrics-changed', colocar);
  setInterval(sondear, 80);
  if (HUMO) return humo();
  estado(); if (ajustes.fijado) abrir();
  actualizar();
  setInterval(leerCorreo, 6e4); setInterval(leerMeteo, 18e5);
});
app.on('will-quit', () => globalShortcut.unregisterAll());

// ---- prueba de humo
async function humo() {
  const ahora = Date.now(), iso = ms => new Date(ms - new Date(ms).getTimezoneOffset() * 6e4).toISOString().slice(0, 19);
  const h = 36e5, d = 864e5, fallos = [], h0 = new Date().setHours(0, 0, 0, 0);
  const de = ['Ana García', 'Banco Norte', 'Equipo de Proyectos', 'Luis Pérez', 'GitHub', 'Marta Ruiz', 'Newsletter Semanal', 'Carlos Vega'];
  const as = ['Reunión de mañana: confirmar asistencia y orden del día', 'Resumen de tu cuenta', 'Planificación del trimestre', 'Re: presupuesto', 'Nuevo inicio de sesión', 'Cena del viernes', 'Las novedades de la semana', 'Factura 2026-114'];
  enviar('correo', { ok: true, noLeidos: 3, correos: de.map((x, i) => ({ id: 'c' + i, de: x, asunto: as[i], fecha: iso(ahora - i * 7 * h), leido: i > 2 })),
    agenda: [{ titulo: 'Reunión de equipo', inicio: iso(h0 + 10 * h), fin: iso(h0 + 11 * h), todoDia: false, lugar: '' }, { titulo: 'Cumpleaños de Marta', inicio: iso(h0), fin: iso(h0 + d), todoDia: true, lugar: '' }, { titulo: 'Dentista', inicio: iso(h0 + d + 10 * h), fin: iso(h0 + d + 11 * h), todoDia: false, lugar: 'Clínica' }] });
  const nd = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'], ic = ['☀️', '⛅', '🌧️', '☁️', '🌤️'];
  enviar('meteo', { ok: true, lugar: { nombre: 'Madrid', lat: 40.4, lon: -3.7 }, actual: { temp: 18, codigo: 1, texto: 'Mayormente despejado', icono: '🌤️', viento: 14 },
    horas: Array.from({ length: 12 }, (_, i) => ({ hora: iso(ahora + i * h).slice(0, 14) + '00', temp: 14 + (i % 6), icono: ic[i % 5], lluvia: (i * 7) % 60 })),
    dias: nd.map((n, i) => ({ fecha: iso(ahora + i * d).slice(0, 10), nombre: n, max: 20 + i, min: 9 + i, icono: ic[i], texto: '', lluvia: i * 15 })) });
  Alarmas.datosHumo();
  enviar('sistema', { cpu: 23, ramUsada: 9.5e9, ramTotal: 16e9, discoLibre: 180e9, discoTotal: 500e9 });
  abrir();
  await new Promise(r => setTimeout(r, 1500));
  const salida = path.join(require('os').tmpdir(), 'panel-humo'); fs.mkdirSync(salida, { recursive: true });
  const js = (w, c) => w.webContents.executeJavaScript(c), esp = ms => new Promise(r => setTimeout(r, ms));
  const captura = async (n, w) => { try { fs.writeFileSync(path.join(salida, n + '.png'), (await w.webContents.capturePage()).toPNG()); } catch (e) { fallos.push('captura ' + n + ': ' + e.message); } };
  for (const t of ['alarmas', 'correo', 'agenda', 'tiempo', 'sistema']) {
    if (!await js(win, `(b => b ? (b.click(), true) : false)(document.querySelector('button[data-tab="${t}"]'))`)) { fallos.push('falta el botón de la pestaña ' + t); continue; }
    if (t === 'alarmas') { // el botón de sincronizar responde (en humo, sin leer nada real)
      await js(win, `document.getElementById('al-refrescar')?.click()`); await esp(500);
      const est = await js(win, `document.getElementById('al-estado')?.textContent || ''`);
      if (!/humo/.test(est)) fallos.push('botón sincronizar: ' + est);
      const vd = await js(win, `document.getElementById('al-ventana')?.value`);
      if (vd !== '14') fallos.push('ventana en días: ' + vd + ' (esperada 14)');
    }
    await esp(300); await captura('panel-' + t, win);
  }
  await captura('overlay', Alarmas.overlay());
  const n = (w, s) => js(w, `document.querySelectorAll('${s}').length`);
  for (const [s, esperadas] of [['.fila', 12], ['.fila-correo', 8], ['.evento', 3]]) { const v = await n(win, s); if (v !== esperadas) fallos.push(`${s}: ${v} (esperadas ${esperadas})`); }
  const tarjetas = await n(Alarmas.overlay(), '.tarjeta');
  if (tarjetas !== 5) fallos.push('tarjetas visibles: ' + tarjetas + ' (esperadas 5)');
  console.log(fallos.length ? 'HUMO FALLA\n' + fallos.join('\n') : 'HUMO OK · capturas en ' + salida);
  app.exit(fallos.length ? 1 : 0);
}
