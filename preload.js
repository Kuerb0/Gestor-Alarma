const { contextBridge, ipcRenderer } = require('electron');
const CANALES = ['correo', 'meteo', 'sistema', 'estado', 'pestana', 'tema', 'actualizacion', 'widgets', 'widgetsCfg', 'nuevo-evento', 'notas', 'widget:tema'];
contextBridge.exposeInMainWorld('api', {
  on: (canal, fn) => { if (CANALES.includes(canal)) ipcRenderer.on(canal, (_, d) => fn(d)); },
  abrirCorreo: id => ipcRenderer.send('abrir-correo', id),
  marcarLeidos: ids => ipcRenderer.send('marcar-leidos', ids),
  agendaMas: () => ipcRenderer.send('agenda-mas'),
  crearEvento: ev => ipcRenderer.invoke('crear-evento', ev),
  abrirOutlook: () => ipcRenderer.send('abrir-outlook'),
  buzonContar: () => ipcRenderer.invoke('buzon:contar'),
  buzonMarcar: () => ipcRenderer.invoke('buzon:marcar'),
  borrarEvento: ev => ipcRenderer.invoke('agenda:borrar', ev),
  editarEvento: ev => ipcRenderer.invoke('agenda:editar', ev),
  notasLeer: () => ipcRenderer.invoke('notas:leer'),
  notasAnadir: t => ipcRenderer.invoke('notas:anadir', t),
  notasGuardar: lista => ipcRenderer.invoke('notas:guardar', lista),
  usoCategorias: () => ipcRenderer.invoke('uso:categorias'),
  usoGuardarCategorias: c => ipcRenderer.invoke('uso:guardarCategorias', c),
  usoSinClasificar: () => ipcRenderer.invoke('uso:sinClasificar'),
  usoSugerencias: () => ipcRenderer.invoke('uso:sugerencias'),
  usoDatos: (d, h) => ipcRenderer.invoke('uso:datos', d, h),
  usoImportar: t => ipcRenderer.invoke('uso:importar', t),
  buscarCiudad: t => ipcRenderer.invoke('lugares:buscar', t),
  anadirCiudad: l => ipcRenderer.invoke('lugares:anadir', l),
  quitarCiudad: k => ipcRenderer.invoke('lugares:quitar', k),
  widget: (tipo, poner, cfg) => ipcRenderer.send('widget:poner', tipo, !!poner, cfg), // widgets del escritorio
  widgetAlto: h => ipcRenderer.send('widget:alto', h),
  widgetTam: (ancho, alto, fin, ancla) => ipcRenderer.send('widget:tam', ancho, alto, fin === true, ancla),
  widgetMover: (dx, dy, fin) => ipcRenderer.send('widget:mover', dx, dy, fin === true),
  widgetDuplicar: () => ipcRenderer.send('widget:duplicar'),
  widgetEstilo: e => ipcRenderer.send('widget:estilo', e),
  widgetCfg: c => ipcRenderer.send('widget:cfg', c),
  widgetTema: t => ipcRenderer.send('widget:tema', t), // tema de contraste del widget: auto | claro | oscuro | claroscuro | velado | contraste
  widgetCerrar: () => ipcRenderer.send('widget:cerrar'),
  fijar: b => ipcRenderer.send('fijar', !!b),
  actualizar: () => ipcRenderer.send('actualizar'),
  cerrar: () => ipcRenderer.send('cerrar'),
  instalarActualizacion: () => ipcRenderer.send('actualizacion:instalar'),
  masTarde: () => ipcRenderer.send('actualizacion:tarde'),
});
// API del motor de alarmas (la usan la pestaña Alarmas y el overlay)
contextBridge.exposeInMainWorld('alarmas', {
  lista: () => ipcRenderer.invoke('alarmas:lista'),
  crear: r => ipcRenderer.invoke('alarmas:crear', r),
  editar: (id, r) => ipcRenderer.invoke('alarmas:editar', id, r),
  borrar: id => ipcRenderer.invoke('alarmas:borrar', id),
  ocultar: id => ipcRenderer.invoke('alarmas:ocultar', id), // quita una alarma traída de Outlook (sigue en Outlook)
  cerrar: () => ipcRenderer.send('cerrar'), // cierra el panel
  formato: () => ipcRenderer.invoke('ajustes:formato'),
  alFormato: cb => ipcRenderer.on('formato', (_, f) => cb(f)),
  syncEstado: () => ipcRenderer.invoke('sync:estado'),
  syncAhora: () => ipcRenderer.invoke('sync:ahora'),
  syncVentana: d => ipcRenderer.invoke('sync:ventana', d),
  syncEtiquetas: l => ipcRenderer.invoke('sync:etiquetas', l),
  alSync: cb => ipcRenderer.on('sync', (_, s) => cb(s)),
  alCambiar: cb => ipcRenderer.on('alarmas', (_, l) => cb(l)),
  agenda: () => ipcRenderer.invoke('agenda:lista'), // eventos de la agenda (los que están pasando salen como cuadrados en el overlay)
  alAgenda: cb => ipcRenderer.on('agenda', (_, l) => cb(l)),
  silencioHasta: () => ipcRenderer.invoke('silencio:hasta'), // no molestar: hasta cuándo (ms desde 1970; 0 = no)
  alSilencio: cb => ipcRenderer.on('silencio', (_, h) => cb(h)),
});
