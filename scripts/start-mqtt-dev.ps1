$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$pythonExe = Join-Path $repoRoot '.venv\Scripts\python.exe'

if (-not (Test-Path $pythonExe)) {
  throw 'Workspace Python environment was not found at .venv\Scripts\python.exe.'
}

Set-Location (Join-Path $repoRoot 'myems-mqtt')
& $pythonExe .\main.py