# Sprint 1 Erklaerungsdokumentation

Diese Datei erklaert Sprint 1 verstaendlich und praesentationsfaehig.
Commit-Hinweise aus der Historie:

- `304a6db`: Sprint 1: gRPC service and client
- `d97875f`: Sprint 1: RabbitMQ implementiert
- `b12bb82`: Add README for Invoicing System - Sprint 1
- `634391f`: Abgabe Sprint 1

Zielgruppe dieser Datei: Kommilitonen, die das Projekt noch nicht kennen, und Prufer, die verstehen wollen,
welcher technische Sockel in Sprint 1 gelegt wurde.

## 1. Projektuebersicht Sprint 1

### Was wurde in Sprint 1 erreicht?

Sprint 1 hat die technische Basis fuer die digitale Rechnungsbearbeitung aufgebaut.
Im Kern ging es darum, Rechnungsdaten zu speichern und eine erste asynchrone Zahlungsausloesung moeglich zu machen.

Wichtig fuer die Einordnung:

- Sprint 1 beantwortet die Frage: "Koennen wir Rechnungsdaten robust speichern und einen Zahlungsprozess technisch anstossen?"
- Noch nicht enthalten sind tiefes Process Mining und eine zentrale Workflow-Orchestrierung (kommt in Sprint 2/3).

### Hauptziele und implementierte Features

- gRPC-Service fuer Rechnungsmetadaten eingefuehrt.
- gRPC-Client fuer Speichern und Abrufen gebaut.
- RabbitMQ als Message Broker angebunden.
- Erstes Versenden von Zahlungsauftraegen ueber Queue `payment_requests`.
- Betriebsgrundlage mit Start-/Stop-Skripten vorbereitet.

Ergebnis aus Projektsicht:

- Ein lauffaehiger End-to-End-Mindestpfad von "Rechnung speichern" bis "Zahlung versenden".
- Klare Trennung von synchroner Fachdatenabfrage (gRPC) und asynchroner Weiterverarbeitung (Queue).

## 2. Architekturuebersicht

### Systemarchitektur (textuell)

In Sprint 1 besteht die Architektur aus drei Kernteilen:

1. **gRPC-Service** fuer Datenhaltung im laufenden Prozess.
2. **Client** als Aufrufer fuer Speichern/Abrufen und Zahlungsversand.
3. **RabbitMQ** als asynchroner Kanal fuer Zahlungsauftraege.

Einfache Analogie:

- gRPC-Service = digitales Rechnungskonto.
- RabbitMQ = Postfach fuer Zahlungsauftraege.
- Client = Sachbearbeitung, die beides anstoesst.

### Komponenten und Interaktion

- Client speichert Rechnung ueber gRPC.
- Client kann Rechnung per ID wieder laden.
- Client erstellt aus Rechnungsdaten einen Zahlungsauftrag.
- Zahlungsauftrag wird in RabbitMQ-Queue geschrieben.

Mini-Sequenz (vereinfachte Sicht):

1. Client -> gRPC: `SaveInvoiceMetadata`
2. gRPC-Service -> Client: `success/id`
3. Client -> gRPC: `GetInvoice`
4. Client -> RabbitMQ: Nachricht in `payment_requests`

### Verwendete Design-Patterns

- **Client-Server** (gRPC): klare Trennung von Aufrufer und Service.
- **Request/Response** fuer Metadatenzugriff.
- **Producer-Queue-Prinzip** fuer asynchrone Auftragsuebergabe.

Warum das sinnvoll ist:

- Der gRPC-Service bleibt klein und schnell, weil er nicht auf Zahlung warten muss.
- Das Messaging entkoppelt Sender und Empfaenger zeitlich und technisch.

## 3. Dateistruktur-Erklaerung

Hinweis zur Lesestrategie:
Wenn du die Codebasis jemandem erklaerst, starte mit `proto/invoice.proto` (Vertrag), dann `grpc-service/server.js` (Implementierung), danach die Clients.

### Ordner: `proto/`

- **Dateiname/Pfad**: `proto/invoice.proto`
- **Zweck**: Vertrag fuer gRPC-Service und Nachrichtenstruktur.
- **Hauptverantwortlichkeiten**:
  - Service-Methoden definieren (`SaveInvoiceMetadata`, `GetInvoice`).
  - Datenfelder der Rechnung festlegen.
