const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, screen, nativeImage, shell, nativeTheme, systemPreferences, Notification } = require('electron');
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const Act = require('./actualizar'); // versiones nuevas en GitHub Releases
const Alarmas = require('./alarmas'); // motor del antiguo Gestor-Alarmas (overlay, datos, Post-It/Outlook)

const HUMO = process.argv.includes('--humo'); // prueba: userData temporal, datos inventados, captura y salir
const ICONO = path.join(__dirname, 'assets', 'icon.png');
const PW = 380; // ancho del panel
let AJUSTES, ajustes = { fijado: false, iniciarConWindows: true, lugar: null }, win, raya, tray, anim = 0, acento = '#4a9eff';
nativeTheme.themeSource = HUMO && process.env.PANEL_TEMA === 'light' ? 'light' : 'system'; // el CSS sigue prefers-color-scheme
let diasAgenda = 7, cerradoDesde = 0, extraHumo = [], abierto = false, fuera = 0, ultCorreo = 0, leyendoCorreo = false, tSistema = null, bueno = {}, cache = {};

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
const enviar = (canal, dato) => { cache[canal] = dato; win && !win.isDestroyed() && win.webContents.send(canal, dato); if (canal === 'correo') agendaAlOverlay(); };
// agenda para el overlay: pinta como rectángulo el evento en curso (con hora) y colorea las alarmas
const eventosOverlay = () => ((cache.correo && cache.correo.agenda) || []).map(e => ({ titulo: e.titulo, inicio: e.inicio, fin: e.fin, todoDia: e.todoDia, color: e.color })); // también los de todo el día: dan color a las alarmas del mismo nombre
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
const estado = () => enviar('estado', { abierto, fijado: ajustes.fijado });

// ---- lecturas (si falla, se conserva el último dato bueno y se marca `obsoleto`)
const conservar = (canal, r) => { if (r && r.ok) bueno[canal] = r; enviar(canal, r && r.ok ? r : bueno[canal] ? { ...bueno[canal], obsoleto: r && r.motivo || 'error' } : r || { ok: false, motivo: 'error' }); };
let pendienteCorreo = false;
async function leerCorreo() { // nunca dos lecturas de Outlook a la vez; si llega otra petición con una en curso, se encadena al acabar
  if (!Correo) return;
  if (leyendoCorreo) { pendienteCorreo = true; return; }
  leyendoCorreo = true;
  try { const r = await Correo.leer({ dias: Math.max(diasAgenda, 14) }); conservar('correo', r.ok ? { ...r, dias: diasAgenda } : r); } // se leen ≥14 días (el overlay colorea alarmas lejanas); la pestaña pinta solo `dias`
  catch (e) { log('correo ' + e.message); conservar('correo', { ok: false, motivo: 'error' }); }
  finally { leyendoCorreo = false; ultCorreo = Date.now(); if (pendienteCorreo) { pendienteCorreo = false; leerCorreo(); } }
}
async function leerMeteo() {
  if (!Meteo) return;
  try { const r = await Meteo.leer(ajustes.lugar || undefined); if (r.ok && !ajustes.lugar) { ajustes.lugar = r.lugar; guardarAjustes(); } conservar('meteo', r); }
  catch (e) { log('meteo ' + e.message); conservar('meteo', { ok: false, motivo: 'error' }); }
}
async function leerSistema() { if (!Sistema) return; try { enviar('sistema', await Sistema.leer()); } catch (e) { log('sistema ' + e.message); } }
const actualizar = () => { leerCorreo(); leerMeteo(); if (abierto) leerSistema(); };

