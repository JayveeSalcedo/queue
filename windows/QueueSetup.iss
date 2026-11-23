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
Source: "set-static-ip.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "use-automatic-ip.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "app.ico"; DestDir: "{app}"; Flags: ignoreversion
; Same script, also unpacked to a temp folder so the wizard can use it before the install
Source: "set-static-ip.ps1"; DestDir: "{tmp}"; Flags: dontcopy

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
Name: "{group}\Use automatic IP (undo fixed address)"; Filename: "{app}\use-automatic-ip.bat"; IconFilename: "{app}\app.ico"
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
const
  SM_REMOTESESSION = $1000;

var
  IpPage: TWizardPage;
  RbKeep, RbLock, RbCustom: TNewRadioButton;
  EdIp, EdGateway, EdPrefix: TNewEdit;
  LblInfo, LblCustom: TNewStaticText;
  // What the wizard found on this PC's main network connection
  Found: Boolean;
  CurAdapter, CurIp, CurGateway, CurDns, CurIndex, CurPrefix: String;
  CurDhcp: Boolean;
  // What the admin chose
  ApplyFixed: Boolean;
  FixedIpToShow: String;

function GetSystemMetrics(nIndex: Integer): Integer;
  external 'GetSystemMetrics@user32.dll stdcall';

function PsExe: String;
begin
  Result := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
end;

// Runs the fixed-IP script from the temp folder; returns what it printed.
function RunIpScript(const Arguments: String; var ExitCode: Integer): String;
var
  OutFile: String;
  Lines: TArrayOfString;
begin
  Result := '';
  OutFile := ExpandConstant('{tmp}\ip-result.txt');
  DeleteFile(OutFile);
  ExtractTemporaryFile('set-static-ip.ps1');
  if not Exec(PsExe, '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\set-static-ip.ps1') + '" ' +
      Arguments + ' -OutFile "' + OutFile + '"', '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then
  begin
    ExitCode := 1;
    Result := 'PowerShell could not be started.';
    Exit;
  end;
  if LoadStringsFromFile(OutFile, Lines) and (GetArrayLength(Lines) > 0) then
    Result := Lines[0];
end;

function IsIPv4(const S: String): Boolean;
var
  Rest, Part: String;
  P, I, N: Integer;
begin
  Result := False;
  Rest := S;
  for I := 1 to 4 do
  begin
    if I < 4 then
    begin
      P := Pos('.', Rest);
      if P = 0 then Exit;
      Part := Copy(Rest, 1, P - 1);
      Rest := Copy(Rest, P + 1, Length(Rest));
    end
    else
      Part := Rest;
    N := StrToIntDef(Part, -1);
    if (N < 0) or (N > 255) or (Part = '') or (Length(Part) > 3) then Exit;
  end;
  Result := True;
end;

procedure DetectNetwork;
var
  Lines: TStringList;
  Code: Integer;
begin
  Found := False;
  RunIpScript('-Detect -Lines', Code);
  Lines := TStringList.Create;
  try
    if FileExists(ExpandConstant('{tmp}\ip-result.txt')) then
    begin
      Lines.LoadFromFile(ExpandConstant('{tmp}\ip-result.txt'));
      if Lines.Values['found'] = '1' then
      begin
        CurAdapter := Lines.Values['adapter'];
        CurIndex := Lines.Values['interface_index'];
        CurIp := Lines.Values['ip'];
        CurPrefix := Lines.Values['prefix'];
        CurGateway := Lines.Values['gateway'];
        CurDns := Lines.Values['dns'];
        CurDhcp := Lines.Values['dhcp'] = '1';
        Found := IsIPv4(CurIp) and (StrToIntDef(CurPrefix, 0) > 0);
      end;
    end;
  finally
    Lines.Free;
  end;
end;

procedure OptionClicked(Sender: TObject);
begin
  EdIp.Enabled := RbCustom.Checked;
  EdGateway.Enabled := RbCustom.Checked;
  EdPrefix.Enabled := RbCustom.Checked;
end;

procedure InitializeWizard;
var
  Y: Integer;
  Lbl: TNewStaticText;
