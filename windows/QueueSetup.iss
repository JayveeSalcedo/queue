; Inno Setup script for the office server PC.
; Build: iscc /DAppVersion=1.0.0 windows\QueueSetup.iss   (see windows\build.bat)
;
; Installs the queue server, opens the firewall port, makes the server start
; with Windows, and puts an icon on the Desktop. Needs no Python, Node or internet.

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#define AppName "Queue Management System"
#define TaskName "QueueSystem Server"
#define FirewallRule "Queue System (Port 8000)"

[Setup]
AppId={{8E3B5A41-6C2D-4F0B-9B7A-5D1C2E9A7F10}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=PANELCO III Southeast Area Office
DefaultDirName={autopf}\QueueSystem
DefaultGroupName=Queue System
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
OutputDir=output
OutputBaseFilename=QueueSetup
SetupIconFile=app.ico
UninstallDisplayIcon={app}\app.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Files]
; The server program (PyInstaller folder)
Source: "build\server\QueueServer\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; The web pages
Source: "..\frontend\dist\*"; DestDir: "{app}\web"; Flags: ignoreversion recursesubdirs createallsubdirs
; The counter-PC mini window app, downloaded by counter PCs from the server
Source: "build\mini\QueueMini.exe"; DestDir: "{app}\downloads"; Flags: ignoreversion
Source: "install-task.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "restart-server.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "app.ico"; DestDir: "{app}"; Flags: ignoreversion

[InstallDelete]
; Clean old program files on upgrade. The database and settings live in
; C:\ProgramData\QueueSystem and are never touched.
Type: filesandordirs; Name: "{app}\_internal"
Type: filesandordirs; Name: "{app}\web"

[Dirs]
Name: "{commonappdata}\QueueSystem"

[INI]
Filename: "{autodesktop}\Queue System.url"; Section: "InternetShortcut"; Key: "URL"; String: "http://localhost:8000/"
Filename: "{autodesktop}\Queue System.url"; Section: "InternetShortcut"; Key: "IconFile"; String: "{app}\app.ico"
Filename: "{autodesktop}\Queue System.url"; Section: "InternetShortcut"; Key: "IconIndex"; String: "0"
Filename: "{group}\Open Queue System.url"; Section: "InternetShortcut"; Key: "URL"; String: "http://localhost:8000/"
Filename: "{group}\Open Queue System.url"; Section: "InternetShortcut"; Key: "IconFile"; String: "{app}\app.ico"
Filename: "{group}\Open Queue System.url"; Section: "InternetShortcut"; Key: "IconIndex"; String: "0"

[Icons]
Name: "{group}\Restart queue server"; Filename: "{app}\restart-server.bat"; IconFilename: "{app}\app.ico"
Name: "{group}\Server log"; Filename: "{win}\explorer.exe"; Parameters: """{commonappdata}\QueueSystem\logs"""
Name: "{group}\Database backups"; Filename: "{win}\explorer.exe"; Parameters: """{commonappdata}\QueueSystem\backups"""
Name: "{group}\Uninstall Queue System"; Filename: "{uninstallexe}"

[Run]
; Only the system and administrators may read the database, backups and signing key
Filename: "{sys}\icacls.exe"; Parameters: """{commonappdata}\QueueSystem"" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F"; Flags: runhidden; StatusMsg: "Securing the data folder..."
; Let phones and other PCs reach the server on LAN cable and Wi-Fi alike
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""{#FirewallRule}"""; Flags: runhidden
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""{#FirewallRule}"" dir=in action=allow protocol=TCP localport=8000 profile=any"; Flags: runhidden; StatusMsg: "Opening the network port..."
; Start with Windows, even before anyone logs in, and keep running
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\install-task.ps1"""; Flags: runhidden; StatusMsg: "Starting the queue server..."
Filename: "http://localhost:8000/"; Description: "Open the queue system now"; Flags: postinstall shellexec skipifsilent nowait

[UninstallRun]
Filename: "{sys}\schtasks.exe"; Parameters: "/End /TN ""{#TaskName}"""; Flags: runhidden; RunOnceId: "StopTask"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM QueueServer.exe"; Flags: runhidden; RunOnceId: "KillServer"
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /TN ""{#TaskName}"" /F"; Flags: runhidden; RunOnceId: "DeleteTask"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""{#FirewallRule}"""; Flags: runhidden; RunOnceId: "DeleteFirewall"

[Code]
// An upgrade replaces the running server: stop it first so its files can be overwritten
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\schtasks.exe'), '/End /TN "{#TaskName}"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM QueueServer.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;
