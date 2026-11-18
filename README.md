# Gestor-Alarma

Gestor-Alarma: panel lateral para Windows (Electron), fijo al **borde derecho** del monitor principal y a altura completa. Escondido solo se ve una rayita azul de 3 px; al llevar el ratón al borde derecho se despliega deslizándose, y se esconde 700 ms después de sacar el ratón.

**Cómo se abre**
- Ratón al borde derecho de la pantalla (en cualquier altura).
- `Ctrl+Alt+P`: abre fijado / cierra. `Esc`: cierra. 📌 de la cabecera: fija abierto (se recuerda).
- `Ctrl+Alt+A`: abre fijado en la pestaña **Alarmas** con el campo rápido enfocado (si ya está en Alarmas, cierra). `Ctrl+Alt+D`: descarta lo que suena.
- Bandeja: clic abre/cierra; menú con Abrir panel, Fijar abierto, Actualizar ahora, las entradas de alarmas (nueva, descartar, sincronizar, formato del tiempo), **No molestar** (30 min, 1 h o 2 h; silencia los pitidos del overlay, las tarjetas siguen; se quita solo o desde el menú; no sobrevive a reiniciar), Iniciar con Windows y Salir.
- Inicio con Windows: acceso directo `Panel.lnk` en la carpeta Inicio (Windows omite la entrada de Run en este equipo; la antigua se borra al arrancar). `PANEL_SIN_INICIO=1` evita tocar el inicio.

**Pestañas:** Alarmas, Correo, Agenda, Tiempo, Notas y Sistema (`Ctrl+Alt+A` salta a Alarmas).

**De dónde sale cada dato**
- Hora y fecha: el reloj del PC.
- Tiempo: `meteo.js` (cada 30 min). **Varias ciudades** (hasta 6, guardadas en `ajustes.lugares`): «＋ Ciudad» busca por nombre (geocodificación de Open-Meteo) y las ciudades salen como pestañitas sobre el gráfico; la × de la elegida la quita. La primera vez se usa la ciudad de la IP. El widget del Tiempo también tiene las pestañitas (la elección es suya). El gráfico del día muestra un punto cada 15 min cuando Open-Meteo lo da, y debajo viento, humedad, sensación, UV, presión y nubes.
- Correo y agenda (hoy y mañana): `correo.js` + `outlook.ps1` con Outlook clásico abierto; cada 60 s y al abrir el panel. Clic en un correo lo abre; si Outlook está cerrado hay botón para abrirlo. «Marcar todo el buzón como leído» cuenta los no leídos de todas las carpetas y pide confirmación con ese número.
- Alarmas: el motor `alarmas.js` (el antiguo Gestor-Alarmas, ya integrado); ver «Pestaña Alarmas».
- Sistema: `sistema.js` (CPU, RAM, disco C:) cada 2 s solo con el panel abierto; batería con `navigator.getBattery()`.

**Widgets en el escritorio:** el gráfico del **Tiempo** (con sus flechas de día) y las barras de **Sistema** se pueden sacar a una ventanita propia (`widget.html`/`widget.js`, dibujo compartido en `graficos.js`). Botón «🖥️ Widget» en esas pestañas, o bandeja → «Widgets en el escritorio». Se arrastran para colocarlos (también a otro monitor), la **×** que sale al pasar el ratón los quita, no van «siempre encima» (se quedan con las demás ventanas), se esconden en pantalla completa y se recuerdan (posición y si estaban abiertos) en `ajustes.json`. El de Sistema mide cada 2 s mientras esté abierto. **Configurables:** el botón de ajustes del widget (aparece junto a la × y al estilo) elige el **tamaño** (pequeño/mediano/grande, cambia el ancho de la ventana), un **nivel de detalle** (Mínimo/Normal/Completo) e interruptores sueltos: en Tiempo ciudades, gráfico, iconos, lluvia, temperaturas cada 3 h, resumen, detalles y próximos días (3/5/7); en Sistema CPU, RAM, disco, dispositivos y batería. Se guarda en `ajustes.widgets.<tipo>.cfg`. **Agenda:** tercer widget (`htmlAgenda` en `graficos.js`): modo *Eventos* (lista por días, 1/3/7) o *Horas* (línea de tiempo de hoy con 6/10/14 h, eventos solapados en columnas y línea de «ahora»); interruptores de «Todo el día» y «Lugar». **Galería:** la pestaña «🧩 Widgets» del panel muestra 10 variantes (4 de Tiempo, 3 de Sistema, 3 de Agenda) con su vista previa en vivo; pulsar una la pone en el escritorio con esa configuración (si el widget ya estaba abierto, se reconfigura) y pulsarla otra vez la quita. Las variantes están en `WVARIANTES` (`graficos.js`).

