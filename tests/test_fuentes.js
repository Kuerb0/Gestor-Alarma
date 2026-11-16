const assert = require('node:assert');
const { normalizar } = require('../correo');
const { wmo, armar, leer: leerMeteo } = require('../meteo');

// correo.normalizar: 0, 1 y varios elementos (ConvertTo-Json colapsa arrays)
let r = normalizar('{"ok":true,"noLeidos":0,"correos":[],"agenda":null}');
assert.deepStrictEqual(r, { ok: true, noLeidos: 0, correos: [], agenda: [] });
const c1 = { id: 'A', de: 'X', asunto: 'S', fecha: '2026-11-16T09:00:00', leido: false };
r = normalizar(JSON.stringify({ ok: true, noLeidos: 1, correos: c1, agenda: { titulo: 'T', inicio: '2026-11-16T10:00:00', fin: '2026-11-16T11:00:00', todoDia: false, lugar: '' } }));
assert.deepStrictEqual(r.correos, [c1]); assert.strictEqual(r.agenda.length, 1); assert.strictEqual(r.noLeidos, 1);
r = normalizar(JSON.stringify({ ok: true, noLeidos: 2, correos: [c1, { ...c1, id: 'B', leido: true }], agenda: [] }));
assert.strictEqual(r.correos.length, 2); assert.strictEqual(r.correos[1].leido, true);
assert.strictEqual(normalizar('basura').ok, false);
assert.strictEqual(normalizar('{"ok":false}').motivo, 'error');

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
assert.strictEqual(m.horas.length, 24); assert.strictEqual(m.horas[0].hora, '00:00'); assert.strictEqual(m.horas[23].hora, '23:00'); assert.strictEqual(m.horas[0].temp, 0); assert.strictEqual(m.ahora, 14.25);
assert.strictEqual(m.horas[0].icono, '🌧️'); assert.strictEqual(m.horas[0].lluvia, 30);
assert.strictEqual(m.dias.length, 5);
assert.deepStrictEqual(m.dias.map(d => d.nombre), ['Hoy', 'Mañana', 'Mié', 'Jue', 'Vie']);
assert.strictEqual(m.dias[0].max, 21); assert.strictEqual(m.dias[0].min, 10); assert.strictEqual(m.dias[2].lluvia, 80);


// agenda con categoría y color
r = normalizar(JSON.stringify({ ok: true, noLeidos: 0, correos: [], agenda: [{ titulo: 'A', inicio: 'i', fin: 'f', todoDia: false, lugar: '', categoria: 'Rojo', color: '#e5533d' }, { titulo: 'B', inicio: 'i', fin: 'f', todoDia: false, lugar: '', categoria: '', color: null }] }));
assert.deepStrictEqual([r.agenda[0].categoria, r.agenda[0].color, r.agenda[1].categoria, r.agenda[1].color], ['Rojo', '#e5533d', '', null]);
r = normalizar(JSON.stringify({ ok: true, correos: [], agenda: [{ titulo: 'C', color: 'rojo' }] }));
assert.strictEqual(r.agenda[0].color, null);
