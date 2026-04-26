# Sprint 2 Erklaerungsdokumentation

Diese Datei erklaert Sprint 2 verstaendlich und praesentationsfaehig.
Commit-Hinweise aus der Historie:

- `12a759a`: Sprint 2: Event Logging und Process Mining
- `cf0e5b8`: Sprint 2: Event Logging und Process Mining
- `6e1a60d`: Sprint 2: Event Logging und Process Mining
- `5b03cf2`: Exception bei doppelter Rechnung (Nachfolgender Fix)
- `73ee335`: Anpassungen Sprint 2

Zielgruppe dieser Datei: Kommilitonen und Prufer, die nachvollziehen wollen, wie aus Technikbetrieb messbare Prozessqualitaet wurde.

## 1. Projektuebersicht Sprint 2

### Was wurde in Sprint 2 erreicht?

Sprint 2 hat den Fokus von reiner Verarbeitung auf **Transparenz und Analyse** erweitert.
Die Kernidee: Nicht nur Rechnungen verarbeiten, sondern den Prozess messbar und auswertbar machen.

Wichtig fuer die Abgrenzung:

- Sprint 1: "System laeuft"
- Sprint 2: "System ist beobachtbar und analysierbar"
- Sprint 3: "System ist zusaetzlich orchestriert"

### Hauptziele und implementierte Features

- Event-Logging in den Services verstaerkt.
- Prozessvarianten simuliert (Happy Path, Retry, Duplicate, Not Found).
- Analyse-Skript fuer Varianten und Bottlenecks eingefuehrt.
- Konsolidierter CSV-Export fuer Celonis erzeugt.
- Stabilitaet bei Duplikat-/Fehlerfaellen verbessert.

Konkreter Mehrwert:

- Statt Bauchgefuehl gibt es messbare Variantenhaeufigkeiten und Zeitdauern.
- Engpaesse koennen datenbasiert diskutiert werden (z. B. lange Zeit bis zur Zahlung).

## 2. Architekturuebersicht

### Systemarchitektur (textuell)

Sprint 2 baut auf Sprint 1 auf und ergaenzt eine Analyse-Schicht:

1. gRPC-Service und Payment-System erzeugen fachliche Events.
2. Event-Logs werden serviceweise als CSV gespeichert.
3. Ein Analyse-Skript konsolidiert und bewertet die Prozessdaten.

Analogie:

- Sprint 1 war die Fabrik.
- Sprint 2 hat Sensoren und Auswertungsdashboard angeschlossen.

### Komponenten und Interaktion

- gRPC-Service loggt Ereignisse wie `Invoice Stored`, `Invoice Retrieved`, `Duplicate Invoice Attempt`.
- Payment Worker loggt `Payment Initiated`, `Payment Failed`, `Payment Processed`.
- `simulate-process.js` erzeugt kontrollierte Testfaelle.
- `analyze-events.js` berechnet Varianten und Zeitdauern.

Technische Kette in einem Satz:
"Operative Services erzeugen Events, Analyse-Skripte verwandeln sie in Entscheidungsgrundlagen."

### Verwendete Design-Patterns

- **Event Sourcing light**: Prozessschritte als Event-Spur (CSV).
- **ETL-Denke**: Sammeln, Konsolidieren, Auswerten der Eventdaten.
- **Resilience-Pattern**: Retry/Backoff im Payment Worker.

Warum diese Kombination gut ist:

- Event-Spuren sind leicht zu auditieren.
- ETL-Logik ist reproduzierbar und tool-unabhaengig.
- Resilience-Mechanismen machen die Daten realitaetsnah (inkl. Fehlpfade).

## 3. Dateistruktur-Erklaerung

Praktischer Lesepfad fuer Erklaerung im Vortrag:

1. `simulate-process.js` (Welche Faelle entstehen?)
2. `analyze-events.js` (Wie werden sie ausgewertet?)
3. `consolidated-event-log.csv` (Was sieht Celonis?)

### Root-Dateien

- **Dateiname/Pfad**: `simulate-process.js`
- **Zweck**: Erzeugt realistische Prozessvarianten als Event-Log-Daten.
- **Hauptverantwortlichkeiten**:
  - Varianten A-D simulieren.
  - Wahrscheinlichkeiten (60/20/10/10) abbilden.
  - Datenbasis fuer Mining vorbereiten.
- **Abhaengigkeiten**:
  - schreibt `event-log.csv`

Wichtige fachliche Idee:

- Die Verteilung 60/20/10/10 bildet nicht nur den Happy Path ab, sondern bewusst auch Stoerfaelle.

