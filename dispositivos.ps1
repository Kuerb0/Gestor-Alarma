# Batería de los dispositivos conectados: Bluetooth/HID que la comunican a Windows y mandos de Xbox (XInput). Lo llama sistema.js.
# Salida: array JSON [{nombre, nivel (0-100), aprox (true si es una estimación por tramos), carga}]
# Los ratones/teclados con receptor USB propio (2,4 GHz) NO comunican la batería a Windows y no salen aquí.
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$res = New-Object Collections.Generic.List[object]

# 1) Propiedad de batería de Windows (DEVPKEY_Device_BatteryLevel): la rellenan los dispositivos Bluetooth clásicos y LE
$clave = '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2'
foreach ($d in (Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match '^(BTHENUM|BTHLE|HID|USB)\\' })) {
  $p = Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName $clave
  if ($p -and $p.Data -ne $null -and [int]$p.Data -ge 0 -and [int]$p.Data -le 100) {
    $n = ([string]$d.FriendlyName) -replace '\s*(Hands-Free AG|Hands-Free|A2DP SNK|AVRCP.*)$', ''
    if (-not $n) { $n = 'Dispositivo Bluetooth' }
    $res.Add([ordered]@{ nombre = $n.Trim(); nivel = [int]$p.Data; aprox = $false; carga = $false })
  }
}

# 2) Mandos de Xbox (XInput): batería por tramos (vacía/baja/media/llena); por cable no tiene
try {
  Add-Type -ErrorAction Stop @'
using System; using System.Runtime.InteropServices;
public static class XI {
  [StructLayout(LayoutKind.Sequential)] public struct BAT { public byte Tipo; public byte Nivel; }
  [DllImport("xinput1_4.dll")] static extern int XInputGetBatteryInformation(int i, byte dev, out BAT b);
  public static string Leer(int i) { BAT b; if (XInputGetBatteryInformation(i, 0, out b) != 0) return null; return b.Tipo + "," + b.Nivel; }
}
'@
  $niveles = @(5, 25, 60, 100)
  for ($i = 0; $i -lt 4; $i++) {
    $r = [XI]::Leer($i); if (-not $r) { continue }
    $t, $l = $r.Split(',') | ForEach-Object { [int]$_ }
    if ($t -eq 2 -or $t -eq 3) {   # 2 = alcalinas, 3 = recargable; 0 = desconectado, 1 = por cable, 255 = desconocido
      $res.Add([ordered]@{ nombre = 'Mando Xbox' + $(if ($i -gt 0) { ' ' + ($i + 1) } else { '' }); nivel = $niveles[[Math]::Min(3, $l)]; aprox = $true; carga = $false })
    }
  }
} catch { }

$vistos = @{}; $fin = @(foreach ($x in $res) { if (-not $vistos[$x.nombre]) { $vistos[$x.nombre] = 1; $x } })
if ($fin.Count -eq 0) { '[]' } else { ConvertTo-Json -InputObject $fin -Compress -Depth 3 }
