param(
    [string]$Version = "1.0.0"
)

$ErrorActionPreference = "Stop"
$rootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$artifactsDir = Join-Path $rootDir "artifacts"
$storeNodeOut = Join-Path $artifactsDir "store-node"
$desktopOut = Join-Path $artifactsDir "desktop"
$outputDir = Join-Path $rootDir "installer\output"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   PDV GAMA - Gerador de Pacotes e Instaladores v$Version   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Limpeza de artefatos anteriores
if (Test-Path $artifactsDir) { Remove-Item $artifactsDir -Recurse -Force }
New-Item -ItemType Directory -Path $storeNodeOut -Force | Out-Null
New-Item -ItemType Directory -Path $desktopOut -Force | Out-Null
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

$env:PDV_VERSION = $Version

# 2. Publicação do StoreNode (Windows Service - Self Contained Single File)
Write-Host "[1/4] Publicando Pdv.StoreNode (win-x64 self-contained)..." -ForegroundColor Yellow
dotnet publish "$rootDir\src\Pdv.StoreNode\Pdv.StoreNode.csproj" `
    -c Release `
    -r win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -o $storeNodeOut

# 3. Publicação do Desktop (WPF - Self Contained Single File)
Write-Host "[2/4] Publicando Pdv.Desktop (win-x64 self-contained)..." -ForegroundColor Yellow
dotnet publish "$rootDir\src\Pdv.Desktop\Pdv.Desktop.csproj" `
    -c Release `
    -r win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -o $desktopOut

# 4. Compilação dos Instaladores com Inno Setup
$isccPath = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $isccPath)) {
    Write-Warning "ISCC.exe não encontrado em $isccPath. Os artefatos foram publicados em '$artifactsDir', mas o instalador .exe requer o Inno Setup 6."
    exit 0
}

Write-Host "[3/4] Compilando Instaladores com Inno Setup..." -ForegroundColor Yellow

$installers = @("matriz.iss", "filial.iss", "pdv-caixa.iss", "etiquetas.iss")

foreach ($iss in $installers) {
    $scriptPath = Join-Path $rootDir "installer\$iss"
    Write-Host " -> Gerando instalador para: $iss" -ForegroundColor Green
    & $isccPath "/Q" $scriptPath
    if ($LASTEXITCODE -ne 0) {
        throw "Erro ao compilar $iss com Inno Setup."
    }
}

Write-Host "[4/4] Instaladores gerados com sucesso!" -ForegroundColor Cyan
Get-ChildItem -Path $outputDir -Filter "*.exe" | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
