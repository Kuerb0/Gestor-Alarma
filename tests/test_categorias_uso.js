// Categorías del uso: clasificar, sanear, sin clasificar e importar
const assert = require('assert');
const C = require('../categorias_uso');
const tr = (exe, t, seg = 60, n = 'a') => ({ i: 0, f: seg * 1000, n, exe, d: exe, ...(t ? { t } : {}) });
const cfg = { categorias: [{ nombre: 'Ocio', color: '#ff8a3d' }, { nombre: 'Estudio', color: '#4a9eff' }, { nombre: 'Sin clasificar', color: '#555a66' }],
  reglas: [{ campo: 'titulo', op: 'contiene', valor: 'YouTube', cat: 'Ocio' }, { campo: 'exe', op: 'es', valor: 'opera.exe', cat: 'Estudio' }, { campo: 'exe', op: 'es', valor: 'code.exe', cat: 'Estudio' }] };
{ // clasificar
  assert.strictEqual(C.clasificar(tr('code.exe'), cfg), 'Estudio');
  assert.strictEqual(C.clasificar(tr('CODE.EXE'), cfg), 'Estudio');
  assert.strictEqual(C.clasificar(tr('opera.exe', 'Vídeo – YOUTUBE - Opera'), cfg), 'Ocio'); // la primera gana (título va antes)
  assert.strictEqual(C.clasificar(tr('opera.exe', 'Apuntes'), cfg), 'Estudio');
  assert.strictEqual(C.clasificar(tr('code.exe', null, 5, 'i'), cfg), 'Inactivo');
  assert.strictEqual(C.clasificar(tr('raro.exe'), cfg), 'Sin clasificar');
  assert.strictEqual(C.clasificar(tr('x.exe', 'Canción de mañana'), { categorias: cfg.categorias, reglas: [{ campo: 'titulo', op: 'contiene', valor: 'MAÑANA', cat: 'Ocio' }] }), 'Ocio'); // sin tildes ni mayúsculas
  assert.strictEqual(C.clasificar(tr('x.exe', 'Canción de manana'), { categorias: cfg.categorias, reglas: [{ campo: 'titulo', op: 'contiene', valor: 'MAÑANA', cat: 'Ocio' }] }), 'Ocio');
}
{ // sanear
  assert.deepStrictEqual(C.sanear(null), C.porDefecto());
  assert.deepStrictEqual(C.sanear('x'), C.porDefecto());
  const s = C.sanear({ categorias: [{ nombre: 'A', color: 'rojo' }, { nombre: 'a', color: '#fff000' }, 5], reglas: [{ campo: 'exe', op: 'es', valor: 'a.exe', cat: 'A' }, { campo: 'exe', op: 'es', valor: 'b.exe', cat: 'NoExiste' }, { campo: 'zzz', op: 'es', valor: 'c', cat: 'A' }, { campo: 'exe', op: 'es', valor: '', cat: 'A' }] });
  assert.deepStrictEqual(s.categorias.map(c => c.nombre), ['A', 'Sin clasificar']);
  assert.strictEqual(s.categorias[0].color, '#555a66');
  assert.strictEqual(s.reglas.length, 1);
  const d = C.porDefecto();
  assert.ok(d.categorias.some(c => c.nombre === 'Sin clasificar'));
  assert.ok(d.reglas.every(r => d.categorias.some(c => c.nombre === r.cat)));
  assert.deepStrictEqual(C.sanear(d), d);
}
{ // sinClasificar
  const l = C.sinClasificar([tr('a.exe', null, 30), tr('a.exe', null, 40), tr('b.exe', null, 500), tr('c.exe', null, 99, 'v'), tr('code.exe'),
    tr('chrome.exe', 'Receta - Google Chrome', 20), tr('chrome.exe', 'Receta - Google Chrome', 25), tr('msedge.exe', 'Otra - Personal - Microsoft Edge', 10)], cfg);
  assert.deepStrictEqual(l.map(x => [x.exe, x.t, x.seg]), [['b.exe', undefined, 500], ['a.exe', undefined, 70], ['chrome.exe', 'Receta', 45], ['msedge.exe', 'Otra - Personal', 10]]);
  assert.strictEqual(C.sinClasificar([tr('a.exe'), tr('b.exe', null, 10)], cfg, 1).length, 1);
}
{ // textoSugerencias
  const t = C.textoSugerencias(C.sinClasificar([tr('zeta.exe', null, 300)], cfg), cfg);
  assert.ok(t.includes('zeta.exe') && t.includes('5 min') && t.includes('Ocio') && /SOLO con un array JSON/.test(t));
}
{ // importar
  const txt = 'Claro, aquí van:\n```json\n[{"campo":"exe","op":"es","valor":"zeta.exe","cat":"Ocio"},{"campo":"titulo","op":"contiene","valor":"netflix","cat":"Ocio"},{"campo":"exe","op":"es","valor":"OPERA.exe","cat":"Ocio"},{"campo":"exe","op":"es","valor":"q.exe","cat":"Fantasma"}]\n```\nListo.';
  const r = C.importar(txt, cfg);
  assert.strictEqual(r.n, 2);
  assert.strictEqual(r.errores.length, 1); assert.ok(/Fantasma/.test(r.errores[0]));
  assert.strictEqual(r.cfg.reglas[0].valor, 'netflix'); // título al principio
  assert.strictEqual(r.cfg.reglas[r.cfg.reglas.length - 1].valor, 'zeta.exe'); // exe al final
  assert.strictEqual(cfg.reglas.length, 3); // no toca la original
  const r2 = C.importar('sin nada', cfg); assert.strictEqual(r2.n, 0); assert.ok(r2.errores.length);
}
console.log('test_categorias_uso OK');
