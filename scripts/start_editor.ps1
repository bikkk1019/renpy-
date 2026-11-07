$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$entry = Join-Path $projectRoot 'renpy_performance_maker.html'
if (-not (Test-Path -LiteralPath $entry)) { throw 'Editor entry file is missing. Extract the entire ZIP first.' }
$candidates = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe')
)
$edgePath = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $edgePath) { throw 'Microsoft Edge is required. Please install it, then try again.' }
$entryUri = ([Uri]$entry).AbsoluteUri
# This is the interactive editor window explicitly opened by the user.
Start-Process -FilePath $edgePath -ArgumentList @('--app="' + $entryUri + '"', '--window-size=1500,950')
