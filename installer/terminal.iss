#define AppName "PDV Gama Terminal"
#define AppVersion GetEnv("PDV_VERSION")
#define Publisher "Gama Sistemas"

[Setup]
AppId={{D18665B2-9660-4F19-B736-AFCAD2622F03}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#Publisher}
DefaultDirName={autopf}\PDV Gama Terminal
DefaultGroupName=PDV Gama
OutputDir=output
OutputBaseFilename=PDV-Gama-Terminal-{#AppVersion}-win-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\Pdv.Desktop.exe
CloseApplications=yes
CloseApplicationsFilter=Pdv.Desktop.exe
RestartApplications=no
UsePreviousAppDir=yes
SetupLogging=yes

[Files]
Source: "..\artifacts\desktop\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\PDV Gama"; Filename: "{app}\Pdv.Desktop.exe"
Name: "{autodesktop}\PDV Gama"; Filename: "{app}\Pdv.Desktop.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na área de trabalho"; GroupDescription: "Atalhos:"; Flags: checkedonce

[Run]
Filename: "{app}\Pdv.Desktop.exe"; Description: "Configurar conexão e abrir PDV Gama"; Flags: nowait postinstall skipifsilent
