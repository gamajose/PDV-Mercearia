#define AppName "PDV Gama - Frente de Caixa"
#define AppVersion GetEnv("PDV_VERSION")
#if AppVersion == ""
  #define AppVersion "1.0.0"
#endif
#define Publisher "Gama Sistemas"

[Setup]
AppId={{D18665B2-9660-4F19-B736-AFCAD2622F03}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#Publisher}
DefaultDirName={autopf}\PDV Gama Caixa
DefaultGroupName=PDV Gama Caixa
OutputDir=output
OutputBaseFilename=PDV-Gama-Caixa-{#AppVersion}-win-x64
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
Name: "{autoprograms}\PDV Gama Caixa"; Filename: "{app}\Pdv.Desktop.exe"; Parameters: "--mode=pdv"
Name: "{autodesktop}\PDV Gama Caixa"; Filename: "{app}\Pdv.Desktop.exe"; Parameters: "--mode=pdv"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Criar atalho do Caixa na Área de Trabalho"; GroupDescription: "Atalhos:"; Flags: checkedonce

[Run]
Filename: "{app}\Pdv.Desktop.exe"; Parameters: "--mode=pdv"; Description: "Abrir Frente de Caixa PDV Gama"; Flags: nowait postinstall skipifsilent
