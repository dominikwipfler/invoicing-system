param(
  [switch]$SkipRabbitMq,
  [switch]$NoWait
)

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $scriptRoot '.runtime'
$statePath = Join-Path $runtimeDir 'server-state.json'

function Write-Banner {
  Write-Box -Lines @(
    'Invoicing System Start',
    'RabbitMQ + gRPC Service + Payment Worker'
  ) -Color Magenta
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

function Get-ConsoleWidth {
  try {
    $width = $Host.UI.RawUI.WindowSize.Width
    if ($width -lt 60) {
      return 60
    }

    return $width
  }
  catch {
    return 120
  }
}

function Normalize-LineForBox {
  param(
    [string]$Line,
    [int]$MaxInnerWidth
  )

  if ($null -eq $Line) {
    return ''
  }

  $normalized = $Line.Replace("`r", '').Replace("`n", ' ')
  if ($normalized.Length -le $MaxInnerWidth) {
    return $normalized
  }

  if ($MaxInnerWidth -le 3) {
    return $normalized.Substring(0, $MaxInnerWidth)
  }

  return $normalized.Substring(0, $MaxInnerWidth - 3) + '...'
}

function Write-Box {
  param(
    [string[]]$Lines,
    [ConsoleColor]$Color = [ConsoleColor]::White
  )

  if (-not $Lines -or $Lines.Count -eq 0) {
    return
  }

  $maxInnerWidth = (Get-ConsoleWidth) - 4
  if ($maxInnerWidth -lt 40) {
    $maxInnerWidth = 40
  }

  $safeLines = @()
  foreach ($line in $Lines) {
    $safeLines += Normalize-LineForBox -Line $line -MaxInnerWidth $maxInnerWidth
  }

  $innerWidth = ($safeLines | Measure-Object -Property Length -Maximum).Maximum
  if (-not $innerWidth) {
    $innerWidth = 1
  }

  $horizontal = ('═' * ($innerWidth + 2))

  Write-Host ''
  Write-Host ("╔{0}╗" -f $horizontal) -ForegroundColor $Color
  foreach ($line in $safeLines) {
    Write-Host ("║ {0} ║" -f $line.PadRight($innerWidth)) -ForegroundColor $Color
  }
  Write-Host ("╚{0}╝" -f $horizontal) -ForegroundColor $Color
}

function Write-Section {
  param([string]$Title)
  Write-Host ''
  Write-Host $Title -ForegroundColor Cyan
}

function Write-SummaryBox {
  param([hashtable[]]$Lines)

  $labelWidth = ($Lines | ForEach-Object { [string]$_.Label } | Measure-Object -Property Length -Maximum).Maximum
  if (-not $labelWidth) {
    $labelWidth = 1
  }

  $summaryLines = @()
  foreach ($line in $Lines) {
    $summaryLines += ('{0} : {1}' -f ([string]$line.Label).PadRight($labelWidth), [string]$line.Value)
  }

  Write-Box -Lines $summaryLines -Color Green
}

function Save-ServerState {
  param([object[]]$Services)

  if (-not (Test-Path $runtimeDir)) {
    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
  }

  $state = [pscustomobject]@{
    CreatedAt = (Get-Date).ToString('o')
    Services = $Services
  }

  $state | ConvertTo-Json -Depth 6 | Set-Content -Path $statePath -Encoding UTF8
}

function Get-NodeProcessByScript {
  param([string]$RelativePath)

  $normalized = $RelativePath.Replace('/', '\\')
  $escaped = [regex]::Escape($normalized)
  $pattern = $escaped.Replace('\\\\', '[\\\\/]')

  return Get-CimInstance Win32_Process | Where-Object {
    $_.Name -match '^node(\.exe)?$' -and $_.CommandLine -match $pattern
  } | Select-Object -First 1
}

function Start-RabbitMq {
  if ($SkipRabbitMq) {
    Write-Info 'RabbitMQ wurde übersprungen.'
    return [pscustomobject]@{
      Name = 'RabbitMQ'
      Status = 'übersprungen'
      Access = 'http://localhost:15672 (Management UI, guest/guest)'
      Ports = '5672, 15672'
    }
  }

  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker wurde nicht gefunden. RabbitMQ kann nicht gestartet werden.'
  }

  $containerName = 'rabbitmq'
  $containerExists = [bool](docker ps -a --filter "name=^/$containerName$" --format '{{.Names}}' 2>$null)

  if ($containerExists) {
    $state = docker inspect -f '{{.State.Status}}' $containerName 2>$null
    if ($state -ne 'running') {
      Write-Info 'Vorhandenen RabbitMQ-Container starten...'
      docker start $containerName | Out-Host
      $status = 'gestartet'
    }
    else {
      Write-Info 'RabbitMQ läuft bereits.'
      $status = 'bereits aktiv'
    }
  }
  else {
    Write-Info 'RabbitMQ-Container wird erstellt und gestartet...'
    docker run -d --name $containerName -p 5672:5672 -p 15672:15672 rabbitmq:3-management | Out-Host
    $status = 'neu erstellt und gestartet'
  }

  if (-not $NoWait) {
    Write-Info 'Warte auf RabbitMQ-Ports 5672 und 15672...'
    $amqpReady = Test-TcpPort -HostName '127.0.0.1' -Port 5672 -TimeoutSeconds 30
    $uiReady = Test-TcpPort -HostName '127.0.0.1' -Port 15672 -TimeoutSeconds 30

    if ($amqpReady -and $uiReady) {
      Write-Success 'RabbitMQ ist erreichbar.'
    }
    else {
      Write-Warn 'RabbitMQ wurde gestartet, die Ports sind aber noch nicht vollständig bestätigt.'
    }
  }

  return [pscustomobject]@{
    Name = 'RabbitMQ'
    Status = $status
    Access = 'http://localhost:15672 (Management UI, guest/guest)'
    Ports = '5672 (AMQP), 15672 (Management UI)'
  }
}

