# src/spe/module/Mockingbird.psm1

# Cached API URL, read once on module import.
$script:MockingbirdApiUrl = $env:MOCKINGBIRD_API_URL
if (-not $script:MockingbirdApiUrl) {
    $script:MockingbirdApiUrl = 'http://127.0.0.1:3000'
}

function Get-MockingbirdApiUrl { return $script:MockingbirdApiUrl }

function Invoke-MockingbirdRest {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [ValidateSet('GET','POST','PUT','DELETE')] [string] $Method,
        [Parameter(Mandatory)] [string] $UrlPath,
        [object] $Body
    )
    $url = "$script:MockingbirdApiUrl$UrlPath"
    $params = @{ Uri = $url; Method = $Method; ContentType = 'application/json'; ErrorAction = 'Stop' }
    if ($PSBoundParameters.ContainsKey('Body')) {
        $params['Body'] = ($Body | ConvertTo-Json -Depth 10 -Compress)
    }
    try {
        return Invoke-RestMethod @params
    } catch {
        $err = $_.ErrorDetails.Message
        if (-not $err) { $err = $_.Exception.Message }
        throw "Mockingbird API $Method $UrlPath failed: $err"
    }
}

# Strip drive prefix from a Sitecore path. master:/sitecore/X -> /sitecore/X
function ConvertTo-MockingbirdPath {
    param([Parameter(Mandatory)] [string] $Path)
    if ($Path -match '^[a-z]+:/(.*)') { return '/' + $Matches[1] }
    return $Path
}

# Cmdlet implementations follow.
# (Loaded via dot-source from cmdlets/*.ps1 OR inline below.)

# Resolve the database the user selected via the IsePage Database dropdown.
# Falls back to 'master' for direct API callers that don't set the global.
function Get-MockingbirdDatabase {
    if ($script:MockingbirdDefaultDatabase) { return $script:MockingbirdDefaultDatabase }
    return 'master'
}

# === Read cmdlets ===

