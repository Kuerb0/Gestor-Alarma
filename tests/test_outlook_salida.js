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
console.log('TEST OK');
