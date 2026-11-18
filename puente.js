// Puente con Post-It y Outlook, de SOLO LECTURA: trae a las fichas las alarmas ⏰ de las notas de Post-It y los eventos de Outlook con la etiqueta «Alarma».
// Reutiliza eventos.js (Outlook clásico abierto o enlace ICS) y sync.js (notas) de Post-It, sin duplicar el lector: su carpeta sale de GESTOR_POSTIT
// o, por defecto, C:\Github\Post-It-App. Si no está, el Gestor funciona igual sin el puente. Nada se guarda en disco: lo traído vive en memoria.
const fs = require('fs'), path = require('path');

const RAIZ = process.env.GESTOR_POSTIT || 'C:\\Github\\Post-It-App';
const ETIQUETA = 'Alarma';       // categoría de Outlook que marca los eventos que se quieren en el panel
const AVISO_MS = 10 * 60e3;      // suena 10 min antes del inicio (ponytail: fijo; el recordatorio propio de Outlook exigiría ampliar outlook.ps1 de Post-It)
const VENTANA_MS = 14 * 864e5;   // solo lo que ocurre en los próximos 14 días
const VISIBLE_MS = 60e3;         // como el resto de alarmas: la ficha sigue 60 s tras llegar a cero
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const dentro = (t, ahora, ventana = VENTANA_MS) => t > ahora - VISIBLE_MS && t <= ahora + ventana;

// Alarmas ⏰ de las notas de Post-It: n.alarms = [{t: '2026-10-26T18:30' (hora local), txt}]. Salen mudas: el aviso sonoro lo da Post-It.
function alarmasDeNotas(notas, ahora, ventana = VENTANA_MS) {
  const out = [];
  for (const n of notas || []) for (const a of n.alarms || []) {
    const t = new Date(a.t).getTime();
    if (!Number.isFinite(t) || !dentro(t, ahora, ventana)) continue;
    out.push({ id: `postit:${n.id}|${a.t}`, tipo: 'fecha', nombre: String(a.txt || 'Alarma').slice(0, 60), objetivo: t, origen: 'postit', silencioso: true, avisada: true });
  }
  return out;
}

// Eventos de Outlook {id, titulo, inicio (ISO local), todo_dia, categoria} cuya categoría esté entre las `etiquetas` elegidas, con hora y dentro del límite de días de SU etiqueta.
// `etiquetas` = [{ nombre, dias }] (o un nombre suelto + `ventana` en ms, como antes). Cuentan hacia el inicio y suenan AVISO_MS antes (`aviso`, ver fase() en tiempo.js).
const topes = (etiquetas, ventana) => new Map((typeof etiquetas === 'string' ? [{ nombre: etiquetas, dias: ventana / 864e5 }] : etiquetas || []).map(t => [norm(t.nombre), t.dias * 864e5]));
function eventosAAlarmas(eventos, ahora, etiquetas = ETIQUETA, ventana = VENTANA_MS) {
  const out = [], lim = topes(etiquetas, ventana);
  for (const e of eventos || []) {
    const ms = lim.get(norm(e.categoria));
    if (e.todo_dia || ms === undefined) continue;
    const t = new Date(e.inicio).getTime();
    if (!Number.isFinite(t) || !dentro(t, ahora, ms)) continue;
    out.push({ id: `outlook:${e.id}`, tipo: 'fecha', nombre: String(e.titulo || 'Evento').slice(0, 60), objetivo: t, origen: 'outlook', aviso: AVISO_MS, avisada: true });
  }
  return out;
}

// El ICS de Outlook web no trae categorías. Cuando Outlook clásico está abierto se recuerda título→categoría (`cache`, el main la guarda) y los eventos del ICS
// se etiquetan por su título. ponytail: un evento nuevo solo se etiqueta si Outlook estuvo abierto después de crearlo; tope de 2000 títulos, el más viejo sale primero.
// Dos claves: «título|inicio» (exacta: no confunde dos eventos con el mismo título) y «título» (para los nuevos, solo si todos los vistos con ese título coinciden).
const clave = e => norm(e.titulo) + '|' + e.inicio;
function recordarCategorias(cache, eventos) {
  const porTitulo = new Map();
  for (const e of eventos || []) {
    const t = norm(e.titulo); if (!t) continue;
    if (e.categoria) cache[clave(e)] = e.categoria; else delete cache[clave(e)];
    if (!porTitulo.has(t)) porTitulo.set(t, new Set());
    porTitulo.get(t).add(e.categoria || '');
  }
  for (const [t, cs] of porTitulo) { const c = [...cs][0]; if (cs.size === 1 && c) cache[t] = c; else delete cache[t]; }
  const k = Object.keys(cache); if (k.length > 2000) for (const x of k.slice(0, k.length - 2000)) delete cache[x];
  return cache;
}
const etiquetar = (eventos, cache) => (eventos || []).map(e => e.categoria ? e : { ...e, categoria: cache[clave(e)] || cache[norm(e.titulo)] || '' });

const leer = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

// → { ok, postit: [alarmas], outlook: [alarmas] | null (null = no se pudo leer: que el llamador conserve lo anterior), fuente }
async function sincronizar(appData, ahora = Date.now(), cache = {}, ventana = VENTANA_MS, etiquetas = [{ nombre: ETIQUETA, dias: ventana / 864e5 }]) { // `ventana`: días de Post-It; cada etiqueta lleva los suyos
  let P;
  try { P = { E: require(path.join(RAIZ, 'eventos.js')), S: require(path.join(RAIZ, 'sync.js')) }; }
  catch { return { ok: false, motivo: 'No encuentro Post-It en ' + RAIZ }; }
  const base = path.join(appData, 'post-it'), carpeta = (leer(path.join(base, 'sync.json')) || {}).sync || path.join(base, 'datos');
  const { notas, ajustes, colores } = P.S.fusionar(P.S.leerSync(carpeta));
  const o = await P.E.obtener({ ics: ajustes.ics, cache: colores && colores.titulos ? colores : P.E.cacheVacia(), desde: new Date(ahora), hasta: new Date(ahora + Math.max(120 * 864e5, ventana + 2 * 864e5, ...etiquetas.map(t => (t.dias + 2) * 864e5))) }); // mínimo 120 días: así la memoria de categorías aprende también lo lejano
  const leido = o.fuente === 'outlook' || o.fuente === 'ics';
  if (o.fuente === 'outlook') recordarCategorias(cache, o.eventos);
  const eventos = o.fuente === 'ics' ? etiquetar(o.eventos, cache) : o.eventos;
  return { ok: true, postit: alarmasDeNotas(notas, ahora, ventana), outlook: leido ? eventosAAlarmas(eventos, ahora, etiquetas) : null, fuente: o.fuente };
}

module.exports = { sincronizar, alarmasDeNotas, eventosAAlarmas, recordarCategorias, etiquetar, ETIQUETA, AVISO_MS };
