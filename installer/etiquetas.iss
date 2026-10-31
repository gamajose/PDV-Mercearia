#define AppName "PDV Gama - Terminal de Etiquetas e Balcão"
#define AppVersion GetEnv("PDV_VERSION")
#if AppVersion == ""
  #define AppVersion "1.0.0"
#endif
#define Publisher "Gama Sistemas"

[Setup]
AppId={{E29776C3-5811-4820-9B21-B8BEF3973E14}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#Publisher}
DefaultDirName={autopf}\PDV Gama Etiquetas
DefaultGroupName=PDV Gama Etiquetas
OutputDir=output
OutputBaseFilename=PDV-Gama-Etiquetas-{#AppVersion}-win-x64
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
Name: "{autoprograms}\PDV Gama Etiquetas"; Filename: "{app}\Pdv.Desktop.exe"; Parameters: "--mode=labels"
Name: "{autodesktop}\PDV Gama Etiquetas"; Filename: "{app}\Pdv.Desktop.exe"; Parameters: "--mode=labels"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Criar atalho de Etiquetas na Área de Trabalho"; GroupDescription: "Atalhos:"; Flags: checkedonce

[Run]
Filename: "{app}\Pdv.Desktop.exe"; Parameters: "--mode=labels"; Description: "Abrir Terminal de Etiquetas e Balcão"; Flags: nowait postinstall skipifsilent
