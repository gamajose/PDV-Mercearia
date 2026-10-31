#define AppName "PDV Gama - Servidor Filial"
#define AppVersion GetEnv("PDV_VERSION")
#if AppVersion == ""
  #define AppVersion "1.0.0"
#endif
#define Publisher "Gama Sistemas"

[Setup]
AppId={{C782B3E1-40EA-4F56-A829-9A0E1235FBC2}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#Publisher}
DefaultDirName={autopf}\PDV Gama Filial
DefaultGroupName=PDV Gama Filial
OutputDir=output
OutputBaseFilename=PDV-Gama-Filial-{#AppVersion}-win-x64
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
Name: "{autoprograms}\PDV Gama Filial"; Filename: "{app}\Desktop\Pdv.Desktop.exe"; Parameters: "--mode=admin"
Name: "{autodesktop}\PDV Gama Filial"; Filename: "{app}\Desktop\Pdv.Desktop.exe"; Parameters: "--mode=admin"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na área de trabalho"; GroupDescription: "Atalhos:"; Flags: checkedonce

[Run]
Filename: "{sys}\sc.exe"; Parameters: "create PDVGamaFilialNode binPath= ""{app}\StoreNode\Pdv.StoreNode.exe"" start= auto DisplayName= ""PDV Gama - Servidor Filial"""; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "config PDVGamaFilialNode binPath= ""{app}\StoreNode\Pdv.StoreNode.exe"" start= auto DisplayName= ""PDV Gama - Servidor Filial"""; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "description ""PDVGamaFilialNode"" ""Serviço local da filial, banco de dados offline e replicação assíncrona para a matriz."""; Flags: runhidden waituntilterminated
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""PDV Gama - Filial Rede Local"" dir=in action=allow protocol=TCP localport=5080 profile=private"; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "start ""PDVGamaFilialNode"""; Flags: runhidden waituntilterminated
Filename: "{app}\Desktop\Pdv.Desktop.exe"; Parameters: "--mode=admin"; Description: "Abrir PDV Gama Filial"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\sc.exe"; Parameters: "stop ""PDVGamaFilialNode"""; Flags: runhidden waituntilterminated; RunOnceId: "StopService"
Filename: "{sys}\sc.exe"; Parameters: "delete ""PDVGamaFilialNode"""; Flags: runhidden waituntilterminated; RunOnceId: "DeleteService"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""PDV Gama - Filial Rede Local"""; Flags: runhidden waituntilterminated; RunOnceId: "DeleteFirewall"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec(
    ExpandConstant('{sys}\sc.exe'),
    'stop "PDVGamaFilialNode"',
    '',
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode);
  Sleep(1500);
  Result := '';
end;
