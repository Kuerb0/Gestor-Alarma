# Crea, actualiza o borra eventos en el calendario de Outlook clásico (por automatización). Lo llama outlook_salida.js.
# Entrada (-Entrada: fichero JSON): [{op:'crear'|'actualizar'|'borrar', id, nombre, inicio (ms desde 1970), entryId}]
# Salida: [{id, ok, entryId, error}] · Códigos de salida: 0 = hecho · 4 = Outlook no instalado / sin automatización
# Un borrado va a «Elementos eliminados» (se puede recuperar). Si Outlook no estaba abierto, se abre por automatización, se espera a que suba los
# cambios al servidor (si no, el ICS de Outlook web no los vería) y se cierra.
param([Parameter(Mandatory)][string]$Entrada, [string]$Calendario = '')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ops = @(Get-Content -LiteralPath $Entrada -Raw -Encoding UTF8 | ConvertFrom-Json)

$yaAbierto = $false
try { $null = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application'); $yaAbierto = $true } catch { }
try { $ol = New-Object -ComObject Outlook.Application } catch { [Console]::Error.WriteLine('Outlook no disponible'); exit 4 }
$ns = $ol.GetNamespace('MAPI')

# calendario de destino: el almacén con ese nombre; si no existe, el primero que tenga calendario
$cal = $null
foreach ($st in $ns.Stores) {
  try { $f = $st.GetDefaultFolder(9) } catch { continue }
  if (-not $cal) { $cal = $f }
  if ($Calendario -and $st.DisplayName -eq $Calendario) { $cal = $f; break }
}
if (-not $cal) { [Console]::Error.WriteLine('Sin calendario'); exit 4 }

function Rellenar($it, $o) {
  $ini = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$o.inicio).LocalDateTime
  $it.Subject = [string]$o.nombre
  $it.Start = $ini; $it.End = $ini.AddMinutes(15)
  $it.ReminderSet = $true; $it.ReminderMinutesBeforeStart = 10
}

$res = New-Object Collections.Generic.List[object]; $cambios = 0
foreach ($o in $ops) {
  $r = [ordered]@{ id = [string]$o.id; ok = $false; entryId = ''; error = '' }
  try {
    switch ($o.op) {
      'crear' { $it = $cal.Items.Add(1); Rellenar $it $o; $it.Categories = 'Alarma'; $it.BusyStatus = 0; $it.Save(); $r.entryId = [string]$it.EntryID }
      'actualizar' { $it = $ns.GetItemFromID([string]$o.entryId); Rellenar $it $o; $it.Save(); $r.entryId = [string]$it.EntryID }
      'borrar' { $it = $ns.GetItemFromID([string]$o.entryId); $it.Delete() }
      default { throw "operación desconocida: $($o.op)" }
    }
    $r.ok = $true; $cambios++
  } catch { $r.error = $_.Exception.Message }
  $res.Add([pscustomobject]$r)
}

if (-not $yaAbierto) {
  if ($cambios) { try { foreach ($so in $ns.SyncObjects) { $so.Start() } } catch { }; Start-Sleep 25 }
  try { $ol.Quit() } catch { }
}
ConvertTo-Json -InputObject @($res.ToArray()) -Compress -Depth 3
