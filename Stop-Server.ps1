param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $scriptRoot '.runtime'
$statePath = Join-Path $runtimeDir 'server-state.json'

function Write-Banner {
  Write-Host ''
  Write-Host '╔══════════════════════════════════════════════════════════════╗' -ForegroundColor DarkCyan
  Write-Host '║                    Invoicing System Stop                    ║' -ForegroundColor DarkCyan
  Write-Host '╚══════════════════════════════════════════════════════════════╝' -ForegroundColor DarkCyan
}

function Write-Step {
  param(
    [string]$Step,
    [string]$Description
  )

  Write-Host ''
  Write-Host "[$Step]" -ForegroundColor Cyan -NoNewline
  Write-Host " $Description" -ForegroundColor White
}

function Write-Success {
  param([string]$Message)
  Write-Host "  ✓ $Message" -ForegroundColor Green
}

function Write-Info {
  param([string]$Message)
  Write-Host "  ℹ $Message" -ForegroundColor Yellow
}

function Write-Warn {
  param([string]$Message)
  Write-Host "  ! $Message" -ForegroundColor DarkYellow
}

function Stop-NodeProcess {
  param(
    [int]$ProcessId,
    [string]$Label
  )

  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $process) {
    Write-Warn "$Label ist bereits beendet."
    return
  }

  if ($Force) {
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
    Write-Success "$Label wurde beendet (Force)."
  }
  else {
    Stop-Process -Id $ProcessId -ErrorAction SilentlyContinue
    Write-Success "$Label wurde beendet."
  }
}

function Stop-RabbitMq {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Warn 'Docker wurde nicht gefunden. RabbitMQ konnte nicht gestoppt werden.'
    return
  }

  $containerName = 'rabbitmq'
  $containerExists = [bool](docker ps -a --filter "name=^/$containerName$" --format '{{.Names}}' 2>$null)

  if (-not $containerExists) {
    Write-Warn 'RabbitMQ-Container wurde nicht gefunden.'
    return
  }

  $state = docker inspect -f '{{.State.Status}}' $containerName 2>$null
  if ($state -eq 'running') {
    docker stop $containerName | Out-Host
    Write-Success 'RabbitMQ-Container wurde gestoppt.'
  }
  else {
    Write-Warn 'RabbitMQ-Container war bereits gestoppt.'
  }
}

Write-Banner

if (-not (Test-Path $statePath)) {
  Write-Warn 'Keine Laufzeitdatei gefunden. Versuche, die bekannten Prozesse direkt zu beenden.'
  Write-Step '1/3' 'gRPC Service beenden'
  Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'node.exe' -and $_.CommandLine -match 'grpc-service\\server\.js'
  } | ForEach-Object {
    Stop-NodeProcess -ProcessId $_.ProcessId -Label 'gRPC Service'
  }

  Write-Step '2/3' 'Payment Worker beenden'
  Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'node.exe' -and $_.CommandLine -match 'payment-system\\payment-worker\.js'
  } | ForEach-Object {
    Stop-NodeProcess -ProcessId $_.ProcessId -Label 'Payment Worker'
  }

  Write-Step '3/3' 'RabbitMQ beenden'
  Stop-RabbitMq
}
else {
  $state = Get-Content $statePath -Raw | ConvertFrom-Json

  Write-Step '1/3' 'gRPC Service beenden'
  $grpcService = $state.Services | Where-Object { $_.Name -eq 'gRPC Service' } | Select-Object -First 1
  if ($grpcService) {
    Stop-NodeProcess -ProcessId [int]$grpcService.ProcessId -Label 'gRPC Service'
  }
  else {
    Write-Warn 'gRPC Service wurde in der Laufzeitdatei nicht gefunden.'
  }

  Write-Step '2/3' 'Payment Worker beenden'
  $paymentService = $state.Services | Where-Object { $_.Name -eq 'Payment Worker' } | Select-Object -First 1
  if ($paymentService) {
    Stop-NodeProcess -ProcessId [int]$paymentService.ProcessId -Label 'Payment Worker'
  }
  else {
    Write-Warn 'Payment Worker wurde in der Laufzeitdatei nicht gefunden.'
  }

  Write-Step '3/3' 'RabbitMQ beenden'
  Stop-RabbitMq

  Remove-Item $statePath -Force -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host 'Alles heruntergefahren.' -ForegroundColor Green