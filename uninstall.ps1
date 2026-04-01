[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Ensure-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = 'powershell.exe'
        $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
        $psi.Verb = 'runas'
        [System.Diagnostics.Process]::Start($psi) | Out-Null
        exit
    }
}

Ensure-Admin
$installRoot = Join-Path $env:LOCALAPPDATA 'SimpleYtDlpHelper'
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Start Simple yt-dlp Helper.lnk'

Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*$env:LOCALAPPDATA\\SimpleYtDlpHelper*" } | Stop-Process -Force -ErrorAction SilentlyContinue

if (Test-Path $shortcutPath) {
    Remove-Item $shortcutPath -Force
}

if (Test-Path $installRoot) {
    Remove-Item $installRoot -Recurse -Force
}

Write-Host 'Simple yt-dlp helper was removed.' -ForegroundColor Green
Pause
