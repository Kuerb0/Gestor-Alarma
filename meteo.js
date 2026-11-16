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
function armar(j, lugar, ahora) {
  const c = j.current, h = j.hourly, d = j.daily;
  const horaLocal = (c.time || `${ymd(ahora)}T${dd(ahora.getHours())}:00`).slice(0, 13);
  const hoy = horaLocal.slice(0, 10);
  const delDia = f => { // las 24 h de un día (f = 'AAAA-MM-DD')
    let i = h.time.findIndex(t => t.slice(0, 10) === f); if (i < 0) { if (f !== hoy) return []; i = 0; } // hoy sin coincidencia: las primeras 24 h
    return h.time.slice(i, i + 24).map((t, k) => ({
      hora: t.slice(11, 13) + ':00', temp: r(h.temperature_2m[i + k]), icono: wmo(h.weather_code[i + k]).icono, lluvia: r(h.precipitation_probability[i + k] || 0),
    }));
  };
  const horas = delDia(hoy);
  const ahoraH = Number(horaLocal.slice(11, 13)) + (c.time ? Number(c.time.slice(14, 16)) || 0 : ahora.getMinutes()) / 60; // horas decimales en la zona del lugar
  const manana = ymd(new Date(new Date(hoy + 'T12:00:00').getTime() + 864e5));
  const dias = d.time.map((f, k) => ({
    fecha: f, nombre: f === hoy ? 'Hoy' : f === manana ? 'Mañana' : DIAS[new Date(f + 'T12:00:00').getDay()],
    max: r(d.temperature_2m_max[k]), min: r(d.temperature_2m_min[k]), icono: wmo(d.weather_code[k]).icono, texto: wmo(d.weather_code[k]).texto, lluvia: r(d.precipitation_probability_max[k] || 0), horas: delDia(f),
  })).slice(0, 5);
  const w = wmo(c.weather_code);
  return { ok: true, lugar, actual: { temp: r(c.temperature_2m), codigo: c.weather_code, texto: w.texto, icono: w.icono, viento: r(c.wind_speed_10m) }, horas, ahora: ahoraH, dias };
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
      '&current=temperature_2m,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code,precipitation_probability' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=5';
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return { ok: false, motivo: 'http_' + resp.status };
    return armar(await resp.json(), { nombre: lugar.nombre, lat: Number(lugar.lat), lon: Number(lugar.lon) }, new Date());
  } catch (e) { return { ok: false, motivo: e.message || 'error' }; }
}

module.exports = { leer, wmo, armar };
