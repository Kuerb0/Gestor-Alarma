# Vigila si hay una app en pantalla completa (juego, vídeo, presentación) y escribe 1 o 0 cada vez que cambia. Lo lanza main.js y vive con él.
# Dos pistas: el estado de notificaciones de Windows (ocupado / D3D a pantalla completa / presentación) y si la ventana activa tapa entero su monitor.
# Además recoge el uso de apps (líneas «U {json}», ver uso.js): activa cada 1 s, visibles/segundo plano cada 5 s, fondo cada 60 s.
param([int]$Excluir = 0, [string]$Propio = '')
$ErrorActionPreference = 'Stop'
Add-Type @'
using System; using System.Runtime.InteropServices; using System.Text;
public static class PC {
  [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int s);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MI i);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  public struct R { public int L, T, Rr, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MI { public int cb; public R mon, work; public uint f; }
  public static bool Completa() {
    // Las fichas y el panel viven en el monitor principal: solo cuenta lo que pasa ahí (una app a pantalla completa en otro monitor no los esconde)
    IntPtr h = GetForegroundWindow(); if (h == IntPtr.Zero) return false;
    var i = new MI(); i.cb = Marshal.SizeOf(typeof(MI));
    if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref i) || (i.f & 1) == 0) return false;  // 1 = MONITORINFOF_PRIMARY
    int s; if (SHQueryUserNotificationState(out s) == 0 && (s == 2 || s == 3 || s == 4)) return true;  // ocupado, D3D, presentación
    var c = new StringBuilder(64); GetClassName(h, c, 64); string k = c.ToString();
    if (k == "Progman" || k == "WorkerW" || k == "Shell_TrayWnd") return false;  // el escritorio también «tapa» el monitor
    R r; if (!GetWindowRect(h, out r)) return false;
    return r.L <= i.mon.L && r.T <= i.mon.T && r.Rr >= i.mon.Rr && r.B >= i.mon.B;
  }
}
'@
# ---- Seguimiento de uso: todo en su propio try/catch, un fallo aquí nunca tumba la detección de pantalla completa
$uso = $true
try {
  Add-Type @'
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;
public class W { public IntPtr H; public uint Pid; public string T, Ruta; public bool Min; public IntPtr Mon; }
public static class UW {
  delegate bool EP(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] struct R { public int L, T, Rr, B; }
  [StructLayout(LayoutKind.Sequential)] struct P { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] struct LII { public uint cb, t; }
  [DllImport("user32.dll")] static extern bool EnumWindows(EP cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr p, EP cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint c);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(P p, uint f);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LII i);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int n);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint a, bool b, uint p);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, int f, StringBuilder s, ref int n);
  public static uint Excl = 0; public static string Propio = "";
  public static string Ruta(uint pid) {
    IntPtr h = OpenProcess(0x1000, false, pid); if (h == IntPtr.Zero) return "";
    try { var s = new StringBuilder(1024); int n = 1024; return QueryFullProcessImageName(h, 0, s, ref n) ? s.ToString() : ""; } finally { CloseHandle(h); }
  }
  static string Ult(string r) { int i = r.LastIndexOf('\\'); return i < 0 ? r : r.Substring(i + 1); }
  // Ventana «de app» (visible o minimizada, sin dueño, sin TOOLWINDOW, con título, sin «cloaked», no escritorio/barra, no el propio Gestor) o null
  public static W Info(IntPtr h) {
    if (h == IntPtr.Zero || !(IsWindowVisible(h) || IsIconic(h))) return null;
    if (GetWindow(h, 4) != IntPtr.Zero) return null;
    if ((GetWindowLong(h, -20) & 0x80) != 0) return null;
    var t = new StringBuilder(512); GetWindowText(h, t, 512); if (t.Length == 0) return null;
    int c; if (DwmGetWindowAttribute(h, 14, out c, 4) == 0 && c != 0) return null;
    var k = new StringBuilder(64); GetClassName(h, k, 64); string cl = k.ToString();
    if (cl == "Progman" || cl == "WorkerW" || cl == "Shell_TrayWnd") return null;
    uint pid; GetWindowThreadProcessId(h, out pid); string ruta = Ruta(pid);
    if (Ult(ruta).ToLower() == "applicationframehost.exe") {  // app de la Store: el proceso real es el de la ventana hija
      uint real = 0; uint pp = pid;
      EnumChildWindows(h, (x, l) => { uint q; GetWindowThreadProcessId(x, out q); if (q != pp && q != 0) { real = q; return false; } return true; }, IntPtr.Zero);
      if (real != 0) { pid = real; ruta = Ruta(pid); }
    }
    if (pid == Excl || (Propio.Length > 0 && string.Equals(ruta, Propio, StringComparison.OrdinalIgnoreCase))) return null;
    var w = new W(); w.H = h; w.Pid = pid; w.T = t.ToString(); w.Ruta = ruta; w.Min = IsIconic(h);
    R r; if (!w.Min && GetWindowRect(h, out r)) { var p = new P(); p.X = (r.L + r.Rr) / 2; p.Y = (r.T + r.B) / 2; w.Mon = MonitorFromPoint(p, 2); }
    return w;
  }
  public static W Activa() { return Info(GetForegroundWindow()); }
  public static IntPtr ActivaH() { return GetForegroundWindow(); }
  public static List<W> Ventanas() {  // de arriba abajo en orden Z
    var l = new List<W>(); EnumWindows((h, x) => { var w = Info(h); if (w != null) l.Add(w); return true; }, IntPtr.Zero); return l;
  }
  public static double Inactivo() { var i = new LII(); i.cb = 8; if (!GetLastInputInfo(ref i)) return 0; return unchecked((uint)Environment.TickCount - i.t) / 1000.0; }
}
'@
  [UW]::Excl = [uint32]$Excluir; [UW]::Propio = $Propio
  try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch {}
} catch { $uso = $false }
$descr = @{}  # FileDescription por ruta (no se lee cada segundo)
function Datos([string]$ruta, $pid_) {
  if ($ruta) {
    if (-not $descr.ContainsKey($ruta)) { $x = ''; try { $x = [Diagnostics.FileVersionInfo]::GetVersionInfo($ruta).FileDescription } catch {}; if (-not $x -or -not $x.Trim()) { $x = [IO.Path]::GetFileNameWithoutExtension($ruta) }; $descr[$ruta] = $x.Trim() }
    return @{ exe = ([IO.Path]::GetFileName($ruta)).ToLower(); d = $descr[$ruta] }
  }
  $n = 'desconocido'; try { $n = (Get-Process -Id $pid_ -ErrorAction Stop).ProcessName } catch {}  # proceso elevado: no se puede abrir
  @{ exe = $n.ToLower() + '.exe'; d = $n }
}
function Linea($o) { [Console]::Out.WriteLine('U ' + (ConvertTo-Json -InputObject $o -Compress -Depth 5)); [Console]::Out.Flush() }
$sesion = (Get-Process -Id $PID).SessionId
$antes = $null; $ultA = $null; $prox5 = [DateTime]::MinValue; $prox60 = [DateTime]::MinValue
while ($true) {
  $v = try { [int][PC]::Completa() } catch { 0 }
  if ($v -ne $antes) { [Console]::Out.WriteLine($v); [Console]::Out.Flush(); $antes = $v }
  $ahora = [DateTime]::UtcNow
  if ($uso) {
    try {  # activa, cada 1 s, solo si cambia algo
      $a = [UW]::Activa(); $ina = ([UW]::Inactivo() -ge 300) -and ($v -eq 0)
      if ($a) { $x = Datos $a.Ruta $a.Pid; $act = [ordered]@{ k = 'a'; exe = $x.exe; d = $x.d; t = $a.T; i = $ina } } else { $act = [ordered]@{ k = 'a'; exe = ''; d = ''; t = ''; i = $ina } }
      $clave = $act.exe + '|' + $act.t + '|' + $act.i
      if ($clave -ne $ultA) { Linea $act; $ultA = $clave }
    } catch {}
    if ($ahora -ge $prox5) {
      $prox5 = $ahora.AddSeconds(5)
      try {  # visibles y segundo plano, cada 5 s (latido: se escribe siempre)
        $ah = [UW]::ActivaH(); $monA = [IntPtr]::Zero; $lista = [UW]::Ventanas()
        foreach ($w in $lista) { if ($w.H -eq $ah) { $monA = $w.Mon } }
        $vistos = @{}; $l = @()
        foreach ($w in $lista) {
          if ($w.H -eq $ah) { continue }
          $n = 's'
          if (-not $w.Min -and $w.Mon -ne [IntPtr]::Zero -and $w.Mon -ne $monA -and -not $vistos.ContainsKey([string]$w.Mon)) { $n = 'v'; $vistos[[string]$w.Mon] = 1 }
          $x = Datos $w.Ruta $w.Pid; $l += [ordered]@{ n = $n; exe = $x.exe; d = $x.d; t = $w.T }
        }
        Linea ([ordered]@{ k = 'v'; l = @($l) })
      } catch {}
    }
    if ($ahora -ge $prox60) {
      $prox60 = $ahora.AddSeconds(60)
      try {  # fondo, cada 60 s: procesos de mi sesión sin ventana de app y fuera de C:\Windows, por exe, con su CPU total (s)
        $conVentana = @{}; foreach ($w in [UW]::Ventanas()) { $conVentana[([IO.Path]::GetFileName($w.Ruta)).ToLower()] = 1 }
        $win = $env:SystemRoot.TrimEnd('\') + '\'; $g = @{}
        foreach ($p in (Get-Process | Where-Object { $_.SessionId -eq $sesion -and $_.Id -ne $PID -and $_.Id -ne $Excluir })) {
          $r = [UW]::Ruta([uint32]$p.Id); if (-not $r) { continue }
          if ($r.StartsWith($win, [StringComparison]::OrdinalIgnoreCase)) { continue }
          if ($Propio -and $r -ieq $Propio) { continue }
          $e = ([IO.Path]::GetFileName($r)).ToLower(); if ($conVentana.ContainsKey($e)) { continue }
          $c = 0; try { $c = $p.TotalProcessorTime.TotalSeconds } catch {}
          if ($g.ContainsKey($e)) { $g[$e].cpu += $c } else { $x = Datos $r $p.Id; $g[$e] = [ordered]@{ exe = $e; d = $x.d; cpu = $c } }
        }
        $l = @(); foreach ($e in @($g.Keys)) { $g[$e].cpu = [math]::Round($g[$e].cpu, 1); $l += $g[$e] }
        Linea ([ordered]@{ k = 'b'; l = @($l) })
      } catch {}
    }
  }
  Start-Sleep -Milliseconds 1000
}
