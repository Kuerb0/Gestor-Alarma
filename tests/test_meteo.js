// node tests/test_meteo.js  → debe acabar en "test_meteo OK"
const assert = require('node:assert');
const { armar } = require('../meteo');

// Respuesta de Open-Meteo inventada: 3 días de horas, 3 de daily y 15 min; falta uv_index a propósito (debe salir null, no romper)
const hora = (d, h) => `2026-11-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00`;
const horas = []; for (let d = 16; d <= 18; d++) for (let h = 0; h < 24; h++) horas.push(hora(d, h));
const cuartos = []; for (let d = 16; d <= 18; d++) for (let q = 0; q < 96; q++) cuartos.push(`2026-11-${d}T${String(Math.floor(q / 4)).padStart(2, '0')}:${String(q % 4 * 15).padStart(2, '0')}`);
const serie = (arr, f) => arr.map((_, i) => f(i));
const j = {
  current: { time: '2026-11-16T21:30', temperature_2m: 12.8, weather_code: 3, wind_speed_10m: 6.5, relative_humidity_2m: 89, apparent_temperature: 12.1, pressure_msl: 1019.6, cloud_cover: 70 },
  hourly: { time: horas, temperature_2m: serie(horas, i => 10 + (i % 24) / 2), weather_code: serie(horas, () => 1), precipitation_probability: serie(horas, i => i % 30),
    wind_speed_10m: serie(horas, i => i % 20), relative_humidity_2m: serie(horas, () => 60), apparent_temperature: serie(horas, () => 9), pressure_msl: serie(horas, () => 1015), cloud_cover: serie(horas, () => 40) },
  minutely_15: { time: cuartos, temperature_2m: serie(cuartos, i => 10 + i / 100), precipitation_probability: serie(cuartos, i => i % 50) },
  daily: { time: ['2026-11-16', '2026-11-17', '2026-11-18'], weather_code: [1, 2, 3], temperature_2m_max: [18, 17, 16], temperature_2m_min: [8, 7, 6], precipitation_probability_max: [10, 20, 30] },
};
const r = armar(j, { nombre: 'X', lat: 1, lon: 2 }, new Date(2026, 10, 16, 21, 30));

assert.strictEqual(r.ok, true);
assert.strictEqual(r.horas.length, 24, 'hoy: 24 horas');
assert.strictEqual(r.puntos.length, 96, 'hoy: 96 puntos cada 15 min');
assert.deepStrictEqual([r.puntos[0].hora, r.puntos[1].hora, r.puntos[1].hd], ['00:00', '00:15', 0.25]);
assert.strictEqual(r.puntos[4].icono, r.horas[1].icono, 'las horas en punto llevan el icono');
assert.strictEqual(r.puntos[1].icono, '', 'los cuartos no');
assert.strictEqual(r.dias[1].puntos.length, 96, 'otros días también tienen sus puntos');
assert.strictEqual(r.horas[5].humedad, 60);
assert.strictEqual(r.horas[5].uv, null, 'falta uv_index: null, no error');
assert.strictEqual(r.actual.humedad, 89); assert.strictEqual(r.actual.presion, 1020); assert.strictEqual(r.actual.nubes, 70);
assert.strictEqual(r.dias.length, 3);

// sin minutely_15 la app sigue funcionando (sin puntos: el gráfico cae a horas)
const sin = armar({ ...j, minutely_15: undefined }, { nombre: 'X', lat: 1, lon: 2 }, new Date(2026, 10, 16, 21, 30));
assert.deepStrictEqual(sin.puntos, []); assert.strictEqual(sin.horas.length, 24);
console.log('test_meteo OK');

// búsqueda de ciudades: filtra lo no válido, recorta y compone el detalle
{
  const { parsearBusqueda } = require('../meteo');
  const g = parsearBusqueda({ results: [{ name: 'Alcalá de Henares', latitude: 40.48206, longitude: -3.36352, admin1: 'Comunidad de Madrid', country: 'España' }, { name: 'Sin coords' }, { name: 'Madrid', latitude: '40.4165', longitude: -3.7026, country: 'España' }] });
  assert.deepStrictEqual(g, [{ nombre: 'Alcalá de Henares', detalle: 'Comunidad de Madrid, España', lat: 40.4821, lon: -3.3635 }, { nombre: 'Madrid', detalle: 'España', lat: 40.4165, lon: -3.7026 }]);
  assert.deepStrictEqual(parsearBusqueda({}), []); assert.deepStrictEqual(parsearBusqueda(null), []);
}
