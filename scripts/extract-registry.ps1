# extract-registry.ps1
#
# Prepares the IAR registry for baking into the mockingbird image.
#
# Sources a registry.json from EITHER:
#   1. A pre-staged local file at $OutputDir\registry.json (skips web download).
#      Use this when a dev has already run the SPE extractor and handed off
#      the raw JSON directly — e.g. dropped it in .\data\registry.json.
#   2. The CM's /temp/registry.json endpoint (web download). This is the
#      original flow — run extract-registry-spe.ps1 inside SPE ISE first so
#      the CM publishes registry.json under the webroot's /temp.
#
# Either way, this script compresses the JSON to $OutputDir\registry.json.gz
# (the form the Dockerfile + engine load).
#
# Usage:
#   .\scripts\extract-registry.ps1
#   .\scripts\extract-registry.ps1 -CmUrl "https://cm.localhost"
#   .\scripts\extract-registry.ps1 -OutputDir data  # (default)

param(
    [string]$CmUrl = "https://cm.localhost",
    [string]$OutputDir = "data"
)

$ErrorActionPreference = "Stop"

Write-Host "====================================" -ForegroundColor Cyan
Write-Host " IAR Registry Download" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

try {
    if (-not (Test-Path $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir | Out-Null
    }

    # Prefer a pre-staged local registry.json when one is present — lets a
    # dev hand-deliver a fresh extract by dropping the raw file into
    # $OutputDir without having to expose it over the CM webroot.
    $localJsonPath = Join-Path $OutputDir "registry.json"
    $jsonContent = $null

    if (Test-Path $localJsonPath) {
        $localSize = (Get-Item $localJsonPath).Length
        Write-Host "  Found local registry.json at: $localJsonPath" -ForegroundColor Yellow
        Write-Host "  Size: $([math]::Round($localSize / 1MB, 2)) MB — using it (skipping CM download)" -ForegroundColor Yellow

        if ($localSize -lt 100) {
            throw "Local registry.json is too small ($localSize bytes) — looks empty or truncated"
        }

        $jsonContent = [System.IO.File]::ReadAllText($localJsonPath, [System.Text.Encoding]::UTF8)
    } else {
        # Fall back to the original download flow. Path is ~/temp/registry.json
        # because the SPE extractor can't write to the webroot under the default
        # IIS app pool identity (Access Denied).
        $registryUrl = "$CmUrl/temp/registry.json"
        Write-Host "  No local registry.json found — downloading from: $registryUrl" -ForegroundColor Yellow

        # Allow self-signed certs
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

        $json = Invoke-WebRequest -Uri $registryUrl -UseBasicParsing -ErrorAction Stop
        $jsonContent = $json.Content

        if ($jsonContent.Length -lt 100) {
            throw "Response too small — registry.json may not exist on the CM yet"
        }
    }

    # Compress
    Write-Host "  Compressing..." -ForegroundColor Yellow

    $jsonBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonContent)
    $gzStream = [System.IO.File]::Create("$OutputDir\registry.json.gz")
    $compressor = New-Object System.IO.Compression.GZipStream($gzStream, [System.IO.Compression.CompressionMode]::Compress)
    $compressor.Write($jsonBytes, 0, $jsonBytes.Length)
    $compressor.Close()
    $gzStream.Close()

    $gzSize = [math]::Round((Get-Item "$OutputDir\registry.json.gz").Length / 1MB, 2)
    $rawSize = [math]::Round($jsonBytes.Length / 1MB, 2)

    # Parse to surface version + item count + SV-versioned-fields coverage.
    # Coverage matters because Phase 3 (versioned fields on __Standard Values
    # items) is what lets the engine cascade template defaults — a v2.0
    # extract has no versionedFields and leaves ~1,700 SV-inherited field
    # divergences on the table.
    $data = $jsonContent | ConvertFrom-Json
    $itemCount = $data.items.Count
    $regVersion = if ($data.version) { $data.version } else { "(unset)" }

    $svItems = @($data.items | Where-Object { $_.name -eq "__Standard Values" })
    $svWithVersioned = @($svItems | Where-Object { $_.versionedFields })

    # Phase 4 coverage: Json Rendering items that carry ComponentQuery. Added
    # in registry schema 3.1 — without this, Mockingbird's in-process
    # ComponentQuery executor (0.3.0 Item 8) never fires on OOTB renderings
    # and the `fields.data` category stays divergent vs prod Edge.
    $jsonRenderingTemplateId = "04646a89-996f-4ee7-878a-ffdbf1f0ef0d"
    $componentQueryFieldId   = "17bb046a-a32a-41b3-8315-81217947611b"
    $renderingItems = @($data.items | Where-Object { $_.template -eq $jsonRenderingTemplateId })
    $renderingsWithCq = @($renderingItems | Where-Object {
        $_.sharedFields -and $_.sharedFields.PSObject.Properties.Name -contains $componentQueryFieldId
    })

    Write-Host ""
    Write-Host "====================================" -ForegroundColor Green
    Write-Host " Extraction complete!" -ForegroundColor Green
    Write-Host "  Version: $regVersion" -ForegroundColor Green
    Write-Host "  Items:   $itemCount" -ForegroundColor Green
    Write-Host "  SV items with versionedFields:        $($svWithVersioned.Count) / $($svItems.Count)" -ForegroundColor Green
    Write-Host "  Json Renderings with ComponentQuery:  $($renderingsWithCq.Count) / $($renderingItems.Count)" -ForegroundColor Green
    Write-Host "  Output:  $OutputDir\registry.json.gz ($gzSize MB, $rawSize MB uncompressed)" -ForegroundColor Green
    Write-Host "====================================" -ForegroundColor Green

    if ($svWithVersioned.Count -eq 0) {
        Write-Host ""
        Write-Host "  WARNING: 0 SV items carry versionedFields." -ForegroundColor Yellow
        Write-Host "  This is a shared-fields-only extract (v2.0-equivalent)." -ForegroundColor Yellow
        Write-Host "  SV cascade defaults (e.g. SearchButtonText=Search) will not resolve." -ForegroundColor Yellow
    }

    if ($renderingsWithCq.Count -eq 0 -and $renderingItems.Count -gt 0) {
        Write-Host ""
        Write-Host "  WARNING: 0 Json Renderings carry ComponentQuery." -ForegroundColor Yellow
        Write-Host "  This is a pre-3.1 extract — Phase 4 did not run." -ForegroundColor Yellow
        Write-Host "  OOTB rendering data fields (Spotlight, Title case-study, etc.)" -ForegroundColor Yellow
        Write-Host "  will not resolve through the in-process ComponentQuery executor." -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "Restart the YAML Provider to load the registry:" -ForegroundColor Gray
    Write-Host "  .\stop.ps1; .\start.ps1" -ForegroundColor Gray

} catch {
    Write-Host ""
    Write-Host "  Registry prep failed." -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "  To generate a fresh registry, either:" -ForegroundColor Yellow
    Write-Host "    A. Drop a pre-extracted registry.json into $OutputDir and re-run." -ForegroundColor Gray
    Write-Host "       (The script prefers a local file over the CM download when present.)" -ForegroundColor Gray
    Write-Host "    B. Run the SPE extractor against the CM, then re-run this script:" -ForegroundColor Gray
    Write-Host "       1. Open Sitecore PowerShell ISE:" -ForegroundColor Gray
    Write-Host "          $CmUrl/sitecore/shell/Applications/PowerShell/PowerShellIse" -ForegroundColor Gray
    Write-Host "       2. Paste and run: scripts\extract-registry-spe.ps1" -ForegroundColor Gray
    Write-Host "       3. Re-run this script to download + compress." -ForegroundColor Gray
    Write-Host ""
    exit 1
}
