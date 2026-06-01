# Rechnungsverarbeitung - Sprint 1 bis Sprint 4

Digitalisierung der Eingangsrechnungsbearbeitung mit gRPC, Messaging und BPM.

## Bausteine

- **gRPC Service** (Port 50051): Speichert Rechnungsmetadaten
- **RabbitMQ** (Ports 5672, 15672): Message Broker fuer asynchronen Nachrichtenaustausch
- **Payment Worker**: Zahlungssystem, verarbeitet Zahlungsauftraege aus RabbitMQ-Queue
- **Client**: Speichert Rechnungsdaten per gRPC und veranlasst Zahlungen per Messaging
- **Process Mining**: Event-Logging und Analyse fuer Celonis
- **Workflow Engine** (Port 3001): Prozessgesteuerte Anwendung fuer Freigabe, Orchestrierung und Statusverfolgung
- **Camunda 8 BPMN-Prozess**: Digitaler Freigabeprozess mit manuellen und automatischen Schritten

## Voraussetzungen

- Node.js 22.x LTS (oder neuer, z. B. 25.x)
- Docker Desktop (RabbitMQ)
- PowerShell oder Terminal
- Camunda 8 SaaS Account (fuer Sprint 4)

## Architektur-Highlights

- **Idempotent Start/Stop**: Start-Skript startet Dienste nicht doppelt
- **Fehlertoleranz**: Payment Worker reconnectet mit exponentiellem Backoff bei RabbitMQ-Ausfaellen
- **Robustes Shutdown**: Stop-Skript findet und beendet Prozesse auch bei gestoertem State
- **Zuverlaessige Datentypen**: Geldbetraege in Cents (`int64`) statt Float
- **Event Logging**: Vollstaendiges Prozess-Tracing fuer Process Mining
- **BPMN-Prozessorchestrierung**: Ausfuehrbarer Freigabeprozess in Camunda 8 mit Fehlerbehandlung

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

## Sprint 4: Digitaler Freigabeprozess mit Camunda 8

Artefakte unter `sprint4/`:

- `G4_sprint_4.bpmn` - Ausfuehrbarer BPMN-Prozess fuer Camunda 8
- `forms/rechnungserfassung.form` - Formular zur manuellen Rechnungserfassung
- `forms/erp-bestaetigung.form` - Formular zur ERP-Bestaetigung
- `forms/freigabe.form` - Formular fuer Freigabe oder Ablehnung

### Prozessablauf

```
E-Mail erhalten
    → [Manuell] Rechnungsdaten im Camunda-Formular erfassen
    → [Automatisch] Metadaten per gRPC in Sprint-1-Service speichern
    → [Manuell] Rechnung pruefen und validieren
    → [Manuell] Rechnungsdaten im ERP System erfassen
              → https://anhe0003.github.io/this-and-that/ERP_Rechnungserfassung.html
    → [Manuell] Rechnung freigeben oder ablehnen
    → [Automatisch] Zahlungsauftrag via RabbitMQ senden
    → Prozess abgeschlossen
```

### Deployment in Camunda 8 SaaS

1. Camunda Web Modeler oeffnen
2. Neues Projekt anlegen und alle 4 Dateien hochladen (`G4_sprint_4.bpmn` + 3 Formulare)
3. `G4_sprint_4.bpmn` oeffnen → **Deploy & run**
4. Tasklist oeffnen und Tasks nacheinander bearbeiten

### Tasklist URL

```
https://bru-2.tasklist.camunda.io/487e2664-45fe-4a21-9e53-860eddc37e5e
```

### Fehlerbehandlung

- **gRPC nicht erreichbar**: Boundary Error loest Korrektur-Task aus, Daten koennen angepasst und erneut gesendet werden
- **RabbitMQ nicht erreichbar**: Boundary Error fuehrt zu End Event "Zahlung fehlgeschlagen"
- **Rechnung abgelehnt**: Gateway leitet zu End Event "Rechnung abgelehnt"

### Hinweis zu manuellen Schritten

Die Extraktion der Rechnungsdaten und die ERP-Erfassung sind in Sprint 4 bewusst manuell gehalten. Diese Schritte werden in den folgenden Sprints automatisiert:

- **Sprint 5 (RPA)**: Automatische Dateneingabe per UiPath
- **Sprint 6 (AI Agent)**: KI-gestuetzte Extraktion und Verarbeitung

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
- Camunda Formular erscheint nicht in Tasklist: BPMN und alle 3 Formulare zusammen neu deployen
- Prozess haengt bei Service Task: In Operate → Modify instance → Move instance zum naechsten Task
