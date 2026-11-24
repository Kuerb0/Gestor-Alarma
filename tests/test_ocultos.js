// node tests/test_ocultos.js  → debe acabar en "TEST OK"
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const O = require('../ocultos');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocultos-')), f = path.join(dir, 'sub', 'widgets-ocultos.json');
O.fijarRuta(f);

assert.strictEqual(O.leer(), false, 'ausente → false');
fs.mkdirSync(path.dirname(f), { recursive: true });
fs.writeFileSync(f, '{roto'); assert.strictEqual(O.leer(), false, 'roto → false');
fs.writeFileSync(f, '{"ocultos":"true"}'); assert.strictEqual(O.leer(), false, 'no booleano → false');
fs.writeFileSync(f, '{"ocultos":1}'); assert.strictEqual(O.leer(), false);

assert.strictEqual(O.escribir(true, 'gestoralarma'), true);
assert.strictEqual(O.leer(), true);
const j = JSON.parse(fs.readFileSync(f, 'utf8'));
assert.deepStrictEqual([j.ocultos, j.por, typeof j.t], [true, 'gestoralarma', 'number']);
O.escribir(false, 'bancos'); assert.strictEqual(O.leer(), false);

// atomicidad: no quedan .tmp y, si falla la escritura, no lanza ni toca el fichero
assert.deepStrictEqual(fs.readdirSync(path.dirname(f)), ['widgets-ocultos.json']);
O.escribir(true, 'consumo');
const blocker = path.join(dir, 'fichero'); fs.writeFileSync(blocker, 'x');
O.fijarRuta(path.join(blocker, 'x', 'w.json')); // el "directorio" es un fichero → falla
assert.strictEqual(O.escribir(false, 'consumo'), false);
O.fijarRuta(f); assert.strictEqual(O.leer(), true, 'el fichero previo sigue intacto');

// vigilar
O.fijarRuta(f);
const vistos = [];
const parar = O.vigilar(v => vistos.push(v), 20);
setTimeout(() => { O.escribir(false, 'bancos'); }, 60);
setTimeout(() => {
  parar();
  assert.deepStrictEqual(vistos, [false]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('TEST OK');
}, 300);