begin
  DetectNetwork;
  if not Found then Exit;

  IpPage := CreateCustomPage(wpSelectDir, 'Fixed network address',
    'Phones, counters and the TV connect to this PC by its address. A fixed address stops it from ever changing.');

  LblInfo := TNewStaticText.Create(IpPage);
  LblInfo.Parent := IpPage.Surface;
  LblInfo.WordWrap := True;
  LblInfo.Width := IpPage.SurfaceWidth;
  LblInfo.Caption := 'This PC is connected through "' + CurAdapter + '" and currently uses ' + CurIp +
    '. Best results: also reserve this address for this PC in the router, or pick one outside the router''s automatic range.';

  Y := LblInfo.Height + ScaleY(12);

  RbLock := TNewRadioButton.Create(IpPage);
  RbLock.Parent := IpPage.Surface;
  RbLock.Top := LblInfo.Top + Y;
  RbLock.Width := IpPage.SurfaceWidth;
  RbLock.Caption := 'Keep this PC''s current address (' + CurIp + ') and make it fixed (recommended)';
  RbLock.Checked := True;
  RbLock.OnClick := @OptionClicked;
  Y := Y + ScaleY(26);

  RbCustom := TNewRadioButton.Create(IpPage);
  RbCustom.Parent := IpPage.Surface;
  RbCustom.Top := LblInfo.Top + Y;
  RbCustom.Width := IpPage.SurfaceWidth;
  RbCustom.Caption := 'Use a different fixed address';
  RbCustom.OnClick := @OptionClicked;
  Y := Y + ScaleY(26);

  Lbl := TNewStaticText.Create(IpPage);
  Lbl.Parent := IpPage.Surface;
  Lbl.Left := ScaleX(20);
  Lbl.Top := LblInfo.Top + Y + ScaleY(3);
  Lbl.Caption := 'Address:';
  EdIp := TNewEdit.Create(IpPage);
  EdIp.Parent := IpPage.Surface;
  EdIp.Left := ScaleX(90);
  EdIp.Top := LblInfo.Top + Y;
  EdIp.Width := ScaleX(140);
  EdIp.Text := CurIp;
  Lbl := TNewStaticText.Create(IpPage);
  Lbl.Parent := IpPage.Surface;
  Lbl.Left := ScaleX(250);
  Lbl.Top := LblInfo.Top + Y + ScaleY(3);
  Lbl.Caption := 'Size (/):';
  EdPrefix := TNewEdit.Create(IpPage);
  EdPrefix.Parent := IpPage.Surface;
  EdPrefix.Left := ScaleX(310);
  EdPrefix.Top := LblInfo.Top + Y;
  EdPrefix.Width := ScaleX(40);
  EdPrefix.Text := CurPrefix;
  Y := Y + ScaleY(28);

  Lbl := TNewStaticText.Create(IpPage);
  Lbl.Parent := IpPage.Surface;
  Lbl.Left := ScaleX(20);
  Lbl.Top := LblInfo.Top + Y + ScaleY(3);
  Lbl.Caption := 'Router:';
  EdGateway := TNewEdit.Create(IpPage);
  EdGateway.Parent := IpPage.Surface;
  EdGateway.Left := ScaleX(90);
  EdGateway.Top := LblInfo.Top + Y;
  EdGateway.Width := ScaleX(140);
  EdGateway.Text := CurGateway;
  Y := Y + ScaleY(32);

  RbKeep := TNewRadioButton.Create(IpPage);
  RbKeep.Parent := IpPage.Surface;
  RbKeep.Top := LblInfo.Top + Y;
  RbKeep.Width := IpPage.SurfaceWidth;
  RbKeep.Caption := 'Do not change the network settings';
  RbKeep.OnClick := @OptionClicked;
  Y := Y + ScaleY(30);

  if GetSystemMetrics(SM_REMOTESESSION) <> 0 then
  begin
    LblCustom := TNewStaticText.Create(IpPage);
    LblCustom.Parent := IpPage.Surface;
    LblCustom.WordWrap := True;
    LblCustom.Width := IpPage.SurfaceWidth;
    LblCustom.Top := LblInfo.Top + Y;
    LblCustom.Caption := 'You are connected through Remote Desktop. Choosing a different address will end that session.';
    LblCustom.Font.Style := [fsBold];
  end;

  OptionClicked(nil);
end;

