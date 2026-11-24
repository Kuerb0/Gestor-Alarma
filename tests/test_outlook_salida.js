// node tests/test_outlook_salida.js  → debe acabar en "TEST OK"
const assert = require('assert');
const O = require('../outlook_salida');
const AHORA = 1e12;
const f = (id, extra = {}) => ({ id, tipo: 'fecha', nombre: 'Examen ' + id, objetivo: AHORA + 36e5, ...extra });

// qué se crea / actualiza / borra
const alarmas = [
  f('a'),                                                              // nueva → crear
  f('b', { outlookId: 'E1', outlookHuella: `Examen b|${AHORA + 36e5}` }), // ya sincronizada y sin cambios → nada
  f('c', { outlookId: 'E2', outlookHuella: 'otro|1' }),               // cambió → actualizar
  f('d', { tipo: 'cuenta' }), f('e', { tipo: 'crono' }), f('g', { tipo: 'recurrente' }), // otros tipos: no van a Outlook
  f('h', { origen: 'outlook' }), f('i', { origen: 'postit' }),         // las traídas de fuera no se reexportan
  f('j', { objetivo: AHORA - 1 }), f('k', { descartada: true }),       // pasadas o descartadas: no se crean
];
const ops = O.planificar(alarmas, ['E9'], AHORA);
assert.deepStrictEqual(ops.map(o => [o.op, o.id]), [['crear', 'a'], ['actualizar', 'c'], ['borrar', 'borrar:E9']]);
assert.deepStrictEqual([ops[0].inicio, ops[0].nombre, ops[1].entryId], [AHORA + 36e5, 'Examen a', 'E2']);
assert.deepStrictEqual(O.planificar([], [], AHORA), []);

// sin duplicados: el evento exportado vuelve desde Outlook y no se enseña dos veces
const propias = [f('p', { nombre: 'Simulación', objetivo: AHORA + 5e5 })];
const externas = [
  { id: 'outlook:1', tipo: 'fecha', nombre: 'Simulacion', objetivo: AHORA + 5e5 + 3e4, origen: 'outlook' },   // mismo título (sin acento) y hora: duplicado
  { id: 'outlook:2', tipo: 'fecha', nombre: 'Simulación', objetivo: AHORA + 9e8, origen: 'outlook' },          // mismo título, otra fecha: se queda
  { id: 'outlook:3', tipo: 'fecha', nombre: 'Otra cosa', objetivo: AHORA + 5e5, origen: 'outlook' },           // misma hora, otro título: se queda
  { id: 'postit:1', tipo: 'fecha', nombre: 'Simulación', objetivo: AHORA + 5e5, origen: 'postit' },           // de Post-It: no se toca
];
assert.deepStrictEqual(O.sinDuplicadas(propias, externas).map(e => e.id), ['outlook:2', 'outlook:3', 'postit:1']);
// lo fijado desde la Agenda ya existe en Outlook: no se exporta
assert.deepStrictEqual(O.planificar([f('x', { deAgenda: true }), f('y')], [], AHORA).map(o => o.id), ['y']);

// sin copias «Alarma»: se oculta la que el Gestor exportó junto a su evento original
const ev = (titulo, categoria, ini) => ({ titulo, categoria, inicio: new Date(ini).toISOString() });
const ag = [
  ev('Examen Simulación', 'ATENCIÓN', AHORA),            // original
  ev('Examen Simulación ', 'Alarma', AHORA + 1e3),        // copia (espacio final): se quita
  ev('Solo alarma', 'Alarma', AHORA),                      // sin original: se queda
  ev('Reunión', 'Trabajo', AHORA), ev('Reunión', 'Trabajo', AHORA + 864e5), // mismo título, otra hora: se quedan
  ev('Reunión', 'Alarma', AHORA + 2 * 864e5),              // «Alarma» a otra hora que el original: se queda
];
assert.deepStrictEqual(O.sinCopiasAlarma(ag).map(e => e.titulo + '|' + e.categoria), ['Examen Simulación|ATENCIÓN', 'Solo alarma|Alarma', 'Reunión|Trabajo', 'Reunión|Trabajo', 'Reunión|Alarma']);

