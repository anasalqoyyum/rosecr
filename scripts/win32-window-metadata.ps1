$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

namespace Rosecr {
    [StructLayout(LayoutKind.Sequential)]
    public struct Rect { public int Left; public int Top; public int Right; public int Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    public struct Point { public int X; public int Y; }

    public static class WindowProbe {
        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
        [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out Rect rect);
        [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref Point point);
        [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextLength(IntPtr hWnd);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder name, int count);
        [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint access, bool inheritHandle, uint processId);
        [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, EntryPoint = "QueryFullProcessImageNameW")]
        public static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder path, ref uint size);

        // Limited query access reads only the image path; it cannot read memory or modify the process.
        const uint ProcessQueryLimitedInformation = 0x1000;

        static string ExecutableName(uint processId) {
            var process = OpenProcess(ProcessQueryLimitedInformation, false, processId);
            if (process == IntPtr.Zero) return "";
            try {
                uint size = 1024;
                var path = new StringBuilder((int)size);
                return QueryFullProcessImageName(process, 0, path, ref size) ? System.IO.Path.GetFileName(path.ToString()) : "";
            } finally {
                CloseHandle(process);
            }
        }

        public static object[] ListWindows() {
            var windows = new List<object>();
            EnumWindows((handle, _) => {
                var length = GetWindowTextLength(handle);
                if (!IsWindowVisible(handle) || length == 0) return true;
                var title = new StringBuilder(length + 1);
                GetWindowText(handle, title, title.Capacity);
                uint processId;
                GetWindowThreadProcessId(handle, out processId);
                var className = new StringBuilder(256);
                GetClassName(handle, className, className.Capacity);
                windows.Add(new {
                    handle = handle.ToInt64().ToString(),
                    title = title.ToString(),
                    processId,
                    executableName = ExecutableName(processId),
                    className = className.ToString()
                });
                return true;
            }, IntPtr.Zero);
            return windows.ToArray();
        }
    }
}
'@

while ($null -ne ($line = [Console]::In.ReadLine())) {
    try {
        $request = $line | ConvertFrom-Json
        if ($request.action -eq 'list') {
            $responseJson = [ordered]@{
                requestId = $request.requestId
                windows = [Rosecr.WindowProbe]::ListWindows()
            } | ConvertTo-Json -Compress -Depth 4
            [Console]::Out.WriteLine($responseJson)
            [Console]::Out.Flush()
            continue
        }
        $handleValue = [UInt64]::Parse([string]$request.handle)
        $handle = [IntPtr]::new([Int64]$handleValue)
        $exists = [Rosecr.WindowProbe]::IsWindow($handle)
        $visible = $exists -and [Rosecr.WindowProbe]::IsWindowVisible($handle)
        $minimized = $exists -and [Rosecr.WindowProbe]::IsIconic($handle)
        $rect = [Rosecr.Rect]::new()
        $hasRect = $exists -and [Rosecr.WindowProbe]::GetClientRect($handle, [ref]$rect)
        $topLeft = [Rosecr.Point]::new()
        $bottomRight = [Rosecr.Point]::new()
        if ($hasRect) {
            $topLeft.X = $rect.Left
            $topLeft.Y = $rect.Top
            $bottomRight.X = $rect.Right
            $bottomRight.Y = $rect.Bottom
            $hasRect = [Rosecr.WindowProbe]::ClientToScreen($handle, [ref]$topLeft) -and
                [Rosecr.WindowProbe]::ClientToScreen($handle, [ref]$bottomRight)
        }
        $width = $bottomRight.X - $topLeft.X
        $height = $bottomRight.Y - $topLeft.Y
        $validRect = $hasRect -and $width -gt 0 -and $height -gt 0
        $dpi = if ($exists) { [Rosecr.WindowProbe]::GetDpiForWindow($handle) } else { 0 }
        $foregroundHandle = [Rosecr.WindowProbe]::GetForegroundWindow().ToInt64().ToString()
        $responseJson = [ordered]@{
            requestId = $request.requestId
            exists = $exists
            visible = $visible
            minimized = $minimized
            capturable = $exists -and $visible -and -not $minimized -and $validRect
            dpi = $dpi
            foregroundHandle = $foregroundHandle
            targetIsForeground = $foregroundHandle -eq $handleValue.ToString()
            clientRect = if ($validRect) {
                [ordered]@{ left = $topLeft.X; top = $topLeft.Y; right = $bottomRight.X; bottom = $bottomRight.Y }
            } else { $null }
            timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        } | ConvertTo-Json -Compress
        [Console]::Out.WriteLine($responseJson)
        [Console]::Out.Flush()
    } catch {
        $responseJson = [ordered]@{
            requestId = if ($null -ne $request) { $request.requestId } else { $null }
            error = $_.Exception.Message
        } | ConvertTo-Json -Compress
        [Console]::Out.WriteLine($responseJson)
        [Console]::Out.Flush()
    }
}
