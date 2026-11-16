// node tests/test_tiempo.js  → debe acabar en "TEST OK"
const assert = require('assert');
const T = require('../tiempo');
const AHORA = new Date(2026, 10, 16, 12, 0, 0).getTime(); // lunes 16/11/2026 12:00
const p = t => T.parsear(t, AHORA);
const ok = t => { const r = p(t); assert(r.ok, `${t}: ${r.error}`); return r.rec; };

// duraciones
let r = ok('Reunión 25m');            assert.deepStrictEqual([r.nombre, r.tipo, r.objetivo - AHORA], ['Reunión', 'cuenta', 25 * 6e4]);
r = ok('Pizza 1h30m');                assert.strictEqual(r.objetivo - AHORA, 90 * 6e4); assert.strictEqual(r.nombre, 'Pizza');
r = ok('2 días examen');              assert.strictEqual(r.objetivo - AHORA, 2 * 864e5); assert.strictEqual(r.nombre, 'examen');
r = ok('1,5h té');                    assert.strictEqual(r.objetivo - AHORA, 90 * 6e4);
r = ok('45s');                        assert.deepStrictEqual([r.nombre, r.objetivo - AHORA], ['Cuenta atrás', 45e3]);
// fechas
r = ok('Examen 20/11 09:30');         assert.deepStrictEqual([r.nombre, r.tipo, r.objetivo], ['Examen', 'fecha', new Date(2026, 10, 20, 9, 30).getTime()]);
r = ok('20/11/2027');                 assert.strictEqual(r.objetivo, new Date(2027, 10, 20, 9, 0).getTime());
r = ok('Dentista el 01/02 a las 18:30'); assert.deepStrictEqual([r.nombre, r.objetivo], ['Dentista', new Date(2027, 1, 1, 18, 30).getTime()]); // ya pasó este año → el siguiente
r = ok('Cita 18:30');                 assert.strictEqual(r.objetivo, new Date(2026, 10, 16, 18, 30).getTime());
r = ok('Cita 08:00');                 assert.strictEqual(r.objetivo, new Date(2026, 10, 17, 8, 0).getTime()); // hoy ya pasó → mañana
// cronómetro
r = ok('cron Estudio');               assert.deepStrictEqual([r.nombre, r.tipo, r.inicio], ['Estudio', 'crono', AHORA]);
r = ok('Cronómetro');                 assert.strictEqual(r.nombre, 'Cronómetro');
// errores
for (const t of ['', 'solo texto', '0m', '31/02 10:00', '25:99', '20/11/2020', '99999d']) assert(!p(t).ok, `debería fallar: "${t}"`);

// formato
const f = (ms, tr) => T.formatear(ms, tr);
assert.strictEqual(f(45e3), '00:45');            assert.strictEqual(f(871200), '14:32');   // 871,2 s → redondea arriba
assert.strictEqual(f(3 * 36e5 + 15 * 6e4), '03h 15m'); assert.strictEqual(f(2 * 864e5 + 3 * 36e5), '2d 03h');
assert.strictEqual(f(1500, true), '00:01');      assert.strictEqual(f(1, false), '00:01');

// fases
const a = { tipo: 'cuenta', objetivo: AHORA + 1000 };
assert.strictEqual(T.fase(a, AHORA).fase, 'activa');
assert.deepStrictEqual(T.fase(a, AHORA + 1000), { fase: 'sonando', suena: true });
assert.deepStrictEqual(T.fase(a, AHORA + 1000 + 31e3), { fase: 'sonando', suena: false });
assert.strictEqual(T.fase({ ...a, avisada: true }, AHORA + 1000 + 61e3).fase, 'fin');
assert.strictEqual(T.fase(a, AHORA + 1000 + 61e3).fase, 'perdida');           // la app estaba apagada
assert.strictEqual(T.fase({ ...a, descartada: true }, AHORA).fase, 'fin');
assert.strictEqual(T.fase({ tipo: 'crono', inicio: AHORA - 5e3 }, AHORA).ms, 5e3);

// orden: sonando, perdidas, cuentas por cercanía, cronómetros
const L = [{ id: 'c', tipo: 'crono', inicio: AHORA }, { id: 'l', tipo: 'cuenta', objetivo: AHORA + 9e5 },
  { id: 'p', tipo: 'cuenta', objetivo: AHORA - 9e5 }, { id: 's', tipo: 'cuenta', objetivo: AHORA - 1e3 }, { id: 'n', tipo: 'fecha', objetivo: AHORA + 1e4 }];
assert.deepStrictEqual(T.ordenar(L, AHORA).map(x => x.id), ['s', 'p', 'n', 'l', 'c']);

// validar (frontera con la interfaz)
assert(!T.validar({ tipo: 'x' }, AHORA).ok);  assert(!T.validar({ tipo: 'cuenta', objetivo: AHORA - 1 }, AHORA).ok);
assert(!T.validar({ tipo: 'cuenta', objetivo: 'mañana' }, AHORA).ok); assert(!T.validar(null, AHORA).ok);
assert.strictEqual(T.validar({ tipo: 'fecha', objetivo: AHORA + 5, nombre: 'x'.repeat(200) }, AHORA).rec.nombre.length, 60);

