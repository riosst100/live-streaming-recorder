@echo off
rem Jalankan Live Streaming Recorder di Windows. Tutup jendela / Ctrl+C untuk berhenti.
cd /d "%~dp0"

where node >nul 2>nul || (echo Node.js belum terpasang. Jalankan scripts\windows\setup.ps1 dulu. & pause & exit /b 1)
if not exist node_modules call npm install --no-audit --no-fund
if not exist .next\BUILD_ID call npm run build

if "%~1"=="--hidden" (
  if not exist data mkdir data
  call npm start >> data\server.log 2>&1
) else (
  echo Live Streaming Recorder: http://localhost:9843
  call npm start
)
