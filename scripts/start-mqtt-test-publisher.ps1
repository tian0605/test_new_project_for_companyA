$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$pythonExe = 'C:\Users\zhizh\AppData\Local\Programs\Python\Python310\python.exe'

if (-not (Test-Path $pythonExe)) {
  throw 'Python 3.10 was not found at the expected path.'
}

Set-Location (Join-Path $repoRoot 'myems-mqtt')
& $pythonExe .\test_publisher.py