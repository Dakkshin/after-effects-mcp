# Redeploy cycle for the after-effects-mcp bridge: build, copy the ScriptUI panel
# into AE's own Scripts folder (needs admin — that's why this runs elevated via the
# "AfterEffectsMCPRedeploy" scheduled task), and kill any stale node.exe process so
# the desktop app's next tool call respawns a fresh one with the rebuilt code.
$ErrorActionPreference = "Stop"
$proj = "D:\Code\after-effects-mcp"
$dest = "C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\Scripts\ScriptUI Panels\mcp-bridge-auto.jsx"
$log  = "$proj\redeploy.log"

function Log($msg) { "$(Get-Date -Format o)  $msg" | Out-File -FilePath $log -Append -Encoding utf8 }

try {
    Log "Redeploy starting"
    Log "PATH: $env:Path"

    # S4U logon doesn't reliably resolve npm.cmd off PATH the way an interactive
    # shell does (same category of quirk as the LocalSystem env var issue for
    # Mission Control) — resolve node/npm explicitly instead of trusting PATH.
    $npmCmd = "C:\Program Files\nodejs\npm.cmd"
    if (-not (Test-Path $npmCmd)) {
        $npmCmd = (Get-ChildItem "$env:APPDATA\nvm" -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending | Select-Object -First 1 |
            ForEach-Object { Join-Path $_.FullName "npm.cmd" })
    }
    Log "Using npm at: $npmCmd"

    # A native command's stderr, merged via 2>&1 under $ErrorActionPreference =
    # "Stop", gets wrapped into a terminating NativeCommandError per line (a
    # PowerShell 5.1 quirk) — esbuild's own benign stderr output was tripping
    # this and aborting the script before the build ever really failed. Relax
    # to Continue just for this call and rely on $LASTEXITCODE for the real
    # success/failure signal instead.
    Push-Location $proj
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $buildOutput = & $npmCmd run build 2>&1
    $ErrorActionPreference = $prevEAP
    Pop-Location
    $buildOutput | ForEach-Object { Log $_ }
    if ($LASTEXITCODE -ne 0) { throw "npm run build exited with code $LASTEXITCODE" }
    Log "Build finished (exit $LASTEXITCODE)"

    Copy-Item -Path "$proj\build\scripts\mcp-bridge-auto.jsx" -Destination $dest -Force
    Log "Bridge script copied to AE Scripts folder"

    $killed = 0
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
        Where-Object { $_.CommandLine -like '*after-effects-mcp*' } |
        ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            $killed++
            Log "Killed stale node process $($_.ProcessId)"
        }
    Log "Killed $killed stale node process(es)"

    Log "Redeploy finished"
} catch {
    Log "ERROR: $($_.Exception.GetType().FullName): $($_.Exception.Message)"
    Log "STACK: $($_.ScriptStackTrace)"
    throw
}