// ---- día relativo y de la semana (AHORA es lunes 16/11/2026 12:00)
const at = (d, m, h = 9, mi = 0, y = 2026) => new Date(y, m - 1, d, h, mi).getTime();
assert.deepStrictEqual([ok('Dentista mañana 10:00').nombre, ok('Dentista mañana 10:00').objetivo], ['Dentista', at(17, 11, 10)]);
assert.strictEqual(ok('mañana').objetivo, at(17, 11));                       // sin hora: 9:00
assert.strictEqual(ok('pasado mañana 18:00').objetivo, at(18, 11, 18));
assert.strictEqual(ok('hoy 18:00 Cena').objetivo, at(16, 11, 18)); assert(!p('hoy 08:00').ok);
assert.strictEqual(ok('Partido viernes 20:00').objetivo, at(20, 11, 20));
assert.strictEqual(ok('lunes 18:00').objetivo, at(16, 11, 18));              // hoy, aún no ha pasado
assert.strictEqual(ok('el lunes 08:00').objetivo, at(23, 11, 8));             // hoy ya pasó → el próximo lunes
assert.strictEqual(ok('sábado').objetivo, at(21, 11));
assert.strictEqual(ok('Cita miércoles 9:15').tipo, 'fecha');

// ---- recurrentes
r = ok('Pastilla todos los días 8:00');   assert.deepStrictEqual([r.tipo, r.nombre, r.dias, r.hh, r.mm, r.objetivo], ['recurrente', 'Pastilla', [0, 1, 2, 3, 4, 5, 6], 8, 0, at(17, 11, 8)]);
r = ok('Gimnasio lunes a viernes 7:30');  assert.deepStrictEqual([r.tipo, r.dias, r.objetivo], ['recurrente', [1, 2, 3, 4, 5], at(17, 11, 7, 30)]);
r = ok('laborables 7:30 Oficina');        assert.deepStrictEqual([r.dias, r.nombre], [[1, 2, 3, 4, 5], 'Oficina']);
r = ok('Inglés lunes y jueves 18:00');    assert.deepStrictEqual([r.nombre, r.dias, r.objetivo], ['Inglés', [1, 4], at(16, 11, 18)]);
r = ok('cada martes 10:00 Yoga');         assert.deepStrictEqual([r.nombre, r.dias, r.objetivo], ['Yoga', [2], at(17, 11, 10)]);
r = ok('todos los lunes 8:00');           assert.deepStrictEqual([r.dias, r.objetivo], [[1], at(23, 11, 8)]);
r = ok('diario 22:00 Dientes');           assert.strictEqual(r.dias.length, 7);
assert.strictEqual(T.siguiente({ dias: [1], hh: 12, mm: 0 }, AHORA), at(23, 11, 12)); // estrictamente posterior
assert.strictEqual(T.etiquetaDias([1, 2, 3, 4, 5]), 'L–V'); assert.strictEqual(T.etiquetaDias([0, 1, 2, 3, 4, 5, 6]), 'todos los días'); assert.strictEqual(T.etiquetaDias([4, 1]), 'L J');
const rc = { tipo: 'recurrente', dias: [1], hh: 12, mm: 0, objetivo: AHORA + 1000 };
assert.strictEqual(T.fase(rc, AHORA + 1000 + 61e3).fase, 'fin');             // la recarga el main; no queda «perdida»
assert.deepStrictEqual(T.validar({ tipo: 'recurrente', dias: [1, 1, 9, 'x'], hh: 7, mm: 30 }, AHORA).rec.dias, [1]);
assert(!T.validar({ tipo: 'recurrente', dias: [], hh: 7, mm: 30 }, AHORA).ok); assert(!T.validar({ tipo: 'recurrente', dias: [1], hh: 24, mm: 0 }, AHORA).ok);
assert.strictEqual(T.validar({ tipo: 'recurrente', dias: [2], hh: 7, mm: 30 }, AHORA).rec.objetivo, at(17, 11, 7, 30));

// ---- formato completo y color
assert.strictEqual(T.formatear(2 * 864e5 + 3 * 36e5 + 15 * 6e4 + 8e3, false, 'completo'), '2d 03h 15m 08s');
assert.strictEqual(T.formatear(3 * 36e5 + 8e3, false, 'completo'), '03h 00m 08s'); assert.strictEqual(T.formatear(75e3, false, 'completo'), '01m 15s'); assert.strictEqual(T.formatear(8e3, false, 'completo'), '08s');
assert.strictEqual(T.color(5 * 36e5), 'rgb(74,163,255)');                     // más de 1 h: azul
assert.strictEqual(T.color(6e5), 'rgb(255,190,40)');                          // a 10 min: ámbar
assert.strictEqual(T.color(0), 'rgb(255,70,55)');                             // a 0: rojo
assert.strictEqual(T.color(3e5), 'rgb(255,130,48)');                          // a 5 min: mitad ámbar→rojo (uniforme)
assert.strictEqual(T.color(36e5 - 15e5), 'rgb(165,177,148)');                 // mitad azul→ámbar

console.log('TEST OK');