// ---- ventana: acrílico nativo (cubre toda la ventana), así que escondida se oculta; la «raya» del borde es otra ventanita aparte
const area = () => screen.getPrimaryDisplay().workArea;
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
  clearInterval(tSistema); tSistema = null;
  if (v) { leerSistema(); tSistema = setInterval(leerSistema, 2000); if (!HUMO && Date.now() - ultCorreo > 15e3) leerCorreo(); }
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
let completa = false, vigia = null;
function aplicarCompleta() {
  if (completa && abierto && !ajustes.fijado) poner(false);
  if (raya && !raya.isDestroyed()) completa || abierto ? raya.hide() : raya.showInactive();
  const ov = Alarmas.overlay(); if (ov && !ov.isDestroyed()) completa ? ov.hide() : ov.showInactive();
  pintarAct();
}
function vigilarCompleta() {
  try {
    vigia = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'pantalla_completa.ps1')], { windowsHide: true });
    vigia.stdout.on('data', d => { const v = String(d).trim().split(/\s+/).pop() === '1'; if (v !== completa) { completa = v; log('pantalla completa ' + v); aplicarCompleta(); } });
    vigia.on('exit', c => { log('vigía de pantalla completa salió ' + c); vigia = null; if (completa) { completa = false; aplicarCompleta(); } });
  } catch (e) { log('vigía ' + e.message); }
}
app.on('will-quit', () => { try { vigia && vigia.kill(); } catch {} });

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
  { type: 'separator' },
  ...Alarmas.menuItems(),
  { type: 'separator' },
  { label: silenciando() ? `No molestar · hasta las ${horaSilencio()}` : 'No molestar', submenu: [
    { label: '30 minutos', click: () => silenciar(30) },
    { label: '1 hora', click: () => silenciar(60) },
    { label: '2 horas', click: () => silenciar(120) },
    ...(silenciando() ? [{ type: 'separator' }, { label: 'Quitar', click: () => silenciar(0) }] : []),
  ] },
  { label: 'Iniciar con Windows', type: 'checkbox', checked: !!ajustes.iniciarConWindows, click: i => { ajustes.iniciarConWindows = i.checked; guardarAjustes(); aplicarInicio(); } },
  { label: 'Salir', click: () => app.quit() },
]);
function crearBandeja() {
  tray = new Tray(nativeImage.createFromPath(ICONO).resize({ width: 16, height: 16 }));
  tray.setToolTip('Gestor-Alarma · Ctrl+Alt+P abrir/cerrar · Ctrl+Alt+A nueva alarma · Ctrl+Alt+D descartar');
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
ipcMain.handle('notas:guardar', (_, lista) => guardarNotas(lista));

ipcMain.on('abrir-outlook', () => { try { spawn('cmd', ['/c', 'start', '', 'outlook'], { detached: true, windowsHide: true, stdio: 'ignore' }).unref(); } catch (e) { log('outlook ' + e.message); } });
ipcMain.on('fijar', (_, b) => fijar(b === true));
ipcMain.on('actualizar', actualizar);
ipcMain.on('cerrar', cerrar);
ipcMain.on('actualizacion:instalar', instalarAct);
ipcMain.on('actualizacion:tarde', () => { if (nueva && !ocupado) { ajustes.masTarde = nueva.version; guardarAjustes(); pintarAct(); } });

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
  vigilarCompleta();
  estado(); if (ajustes.fijado) abrir();
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
  enviar('meteo', { ok: true, lugar: { nombre: 'Madrid', lat: 40.4, lon: -3.7, categoria: 'Personal', color: '#a06bff' }, actual: { temp: 18, codigo: 1, texto: 'Mayormente despejado', icono: '🌤️', viento: 14, humedad: 58, sens: 17, presion: 1016, nubes: 30 },
    horas: hHoy, puntos: puntos(0, hHoy),
    ahora: new Date().getHours() + new Date().getMinutes() / 60,
    dias: nd.map((n, i) => ({ fecha: iso(ahora + i * d).slice(0, 10), nombre: n, max: 20 + i, min: 9 + i, icono: ic[i], texto: 'Soleado', lluvia: i * 15,
      horas: dHoras[i], puntos: puntos(i, dHoras[i]) })) });
  Alarmas.datosHumo();
  enviar('sistema', { cpu: 23, ramUsada: 9.5e9, ramTotal: 16e9, discoLibre: 180e9, discoTotal: 500e9, dispositivos: [{ nombre: 'Ratón', nivel: 72, aprox: false }, { nombre: 'Mando Xbox', nivel: 60, aprox: true }, { nombre: 'Teclado', nivel: 15, aprox: false }] });
  nueva = { version: '9.9.9' }; pintarAct(); // pastilla de «versión nueva» inventada
  abrir();
  await new Promise(r => setTimeout(r, 1500));
  const salida = path.join(require('os').tmpdir(), 'panel-humo'); fs.mkdirSync(salida, { recursive: true });
  const js = (w, c) => w.webContents.executeJavaScript(c), esp = ms => new Promise(r => setTimeout(r, ms));
  const captura = async (n, w) => { try { fs.writeFileSync(path.join(salida, n + '.png'), (await w.webContents.capturePage()).toPNG()); } catch (e) { fallos.push('captura ' + n + ': ' + e.message); } };
  for (const tema of ['', '-claro']) for (const t of ['alarmas', 'correo', 'agenda', 'tiempo', 'notas', 'sistema']) {
    if (tema && t === 'alarmas') { nativeTheme.themeSource = 'light'; await esp(400); }
    if (!await js(win, `(b => b ? (b.click(), true) : false)(document.querySelector('button[data-tab="${t}"]'))`)) { fallos.push('falta el botón de la pestaña ' + t); continue; }
    if (t === 'alarmas' && !tema) { // el botón de sincronizar responde (en humo, sin leer nada real)
      await js(win, `document.getElementById('al-refrescar')?.click()`); await esp(500);
      const est = await js(win, `document.getElementById('al-estado')?.textContent || ''`);
      if (!/humo/.test(est)) fallos.push('botón sincronizar: ' + est);
      const vd = await js(win, `document.getElementById('al-ventana')?.value`);
      if (vd !== '14') fallos.push('ventana en días: ' + vd + ' (esperada 14)');
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
  const tarjetas = await n(Alarmas.overlay(), '.tarjeta');
  if (tarjetas !== 5) fallos.push('tarjetas visibles: ' + tarjetas + ' (esperadas 5)');
  // nuevo: borrar un evento de la agenda (con confirmación), marcar todo el buzón y la página de notas
  await js(win, `document.querySelector('button[data-tab="agenda"]').click()`); await esp(300);
  const evAntes = await n(win, '.evento');
  // editar: lápiz del primer evento con hora -> formulario precargado, cambiar título y 15 min, guardar
  await js(win, `[...document.querySelectorAll('#agenda .evento')].find(e => e.querySelector('.h').textContent !== 'Todo el día').querySelector('.editar-ev').click()`); await esp(200);
  if (await js(win, `document.getElementById('ev-crear').textContent`) !== 'Guardar cambios') fallos.push('editar evento: el formulario no pasa a modo edición');
  await js(win, `(() => { \document.querySelector('.ev-\dur[\data-m="15"]').click(); const t = \document.getElementByI\d('ev-texto'); t.value = 'E\dita\do humo ' + t.value.match(/\\d{1,2}:\\d{2}$/)[0]; t.\dispatchEvent(new Event('input')); })()`);
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
  console.log(fallos.length ? 'HUMO FALLA\n' + fallos.join('\n') : 'HUMO OK · capturas en ' + salida);
  app.exit(fallos.length ? 1 : 0);
}
