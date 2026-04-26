# Sprint 3 Erklaerungsdokumentation

Diese Datei erklaert Sprint 3 so, dass du ihn praesentieren und verteidigen kannst.
Grundlage sind die Sprint-3-Commits:

- `04bd5f0`: `feat(workflow): Sprint-3-Orchestrierung mit Workflow-Engine und Payment-Status-Rueckkanal`
- `94ae02e`: `docs(sprint3): Architektur, BPMN-Sollprozess und Optimierungspotenziale dokumentiert`
- `93ca28e`: `fix(scripts): Stop-Server.ps1 Prozesssuche robust umgebaut, Event-Logs vom Testlauf aktualisiert`

## 1. Projektuebersicht Sprint 3

### Was wurde erreicht?

In Sprint 3 wurde aus einer reinen technischen Verarbeitung ein **gesteuerter Fachprozess** gemacht.
Vorher liefen Speichern, Zahlung und Logging eher als lose Kette. Jetzt gibt es eine zentrale Workflow-Engine, die den Ablauf steuert.

Kurz gesagt:

- Der Prozess hat jetzt klare Zustaende.
- Vor der Zahlung gibt es einen expliziten Freigabeschritt.
- Das Zahlungssystem sendet Status zurueck.
- Der End-to-End-Prozess ist besser fuer Process Mining sichtbar.

### Hauptziele und Features

- Optimierungspotenziale aus Sprint 2 konkret umgesetzt.
- Sollprozess in BPMN modelliert.
- Zielarchitektur mit Workflow-Engine eingefuehrt.
- Neue REST-Schnittstellen fuer Workflow-Lifecycle.
- Rueckkanal von Payment Worker zur Workflow-Engine (`payment_status_updates`).
- Erweiterte Event-Analyse ueber alle Services.

## 2. Architekturuebersicht

### Systemarchitektur (textuell)

Denke an ein Orchester:

- Die **Workflow-Engine** ist der Dirigent.
- Der **gRPC-Service** ist das Archiv fuer Rechnungsdaten.
- **RabbitMQ** ist die Poststelle fuer asynchrone Nachrichten.
- Der **Payment Worker** fuehrt Zahlungen aus und meldet Ergebnisse zurueck.

Ablauf auf Architektur-Ebene:

1. Workflow-Engine nimmt eine Rechnung entgegen.
2. Workflow-Engine speichert Metadaten ueber gRPC.
3. Workflow steht auf `PENDING_APPROVAL`.
4. Nach Freigabe sendet Workflow-Engine einen Zahlungsauftrag in `payment_requests`.
5. Payment Worker verarbeitet und sendet Status in `payment_status_updates`.
6. Workflow-Engine setzt den Status auf `COMPLETED` oder Fehlerstatus.
7. Alle Komponenten schreiben Event-Logs fuer spaetere Analyse.

### Komponenten und Interaktion

- Workflow-Engine
  - REST-Einstiegspunkt fuer Start/Freigabe/Status
  - Orchestriert den Gesamtprozess
- gRPC-Service
  - Persistiert und liefert Rechnungsdaten
- RabbitMQ
  - Entkoppelt Workflow und Payment asynchron
- Payment Worker
  - Verarbeitet Zahlungen inkl. Retry/Duplikatlogik
  - Sendet Ergebnis-Events an Workflow-Engine
- Analyse-Skript
  - Konsolidiert Events und findet Varianten/Bottlenecks

### Verwendete Design-Patterns

- **Orchestrator Pattern**: Workflow-Engine steuert den Gesamtprozess zentral.
- **Event-Driven Architecture**: Statuswechsel werden als Events transportiert.
- **Producer-Consumer**: Workflow produziert Zahlungsauftraege, Worker konsumiert sie.
- **State-Machine-Denke**: Klare Workflow-Status (`PENDING_APPROVAL`, `PAYMENT_IN_PROGRESS`, `COMPLETED`, ...).
- **Defensive Runtime-Patterns**: Retry/Backoff und robuste Prozesssuche beim Stop-Skript.

## 3. Dateistruktur-Erklaerung

Im Fokus stehen die Sprint-3-relevanten Dateien.

### Ordner: `workflow-engine/`

- **Dateiname/Pfad**: `workflow-engine/server.js`
- **Zweck**: Zentrale Workflow-API und Orchestrierung.
- **Hauptverantwortlichkeiten**:
  - Endpunkte bereitstellen (`/workflows/start`, `/approve`, `/workflows`).
  - gRPC-Aufrufe zum Speichern/Laden von Rechnungen.
  - RabbitMQ-Publisher fuer Zahlungsauftraege.
  - RabbitMQ-Consumer fuer Payment-Status-Events.
  - Workflow-Status aktualisieren.