function Start-NodeService {
  param(
    [string]$Name,
    [string]$RelativePath
  )

  $existing = Get-NodeProcessByScript -RelativePath $RelativePath
  if ($existing) {
    Write-Info "$Name läuft bereits (PID $($existing.ProcessId))."
    return [pscustomobject]@{
      Name = $Name
      Status = 'bereits aktiv'
      ProcessId = [int]$existing.ProcessId
    }
  }

  Write-Info "$Name wird gestartet..."
  $node = (Get-Command node -ErrorAction Stop).Source
  $process = Start-Process -FilePath $node -ArgumentList $RelativePath -WorkingDirectory $scriptRoot -NoNewWindow -PassThru

  Write-Success "$Name läuft (PID $($process.Id))."

  return [pscustomobject]@{
    Name = $Name
    Status = 'gestartet'
    ProcessId = $process.Id
  }
}

function Test-TcpPort {
  param(
    [string]$HostName,
    [int]$Port,
    [int]$TimeoutSeconds = 20
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    try {
      $client = [System.Net.Sockets.TcpClient]::new()
      $async = $client.BeginConnect($HostName, $Port, $null, $null)
      if ($async.AsyncWaitHandle.WaitOne(500) -and $client.Connected) {
        $client.Close()
        return $true
      }
      $client.Close()
    }
    catch {
      if ($client) {
        $client.Close()
      }
    }
  }

  return $false
}

Write-Banner

$services = @()
$runtimeServices = @()

Write-Step '1/3' 'RabbitMQ starten'
$rabbitService = Start-RabbitMq
$services += $rabbitService
$runtimeServices += [ordered]@{
  Name = $rabbitService.Name
  Type = 'docker'
  ContainerName = 'rabbitmq'
  Status = $rabbitService.Status
}

Write-Step '2/3' 'gRPC Service starten'
$grpcService = Start-NodeService -Name 'gRPC Service' -RelativePath 'grpc-service/server.js'
$services += $grpcService
$runtimeServices += [ordered]@{
  Name = $grpcService.Name
  Type = 'node'
  ProcessId = $grpcService.ProcessId
  ScriptPath = (Join-Path $scriptRoot 'grpc-service/server.js')
  Status = $grpcService.Status
}

if (-not $NoWait) {
  $grpcStarted = Test-TcpPort -HostName '127.0.0.1' -Port 50051 -TimeoutSeconds 20
  if (-not $grpcStarted) {
    throw 'gRPC Service konnte nicht erfolgreich gestartet werden (Port 50051 nicht erreichbar).'
  }
}

Write-Step '3/3' 'Payment Worker starten'
$paymentService = Start-NodeService -Name 'Payment Worker' -RelativePath 'payment-system/payment-worker.js'
$services += $paymentService
$runtimeServices += [ordered]@{
  Name = $paymentService.Name
  Type = 'node'
  ProcessId = $paymentService.ProcessId
  ScriptPath = (Join-Path $scriptRoot 'payment-system/payment-worker.js')
  Status = $paymentService.Status
}

if (-not $NoWait) {
  Write-Section 'Zwischenstände'
  $grpcReady = Test-TcpPort -HostName '127.0.0.1' -Port 50051 -TimeoutSeconds 20
  $rabbitReady = $SkipRabbitMq -or (Test-TcpPort -HostName '127.0.0.1' -Port 5672 -TimeoutSeconds 20)

  if ($grpcReady) {
    Write-Success 'gRPC Service ist auf Port 50051 erreichbar.'
  }
  else {
    Write-Warn 'gRPC Service ist noch nicht bestätigt.'
  }

  if ($rabbitReady) {
    Write-Success 'RabbitMQ ist auf Port 5672 erreichbar.'
  }
  elseif (-not $SkipRabbitMq) {
    Write-Warn 'RabbitMQ ist noch nicht bestätigt.'
  }
}
else {
  $grpcReady = $false
  $rabbitReady = $SkipRabbitMq
}

Write-SummaryBox -Lines @(
  @{ Label = 'RabbitMQ'; Value = 'localhost:5672 | http://localhost:15672' },
  @{ Label = 'gRPC Service'; Value = 'localhost:50051'; Color = [ConsoleColor]::Green },
  @{ Label = 'Payment Worker'; Value = 'Queue payment_requests'; Color = [ConsoleColor]::Green }
)

Write-Section 'Gestartete Dienste'
foreach ($service in $services) {
  if ($service.PSObject.Properties.Name -contains 'ProcessId') {
    Write-Host ("- {0}: {1} (PID {2})" -f $service.Name, $service.Status, $service.ProcessId) -ForegroundColor Gray
  }
  else {
    Write-Host ("- {0}: {1}" -f $service.Name, $service.Status) -ForegroundColor Gray
  }
}

Write-Section 'Nächste Schritte'
Write-Host '  1. Rechnungs-Flow testen: node client/invoice-client.js' -ForegroundColor White
Write-Host '  2. Zahlungs-Flow testen: node client/send-payment.js' -ForegroundColor White
Write-Host '  3. Alles stoppen: .\Stop-Server.ps1' -ForegroundColor White

Write-Host ''
Write-Host 'Start abgeschlossen.' -ForegroundColor Green

Save-ServerState -Services $runtimeServices