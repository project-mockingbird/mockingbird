$ErrorActionPreference = "Stop"

Write-Host "Stopping Mockingbird..." -ForegroundColor Yellow
docker compose down
if ($LASTEXITCODE -ne 0) { Write-Error "docker compose down failed." }
Write-Host "Stopped." -ForegroundColor Green