Datos del panel en `%APPDATA%\panel`: `ajustes.json` y `panel.log`.

## Crear eventos de Outlook (pestaña Agenda)
Botón «＋ Evento» (o clic en la cabecera de un día, que lo deja elegido): escribe `Dentista mañana 10:00`, `viernes 20:00` o `20/11 09:30` y la vista previa muestra título y tramo. Elige duración (30 min · 1 h · 2 h · Todo el día; sin hora = todo el día), una etiqueta (las categorías de Outlook, con su color) y, si quieres, «+ lugar». Intro o «Añadir a Outlook» lo crea en el calendario predeterminado con aviso 15 min antes (sin aviso si es de todo el día); Esc cancela. Necesita Outlook clásico abierto (`outlook.ps1 -Crear`; con `-Ensayo` lo monta sin guardar nada).

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

**Notas rápidas** (pestaña Notas): lista de notas de texto, con Editar y Borrar (Borrar pide una segunda pulsación). Se guardan en `%APPDATA%panel
otas.json`.

## Desarrollo
- `npm install`, `npm start`.
- `npm test`: fuentes, `tiempo.js`, `puente.js`, `outlook_salida.js`, `actualizar.js` y `meteo.js`. `npm run humo`: abre el panel y el overlay con datos inventados, recorre las pestañas, guarda capturas en `%TEMP%\panel-humo` (`panel-<pestaña>.png`, `overlay.png`) y comprueba el DOM (`HUMO OK`). No emite sonido.
- Empaquetado: `python C:\Github\herramientas-apps\construir.py exe` (usa `app.json`).

**Etiquetas de Outlook (pestaña Alarmas):** desplegable con una fila por categoría: *Suena como alarma* (con sus días) y/o *Sale arriba como evento* (cuadro del evento en curso, con «desde X min/h/días antes»). Con las dos marcadas se pone solo como alarma. Una categoría sin entrada sale como evento (60 min antes). Los de todo el día solo salen como cuadro si su etiqueta está en la lista. Hay buscador, y las alarmas de Outlook se pueden quitar con «Quitar» (`ajustes.ocultas`; siguen en Outlook). Ajustes en `ajustes.etiquetas`. El overlay pinta hasta 6 cuadros de evento. **Alt+C** (global) abre la Agenda con el formulario de nuevo evento.

## Actualizaciones y publicar una versión
**Cómo se actualiza:** a los ~20 s de arrancar y cada 6 h la app consulta `releases/latest` de `Kuerb0/Gestor-Alarma` (también «Buscar actualizaciones…» en la bandeja, que avisa si no hay nada o falla la red). Si la etiqueta `vX.Y.Z` es mayor que la de `package.json`, sale una pastilla «Nueva versión X» en la cabecera del panel (**Actualizar** / **×** = más tarde, se recuerda por versión en `ajustes.json`) y la entrada «Actualizar a la X…» en la bandeja. Al pulsar: baja el asset `… Instalador.exe` a `%TEMP%` (solo de `https://github.com/Kuerb0/Gestor-Alarma/releases/download/`, máx. 400 MB), lo lanza con `/S` en un `cmd` desacoplado, el instalador cierra la app, copia encima (los datos de `%APPDATA%` no se tocan) y el `cmd` reabre `GestorAlarma.exe`. En pantalla completa no se enseña nada. En desarrollo (`npm start`) comprueba pero no instala: «actualiza con git pull». Código: `actualizar.js`.

**Publicar una versión:** sube `version` en `package.json`, haz commit y ejecuta `.\herramientas\publicar.ps1 [-Notas "texto"]` (`-Ensayo` solo imprime los pasos). Exige árbol limpio, construye el instalador (`construir.py exe`, ~8 min), crea la etiqueta `v<versión>`, hace `git push` + `git push --tags` y `gh release create` con el instalador de `dist/` como asset (necesita `gh` con sesión iniciada). Cada versión publicada es también la descarga para instalar de cero.

**Icono:** `assets/icon.png` y `assets/icon.ico` se generan con `python herramientas/icono.py assets` (campana de cristal; necesita Pillow).
