; Inno Setup script for the LoL Remote agent.
; Wraps build/LoLRemoteAgent.exe (a standalone Node SEA binary, no Node.js
; install required) in a normal Windows installer: Start Menu / Desktop
; shortcuts, an optional Windows Firewall rule so the phone can reach it,
; and a clean uninstall.
;
; Built via `npm run package:installer`, which drives ISCC through the
; bundled innosetup-compiler package — no separate Inno Setup install needed.

#define MyAppName "LoL Remote Agent"
#define MyAppVersion GetEnv("LOL_REMOTE_VERSION")
#define MyAppPublisher "LoL Remote"
#define MyAppExeName "LoLRemoteAgent.exe"
#define MyAppPort "8777"

[Setup]
AppId={{9F2C6C7C-6C0E-4E3A-9C8E-2E9B7B8D9A11}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
VersionInfoVersion={#MyAppVersion}
DefaultDirName={autopf}\LoL Remote Agent
DefaultGroupName=LoL Remote Agent
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2
SolidCompression=yes
OutputDir=..\build
OutputBaseFilename=LoLRemoteAgent-Setup
SetupIconFile=..\assets\icon.ico
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"
Name: "firewall"; Description: "Allow through Windows Firewall (needed for the phone to connect)"; GroupDescription: "Network:"; Flags: checkedonce
Name: "startup"; Description: "Start automatically when Windows starts"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Files]
Source: "..\build\LoLRemoteAgent.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{commonstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startup

[Run]
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""LoL Remote"" dir=in action=allow protocol=TCP localport={#MyAppPort} profile=private"; Flags: runhidden; Tasks: firewall
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName} now"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""LoL Remote"""; Flags: runhidden; RunOnceId: "RemoveFirewallRule"
