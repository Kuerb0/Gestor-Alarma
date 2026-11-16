# Gestor-Alarma

Gestor-Alarma: panel lateral para Windows (Electron), fijo al **borde derecho** del monitor principal y a altura completa. Escondido solo se ve una rayita azul de 3 px; al llevar el ratón al borde derecho se despliega deslizándose, y se esconde 700 ms después de sacar el ratón.

**Cómo se abre**
- Ratón al borde derecho de la pantalla (en cualquier altura).
- `Ctrl+Alt+P`: abre fijado / cierra. `Esc`: cierra. 📌 de la cabecera: fija abierto (se recuerda).
- `Ctrl+Alt+A`: abre fijado en la pestaña **Alarmas** con el campo rápido enfocado (si ya está en Alarmas, cierra). `Ctrl+Alt+D`: descarta lo que suena.
- Bandeja: clic abre/cierra; menú con Abrir panel, Fijar abierto, Actualizar ahora, las entradas de alarmas (nueva, descartar, sincronizar, formato del tiempo), Iniciar con Windows y Salir.
- Inicio con Windows: acceso directo `Panel.lnk` en la carpeta Inicio (Windows omite la entrada de Run en este equipo; la antigua se borra al arrancar). `PANEL_SIN_INICIO=1` evita tocar el inicio.

**Pestañas:** Alarmas, Correo, Agenda, Tiempo y Sistema (`Ctrl+Alt+A` salta a Alarmas).

**De dónde sale cada dato**
- Hora y fecha: el reloj del PC.
- Tiempo: `meteo.js` (cada 30 min; el lugar se guarda en `ajustes.json`).
- Correo y agenda (hoy y mañana): `correo.js` + `outlook.ps1` con Outlook clásico abierto; cada 60 s y al abrir el panel. Clic en un correo lo abre; si Outlook está cerrado hay botón para abrirlo.
- Alarmas: el motor `alarmas.js` (el antiguo Gestor-Alarmas, ya integrado); ver «Pestaña Alarmas».
- Sistema: `sistema.js` (CPU, RAM, disco C:) cada 2 s solo con el panel abierto; batería con `navigator.getBattery()`.

Datos del panel en `%APPDATA%\panel`: `ajustes.json` y `panel.log`.

## Pestaña Alarmas
Además de la pestaña, una columna de fichas giratorias (split-flap) en la **esquina superior derecha** del monitor, sin fondo, siempre encima y **click-through** (`overlay.html`/`overlay.js`): cuentas atrás, alarmas a fecha y hora, recurrentes y cronómetros. Máximo 5 tarjetas (primero lo que suena, luego perdidas, cuentas atrás por cercanía y cronómetros); el resto, «+N más».

**Crear una alarma** (texto rápido + Intro, con vista previa; o «Campos detallados»)

| Escribes | Resultado |
|---|---|
| `Reunión 25m` · `Pizza 1h30m` · `2 días examen` | cuenta atrás |
| `Examen 20/11 09:30` · `20/11/2027` · `Cita 18:30` | alarma a fecha y hora (sin hora: 09:00; sin año: la próxima vez; solo hora: hoy o mañana) |
| `Dentista mañana 10:00` · `pasado mañana 18:00` · `hoy 18:00` | día relativo (sin hora: 09:00) |
| `Partido viernes 20:00` · `el lunes 08:00` | próximo día de la semana |
| `Pastilla todos los días 8:00` · `diario 22:00` | recurrente, cada día |
| `Gimnasio lunes a viernes 7:30` · `laborables 7:30` | recurrente, de lunes a viernes |
| `Inglés lunes y jueves 18:00` · `cada martes 10:00` | recurrente, días concretos |
| `cron Estudio` | cronómetro (cuenta hacia arriba) |

La lista de la pestaña permite **Editar** y **Borrar**.

**Al llegar a cero:** la tarjeta parpadea en ámbar y suena un aviso 30 s; a los 60 s se elimina sola (`Ctrl+Alt+D` antes). Si la app estaba apagada, sale como **PERDIDA** (en rojo) hasta descartarla. Las recurrentes saltan a su próxima ocurrencia. Color de las cifras: azul con más de 1 h, vira a ámbar hasta los 10 min y a rojo al llegar a 0; el cronómetro se queda en azul. **Formato del tiempo** (menú de la bandeja): *Adaptativo* (`2d 03h` · `03h 15m` · `14:32`) o *Completo* (`2d 03h 15m 08s`).

**Post-It y Outlook (solo lectura; cada 30 s, al abrir la pestaña y con su botón):** reutiliza el código de [Post-It](https://github.com/Kuerb0/Post-It-App) (`eventos.js`, `sync.js`; carpeta `C:\Github\Post-It-App` o la de `GESTOR_POSTIT`) vía `puente.js`.
- **Post-It:** las alarmas ⏰ de tus notas de los próximos N días (14 por defecto, editable en la pestaña) salen como fichas **sin sonar**.
- **Outlook:** eventos con hora que lleven la categoría **Alarma** (Outlook clásico abierto, o el ICS de Post-It, que no trae categorías: se recuerda título→categoría en `categorias.json`). Suenan 10 min antes y al empezar. Los de todo el día no salen.
- Salen con su origen y sin Editar/Borrar; `Ctrl+Alt+D` las descarta igual.

**Alarmas → Outlook:** las alarmas **a fecha y hora** se crean también como evento (categoría `Alarma`, 15 min, recordatorio 10 min antes) con `outlook_salida.js` + `outlook_escribir.ps1`; si se editan o borran aquí, se actualizan o borran allí. Calendario de destino: `calendarioOutlook` en `ajustes.json` (vacío = el primero). Si Outlook falla, reintenta a los 5 min.

**Datos:** `%APPDATA%\gestor-alarmas` (la carpeta del Gestor, para no perder nada): `alarmas.json` (con `.bak`), `ajustes.json` (solo se leen `formato`, `ventanaDias` y `calendarioOutlook`), `categorias.json` y `outlook-pendiente.json`.

## Desarrollo
- `npm install`, `npm start`.
- `npm test`: fuentes, `tiempo.js`, `puente.js` y `outlook_salida.js`. `npm run humo`: abre el panel y el overlay con datos inventados, recorre las pestañas, guarda capturas en `%TEMP%\panel-humo` (`panel-<pestaña>.png`, `overlay.png`) y comprueba el DOM (`HUMO OK`).
- Empaquetado: `python C:\Github\herramientas-apps\construir.py exe` (usa `app.json`).

**Icono:** `assets/icon.png` y `assets/icon.ico` se generan con `python herramientas/icono.py assets` (campana de cristal; necesita Pillow).