- **Dateiname/Pfad**: `analyze-events.js`
- **Zweck**: Konsolidierung und Analyse von Events.
- **Hauptverantwortlichkeiten**:
  - Mehrere Logquellen einlesen.
  - Varianten anhand Aktivitaetssequenzen identifizieren.
  - Uebergangszeiten/Bottlenecks berechnen.
  - `consolidated-event-log.csv` schreiben.
- **Abhaengigkeiten**:
  - `event-log.csv`
  - `grpc-service/event-log.csv`
  - `payment-system/event-log.csv`
  - (im aktuellen Stand auch `workflow-engine/event-log.csv`, Sprint-3-Erweiterung)

Was diese Datei besonders macht:

- Sie kann dieselbe Logik auf historische echte Daten oder simulierte Daten anwenden.

- **Dateiname/Pfad**: `consolidated-event-log.csv`
- **Zweck**: Ein zusammengefuehrter Export fuer Celonis.
- **Hauptverantwortlichkeiten**:
  - Alle Events in ein Importformat bringen.
- **Abhaengigkeiten**:
  - erzeugt durch `analyze-events.js`

### Ordner: `grpc-service/`

- **Dateiname/Pfad**: `grpc-service/event-logger.js`
- **Zweck**: Logging-Baustein fuer den gRPC-Service.
- **Hauptverantwortlichkeiten**:
  - Zeilenweise Event-Append.
- **Abhaengigkeiten**:
  - `grpc-service/server.js`

- **Dateiname/Pfad**: `grpc-service/event-log.csv`
- **Zweck**: gRPC-relevante Prozessspur.
- **Hauptverantwortlichkeiten**:
  - Nachvollziehbarkeit von Eingang, Speicherung, Abruf, Fehlern.
- **Abhaengigkeiten**:
  - gelesen von `analyze-events.js`

### Ordner: `payment-system/`

- **Dateiname/Pfad**: `payment-system/payment-worker.js`
- **Zweck**: Zahlungsverarbeitung mit Fehler- und Duplikatpfaden.
- **Hauptverantwortlichkeiten**:
  - Queue konsumieren.
  - Retry und Duplikatbehandlung.
  - Payment-Events schreiben.
- **Abhaengigkeiten**:
  - RabbitMQ
  - `payment-system/event-logger.js`

- **Dateiname/Pfad**: `payment-system/event-logger.js`
- **Zweck**: Logging-Baustein fuer Payment-Worker.
- **Hauptverantwortlichkeiten**:
  - Payment-Ereignisse in CSV schreiben.
- **Abhaengigkeiten**:
  - `payment-system/payment-worker.js`

- **Dateiname/Pfad**: `payment-system/event-log.csv`
- **Zweck**: Payment-Prozessspur fuer Analyse.
- **Hauptverantwortlichkeiten**:
  - Timing und Varianten transparent machen.
- **Abhaengigkeiten**:
  - gelesen von `analyze-events.js`

### Begleitende Projektdateien

- **Dateiname/Pfad**: `README.md`
- **Zweck**: Bedienung und Analyseablauf dokumentieren.
- **Hauptverantwortlichkeiten**:
  - Celonis-Import und Auswertung erklaeren.
- **Abhaengigkeiten**:
  - referenziert `simulate-process.js`, `analyze-events.js`

- **Dateiname/Pfad**: `package.json`
- **Zweck**: Sprint-2-Skripte als Befehle bereitstellen.
- **Hauptverantwortlichkeiten**:
  - `simulate:process`, `analyze:events`.
- **Abhaengigkeiten**:
  - Gesamtprojekt

## 4. Prozessablauf (Schritt fuer Schritt)

### 1) Was passiert beim Prozessstart?

1. Basissystem aus Sprint 1 verarbeitet Rechnungen.
2. Events werden in den beteiligten Services erzeugt.

### 2) Reihenfolge bei Analyse

1. Prozessfaelle werden real oder per `simulate-process.js` erzeugt.
2. Event-Logs landen in den jeweiligen CSV-Dateien.
3. `analyze-events.js` liest alle Logs ein.
4. Script erkennt Varianten und berechnet Engpaesse.
5. Konsolidierte Datei wird fuer Celonis exportiert.

Beispiel einer Variante (vereinfacht):

```text
Invoice Received -> Invoice Stored -> Invoice Retrieved -> Payment Initiated -> Payment Failed -> Payment Initiated -> Payment Processed
```

### 3) Datenfluss

- Operative Daten -> Service-Events.
- Service-Events -> CSV-Logs.
- CSV-Logs -> Konsolidierung/Analyse.
- Analyse-Output -> Celonis Import.

### 4) Entscheidungspunkte

- Tritt ein Zahlungsfehler auf? -> Retry-Pfad.
- Kommt eine Rechnung doppelt? -> Duplicate-Pfad.
- Wird Rechnung nicht gefunden? -> Not-Found-Pfad.

