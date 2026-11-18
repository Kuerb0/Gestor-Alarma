// Caché de Outlook: desdeCache acepta solo un texto válido y reciente, y lo marca como obsoleto
const assert = require('assert');
const { desdeCache } = require('../correo');
const ahora = Date.parse('2026-11-18T12:00:00Z');
const datos = { ok: true, dias: 14, noLeidos: 2, correos: [{ id: 'a', de: 'X', asunto: 'Hola', fecha: '2026-11-18T08:00:00', leido: false }],
  agenda: [{ titulo: 'Reunión', inicio: '2026-11-18T11:00:00', fin: '2026-11-18T12:00:00', todoDia: false, lugar: 'Sala', categoria: 'Trabajo', color: '#4a9eff' }], categorias: [{ nombre: 'Trabajo', color: '#4a9eff' }] };
const txt = (guardado, d = datos) => JSON.stringify({ guardado, datos: d });

const c = desdeCache(txt(ahora - 3600e3), ahora);
assert.strictEqual(c.ok, true); assert.strictEqual(c.obsoleto, 'cache'); assert.strictEqual(c.dias, 14); assert.strictEqual(c.noLeidos, 2);
assert.strictEqual(c.correos[0].asunto, 'Hola'); assert.strictEqual(c.agenda[0].titulo, 'Reunión'); assert.strictEqual(c.agenda[0].color, '#4a9eff'); assert.strictEqual(c.categorias.length, 1);
assert.strictEqual(desdeCache('\uFEFF' + txt(ahora - 1000), ahora).ok, true, 'con BOM');
assert.strictEqual(desdeCache(txt(ahora - 8 * 864e5), ahora), null, 'de hace más de 7 días');
assert.strictEqual(desdeCache(txt(ahora - 6 * 864e5), ahora).ok, true, 'de hace 6 días');
assert.strictEqual(desdeCache(txt(ahora + 3600e3), ahora), null, 'fecha futura');
for (const malo of ['', 'no es json', '{}', 'null', '[]', txt(ahora, { ok: false }), txt(ahora, null), JSON.stringify({ datos }), txt('ayer')]) assert.strictEqual(desdeCache(malo, ahora), null, 'inválido: ' + malo.slice(0, 30));
assert.strictEqual(desdeCache(txt(ahora, { ...datos, dias: 'x' }), ahora).dias, 7, 'dias no válido -> 7');
console.log('test_cache_correo OK');
