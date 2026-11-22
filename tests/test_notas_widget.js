// htmlNotas (graficos.js no es un módulo: se evalúa en un contexto aparte)
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const { htmlNotas } = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'graficos.js'), 'utf8') + '\n({ htmlNotas })', {});
const l = [{ id: 'a', texto: 'hola <b>x</b>\nlínea 2', creada: '2026-11-22T10:32:00' }];
let h = htmlNotas(l, {});
assert(h.includes('&lt;b&gt;x&lt;/b&gt;') && !h.includes('<b>x</b>'), 'escapa el texto');
assert(h.includes('<time>') && h.includes('wn-t') && h.includes('id="wn-texto"'), 'fecha y cuadro por defecto');
assert(!htmlNotas(l, { fecha: false }).includes('<time>'), 'sin fecha');
assert(!htmlNotas(l, { nueva: false }).includes('wn-texto'), 'sin cuadro con nueva:false');
assert(!htmlNotas(l, { uid: 'v1' }).includes('wn-texto'), 'sin cuadro en la galería (uid)');
assert(htmlNotas([], {}).includes('Sin notas todavía'), 'lista vacía');
assert(htmlNotas(null, {}).includes('Cargando'), 'sin cargar');
assert(htmlNotas(l, { tam: 'g' }).includes('wn-g'), 'tamaño');
console.log('test_notas_widget OK');
