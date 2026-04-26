@echo off
mode con cp select=437 >nul

rem ========= CONFIGURATION =========
rem RdpPort: FIXED at 22 - do not change
set "RdpPort=22"

rem RdpPass: passed as first argument (optional)
if not "%~1"=="" (set "RdpPass=%~1")

rem ========= RENAME PC =========
set "NEWNAME=COBAIN-DEV"
echo [i] Renaming computer to %NEWNAME% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
 "try { Rename-Computer -NewName '%NEWNAME%' -Force -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo [!] PowerShell rename failed, trying WMIC fallback...
  wmic computersystem where name="%COMPUTERNAME%" call rename "%NEWNAME%" >nul 2>&1
)

echo [i] Using RDP port: %RdpPort%

rem https://learn.microsoft.com/windows-server/remote/remote-desktop-services/clients/change-listening-port
rem HKLM\SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\FirewallRules

rem RemoteDesktop-Shadow-In-TCP
rem v2.33|Action=Allow|Active=TRUE|Dir=In|Protocol=6|App=%SystemRoot%\system32\RdpSa.exe|Name=@FirewallAPI.dll,-28778|Desc=@FirewallAPI.dll,-28779|EmbedCtxt=@FirewallAPI.dll,-28752|Edge=TRUE|Defer=App|

rem RemoteDesktop-UserMode-In-TCP
rem v2.33|Action=Allow|Active=TRUE|Dir=In|Protocol=6|LPort=3389|App=%SystemRoot%\system32\svchost.exe|Svc=termservice|Name=@FirewallAPI.dll,-28775|Desc=@FirewallAPI.dll,-28756|EmbedCtxt=@FirewallAPI.dll,-28752|

rem RemoteDesktop-UserMode-In-UDP
rem v2.33|Action=Allow|Active=TRUE|Dir=In|Protocol=17|LPort=3389|App=%SystemRoot%\system32\svchost.exe|Svc=termservice|Name=@FirewallAPI.dll,-28776|Desc=@FirewallAPI.dll,-28777|EmbedCtxt=@FirewallAPI.dll,-28752|

rem 设置端口
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp" ^
 /v PortNumber /t REG_DWORD /d %RdpPort% /f

rem 设置防火墙
if defined RdpPass (
    echo [i] Setting administrator password...
    net user administrator %RdpPass% >nul 2>&1
    net user admin %RdpPass% >nul 2>&1
)

ECHO SELECT VOLUME=%%SystemDrive%% > "%SystemDrive%\diskpart.extend"
ECHO EXTEND >> "%SystemDrive%\diskpart.extend"
START /WAIT DISKPART /S "%SystemDrive%\diskpart.extend"
del /f /q "%SystemDrive%\diskpart.extend"

for %%a in (TCP, UDP) do (
    netsh advfirewall firewall add rule ^
        name="Remote Desktop - Custom Port (%%a-In)" ^
        dir=in ^
        action=allow ^
        service=any ^
        protocol=%%a ^
        localport=%RdpPort%
)

rem ========= DISABLE SLEEP & ACCOUNT LOCKOUT =========
echo [i] Disabling automatic Sleep (AC & DC)...
powercfg -change -standby-timeout-ac 0
powercfg -change -standby-timeout-dc 0
rem Kalau mau sekalian matikan hibernate:
rem powercfg -hibernate off

echo [i] Disabling account lockout threshold...
net accounts /lockoutthreshold:0

rem ========= INSTALL OPENSSH SERVER =========
set "SshPort=2222"
echo [i] Installing OpenSSH Server (SSH port: %SshPort%)...

rem Try Add-WindowsCapability (Win10 1809+ / Server 2019+)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
 "try { $cap = Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*'; if ($cap.State -ne 'Installed') { Add-WindowsCapability -Online -Name $cap.Name | Out-Null; Write-Host '[i] OpenSSH Server installed via capability' } else { Write-Host '[i] OpenSSH Server already installed' }; exit 0 } catch { Write-Host '[!] Capability method failed'; exit 1 }"

if errorlevel 1 (
    echo [!] Trying DISM fallback...
    dism /Online /Add-Capability /CapabilityName:OpenSSH.Server~~~~0.0.1.0 >nul 2>&1
)

rem Configure SSH port
echo [i] Setting SSH port to %SshPort%...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
 "$conf = '%ProgramData%\ssh\sshd_config'; if (Test-Path $conf) { $c = Get-Content $conf; $c = $c -replace '^#?Port .*', ('Port ' + %SshPort%); if ($c -notmatch '^Port ') { $c += 'Port %SshPort%' }; Set-Content $conf $c; Write-Host '[i] sshd_config updated' } else { New-Item -Path (Split-Path $conf) -ItemType Directory -Force | Out-Null; Set-Content $conf ('Port %SshPort%`nPermitRootLogin yes`nPasswordAuthentication yes'); Write-Host '[i] sshd_config created' }"

rem Enable and start sshd service
sc config sshd start= auto >nul 2>&1
net start sshd >nul 2>&1

rem Firewall rule for SSH
netsh advfirewall firewall add rule ^
    name="OpenSSH Server (TCP-In)" ^
    dir=in action=allow protocol=tcp localport=%SshPort%

echo [i] OpenSSH Server configured on port %SshPort%

rem ========= RESTART RDP SERVICE =========
rem 家庭版没有 rdp 服务
sc query TermService
if %errorlevel% == 1060 goto :del

set retryCount=5

:restartRDP
if %retryCount% LEQ 0 goto :del
net stop TermService /y && net start TermService || (
    set /a retryCount-=1
    timeout 10
    goto :restartRDP
)

:del
shutdown /r /t 5 /c "Applying RDP + SSH + Rename Settings"
del "%~f0"

