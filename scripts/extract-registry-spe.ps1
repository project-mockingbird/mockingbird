# Run this script inside Sitecore PowerShell ISE
# (Sitecore Desktop > PowerShell ISE)
#
# It extracts all IAR items and writes registry.json to the CM's webroot.
# After running, download the file from: https://cm.localhost/registry.json

$resourceLoaderType = ([System.Type]::GetType("Sitecore.Data.DataProviders.ReadOnly.Protobuf.IResourceLoader, Sitecore.Data.ResourceItems.ProtobufNet"))
$resourceLoader = [Sitecore.DependencyInjection.ServiceLocator]::ServiceProvider.GetService($resourceLoaderType)

# ---------------------------------------------------------------------------
# Universal field extraction
#
# 0.6+ (registry v4.0): replaces the per-phase field allowlists with one pass
# that captures every locally-stored shared field per item. Sitecore stores a
# value on $field.Value whether it's local OR a cascaded default from a base
# template's __Standard Values; ContainsStandardValue distinguishes them. We
# capture only locally-stored values - cascaded defaults are reconstructed at
# runtime from the SV items already extracted in Phase 3.
#
# Denylist: Blob (binary, balloons size; media is bind-mounted separately)
# plus per-edit churn fields (Lock, Revision, Workflow state) that have no
# runtime use in mockingbird.
# ---------------------------------------------------------------------------

$BLOB_FIELD_ID         = '40e50ed9-ba07-4702-992e-a912738d32dc'
$LOCK_FIELD_ID         = '001dd393-96c5-490b-924a-b0f25cd9efd8'   # __Lock
$REVISION_FIELD_ID     = '8cdc337e-a112-42fb-bbb4-4143751e123f'   # __Revision
$WORKFLOW_STATE_FIELD  = '3e431de1-525e-47a3-b6b0-1ccbec3a8c98'   # __Workflow state

$SHARED_FIELD_DENYLIST = @{
  $BLOB_FIELD_ID        = $true
  $LOCK_FIELD_ID        = $true
  $REVISION_FIELD_ID    = $true
  $WORKFLOW_STATE_FIELD = $true
}

# Capture every locally-stored shared field on the item, except denylisted IDs.
# Mutates $regItem.sharedFields. Returns the count of fields added/updated.
function Enrich-AllShared($regItem, $scItem) {
    $added = 0
    foreach ($field in $scItem.Fields) {
        if (-not $field.Shared) { continue }
        $fid = $field.ID.Guid.ToString().ToLowerInvariant()
        if ($SHARED_FIELD_DENYLIST.ContainsKey($fid)) { continue }
        # Skip cascaded defaults; only keep values stored ON this item.
        if ($field.ContainsStandardValue) { continue }
        if ([string]::IsNullOrEmpty($field.Value)) { continue }
        $regItem.sharedFields[$fid] = $field.Value
        $added++
    }
    return $added
}

# ---------------------------------------------------------------------------
# Phase 1: Load IAR items from Protobuf .dat files
#
# Scans two locations:
#   ~/App_Data/items/{core,master}/           - base platform items
#   ~/sitecore modules/items/{core,master}/   - module items (SXA, JSS, SPE)
#
# Loads each directory separately (loading all at once can NullRef).
# Skips language-specific .dat files (e.g. items.master.sxa.da-DK.dat).
# ---------------------------------------------------------------------------

$items = [System.Collections.ArrayList]::new()
$byId = @{}

$appDataPath = [Sitecore.IO.FileUtil]::MapPath("~/App_Data/items")
$modulesPath = [Sitecore.IO.FileUtil]::MapPath("~/sitecore modules/items")

# Collect all directories that contain .dat files
$datDirs = @()
foreach ($basePath in @($appDataPath, $modulesPath)) {
    if (-not (Test-Path $basePath)) { continue }
    Get-ChildItem -Path $basePath -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $dats = Get-ChildItem -Path $_.FullName -Filter "*.dat" -ErrorAction SilentlyContinue
        if ($dats) { $datDirs += $_ }
    }
}

