# Lee Outlook clásico ya abierto (bandeja de entrada + agenda de los próximos 7 días) y lo escribe como JSON. Lo llama correo.js.
# Uso: outlook.ps1            -> lee correos y agenda
#      outlook.ps1 -Dias N    -> agenda de N días (1–120, por defecto 7)
#      outlook.ps1 -Abrir ID  -> abre ese elemento (EntryID) y trae Outlook al frente
#      outlook.ps1 -Crear F [-Ensayo] -> crea el evento del JSON F {titulo,inicio,fin,todoDia,lugar,categoria} en el calendario predeterminado; salida {ok,id}.
#                                        Con -Ensayo monta el evento pero lo descarta sin guardar: {ok,ensayo}
#      outlook.ps1 -Leidos F  -> marca como leídos los EntryIDs del array JSON del fichero F; salida {ok,hechos,fallos}
#      outlook.ps1 -Buzon     -> cuenta los correos sin leer de todas las carpetas de correo; salida {ok,noLeidos}
#      outlook.ps1 -MarcarBuzon -> marca como leídos todos los correos sin leer de todas las carpetas; salida {ok,hechos,fallos}
#      outlook.ps1 -BorrarEvento F -> borra el evento del JSON F {id,inicio,recurrente,serie}: la serie entera (serie) o solo la ocurrencia de «inicio»
# Códigos de salida: 0 = ok · 3 = Outlook cerrado (no se abre solo) · 4 = Outlook no instalado · 5 = otro error
#      outlook.ps1 -EditarEvento F -> cambia el evento del JSON F {id,inicioOriginal,recurrente,titulo,inicio,fin,todoDia,lugar[,categoria]}; en una serie, solo la ocurrencia de «inicioOriginal»
param([string]$Abrir, [string]$Leidos, [string]$Crear, [switch]$Ensayo, [int]$Dias = 7, [switch]$Buzon, [switch]$MarcarBuzon, [string]$BorrarEvento, [string]$EditarEvento)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

# enum OlCategoryColor (1..25), igual que Post-It-App
$paleta = @{1='#e5533d';2='#f08c2e';3='#f4b183';4='#e0c341';5='#3fa34d';6='#2ec4a6';7='#8a9a3b';8='#3a86ff';9='#a06bff';10='#e5609c';11='#8a8a90';12='#5a5a62';13='#9a9aa0';14='#6a6a70';15='#4a4a4e';16='#a83228';17='#c06a1e';18='#d09a6a';19='#b09a20';20='#2a7a34';21='#1e8a76';22='#6a7a2b';23='#2a5ecc';24='#7a4ac0';25='#7a3444'}

