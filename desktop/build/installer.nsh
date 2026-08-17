; Extra install steps for LoL Remote Agent, pulled in by electron-builder's
; nsis.include. Shortcuts and the uninstaller come from electron-builder itself;
; what is added here is the pair of things the agent needs that a plain file
; copy cannot do — being reachable from the phone, and coming back after a
; reboot. Both are offered rather than imposed, since both change the machine
; rather than the app.

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; Looked up by name on uninstall, so these must stay in step across both passes.
!define LOL_FIREWALL_RULE "LoL Remote Agent"
!define LOL_STARTUP_LINK "$SMSTARTUP\LoL Remote Agent.lnk"

; This script is compiled twice, once for the installer and once for the
; uninstaller. Anything the uninstaller does not use — the options page, its
; functions, its variables — is dead code in that pass, and NSIS warns about
; dead code while electron-builder promotes warnings to errors. So everything
; install-only is scoped here rather than left at top level.
!ifndef BUILD_UNINSTALLER

  Var LolFirewallCheckbox
  Var LolStartupCheckbox
  Var LolAddFirewall
  Var LolAddStartup

  Function lolOptionsPage
    ; No MUI_HEADER_TEXT: electron-builder pulls this include in before the MUI
    ; macros exist, so referencing them fails the build outright.
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 24u "Your phone reaches this PC over your home network. Without the firewall rule Windows blocks it, and the connection simply times out with nothing on screen to explain why."
    Pop $0

    ${NSD_CreateCheckbox} 0 30u 100% 12u "Allow through Windows Firewall (recommended)"
    Pop $LolFirewallCheckbox
    ${NSD_Check} $LolFirewallCheckbox

    ${NSD_CreateCheckbox} 0 48u 100% 12u "Start with Windows, minimised to the tray"
    Pop $LolStartupCheckbox

    nsDialogs::Show
  FunctionEnd

  Function lolOptionsLeave
    ${NSD_GetState} $LolFirewallCheckbox $LolAddFirewall
    ${NSD_GetState} $LolStartupCheckbox $LolAddStartup
  FunctionEnd

  !macro customPageAfterChangeDir
    Page custom lolOptionsPage lolOptionsLeave
  !macroend

  !macro customInstall
    ${If} $LolAddFirewall == 1
      ; Delete first, so reinstalling does not stack duplicates under one name.
      nsExec::Exec 'netsh advfirewall firewall delete rule name="${LOL_FIREWALL_RULE}"'
      Pop $0

      ; profile=any is the whole reason for doing this by hand: Windows often
      ; files a home Wi-Fi network under Public, and a rule scoped to Private
      ; would silently drop the phone on exactly the networks people use.
      nsExec::Exec 'netsh advfirewall firewall add rule name="${LOL_FIREWALL_RULE}" dir=in action=allow profile=any protocol=TCP program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" enable=yes'
      Pop $0
      ${If} $0 != 0
        DetailPrint "Could not add the firewall rule. Allow LoL Remote Agent by hand if your phone cannot connect."
      ${EndIf}
    ${EndIf}

    ${If} $LolAddStartup == 1
      CreateShortCut "${LOL_STARTUP_LINK}" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ${EndIf}
  !macroend

!endif

!macro customUnInstall
  ; Unconditional: either may have been added by an earlier install, and
  ; removing something that was never there is not an error.
  nsExec::Exec 'netsh advfirewall firewall delete rule name="${LOL_FIREWALL_RULE}"'
  Pop $0
  Delete "${LOL_STARTUP_LINK}"
!macroend
