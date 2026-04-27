$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$pythonExe = Join-Path $repoRoot '.venv\Scripts\python.exe'
$waitressExe = Join-Path $repoRoot '.venv\Scripts\waitress-serve.exe'

if (-not (Test-Path $pythonExe)) {
  throw 'Workspace Python environment was not found at .venv\Scripts\python.exe.'
}

if (-not (Test-Path $waitressExe)) {
  throw 'Waitress was not found at .venv\Scripts\waitress-serve.exe.'
}

Set-Location (Join-Path $repoRoot 'myems-api')
& $waitressExe --listen=0.0.0.0:8000 app:api