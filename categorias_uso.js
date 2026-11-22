// Categorías del uso de apps: reglas editables que clasifican cada tramo (se aplican al leer, así cambiar una regla reclasifica todo el historial). Puro: sin electron ni fs.
const SIN = 'Sin clasificar';
const CATS = [['Estudio', '#4a9eff'], ['Programación', '#a06bff'], ['Comunicación', '#2ec4b6'], ['Ocio', '#ff8a3d'], ['Juegos', '#e5533d'], ['Herramientas', '#8a9a3b'], ['Sistema', '#7a7f8a'], [SIN, '#555a66']].map(([nombre, color]) => ({ nombre, color }));
const NAVEGADORES = ['chrome.exe', 'msedge.exe', 'firefox.exe', 'opera.exe', 'brave.exe', 'vivaldi.exe'];
const MAX_CATS = 30, MAX_REGLAS = 500;
const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function porDefecto() {
  const t = (valor, cat) => ({ campo: 'titulo', op: 'contiene', valor, cat }), e = (valor, cat) => ({ campo: 'exe', op: 'es', valor, cat });
  return {
    categorias: CATS.map(c => ({ ...c })),
    reglas: [
      ...['youtube', 'netflix', 'twitch', 'prime video'].map(v => t(v, 'Ocio')),
      ...['uah', 'blackboard', 'campus virtual'].map(v => t(v, 'Estudio')),
      ...['github', 'stack overflow'].map(v => t(v, 'Programación')),
      ...['gmail', 'outlook'].map(v => t(v, 'Comunicación')),
      ...['code.exe', 'cursor.exe', 'windowsterminal.exe', 'powershell.exe', 'claude.exe'].map(v => e(v, 'Programación')),
      ...['discord.exe', 'whatsapp.exe', 'whatsapp.root.exe', 'telegram.exe', 'outlook.exe', 'olk.exe'].map(v => e(v, 'Comunicación')),
      ...['steam.exe', 'epicgameslauncher.exe'].map(v => e(v, 'Juegos')),
      e('spotify.exe', 'Ocio'),
      ...['winword.exe', 'excel.exe', 'powerpnt.exe', 'onenote.exe', 'acrobat.exe'].map(v => e(v, 'Estudio')),
      ...['explorer.exe', 'notepad.exe'].map(v => e(v, 'Herramientas')),
      ...['taskmgr.exe', 'systemsettings.exe', 'applicationframehost.exe'].map(v => e(v, 'Sistema')),
    ],
  };
}

function saneaCategorias(lista) {
  const vistas = new Set(), out = [];
  for (const c of Array.isArray(lista) ? lista : []) {
    if (!c || typeof c !== 'object' || typeof c.nombre !== 'string') continue;
    const nombre = c.nombre.trim().slice(0, 40), k = norm(nombre);
    if (!nombre || vistas.has(k) || out.length >= MAX_CATS) continue;
    vistas.add(k); out.push({ nombre, color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color.toLowerCase() : '#555a66' });
  }
  if (!vistas.has(norm(SIN))) { if (out.length >= MAX_CATS) out.pop(); out.push({ nombre: SIN, color: '#555a66' }); }
  return out;
}
// regla válida (con la categoría tal cual existe en `nombres`) o { error }
function saneaRegla(r, nombres) {
  if (!r || typeof r !== 'object') return { error: 'no es una regla' };
  if (r.campo !== 'exe' && r.campo !== 'titulo') return { error: 'campo no válido: ' + String(r.campo).slice(0, 20) };
  if (r.op !== 'es' && r.op !== 'contiene') return { error: 'op no válida: ' + String(r.op).slice(0, 20) };
  const valor = typeof r.valor === 'string' ? r.valor.trim() : '';
  if (!valor || valor.length > 200) return { error: 'valor vacío o demasiado largo' };
  const cat = nombres.find(n => norm(n) === norm(r.cat));
  if (!cat) return { error: 'categoría inexistente: ' + String(r.cat).slice(0, 40) };
  return { regla: { campo: r.campo, op: r.op, valor, cat } };
}
function sanear(cfg) {
  if (!cfg || typeof cfg !== 'object' || !Array.isArray(cfg.categorias) || !Array.isArray(cfg.reglas)) return porDefecto();
  const categorias = saneaCategorias(cfg.categorias), nombres = categorias.map(c => c.nombre), reglas = [];
  for (const r of cfg.reglas) { const x = saneaRegla(r, nombres); if (x.regla && reglas.length < MAX_REGLAS) reglas.push(x.regla); }
  return { categorias, reglas };
}

