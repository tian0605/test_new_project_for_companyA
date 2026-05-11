param(
    [string]$ReleaseTag = 'v2026.05.08-prod.1',
    [string]$RegistryPrefix = 'ghcr.io/tian0605/myems',
    [string]$OutputDirectory = 'D:\offline-packages',
    [switch]$SkipPull,
    [switch]$IncludeTimestamp
)

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host "[STEP] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Test-CommandExists {
    param([string]$CommandName)
    return $null -ne (Get-Command $CommandName -ErrorAction SilentlyContinue)
}

function Test-DockerDaemonAvailable {
    if (-not (Test-Path '\\.\pipe\docker_engine')) {
        return $false
    }

    $dockerVersionOutput = cmd /c "docker version --format {{.Server.Version}} 2>nul"
    return $LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($dockerVersionOutput)
}

if (-not (Test-CommandExists 'docker')) {
    throw 'Docker CLI not found. Please install and start Docker Desktop first.'
}

if (-not (Test-DockerDaemonAvailable)) {
    throw 'Docker Desktop is not running. Please start Docker Desktop and wait until the engine is ready, then rerun the script.'
}

$RegistryPrefix = $RegistryPrefix.TrimEnd('/')
$resolvedOutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $resolvedOutputDirectory -Force | Out-Null

$imageNames = @(
    'web',
    'admin',
    'api',
    'aggregation',
    'cleaning',
    'normalization'
)

$imageReferences = $imageNames | ForEach-Object { '{0}/{1}:{2}' -f $RegistryPrefix, $_, $ReleaseTag }

$suffix = if ($IncludeTimestamp) {
    '-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
} else {
    ''
}

$tarFileName = "myems-$ReleaseTag-offline-images$suffix.tar"
$tarFilePath = Join-Path $resolvedOutputDirectory $tarFileName
$manifestFileName = "myems-$ReleaseTag-offline-images$suffix.manifest.txt"
$manifestFilePath = Join-Path $resolvedOutputDirectory $manifestFileName

Write-Step "Using release tag: $ReleaseTag"
Write-Step "Using registry prefix: $RegistryPrefix"
Write-Step "Output directory: $resolvedOutputDirectory"
Write-Step "Output tar path: $tarFilePath"

if (-not $SkipPull) {
    Write-Step 'Pulling release images from registry'
    foreach ($imageReference in $imageReferences) {
        Write-Host "  -> docker pull $imageReference"
        docker pull $imageReference
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to pull image: $imageReference`nIf authentication is required, run: docker login ghcr.io"
        }
    }
    Write-Success 'All images pulled successfully'
} else {
    Write-Step 'Skipping pull step and validating local images only'
}

Write-Step 'Validating images exist locally'
foreach ($imageReference in $imageReferences) {
    docker image inspect $imageReference *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Image not found locally: $imageReference"
    }
}
Write-Success 'All required images are present locally'

if (Test-Path $tarFilePath) {
    Write-Step 'Removing existing tar file with the same name'
    Remove-Item -Path $tarFilePath -Force
}

if (Test-Path $manifestFilePath) {
    Write-Step 'Removing existing manifest file with the same name'
    Remove-Item -Path $manifestFilePath -Force
}

Write-Step 'Exporting images to tar archive'
docker save -o $tarFilePath $imageReferences
if ($LASTEXITCODE -ne 0) {
    throw 'docker save failed.'
}

Write-Step 'Writing package manifest'
$manifestLines = @(
    "release_tag=$ReleaseTag",
    "registry_prefix=$RegistryPrefix",
    "output_directory=$resolvedOutputDirectory",
    "tar_file=$tarFileName",
    'images='
) + ($imageReferences | ForEach-Object { "  $_" }) + @(
    '',
    'production_load_command=',
    "  docker load -i $tarFileName"
)

Set-Content -Path $manifestFilePath -Value $manifestLines -Encoding UTF8

$tarFile = Get-Item $tarFilePath
$tarSizeGB = [Math]::Round($tarFile.Length / 1GB, 2)

Write-Success "Offline image tar created: $($tarFile.FullName)"
Write-Success "Package manifest created: $manifestFilePath"
Write-Success "Archive size: $tarSizeGB GB"

Write-Host ''
Write-Host 'Next steps:' -ForegroundColor Yellow
Write-Host '1. Copy the tar file to the production server.'
Write-Host '2. Copy the manifest file and docker-images.env from the GitHub Actions artifact together.'
Write-Host '3. Copy docker-images.env to /home/ubuntu/myems-complete/others/ on the production server.'
Write-Host '4. On the production server run:'
Write-Host "   docker load -i $tarFileName"
Write-Host '5. Then run docker compose up -d --no-build for web, admin, api, cleaning, normalization, aggregation.'
