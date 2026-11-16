// node tests/test_puente.js  → debe acabar en "TEST OK"
const assert = require('assert');
const P = require('../puente'), T = require('../tiempo');
const AHORA = new Date(2026, 10, 16, 12, 0, 0).getTime();
const iso = (h, m = 0, d = 16) => `2026-11-${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;

// Post-It: alarmas ⏰ de las notas (mudas, solo los próximos 14 días o recién vencidas)
const notas = [{ id: 'n1', alarms: [{ t: '2026-11-16T18:30', txt: 'Dentista' }, { t: '2026-12-10T09:00', txt: 'Lejos' }, { t: '2026-11-16T11:00', txt: 'Pasada' }, { t: 'xx', txt: 'Rota' }] }, { id: 'n2' }];
let r = P.alarmasDeNotas(notas, AHORA);
assert.deepStrictEqual(r.map(a => a.nombre), ['Dentista']);
assert.deepStrictEqual([r[0].silencioso, r[0].origen, r[0].objetivo], [true, 'postit', new Date(2026, 10, 16, 18, 30).getTime()]);
assert.strictEqual(P.alarmasDeNotas([{ id: 'n', alarms: [{ t: '2026-11-16T11:59:30', txt: 'Recién' }] }], AHORA).length, 1); // vencida hace 30 s: aún se ve

// Outlook: solo con la etiqueta «Alarma» (sin importar mayúsculas/acentos), con hora y en los próximos 14 días
const ev = [
  { id: 'a', titulo: 'Reunión', inicio: iso(15), todo_dia: false, categoria: 'Alarma' },
  { id: 'b', titulo: 'Sin etiqueta', inicio: iso(15), todo_dia: false, categoria: 'Trabajo' },
  { id: 'c', titulo: 'Todo el día', inicio: iso(0, 0, 17), todo_dia: true, categoria: 'Alarma' },
  { id: 'd', titulo: 'Mes que viene', inicio: iso(15, 0, 30), todo_dia: false, categoria: 'alarma' },
  { id: 'e', titulo: 'Mañana pronto', inicio: iso(9, 0, 17), todo_dia: false, categoria: 'ALARMA' },
];
r = P.eventosAAlarmas(ev, AHORA);
assert.deepStrictEqual(r.map(a => a.nombre), ['Reunión', 'Mañana pronto']);
assert.deepStrictEqual([r[0].origen, r[0].aviso, r[0].silencioso], ['outlook', P.AVISO_MS, undefined]);

// preaviso: a 10 min del inicio suena (30 s) y parpadea 60 s, contando hacia el inicio; luego sigue activa
const o = { tipo: 'fecha', objetivo: AHORA + 20 * 6e4, aviso: 10 * 6e4, avisada: true };
assert.strictEqual(T.fase(o, AHORA).fase, 'activa');
assert.deepStrictEqual(T.fase(o, AHORA + 10 * 6e4 + 5e3), { fase: 'sonando', ms: 10 * 6e4 - 5e3, suena: true });
assert.deepStrictEqual(T.fase(o, AHORA + 10 * 6e4 + 40e3), { fase: 'sonando', ms: 10 * 6e4 - 40e3, suena: false });
assert.strictEqual(T.fase(o, AHORA + 10 * 6e4 + 61e3).fase, 'activa');
assert.strictEqual(T.fase(o, o.objetivo).fase, 'sonando');                  // y al llegar al inicio, como cualquier alarma
assert.strictEqual(T.fase(o, o.objetivo + 61e3).fase, 'fin');               // avisada → se retira, no queda «perdida»
// memoria de categorías: con Outlook abierto se aprende; con el ICS (sin categorías) se etiqueta por «título|inicio» y, si no, por título
const A = '2026-11-25T18:00:00', B = '2026-11-26T18:00:00', C = '2026-12-16T08:00:00';
const cache = P.recordarCategorias({}, [
  { titulo: 'Simulacion', inicio: A, categoria: 'Alarma' }, { titulo: 'Simulación', inicio: B, categoria: 'UAH' },   // mismo título, distinta categoría
  { titulo: 'Examen', inicio: C, categoria: 'Alarma' }, { titulo: 'Café', inicio: A, categoria: '' }]);
const ics = P.etiquetar([
  { titulo: 'Simulación', inicio: A, categoria: '' }, { titulo: 'Simulacion', inicio: B, categoria: '' },   // exactas: 25 sí, 26 no
  { titulo: 'Simulacion', inicio: '2026-12-01T18:00:00', categoria: '' },                                  // nuevo con título ambiguo: sin etiqueta
  { titulo: 'EXAMEN', inicio: '2027-02-01T09:00:00', categoria: '' },                                      // nuevo con título coherente: Alarma
  { titulo: 'Café', inicio: A, categoria: '' }, { titulo: 'Examen', inicio: C, categoria: 'X' }], cache);
assert.deepStrictEqual(ics.map(e => e.categoria), ['Alarma', 'UAH', '', 'Alarma', '', 'X']);
P.recordarCategorias(cache, [{ titulo: 'Simulacion', inicio: A, categoria: '' }]);                              // si en Outlook se le quita la categoría, se olvida
assert.strictEqual(P.etiquetar([{ titulo: 'Simulacion', inicio: A, categoria: '' }], cache)[0].categoria, '');
// ventana editable (en días): se pasa como parámetro
assert.strictEqual(P.eventosAAlarmas(ev, AHORA, 'Alarma', 30 * 864e5).length, 3);                   // con 30 días entra también «Mes que viene»
assert.deepStrictEqual(P.eventosAAlarmas(ev, AHORA, 'Alarma', 864e5).map(a => a.nombre), ['Reunión', 'Mañana pronto']);
assert.strictEqual(P.eventosAAlarmas(ev, AHORA, 'Alarma', 3 * 36e5).length, 1);                     // con 3 h solo la de las 15:00
assert.strictEqual(P.alarmasDeNotas(notas, AHORA, 30 * 864e5).length, 2);                           // y «Lejos» (10/12) con 30 días
console.log('TEST OK');