const encaja = (r, tr) => { const a = norm(r.campo === 'exe' ? tr.exe : tr.t), v = norm(r.valor); return r.op === 'es' ? a === v : a.includes(v); };
function clasificar(tr, cfg) {
  if (tr.n === 'i') return 'Inactivo';
  const r = cfg.reglas.find(x => encaja(x, tr));
  return r ? r.cat : SIN;
}
// título de navegador sin el sufijo « - Opera», « - Personal - Microsoft Edge»…: corta desde el último « - »
const sinSufijo = t => { t = String(t || ''); const i = t.lastIndexOf(' - '); return (i > 0 ? t.slice(0, i) : t).trim(); };
function sinClasificar(tramos, cfg, max = 40) {
  const m = new Map();
  for (const tr of tramos || []) {
    if (!tr || tr.n !== 'a' || clasificar(tr, cfg) !== SIN) continue;
    const nav = NAVEGADORES.includes(tr.exe), t = nav ? sinSufijo(tr.t) : '', k = tr.exe + '|' + t;
    let o = m.get(k); if (!o) { o = { exe: tr.exe, d: tr.d || '', seg: 0 }; if (t) o.t = t; m.set(k, o); }
    o.seg += Math.max(0, (tr.f - tr.i) / 1000);
  }
  return [...m.values()].map(o => ({ ...o, seg: Math.round(o.seg) })).sort((a, b) => b.seg - a.seg).slice(0, max);
}

function textoSugerencias(lista, cfg) {
  const filas = lista.map(x => `- ${x.exe} | ${x.d || '-'}${x.t ? ' | título: ' + x.t : ''} | ${Math.max(1, Math.round(x.seg / 60))} min`).join('\n') || '(nada)';
  return [
    'Clasifica el uso de mis apps. Cada regla es un objeto JSON {"campo":"exe"|"titulo","op":"es"|"contiene","valor":"...","cat":"..."}:',
    '- campo "exe" compara con el nombre del programa (en minúsculas, p. ej. "opera.exe"); campo "titulo" con el título de la ventana.',
    '- op "es" exige igualdad; "contiene" busca el texto dentro. Se ignoran mayúsculas y tildes. Gana la primera regla que encaje.',
    '- "cat" debe ser una de estas categorías: ' + cfg.categorias.map(c => c.nombre).filter(n => n !== SIN).join(', ') + '.',
    '',
    'Reglas actuales (no las repitas):',
    JSON.stringify(cfg.reglas),
    '',
    'Programas sin clasificar (exe | descripción | título | minutos):',
    filas,
    '',
    'Responde SOLO con un array JSON de reglas nuevas, sin explicaciones. Usa "titulo contiene" solo para navegadores o apps que mezclan usos; para el resto, "exe es".',
  ].join('\n');
}

// primer array JSON del texto (aunque venga entre ``` o con prosa); respeta cadenas y corchetes anidados
function extraerArray(texto) {
  const s = String(texto || '');
  for (let ini = s.indexOf('['); ini >= 0; ini = s.indexOf('[', ini + 1)) {
    let prof = 0, enCad = false;
    for (let i = ini; i < s.length; i++) {
      const c = s[i];
      if (enCad) { if (c === '\\') i++; else if (c === '"') enCad = false; continue; }
      if (c === '"') enCad = true; else if (c === '[') prof++; else if (c === ']' && --prof === 0) { try { const a = JSON.parse(s.slice(ini, i + 1)); if (Array.isArray(a)) return a; } catch {} break; }
    }
  }
  return null;
}
function importar(texto, cfg) {
  const arr = extraerArray(texto), errores = [];
  const nuevo = { categorias: cfg.categorias.map(c => ({ ...c })), reglas: cfg.reglas.map(r => ({ ...r })) };
  if (!arr) return { cfg: nuevo, n: 0, errores: ['no encuentro ningún array JSON'] };
  const nombres = nuevo.categorias.map(c => c.nombre), clave = r => r.campo + '|' + r.op + '|' + norm(r.valor);
  const hay = new Set(nuevo.reglas.map(clave)), titulo = [], exe = [];
  for (const r of arr) {
    const x = saneaRegla(r, nombres);
    if (x.error) { errores.push(x.error); continue; }
    if (hay.has(clave(x.regla))) continue;
    if (nuevo.reglas.length + titulo.length + exe.length >= MAX_REGLAS) { errores.push('demasiadas reglas'); break; }
    hay.add(clave(x.regla)); (x.regla.campo === 'titulo' ? titulo : exe).push(x.regla);
  }
  nuevo.reglas = [...titulo, ...nuevo.reglas, ...exe];
  return { cfg: nuevo, n: titulo.length + exe.length, errores };
}

module.exports = { SIN, CATS, norm, porDefecto, sanear, clasificar, sinClasificar, textoSugerencias, importar };
