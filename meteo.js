// Tiempo con Open-Meteo (sin clave). Nunca lanza: devuelve { ok:false, motivo }.
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Código WMO -> texto + emoji en español
function wmo(c) {
  if (c === 0) return { texto: 'Despejado', icono: '☀️' };
  if (c === 1) return { texto: 'Casi despejado', icono: '🌤️' };
  if (c === 2) return { texto: 'Parcialmente nuboso', icono: '⛅' };
  if (c === 3) return { texto: 'Nublado', icono: '☁️' };
  if (c === 45 || c === 48) return { texto: 'Niebla', icono: '🌫️' };
  if (c >= 51 && c <= 57) return { texto: 'Llovizna', icono: '🌦️' };
  if (c >= 61 && c <= 67) return { texto: 'Lluvia', icono: '🌧️' };
  if (c >= 71 && c <= 77) return { texto: 'Nieve', icono: '🌨️' };
  if (c >= 80 && c <= 82) return { texto: 'Chubascos', icono: '🌦️' };
  if (c === 85 || c === 86) return { texto: 'Nieve', icono: '❄️' };
  if (c >= 95 && c <= 99) return { texto: 'Tormenta', icono: '⛈️' };
  return { texto: 'Desconocido', icono: '🌡️' };
}

const r = x => Math.round(Number(x));
const dd = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;

// Pura: JSON de Open-Meteo -> contrato. Los textos de hourly.time vienen en la hora local de la zona devuelta,
// así que "ahora" se toma de current.time; si falta, de la hora local de `ahora`. `horas` = las 24 h de HOY; `ahora` = hora decimal (15.4).
// Un campo opcional de Open-Meteo: número redondeado, o null si no vino (así la app no se rompe si falta algo)
const campo = (serie, i) => serie && serie[i] != null && Number.isFinite(Number(serie[i])) ? r(serie[i]) : null;

function armar(j, lugar, ahora) {
  const c = j.current, h = j.hourly, d = j.daily, m = j.minutely_15;
  const horaLocal = (c.time || `${ymd(ahora)}T${dd(ahora.getHours())}:00`).slice(0, 13);
  const hoy = horaLocal.slice(0, 10);
  const delDia = f => { // las 24 h de un día (f = 'AAAA-MM-DD')
    let i = h.time.findIndex(t => t.slice(0, 10) === f); if (i < 0) { if (f !== hoy) return []; i = 0; } // hoy sin coincidencia: las primeras 24 h
    return h.time.slice(i, i + 24).map((t, k) => ({
      hora: t.slice(11, 13) + ':00', temp: r(h.temperature_2m[i + k]), icono: wmo(h.weather_code[i + k]).icono, lluvia: r(h.precipitation_probability[i + k] || 0),
      viento: campo(h.wind_speed_10m, i + k), humedad: campo(h.relative_humidity_2m, i + k), sens: campo(h.apparent_temperature, i + k),
      presion: campo(h.pressure_msl, i + k), nubes: campo(h.cloud_cover, i + k), uv: campo(h.uv_index, i + k),
    }));
  };
  // puntos cada 15 min de un día (minutely_15): hd = hora decimal (14.25 = 14:15); el icono va en las horas en punto
  const puntosDe = (f, horas) => {
    if (!m || !m.time) return [];
    const pts = [];
    m.time.forEach((t, k) => {
      if (t.slice(0, 10) !== f) return;
      const hh = Number(t.slice(11, 13)), mi = Number(t.slice(14, 16)) || 0, hora = horas.find(x => x.hora === dd(hh) + ':00');
      pts.push({ hora: dd(hh) + ':' + dd(mi), hd: hh + mi / 60, temp: campo(m.temperature_2m, k), lluvia: campo(m.precipitation_probability, k) || 0, icono: mi === 0 && hora ? hora.icono : '' });
    });
    return pts;
  };
  const horas = delDia(hoy);
  const ahoraH = Number(horaLocal.slice(11, 13)) + (c.time ? Number(c.time.slice(14, 16)) || 0 : ahora.getMinutes()) / 60; // horas decimales en la zona del lugar
  const manana = ymd(new Date(new Date(hoy + 'T12:00:00').getTime() + 864e5));
  const dias = d.time.map((f, k) => {
    const hs = delDia(f);
    return {
      fecha: f, nombre: f === hoy ? 'Hoy' : f === manana ? 'Mañana' : DIAS[new Date(f + 'T12:00:00').getDay()],
      max: r(d.temperature_2m_max[k]), min: r(d.temperature_2m_min[k]), icono: wmo(d.weather_code[k]).icono, texto: wmo(d.weather_code[k]).texto, lluvia: r(d.precipitation_probability_max[k] || 0), horas: hs, puntos: puntosDe(f, hs),
    };
  }).slice(0, 5);
  const w = wmo(c.weather_code);
  const cv = k => campo([c[k]], 0); // valor actual (escalar) con la misma tolerancia a faltas
  const actual = { temp: r(c.temperature_2m), codigo: c.weather_code, texto: w.texto, icono: w.icono, viento: r(c.wind_speed_10m) };
  for (const [k, src] of [['humedad', 'relative_humidity_2m'], ['sens', 'apparent_temperature'], ['presion', 'pressure_msl'], ['nubes', 'cloud_cover']]) { // solo si vinieron
    const v = cv(src); if (v != null) actual[k] = v;
  }
  return { ok: true, lugar, actual, horas, puntos: puntosDe(hoy, horas), ahora: ahoraH, dias };
}

async function leer(lugarGuardado) {
  try {
    let lugar = lugarGuardado;
    if (!lugar || !Number.isFinite(Number(lugar.lat)) || !Number.isFinite(Number(lugar.lon))) {
      const g = await (await fetch('https://get.geojs.io/v1/ip/geo.json', { signal: AbortSignal.timeout(10000) })).json();
      if (!Number.isFinite(parseFloat(g.latitude))) return { ok: false, motivo: 'sin_ubicacion' };
      lugar = { nombre: g.city || 'Mi ubicación', lat: parseFloat(g.latitude), lon: parseFloat(g.longitude) };
    }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lugar.lat}&longitude=${lugar.lon}` +
      '&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,apparent_temperature,pressure_msl,cloud_cover' +
      '&hourly=temperature_2m,weather_code,precipitation_probability,wind_speed_10m,relative_humidity_2m,apparent_temperature,pressure_msl,cloud_cover,uv_index' +
      '&minutely_15=temperature_2m,precipitation_probability' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=5';
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return { ok: false, motivo: 'http_' + resp.status };
    return armar(await resp.json(), { nombre: lugar.nombre, lat: Number(lugar.lat), lon: Number(lugar.lon) }, new Date());
  } catch (e) { return { ok: false, motivo: e.message || 'error' }; }
}

module.exports = { leer, wmo, armar };