- **Abhaengigkeiten**:
  - `workflow-engine/event-logger.js`
  - `proto/invoice.proto` (indirekt via gRPC Loader)
  - `payment-system/payment-worker.js` (ueber Queue-Kommunikation)

- **Dateiname/Pfad**: `workflow-engine/event-logger.js`
- **Zweck**: Einfaches CSV-Event-Logging fuer Workflow-Events.
- **Hauptverantwortlichkeiten**:
  - `event-log.csv` initialisieren.
  - Events appenden.
- **Abhaengigkeiten**:
  - `workflow-engine/server.js`
  - `analyze-events.js` (liest diesen Log spaeter)

- **Dateiname/Pfad**: `workflow-engine/event-log.csv`
- **Zweck**: Laufzeitprotokoll der Workflow-Aktivitaeten.
- **Hauptverantwortlichkeiten**:
  - Nachvollziehbarkeit und Mining-Datenbasis.
- **Abhaengigkeiten**:
  - geschrieben von `workflow-engine/event-logger.js`
  - gelesen von `analyze-events.js`

### Ordner: `payment-system/`

- **Dateiname/Pfad**: `payment-system/payment-worker.js`
- **Zweck**: Verarbeitung eingehender Zahlungsauftraege.
- **Hauptverantwortlichkeiten**:
  - Konsumiert `payment_requests`.
  - Erkennt Duplikate.
  - Simuliert sporadische Fehler (Varianz im Prozess).
  - Sendet Status in `payment_status_updates` (`PAYMENT_FAILED`, `PAYMENT_PROCESSED`, `PAYMENT_DUPLICATE_REJECTED`).
  - Schreibt Payment-Events in CSV.
- **Abhaengigkeiten**:
  - RabbitMQ
  - `payment-system/event-logger.js`
  - `workflow-engine/server.js` (indirekt ueber Queue)

- **Dateiname/Pfad**: `payment-system/event-log.csv`
- **Zweck**: Laufzeitprotokoll der Payment-Schritte.
- **Hauptverantwortlichkeiten**:
  - Grundlage fuer Varianten/Bottleneck-Analyse.
- **Abhaengigkeiten**:
  - geschrieben vom Payment Worker
  - gelesen von `analyze-events.js`

### Ordner: `grpc-service/`

- **Dateiname/Pfad**: `grpc-service/event-log.csv`
- **Zweck**: Laufzeitprotokoll der gRPC-Schritte (Empfang, Speicherung, Abruf).
- **Hauptverantwortlichkeiten**:
  - Prozessschritte in der Datenhaltung sichtbar machen.
- **Abhaengigkeiten**:
  - gelesen von `analyze-events.js`

### Ordner: `client/`

- **Dateiname/Pfad**: `client/workflow-client.js`
- **Zweck**: Demo-/Testclient fuer Sprint-3-End-to-End.
- **Hauptverantwortlichkeiten**:
  - Workflow starten.
  - Workflow freigeben.
  - Nach kurzer Wartezeit finalen Status abrufen.
- **Abhaengigkeiten**:
  - `workflow-engine/server.js`

### Root-Dateien

- **Dateiname/Pfad**: `analyze-events.js`
- **Zweck**: Konsolidiert Logs und analysiert Varianten/Bottlenecks.
- **Hauptverantwortlichkeiten**:
  - Liest Logs aus Root, gRPC, Payment, Workflow.
  - Sortiert Events nach Zeit.
  - Erzeugt Prozessvarianten und Uebergangszeiten.
  - Schreibt `consolidated-event-log.csv`.
- **Abhaengigkeiten**:
  - `event-log.csv`
  - `grpc-service/event-log.csv`
  - `payment-system/event-log.csv`
  - `workflow-engine/event-log.csv`

- **Dateiname/Pfad**: `package.json`
- **Zweck**: Scripts und Dependencies fuer Sprint 3.
- **Hauptverantwortlichkeiten**:
  - `start:workflow`, `check:workflow`, `analyze:events` bereitstellen.
  - Libraries verwalten (`express`, `amqplib`, `@grpc/grpc-js`, `@grpc/proto-loader`).
- **Abhaengigkeiten**:
  - Gesamtes Node-Projekt

- **Dateiname/Pfad**: `docs/sprint3/optimierungspotenziale.md`
- **Zweck**: Fachliche Motivation der Sprint-3-Aenderungen.
- **Hauptverantwortlichkeiten**:
  - Probleme aus Sprint 2 benennen.
  - Soll-Optimierungen und Nutzen darstellen.
- **Abhaengigkeiten**:
  - inhaltliche Basis fuer Architektur und BPMN