try { $ol = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application') }
catch {
  if (-not (Test-Path 'Registry::HKEY_CLASSES_ROOT\Outlook.Application')) { exit 4 }
  exit 3
}
try {
  $ns = $ol.GetNamespace('MAPI')
  if ($Abrir) {
    $ns.GetItemFromID($Abrir).Display()
    try { $ol.ActiveExplorer().Activate() } catch { }
    exit 0
  }

  if ($Leidos) {
    $ids = @(Get-Content -LiteralPath $Leidos -Raw -Encoding UTF8 | ConvertFrom-Json); $hechos = 0; $fallos = 0
    foreach ($id in $ids) {
      try { $x = $ns.GetItemFromID([string]$id); $x.UnRead = $false; $x.Save(); $hechos++ } catch { $fallos++ }
    }
    [ordered]@{ ok = $true; hechos = $hechos; fallos = $fallos } | ConvertTo-Json -Compress
    exit 0
  }

  if ($Buzon -or $MarcarBuzon) {
    # Carpetas de correo de todos los almacenes (recursivo). Restrict() filtra solo los no leídos.
    $carpetas = New-Object Collections.Generic.List[object]
    function Recoger($f) {
      if ($f.DefaultItemType -eq 0) { $carpetas.Add($f) }
      foreach ($s in $f.Folders) { Recoger $s }
    }
    foreach ($st in $ns.Stores) { try { Recoger $st.GetRootFolder() } catch { } }
    if ($MarcarBuzon) {
      $hechos = 0; $fallos = 0
      foreach ($f in $carpetas) {
        try {
          $sin = $f.Items.Restrict('[UnRead] = true'); $it = $sin.GetFirst()
          while ($it -ne $null) { try { $it.UnRead = $false; $it.Save(); $hechos++ } catch { $fallos++ }; $it = $sin.GetNext() }
        } catch { }
      }
      [ordered]@{ ok = $true; hechos = $hechos; fallos = $fallos } | ConvertTo-Json -Compress
    } else {
      $total = 0
      foreach ($f in $carpetas) { try { $total += [int]$f.UnReadItemCount } catch { } }
      [ordered]@{ ok = $true; noLeidos = $total } | ConvertTo-Json -Compress
    }
    exit 0
  }

  if ($BorrarEvento) {
    $j = Get-Content -LiteralPath $BorrarEvento -Raw -Encoding UTF8 | ConvertFrom-Json
    $ci = [Globalization.CultureInfo]::InvariantCulture
    $m = $ns.GetItemFromID([string]$j.id)   # en una serie, el id es el de la serie (maestro)
    if ($j.recurrente -and -not $j.serie) {
      $occ = $m.GetRecurrencePattern().GetOccurrence([datetime]::ParseExact([string]$j.inicio, 'yyyy-MM-ddTHH:mm:ss', $ci))
      $occ.Delete()
    } else { $m.Delete() }
    [ordered]@{ ok = $true } | ConvertTo-Json -Compress
    exit 0
  }

  if ($EditarEvento) {
    $j = Get-Content -LiteralPath $EditarEvento -Raw -Encoding UTF8 | ConvertFrom-Json
    $ci = [Globalization.CultureInfo]::InvariantCulture; $fmt = 'yyyy-MM-ddTHH:mm:ss'
    $it = $ns.GetItemFromID([string]$j.id)
    if ($j.recurrente) { $it = $it.GetRecurrencePattern().GetOccurrence([datetime]::ParseExact([string]$j.inicioOriginal, $fmt, $ci)) }
    $it.Subject = [string]$j.titulo
    $it.AllDayEvent = [bool]$j.todoDia
    $it.Start = [datetime]::ParseExact([string]$j.inicio, $fmt, $ci)
    $it.End = [datetime]::ParseExact([string]$j.fin, $fmt, $ci)
    $it.Location = [string]$j.lugar
    if ($j.PSObject.Properties['categoria']) { $it.Categories = [string]$j.categoria }
    $it.Save()
    [ordered]@{ ok = $true } | ConvertTo-Json -Compress
    exit 0
  }

  if ($Crear) {
    $j = Get-Content -LiteralPath $Crear -Raw -Encoding UTF8 | ConvertFrom-Json
    $ci = [Globalization.CultureInfo]::InvariantCulture; $fmt = 'yyyy-MM-ddTHH:mm:ss'
    $it = $ol.CreateItem(1)   # olAppointmentItem, en el calendario predeterminado
    $it.Subject = [string]$j.titulo
    $it.AllDayEvent = [bool]$j.todoDia
    $it.Start = [datetime]::ParseExact([string]$j.inicio, $fmt, $ci)
    $it.End = [datetime]::ParseExact([string]$j.fin, $fmt, $ci)
    if ($j.lugar) { $it.Location = [string]$j.lugar }
    if ($j.categoria) { $it.Categories = [string]$j.categoria }
    if ($j.todoDia) { $it.ReminderSet = $false } else { $it.ReminderSet = $true; $it.ReminderMinutesBeforeStart = 15 }
    if ($Ensayo) { $it.Close(1); [ordered]@{ ok = $true; ensayo = $true } | ConvertTo-Json -Compress; exit 0 }   # 1 = olDiscard
    $it.Save()
    [ordered]@{ ok = $true; id = [string]$it.EntryID } | ConvertTo-Json -Compress
    exit 0
  }

  # Correos: los 40 más recientes de la Bandeja de entrada del almacén predeterminado
  $bandeja = $ns.GetDefaultFolder(6)
  $its = $bandeja.Items; $its.Sort('[ReceivedTime]', $true)
  $correos = New-Object Collections.Generic.List[object]
  $it = $its.GetFirst()
  while ($it -ne $null -and $correos.Count -lt 40) {
    try {
      $correos.Add([ordered]@{ id = [string]$it.EntryID; de = [string]$it.SenderName; asunto = [string]$it.Subject; fecha = $it.ReceivedTime.ToString('s'); leido = (-not [bool]$it.UnRead) })
    } catch { }   # elementos sin Subject/ReceivedTime: se saltan
    $it = $its.GetNext()
  }

  # Agenda: hoy 00:00 hasta hoy+$Dias días 00:00 (1–120), todos los almacenes
  $Dias = [Math]::Min(120, [Math]::Max(1, $Dias))
  $d0 = (Get-Date).Date; $d1 = $d0.AddDays($Dias)
  # Restrict() interpreta las fechas con el formato regional del sistema (en es-ES: dd/MM/yyyy), NO con el de EE. UU.: con MM/dd el rango salía mal o vacío según el día
  $cu = [Globalization.CultureInfo]::CurrentCulture
  $filtro = "[Start] < '" + $d1.ToString('g', $cu) + "' AND [End] > '" + $d0.ToString('g', $cu) + "'"
  $agenda = New-Object Collections.Generic.List[object]; $vistos = @{}; $categorias = New-Object Collections.Generic.List[object]
  # Primera pasada: UN mapa global nombre -> color (@{} no distingue mayúsculas). Se recorren las cuentas empezando por la predeterminada: la primera que tiene la categoría CON color manda (salvo gris, ver abajo);
  # las demás solo añaden las que faltan o las que no tenían color. Así una categoría tiene el mismo color en toda la agenda aunque cada cuenta guarde su propia lista.
  $col = @{}; $nombres = @{}; $orden = New-Object Collections.Generic.List[string]; $stores = New-Object Collections.Generic.List[object]; $idDef = ''
  try { $sd = $ns.DefaultStore; if ($sd) { $idDef = [string]$sd.StoreID; $stores.Add($sd) } } catch { }
  foreach ($st in $ns.Stores) { $sid = ''; try { $sid = [string]$st.StoreID } catch { }; if (-not $idDef -or $sid -ne $idDef) { $stores.Add($st) } }
  # Los grises (11-15) parecen «sin color»: un color de verdad de otra cuenta gana a un gris (caso real: «Personal» gris en la predeterminada y verde en la otra).
  $debil = @{}
  foreach ($st in $stores) {
    try { foreach ($c in $st.Categories) { $ci = [int]$c.Color; $h = $paleta[$ci]; $n = [string]$c.Name; if (-not $n) { continue }; $gris = $ci -ge 11 -and $ci -le 15
      if ($h -and (-not $col[$n] -or ($debil[$n] -and -not $gris))) { $col[$n] = $h; $debil[$n] = $gris }
      if (-not $nombres[$n]) { $nombres[$n] = 1; $orden.Add($n) } } } catch { }
  }
  foreach ($n in $orden) { $categorias.Add([ordered]@{ nombre = $n; color = $col[$n] }) }
  # Segunda pasada: los eventos de cada cuenta, coloreados con el mapa global
  foreach ($st in $ns.Stores) {
    try { $cal = $st.GetDefaultFolder(9) } catch { continue }
    $items = $cal.Items; $items.Sort('[Start]'); $items.IncludeRecurrences = $true
    foreach ($a in $items.Restrict($filtro)) {
      $ini = $a.Start
      $id = ([string]$a.GlobalAppointmentID) + '@' + $ini.ToString('s')
      if ($vistos[$id]) { continue }; $vistos[$id] = 1
      $cats = @(([string]$a.Categories -split '[;,]') | ForEach-Object { $_.Trim() } | Where-Object { $_ }); $color = $null
      $cat = [string]($cats | Where-Object { $_ -ne 'Alarma' } | Select-Object -First 1); if (-not $cat -and $cats) { $cat = [string]$cats[0] }   # «Alarma» es la etiqueta funcional del Gestor: la que se enseña (y colorea) es la otra
      if ($cat -and $col[$cat]) { $color = $col[$cat] }
      # id: el del evento; en una serie (ocurrencia o excepción) el de la serie, y «inicio» dice cuál ocurrencia
      $rs = [int]$a.RecurrenceState
      $evId = ''
      try { $evId = if ($rs -eq 0) { [string]$a.EntryID } else { [string]$a.GetRecurrencePattern().Parent.EntryID } } catch { }
      $agenda.Add([ordered]@{ titulo = [string]$a.Subject; inicio = $ini.ToString('s'); fin = $a.End.ToString('s'); todoDia = [bool]$a.AllDayEvent; lugar = [string]$a.Location; categoria = $cat; color = $color; id = $evId; recurrente = ($rs -ne 0) })
    }
  }
  [ordered]@{ ok = $true; noLeidos = [int]$bandeja.UnReadItemCount; correos = $correos.ToArray(); agenda = $agenda.ToArray(); categorias = $categorias.ToArray() } | ConvertTo-Json -Depth 5 -Compress  # ToArray: @(List) falla en PS 5.1 («Los tipos de argumentos no coinciden»)
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 5 }
