# Setup Live Streaming Recorder di Windows 10/11
# Pemakaian (PowerShell, dari folder project):
#   powershell -ExecutionPolicy Bypass -File scripts\windows\setup.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\windows\setup.ps1 -Autostart   # + jalan otomatis saat login
param([switch]$Autostart)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $root

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Ensure-Tool($cmd, $wingetId) {
  if (Get-Command $cmd -ErrorAction SilentlyContinue) { Write-Host "  [ok] $cmd"; return }
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "$cmd tidak ditemukan dan winget tidak tersedia. Install $cmd manual lalu jalankan ulang."
  }
  Write-Host "  [install] $wingetId"
  winget install -e --id $wingetId --accept-source-agreements --accept-package-agreements --silent
  Refresh-Path
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "$cmd sudah diinstall tapi belum ada di PATH. Tutup & buka ulang PowerShell lalu jalankan script ini lagi."
  }
}

Write-Host '==> Cek dependensi'
Refresh-Path
Ensure-Tool 'node' 'OpenJS.NodeJS.LTS'
Ensure-Tool 'ffmpeg' 'Gyan.FFmpeg'
Ensure-Tool 'yt-dlp' 'yt-dlp.yt-dlp'

$nodeMajor = [int]((node -v).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) { throw "Butuh Node.js >= 20 (terpasang: $(node -v))" }

if (-not (Test-Path '.env')) {
  Write-Host '==> Membuat .env'
  $pw = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 16 | ForEach-Object { [char]$_ })
  $ffmpeg = (Get-Command ffmpeg).Source
  $ytdlp = (Get-Command yt-dlp).Source
  @"
PORT=9843
HOST=0.0.0.0
PASSWORD=$pw
DATA_DIR=./data
DOWNLOAD_DIR=./downloads
FFMPEG_PATH=$ffmpeg
YTDLP_PATH=$ytdlp
"@ | Set-Content -Path '.env' -Encoding ascii
  Write-Host "    Password UI: $pw  (ubah di .env)"
}

Write-Host '==> npm install & build'
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm install gagal' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'build gagal' }

if ($Autostart) {
  Write-Host '==> Daftarkan Scheduled Task (jalan otomatis saat login)'
  $bat = Join-Path $root 'start-windows.bat'
  $action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$bat`" --hidden" -WorkingDirectory $root
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName 'LiveStreamingRecorder' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
  Start-ScheduledTask -TaskName 'LiveStreamingRecorder'
  Write-Host '    Task "LiveStreamingRecorder" aktif. Log: data\server.log'
  Write-Host '    Hapus: Unregister-ScheduledTask -TaskName LiveStreamingRecorder'
}

Write-Host ''
Write-Host 'Selesai! Jalankan start-windows.bat lalu buka http://localhost:9843'
