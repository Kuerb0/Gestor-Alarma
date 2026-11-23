// decidirTema (tema_fondo.js): bitmaps sintéticos BGRA
const assert = require('assert'), { decidirTema, medirCeldas } = require('../tema_fondo');
const W = 160, H = 80;
const bmp = (f, w = W, h = H) => { const b = Buffer.alloc(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y), i = (y * w + x) * 4; b[i] = b[i + 1] = b[i + 2] = v; b[i + 3] = 255; } return b; };
const gris = v => bmp(() => v);
const sRGB = l => Math.round(255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055)); // luminancia lineal -> valor 0-255
const t = (b, p) => decidirTema(b, W, H, p).tema;

assert.strictEqual(t(gris(0)), 'claro', 'negro -> claro');
assert.strictEqual(t(gris(255)), 'oscuro', 'blanco -> oscuro');
assert.strictEqual(t(bmp((x, y) => y < H / 2 ? 0 : 255)), 'claroscuro', 'mitad negra / mitad blanca -> claroscuro');
assert.strictEqual(t(bmp((x, y) => y < H * 0.4 ? 5 : 235)), 'claroscuro', 'negro arriba y nubes abajo -> claroscuro');
assert.strictEqual(t(bmp((x, y) => (x + y) % 2 ? 255 : 0)), 'velado', 'tablero fino -> velado');
assert.strictEqual(t(bmp((x, y) => ((x >> 1) + (y >> 1)) & 1 ? 255 : 0)), 'velado', 'tablero de 2 px -> velado');
assert.strictEqual(t(gris(128)), 'claro', 'gris medio (luminancia 0,22) -> claro');
assert.strictEqual(t(gris(sRGB(0.3))), 'claro', 'gris 0,3 -> claro');
assert.strictEqual(t(gris(sRGB(0.7))), 'oscuro', 'gris 0,7 -> oscuro');

// histéresis: un gris justo por encima del corte (0,4) mantiene el previo si está dentro del margen
const g42 = gris(sRGB(0.42));
assert.strictEqual(t(g42), 'oscuro', 'sin previo: 0,42 -> oscuro');
assert.strictEqual(t(g42, 'claro'), 'claro', 'previo claro: 0,42 sigue claro');
assert.strictEqual(t(g42, 'oscuro'), 'oscuro');
assert.strictEqual(t(gris(sRGB(0.47)), 'claro'), 'oscuro', 'previo claro: 0,47 ya cambia');
assert.strictEqual(t(gris(sRGB(0.38)), 'oscuro'), 'oscuro', 'previo oscuro: 0,38 sigue oscuro');
assert.strictEqual(t(gris(sRGB(0.33)), 'oscuro'), 'claro', 'previo oscuro: 0,33 ya cambia');
assert.strictEqual(t(gris(sRGB(0.2)), 'claro'), 'claro', 'previo claro: 0,2 sigue claro (relajado a < 0,23)');
assert.strictEqual(t(gris(0), 'oscuro'), 'claro', 'un cambio claro no lo frena la histéresis');

// luminancia: pesos y orden BGRA (rojo puro 0,2126; verde 0,7152; azul 0,0722)
const color = (r, g, b) => { const x = Buffer.alloc(W * H * 4); for (let i = 0; i < x.length; i += 4) { x[i] = b; x[i + 1] = g; x[i + 2] = r; x[i + 3] = 255; } return medirCeldas(x, W, H)[0].lum; };
assert(Math.abs(color(255, 0, 0) - 0.2126) < 1e-6 && Math.abs(color(0, 255, 0) - 0.7152) < 1e-6 && Math.abs(color(0, 0, 255) - 0.0722) < 1e-6, 'pesos de luminancia / orden BGRA');

// casos límite: sin imagen, imagen minúscula, bitmap corto
assert.strictEqual(decidirTema(null, 10, 10).tema, 'claroscuro', 'sin imagen -> claroscuro');
assert.strictEqual(decidirTema(Buffer.alloc(8), 10, 10).tema, 'claroscuro', 'bitmap corto -> claroscuro');
assert.strictEqual(decidirTema(gris(0), 0, 0).tema, 'claroscuro', 'tamaño 0');
assert.strictEqual(decidirTema(bmp(() => 255, 2, 2), 2, 2).tema, 'oscuro', 'imagen de 2×2 blanca');
assert.strictEqual(decidirTema(gris(0), W, H).celdas.length, 16, '16 celdas');
console.log('test_tema_fondo OK');
