# Lee Outlook clásico ya abierto (bandeja de entrada + agenda de hoy y mañana) y lo escribe como JSON. Lo llama correo.js.
# Uso: outlook.ps1            -> lee correos y agenda
#      outlook.ps1 -Abrir ID  -> abre ese elemento (EntryID) y trae Outlook al frente
# Códigos de salida: 0 = ok · 3 = Outlook cerrado (no se abre solo) · 4 = Outlook no instalado · 5 = otro error
param([string]$Abrir)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

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

  # Agenda: hoy 00:00 hasta pasado mañana 00:00, todos los almacenes
  $d0 = (Get-Date).Date; $d1 = $d0.AddDays(2)
  $us = [Globalization.CultureInfo]::GetCultureInfo('en-US')
  $filtro = "[Start] < '" + $d1.ToString('MM/dd/yyyy hh:mm tt', $us) + "' AND [End] > '" + $d0.ToString('MM/dd/yyyy hh:mm tt', $us) + "'"
  $agenda = New-Object Collections.Generic.List[object]; $vistos = @{}
  foreach ($st in $ns.Stores) {
    try { $cal = $st.GetDefaultFolder(9) } catch { continue }
    $items = $cal.Items; $items.Sort('[Start]'); $items.IncludeRecurrences = $true
    foreach ($a in $items.Restrict($filtro)) {
      $ini = $a.Start
      $id = ([string]$a.GlobalAppointmentID) + '@' + $ini.ToString('s')
      if ($vistos[$id]) { continue }; $vistos[$id] = 1
      $agenda.Add([ordered]@{ titulo = [string]$a.Subject; inicio = $ini.ToString('s'); fin = $a.End.ToString('s'); todoDia = [bool]$a.AllDayEvent; lugar = [string]$a.Location })
    }
  }
  [ordered]@{ ok = $true; noLeidos = [int]$bandeja.UnReadItemCount; correos = @($correos); agenda = @($agenda) } | ConvertTo-Json -Depth 5 -Compress
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 5 }
