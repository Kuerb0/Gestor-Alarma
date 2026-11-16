// Lógica pura del gestor: leer lo que escribe la persona, formatear el tiempo y decidir en qué fase está cada alarma.
// Nada lee el reloj: todas las funciones reciben `ahora` (ms). Sirve en Node (main, pruebas) y en el navegador (overlay, formulario).
(function (raiz) {
  const SUENA_MS = 30e3;     // el sonido dura 30 s desde que llega a cero
  const VISIBLE_MS = 60e3;   // la tarjeta sigue 60 s (parpadeando) y luego se elimina (o salta a la siguiente, si es recurrente)
  const MAX_MS = 3650 * 864e5; // 10 años: tope razonable
  const UNIDAD = { d: 864e5, h: 36e5, m: 6e4, s: 1e3 };
  const DIAS = { domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3, jueves: 4, viernes: 5, sábado: 6, sabado: 6 };
  const WD = '(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)';
  const SEP = '(?:\\s*,\\s*|\\s+y\\s+|\\s+e\\s+)';
  const RE = {
    diario: /\b(?:todos\s+los\s+d[ií]as|cada\s+d[ií]a|diari[oa]s?)\b/i,
    laborables: /(?:\bde\s+)?\b(?:lunes\s+a\s+viernes|laborables?)\b/i,
    lista: new RegExp(`(?:\\b(?:cada|todos\\s+los)\\s+)?\\b${WD}(?:${SEP}${WD})*\\b`, 'i'),
    semana: new RegExp(`(?:\\b(?:el|este|pr[oó]ximo)\\s+)?\\b${WD}\\b`, 'i'),
    relativo: /(?:\b(?:el|para)\s+)?\b(hoy|pasado\s+ma[nñ]ana|ma[nñ]ana)\b/i,
  };
  const pad = n => String(n).padStart(2, '0');
  const err = e => ({ ok: false, error: e });

  // Quita del texto lo que casó (`m[0]`) y lo deja en blanco
  const quitar = (t, m) => t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length);
  const limpiar = t => t.replace(/\s+/g, ' ').replace(/^[\s,;:\-–]+|[\s,;:\-–]+$/g, '');

  // Próxima ocurrencia (estrictamente posterior a `ahora`) de una alarma recurrente { dias:[0‑6, 0=domingo], hh, mm }
  function siguiente(a, ahora) {
    const d = new Date(ahora);
    for (let i = 0; i < 8; i++) {
      const c = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i, a.hh, a.mm, 0, 0);
      if (c.getTime() > ahora && a.dias.includes(c.getDay())) return c.getTime();
    }
    return NaN;
  }
  const NOMBRE_DIA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  function etiquetaDias(dias) {
    const s = [...dias].sort().join('');
    if (s === '0123456') return 'todos los días';
    if (s === '12345') return 'L–V';
    return [1, 2, 3, 4, 5, 6, 0].filter(n => dias.includes(n)).map(n => NOMBRE_DIA[n]).join(' ');
  }

  // "Reunión 25m" · "Pizza 1h30m" · "Examen 20/11 09:30" · "Cita 18:30" · "Dentista mañana 10:00" · "Gol viernes 20:00"
  // · "Pastilla todos los días 8:00" · "Gimnasio lunes a viernes 7:30" · "Inglés lunes y jueves 18:00" · "cron Estudio"
  function parsear(texto, ahora) {
    let t = ' ' + String(texto || '').trim() + ' ';
    if (!t.trim()) return err('Escribe algo');

    let m = t.match(/^\s*(cron[oó]metro|crono|cron)(?![\p{L}])/iu);
    if (m) {
      const nombre = limpiar(t.slice(m[0].length));
      return { ok: true, rec: { nombre: nombre || 'Cronómetro', tipo: 'crono', inicio: ahora } };
    }

    const hora = t.match(/(?:\ba\s+las\s+)?(?<![\d:])(\d{1,2}):(\d{2})(?![\d:])/i);
    if (hora) t = quitar(t, hora);
    const hh = hora ? +hora[1] : 9, mm = hora ? +hora[2] : 0; // sin hora: las 9:00
    if (hh > 23 || mm > 59) return err('Fecha u hora no válida');

    // ---- recurrentes
    let dias = null, r;
    if ((r = t.match(RE.diario))) { dias = [0, 1, 2, 3, 4, 5, 6]; t = quitar(t, r); }
    else if ((r = t.match(RE.laborables))) { dias = [1, 2, 3, 4, 5]; t = quitar(t, r); }
    else if ((r = t.match(RE.lista))) {
      const ds = [...r[0].toLowerCase().matchAll(new RegExp(WD, 'g'))].map(x => DIAS[x[1]]);
      if (/^\s*(cada|todos)/i.test(r[0]) || ds.length > 1) { dias = [...new Set(ds)].sort(); t = quitar(t, r); }
    }
    if (dias) {
      const rec = { nombre: limpiar(t) || 'Alarma', tipo: 'recurrente', dias, hh, mm };
      rec.objetivo = siguiente(rec, ahora);
      return { ok: true, rec };
    }

    // ---- fecha concreta, relativa (hoy/mañana/pasado mañana), día de la semana o solo hora
    const fecha = t.match(/(?:\bel\s+)?(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d/])/i);
    if (fecha) t = quitar(t, fecha);
    const rel = fecha ? null : t.match(RE.relativo);
    if (rel) t = quitar(t, rel);
    const sem = fecha || rel ? null : t.match(RE.semana);
    if (sem) t = quitar(t, sem);

    if (fecha || rel || sem || hora) {
      const d = new Date(ahora), y0 = d.getFullYear(), m0 = d.getMonth(), d0 = d.getDate();
      const en = (y, mo, dia) => new Date(y, mo, dia, hh, mm, 0, 0);
      let obj;
      if (fecha) {
        const dia = +fecha[1], mo = +fecha[2] - 1;
        let y = fecha[3] ? (fecha[3].length === 2 ? 2000 + +fecha[3] : +fecha[3]) : y0;
        if (mo < 0 || mo > 11) return err('Fecha u hora no válida');
        obj = en(y, mo, dia);
        if (obj.getMonth() !== mo || obj.getDate() !== dia) return err('Esa fecha no existe');
        if (obj.getTime() <= ahora && !fecha[3]) obj = en(y + 1, mo, dia); // ya pasó y no dio año: la próxima vez que ocurra
      } else if (rel) {
        obj = en(y0, m0, d0 + (/pasado/i.test(rel[1]) ? 2 : /hoy/i.test(rel[1]) ? 0 : 1));
      } else if (sem) {
        const off = (DIAS[sem[1].toLowerCase()] - d.getDay() + 7) % 7;
        obj = en(y0, m0, d0 + off);
        if (obj.getTime() <= ahora) obj = en(y0, m0, d0 + off + 7);
      } else {
        obj = en(y0, m0, d0); if (obj.getTime() <= ahora) obj = en(y0, m0, d0 + 1);
      }
      if (obj.getTime() <= ahora) return err('Esa fecha ya ha pasado');
      if (obj.getTime() - ahora > MAX_MS) return err('Demasiado lejos (máx. 10 años)');
      return { ok: true, rec: { nombre: limpiar(t) || 'Alarma', tipo: 'fecha', objetivo: obj.getTime() } };
    }

    // ---- duración: puede ir en varios trozos pegados ("1h30m"); primero se localiza el bloque entero y luego se suman sus trozos
    const trozo = '(\\d+(?:[.,]\\d+)?)\\s*(d[ií]as?|d|h(?:oras?|rs?)?|m(?:in(?:utos?)?)?|s(?:eg(?:undos?)?)?)(?![\\p{L}])\\s*';
    const bloque = new RegExp(`(?<![\\p{L}\\d.,])(?:${trozo})+`, 'giu');
    let total = 0, hay = false;
    for (const x of [...t.matchAll(bloque)].reverse()) { // de atrás adelante para que los índices sigan valiendo al quitar
      for (const y of x[0].matchAll(new RegExp(trozo, 'giu'))) total += parseFloat(y[1].replace(',', '.')) * UNIDAD[y[2][0].toLowerCase()];
      t = quitar(t, x); hay = true;
    }
    if (!hay) return err('Falta una duración (25m, 2h), una fecha (20/11 09:30, mañana 9:30, viernes 20:00) o una repetición (todos los días 8:00)');
    total = Math.round(total);
    if (total <= 0) return err('La duración debe ser mayor que cero');
    if (total > MAX_MS) return err('Demasiado lejos (máx. 10 años)');
    return { ok: true, rec: { nombre: limpiar(t) || 'Cuenta atrás', tipo: 'cuenta', objetivo: ahora + total } };
  }

  // formato 'adaptativo': 2d 03h · 03h 15m · 14:32 · 00:45      formato 'completo': 2d 03h 15m 08s · 15m 08s · 08s
  // Lo que falta se redondea hacia arriba; lo transcurrido, hacia abajo.
  function formatear(ms, transcurrido, formato) {
    const s = Math.max(0, transcurrido ? Math.floor(ms / 1e3) : Math.ceil(ms / 1e3));
    const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), mi = Math.floor(s % 3600 / 60), se = s % 60;
    if (formato === 'completo') return d ? `${d}d ${pad(h)}h ${pad(mi)}m ${pad(se)}s` : h ? `${pad(h)}h ${pad(mi)}m ${pad(se)}s` : mi ? `${pad(mi)}m ${pad(se)}s` : `${pad(se)}s`;
    if (d) return `${d}d ${pad(h)}h`;
    if (h) return `${pad(h)}h ${pad(mi)}m`;
    return `${pad(mi)}:${pad(se)}`;
  }

  // Color de las cifras según lo que falta: azul (más de 1 h) → ámbar (a 10 min) → rojo (a 0). Mezcla lineal en RGB, uniforme en cada tramo.
  const AZUL = [74, 163, 255], AMBAR = [255, 190, 40], ROJO = [255, 70, 55];
  const mezcla = (a, b, t) => 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',') + ')';
  function color(ms) {
    if (ms >= 36e5) return mezcla(AZUL, AMBAR, 0);
    if (ms >= 6e5) return mezcla(AZUL, AMBAR, (36e5 - ms) / 30e5);
    return mezcla(AMBAR, ROJO, (6e5 - Math.max(0, ms)) / 6e5);
  }

  // activa → sonando (0‑60 s tras llegar a cero; suena 30 s) → fin. Si nunca se vio sonar (app apagada) → perdida, hasta descartarla.
  // Una recurrente nunca queda «perdida»: pasados los 60 s da `fin` y el main la recarga con su próxima ocurrencia.
  function fase(a, ahora) {
    if (a.descartada) return { fase: 'fin' };
    if (a.tipo === 'crono') return { fase: 'activa', ms: Math.max(0, ahora - a.inicio) };
    const resta = a.objetivo - ahora;
    if (resta > 0) {
      if (a.aviso && resta <= a.aviso) { // preaviso (eventos de Outlook): suena a `aviso` ms del inicio, parpadea 60 s y sigue contando hasta el inicio
        const p = a.aviso - resta;
        return p <= VISIBLE_MS ? { fase: 'sonando', ms: resta, suena: p <= SUENA_MS } : { fase: 'activa', ms: resta };
      }
      return { fase: 'activa', ms: resta };
    }
    const d = -resta;
    if (d <= VISIBLE_MS) return { fase: 'sonando', suena: d <= SUENA_MS };
    return { fase: a.avisada || a.tipo === 'recurrente' ? 'fin' : 'perdida' };
  }

  // sonando, perdidas, cuentas atrás por proximidad y al final los cronómetros (los más recientes primero)
  function ordenar(lista, ahora) {
    const peso = a => { const f = fase(a, ahora).fase; return f === 'sonando' ? 0 : f === 'perdida' ? 1 : a.tipo === 'crono' ? 3 : 2; };
    return [...lista].sort((x, y) => peso(x) - peso(y) ||
      (x.tipo === 'crono' ? y.inicio - x.inicio : x.objetivo - y.objetivo));
  }

  // El main acepta solo registros bien formados; la interfaz es una frontera de confianza.
  function validar(r, ahora) {
    if (!r || typeof r !== 'object') return err('Alarma no válida');
    const nombre = limpiar(String(r.nombre ?? '')).slice(0, 60);
    if (!['cuenta', 'fecha', 'crono', 'recurrente'].includes(r.tipo)) return err('Tipo no válido');
    if (r.tipo === 'crono') return { ok: true, rec: { nombre: nombre || 'Cronómetro', tipo: 'crono', inicio: ahora } };
    if (r.tipo === 'recurrente') {
      const dias = [...new Set((Array.isArray(r.dias) ? r.dias : []).map(Number))].filter(n => Number.isInteger(n) && n >= 0 && n <= 6).sort();
      if (!dias.length) return err('Elige al menos un día');
      const hh = Number(r.hh), mm = Number(r.mm);
      if (!(Number.isInteger(hh) && hh >= 0 && hh < 24 && Number.isInteger(mm) && mm >= 0 && mm < 60)) return err('Hora no válida');
      const rec = { nombre: nombre || 'Alarma', tipo: 'recurrente', dias, hh, mm };
      rec.objetivo = siguiente(rec, ahora);
      return { ok: true, rec };
    }
    if (!Number.isFinite(r.objetivo) || r.objetivo <= ahora) return err('La fecha debe ser futura');
    if (r.objetivo - ahora > MAX_MS) return err('Demasiado lejos (máx. 10 años)');
    return { ok: true, rec: { nombre: nombre || (r.tipo === 'cuenta' ? 'Cuenta atrás' : 'Alarma'), tipo: r.tipo, objetivo: Math.round(r.objetivo) } };
  }

  const API = { parsear, formatear, color, fase, ordenar, validar, siguiente, etiquetaDias, SUENA_MS, VISIBLE_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else raiz.Tiempo = API;
})(typeof window !== 'undefined' ? window : globalThis);
