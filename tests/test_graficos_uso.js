// Gráficos de Uso: agregación de tramos y constructores de SVG/HTML
const assert = require('assert');
const G = require('../graficos_uso');
const t0 = new Date(2026, 10, 18, 10, 0, 0).getTime(), MIN = 60e3, dia0 = new Date(2026, 10, 18).getTime();
const tr = (i, f, c, n = 'a', d = c + '.exe') => ({ i, f, n, c, d });
const cats = [{ nombre: 'Estudio', color: '#4a9eff' }, { nombre: 'Ocio', color: '#ff8a3d' }, { nombre: 'Sin clasificar', color: '#555a66' }];
const cerca = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' != ' + b);

{ // porBloques: un tramo que cruza dos bloques se reparte; recorte al rango; filtro de niveles
  const r = G.porBloques([tr(t0 + 10 * MIN, t0 + 25 * MIN, 'Estudio')], t0, t0 + 60 * MIN, 15 * MIN, ['a']);
  assert.deepStrictEqual(r.cats, ['Estudio']); assert.strictEqual(r.m[0].length, 4);
  cerca(r.m[0][0], 5); cerca(r.m[0][1], 10); cerca(r.m[0][2], 0);
  const q = G.porBloques([tr(t0 - 30 * MIN, t0 + 5 * MIN, 'Ocio'), tr(t0 + 58 * MIN, t0 + 90 * MIN, 'Ocio')], t0, t0 + 60 * MIN, 30 * MIN, ['a']);
  cerca(q.m[0][0], 5); cerca(q.m[0][1], 2);
  const n = G.porBloques([tr(t0, t0 + 10 * MIN, 'Estudio', 'v'), tr(t0, t0 + 10 * MIN, 'Ocio', 'i')], t0, t0 + 60 * MIN, 15 * MIN);
  assert.deepStrictEqual(n.cats, [], 'por defecto solo cuenta la activa');
  assert.deepStrictEqual(G.porBloques([tr(t0, t0 + 10 * MIN, 'Estudio', 'v')], t0, t0 + 60 * MIN, 15 * MIN, ['a', 'v']).cats, ['Estudio']);
}
{ // porDia
  const dias = ['2026-11-17', '2026-11-18', '2026-11-19'], d17 = dia0 - 864e5;
  const r = G.porDia([tr(d17 + 22 * 60 * MIN, d17 + 23 * 60 * MIN, 'Ocio'), tr(t0, t0 + 30 * MIN, 'Estudio'), tr(t0 + 30 * MIN, t0 + 45 * MIN, 'Ocio')], dias, ['a']);
  assert.deepStrictEqual(r.cats, ['Ocio', 'Estudio']);
  cerca(r.m[0][0], 60); cerca(r.m[0][1], 15); cerca(r.m[0][2], 0); cerca(r.m[1][1], 30);
}
{ // reparto: orden, apps (5 como máximo), sin Inactivo
  const l = [tr(t0, t0 + 10 * MIN, 'Estudio', 'a', 'word.exe'), tr(t0 + 10 * MIN, t0 + 70 * MIN, 'Ocio', 'a', 'opera.exe'), tr(t0 + 70 * MIN, t0 + 80 * MIN, 'Estudio', 'a', 'word.exe'), tr(t0 + 80 * MIN, t0 + 100 * MIN, 'Inactivo', 'i', ''), tr(t0, t0 + 500 * MIN, 'Sistema', 'b', 'x.exe')];
  for (let k = 0; k < 7; k++) l.push(tr(t0 + 100 * MIN + k * MIN, t0 + 101 * MIN + k * MIN, 'Ocio', 'a', 'app' + k + '.exe'));
  const r = G.reparto(l, ['a']);
  assert.deepStrictEqual(r.map(c => c.c), ['Ocio', 'Estudio']); cerca(r[1].min, 20); cerca(r[0].min, 67);
  assert.strictEqual(r[0].apps.length, 5); assert.strictEqual(r[0].apps[0].d, 'opera.exe'); assert.strictEqual(r[1].apps.length, 1); cerca(r[1].apps[0].min, 20);
  assert.ok(!r.some(c => c.c === 'Inactivo'));
  cerca(G.total(r), 87);
}
{ // lineaDia: solo a e i, funde contiguos con hueco < 60 s
  const l = [tr(t0, t0 + 10 * MIN, 'Estudio'), tr(t0 + 10 * MIN + 30e3, t0 + 20 * MIN, 'Estudio'), tr(t0 + 20 * MIN, t0 + 30 * MIN, 'Inactivo', 'i', ''), tr(t0 + 30 * MIN + 2 * MIN, t0 + 40 * MIN, 'Estudio'), tr(t0, t0 + 40 * MIN, 'Ocio', 'v')];
  const s = G.lineaDia(l, dia0);
  assert.deepStrictEqual(s.map(x => [x.i, x.f, x.c]), [[t0, t0 + 20 * MIN, 'Estudio'], [t0 + 20 * MIN, t0 + 30 * MIN, 'Inactivo'], [t0 + 32 * MIN, t0 + 40 * MIN, 'Estudio']].map(([i, f, c]) => [i, f, c]).slice(0, 3));
  assert.strictEqual(G.lineaDia([tr(dia0 - 10 * MIN, dia0 + 5 * MIN, 'Ocio')], dia0)[0].i, dia0, 'recorta a la medianoche');
}
{ // constructores: SVG/HTML sin style= ni on…=, con escape
  const dias = ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'];
  const l = [tr(t0, t0 + 90 * MIN, 'Estudio', 'a', 'word<b>.exe'), tr(t0 + 90 * MIN, t0 + 120 * MIN, 'Ocio'), tr(t0 + 120 * MIN, t0 + 150 * MIN, 'Inactivo', 'i', ''), tr(dia0 - 864e5 + 600 * MIN, dia0 - 864e5 + 700 * MIN, 'Sin clasificar')];
  const hs = [G.areaDia(l, '2026-11-18', ['a'], cats), G.areaSemana(l, dias, ['a'], cats), G.lineaHtml(l, '2026-11-18', cats), G.repartoHtml(G.reparto(l, ['a']), cats), G.semanaHtml(l, dias, ['a'], cats)];
  hs.forEach(h => { assert.ok(/<svg/.test(h)); assert.ok(!/\sstyle\s*=/i.test(h), 'sin style='); assert.ok(!/\son\w+\s*=/i.test(h), 'sin on…='); assert.ok(!/<b>/.test(h), 'escapa el HTML'); });
  assert.ok(/<title>Estudio · 10:00–11:30<\/title>/.test(hs[2]), 'tooltip de la línea');
  assert.ok(/<details/.test(hs[3]) && /1 h 30 min/.test(hs[3]));
  assert.ok(/uso-g-lg/.test(hs[0]), 'leyenda');
  assert.ok(/Sin datos/.test(G.areaDia([], '2026-11-18', ['a'], cats)) && /Sin datos/.test(G.repartoHtml([], cats)));
  assert.strictEqual(G.fmtMin(135), '2 h 15 min'); assert.strictEqual(G.fmtMin(35), '35 min'); assert.strictEqual(G.fmtMin(120), '2 h');
}
console.log('test_graficos_uso OK');
