param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $scriptRoot '.runtime'
$statePath = Join-Path $runtimeDir 'server-state.json'

function Write-Banner {
  Write-Host ''
  Write-Host '+==============================================================+' -ForegroundColor DarkCyan
  Write-Host '|                    Invoicing System Stop                    |' -ForegroundColor DarkCyan
  Write-Host '+==============================================================+' -ForegroundColor DarkCyan
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
  Write-Host "  [OK] $Message" -ForegroundColor Green
}

function Write-Info {
  param([string]$Message)
  Write-Host "  [i] $Message" -ForegroundColor Yellow
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
    return $false
  }

  if ($Force) {
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
    Write-Success "$Label wurde beendet (Force)."
  }
  else {
    Stop-Process -Id $ProcessId -ErrorAction SilentlyContinue
    Write-Success "$Label wurde beendet."
  }

  return $true
}

function Stop-NodeByScriptPattern {
  param(
    [string]$Pattern,
    [string]$Label
  )

  $matches = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -match '^node(\.exe)?$' -and $_.CommandLine -match $Pattern
  }

  if (-not $matches) {
    Write-Warn "$Label ist bereits beendet."
    return
  }

  foreach ($proc in $matches) {
    Stop-NodeProcess -ProcessId ([int]$proc.ProcessId) -Label $Label | Out-Null
  }
}

function Stop-NodeByListeningPort {
  param(
    [int]$Port,
    [string]$Label
  )

  $owningPids = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

  if (-not $owningPids) {
    return $false
  }

  $stoppedAny = $false
  foreach ($ownerPid in $owningPids) {
    $stopped = Stop-NodeProcess -ProcessId ([int]$ownerPid) -Label $Label
    if ($stopped) {
      $stoppedAny = $true
    }
  }

  return $stoppedAny
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
  Stop-NodeByScriptPattern -Pattern 'grpc-service[\\/]server\.js' -Label 'gRPC Service'
  Stop-NodeByListeningPort -Port 50051 -Label 'gRPC Service' | Out-Null

  Write-Step '2/3' 'Payment Worker beenden'
  Stop-NodeByScriptPattern -Pattern 'payment-system[\\/]payment-worker\.js' -Label 'Payment Worker'

  Write-Step '3/3' 'RabbitMQ beenden'
  Stop-RabbitMq
}
else {
  $state = Get-Content $statePath -Raw | ConvertFrom-Json

  Write-Step '1/3' 'gRPC Service beenden'
  $grpcService = $state.Services | Where-Object { $_.Name -eq 'gRPC Service' } | Select-Object -First 1
  if ($grpcService) {
    $stopped = Stop-NodeProcess -ProcessId ([int]$grpcService.ProcessId) -Label 'gRPC Service'
    if (-not $stopped) {
      Stop-NodeByScriptPattern -Pattern 'grpc-service[\\/]server\.js' -Label 'gRPC Service'
      Stop-NodeByListeningPort -Port 50051 -Label 'gRPC Service' | Out-Null
    }
  }
  else {
    Stop-NodeByScriptPattern -Pattern 'grpc-service[\\/]server\.js' -Label 'gRPC Service'
    Stop-NodeByListeningPort -Port 50051 -Label 'gRPC Service' | Out-Null
  }

  Write-Step '2/3' 'Payment Worker beenden'
  $paymentService = $state.Services | Where-Object { $_.Name -eq 'Payment Worker' } | Select-Object -First 1
  if ($paymentService) {
    $stopped = Stop-NodeProcess -ProcessId ([int]$paymentService.ProcessId) -Label 'Payment Worker'
    if (-not $stopped) {
      Stop-NodeByScriptPattern -Pattern 'payment-system[\\/]payment-worker\.js' -Label 'Payment Worker'
    }
  }
  else {
    Stop-NodeByScriptPattern -Pattern 'payment-system[\\/]payment-worker\.js' -Label 'Payment Worker'
  }

  Write-Step '3/3' 'RabbitMQ beenden'
  Stop-RabbitMq

  Remove-Item $statePath -Force -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host 'Alles heruntergefahren.' -ForegroundColor Green