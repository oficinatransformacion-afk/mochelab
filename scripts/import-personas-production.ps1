[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $SourceFile,
  [Parameter(Mandatory = $true)] [string] $PgDumpPath,
  [Parameter(Mandatory = $true)] [string] $BackupDirectory,
  [switch] $ConfirmProduction
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmProduction) { throw "BLOQUEADO: ejecute con -ConfirmProduction." }
if ([string]::IsNullOrWhiteSpace($env:MOCHELAB_PROD_DATABASE_URL)) { throw "BLOQUEADO: falta MOCHELAB_PROD_DATABASE_URL." }
if (-not (Test-Path -LiteralPath $SourceFile)) { throw "No existe el Excel de entrada." }
if (-not (Test-Path -LiteralPath $PgDumpPath)) { throw "No existe pg_dump.exe." }

$uri = [uri]$env:MOCHELAB_PROD_DATABASE_URL
if ($uri.AbsolutePath.Trim('/') -ne "mochelab_prod") { throw "BLOQUEADO: la URI no apunta a mochelab_prod." }
$version = & $PgDumpPath --version
if ($LASTEXITCODE -ne 0 -or $version -notmatch "PostgreSQL\) 18") { throw "BLOQUEADO: se requiere pg_dump 18.x compatible con el servidor productivo." }

New-Item -ItemType Directory -Force -Path $BackupDirectory | Out-Null
$backup = Join-Path $BackupDirectory ("mochelab_prod_pre_personas_{0}.dump" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
& $PgDumpPath --format=custom --file=$backup $env:MOCHELAB_PROD_DATABASE_URL
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $backup) -or (Get-Item -LiteralPath $backup).Length -eq 0) { throw "BLOQUEADO: el respaldo falló o está vacío." }

$pgRestorePath = Join-Path (Split-Path -Parent $PgDumpPath) "pg_restore.exe"
if (-not (Test-Path -LiteralPath $pgRestorePath)) { throw "BLOQUEADO: falta pg_restore.exe junto a pg_dump.exe." }
& $pgRestorePath --list $backup | Select-Object -First 1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "BLOQUEADO: no se pudo verificar el respaldo." }

$env:MOCHELAB_PRODUCTION_WRITE_CONFIRMATION = "MOCHELAB_PROD"
pnpm --filter @mochelab/api db:import:persons $SourceFile --apply --confirm-production "--backup-file=$backup"
if ($LASTEXITCODE -ne 0) { throw "La carga falló; conserva el respaldo: $backup" }

Write-Host "Carga finalizada. Respaldo verificado: $backup"
