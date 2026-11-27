// htmlAlarmas (graficos.js no es un módulo: se evalúa en un contexto aparte, con el global Tiempo)
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const Tiempo = require('../tiempo');
const { htmlAlarmas, htmlFilasAlarmas, visiblesAlarmas } = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'graficos.js'), 'utf8') + '\n({ htmlAlarmas, htmlFilasAlarmas, visiblesAlarmas })', { Tiempo });
const ah = 1e12, m = 6e4;
const l = [
  { id: 'a', tipo: 'cuenta', nombre: 'Pizza <b>', objetivo: ah + 25 * m },
  { id: 'b', tipo: 'cuenta', nombre: 'Sonando', objetivo: ah - 3e3 },
  { id: 'c', tipo: 'fecha', nombre: 'Cita', objetivo: ah + 3 * 36e5, origen: 'outlook' },
  { id: 'd', tipo: 'crono', nombre: 'Estudio', inicio: ah - 5 * m },
  { id: 'e', tipo: 'fecha', nombre: 'Hecha', objetivo: ah - 10 * 60 * m, avisada: true },
];
let h = htmlAlarmas(l, {}, ah);
assert(h.includes('id="wa-texto"') && h.includes('id="wa-vista"') && h.includes('Pizza &lt;b&gt;') && !h.includes('<b>'), 'campo y escapado');
assert(!h.includes('Hecha'), 'las terminadas no salen');
assert(h.indexOf('>Sonando<') < h.indexOf('>Pizza &lt;b'), 'lo que suena, primero');
assert(h.includes('sonando') && h.includes('Outlook') && h.includes('data-col="rgb('), 'fase, origen y color');
assert((h.match(/class="wa-x"/g) || []).length === 3, 'una × por alarma propia y ninguna en las externas (' + (h.match(/class="wa-x"/g) || []).length + ')');
assert(!htmlAlarmas(l, { crear: false }, ah).includes('wa-texto'), 'sin campo con crear:false');
assert(!htmlAlarmas(l, { uid: 'v1' }, ah).includes('id="wa-texto"') && htmlAlarmas(l, { uid: 'v1' }, ah).includes('disabled'), 'campo desactivado en la galería');
assert(!htmlAlarmas(l, { externas: false }, ah).includes('Cita'), 'sin externas');
h = htmlAlarmas(l, { n: 3 }, ah);
assert((h.match(/class="wa-f/g) || []).length === 3 && h.includes('+1 más'), 'n = 3 y «+N más»');
assert.strictEqual(visiblesAlarmas(l, { n: 99 }, ah).vis.length, 4, 'n inválido = 5; 4 activas');
assert(htmlAlarmas([], {}, ah).includes('Sin alarmas') && htmlAlarmas(null, {}, ah).includes('Cargando'), 'vacía / sin cargar');
// búsqueda: por nombre, sin mayúsculas ni tildes; con q se enseñan hasta 20 (ignora n)
assert.deepStrictEqual(visiblesAlarmas(l, { q: 'ESTUDIÓ' }, ah).vis.map(x => x.id), ['d'], 'búsqueda sin tildes ni mayúsculas');
assert.strictEqual(visiblesAlarmas(l, { q: 'zzz' }, ah).vis.length, 0, 'búsqueda sin resultados');
assert(htmlAlarmas(l, { buscar: true, q: 'zzz' }, ah).includes('Sin resultados') && !htmlAlarmas(l, { buscar: true, q: 'zzz' }, ah).includes('id="wa-vista"'), 'sin resultados y sin vista previa al buscar');
assert(htmlAlarmas(l, {}, ah).includes('id="wa-buscar"') && htmlAlarmas(l, { buscar: true, q: 'Es' }, ah).includes('value="Es"'), 'lupa y valor de la búsqueda');
console.log('test_alarmas_widget OK');
