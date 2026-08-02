#define AppName "PDV Gama Central"
#define AppVersion GetEnv("PDV_VERSION")
#define Publisher "Gama Sistemas"

[Setup]
AppId={{D582C2F9-30DD-4A45-A8E8-A9EDC8548EE1}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#Publisher}
DefaultDirName={autopf}\PDV Gama
DefaultGroupName=PDV Gama
OutputDir=output
OutputBaseFilename=PDV-Gama-Central-{#AppVersion}-win-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\Desktop\Pdv.Desktop.exe
SetupLogging=yes
CloseApplications=yes
CloseApplicationsFilter=Pdv.Desktop.exe
RestartApplications=no
UsePreviousAppDir=yes

[Files]
Source: "..\artifacts\store-node\*"; DestDir: "{app}\StoreNode"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\artifacts\desktop\*"; DestDir: "{app}\Desktop"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\PDV Gama"; Filename: "{app}\Desktop\Pdv.Desktop.exe"
Name: "{autodesktop}\PDV Gama"; Filename: "{app}\Desktop\Pdv.Desktop.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na área de trabalho"; GroupDescription: "Atalhos:"; Flags: checkedonce

[Run]
Filename: "{sys}\sc.exe"; Parameters: "create PDVGamaStoreNode binPath= ""{app}\StoreNode\Pdv.StoreNode.exe"" start= auto DisplayName= ""PDV Gama - Nó da Loja"""; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "config PDVGamaStoreNode binPath= ""{app}\StoreNode\Pdv.StoreNode.exe"" start= auto DisplayName= ""PDV Gama - Nó da Loja"""; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "description ""PDVGamaStoreNode"" ""Serviço local, banco e sincronização do PDV Gama."""; Flags: runhidden waituntilterminated
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""PDV Gama - Rede local"" dir=in action=allow protocol=TCP localport=5080 profile=private"; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "start ""PDVGamaStoreNode"""; Flags: runhidden waituntilterminated
Filename: "{app}\Desktop\Pdv.Desktop.exe"; Description: "Abrir PDV Gama"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\sc.exe"; Parameters: "stop ""PDVGamaStoreNode"""; Flags: runhidden waituntilterminated; RunOnceId: "StopService"
Filename: "{sys}\sc.exe"; Parameters: "delete ""PDVGamaStoreNode"""; Flags: runhidden waituntilterminated; RunOnceId: "DeleteService"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""PDV Gama - Rede local"""; Flags: runhidden waituntilterminated; RunOnceId: "DeleteFirewall"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec(
    ExpandConstant('{sys}\sc.exe'),
    'stop "PDVGamaStoreNode"',
    '',
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode);
  Sleep(1500);
  Result := '';
end;