- **Abhaengigkeiten**:
  - `grpc-service/server.js`
  - `client/invoice-client.js`
  - `client/send-payment.js`

Kurz gesagt:

- Diese Datei ist die "gemeinsame Sprache" zwischen Client und Server.

### Ordner: `grpc-service/`

- **Dateiname/Pfad**: `grpc-service/server.js`
- **Zweck**: Implementierung des gRPC-Backends.
- **Hauptverantwortlichkeiten**:
  - Rechnungsmetadaten speichern.
  - Rechnungen per ID zurueckgeben.
  - Duplikate erkennen und Fehlercode liefern.
- **Abhaengigkeiten**:
  - `proto/invoice.proto`
  - `grpc-service/event-logger.js`

Wichtige fachliche Regeln in dieser Datei:

- Duplikate werden nicht still ueberschrieben.
- Fehlende Rechnungen werden explizit als Fehler gemeldet.

- **Dateiname/Pfad**: `grpc-service/event-logger.js`
- **Zweck**: CSV-Event-Logging im gRPC-Service.
- **Hauptverantwortlichkeiten**:
  - `grpc-service/event-log.csv` schreiben.
- **Abhaengigkeiten**:
  - `grpc-service/server.js`

### Ordner: `client/`

- **Dateiname/Pfad**: `client/invoice-client.js`
- **Zweck**: Testet Speichern und Abrufen ueber gRPC.
- **Hauptverantwortlichkeiten**:
  - Beispielrechnung senden.
  - Antwort ausgeben.
  - Rechnung erneut laden.
- **Abhaengigkeiten**:
  - `proto/invoice.proto`
  - laufender `grpc-service/server.js`

- **Dateiname/Pfad**: `client/send-payment.js`
- **Zweck**: Zahlungsauftrag aus vorhandener Rechnung erzeugen und in RabbitMQ schicken.
- **Hauptverantwortlichkeiten**:
  - Rechnung per gRPC verifizieren.
  - Zahlung als Queue-Nachricht senden.
  - Doppelsendungen ueber `sent-payments.json` vermeiden.
- **Abhaengigkeiten**:
  - `grpc-service/server.js`
  - RabbitMQ
  - `client/sent-payments.json`

Warum die Verifikation vor Versand wichtig ist:

- So wird verhindert, dass Zahlungen fuer nicht existierende Rechnungen versendet werden.

### Root-Dateien

- **Dateiname/Pfad**: `Start-Server.ps1`
- **Zweck**: Lokale Dienste starten.
- **Hauptverantwortlichkeiten**:
  - RabbitMQ, gRPC-Service und Payment Worker starten.
- **Abhaengigkeiten**:
  - Docker, Node.js

- **Dateiname/Pfad**: `Stop-Server.ps1`
- **Zweck**: Lokale Dienste stoppen.
- **Hauptverantwortlichkeiten**:
  - Node-Prozesse und Infrastruktur kontrolliert beenden.
- **Abhaengigkeiten**:
  - Laufende Prozesse aus `Start-Server.ps1`

- **Dateiname/Pfad**: `package.json`
- **Zweck**: Scripts und Abhaengigkeiten.
- **Hauptverantwortlichkeiten**:
  - `check:grpc`, `check:messaging` als Kernchecks.
- **Abhaengigkeiten**:
  - Gesamtprojekt

## 4. Prozessablauf (Schritt fuer Schritt)

### 1) Was passiert beim Start?

1. RabbitMQ und gRPC-Service werden gestartet.
2. Optional startet auch der Payment Worker.

### 2) Reihenfolge der Aufrufe

1. `client/invoice-client.js` speichert eine Rechnung via gRPC.
2. Danach ruft der Client dieselbe Rechnung wieder ab.
3. `client/send-payment.js` verifiziert die Rechnung via gRPC.
4. Zahlungsauftrag wird in `payment_requests` geschrieben.

Beispiel fuer den Dateninhalt eines Zahlungsauftrags:

```json
{
  "invoiceId": "2",
  "supplier": "Muster GmbH",
  "amount_cents": 29999,
  "currency": "EUR",
  "timestamp": "2026-..."
}
```

