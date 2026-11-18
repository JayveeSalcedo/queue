/**
 * Builds a one-click Windows installer (.bat) that puts station shortcuts on
 * the Desktop. Each shortcut opens the station in its own app window (no tabs
 * or address bar) in Edge or Chrome, with the office logo as its icon.
 *
 * The file is generated in the browser from the address the person is using
 * right now, so it always points at the right server, whether they are on
 * the LAN cable or Wi-Fi. It works over plain http, unlike browser install.
 */

export interface ShortcutSpec {
  /** Name on the Desktop, e.g. "Counter 1" */
  name: string;
  /** Path on this server, e.g. "/counter/1" */
  path: string;
  /** App window size; omit to let the browser remember the last size */
  size?: { width: number; height: number };
  /**
   * Use the always-on-top QueueMini app for this shortcut when the server can
   * provide it (it is a regular small browser window otherwise).
   */
  miniApp?: { counter: number; width: number; height: number };
  /** Offer to start this one when Windows starts */
  startWithWindows?: boolean;
}

/** Characters that are unsafe inside a batch file or a PowerShell string */
const safe = (value: string) => value.replace(/[^\w ./:\-,]/g, '');

export function buildWindowsInstaller(origin: string, shortcuts: ShortcutSpec[]): string {
  const base = safe(origin);

  const creators = shortcuts
    .map((s) => {
      const args = [`--app=${base}${safe(s.path)}`];
      if (s.size) args.push(`--window-size=${Math.round(s.size.width)},${Math.round(s.size.height)}`);
      const miniArgs = s.miniApp
        ? `--url=${base}${safe(s.path)} --counter=${Math.round(s.miniApp.counter)} ` +
          `--width=${Math.round(s.miniApp.width)} --height=${Math.round(s.miniApp.height)}`
        : null;
      const make = (folderExpr: string) =>
        `$s = $ws.CreateShortcut(${folderExpr} + '\\${safe(s.name)}.lnk'); ` +
        `$s.TargetPath = $env:BROWSER; ` +
        `$s.Arguments = '${args.join(' ')}'; ` +
        (miniArgs
          ? `if ($env:HAVEMINI) { $s.TargetPath = $env:MINI; $s.Arguments = '${miniArgs}'; } `
          : '') +
        `$s.IconLocation = $env:DIR + '\\queue.ico'; ` +
        `$s.Description = '${safe(s.name)}'; $s.Save();`;
      return { spec: s, desktop: make(`[Environment]::GetFolderPath('Desktop')`), startup: make(`[Environment]::GetFolderPath('Startup')`) };
    });

  const lines: string[] = [
    '@echo off',
    'setlocal',
    'title Queue - Install desktop shortcuts',
    'echo.',
    'echo  Installing Queue shortcuts on this PC...',
    'echo.',
    `set "BASE=${base}"`,
    'set "DIR=%LOCALAPPDATA%\\QueueSystem"',
    'if not exist "%DIR%" mkdir "%DIR%"',
    '',
    'rem --- Find Edge or Chrome (Edge comes with Windows 10/11) ---',
    'set "BROWSER="',
    'if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"',
    'if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"',
    'if not defined BROWSER if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not defined BROWSER if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not defined BROWSER if exist "%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not defined BROWSER goto nobrowser',
    '',
    'rem --- Icon (the shortcuts still work without it) ---',
    `powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing '${base}/app-icon.ico' -OutFile ($env:DIR + '\\queue.ico') } catch { }"`,
    '',
    ...(shortcuts.some((s) => s.miniApp)
      ? [
          'rem --- Always-on-top mini window app, downloaded from the queue server ---',
          'set "MINI=%DIR%\\QueueMini.exe"',
          'taskkill /F /IM QueueMini.exe >nul 2>&1',
          'del "%MINI%" >nul 2>&1',
          `powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing '${base}/downloads/QueueMini.exe' -OutFile ($env:DIR + '\\QueueMini.exe') } catch { }"`,
          'set "HAVEMINI="',
          'if exist "%MINI%" set "HAVEMINI=1"',
          '',
        ]
      : []),
    'rem --- Desktop shortcuts ---',
    ...creators.map(
      (c) => `powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; ${c.desktop}"`
    ),
    'if errorlevel 1 goto failed',
    'echo  Added to your Desktop:',
    ...shortcuts.map((s) => `echo    - ${safe(s.name)}`),
    'echo.',
    ...(shortcuts.some((s) => s.miniApp)
      ? [
          'if defined HAVEMINI (echo  The mini window stays on top of other programs.) else (echo  The always-on-top mini app is not available from the server yet,)',
          'if not defined HAVEMINI echo  so the mini window opens as a normal small window instead.',
          'echo.',
        ]
      : []),
  ];

  for (const c of creators) {
    if (!c.spec.startWithWindows) continue;
    const label = safe(c.spec.name);
    lines.push(
      `choice /C YN /N /M " Open ${label} automatically when Windows starts? [Y/N] "`,
      `if errorlevel 2 goto skipstartup`,
      `powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; ${c.startup}"`,
      'echo  It will open when this PC starts.',
      ':skipstartup',
      'echo.'
    );
  }

  lines.push(
    'echo  Done. You can close this window.',
    'pause',
    'exit /b 0',
    '',
    ':nobrowser',
    'echo  Microsoft Edge or Google Chrome was not found on this PC.',
    'echo  Install one of them, then run this file again.',
    'pause',
    'exit /b 1',
    '',
    ':failed',
    'echo  Could not create the shortcuts. Please ask your administrator for help.',
    'pause',
    'exit /b 1'
  );

  // Batch files need Windows line endings
  return lines.join('\r\n') + '\r\n';
}

export function downloadWindowsInstaller(origin: string, shortcuts: ShortcutSpec[], fileName: string) {
  const blob = new Blob([buildWindowsInstaller(origin, shortcuts)], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
