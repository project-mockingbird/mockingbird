// src/spe/host/startup-template.ts

/**
 * PowerShell code injected into every fresh `pwsh` child at session start.
 *
 * Phase 2 baseline (STARTUP_SCRIPT_LEGACY): `Invoke-MockingbirdRun` + `Echo-Test`
 * only. Retained so the existing mocked tests don't have to load real C#
 * provider DLL + PS module.
 *
 * Phase 3 builder (`buildStartupScript`): same baseline plus
 * `Import-Module <providerDll>` + `Import-Module <psd1>` so the Mockingbird
 * cmdlets and PSDrives are available inside Invoke-MockingbirdRun.
 *
 * Both flavors emit the `mockingbird-startup-complete` info frame at the
 * very end. If module loading fails the script writes an error frame and
 * exits before that signal, so SessionManager.waitForReady will time out
 * with the underlying error visible in the frame buffer.
 */
export const STARTUP_SCRIPT_LEGACY = String.raw`
$ErrorActionPreference = 'Continue'
$global:MockingbirdFramePrefix = '__M_FRAME__'

function Invoke-MockingbirdRun {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $RunId,
        [Parameter(Mandatory)] [bool]   $ApplyMode,
        [Parameter(Mandatory)] [scriptblock] $Body
    )
    $env:MOCKINGBIRD_APPLY = if ($ApplyMode) { '1' } else { '0' }
    $startTicks = [DateTime]::UtcNow.Ticks
    $started = [PSCustomObject]@{ type = 'runStarted'; runId = $RunId } | ConvertTo-Json -Compress
    Write-Host "$($global:MockingbirdFramePrefix)$started"
    $exit = 0
    $aborted = $false
    try {
        & $Body | Out-Default
    } catch [System.Management.Automation.PipelineStoppedException] {
        # Pipeline interrupt (e.g. SIGINT on Linux). On Windows this branch is
        # rarely reached because process.kill('SIGINT') terminates the host
        # before the catch fires; the host translates that into an explicit
        # close. Either way the session manager surfaces a runAborted frame.
        $aborted = $true
    } catch {
        Write-Error $_.Exception.Message
        $exit = 1
    } finally {
        if ($aborted) {
            $abortedFrame = [PSCustomObject]@{ type = 'runAborted'; runId = $RunId } | ConvertTo-Json -Compress
            Write-Host "$($global:MockingbirdFramePrefix)$abortedFrame"
        } else {
            $durationMs = [int](([DateTime]::UtcNow.Ticks - $startTicks) / 10000)
            $complete = [PSCustomObject]@{ type = 'runComplete'; runId = $RunId; exitCode = $exit; durationMs = $durationMs } | ConvertTo-Json -Compress
            Write-Host "$($global:MockingbirdFramePrefix)$complete"
        }
    }
}

function Echo-Test {
    [CmdletBinding()]
    param([Parameter(Mandatory, ValueFromPipeline)] [string] $InputText)
    process { Write-Output $InputText }
}

# Signal the host that startup is complete. The session manager waits for this
# before returning the session id to the caller.
$ready = [PSCustomObject]@{ type = 'stream'; stream = 'info'; data = 'mockingbird-startup-complete' } | ConvertTo-Json -Compress
Write-Host "$($global:MockingbirdFramePrefix)$ready"
`.trim() + '\n';

// Backward-compatibility alias for callers that imported STARTUP_SCRIPT.
// New code should prefer buildStartupScript({...}) so cmdlets are loaded.
export const STARTUP_SCRIPT = STARTUP_SCRIPT_LEGACY;

export interface StartupScriptOptions {
  /** Absolute path to data/spe/Mockingbird.Provider.dll. */
  providerDllPath: string;
  /** Absolute path to src/spe/module/Mockingbird.psd1. */
  moduleManifestPath: string;
}

/**
 * Build the Phase 3 startup script: load the C# provider DLL and the PS
 * module before signalling startup-complete. Module-load failures emit a
 * stream/error frame and `exit 1` the child - the session manager's
 * waitForReady will time out with that error sitting in the frame buffer.
 */
export function buildStartupScript(opts: StartupScriptOptions): string {
  // Single-quote-escape paths so PS treats them literally even if they
  // happen to contain a quote character (extremely unusual on Windows but
  // cheap to guard).
  const dll = opts.providerDllPath.replace(/'/g, "''");
  const psd1 = opts.moduleManifestPath.replace(/'/g, "''");
  return String.raw`
$ErrorActionPreference = 'Continue'
$global:MockingbirdFramePrefix = '__M_FRAME__'

try {
    Import-Module '${dll}' -ErrorAction Stop
    Import-Module '${psd1}' -ErrorAction Stop
} catch {
    $err = [PSCustomObject]@{ type = 'stream'; stream = 'error'; data = "Failed to load Mockingbird modules: $($_.Exception.Message)" } | ConvertTo-Json -Compress
    Write-Host "$($global:MockingbirdFramePrefix)$err"
    exit 1
}
# We do NOT Set-Location master: here. PowerShell's NavigationCmdletProvider
# rejects Set-Location to a custom drive root with "/.. outside the base /".
# Instead, the Mockingbird PS module ships a Get-ChildItem function that
# accepts bare /sitecore/... paths and routes them through master: directly.

function Invoke-MockingbirdRun {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $RunId,
        [Parameter(Mandatory)] [bool]   $ApplyMode,
        [Parameter(Mandatory)] [scriptblock] $Body
    )
    $env:MOCKINGBIRD_APPLY = if ($ApplyMode) { '1' } else { '0' }
    $startTicks = [DateTime]::UtcNow.Ticks
    $started = [PSCustomObject]@{ type = 'runStarted'; runId = $RunId } | ConvertTo-Json -Compress
    Write-Host "$($global:MockingbirdFramePrefix)$started"
    $exit = 0
    $aborted = $false
    try {
        & $Body | Out-Default
    } catch [System.Management.Automation.PipelineStoppedException] {
        # Pipeline interrupt (e.g. SIGINT on Linux). On Windows this branch is
        # rarely reached because process.kill('SIGINT') terminates the host
        # before the catch fires; the host translates that into an explicit
        # close. Either way the session manager surfaces a runAborted frame.
        $aborted = $true
    } catch {
        Write-Error $_.Exception.Message
        $exit = 1
    } finally {
        if ($aborted) {
            $abortedFrame = [PSCustomObject]@{ type = 'runAborted'; runId = $RunId } | ConvertTo-Json -Compress
            Write-Host "$($global:MockingbirdFramePrefix)$abortedFrame"
        } else {
            $durationMs = [int](([DateTime]::UtcNow.Ticks - $startTicks) / 10000)
            $complete = [PSCustomObject]@{ type = 'runComplete'; runId = $RunId; exitCode = $exit; durationMs = $durationMs } | ConvertTo-Json -Compress
            Write-Host "$($global:MockingbirdFramePrefix)$complete"
        }
    }
}

# Echo-Test retained from Phase 2 for smoke-testability
function Echo-Test {
    [CmdletBinding()]
    param([Parameter(Mandatory, ValueFromPipeline)] [string] $InputText)
    process { Write-Output $InputText }
}

$ready = [PSCustomObject]@{ type = 'stream'; stream = 'info'; data = 'mockingbird-startup-complete' } | ConvertTo-Json -Compress
Write-Host "$($global:MockingbirdFramePrefix)$ready"
`.trim() + '\n';
}
