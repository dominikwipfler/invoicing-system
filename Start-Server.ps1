param(
  [switch]$SkipRabbitMq,
  [switch]$NoWait
)

# Hinweis: Camunda Worker wird immer gestartet (früher nur mit -IncludeCamundaWorker)

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $scriptRoot '.runtime'
$statePath = Join-Path $runtimeDir 'server-state.json'

# Cockpit Browser Profile (isolated, eigener Prozessbaum)
$cockpitProfile = Join-Path $env:LOCALAPPDATA 'invoicing-cockpit-profile'
$pidFilePath = Join-Path $runtimeDir 'frontend-browser.pid'

function Write-Banner {
  $bannerLines = @(
    'Invoicing System Start (Sprints 1–6)',
    'RabbitMQ + gRPC + Payment Worker + Camunda + AI-Agent'
  )
  Write-Box -Lines $bannerLines -Color Magenta
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

function Format-LineForBox {
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
    $safeLines += Format-LineForBox -Line $line -MaxInnerWidth $maxInnerWidth
  }

  $innerWidth = ($safeLines | Measure-Object -Property Length -Maximum).Maximum
  if (-not $innerWidth) {
    $innerWidth = 1
  }

  $horizontal = ('=' * ($innerWidth + 2))

  Write-Host ''
  Write-Host ("+{0}+" -f $horizontal) -ForegroundColor $Color
  foreach ($line in $safeLines) {
    Write-Host ("| {0} |" -f $line.PadRight($innerWidth)) -ForegroundColor $Color
  }
  Write-Host ("+{0}+" -f $horizontal) -ForegroundColor $Color
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
    $uiReady   = Test-TcpPort -HostName '127.0.0.1' -Port 15672 -TimeoutSeconds 30

    if ($amqpReady -and $uiReady) {
      # Port offen reicht nicht — AMQP-Broker braucht noch etwas.
      # Management-API Health-Check: erst OK wenn Broker wirklich bereit ist.
      Write-Info 'Warte auf RabbitMQ Management API (AMQP-Broker bereit)...'
      $brokerReady = $false
      $deadline    = (Get-Date).AddSeconds(20)
      while ((Get-Date) -lt $deadline -and -not $brokerReady) {
        try {
          $resp = Invoke-RestMethod `
            -Uri 'http://localhost:15672/api/healthchecks/node' `
            -Credential ([pscredential]::new('guest', (ConvertTo-SecureString 'guest' -AsPlainText -Force))) `
            -Method Get `
            -ErrorAction Stop
          if ($resp.status -eq 'ok') { $brokerReady = $true }
        } catch { }
        if (-not $brokerReady) { Start-Sleep -Milliseconds 500 }
      }

      if ($brokerReady) {
        Write-Success 'RabbitMQ AMQP-Broker ist vollstaendig bereit.'
      } else {
        Write-Warn 'RabbitMQ Ports sind offen, Broker-Bestaetigung ausstehend (Worker reconnectet automatisch).'
      }
    }
    else {
      Write-Warn 'RabbitMQ wurde gestartet, die Ports sind aber noch nicht vollstaendig bestaetigt.'
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

# Lade AI-Provider aus .env
$envPath = Join-Path $scriptRoot '.env'
$aiProvider = 'n8n'  # Standard
$aiMockMode = $false

if (Test-Path $envPath) {
  $envContent = Get-Content $envPath -Raw
  if ($envContent -match 'AI_PROVIDER=(\S+)') {
    $aiProvider = $matches[1].Trim()
  }
  if ($envContent -match 'AI_MOCK_MODE=(true|false)') {
    $aiMockMode = $matches[1] -eq 'true'
  }
}

Write-Info "AI-Provider: $aiProvider $(if ($aiMockMode) { '(MOCK-Modus)' } else { '(echte API)' })"

$services = @()
$runtimeServices = @()

Write-Step '1/4' 'RabbitMQ starten'
$rabbitService = Start-RabbitMq
$services += $rabbitService
$runtimeServices += [ordered]@{
  Name = $rabbitService.Name
  Type = 'docker'
  ContainerName = 'rabbitmq'
  Status = $rabbitService.Status
}

Write-Step '2/4' 'gRPC Service starten'
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

Write-Step '3/4' 'Payment Worker starten'
$paymentService = Start-NodeService -Name 'Payment Worker' -RelativePath 'payment-system/payment-worker.js'
$services += $paymentService
$runtimeServices += [ordered]@{
  Name = $paymentService.Name
  Type = 'node'
  ProcessId = $paymentService.ProcessId
  ScriptPath = (Join-Path $scriptRoot 'payment-system/payment-worker.js')
  Status = $paymentService.Status
}

Write-Step '4/4' 'Camunda Worker starten (eigenes Fenster)'
$existingCamunda = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -match '^node(\.exe)?$' -and $_.CommandLine -match 'camunda[\\/]camunda-worker\.js'
} | Select-Object -First 1

if ($existingCamunda) {
  Write-Info "Camunda Worker laeuft bereits (PID $($existingCamunda.ProcessId))."
  $services += [pscustomobject]@{ Name = 'Camunda Worker'; Status = 'bereits aktiv'; ProcessId = [int]$existingCamunda.ProcessId }
} else {
  Write-Info 'Camunda Worker wird in neuem Fenster gestartet...'
  Start-Process pwsh -ArgumentList '-NoExit', '-Command', "cd '$scriptRoot'; node camunda/camunda-worker.js" -WindowStyle Normal
  Write-Success 'Camunda Worker gestartet (separates Fenster).'
  $services += [pscustomobject]@{ Name = 'Camunda Worker'; Status = 'gestartet (separates Fenster)' }
}

Write-Step '5/5' 'Frontend-Cockpit starten'
$frontendDir = Join-Path $scriptRoot 'frontend'
$pidFilePath = Join-Path $scriptRoot '.runtime' 'frontend-browser.pid'

# Prüfe Node-Modul und installiere bei Bedarf
$nodeModulesPath = Join-Path $frontendDir 'node_modules'
if (-not (Test-Path $nodeModulesPath)) {
  Write-Info 'Frontend-Abhängigkeiten fehlen, installiere npm packages...'
  try {
    Push-Location $frontendDir
    npm install 2>$null | Out-Host
    Pop-Location
    Write-Success 'Frontend npm install abgeschlossen.'
  } catch {
    Write-Warn 'npm install fehlgeschlagen, versuche trotzdem zu starten.'
    Pop-Location
  }
}

# Starte Frontend-Server
$existingFrontend = Get-NodeProcessByScript -RelativePath 'frontend/server.js'
if ($existingFrontend) {
  Write-Info "Frontend-Cockpit laeuft bereits (PID $($existingFrontend.ProcessId))."
  $services += [pscustomobject]@{ Name = 'Frontend-Cockpit'; Status = 'bereits aktiv'; ProcessId = [int]$existingFrontend.ProcessId }
} else {
  Write-Info 'Frontend-Cockpit wird gestartet...'
  $node = (Get-Command node -ErrorAction Stop).Source
  $frontendProcess = Start-Process -FilePath $node -ArgumentList 'frontend/server.js' -WorkingDirectory $scriptRoot -NoNewWindow -PassThru
  Write-Success "Frontend-Cockpit gestartet (PID $($frontendProcess.Id))."

  # Warte auf Port 4000 mit HTTP-Health-Check
  if (-not $NoWait) {
    Write-Info 'Warte auf Frontend-Cockpit auf Port 4000...'
    $frontendReady = $false
    $deadline = (Get-Date).AddSeconds(20)

    while ((Get-Date) -lt $deadline -and -not $frontendReady) {
      try {
        $response = Invoke-WebRequest -Uri 'http://localhost:4000' -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
          $frontendReady = $true
        }
      } catch {
        # Server noch nicht bereit, versuche in 500ms nochmal
        Start-Sleep -Milliseconds 500
      }
    }

    if ($frontendReady) {
      Write-Success 'Frontend-Cockpit ist auf Port 4000 erreichbar.'

      # Öffne Browser-Fenster mit isoliertem Profil (verhindert Einmischung mit anderen Edge-Fenstern/WebView2-Apps)
      Write-Info 'Öffne http://localhost:4000 in isoliertem Cockpit-Fenster...'
      try {
        # Versuche Edge explizit
        $edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
        if (-not (Test-Path $edgePath)) {
          $edgePath = 'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
        }

        if (Test-Path $edgePath) {
          $browserProc = Start-Process -FilePath $edgePath -ArgumentList @(
            '--new-window',
            "--user-data-dir=$cockpitProfile",
            '--no-first-run',
            '--no-default-browser-check',
            'http://localhost:4000'
          ) -PassThru

          if ($browserProc) {
            Write-Success "Cockpit-Fenster geöffnet (Profil: $cockpitProfile)."
          } else {
            Write-Warn 'Cockpit-Fenster konnte nicht gestartet werden.'
          }
        } else {
          Write-Warn 'Microsoft Edge nicht gefunden, nutze Standard-Browser...'
          Start-Process 'http://localhost:4000'
          Write-Success 'Browser-Fenster geöffnet (Standard-Browser).'
        }
      } catch {
        Write-Warn "Fehler beim Öffnen des Cockpit-Fensters: $($_.Exception.Message)"
        Start-Process 'http://localhost:4000'
      }
    } else {
      Write-Warn 'Frontend-Cockpit ist noch nicht bestätigt (Port 4000 nicht erreichbar nach 20 Sekunden).'
    }
  }

  $services += [pscustomobject]@{ Name = 'Frontend-Cockpit'; Status = 'gestartet'; ProcessId = $frontendProcess.Id }
  $runtimeServices += [ordered]@{
    Name = 'Frontend-Cockpit'
    Type = 'node'
    ProcessId = $frontendProcess.Id
    ScriptPath = (Join-Path $scriptRoot 'frontend/server.js')
    Status = 'gestartet'
  }
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

$summaryLines = @(
  @{ Label = 'RabbitMQ';            Value = 'localhost:5672 | http://localhost:15672' },
  @{ Label = 'gRPC Service';        Value = 'localhost:50051' },
  @{ Label = 'Payment Worker';      Value = 'Queue payment_requests' },
  @{ Label = 'Camunda Worker';      Value = 'Verbunden mit Camunda SaaS (separates Fenster)' },
  @{ Label = 'Frontend-Cockpit';    Value = 'http://localhost:4000' },
  @{ Label = 'AI-Provider';         Value = "$aiProvider $(if ($aiMockMode) { '(MOCK)' } else { '' })" }
)
Write-SummaryBox -Lines $summaryLines

Write-Section 'Gestartete Dienste'
foreach ($service in $services) {
  if ($service.PSObject.Properties.Name -contains 'ProcessId') {
    Write-Host ("- {0}: {1} (PID {2})" -f $service.Name, $service.Status, $service.ProcessId) -ForegroundColor Gray
  }
  else {
    Write-Host ("- {0}: {1}" -f $service.Name, $service.Status) -ForegroundColor Gray
  }
}

Write-Section 'Naechste Schritte'
Write-Host '  1. Frontend-Cockpit:  http://localhost:4000' -ForegroundColor Cyan
Write-Host '  2. Prozess starten:   npm run trigger:email' -ForegroundColor White
Write-Host '  3. Tasklist oeffnen:  https://bru-2.tasklist.camunda.io/487e2664-45fe-4a21-9e53-860eddc37e5e' -ForegroundColor White
Write-Host '  4. Alles stoppen:     Cockpit "Herunterfahren" — oder STRG+C hier' -ForegroundColor White

Write-Host ''
Write-Host 'Start abgeschlossen.' -ForegroundColor Green

Save-ServerState -Services $runtimeServices

if (-not $NoWait) {
  Write-Host ''
  Write-Host 'System laeuft. Im Cockpit "Herunterfahren" klicken oder hier STRG+C druecken.' -ForegroundColor Cyan

  $flagFile = Join-Path $scriptRoot '.runtime\shutdown-requested'
  while (-not (Test-Path $flagFile)) {
    Start-Sleep -Seconds 1
  }
  Remove-Item $flagFile -ErrorAction SilentlyContinue

  Write-Host ''
  Write-Host 'Shutdown angefordert — fahre System herunter...' -ForegroundColor Yellow
  & "$scriptRoot\Stop-Server.ps1"
}