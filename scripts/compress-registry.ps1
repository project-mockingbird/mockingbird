# compress-registry.ps1
# Compresses data/registry.json -> data/registry.json.gz
# Also writes data/registry.json.gz.sha256 alongside so the IAR registry
# blob has a provenance witness committed to the repo. Verifying the gz
# against the checksum is a one-liner: `Get-FileHash data\registry.json.gz`
# (Windows) or `sha256sum data/registry.json.gz` (Linux/Mac).

$ErrorActionPreference = "Stop"

$jsonPath = "data\registry.json"
$gzPath = "data\registry.json.gz"
$shaPath = "data\registry.json.gz.sha256"

if (-not (Test-Path $jsonPath)) {
    Write-Error "File not found: $jsonPath"
    exit 1
}

$jsonBytes = [System.IO.File]::ReadAllBytes($jsonPath)
$gzStream = [System.IO.File]::Create($gzPath)
$compressor = New-Object System.IO.Compression.GZipStream($gzStream, [System.IO.Compression.CompressionMode]::Compress)
$compressor.Write($jsonBytes, 0, $jsonBytes.Length)
$compressor.Close()
$gzStream.Close()

Remove-Item $jsonPath -Force

# Emit a sha256 sidecar file matching the GNU coreutils format
# ("<hash>  <filename>") so the standard `sha256sum -c` flow works
# unchanged on Linux/Mac.
$hash = (Get-FileHash $gzPath -Algorithm SHA256).Hash.ToLower()
"$hash  registry.json.gz" | Set-Content -Path $shaPath -NoNewline -Encoding ascii

$gzSize = [math]::Round((Get-Item $gzPath).Length / 1MB, 2)
Write-Host "Compressed to $gzPath ($gzSize MB)" -ForegroundColor Green
Write-Host "Wrote sha256 sidecar to $shaPath ($hash)" -ForegroundColor Green
