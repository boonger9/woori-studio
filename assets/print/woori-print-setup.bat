@echo off
rem Woori Studio - print station SETUP (normal print dialog, same profile)
rem Use once: log in, print once with the dialog (duplex etc.). Settings are remembered for the auto-print shortcut.
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
start "" "%CHROME%" --user-data-dir="%PROFILE%" --no-first-run "%URL%"
