param(
    [string]$AppVersion = "0.1.0"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$TargetDirectory = Join-Path $ProjectRoot "target"
$OutputDirectory = Join-Path $ProjectRoot "dist"
$MainJar = Join-Path $TargetDirectory "pdv-gama.jar"

if (-not $env:JAVA_HOME) {
    throw "JAVA_HOME não está configurado."
}

$JPackage = Join-Path $env:JAVA_HOME "bin\jpackage.exe"
if (-not (Test-Path $JPackage)) {
    throw "jpackage não encontrado em $JPackage"
}

if (-not (Test-Path $MainJar)) {
    throw "Arquivo $MainJar não encontrado. Execute 'mvn clean package' antes de gerar o instalador."
}

if (Test-Path $OutputDirectory) {
    Remove-Item $OutputDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path $OutputDirectory | Out-Null

& $JPackage `
    --type exe `
    --name "PDV Gama" `
    --app-version $AppVersion `
    --vendor "Gama Tecnologia" `
    --description "Sistema de ponto de venda com estoque, compras, caixa e comprovantes não fiscais" `
    --input $TargetDirectory `
    --main-jar "pdv-gama.jar" `
    --main-class "br.com.gama.pdv.Launcher" `
    --dest $OutputDirectory `
    --install-dir "PDV Gama" `
    --win-menu `
    --win-menu-group "PDV Gama" `
    --win-shortcut `
    --win-dir-chooser `
    --win-per-user-install `
    --java-options "-Dfile.encoding=UTF-8" `
    --add-modules "java.base,java.desktop,java.sql,java.logging,java.naming,java.management"

if ($LASTEXITCODE -ne 0) {
    throw "Falha ao gerar o instalador com jpackage."
}

Write-Host "Instalador criado em $OutputDirectory" -ForegroundColor Green