- **Dateiname/Pfad**: `docs/sprint3/zielarchitektur.md`
- **Zweck**: Zielbild der Architektur inklusive Mermaid-Flow.
- **Hauptverantwortlichkeiten**:
  - Komponenten und Datenfluesse verstaendlich beschreiben.
- **Abhaengigkeiten**:
  - konsistent zu `workflow-engine/server.js` und `payment-system/payment-worker.js`

- **Dateiname/Pfad**: `docs/sprint3/sollprozess.bpmn`
- **Zweck**: BPMN-Sollprozess als formales Modell.
- **Hauptverantwortlichkeiten**:
  - Prozesslogik mit Gateways und Retry-Schleife modellieren.
  - Diagramm-Layout ueber BPMN-DI mitliefern.
- **Abhaengigkeiten**:
  - fachlich gespiegelt in `workflow-engine/server.js`

- **Dateiname/Pfad**: `README.md`
- **Zweck**: Uebergreifende Projekt- und Sprint-3-Dokumentation.
- **Hauptverantwortlichkeiten**:
  - Setup, Startreihenfolge, Checks und Process-Mining-Einstieg.
- **Abhaengigkeiten**:
  - referenziert fast alle Laufzeitkomponenten

- **Dateiname/Pfad**: `Stop-Server.ps1`
- **Zweck**: Dienste robust beenden.
- **Hauptverantwortlichkeiten**:
  - Verbesserte Prozesssuche fuer Node-Prozesse.
- **Abhaengigkeiten**:
  - Laufzeitbetrieb der lokalen Umgebung

- **Dateiname/Pfad**: `consolidated-event-log.csv`
- **Zweck**: Konsolidierter Export fuer Celonis.
- **Hauptverantwortlichkeiten**:
  - Alle Eventquellen in einer Datei zusammenfassen.
- **Abhaengigkeiten**:
  - wird von `analyze-events.js` erzeugt

- **Dateiname/Pfad**: `sent-payments.json`
- **Zweck**: Laufzeit-/Testartefakt fuer gesendete Zahlungen.
- **Hauptverantwortlichkeiten**:
  - einfacher Zustandsspeicher fuer Testlaeufe.
- **Abhaengigkeiten**:
  - Client-/Messaging-Testlauf

## 4. Prozessablauf (Schritt fuer Schritt)

### 1) Was passiert beim Start?

1. Du startest Infrastruktur und Services (RabbitMQ, gRPC, Payment Worker, optional Workflow-Engine).
2. Workflow-Engine stellt REST-Endpunkte bereit.
3. Workflow-Engine verbindet sich mit RabbitMQ (Publisher + Status-Consumer).

### 2) Reihenfolge der Aufrufe (Happy Path)

1. Client sendet `POST /workflows/start` an Workflow-Engine.
2. Workflow-Engine ruft gRPC `SaveInvoiceMetadata` auf.
3. Workflow wird mit `PENDING_APPROVAL` angelegt.
4. Client oder Benutzer sendet `POST /workflows/:workflowId/approve`.
5. Workflow-Engine holt Rechnung via gRPC `GetInvoice`.
6. Workflow-Engine sendet Zahlungsauftrag an Queue `payment_requests`.
7. Payment Worker verarbeitet Auftrag.
8. Payment Worker sendet `PAYMENT_PROCESSED` an Queue `payment_status_updates`.
9. Workflow-Engine konsumiert Event und setzt Status auf `COMPLETED`.
10. Client liest mit `GET /workflows/:workflowId` den Endstatus.

### 3) Datenfluss im System

- Request-Daten fliessen vom Client zur Workflow-Engine.
- Stammdaten persistieren im gRPC-Service.
- Transaktionsnachrichten laufen asynchron ueber RabbitMQ.
- Statusupdates fliessen zur Workflow-Engine zurueck.
- Eventdaten landen in CSV-Logs fuer Mining.

### 4) Wichtigste Entscheidungspunkte

- **Freigabe-Gateway**: Wird die Rechnung genehmigt?
- **Payment-Status-Gateway**: Erfolg, Retry oder Duplikatabbruch?
- **Technisch**: RabbitMQ/gRPC erreichbar? Wenn nein, Fehler-HTTP-Status und Retry-Logik.

## 5. Technologie-Stack

### Frameworks und Libraries

- Node.js (Runtime)
- Express (REST-API fuer Workflow-Engine)
- amqplib (RabbitMQ Anbindung)
- @grpc/grpc-js + @grpc/proto-loader (gRPC Client/Server Kommunikation)
- PowerShell (Betriebsskripte Start/Stop)

### Warum diese Auswahl?

