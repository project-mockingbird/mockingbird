param(
    [switch]$Rebuild
)

$ErrorActionPreference = "Stop"

Clear-Host
Import-Module -Name (Join-Path $PSScriptRoot "scripts\logo.psm1") -Force
Show-Start

Write-Host "====================================" -ForegroundColor Cyan
Write-Host " Mockingbird" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# Load .env for display
$envFile = Get-Content .env | Where-Object { $_ -match '^\w' -and $_ -notmatch '^#' }
$port = ($envFile | Where-Object { $_ -match '^MOCKINGBIRD_PORT=' }) -replace 'MOCKINGBIRD_PORT=', ''
$projectRoot = ($envFile | Where-Object { $_ -match '^SCS_PROJECT_ROOT=' }) -replace 'SCS_PROJECT_ROOT=', ''
$contentRoot = ($envFile | Where-Object { $_ -match '^SCS_CONTENT_PROJECT_ROOT=' }) -replace 'SCS_CONTENT_PROJECT_ROOT=', ''

Write-Host "  Project root:  $projectRoot"
Write-Host "  Port:          $port"
if ($contentRoot) { Write-Host "  Content root:  $contentRoot" }
Write-Host ""

#----------------------------------------------------------
## start docker
#----------------------------------------------------------

if ($Rebuild) {
    Write-Host "Rebuilding image..." -ForegroundColor Yellow
    docker compose build
    if ($LASTEXITCODE -ne 0) { Write-Error "docker compose build failed." }
    Write-Host ""
}

Write-Host "Starting container..." -ForegroundColor Yellow
docker compose up -d
if ($LASTEXITCODE -ne 0) { Write-Error "docker compose up failed." }

#----------------------------------------------------------
## Wait for HTTP endpoint
#----------------------------------------------------------

Write-Host "Waiting for server to become available..." -ForegroundColor Green
$startTime = Get-Date
$ready = $false
do {
    Start-Sleep -Milliseconds 500
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:$port/" -UseBasicParsing -TimeoutSec 2
        if ($resp.StatusCode -eq 200) { $ready = $true }
    } catch {
        # not up yet
    }
} while (-not $ready -and $startTime.AddSeconds(120) -gt (Get-Date))

if (-not $ready) {
    Write-Warning "Server did not respond within 120s. Check logs: docker compose logs -f"
} else {
    Write-Host ""
    Write-Host "  Web UI:  http://localhost:$port" -ForegroundColor Green
    Write-Host "  API:     http://localhost:$port/api/tree" -ForegroundColor Green
    Write-Host "  GraphQL: http://localhost:$port/api/graphql" -ForegroundColor Green
    Write-Host ""
    Write-Host "Run .\stop.ps1 to stop." -ForegroundColor Gray
}
