# Lee Outlook clásico ya abierto (bandeja de entrada + agenda de los próximos 7 días) y lo escribe como JSON. Lo llama correo.js.
# Uso: outlook.ps1            -> lee correos y agenda
#      outlook.ps1 -Abrir ID  -> abre ese elemento (EntryID) y trae Outlook al frente
#      outlook.ps1 -Crear F [-Ensayo] -> crea el evento del JSON F {titulo,inicio,fin,todoDia,lugar,categoria} en el calendario predeterminado; salida {ok,id}.
#                                        Con -Ensayo monta el evento pero lo descarta sin guardar: {ok,ensayo}
#      outlook.ps1 -Leidos F  -> marca como leídos los EntryIDs del array JSON del fichero F; salida {ok,hechos,fallos}
# Códigos de salida: 0 = ok · 3 = Outlook cerrado (no se abre solo) · 4 = Outlook no instalado · 5 = otro error
param([string]$Abrir, [string]$Leidos, [string]$Crear, [switch]$Ensayo)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

# enum OlCategoryColor (1..25), igual que Post-It-App
$paleta = @{1='#e5533d';2='#f08c2e';3='#f4b183';4='#e0c341';5='#3fa34d';6='#2ec4a6';7='#8a9a3b';8='#3a86ff';9='#a06bff';10='#a04a5e';11='#8a8a90';12='#5a5a62';13='#9a9aa0';14='#6a6a70';15='#4a4a4e';16='#a83228';17='#c06a1e';18='#d09a6a';19='#b09a20';20='#2a7a34';21='#1e8a76';22='#6a7a2b';23='#2a5ecc';24='#7a4ac0';25='#7a3444'}

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

  # Agenda: hoy 00:00 hasta hoy+7 días 00:00, todos los almacenes
  $d0 = (Get-Date).Date; $d1 = $d0.AddDays(7)
  $us = [Globalization.CultureInfo]::GetCultureInfo('en-US')
  $filtro = "[Start] < '" + $d1.ToString('MM/dd/yyyy hh:mm tt', $us) + "' AND [End] > '" + $d0.ToString('MM/dd/yyyy hh:mm tt', $us) + "'"
  $agenda = New-Object Collections.Generic.List[object]; $vistos = @{}; $categorias = New-Object Collections.Generic.List[object]; $nombres = @{}
  foreach ($st in $ns.Stores) {
    $col = @{}
    try { foreach ($c in $st.Categories) { $h = $paleta[[int]$c.Color]; $n = [string]$c.Name; if ($h) { $col[$n] = $h }; if ($n -and -not $nombres[$n]) { $nombres[$n] = 1; $categorias.Add([ordered]@{ nombre = $n; color = $h }) } } } catch { }
    try { $cal = $st.GetDefaultFolder(9) } catch { continue }
    $items = $cal.Items; $items.Sort('[Start]'); $items.IncludeRecurrences = $true
    foreach ($a in $items.Restrict($filtro)) {
      $ini = $a.Start
      $id = ([string]$a.GlobalAppointmentID) + '@' + $ini.ToString('s')
      if ($vistos[$id]) { continue }; $vistos[$id] = 1
      $cat = ([string]$a.Categories -split '[;,]')[0].Trim(); $color = $null
      if ($cat -and $col[$cat]) { $color = $col[$cat] }
      $agenda.Add([ordered]@{ titulo = [string]$a.Subject; inicio = $ini.ToString('s'); fin = $a.End.ToString('s'); todoDia = [bool]$a.AllDayEvent; lugar = [string]$a.Location; categoria = $cat; color = $color })
    }
  }
  [ordered]@{ ok = $true; noLeidos = [int]$bandeja.UnReadItemCount; correos = $correos.ToArray(); agenda = $agenda.ToArray(); categorias = $categorias.ToArray() } | ConvertTo-Json -Depth 5 -Compress  # ToArray: @(List) falla en PS 5.1 («Los tipos de argumentos no coinciden»)
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 5 }
