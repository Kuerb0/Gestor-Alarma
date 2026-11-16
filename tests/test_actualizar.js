const assert = require('node:assert');
const { versionMayor, urlValida, comprobar, descargar, ordenInstalar, VERSION } = require('../actualizar');

assert.ok(versionMayor('1.10.0', '1.9.9')); assert.ok(versionMayor('2.0', '1.9.9')); assert.ok(versionMayor('1.1.0.1', '1.1.0'));
assert.ok(!versionMayor('1.1.0', '1.1.0')); assert.ok(!versionMayor('1.0.9', '1.1.0')); assert.ok(!versionMayor('1.1', '1.1.0'));

const B = 'https://github.com/Kuerb0/Gestor-Alarma/releases/download/v9.0.0/';
assert.ok(urlValida(B + 'Gestor-Alarma%209.0.0%20-%20Instalador.exe'));
for (const u of ['https://github.com/Kuerb0/Otra-App/releases/download/v1/x.exe', 'https://github.com.evil.com/Kuerb0/Gestor-Alarma/releases/download/v1/x.exe',
  'http://github.com/Kuerb0/Gestor-Alarma/releases/download/v1/x.exe', 'https://github.com@evil.com/Kuerb0/Gestor-Alarma/releases/download/v1/x.exe',
  'https://objects.githubusercontent.com/x.exe', 'https://github.com/Kuerb0/Gestor-Alarma/releases/download/../../../evil/x.exe', '', null, 42])
  assert.ok(!urlValida(u), String(u));

const resp = j => async () => ({ ok: true, json: async () => j });
(async () => {
  const asset = n => ({ name: n, browser_download_url: B + encodeURIComponent(n) });
  let r = await comprobar(resp({ tag_name: 'v9.0.0', assets: [asset('Gestor-Alarma.zip'), asset('Gestor-Alarma 9.0.0 - Instalador.exe')] }));
  assert.deepStrictEqual(r, { nueva: true, version: '9.0.0', url: B + encodeURIComponent('Gestor-Alarma 9.0.0 - Instalador.exe'), nombre: 'Gestor-Alarma 9.0.0 - Instalador.exe' });
  assert.deepStrictEqual(await comprobar(resp({ tag_name: 'v' + VERSION, assets: [] })), { nueva: false });
  assert.ok((await comprobar(resp({ tag_name: 'v9.0.0', assets: [{ name: 'X - Instalador.exe', browser_download_url: 'https://evil.com/X.exe' }] }))).error);
  assert.ok((await comprobar(resp({ tag_name: 'rc-1' }))).error);
  assert.ok((await comprobar(async () => ({ ok: false, status: 403 }))).error);
  assert.ok((await comprobar(async () => { throw new Error('sin red'); })).error);
  await assert.rejects(descargar({ version: '9.0.0', url: 'https://evil.com/x.exe' }, async () => { throw new Error('no debe pedirse'); }), /no permitida/);
  await assert.rejects(descargar({ version: '9.0.0', url: B + 'x.exe' }, async () => ({ ok: true, url: 'https://evil.com/x.exe', headers: new Map() })), /redirección/);
  await assert.rejects(descargar({ version: '9.0.0', url: B + 'x.exe' }, async () => ({ ok: true, headers: new Map([['content-length', '500000000']]) })), /grande/);
  const o = ordenInstalar('C:\\T\\i.exe', 'C:\\Users\\u\\AppData\\Local\\Programs\\GestorAlarma\\electron\\electron.exe');
  assert.match(o, /^start "" \/wait "C:\\T\\i\.exe" \/S & start "" ".*GestorAlarma\.exe"$/);
  assert.throws(() => ordenInstalar('C:\\T\\i&calc.exe'), /caracteres/);
  console.log('test_actualizar OK');
})().catch(e => { console.error(e); process.exit(1); });