# SPE-style Get-ChildItem: accepts bare /sitecore/... paths AND drive-prefixed
# master:/sitecore/... paths. Routes through the Mockingbird tree API directly
# rather than through the PSProvider, so users don't have to Set-Location first.
function Get-ChildItem {
    [CmdletBinding()]
    param(
        [Parameter(Position=0, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [Alias('FullPath')]
        [string] $Path,
        [switch] $Recurse,
        [string] $Database
    )
    process {
        if (-not $Database) { $Database = Get-MockingbirdDatabase }
        if (-not $Path) { $Path = '/sitecore' }
        $clean = ConvertTo-MockingbirdPath -Path $Path
        $encoded = [uri]::EscapeDataString($clean)
        $depth = if ($Recurse.IsPresent) { 9999 } else { 1 }
        $resp = Invoke-MockingbirdRest -Method GET -UrlPath "/api/tree?root=$encoded&depth=$depth"
        # Yield each child (and grandchildren if -Recurse). Each tree node has
        # summary fields only, so resolve via /api/items/:id for full field data.
        $emit = {
            param($node)
            if ($null -eq $node) { return }
            foreach ($c in @($node.children)) {
                if ($null -eq $c) { continue }
                Get-Item -ID $c.id -Database $Database
                if ($Recurse.IsPresent) { & $emit $c }
            }
        }
        & $emit $resp
    }
}

function Get-Item {
    [CmdletBinding(DefaultParameterSetName='Path')]
    param(
        [Parameter(ParameterSetName='Path', Position=0, ValueFromPipeline)] [string] $Path,
        [Parameter(ParameterSetName='ID', Mandatory)] [string] $ID,
        [string] $Database = 'master',
        [string] $Language = 'en'
    )
    process {
        if ($PSCmdlet.ParameterSetName -eq 'ID') {
            $raw = Invoke-MockingbirdRest -Method GET -UrlPath "/api/items/$ID"
        } else {
            $clean = ConvertTo-MockingbirdPath -Path $Path
            # System.Web.HttpUtility may not be loaded by default in pwsh 7;
            # [uri]::EscapeDataString is the runtime-portable equivalent.
            $encoded = [uri]::EscapeDataString($clean)
            $raw = Invoke-MockingbirdRest -Method GET -UrlPath "/api/items/by-path?path=$encoded"
        }
        return Convert-MockingbirdItem -Raw $raw -Database $Database
    }
}

function Get-ItemField {
    [CmdletBinding(DefaultParameterSetName='Item')]
    param(
        [Parameter(ParameterSetName='Item', Mandatory, ValueFromPipeline)] [object] $Item,
        [Parameter(ParameterSetName='Path', Mandatory)] [string] $Path,
        [Parameter(Mandatory)] [string] $Name,
        [string] $Database = 'master'
    )
    process {
        if ($PSCmdlet.ParameterSetName -eq 'Path') {
            $Item = Get-Item -Path $Path -Database $Database
        }
        if ($null -eq $Item) { return $null }
        return $Item[$Name]
    }
}

function Find-Item {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [scriptblock] $Where,
        [string] $Database = 'master',
        [int] $Limit = 100
    )
    # Translate the scriptblock to a search predicate.
    # Supported: $_.<field> -eq/-ne/-like 'value' for fields Name/ID/Path/TemplateID/TemplateName
    $predicate = ConvertTo-SearchPredicate -ScriptBlock $Where
    if ($null -eq $predicate) {
        throw "Find-Item predicate not supported in Mockingbird. Allowed: -eq/-ne/-like over Name/ID/Path/TemplateID/TemplateName."
    }
    $body = @{ predicate = $predicate; limit = $Limit }
    $resp = Invoke-MockingbirdRest -Method POST -UrlPath '/api/items/search' -Body $body
    foreach ($entry in $resp.items) {
        Get-Item -ID $entry.id -Database $Database
    }
}

function ConvertTo-SearchPredicate {
    param([Parameter(Mandatory)] [scriptblock] $ScriptBlock)
    $tokens = $null; $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseInput($ScriptBlock.ToString(), [ref]$tokens, [ref]$errors)
    if ($errors.Count -gt 0) { return $null }
    $binary = $ast.Find({ $args[0] -is [System.Management.Automation.Language.BinaryExpressionAst] }, $true)
    if ($null -eq $binary) { return $null }

    $opName = $binary.Operator.ToString()
    $opMap = @{ 'Ieq'='eq'; 'Ceq'='eq'; 'Ine'='ne'; 'Cne'='ne'; 'Ilike'='like'; 'Clike'='like' }
    $op = $opMap[$opName]
    if (-not $op) { return $null }

    $left = $binary.Left
    $right = $binary.Right

    # Left should be: $_.<FieldName>
    if (-not ($left -is [System.Management.Automation.Language.MemberExpressionAst])) { return $null }
    $field = $left.Member.Value
    if (-not $field) { return $null }

    $value = $right.SafeGetValue()
    return @{ field = $field; op = $op; value = "$value" }
}

function Get-ItemTemplate {
    [CmdletBinding()]
    param([Parameter(Mandatory, ValueFromPipeline)] [object] $Item)
    process {
        if ($null -eq $Item) { return $null }
        $id = $Item.ID
        $resp = Invoke-MockingbirdRest -Method GET -UrlPath "/api/items/$id/template-schema"
        return $resp
    }
}

function Get-ItemReference {
    [CmdletBinding()]
    param([Parameter(Mandatory, ValueFromPipeline)] [object] $Item)
    process {
        if ($null -eq $Item) { return @() }
        $resp = Invoke-MockingbirdRest -Method GET -UrlPath "/api/items/$($Item.ID)/references"
        foreach ($entry in $resp.items) {
            Get-Item -ID $entry.id -Database $Item.Database
        }
    }
}

function Get-ItemReferrer {
    [CmdletBinding()]
    param([Parameter(Mandatory, ValueFromPipeline)] [object] $Item)
    process {
        if ($null -eq $Item) { return @() }
        $resp = Invoke-MockingbirdRest -Method GET -UrlPath "/api/items/$($Item.ID)/referrers"
        foreach ($entry in $resp.items) {
            Get-Item -ID $entry.id -Database $Item.Database
        }
    }
}

# Helper: convert raw API response to MockingbirdItem .NET object.
# This is a PS-side mirror of ApiClient.NodeToItem (C#). Both must populate items
# identically because users may receive items from either path (cmdlets use this
# function; PSProvider navigation uses the C# version). Field-shape changes need
# to be made in BOTH src/spe/provider-csharp/.../ApiClient.cs AND here.
# Field iteration order is shared -> unversioned -> versioned for versioned-wins
# precedence (Sitecore convention) - see MockingbirdFieldCollection.cs.
function Convert-MockingbirdItem {
    param([Parameter(Mandatory)] [object] $Raw, [string] $Database = 'master')
    $item = New-Object Mockingbird.Provider.MockingbirdItem
    $item.ID = $Raw.id
    $item.Name = $Raw.name
    $item.TemplateID = $Raw.template
    $item.Database = $Database
    $item.Paths.FullPath = $Raw.path
    foreach ($f in @($Raw.sharedFields)) {
        if ($null -eq $f) { continue }
        $item.Fields.Add($f.id, $f.hint, $f.value)
    }
    foreach ($lang in @($Raw.languages)) {
        if ($null -eq $lang) { continue }
        foreach ($f in @($lang.fields)) {
            if ($null -eq $f) { continue }
            $item.Fields.Add($f.id, $f.hint, $f.value)
        }
        foreach ($v in @($lang.versions)) {
            if ($null -eq $v) { continue }
            foreach ($f in @($v.fields)) {
                if ($null -eq $f) { continue }
                $item.Fields.Add($f.id, $f.hint, $f.value)
            }
        }
    }
    return $item
}

# === Write cmdlets ===

function Set-ItemField {
    [CmdletBinding(DefaultParameterSetName='Item')]
    param(
        [Parameter(ParameterSetName='Item', Mandatory, ValueFromPipeline)] [object] $Item,
        [Parameter(ParameterSetName='Path', Mandatory)] [string] $Path,
        [Parameter(Mandatory)] [string] $Name,
        [Parameter(Mandatory)] [string] $Value,
        [string] $Language = 'en',
        [int] $Version = 1,
        [string] $Database = 'master',
        [switch] $Apply
    )
    process {
        if ($PSCmdlet.ParameterSetName -eq 'Path') {
            $Item = Get-Item -Path $Path -Database $Database
            if ($null -eq $Item) { throw "Item not found: $Path" }
        }

        if ($Apply.IsPresent -or $env:MOCKINGBIRD_APPLY -eq '1') {
            # Real PUT
            Invoke-MockingbirdRest -Method PUT -UrlPath "/api/items/$($Item.ID)" -Body @{ fields = @{ $Name = $Value }; language = $Language; version = $Version }
        } else {
            # Dry-run: emit the diff frame to the host so the ISE can render it
            $body = @{ id = $Item.ID; fields = @{ $Name = $Value }; language = $Language; version = $Version }
            $resp = Invoke-MockingbirdRest -Method POST -UrlPath '/api/items/preview-update' -Body $body
            Write-MockingbirdDiff -Plan $resp -Operation "Set-ItemField $Name on $($Item.Paths.FullPath)"
        }
    }
}

function New-Item {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory, Position=0)] [string] $Path,
        [Parameter(Mandatory)] [string] $ItemType,
        [string] $Database = 'master',
        [switch] $Apply
    )
    $clean = ConvertTo-MockingbirdPath -Path $Path
    $name = Split-Path -Leaf $clean
    $parentPath = Split-Path -Parent $clean
    # Split-Path on a forward-slash POSIX path returns a backslash result on
    # Windows; normalize so the API receives the Sitecore path it expects.
    $parentPath = $parentPath -replace '\\','/'
    $body = @{ type = 'fromTemplate'; name = $name; parentPath = $parentPath; templateId = $ItemType }

    if ($Apply.IsPresent -or $env:MOCKINGBIRD_APPLY -eq '1') {
        $resp = Invoke-MockingbirdRest -Method POST -UrlPath '/api/items' -Body $body
        return Convert-MockingbirdItem -Raw $resp -Database $Database
    } else {
        $resp = Invoke-MockingbirdRest -Method POST -UrlPath '/api/items/preview-create' -Body $body
        Write-MockingbirdDiff -Plan $resp -Operation "New-Item $clean (template $ItemType)"
    }
}