function FixedIpExists: Boolean;
begin
  Result := FileExists(ExpandConstant('{commonappdata}\QueueSystem\fixed-ip.json'));
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if (IpPage <> nil) and (PageID = IpPage.ID) then
    // An upgrade on a PC that already has its fixed address: nothing to ask
    Result := FixedIpExists;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Bits: Integer;
begin
  Result := True;
  if (IpPage <> nil) and (CurPageID = IpPage.ID) and RbCustom.Checked then
  begin
    Bits := StrToIntDef(EdPrefix.Text, 0);
    if not IsIPv4(EdIp.Text) then
    begin
      MsgBox('The address is not a valid IPv4 address (for example 192.168.1.50).', mbError, MB_OK);
      Result := False;
    end
    else if not IsIPv4(EdGateway.Text) then
    begin
      MsgBox('The router address is not valid (for example 192.168.1.1).', mbError, MB_OK);
      Result := False;
    end
    else if (Bits < 8) or (Bits > 30) then
    begin
      MsgBox('The size must be a number from 8 to 30 (24 for most offices).', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

// Decide, once the wizard is done, what to do to the network
procedure ChooseAction;
begin
  ApplyFixed := False;
  if not Found or FixedIpExists then Exit;
  if (IpPage <> nil) and WizardSilent then
    // Unattended installs only touch the network when asked: Setup.exe /VERYSILENT /FIXEDIP=1
    ApplyFixed := ExpandConstant('{param:FIXEDIP|0}') = '1'
  else if (IpPage <> nil) and (RbKeep <> nil) then
    ApplyFixed := not RbKeep.Checked
  else if not CurDhcp then
    ApplyFixed := True;
end;

procedure ApplyFixedAddress;
var
  Ip, Gateway, Prefix, Args, Msg: String;
  Code: Integer;
begin
  if (IpPage <> nil) and (RbCustom <> nil) and RbCustom.Checked and not WizardSilent then
  begin
    Ip := Trim(EdIp.Text);
    Gateway := Trim(EdGateway.Text);
    Prefix := Trim(EdPrefix.Text);
  end
  else
  begin
    Ip := CurIp;
    Gateway := CurGateway;
    Prefix := CurPrefix;
  end;

  WizardForm.StatusLabel.Caption := 'Setting the fixed network address...';
  Args := '-Apply -InterfaceIndex ' + CurIndex + ' -Ip ' + Ip + ' -Prefix ' + Prefix;
  if Gateway <> '' then Args := Args + ' -Gateway ' + Gateway;
  if CurDns <> '' then Args := Args + ' -Dns ' + CurDns;
  Msg := RunIpScript(Args, Code);
  if Code = 0 then
    FixedIpToShow := Ip
  else
    SuppressibleMsgBox('The fixed address was not set, so the network was left as it is.' + #13#10#13#10 + Msg + #13#10#13#10 +
      'The queue system itself is installed. You can set a fixed address later from Windows network settings.',
      mbError, MB_OK, IDOK);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  // Before any [Run] entry, so the server starts on the final address
  if CurStep = ssInstall then
  begin
    ChooseAction;
    if ApplyFixed then ApplyFixedAddress;
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if (CurPageID = wpFinished) and (FixedIpToShow <> '') then
    WizardForm.FinishedLabel.Caption := WizardForm.FinishedLabel.Caption + #13#10#13#10 +
      'Other PCs and phones open the system at  http://' + FixedIpToShow + ':8000  (this address is now fixed).';
end;

// An upgrade replaces the running server: stop it first so its files can be overwritten
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\schtasks.exe'), '/End /TN "{#TaskName}"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM QueueServer.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;

// On uninstall, offer to put the network back to automatic
function InitializeUninstall: Boolean;
var
  Code: Integer;
begin
  Result := True;
  if FileExists(ExpandConstant('{commonappdata}\QueueSystem\fixed-ip.json')) then
    if SuppressibleMsgBox('This PC was given a fixed network address by the queue system.' + #13#10 +
         'Go back to automatic (DHCP) now?', mbConfirmation, MB_YESNO or MB_DEFBUTTON2, IDNO) = IDYES then
      Exec(PsExe, '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\set-static-ip.ps1') + '" -Undo',
        '', SW_HIDE, ewWaitUntilTerminated, Code);
end;