// ---- reconciliar: Outlook manda (las alarmas ligadas a un evento copian título, hora, color y categoría)
const iso = ms => new Date(ms - new Date(ms).getTimezoneOffset() * 6e4).toISOString().slice(0, 19), IN = AHORA + 36e5;
const evt = (id, extra = {}) => ({ id, titulo: 'Examen ' + id, inicio: iso(IN), fin: iso(IN + 36e5), todoDia: false, categoria: '', color: null, recurrente: false, ...extra });
const rec = (alarmas, agenda) => O.reconciliar(alarmas, agenda, AHORA);
const lig = (id, extra = {}) => f(id, { eventoId: 'ID-' + id, inicioEv: iso(IN), ...extra }); // puesta desde la Agenda
// sin cambios → nada
assert.deepStrictEqual(rec([lig('a')], [evt('ID-a', { titulo: 'Examen a' })]), []);
// renombrado (con espacios de más; 60 car.)
assert.deepStrictEqual(rec([lig('a')], [evt('ID-a', { titulo: '  Examen   final  ' })]), [{ id: 'a', cambios: { nombre: 'Examen final' } }]);
assert.strictEqual(rec([lig('a')], [evt('ID-a', { titulo: 'x'.repeat(100) })])[0].cambios.nombre.length, 60);
// movido: nueva hora y nuevo inicioEv (no recurrente)
const mov = IN + 2 * 36e5;
assert.deepStrictEqual(rec([lig('a', { nombre: 'Examen a' })], [evt('ID-a', { titulo: 'Examen a', inicio: iso(mov) })]), [{ id: 'a', cambios: { objetivo: new Date(iso(mov)).getTime(), inicioEv: iso(mov) } }]);
// categoría y color
assert.deepStrictEqual(rec([lig('a')], [evt('ID-a', { titulo: 'Examen a', categoria: 'Trabajo', color: '#e5533d' })]), [{ id: 'a', cambios: { color: '#e5533d', categoria: 'Trabajo' } }]);
assert.deepStrictEqual(rec([lig('a', { categoria: 'Trabajo', color: '#e5533d' })], [evt('ID-a', { titulo: 'Examen a', categoria: 'Salud', color: '#3a86ff' })]), [{ id: 'a', cambios: { color: '#3a86ff', categoria: 'Salud' } }]);
assert.deepStrictEqual(rec([lig('a', { categoria: 'Trabajo' })], [evt('ID-a', { titulo: 'Examen a', color: 'rojo' })]), [{ id: 'a', cambios: { categoria: '' } }], 'categoría quitada; color no válido ignorado');
// todo el día: ese día a las 09:00
{ const d = new Date(AHORA + 3 * 864e5), t9 = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9).getTime(), ini = iso(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
  assert.deepStrictEqual(rec([lig('a', { nombre: 'Cumple' })], [evt('ID-a', { titulo: 'Cumple', inicio: ini, todoDia: true })]), [{ id: 'a', cambios: { objetivo: t9, inicioEv: ini } }]); }
// serie: solo si coincide el inicio de la ocurrencia
const serie = [evt('ID-a', { titulo: 'Examen a', recurrente: true, categoria: 'Trabajo' })];
assert.deepStrictEqual(rec([lig('a')], serie), [{ id: 'a', cambios: { categoria: 'Trabajo' } }], 'coincide inicioEv');
assert.deepStrictEqual(rec([lig('a', { inicioEv: iso(IN + 864e5) })], serie), [], 'otra ocurrencia: no se toca');
assert.deepStrictEqual(rec([f('b', { outlookId: 'S1', outlookHuella: `Examen b|${IN}` })], [evt('S1', { titulo: 'Otro', recurrente: true })]), [], 'exportada sin inicioEv en serie: no se toca');
// evento ausente
assert.deepStrictEqual(rec([lig('a')], [evt('OTRO')]), []);
assert.deepStrictEqual(rec([lig('a')], []), []);
// edición local pendiente (exportada con huella distinta): gana lo de aquí
assert.deepStrictEqual(rec([f('c', { outlookId: 'E1', outlookHuella: 'viejo|1' })], [evt('E1', { titulo: 'Desde Outlook' })]), []);
// exportada al día: sigue a Outlook
assert.deepStrictEqual(rec([f('c', { outlookId: 'E1', outlookHuella: `Examen c|${IN}` })], [evt('E1', { titulo: 'Desde Outlook' })]), [{ id: 'c', cambios: { nombre: 'Desde Outlook' } }]);
// no se toca: traídas de fuera, otros tipos, descartadas, pasadas hace más de un minuto, sin enlace
assert.deepStrictEqual(rec([lig('a', { origen: 'outlook' }), lig('b', { tipo: 'cuenta' }), lig('c', { descartada: true }), lig('d', { objetivo: AHORA - 61000 }), f('e')],
  [evt('ID-a', { titulo: 'N' }), evt('ID-b', { titulo: 'N' }), evt('ID-c', { titulo: 'N' }), evt('ID-d', { titulo: 'N' }), evt('e', { titulo: 'N' })]), []);
assert.strictEqual(rec([lig('d', { objetivo: AHORA - 30000, nombre: 'Examen d' })], [evt('ID-d', { titulo: 'Nuevo' })]).length, 1, 'sonando ahora: se sigue');
// tras aplicar y recalcular la huella, planificar() no la devuelve a Outlook (sin bucle)
{ const a = f('c', { outlookId: 'E1', outlookHuella: `Examen c|${IN}` }), ag = [evt('E1', { titulo: 'Renombrado', inicio: iso(mov) })];
  const [r] = rec([a], ag); Object.assign(a, r.cambios); a.outlookHuella = O.huella(a);
  assert.deepStrictEqual(O.planificar([a], [], AHORA), [], 'sin actualizar tras seguir a Outlook');
  assert.deepStrictEqual(rec([a], ag), [], 'y una segunda lectura ya no cambia nada'); }
console.log('TEST OK');
