// node tests/test_burbujas.js  → debe acabar en "TEST OK"
const assert = require('assert');
const { POR_DEFECTO, limpiar } = require('../burbujas');

assert.deepStrictEqual(limpiar(), POR_DEFECTO, 'sin nada: por defecto');
assert.deepStrictEqual(limpiar(null), POR_DEFECTO);
assert.deepStrictEqual(limpiar('basura'), POR_DEFECTO);
assert.deepStrictEqual(limpiar({}), POR_DEFECTO);
assert.deepStrictEqual(POR_DEFECTO, { forma: 'pildora', tamano: 'mediano', maxFichas: 5, maxCuadros: 6, nombre: 11, esquina: 'arriba-der' });

// valores válidos pasan
const v = { forma: 'cuadrada', tamano: 'grande', maxFichas: 3, maxCuadros: 0, nombre: 20, esquina: 'abajo-izq' };
assert.deepStrictEqual(limpiar(v), v);

// fuera de rango: se recorta
assert.deepStrictEqual(limpiar({ maxFichas: 0, maxCuadros: -4, nombre: 2 }), { ...POR_DEFECTO, maxFichas: 1, maxCuadros: 0, nombre: 6 });
assert.deepStrictEqual(limpiar({ maxFichas: 99, maxCuadros: 99, nombre: 99 }), { ...POR_DEFECTO, maxFichas: 10, maxCuadros: 10, nombre: 24 });
assert.strictEqual(limpiar({ maxFichas: 3.6 }).maxFichas, 4, 'redondea');
assert.strictEqual(limpiar({ maxFichas: '7' }).maxFichas, 7, 'número en texto');

// basura: por defecto
assert.deepStrictEqual(limpiar({ forma: 'triangulo', tamano: 5, esquina: 'centro', maxFichas: 'x', maxCuadros: NaN, nombre: null }), POR_DEFECTO);
assert.deepStrictEqual(limpiar({ forma: {}, tamano: [], esquina: true, maxFichas: true, maxCuadros: '', nombre: {} }), POR_DEFECTO);
assert.deepStrictEqual(Object.keys(limpiar({ otra: 1, forma: 'pildora' })).sort(), Object.keys(POR_DEFECTO).sort(), 'sin claves extra');
console.log('TEST OK');
