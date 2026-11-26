// node tests/test_virtualizacion.js  → debe acabar en "TEST OK"
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { detectarVirtualizacion, argumentosRelanzar } = require('../virtualizacion');

const sondas = dir => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.startsWith('.sonda-virtual-')) : []);
const nuevo = () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'virt-'));
  const userData = path.join(tmp, 'Roaming', 'app'), localAppData = path.join(tmp, 'Local');
  fs.mkdirSync(userData, { recursive: true });
  return { tmp, userData, localAppData };
};

// sin virtualización: null y la sonda se borra
let t = nuevo();
fs.mkdirSync(path.join(t.localAppData, 'Packages', 'Otra_app', 'LocalCache', 'Roaming', 'app'), { recursive: true });
fs.mkdirSync(path.join(t.localAppData, 'Packages', 'Claude_x', 'LocalCache', 'Roaming', 'otro'), { recursive: true });
assert.strictEqual(detectarVirtualizacion({ userData: t.userData, localAppData: t.localAppData }), null);
assert.deepStrictEqual(sondas(t.userData), []);
fs.rmSync(t.tmp, { recursive: true, force: true });

// sin carpeta Packages: null
t = nuevo();
assert.strictEqual(detectarVirtualizacion({ userData: t.userData, localAppData: t.localAppData }), null);
fs.rmSync(t.tmp, { recursive: true, force: true });

// virtualizado: la sonda aparece en la copia del paquete → devuelve esa carpeta y no deja sondas
t = nuevo();
const copia = path.join(t.localAppData, 'Packages', 'Claude_x', 'LocalCache', 'Roaming', 'app');
fs.mkdirSync(copia, { recursive: true });
const falso = {
  ...fs,
  writeFileSync: (f, d) => fs.writeFileSync(path.join(copia, path.basename(f)), d),
  rmSync: (f, o) => fs.rmSync(path.join(copia, path.basename(f)), o),
};
assert.strictEqual(detectarVirtualizacion({ userData: t.userData, localAppData: t.localAppData, fs: falso }), copia);
assert.deepStrictEqual(sondas(copia), []);
fs.rmSync(t.tmp, { recursive: true, force: true });

// ante errores: null
t = nuevo();
const roto = new Proxy(fs, { get: () => () => { throw new Error('fallo'); } });
assert.strictEqual(detectarVirtualizacion({ userData: t.userData, localAppData: t.localAppData, fs: roto }), null);
fs.rmSync(t.tmp, { recursive: true, force: true });

// userData fuera de Roaming: null
t = nuevo();
fs.mkdirSync(path.join(t.localAppData, 'Packages'), { recursive: true });
const fuera = path.join(t.tmp, 'Otro', 'app');
fs.mkdirSync(fuera, { recursive: true });
assert.strictEqual(detectarVirtualizacion({ userData: fuera, localAppData: t.localAppData }), null);
fs.rmSync(t.tmp, { recursive: true, force: true });

// argumentosRelanzar: añade --relanzado sin duplicarlo
assert.deepStrictEqual(argumentosRelanzar(['electron.exe', 'C:\app', '--oculto']), ['C:\app', '--oculto', '--relanzado']);
assert.deepStrictEqual(argumentosRelanzar(['electron.exe', 'C:\app', '--relanzado']), ['C:\app', '--relanzado']);
assert.deepStrictEqual(argumentosRelanzar(undefined), ['--relanzado']);

console.log('TEST OK');
