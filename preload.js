const { contextBridge, ipcRenderer } = require('electron');
const CANALES = ['correo', 'meteo', 'sistema', 'estado', 'pestana', 'tema', 'actualizacion'];
contextBridge.exposeInMainWorld('api', {
  on: (canal, fn) => { if (CANALES.includes(canal)) ipcRenderer.on(canal, (_, d) => fn(d)); },
  abrirCorreo: id => ipcRenderer.send('abrir-correo', id),
  marcarLeidos: ids => ipcRenderer.send('marcar-leidos', ids),
  agendaMas: () => ipcRenderer.send('agenda-mas'),
  crearEvento: ev => ipcRenderer.invoke('crear-evento', ev),
  abrirOutlook: () => ipcRenderer.send('abrir-outlook'),
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
  cerrar: () => ipcRenderer.send('cerrar'), // cierra el panel
  formato: () => ipcRenderer.invoke('ajustes:formato'),
  alFormato: cb => ipcRenderer.on('formato', (_, f) => cb(f)),
  syncEstado: () => ipcRenderer.invoke('sync:estado'),
  syncAhora: () => ipcRenderer.invoke('sync:ahora'),
  syncVentana: d => ipcRenderer.invoke('sync:ventana', d),
  alSync: cb => ipcRenderer.on('sync', (_, s) => cb(s)),
  alCambiar: cb => ipcRenderer.on('alarmas', (_, l) => cb(l)),
  agenda: () => ipcRenderer.invoke('agenda:lista'), // eventos de la agenda (los que están pasando salen como cuadrados en el overlay)
  alAgenda: cb => ipcRenderer.on('agenda', (_, l) => cb(l)),
});
