# Vigila si hay una app en pantalla completa (juego, vídeo, presentación) y escribe 1 o 0 cada vez que cambia. Lo lanza main.js y vive con él.
# Dos pistas: el estado de notificaciones de Windows (ocupado / D3D a pantalla completa / presentación) y si la ventana activa tapa entero su monitor.
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
$antes = $null
while ($true) {
  $v = try { [int][PC]::Completa() } catch { 0 }
  if ($v -ne $antes) { [Console]::Out.WriteLine($v); [Console]::Out.Flush(); $antes = $v }
  Start-Sleep -Milliseconds 1000
}
