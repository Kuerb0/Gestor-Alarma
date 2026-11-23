// Tema de contraste automático de los widgets: a partir de una captura del escritorio detrás del widget (bitmap BGRA, como el de NativeImage.toBitmap() en Windows)
// decide qué tema usar (claro / oscuro / claroscuro / velado). Función pura, sin electron: la usa main.js (medirFondo) y tests/test_tema_fondo.js.
const REJILLA = 4; // la imagen se divide en REJILLA × REJILLA celdas
// Se muestrea una de cada 3 columnas y de cada 5 filas (barato: ~1/15 de los píxeles). Pasos impares y distintos a propósito: con un paso par un dibujo fino
// (tablero de 1 px, rayas) caería siempre en el mismo color y parecería liso.
const PASO_X = 3, PASO_Y = 5;
const CLARO_MAX = 0.18;    // celda «oscura»: luminancia relativa por debajo de esto. Si TODAS lo están -> tema 'claro' (texto claro sobre fondo oscuro)
const OSCURO_MIN = 0.55;   // si TODAS las celdas están por encima de esto -> tema 'oscuro' (texto oscuro sobre fondo claro)
const MEZCLA_CLARA = 0.30; // celda «clara» (el texto blanco ya no llega a contraste 3:1 encima) para detectar el fondo mixto: hay celdas < CLARO_MAX y celdas > MEZCLA_CLARA -> 'claroscuro'
const MEZCLA_RANGO = 0.35; // o bien: diferencia entre la celda más clara y la más oscura mayor que esto -> 'claroscuro'
const DETALLE_MAX = 0.2;   // desviación típica media dentro de las celdas mayor que esto (fondo muy «ruidoso», sin zonas lisas) -> 'velado'
const MEDIA_CORTE = 0.4;   // en el resto de casos: luminancia media < esto -> 'claro', si no 'oscuro'
const MARGEN = 0.05;       // histéresis: el tema anterior se mantiene mientras siga cumpliendo sus condiciones con este margen de más (evita parpadeos en el límite)

const LIN = Array.from({ length: 256 }, (_, v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); // sRGB (0-255) -> lineal

// Luminancia relativa (0 negro, 1 blanco) y desviación típica de cada celda. Devuelve [{ lum, desv }] de REJILLA*REJILLA celdas (por filas), o null si no hay imagen utilizable.
function medirCeldas(bmp, ancho, alto) {
  if (!bmp || !(ancho >= 1) || !(alto >= 1) || bmp.length < ancho * alto * 4) return null;
  const celdas = [];
  for (let cy = 0; cy < REJILLA; cy++) for (let cx = 0; cx < REJILLA; cx++) {
    const x0 = Math.floor(cx * ancho / REJILLA), y0 = Math.floor(cy * alto / REJILLA);
    const x1 = Math.max(x0 + 1, Math.floor((cx + 1) * ancho / REJILLA)), y1 = Math.max(y0 + 1, Math.floor((cy + 1) * alto / REJILLA)); // al menos 1 píxel por celda
    let n = 0, s = 0, s2 = 0;
    for (let y = Math.min(y0, alto - 1); y < Math.min(y1, alto); y += PASO_Y) for (let x = Math.min(x0, ancho - 1); x < Math.min(x1, ancho); x += PASO_X) {
      const i = (y * ancho + x) * 4, l = 0.2126 * LIN[bmp[i + 2]] + 0.7152 * LIN[bmp[i + 1]] + 0.0722 * LIN[bmp[i]]; // BGRA
      n++; s += l; s2 += l * l;
    }
    const m = n ? s / n : 0;
    celdas.push({ lum: m, desv: n ? Math.sqrt(Math.max(0, s2 / n - m * m)) : 0 });
  }
  return celdas;
}

// `previo`: tema que había (para la histéresis; opcional). Devuelve { tema, celdas } con tema en 'claro' | 'oscuro' | 'claroscuro' | 'velado'.
// Sin imagen utilizable devuelve 'claroscuro', el más seguro (se lee sobre negro y sobre blanco).
function decidirTema(bmp, ancho, alto, previo) {
  const celdas = medirCeldas(bmp, ancho, alto);
  if (!celdas) return { tema: 'claroscuro', celdas: [] };
  const lums = celdas.map(c => c.lum), mn = Math.min(...lums), mx = Math.max(...lums), media = lums.reduce((a, b) => a + b, 0) / lums.length;
  const detalle = celdas.reduce((a, c) => a + c.desv, 0) / celdas.length;
  const m = t => t === previo ? MARGEN : 0; // al tema anterior se le relajan sus umbrales
  let tema;
  if (mx < CLARO_MAX + m('claro')) tema = 'claro';
  else if (mn > OSCURO_MIN - m('oscuro')) tema = 'oscuro';
  else if ((mn < CLARO_MAX + m('claroscuro') && mx > MEZCLA_CLARA - m('claroscuro')) || mx - mn > MEZCLA_RANGO - m('claroscuro')) tema = 'claroscuro';
  else if (detalle > DETALLE_MAX - m('velado')) tema = 'velado';
  else tema = media < MEDIA_CORTE + m('claro') - m('oscuro') ? 'claro' : 'oscuro';
  return { tema, celdas };
}
module.exports = { decidirTema, medirCeldas, REJILLA, CLARO_MAX, OSCURO_MIN, MEZCLA_CLARA, MEZCLA_RANGO, DETALLE_MAX, MEDIA_CORTE, MARGEN };
