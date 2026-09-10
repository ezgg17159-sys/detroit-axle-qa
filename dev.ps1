# Start Django API + Vite frontend together.
# Usage:  .\dev.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$python = Join-Path $root ".venv\Scripts\python.exe"
$backendDir = Join-Path $root "backend"
$webDir = Join-Path $root "web"

if (-not (Test-Path $python)) {
  Write-Error "Virtualenv not found at .venv. Create it first, then re-run."
}

function Stop-PortProcess([int]$Port) {
  Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}

Write-Host ""
Write-Host "  Detroit Axle QA - starting both servers" -ForegroundColor Cyan
Write-Host "  API:  http://127.0.0.1:8000" -ForegroundColor DarkGray
Write-Host "  App:  http://127.0.0.1:5173" -ForegroundColor DarkGray
Write-Host "  Press Ctrl+C to stop both." -ForegroundColor DarkGray
Write-Host ""

# Free ports if a previous run is still hanging
Stop-PortProcess 8000
Stop-PortProcess 5173

$backend = Start-Process -FilePath $python `
  -ArgumentList @("manage.py", "runserver", "8000") `
  -WorkingDirectory $backendDir `
  -PassThru `
  -NoNewWindow

try {
  Push-Location $webDir
  & npm run dev
}
finally {
  Pop-Location
  Write-Host ""
  Write-Host "Stopping servers..." -ForegroundColor Yellow
  if ($backend -and -not $backend.HasExited) {
    Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
  }
  Stop-PortProcess 8000
  Stop-PortProcess 5173
}