### 3) Datenfluss

- Rechnungsdaten: Client -> gRPC-Service -> In-Memory Store.
- Zahlungsauftrag: Client -> RabbitMQ Queue.

### 4) Entscheidungspunkte

- Existiert Rechnung bereits? -> `ALREADY_EXISTS`.
- Existiert Rechnung fuer Zahlung nicht? -> Abbruch mit Fehler.
- Wurde Zahlung schon gesendet? -> kein erneuter Versand.

Typische Fehlerbilder in Sprint 1:

- gRPC nicht gestartet -> Verbindungsfehler beim Client.
- RabbitMQ nicht gestartet -> Fehler beim Senden der Queue-Nachricht.
- Portkonflikte -> Start bricht mit `EADDRINUSE` ab.

## 5. Technologie-Stack

### Verwendete Frameworks und Libraries

- Node.js
- `@grpc/grpc-js`
- `@grpc/proto-loader`
- `amqplib`
- PowerShell (Betriebsskripte)

### Warum wurden diese gewaehlt?

- gRPC fuer klaren, strukturierten Service-Vertrag.
- RabbitMQ fuer asynchrone Entkopplung.
- Node.js fuer schnellen, einfachen Prototyping-Stack.

Pruferfreundliche Begruendung:

- gRPC liefert ein klares API-Contract-First-Vorgehen.
- Messaging bildet reale Unternehmensprozesse besser ab als reine synchrone Aufrufe.

### Wichtige Konfigurationsdateien

- `package.json`
- `proto/invoice.proto`
- `Start-Server.ps1`, `Stop-Server.ps1`

## 6. BPMN-Prozessmodell (Sprint 1)

In Sprint 1 gibt es noch kein vollstaendiges BPMN-Sollmodell.
Der Fokus liegt auf der technischen Basis und den ersten Kernschritten.
Die spaetere BPMN-Modellierung folgt in Sprint 3.

Sinnvoller Uebergangssatz fuer die Praesentation:
"Sprint 1 war bewusst technisch fokussiert. Erst als der Daten- und Nachrichtenfluss stabil lief,
haben wir in Sprint 2/3 die Prozesssicht formalisiert und optimiert."

## 7. Wichtige Code-Konzepte

### Message Broker Anbindung

- Queue `payment_requests` wird als asynchroner Auftragseingang genutzt.

### gRPC Service Calls

- `SaveInvoiceMetadata` fuer Speichern.
- `GetInvoice` fuer Abruf und Verifikation vor Zahlung.

### Fehlerbehandlung und Logging

- Duplikate und Not-Found werden als gRPC-Fehler signalisiert.
- Erste Event-Logs werden im gRPC-Service geschrieben.

Beispiel (vereinfacht):

```js
if (invoices[invoice.id]) {
  return callback({ code: grpc.status.ALREADY_EXISTS });
}
```

Was du dazu sagen kannst:

- "Wir failen frueh und klar, statt inkonsistente Daten zu erzeugen."

## 8. Schnellstart-Anleitung

### Voraussetzungen

1. Node.js installiert
2. Docker Desktop aktiv
3. `npm install` ausgefuehrt

### Lokal ausfuehren

1. Dienste starten:

```powershell
.\Start-Server.ps1
```

1. gRPC pruefen:

```powershell
npm run check:grpc
```

1. Messaging pruefen:

```powershell
npm run check:messaging
```

### Wichtige Befehle

- `npm run check:grpc`
- `npm run check:messaging`
- `npm run check:integration`
- `.\Stop-Server.ps1`

Mini-Demo fuer 2 Minuten:

1. `npm run check:grpc`
1. Kurz zeigen, dass Speichern + Abrufen funktioniert.
1. `npm run check:messaging`
1. Zeigen, dass ein Zahlungsauftrag in die Queue geschrieben wird.

---

## Kurz-Merksatz fuer die Praesentation

Sprint 1 hat die Grundlage gebaut: strukturierte Rechnungsdaten per gRPC plus asynchroner Zahlungsauftrag ueber RabbitMQ.

Alternative Kurzfassung:
"Sprint 1 liefert das technische Rueckgrat: Datenvertrag, Servicegrenzen und asynchrone Kommunikation."
