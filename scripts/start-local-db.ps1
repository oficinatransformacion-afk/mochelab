$pgRoot = Join-Path $env:LOCALAPPDATA "Mochelab\PostgreSQL17\pgsql"
$dataDir = Join-Path $env:LOCALAPPDATA "Mochelab\PostgreSQL17\data"
$logFile = Join-Path $env:LOCALAPPDATA "Mochelab\PostgreSQL17\postgresql.log"
$pgCtl = Join-Path $pgRoot "bin\pg_ctl.exe"

if (-not (Test-Path -LiteralPath $pgCtl)) {
  throw "PostgreSQL local no está instalado en $pgRoot"
}

& $pgCtl -D $dataDir status *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Output "PostgreSQL local ya está activo en 127.0.0.1:5432."
  exit 0
}

& $pgCtl -D $dataDir -l $logFile -o '-p 5432 -h 127.0.0.1' -w start
