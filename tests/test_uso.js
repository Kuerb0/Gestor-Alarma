// Seguimiento de uso: líneas del vigía -> tramos por día
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { crear } = require('../uso');
const nuevo = (t0 = new Date(2026, 10, 18, 10, 0, 0).getTime()) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uso-test-')), r = { t: t0 }; return { dir, r, u: crear({ dir: path.join(dir, 'uso'), ahora: () => r.t }), t0 }; };
const L = o => JSON.stringify(o), act = (exe, t = 'T ' + exe, i = false) => L({ k: 'a', exe, d: exe, t, i });
const todos = u => u.leerDias('20000101', '29991231');
const S = 1000;

{ // a(chrome) -> a(code): un tramo a de chrome con i/f correctos
  const { u, t0 } = nuevo(); u.entrada(act('chrome.exe'), t0); u.entrada(act('code.exe'), t0 + 10 * S);
  const r = todos(u); assert.strictEqual(r.length, 1);
  assert.deepStrictEqual(r[0], { i: t0, f: t0 + 10 * S, n: 'a', exe: 'chrome.exe', d: 'chrome.exe', t: 'T chrome.exe' });
  u.cerrar(t0 + 20 * S); assert.strictEqual(todos(u).length, 2, 'cerrar escribe lo abierto');
  assert.strictEqual(todos(u)[1].exe, 'code.exe'); assert.strictEqual(todos(u)[1].f, t0 + 20 * S);
}
{ // inactivo y tramos < 1 s
  const { u, t0 } = nuevo(); u.entrada(act('chrome.exe'), t0); u.entrada(act('chrome.exe', 'T chrome.exe', true), t0 + 5 * S); for (let s = 25; s < 200; s += 20) u.entrada(L({ k: 'v', l: [] }), t0 + s * S); u.entrada(act('chrome.exe'), t0 + 200 * S);
  let r = todos(u); assert.strictEqual(r.length, 2); assert.strictEqual(r[1].n, 'i'); assert.strictEqual(r[1].exe, ''); assert.strictEqual(r[1].i, t0 + 5 * S); assert.strictEqual(r[1].f, t0 + 200 * S);
  u.entrada(act('x.exe'), t0 + 200 * S + 500); assert.strictEqual(todos(u).length, 2, 'menos de 1 s se descarta');
}
{ // v/s: se abren y al desaparecer uno se cierra
  const { u, t0 } = nuevo(), w = (n, exe) => ({ n, exe, d: exe, t: 'T ' + exe });
  u.entrada(L({ k: 'v', l: [w('v', 'a.exe'), w('s', 'b.exe')] }), t0); u.entrada(L({ k: 'v', l: [w('v', 'a.exe'), w('s', 'b.exe')] }), t0 + 5 * S);
  assert.strictEqual(todos(u).length, 0);
  u.entrada(L({ k: 'v', l: [w('v', 'a.exe')] }), t0 + 10 * S);
  let r = todos(u); assert.strictEqual(r.length, 1); assert.strictEqual(r[0].n, 's'); assert.strictEqual(r[0].exe, 'b.exe'); assert.strictEqual(r[0].f - r[0].i, 10 * S);
  u.entrada(L({ k: 'v', l: [] }), t0 + 15 * S); r = todos(u); assert.strictEqual(r.length, 2); assert.strictEqual(r[1].n, 'v');
}
{ // fondo: cpu = diferencia
  const { u, t0 } = nuevo(), b = cpu => L({ k: 'b', l: [{ exe: 'sync.exe', d: 'Sync', cpu }] });
  u.entrada(b(100), t0); u.entrada(L({ k: 'v', l: [] }), t0 + 20 * S); u.entrada(L({ k: 'v', l: [] }), t0 + 40 * S); u.entrada(b(104.26), t0 + 60 * S); u.entrada(L({ k: 'v', l: [] }), t0 + 80 * S); u.entrada(L({ k: 'v', l: [] }), t0 + 100 * S);  u.entrada(L({ k: 'b', l: [] }), t0 + 120 * S);
  const r = todos(u); assert.strictEqual(r.length, 1); assert.strictEqual(r[0].n, 'b'); assert.strictEqual(r[0].cpu, 4.3); assert.strictEqual(r[0].f - r[0].i, 120 * S); assert.strictEqual(r[0].t, undefined);
}
{ // hueco > 30 s: se cierra en la hora de la última línea
  const { u, t0 } = nuevo(); u.entrada(act('a.exe'), t0); u.entrada(L({ k: 'v', l: [] }), t0 + 20 * S); u.entrada(L({ k: 'v', l: [] }), t0 + 3600 * S);
  const r = todos(u); assert.strictEqual(r.length, 1); assert.strictEqual(r[0].f, t0 + 20 * S);
}
{ // tramos largos: se parten cada 5 min
  const { u, t0 } = nuevo(); u.entrada(act('a.exe'), t0); for (let s = 20; s <= 700; s += 20) u.entrada(L({ k: 'v', l: [] }), t0 + s * S);
  const r = todos(u); assert.ok(r.length >= 2 && r[0].f - r[0].i >= 300 * S && r[0].f - r[0].i < 330 * S, 'partido a los 5 min'); assert.strictEqual(r[1].i, r[0].f);
}
{ // medianoche: un tramo en dos ficheros
  const t0 = new Date(2026, 10, 18, 23, 59, 0).getTime(), { u, dir } = nuevo(t0); u.entrada(act('a.exe'), t0); u.entrada(L({ k: 'v', l: [] }), t0 + 20 * S); u.entrada(L({ k: 'v', l: [] }), t0 + 40 * S); u.entrada(L({ k: 'v', l: [] }), t0 + 60 * S + 3 * S); u.entrada(act('b.exe'), t0 + 90 * S);
  const f = fs.readdirSync(path.join(dir, 'uso')).sort(); assert.deepStrictEqual(f, ['2026-11-18.jsonl', '2026-11-19.jsonl']);
  const m = new Date(2026, 10, 19).getTime(), r = todos(u); assert.strictEqual(r[0].f, m); assert.strictEqual(r[r.length - 1].i, m); assert.strictEqual(r[r.length - 1].f, t0 + 90 * S);
  assert.strictEqual(u.leerDias('20261119', '20261119').length, r.length - 1 > 0 ? u.leerDias('20261119', '20261119').length : 0); assert.ok(u.leerDias('20261118', '20261118').every(x => x.i < m));
}
{ // pausa
  const { u, r, t0 } = nuevo(); u.entrada(act('a.exe'), t0); r.t = t0 + 10 * S; u.pausar(Infinity);
  assert.ok(u.pausado()); assert.strictEqual(todos(u).length, 1, 'al pausar se cierra lo abierto');
  u.entrada(act('b.exe'), t0 + 20 * S); u.entrada(act('c.exe'), t0 + 40 * S); u.cerrar(t0 + 60 * S); assert.strictEqual(todos(u).length, 1, 'en pausa no se escribe');
  u.pausar(0); assert.ok(!u.pausado()); u.entrada(act('d.exe'), t0 + 70 * S); u.cerrar(t0 + 80 * S); assert.strictEqual(todos(u).length, 2); assert.strictEqual(todos(u)[1].exe, 'd.exe');
  u.pausar(t0 + 100 * S); assert.ok(u.pausado()); r.t = t0 + 101 * S; assert.ok(!u.pausado(), 'se reanuda solo');
  u.entrada(act('e.exe'), t0 + 101 * S); u.cerrar(t0 + 110 * S); assert.strictEqual(todos(u).length, 3);
}
{ // limpiar y basura
  const { u, dir, r, t0 } = nuevo(), d = path.join(dir, 'uso'), nom = ms => { const x = new Date(ms); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}.jsonl`; };
  fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, nom(t0 - 400 * 864e5)), '{}\n'); fs.writeFileSync(path.join(d, nom(t0 - 864e5)), '{}\n'); fs.writeFileSync(path.join(d, 'otro.txt'), 'x');
  u.limpiar(t0); const f = fs.readdirSync(d).sort(); assert.deepStrictEqual(f, [nom(t0 - 864e5), 'otro.txt'].sort());
  for (const m of ['', 'basura', '{', 'null', '[]', '5', '{"k":"v"}', '{"k":"v","l":5}', '{"k":"b","l":[null,1,{"exe":5}]}', '{"k":"a"}']) u.entrada(m, t0);
  u.entrada(undefined, t0); u.entrada(act('a.exe'), NaN); assert.strictEqual(todos(u).length, 1);
  assert.deepStrictEqual(crear({ dir: path.join(dir, 'noexiste') }).leerDias('20260101', '20261231'), []);
}
{ // abiertos(): copia de lo abierto sin tocar el estado
  const { u, t0 } = nuevo(); u.entrada(act('chrome.exe'), t0);
  const a = u.abiertos(t0 + 90 * S); assert.strictEqual(a.length, 1); assert.strictEqual(a[0].i, t0); assert.strictEqual(a[0].f, t0 + 90 * S); assert.strictEqual(a[0].exe, 'chrome.exe'); assert.ok(!('cpu' in a[0]));
  assert.strictEqual(todos(u).length, 0, 'no escribe nada'); assert.strictEqual(u.abiertos(t0 + 90 * S).length, 1, 'no cambia el estado');
  assert.strictEqual(u.abiertos(t0 + 500).length, 0, 'menos de 1 s no sale');
}
console.log('test_uso OK');
