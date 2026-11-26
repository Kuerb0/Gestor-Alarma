'use strict'
/**
 * Detección de la virtualización de AppData por un paquete MSIX (p. ej. la app de escritorio de Claude).
 * Un proceso heredado de un paquete escribe en %APPDATA%\X sin que lo vea el resto de Windows: la copia real vive
 * en <LOCALAPPDATA>\Packages\<paquete>\LocalCache\Roaming\X. Sin importar `electron`: todo inyectable para probarlo.
 */
const nodeFs = require('node:fs')
const nodePath = require('node:path')

/** Devuelve la carpeta del paquete donde aparecen las escrituras en userData, o null (sin virtualización o ante cualquier error). */
function detectarVirtualizacion({ userData, localAppData, fs = nodeFs, path = nodePath } = {}) {
  let marca = null
  try {
    if (!userData || !localAppData) return null
    const partes = path.resolve(userData).split(/[\\/]+/)
    if (!partes.slice(0, -1).some((p) => p.toLowerCase() === 'roaming')) return null
    const paquetes = path.join(localAppData, 'Packages')
    if (!fs.existsSync(paquetes)) return null
    const nombre = `.sonda-virtual-${process.pid}-${Math.random().toString(36).slice(2, 10)}`
    marca = path.join(userData, nombre)
    fs.mkdirSync(userData, { recursive: true })
    fs.writeFileSync(marca, 'sonda')
    const base = path.basename(userData)
    for (const p of fs.readdirSync(paquetes)) {
      const carpeta = path.join(paquetes, p, 'LocalCache', 'Roaming', base)
      try {
        if (fs.existsSync(path.join(carpeta, nombre))) return carpeta
      } catch { /* paquete ilegible: se salta */ }
    }
    return null
  } catch {
    return null
  } finally {
    try { if (marca) fs.rmSync(marca, { force: true }) } catch { /* nada */ }
  }
}

/** Argumentos para relanzar la app: los actuales (sin el ejecutable) más `--relanzado`, sin duplicarlo. */
function argumentosRelanzar(argv) {
  const args = (argv || []).slice(1)
  return args.includes('--relanzado') ? args : [...args, '--relanzado']
}

module.exports = { detectarVirtualizacion, argumentosRelanzar }
