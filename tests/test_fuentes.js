const assert = require('node:assert');
const { normalizar, validarEvento } = require('../correo');
const { wmo, armar, leer: leerMeteo } = require('../meteo');

// correo.normalizar: 0, 1 y varios elementos (ConvertTo-Json colapsa arrays)
let r = normalizar('{"ok":true,"noLeidos":0,"correos":[],"agenda":null}');
assert.deepStrictEqual(r, { ok: true, noLeidos: 0, correos: [], agenda: [], categorias: [] });
const c1 = { id: 'A', de: 'X', asunto: 'S', fecha: '2026-11-16T09:00:00', leido: false };
r = normalizar(JSON.stringify({ ok: true, noLeidos: 1, correos: c1, agenda: { titulo: 'T', inicio: '2026-11-16T10:00:00', fin: '2026-11-16T11:00:00', todoDia: false, lugar: '' } }));
assert.deepStrictEqual(r.correos, [c1]); assert.strictEqual(r.agenda.length, 1); assert.strictEqual(r.noLeidos, 1);
r = normalizar(JSON.stringify({ ok: true, noLeidos: 2, correos: [c1, { ...c1, id: 'B', leido: true }], agenda: [] }));
assert.strictEqual(r.correos.length, 2); assert.strictEqual(r.correos[1].leido, true);
assert.strictEqual(normalizar('basura').ok, false);
assert.strictEqual(normalizar('{"ok":false}').motivo, 'error');

// leer: valida `dias` antes de llamar a Outlook (sin tocarlo)
(async () => { const { leer } = require('../correo'); for (const mal of [0, 121, 1.5, '7', null, NaN]) { const x = await leer({ dias: mal }); assert.strictEqual(x.ok, false, 'dias ' + mal); assert.match(x.detalle, /dias/); } })();

// wmo
assert.strictEqual(wmo(0).icono, '☀️'); assert.strictEqual(wmo(3).texto, 'Nublado');
assert.strictEqual(wmo(48).texto, 'Niebla'); assert.strictEqual(wmo(63).texto, 'Lluvia');
assert.strictEqual(wmo(81).texto, 'Chubascos'); assert.strictEqual(wmo(86).icono, '❄️');
assert.strictEqual(wmo(99).icono, '⛈️'); assert.ok(wmo(1234).texto);

// armar: 2026-11-16 es lunes; son las 14:15 -> las horas son las 24 de hoy desde las 00:00 y ahora = 14.25
const horasT = [], dias = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
for (let d = 16; d <= 17; d++) for (let h = 0; h < 24; h++) horasT.push(`2026-11-${d}T${String(h).padStart(2, '0')}:00`);
const n = horasT.length;
const j = {
  current: { time: '2026-11-16T14:15', temperature_2m: 17.6, weather_code: 3, wind_speed_10m: 12.4 },
  hourly: { time: horasT, temperature_2m: horasT.map((_, i) => i + 0.4), weather_code: Array(n).fill(61), precipitation_probability: Array(n).fill(30) },
  daily: { time: dias, weather_code: [0, 3, 61, 71, 95], temperature_2m_max: [20.5, 18, 15, 9, 12], temperature_2m_min: [10.2, 9, 8, 1, 4], precipitation_probability_max: [0, 10, 80, 60, 90] },
};
const lugar = { nombre: 'Madrid', lat: 40.4, lon: -3.7 };
const m = armar(j, lugar, new Date(2026, 10, 16, 14, 20));
assert.strictEqual(m.ok, true); assert.deepStrictEqual(m.lugar, lugar);
assert.deepStrictEqual(m.actual, { temp: 18, codigo: 3, texto: 'Nublado', icono: '☁️', viento: 12 });
assert.strictEqual(m.horas.length, 24); assert.strictEqual(m.horas[0].hora, '00:00'); assert.strictEqual(m.horas[23].hora, '23:00'); assert.strictEqual(m.horas[0].temp, 0.4); assert.strictEqual(m.ahora, 14.25);
assert.strictEqual(m.horas[0].icono, '🌧️'); assert.strictEqual(m.horas[0].lluvia, 30);
assert.strictEqual(m.dias.length, 5);
assert.deepStrictEqual(m.dias.map(d => d.nombre), ['Hoy', 'Mañana', 'Mié', 'Jue', 'Vie']);
assert.strictEqual(m.dias[0].max, 21); assert.strictEqual(m.dias[0].min, 10); assert.strictEqual(m.dias[2].lluvia, 80);


// agenda con categoría y color
r = normalizar(JSON.stringify({ ok: true, noLeidos: 0, correos: [], agenda: [{ titulo: 'A', inicio: 'i', fin: 'f', todoDia: false, lugar: '', categoria: 'Rojo', color: '#e5533d' }, { titulo: 'B', inicio: 'i', fin: 'f', todoDia: false, lugar: '', categoria: '', color: null }] }));
assert.deepStrictEqual([r.agenda[0].categoria, r.agenda[0].color, r.agenda[1].categoria, r.agenda[1].color], ['Rojo', '#e5533d', '', null]);
r = normalizar(JSON.stringify({ ok: true, correos: [], agenda: [{ titulo: 'C', color: 'rojo' }] }));
assert.strictEqual(r.agenda[0].color, null);

// categorías: propaga, color inválido -> null, una sola como objeto, sin nombre se descarta
r = normalizar(JSON.stringify({ ok: true, correos: [], agenda: [], categorias: [{ nombre: 'Trabajo', color: '#e5533d' }, { nombre: 'Sin color', color: null }, { color: '#e5533d' }] }));
assert.deepStrictEqual(r.categorias, [{ nombre: 'Trabajo', color: '#e5533d' }, { nombre: 'Sin color', color: null }]);
assert.deepStrictEqual(normalizar('{"ok":true,"categorias":{"nombre":"A","color":"#3a86ff"}}').categorias, [{ nombre: 'A', color: '#3a86ff' }]);
assert.deepStrictEqual(normalizar('{"ok":true}').categorias, []);

// validarEvento
const ev = { titulo: 'Dentista', inicio: '2030-01-01T10:00:00', fin: '2030-01-01T11:00:00', todoDia: false, lugar: '', categoria: '' };
assert.strictEqual(validarEvento(ev), null);
assert.strictEqual(validarEvento({ ...ev, categoria: 'Salud', lugar: 'Clínica' }), null);
for (const mal of [null, 'x', { ...ev, titulo: '  ' }, { ...ev, titulo: 'a'.repeat(201) }, { ...ev, titulo: 5 }, { ...ev, inicio: 'ayer' }, { ...ev, inicio: '2030-02-31T10:00:00' },
  { ...ev, fin: ev.inicio }, { ...ev, fin: '2030-01-01T09:00:00' }, { ...ev, categoria: 3 }, { ...ev, lugar: {} }]) assert.ok(validarEvento(mal), JSON.stringify(mal));
assert.strictEqual(validarEvento({ ...ev, titulo: 'a'.repeat(200) }), null);
// armar: cada día trae sus 24 h (para ver mañana/pasado en el gráfico); el último día sin horas completas no revienta
assert.strictEqual(m.dias[1].horas.length, 24); assert.strictEqual(m.dias[1].horas[0].temp, 24.4); assert.deepStrictEqual(m.dias[2].horas, []);
assert.deepStrictEqual(m.dias[0].horas, m.horas);
