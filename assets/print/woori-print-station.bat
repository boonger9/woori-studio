@echo off
rem Woori Studio - bulletin print station (Chrome auto-print mode)
rem Double-click: opens a separate print-only Chrome window. Your normal Chrome is not affected.
set URL=https://boonger9.github.io/woori-studio/print-station.html
set PROFILE=%LOCALAPPDATA%\WooriPrintStation
set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" (
  echo Google Chrome was not found. Please install Chrome.
  pause
  exit /b 1
)
start "" "%CHROME%" --kiosk-printing --user-data-dir="%PROFILE%" --no-first-run "%URL%"
