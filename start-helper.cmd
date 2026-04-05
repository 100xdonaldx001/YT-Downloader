@echo off
setlocal

set "BASE=%~dp0"
if "%BASE:~-1%"=="\" set "BASE=%BASE:~0,-1%"

if not exist "%BASE%\helper\server.js" (
  echo Helper not found at %BASE%\helper\server.js
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Attempting install via winget...
  where winget >nul 2>nul
  if errorlevel 1 (
    echo winget is not available. Install Node.js LTS and retry.
    pause
    exit /b 1
  )

  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js installation failed or requires a new terminal session.
    echo Install Node.js LTS manually and retry.
    pause
    exit /b 1
  )
)

where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo FFmpeg not found. Attempting install via winget...
  where winget >nul 2>nul
  if errorlevel 1 (
    echo winget is not available. Install FFmpeg and retry.
    pause
    exit /b 1
  )

  winget install -e --id Gyan.FFmpeg --accept-package-agreements --accept-source-agreements

  for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg*") do (
    for /d %%B in ("%%~D\ffmpeg-*\bin") do (
      if exist "%%~B\ffmpeg.exe" set "PATH=%%~B;%PATH%"
    )
  )

  where ffmpeg >nul 2>nul
  if errorlevel 1 (
    echo FFmpeg installation failed or is not available in PATH yet.
    echo Install FFmpeg manually and retry.
    pause
    exit /b 1
  )
)

if not exist "%BASE%\yt-dlp.exe" (
  echo yt-dlp.exe not found. Downloading latest build...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile '%BASE%\yt-dlp.exe'"
  if errorlevel 1 (
    echo Failed to download yt-dlp.exe. Please download it manually.
    pause
    exit /b 1
  )
)

node "%BASE%\helper\server.js"