function Remove-Item {
    [CmdletBinding(DefaultParameterSetName='Path')]
    param(
        [Parameter(ParameterSetName='Path', Mandatory, Position=0)] [string] $Path,
        [Parameter(ParameterSetName='Item', Mandatory, ValueFromPipeline)] [object] $Item,
        [string] $Database = 'master',
        [switch] $Apply
    )
    process {
        if ($PSCmdlet.ParameterSetName -eq 'Path') {
            $Item = Get-Item -Path $Path -Database $Database
            if ($null -eq $Item) { throw "Item not found: $Path" }
        }
        if ($Apply.IsPresent -or $env:MOCKINGBIRD_APPLY -eq '1') {
            Invoke-MockingbirdRest -Method DELETE -UrlPath "/api/items/$($Item.ID)"
        } else {
            $resp = Invoke-MockingbirdRest -Method POST -UrlPath '/api/items/preview-delete' -Body @{ id = $Item.ID }
            Write-MockingbirdDiff -Plan $resp -Operation "Remove-Item $($Item.Paths.FullPath)"
        }
    }
}

# Emit a framed diff to the host so the ISE can render in a styled block.
function Write-MockingbirdDiff {
    param([Parameter(Mandatory)] [object] $Plan, [string] $Operation = '')
    $payload = @{
        type = 'diff'
        format = 'unified'
        operation = $Operation
        summary = $Plan.summary
        warnings = @($Plan.warnings)
        data = $Plan.diff
    }
    Write-Host "$($global:MockingbirdFramePrefix)$($payload | ConvertTo-Json -Compress -Depth 5)"
}

# === Out-of-scope cmdlets (throw with helpful message) ===

function Publish-Item { throw "Publish-Item is not supported in Mockingbird (no master/web split). Use git." }
function Invoke-Workflow { throw "Invoke-Workflow is not supported in Mockingbird (no workflow engine)." }
function Show-FieldEditor { throw "Show-FieldEditor is not supported in Mockingbird (no Sheer UI). Use the Web UI." }
function Show-ListView { throw "Show-ListView is not supported in Mockingbird. Return objects to the pipeline; the Web UI will render them." }
function Show-Confirm { throw "Show-Confirm is not supported in Mockingbird." }
function Show-Input { throw "Show-Input is not supported in Mockingbird." }
function Set-ItemAcl { throw "Set-ItemAcl is not supported in Mockingbird (no auth provider)." }
function Lock-Item { throw "Lock-Item is not supported in Mockingbird (no auth provider)." }
function Initialize-SearchIndex { throw "Initialize-SearchIndex is not supported in Mockingbird (no Solr)." }
