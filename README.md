# Rechnungsverarbeitung - Sprint 1 bis Sprint 3

Digitalisierung der Eingangsrechnungsbearbeitung mit gRPC und Messaging.

## Bausteine

- **gRPC Service** (Port 50051): Speichert Rechnungsmetadaten
- **RabbitMQ** (Ports 5672, 15672): Message Broker fuer asynchronen Nachrichtenaustausch
- **Payment Worker**: Zahlungssystem, verarbeitet Zahlungsauftraege aus RabbitMQ-Queue
- **Client**: Speichert Rechnungsdaten per gRPC und veranlasst Zahlungen per Messaging
- **Process Mining**: Event-Logging und Analyse fuer Celonis
- **Workflow Engine** (Port 3001): Prozessgesteuerte Anwendung fuer Freigabe, Orchestrierung und Statusverfolgung

## Voraussetzungen

- Node.js 22.x LTS (oder neuer, z. B. 25.x)
- Docker Desktop (RabbitMQ)
- PowerShell oder Terminal

## Architektur-Highlights

- **Idempotent Start/Stop**: Start-Skript startet Dienste nicht doppelt
- **Fehlertoleranz**: Payment Worker reconnectet mit exponentiellem Backoff bei RabbitMQ-Ausfaellen
- **Robustes Shutdown**: Stop-Skript findet und beendet Prozesse auch bei gestoertem State
- **Zuverlaessige Datentypen**: Geldbetraege in Cents (`int64`) statt Float
- **Event Logging**: Vollstaendiges Prozess-Tracing fuer Process Mining

## Startreihenfolge

### Ein-Kommando-Start

```powershell
.\Start-Server.ps1
```

Oder via npm:

```powershell
npm run start:servers
```

Das Skript startet RabbitMQ, den gRPC-Service und den Payment Worker und zeigt Erreichbarkeit und Ports an.

Zum Stoppen:

```powershell
.\Stop-Server.ps1
```

### 1. Message Broker (RabbitMQ)

```powershell
docker start rabbitmq
# oder falls noch nicht vorhanden:
# docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```

Pruefen: [http://localhost:15672](http://localhost:15672) (`guest/guest`)

### 2. gRPC Service starten

```powershell
node grpc-service/server.js
```

Port: `50051`

### 3. Payment Worker starten

```powershell
node payment-system/payment-worker.js
```

Der Worker wartet auf Nachrichten in Queue `payment_requests`.

### 4. Tests ausfuehren

```powershell
# Test 1: Rechnungsmetadaten speichern/abrufen
node client/invoice-client.js

# Test 2: Zahlungsauftrag senden
node client/send-payment.js
```

### 5. Integrationschecks (Happy Path)

```powershell
npm run check:grpc
npm run check:messaging
npm run check:integration
```

### 6. Workflow Engine starten (Sprint 3)

```powershell
npm run start:workflow
```

In einer zweiten Konsole:

```powershell
npm run check:workflow
```

Workflow-Endpunkte:

- `POST /workflows/start`
- `POST /workflows/:workflowId/approve`
- `GET /workflows/:workflowId`
- `GET /workflows`

## Process Mining mit Celonis

### Event-Log generieren

```powershell
npm run simulate:process
```

Erzeugt: `event-log.csv` mit 50 Rechnungsfaellen und 4 Prozessvarianten.

### Event-Logs analysieren

```powershell
npm run analyze:events
```

Erzeugt: `consolidated-event-log.csv` fuer den Celonis-Import.

### Celonis Import und Analyse

1. Celonis-Projekt erstellen.
1. Datei `consolidated-event-log.csv` hochladen.
1. Spalten mappen:
   - Case ID: `case_id`
   - Activity: `activity`
   - Timestamp: `timestamp`
   - Resource: `resource`
1. Process Explorer erstellen und Varianten/Bottlenecks analysieren.

### Prozess-Varianten im System

- **Variante A (60%)**: Happy Path - Rechnung erfolgreich verarbeitet
- **Variante B (20%)**: Payment Retry - Zahlung fehlgeschlagen und wiederholt
- **Variante C (10%)**: Duplicate Invoice - Doppelte Rechnung erkannt und abgewiesen
- **Variante D (10%)**: Invoice Not Found - Rechnung nicht gefunden

### Moegliche Bottlenecks

- Wartezeit zwischen Rechnungsabruf und Zahlungsinitiierung
- Payment-Processing-Dauer bei Retry-Faellen
- Duplicate-Detection-Overhead

## Sprint 3: Soll-Prozess und Zielarchitektur

Artefakte unter `docs/sprint3/`:

- `optimierungspotenziale.md`
- `sollprozess.bpmn`
- `zielarchitektur.md`

Neue technische Bausteine:

- `workflow-engine/server.js`
- `workflow-engine/event-logger.js`
- `client/workflow-client.js`

Der Payment Worker sendet zusaetzlich Status-Events in Queue `payment_status_updates`, damit die Workflow-Engine den Prozesszustand automatisch aktualisiert.

## Erwartete Ausgaben

### gRPC Service

- `gRPC Server laeuft auf Port 50051`
- `Rechnung gespeichert: ...`

### Payment Worker

- `Payment Worker laeuft und wartet auf Nachrichten...`
- Initiale Handshake-Fehler koennen beim Start auftreten und werden durch Retry abgefangen.
- `Zahlung verarbeitet fuer Rechnung ...`

### Client

- gRPC: `Speichern erfolgreich`, `Rechnung geladen`
- Messaging: `Zahlungsauftrag gesendet`

## Troubleshooting

- `EADDRINUSE 127.0.0.1:50051`: `.\Stop-Server.ps1` ausfuehren, dann neu starten
- Mehrere Payment-Retry-Fehler beim Boot: normal waehrend RabbitMQ-Verbindungsaufbau
- gRPC Parse-Fehler bei alten Clients: `.\Stop-Server.ps1` fuer sauberes Shutdown ausfuehren