foreach ($dir in $datDirs) {
    # Determine database name from directory name (core or master)
    $dbName = $dir.Name

    # Filter out language-specific .dat files - keep only base .dat files
    # Language files have pattern: items.{db}.{module}.{lang-code}.dat (4+ dot segments)
    # Base files have pattern:    items.{db}.{module}.dat (3 dot segments) or items.{db}.dat
    $allDats = Get-ChildItem -Path $dir.FullName -Filter "*.dat" -ErrorAction SilentlyContinue
    $baseDats = $allDats | Where-Object {
        $parts = $_.BaseName -split '\.'
        # Language .dat files have a segment like "da-DK", "de-DE" - contains a hyphen in the last segment before .dat
        $lastPart = $parts[-1]
        -not ($lastPart -match '^[a-z]{2}-[A-Z]{2}$')
    }

    if (-not $baseDats) { continue }

    # Copy base .dat files to a temp dir so we only load those (not the language ones)
    $tempDir = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "scp-extract-$dbName-$([guid]::NewGuid().ToString('N').Substring(0,8))")
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    foreach ($dat in $baseDats) {
        Copy-Item -Path $dat.FullName -Destination $tempDir
    }

    $datNames = ($baseDats | ForEach-Object { $_.Name }) -join ", "
    Write-Host "Loading $dbName from $($dir.FullName)..."
    Write-Host "  Files: $datNames"

    try {
        $paths = [System.Collections.Generic.List[string]]::new()
        $paths.Add($tempDir)
        $defaults = New-Object 'System.Collections.Generic.Dictionary[[guid],[string]]'
        $dataSet = $resourceLoader.LoadFromFiles($paths, "dat", $defaults)
        Write-Host "  $($dataSet.Definitions.Count) definitions"

        foreach ($entry in $dataSet.Definitions.GetEnumerator()) {
            $rec = $entry.Value
            $shared = @{}
            if ($rec.SharedFields) {
                foreach ($f in $rec.SharedFields) {
                    $shared[$f.FieldId.ToString().ToLower()] = $f.Value
                }
            }
            $itemId = $rec.ID.ToString().ToLower()
            # Skip if we already have this item (can happen with overlapping modules)
            if ($byId.ContainsKey($itemId)) { continue }

            $item = @{
                id       = $itemId
                name     = $rec.Name
                parent   = $rec.ParentID.ToString().ToLower()
                template = $rec.TemplateID.ToString().ToLower()
                path     = ""
                database = $dbName
                sharedFields = $shared
            }
            [void]$items.Add($item)
            $byId[$itemId] = $item
        }
    } catch {
        Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
    } finally {
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "Total: $($items.Count) items"

# Reconstruct paths
function Get-ItemPath($item) {
    $segs = [System.Collections.ArrayList]::new()
    $cur = $item; $visited = @{}
    while ($cur -and -not $visited.ContainsKey($cur.id)) {
        $visited[$cur.id] = $true
        [void]$segs.Insert(0, $cur.name)
        $cur = $byId[$cur.parent]
    }
    return "/" + ($segs -join "/")
}

Write-Host "Reconstructing paths..."
foreach ($item in $items) { $item.path = Get-ItemPath $item }

# ---------------------------------------------------------------------------
# Phase 2: Universal shared-field extraction
#
# Iterate $items and, for each item resolvable in its database, capture all
# locally-stored shared field values via Enrich-AllShared. Replaces the
# previous Phase 2 (templates/sections/fields), Phase 4 (ComponentQuery),
# and Phase 5a (rendering Placeholders/RCR/componentName) - all of which
# were narrow allowlists.
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Phase 2: Universal shared-field extraction..."

$enrichedItems = 0
$enrichedFields = 0
$skipped = 0
$batch = 0
$total = $items.Count

foreach ($regItem in $items) {
    $batch++
    if ($batch % 1000 -eq 0) { Write-Host "    $batch / $total..." }
    try {
        $db = [Sitecore.Data.Database]::GetDatabase($regItem.database)
        $scItem = $db.GetItem([Sitecore.Data.ID]::Parse($regItem.id))
        if (-not $scItem) { $skipped++; continue }
        $added = Enrich-AllShared $regItem $scItem
        if ($added -gt 0) { $enrichedItems++; $enrichedFields += $added }
    } catch {
        $skipped++
        # Skip items that can't be looked up (e.g. IAR-only items not in DB)
    }
}

Write-Host "  Enriched $enrichedFields shared field values across $enrichedItems items ($skipped items skipped, IAR-only or DB-unreachable)"

# ---------------------------------------------------------------------------
# Phase 3: Versioned fields for __Standard Values items
#
# SV items carry template default field values. Prod Edge cascades these to
# any item of the template that hasn't overridden the field; mockingbird
# needs the same data to match prod. Without this, fields like
# SearchBoxWithSuggestions.SearchButtonText ("Search" on prod) come back
# as "" on mockingbird.
#
# Identification: name == "__Standard Values" (case-insensitive). SVs don't
# share a template ID - each SV's own template IS the parent template it
# provides defaults for. Don't filter on a template GUID.
#
# Filters (per dev spec):
#   - skip shared fields (already captured in Phase 2)
#   - skip empty values (keep the registry lean)
#   - skip Sitecore system fields (names starting with __)
#
# Output shape (sibling of sharedFields, only emitted when non-empty):
#   versionedFields: { en: { "1": { <field-guid>: "<value>" } } }
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Phase 3: Extracting versioned fields from __Standard Values items..."

$svItems = [System.Collections.ArrayList]::new()
foreach ($item in $items) {
    if ($item.name -and [string]::Equals($item.name, "__Standard Values", [System.StringComparison]::OrdinalIgnoreCase)) {
        [void]$svItems.Add($item)
    }
}
Write-Host "  Candidate SV items: $($svItems.Count)"

$lang = [Sitecore.Globalization.Language]::Parse("en")
$ver  = [Sitecore.Data.Version]::Parse("1")
$svEnriched = 0
$svTotalFields = 0
$svBatch = 0

foreach ($regItem in $svItems) {
    $svBatch++
    if ($svBatch % 100 -eq 0) { Write-Host "    $svBatch / $($svItems.Count)..." }

    try {
        $db = [Sitecore.Data.Database]::GetDatabase($regItem.database)
        $scItem = $db.GetItem([Sitecore.Data.ID]::Parse($regItem.id), $lang, $ver)
        if (-not $scItem) { continue }
        if ($scItem.Versions.Count -eq 0) { continue }

        $fields = @{}
        foreach ($field in $scItem.Fields) {
            if ($field.Shared) { continue }
            if ([string]::IsNullOrEmpty($field.Value)) { continue }
            if ($field.Name.StartsWith("__")) { continue }
            $fieldIdStr = $field.ID.Guid.ToString().ToLowerInvariant()
            $fields[$fieldIdStr] = $field.Value
        }

        if ($fields.Count -gt 0) {
            $regItem.versionedFields = @{
                "en" = @{
                    "1" = $fields
                }
            }
            $svEnriched++
            $svTotalFields += $fields.Count
        }
    } catch {
        # Skip SVs that can't be resolved in the DB (protobuf-only items with no DB entry)
    }
}

Write-Host "  Enriched $svEnriched of $($svItems.Count) SV items"
Write-Host "  Total versioned field values: $svTotalFields"

# ---------------------------------------------------------------------------
# Phase 5 (0.4.0.14) - LayoutService emission contract metadata
#
# Discover and add two item classes not present in IAR, then enrich via
# Enrich-AllShared (rendering items are already handled by Phase 2):
# - Placeholder Settings items under /sitecore/layout/placeholder settings/**:
#   discovered by Placeholder Key field presence; all shared fields captured.
# - RCR Settings items under /sitecore/system/Settings/Rendering Contents Resolvers/**:
#   discovered by UseContextItem or ItemSelectorQuery presence; all shared fields captured.
#
# UseContextItem and ItemSelectorQuery are resolved by field name from the
# Rendering Contents Resolver template so the discovery guard can check by
# well-known field value before calling Enrich-AllShared.
#
# Architecture note: this script is IAR-first. Placeholder Settings and RCR
# Settings items may not be in IAR, so they are added to $items/$byId on
# first encounter via Ensure-RegistryItem.
# All IDs are stored lowercase to match the Phase 1 convention.
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Phase 5: LayoutService emission contract metadata..."

$PLACEHOLDER_KEY_FIELD_ID = '7256bdab-1fd2-49dd-b205-cb4873d2917c'

# Helper: ensure an item from the Sitecore DB is in the registry.
# Returns the registry item (existing or newly created).
function Ensure-RegistryItem($scItem, $dbName) {
    $id = $scItem.ID.Guid.ToString().ToLowerInvariant()
    if ($byId.ContainsKey($id)) { return $byId[$id] }
    $regItem = @{
        id           = $id
        name         = $scItem.Name
        parent       = $scItem.ParentID.Guid.ToString().ToLowerInvariant()
        template     = $scItem.TemplateID.Guid.ToString().ToLowerInvariant()
        path         = $scItem.Paths.FullPath
        database     = $dbName
        sharedFields = @{}
    }
    [void]$items.Add($regItem)
    $byId[$id] = $regItem
    return $regItem
}

# ----- 5b: Placeholder Settings items - Placeholder Key -----
# These are typically not in IAR; query the master DB directly and add to registry.

Write-Host "  Querying Placeholder Settings items from master DB..."
$p5PhSettings = 0
try {
    $masterDb = [Sitecore.Data.Database]::GetDatabase("master")
    $phRoot = $masterDb.GetItem("/sitecore/layout/placeholder settings")
    if ($phRoot) {
        $phItems = $phRoot.Axes.GetDescendants()
        foreach ($scItem in $phItems) {
            $phKeyField = $scItem.Fields[[Sitecore.Data.ID]::Parse($PLACEHOLDER_KEY_FIELD_ID)]
            if ($phKeyField -and $phKeyField.Value) {
                $regItem = Ensure-RegistryItem $scItem "master"
                Enrich-AllShared $regItem $scItem | Out-Null
                $p5PhSettings++
            }
        }
    } else {
        Write-Host "  WARN: /sitecore/layout/placeholder settings not found in master DB" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ERROR in Phase 5b (Placeholder Settings): $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host "  Enriched $p5PhSettings Placeholder Settings items (Placeholder Key)"

# ----- 5c: RCR Settings items - UseContextItem + ItemSelectorQuery -----
# Look up field IDs by name from the Rendering Contents Resolver template, then
# enrich each item under /sitecore/system/Settings/Rendering Contents Resolvers.

Write-Host "  Resolving UseContextItem + ItemSelectorQuery field IDs from RCR template..."
$p5RcrEnriched = 0
try {
    $masterDb = [Sitecore.Data.Database]::GetDatabase("master")
    $rcrTemplate = $masterDb.GetItem("/sitecore/templates/System/Layout/Renderings/Rendering Contents Resolver")
    if ($rcrTemplate) {
        $useCtxId = $null
        $queryId  = $null
        foreach ($child in $rcrTemplate.Axes.GetDescendants()) {
            if ($child.TemplateName -eq "Template field") {
                if ($child.Name -eq "UseContextItem")    { $useCtxId = $child.ID.Guid.ToString().ToLowerInvariant() }
                if ($child.Name -eq "ItemSelectorQuery") { $queryId  = $child.ID.Guid.ToString().ToLowerInvariant() }
            }
        }
        if ($useCtxId -and $queryId) {
            Write-Host "  UseContextItem field ID:    $useCtxId"
            Write-Host "  ItemSelectorQuery field ID: $queryId"
            $rcrRoot = $masterDb.GetItem("/sitecore/system/Settings/Rendering Contents Resolvers")
            if ($rcrRoot) {
                foreach ($scItem in $rcrRoot.Axes.GetDescendants()) {
                    $useCtxField = $scItem.Fields[[Sitecore.Data.ID]::Parse($useCtxId)]
                    $queryField  = $scItem.Fields[[Sitecore.Data.ID]::Parse($queryId)]
                    $useCtxVal   = if ($useCtxField) { $useCtxField.Value } else { $null }
                    $queryVal    = if ($queryField)  { $queryField.Value  } else { $null }
                    if ($useCtxVal -or $queryVal) {
                        $regItem = Ensure-RegistryItem $scItem "master"
                        Enrich-AllShared $regItem $scItem | Out-Null
                        $p5RcrEnriched++
                    }
                }
            } else {
                Write-Host "  WARN: /sitecore/system/Settings/Rendering Contents Resolvers not found in master DB" -ForegroundColor Yellow
            }
        } else {
            Write-Warning "Phase 5c: UseContextItem or ItemSelectorQuery field not found on RCR template - RCR enrichment skipped"
        }
    } else {
        Write-Host "  WARN: Rendering Contents Resolver template not found in master DB" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ERROR in Phase 5c (RCR Settings): $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host "  Enriched $p5RcrEnriched RCR Settings items (UseContextItem + ItemSelectorQuery)"
Write-Host "Phase 5 complete."

# ---------------------------------------------------------------------------
# Acceptance spot-check (per dev spec)
# ---------------------------------------------------------------------------

$searchBoxSvId           = "4f8772a8-6a97-4fad-a88a-63e85f070cee"
$searchButtonTextFieldId = "a799c388-0d5e-4196-ac39-addc9f76756c"
$searchBoxSv = $byId[$searchBoxSvId]

if (-not $searchBoxSv) {
    Write-Host "  WARN: Search Box SV $searchBoxSvId not found in registry items!" -ForegroundColor Yellow
} elseif (-not $searchBoxSv.ContainsKey("versionedFields")) {
    Write-Host "  WARN: Search Box SV has no versionedFields key (Phase 3 missed it)" -ForegroundColor Yellow
} else {
    $val = $searchBoxSv.versionedFields["en"]["1"][$searchButtonTextFieldId]
    if ($val -eq "Search") {
        Write-Host "  Phase 3 spot-check PASS: Search Box SV.SearchButtonText = 'Search'" -ForegroundColor Green
    } else {
        Write-Host "  WARN: Search Box SV.SearchButtonText = '$val' (expected 'Search')" -ForegroundColor Yellow
    }
}

$paramsTemplateFieldId = "a77e8568-1ab3-44f1-a664-b7c37ec7810d"
$jsonRenderingTemplateId = "04646a89-996f-4ee7-878a-ffdbf1f0ef0d"
$renderingsWithParamsTemplate = ($items | Where-Object {
    $_.template -eq $jsonRenderingTemplateId -and
    $_.sharedFields.ContainsKey($paramsTemplateFieldId)
}).Count
if ($renderingsWithParamsTemplate -eq 0) {
    Write-Host "  WARN: Phase 2 produced 0 ParametersTemplate enrichments on Json Renderings - the universal pass missed something" -ForegroundColor Yellow
} else {
    Write-Host "  Phase 2 spot-check: $renderingsWithParamsTemplate Json Rendering items carry ParametersTemplate" -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

$output = @{
    # `version` is the registry's extraction-generation marker, not a JSON-schema
    # version. Bump on substantive changes to what gets captured (e.g. v4.0 added
    # the universal Enrich-AllShared pass). Code reading this registry does not
    # version-gate; the field is for human/operator clarity when correlating
    # bake artifacts.
    version     = "4.0"
    source      = $env:COMPUTERNAME
    extractedAt = (Get-Date -Format "o")
    items       = $items
}

$json = $output | ConvertTo-Json -Depth 10 -Compress
# Write to ~/temp/ - IIS app pool has write access to this path AND it's web-served.
# Writing to ~/ (webroot) fails with Access Denied under the default app pool identity.
$outPath = [Sitecore.IO.FileUtil]::MapPath("~/temp/registry.json")
[System.IO.File]::WriteAllText($outPath, $json, [System.Text.Encoding]::UTF8)

$sizeMB = [math]::Round((Get-Item $outPath).Length / 1MB, 2)
Write-Host ""
Write-Host "Extraction complete! $($items.Count) items ($sizeMB MB)"
Write-Host "Download from: https://local.cm.example.com/temp/registry.json"
