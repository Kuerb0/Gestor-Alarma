// Aspecto de las burbujas (fichas del overlay): valores permitidos y saneado. Función pura, sin electron: la usan alarmas.js y tests/test_burbujas.js.
const FORMAS = ['pildora', 'redondeada', 'cuadrada'], TAMANOS = ['pequeno', 'mediano', 'grande'], ESQUINAS = ['arriba-der', 'arriba-izq', 'abajo-der', 'abajo-izq'];
const POR_DEFECTO = { forma: 'pildora', tamano: 'mediano', maxFichas: 5, maxCuadros: 6, nombre: 11, esquina: 'arriba-der' }; // = el aspecto de siempre
const num = (v, min, max, def) => { const n = Math.round(Number(v)); return typeof v === 'boolean' || v === null || v === '' || !Number.isFinite(n) ? def : Math.min(max, Math.max(min, n)); };
const elige = (v, lista, def) => lista.includes(v) ? v : def;
function limpiar(b) {
  b = b && typeof b === 'object' ? b : {};
  const d = POR_DEFECTO;
  return { forma: elige(b.forma, FORMAS, d.forma), tamano: elige(b.tamano, TAMANOS, d.tamano), maxFichas: num(b.maxFichas, 1, 10, d.maxFichas), maxCuadros: num(b.maxCuadros, 0, 10, d.maxCuadros), nombre: num(b.nombre, 6, 24, d.nombre), esquina: elige(b.esquina, ESQUINAS, d.esquina) };
}
module.exports = { POR_DEFECTO, FORMAS, TAMANOS, ESQUINAS, limpiar };