Interpretation fuer die Erklaerung:

- Jeder Entscheidungspunkt erzeugt eine neue Prozessvariante.
- Viele Varianten sind normal, aber bestimmte Varianten sind teuer (mehr Zeit, mehr Aufwand).

## 5. Technologie-Stack

### Verwendete Frameworks und Libraries

- Node.js
- `amqplib` fuer Queue-Kommunikation
- gRPC-Stack aus Sprint 1 (`@grpc/grpc-js`, `@grpc/proto-loader`)
- CSV-basierte Auswertung mit Standard-Node-API (`fs`, `path`)

### Warum wurden diese gewaehlt?

- CSV ist schnell, einfach und fuer Mining-Tools gut importierbar.
- Node-Skripte erlauben reproduzierbare Analyse ohne Zusatzplattform.
- RabbitMQ + gRPC liefern weiterhin die Datenquelle aus dem operativen Prozess.

Pruferfreundliche Begruendung:

- Wir haben kein separates BI-System gebaut, sondern Analyse direkt aus Betriebsdaten gewonnen.
- Das ist fuer ein Hochschulprojekt robust und nachvollziehbar.

### Wichtige Konfigurationsdateien

- `package.json`
- `README.md`
- Event-Log-Dateien unter Root, `grpc-service/`, `payment-system/`

## 6. BPMN-Prozessmodell (Sprint 2)

In Sprint 2 steht noch nicht die formale BPMN-Modellierung im Vordergrund.
Der Schwerpunkt liegt auf Prozesssichtbarkeit und datengetriebener Analyse.
Die BPMN-Sollmodellierung wird anschliessend in Sprint 3 formalisiert.

Sinnvoller Brueckensatz zu Sprint 3:
"Sprint 2 zeigt, wo es hakt. Sprint 3 setzt genau dort mit einem gesteuerten Sollprozess an."

## 7. Wichtige Code-Konzepte

### Message Broker und Prozessvarianten

- Asynchrone Payment-Verarbeitung ermoeglicht reale Abweichungen (Retry/Fehler).
- Diese Abweichungen werden explizit als Events geloggt.

### Analyselogik

- Varianten werden ueber Aktivitaetsketten je `case_id` erkannt.
- Bottlenecks ergeben sich aus Zeitdifferenzen zwischen aufeinanderfolgenden Events.

Was ein Bottleneck in diesem Projekt bedeutet:

- Nicht nur "CPU langsam", sondern fachlich: ein Vorgang bleibt zu lange zwischen zwei Schritten liegen.

### Fehlerbehandlung und Logging

- Duplicate- und Not-Found-Faelle werden sichtbar statt still geschluckt.
- Reconnect/Backoff reduziert Ausfaelle bei RabbitMQ-Verbindungsproblemen.

Beispiel (vereinfacht) fuer Bottleneck-Berechnung:

```js
const duration = new Date(curr.timestamp) - new Date(prev.timestamp);
const key = `${prev.activity} -> ${curr.activity}`;
```

Was du dazu sagen kannst:

- "Wir haben Dauer nicht geschaetzt, sondern zwischen echten Event-Zeitstempeln berechnet."

## 8. Schnellstart-Anleitung

### Voraussetzungen

1. Node.js installiert
2. Docker Desktop aktiv
3. `npm install` ausgefuehrt

### Lokal ausfuehren

1. System starten:

```powershell
.\Start-Server.ps1
```

1. Prozessfaelle simulieren:

```powershell
npm run simulate:process
```

1. Analyse ausfuehren:

```powershell
npm run analyze:events
```

1. Ergebnis in Celonis importieren:

- Datei: `consolidated-event-log.csv`
- Mapping: `case_id`, `activity`, `timestamp`, `resource`

Mini-Demo fuer 3 Minuten:

1. `npm run simulate:process`
1. Kurzer Blick in `event-log.csv` (mehrere Varianten sichtbar).
1. `npm run analyze:events`
1. In der Ausgabe die langsamsten Uebergaenge zeigen.
1. Erkllaeren, warum genau daraus Sprint-3-Anforderungen entstanden sind.

### Wichtige Befehle

- `npm run simulate:process`
- `npm run analyze:events`
- `npm run check:integration`
- `.\Stop-Server.ps1`

---

## Kurz-Merksatz fuer die Praesentation

Sprint 2 hat den Prozess messbar gemacht: durch Event-Logging, Variantenanalyse und Bottleneck-Erkennung als Grundlage fuer spaetere Prozessoptimierung.

Alternative Kurzfassung:
"Sprint 2 war unser Sensorik- und Analyse-Sprint: Wir haben nicht nur verarbeitet, sondern verstanden."
