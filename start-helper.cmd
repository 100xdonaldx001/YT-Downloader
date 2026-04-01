@echo off
setlocal
set "BASE=%LOCALAPPDATA%\SimpleYtDlpHelper"
if not exist "%BASE%\helper\server.js" (
  echo Helper not found at %BASE%\helper\server.js
  pause
  exit /b 1
)
node "%BASE%\helper\server.js"
