# Bring up production-style stack (auth Postgres + gunicorn + built SPA).
# Usage: .\scripts\prod_up.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path ".env")) {
  Write-Error ".env missing. Run: .\.venv\Scripts\python.exe scripts\setup_prod_env.py"
}

function Stop-PortProcess([int]$Port) {
  Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}

Write-Host "Stopping anything on ports 8000 / 5173 / 5433..." -ForegroundColor DarkGray
Stop-PortProcess 8000
Stop-PortProcess 5173

Write-Host "Building and starting Docker stack..." -ForegroundColor Cyan
docker compose up --build -d

Write-Host "Waiting for web container..." -ForegroundColor DarkGray
Start-Sleep -Seconds 5

Write-Host "Running migrations..." -ForegroundColor Cyan
docker compose exec -T web python manage.py migrate --noinput

Write-Host "Seeding superadmin (safe if already exists)..." -ForegroundColor Cyan
docker compose exec -T web python manage.py seed_superadmin

Write-Host ""
Write-Host "Production stack is up:" -ForegroundColor Green
Write-Host "  App:  http://127.0.0.1:8000"
Write-Host "  Auth DB: localhost:5433 (daq_auth)"
Write-Host ""
Write-Host "Still required manually:" -ForegroundColor Yellow
Write-Host "  1. Create Power Automate share-audit flow and set POWER_AUTOMATE_SHARE_AUDIT_WEBHOOK"
Write-Host "  2. When going public: set USE_HTTPS=true, FRONTEND_APP_URL, ALLOWED_HOSTS, CORS/CSRF to your real host"
Write-Host "  3. Audit managed-user emails (must be @detroitaxle.com)"