- **Express**: schnell fuer kleine, klare API-Endpunkte.
- **RabbitMQ**: robuste Entkopplung fuer asynchrone Prozesse.
- **gRPC**: klarer Vertrag ueber `proto` und typisierte Datenfelder.
- **CSV-Logging**: einfaches, tool-freundliches Format fuer Process Mining.

### Wichtige Konfigurationsdateien

- `package.json` (Scripts und Dependencies)
- `proto/invoice.proto` (Service- und Datenvertrag)
- `Start-Server.ps1` / `Stop-Server.ps1` (lokaler Betrieb)

## 6. BPMN-Prozessmodell

### Beschreibung des modellierten Prozesses

Das BPMN-Modell in `docs/sprint3/sollprozess.bpmn` bildet den fachlichen Sollprozess ab:

1. Rechnung kommt rein.
2. Metadaten werden gespeichert.
3. Fachliche Pruefung/Freigabe.
4. Bei Freigabe wird Zahlung angestossen.
5. Zahlungsstatus wird empfangen.
6. Bei Erfolg wird archiviert und abgeschlossen.
7. Bei Misserfolg geht es in eine Retry-Schleife.
8. Bei Nicht-Freigabe endet der Prozess abgelehnt.

### Hauptaktivitaeten und Entscheidungen

- Aktivitaeten: Speichern, Freigeben, Zahlung senden, Status empfangen, Archivieren.
- Entscheidungen: `Freigegeben?` und `Zahlung erfolgreich?`.

### Wie wird BPMN in Code umgesetzt?

BPMN ist das fachliche Blueprint, Code ist die technische Ausfuehrung:

- `PENDING_APPROVAL` entspricht dem User-Task fuer Freigabe.
- `/approve` triggert den Schritt "Zahlungsauftrag senden".
- `payment_status_updates` entspricht "Zahlungsstatus empfangen".
- `PAYMENT_PROCESSED` fuehrt zu `COMPLETED` (fachlich: Endevent Erfolg).
- `PAYMENT_FAILED` fuehrt zu Retry-Zustand (fachlich: Rueckschleife).

## 7. Wichtige Code-Konzepte

### Workflow-Engine Integration

- In-Memory Workflow-Store (`Map`) als einfache Prozessinstanz-Verwaltung.
- REST-Endpunkte als Einstieg in den Prozess.
- Statusaenderungen durch eigene Aktionen und externe Events.

### Message Broker Anbindung

- Queue `payment_requests` fuer ausgehende Zahlungen.
- Queue `payment_status_updates` fuer Rueckmeldungen.
- Durable Queues + `ack/nack` fuer zuverlaessige Verarbeitung.

### gRPC Service Calls

- Beim Start: `SaveInvoiceMetadata`.
- Beim Approve: `GetInvoice` fuer konsistente Zahlungsdaten.
- Vertrag ist in `proto/invoice.proto` festgelegt.

### Fehlerbehandlung und Logging

- Payment Worker hat Reconnect mit exponentiellem Backoff.
- Workflow-Engine liefert klare HTTP-Fehlercodes (400, 404, 409, 502, 503).
- Ungueltige Messages werden erkannt und verworfen (`nack`, kein Requeue bei Parse-Fehlern).
- Jeder wichtige Schritt schreibt ein Event fuer Nachvollziehbarkeit.

Beispiel (vereinfacht), wie Payment-Status in Workflow-Status uebersetzt wird:

```js
if (paymentUpdate.status === 'PAYMENT_PROCESSED') {
  workflow.status = 'COMPLETED';
}
if (paymentUpdate.status === 'PAYMENT_FAILED') {
  workflow.status = 'PAYMENT_RETRY_PENDING';
}
```

## 8. Schnellstart-Anleitung

### Voraussetzungen

1. Node.js 22+ installiert
2. Docker Desktop laeuft
3. `npm install` im Projekt ausgefuehrt

### Projekt lokal ausfuehren

1. Kernservices starten:

```powershell
.\Start-Server.ps1
```

1. Workflow-Engine starten:

```powershell
npm run start:workflow
```

1. Sprint-3-Demo pruefen:

```powershell
npm run check:workflow
```

1. Optional Event-Analyse erzeugen:

```powershell
npm run analyze:events
```

### Wichtige Befehle

- `npm run check:grpc`
- `npm run check:messaging`
- `npm run check:integration`
- `npm run check:workflow`
- `npm run start:workflow`
- `npm run analyze:events`
- `.\Stop-Server.ps1`

---

## Kurz-Merksatz fuer deine Praesentation

Sprint 3 hat den Rechnungsprozess von einer technischen Kette zu einem gesteuerten End-to-End-Workflow weiterentwickelt: mit fachlicher Freigabe, asynchronem Payment-Rueckkanal und klar auswertbarem Process-Mining-Trace.
