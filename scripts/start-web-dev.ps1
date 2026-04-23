$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $repoRoot 'myems-web')
npm start