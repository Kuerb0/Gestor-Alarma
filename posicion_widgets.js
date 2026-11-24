// Posición y tamaño de los widgets del escritorio: funciones puras (sin Electron) para poder probarlas.
// Regla: lo guardado manda; solo lo cambia el usuario (arrastrando/redimensionando). Windows puede mover o reescalar las ventanas
// (pantalla que tarda en detectarse, cambio de resolución de un juego, suspensión...) y entonces se las devuelve a lo guardado.
const TOL = 2; // px de diferencia que se tolera al comparar

const cae = (x, y, areas) => areas.some(b => x + 60 > b.x && x < b.x + b.width - 60 && y + 30 > b.y && y < b.y + b.height - 60); // basta con ver parte de la barra de arriba: un widget pegado al borde (y algo negativa) sigue valiendo

// ¿la posición guardada {x,y} cae dentro de alguna pantalla (workAreas)?
function posicionValida(g, areas) {
  return !!g && Number.isFinite(g.x) && Number.isFinite(g.y) && Array.isArray(areas) && cae(g.x, g.y, areas);
}

// A qué bounds hay que llevar la ventana: guardado {x,y,ancho,alto}, actual {x,y,width,height}, areas = workAreas, anchoAuto = ancho si no hay uno a mano.
// null si ya está bien o si la guardada no es válida (entonces no se toca: ya volverá la pantalla).
function destinoWidget(guardado, actual, areas, anchoAuto) {
  if (!posicionValida(guardado, areas) || !actual) return null;
  const d = {
    x: Math.round(guardado.x), y: Math.round(guardado.y),
    width: Math.round(Number.isFinite(guardado.ancho) ? guardado.ancho : anchoAuto),
    height: Math.round(Number.isFinite(guardado.alto) ? guardado.alto : actual.height), // sin alto a mano, el de ahora (auto por contenido)
  };
  if (![d.width, d.height].every(Number.isFinite)) return null;
  const ok = Math.abs(actual.x - d.x) <= TOL && Math.abs(actual.y - d.y) <= TOL && Math.abs(actual.width - d.width) <= TOL && Math.abs(actual.height - d.height) <= TOL;
  return ok ? null : d;
}

module.exports = { posicionValida, destinoWidget, TOL };
