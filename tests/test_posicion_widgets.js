// posicion_widgets.js: destinoWidget / posicionValida
const assert = require('assert'), { destinoWidget, posicionValida } = require('../posicion_widgets');
const izq = { x: -1600, y: 0, width: 1600, height: 852 }, prin = { x: 0, y: 0, width: 1920, height: 1040 }, areas = [izq, prin];
const act = (x, y, width, height) => ({ x, y, width, height });

// posicionValida
assert.strictEqual(posicionValida({ x: -1500, y: 100 }, areas), true, 'en la pantalla de la izquierda');
assert.strictEqual(posicionValida({ x: -1500, y: 100 }, [prin]), false, 'X negativa sin pantalla izquierda');
assert.strictEqual(posicionValida({ x: 1089, y: -3 }, areas), true, "pegado al borde de arriba (y algo negativa) sigue valiendo");
assert.strictEqual(posicionValida({ x: 100, y: -40 }, areas), false, "con la barra de arriba fuera de la pantalla no vale");
assert.strictEqual(posicionValida({ x: 10 }, areas), false, 'sin y');
assert.strictEqual(posicionValida(null, areas), false, 'sin guardado');
assert.strictEqual(posicionValida({ x: 1900, y: 100 }, areas), false, 'casi fuera por la derecha');

// ya está bien (con tolerancia) -> null
const g = { x: -1500, y: 100, ancho: 380, alto: 300 };
assert.strictEqual(destinoWidget(g, act(-1500, 100, 380, 300), areas, 999), null, 'igual -> null');
assert.strictEqual(destinoWidget(g, act(-1501, 101, 382, 298), areas, 999), null, 'dentro de la tolerancia -> null');

// Windows la reescaló ×1,2 -> se devuelve a lo guardado
assert.deepStrictEqual(destinoWidget(g, act(-1800, 120, 456, 360), areas, 999), { x: -1500, y: 100, width: 380, height: 300 }, 'reescalada -> vuelve');
assert.deepStrictEqual(destinoWidget(g, act(-1500, 103, 380, 300), areas, 999), { x: -1500, y: 100, width: 380, height: 300 }, 'fuera de tolerancia en y');

// sin ancho/alto a mano: ancho automático y alto actual
const g2 = { x: 50, y: 60 };
assert.strictEqual(destinoWidget(g2, act(50, 60, 380, 222), areas, 380), null, 'auto -> null');
assert.deepStrictEqual(destinoWidget(g2, act(50, 60, 456, 222), areas, 380), { x: 50, y: 60, width: 380, height: 222 }, 'ancho auto, alto actual');
assert.deepStrictEqual(destinoWidget({ x: 50, y: 60, alto: 400 }, act(50, 60, 380, 222), areas, 380), { x: 50, y: 60, width: 380, height: 400 }, 'alto a mano');

// guardada fuera de toda pantalla -> null (no se toca)
assert.strictEqual(destinoWidget(g, act(10, 10, 380, 300), [prin], 380), null, 'pantalla desconectada -> null');
assert.strictEqual(destinoWidget({}, act(10, 10, 380, 300), areas, 380), null, 'sin posición guardada -> null');
console.log('test_posicion_widgets OK');
