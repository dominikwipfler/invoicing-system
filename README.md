# Rechnungsverarbeitung - Sprint 1 bis Sprint 5

Digitalisierung der Eingangsrechnungsbearbeitung mit gRPC, Messaging (RabbitMQ) und Camunda 8 BPM.

---

## Systembausteine

| Baustein | Port | Beschreibung |
|---|---|---|
| **gRPC Service** | 50051 | Speichert Rechnungsmetadaten |
| **RabbitMQ** | 5672 / 15672 | Message Broker fuer Zahlungsauftraege |
| **Payment Worker** | — | Verarbeitet Zahlungsauftraege aus RabbitMQ |
| **Camunda Worker** | — | Automatisiert Service Tasks im BPMN-Prozess |
| **Workflow Engine** | 3001 | Sprint-3-Eigenimplementierung (ersetzt durch Camunda ab Sprint 4) |

---

## Voraussetzungen

- Node.js 22.x LTS oder neuer
- Docker Desktop (fuer RabbitMQ)
- Camunda 8 SaaS Account
- `.env`-Datei im Projektordner (siehe `.env.example`)

---

## Sprint 4: Camunda Workflow starten

### Schritt 1 — Alles starten (ein Befehl)

```powershell
npm run start:servers
```

Startet automatisch in einem Schritt:
- RabbitMQ (Docker)
- gRPC Service (Port 50051)
- Payment Worker
- **Camunda Worker** (oeffnet automatisch ein eigenes Terminalfenster)

Warten bis `Start abgeschlossen.` erscheint — alle vier Dienste laufen dann.

### Schritt 2 — Prozess per E-Mail triggern

```powershell
npm run trigger:email
# Optional mit eigenen Absender/Betreff:
node sprint4/trigger-from-email.js "lieferant@beispiel.de" "Rechnung April 2026"
```

Startet eine neue Prozessinstanz in Camunda. Der Camunda Worker verarbeitet automatisch den ersten Schritt und die erste Aufgabe erscheint im Tasklist.

### Schritt 3 — Prozess im Browser bearbeiten

| Tool | URL |
|---|---|
| **Tasklist** (User Tasks ausfuellen) | https://bru-2.tasklist.camunda.io/487e2664-45fe-4a21-9e53-860eddc37e5e |
| **Operate** (Prozess live verfolgen) | https://bru-2.operate.camunda.io/487e2664-45fe-4a21-9e53-860eddc37e5e |

### Schritt 4 — Alles stoppen

```powershell
npm run stop:servers
```

Beendet alle Dienste: RabbitMQ, gRPC Service, Payment Worker und Camunda Worker.

---

## Vollstaendiger Prozessablauf

```
[Terminal 3] npm run trigger:email
        │
        │  Camunda SaaS startet Prozessinstanz (Process_11wgywq)
        ▼
[AUTOMATISCH] receive-invoice
        Generiert invoiceId = INV-<timestamp>
        Speichert emailFrom, emailSubject, receivedAt
        │
        ▼
[MANUELL im Tasklist] Rechnungsdaten erfassen
        Formular: rechnungserfassung.form
        Felder: Lieferant, Rechnungsnummer, Betrag (EUR), Datum, Eingangskanal
        │
        ▼
[AUTOMATISCH] grpc-save-invoice
        Ruft gRPC Service (Port 50051) auf
        Speichert Rechnungsmetadaten
        Setzt dataComplete = true/false
        Bei Fehler → Boundary Event → Korrektur-Task fuer Sachbearbeiter
        │
        ├─ dataComplete = false → [MANUELL] Fehlende Daten ergaenzen → zurueck
        ▼ dataComplete = true
[MANUELL im Tasklist] Rechnung pruefen und validieren
        Formular: freigabe.form
        Entscheidung: complianceNeeded? infoNeeded?
        │
        ├─ complianceNeeded = true → [MANUELL] Compliance Check (Finanzabteilung)
        ├─ infoNeeded = true → [MANUELL] Info beim Lieferanten anfragen → erhalten
        ▼ (Normalfall)
[MANUELL im Tasklist] Rechnung freigeben (Manager)
        Formular: freigabe.form
        │
        ▼
[MANUELL im Tasklist] Rechnungsdaten ins ERP System eingeben
        Formular: erp-bestaetigung.form
        Link zur ERP-Simulation: https://anhe0003.github.io/this-and-that/ERP_Rechnungserfassung.html
        ERP-Referenznummer zurueck ins Formular eintragen
        │
        ▼
[AUTOMATISCH] rabbitmq-payment
        Sendet Zahlungsauftrag an RabbitMQ Queue payment_requests
        Payment Worker verarbeitet die Zahlung
        Bei Fehler → Boundary Event → End: "Zahlung fehlgeschlagen"
        │
        ▼
[AUTOMATISCH] archive-invoice
        Schreibt Eintrag in event-log.csv
        │
        ▼
        END: "Rechnung verarbeitet"
```

---

## npm Scripts Uebersicht

| Befehl | Beschreibung |
|---|---|
| `npm run start:servers` | RabbitMQ + gRPC + Payment Worker starten |
| `npm run stop:servers` | Alle lokalen Server stoppen |
| `npm run start:camunda-worker` | Camunda External Task Worker starten |
| `npm run trigger:email` | Neuen Prozess per E-Mail-Simulation starten |
| `npm run start:workflow` | Sprint-3 Workflow Engine starten (Port 3001) |
| `npm run check:grpc` | gRPC Verbindung testen |
| `npm run check:messaging` | RabbitMQ Verbindung testen |
| `npm run check:integration` | Beide Checks ausfuehren |
| `npm run simulate:process` | Event-Daten fuer Process Mining generieren |
| `npm run analyze:events` | Event-Logs konsolidieren (Celonis-Import) |

---

## Projektstruktur

```
invoicing-system/
├── grpc-service/           # Sprint 1: gRPC Server (Port 50051)
├── payment-system/         # Sprint 1: RabbitMQ Payment Worker
├── client/                 # Sprint 1: Integrations-Clients
├── workflow-engine/        # Sprint 3: Eigene Workflow Engine (Port 3001)
├── sprint4/
│   ├── G4_sprint_4.bpmn            # Ausfuehrbarer BPMN-Prozess (Camunda 8)
│   ├── camunda-worker.js           # External Task Worker (4 Service Tasks)
│   ├── trigger-from-email.js       # Prozess per E-Mail starten
│   └── forms/
│       ├── rechnungserfassung.form # Manuelle Rechnungserfassung
│       ├── freigabe.form           # Pruefen / Freigeben
│       └── erp-bestaetigung.form   # ERP-Erfassung bestaetigen
├── docs/
│   ├── sprint2/            # Process Mining Dokumentation
│   └── sprint3/            # Soll-Prozess, Zielarchitektur, Optimierungen
├── proto/invoice.proto     # gRPC Schnittstellendefinition
├── Start-Server.ps1        # Infrastruktur starten
├── Stop-Server.ps1         # Infrastruktur stoppen
└── .env                    # Camunda SaaS + lokale Verbindungsdaten (nicht in Git)
```

---

## Fehlerbehandlung im Prozess

| Fehlerfall | Verhalten |
|---|---|
| gRPC nicht erreichbar | Boundary Error → Korrektur-Task fuer Sachbearbeiter → Retry |
| RabbitMQ nicht erreichbar | Boundary Error → End Event "Zahlung fehlgeschlagen" |
| Camunda Worker 504 | SDK wiederholt automatisch bis Cluster aufgewacht ist |

---

## Process Mining (Sprint 2)

```powershell
npm run simulate:process   # 50 Rechnungsfaelle + 4 Varianten generieren
npm run analyze:events     # consolidated-event-log.csv erstellen
```

Celonis Import: `consolidated-event-log.csv` → Spalten: `case_id`, `activity`, `timestamp`, `resource`

Prozess-Varianten:
- **A (60%)**: Happy Path — Rechnung erfolgreich verarbeitet
- **B (20%)**: Payment Retry — Zahlung wiederholt
- **C (10%)**: Duplicate Invoice — Duplikat abgewiesen
- **D (10%)**: Invoice Not Found — Rechnung nicht gefunden

---

---

## Sprint 5: RPA – Automatische ERP-Erfassung

**Ziel:** Der ERP-Schritt wird nicht mehr manuell ausgefuehrt, sondern ein Playwright-Bot befuellt das ERP-Formular automatisch.

### Was passiert automatisch

Der RPA-Bot (`sprint5/rpa-erp-bot.js`):
1. Oeffnet `https://anhe0003.github.io/this-and-that/ERP_Rechnungserfassung.html`
2. Klickt "+ Neue Rechnung"
3. Befuellt alle Felder mit den Camunda-Prozessvariablen:
   - Rechnungsnummer, Datum, Lieferantenname, Rechnungs-ID, Zahlungsziel
4. Fuegt eine Rechnungsposition mit Betrag (19% MwSt.) hinzu
5. Speichert die Rechnung im ERP
6. Erstellt **zwei Screenshots** (vor + nach Speichern) als Audit-Trail
7. Gibt die ERP-interne Referenznummer zurueck an Camunda

### RPA-Bot direkt testen

```powershell
# Headless (unsichtbar, fuer CI/automatischen Betrieb)
npm run rpa:test

# Demo-Modus (sichtbarer Browser + Video, fuer Praesentationen)
npm run rpa:demo
```

Mit eigenen Testdaten:
```powershell
$env:INV_ID="INV-2026-001"; $env:SUPPLIER="BMW AG"; $env:AMOUNT="5000"; node sprint5/rpa-erp-bot.js
```

Screenshots werden gespeichert unter: `sprint5/screenshots/`

### BPMN-Aenderung (Sprint 5)

`Task_EnterERP` wurde von **UserTask → ServiceTask** umgestellt:

| Vorher (Sprint 4) | Nachher (Sprint 5) |
|---|---|
| Manuelles Formular im Tasklist | Automatisch durch RPA-Bot |
| `formId: erp-bestaetigung` | `type: rpa-erp-entry` |

### Was du in Camunda tun musst

Du musst das aktualisierte BPMN einmalig neu deployen:

1. **Camunda Web Modeler** oeffnen: https://modeler.camunda.io
2. Deinen Prozess (`Process_11wgywq`) oeffnen
3. Den Task **"Rechnungsdaten ins ERP System eingeben"** anklicken
4. Im Properties-Panel: Typ von **User Task** auf **Service Task** aendern
5. Task-Definition Type eintragen: `rpa-erp-entry`
6. **Deploy** klicken → Version 3 wird erstellt

Ab dann laeuft der ERP-Schritt vollautomatisch ohne manuellen Eingriff.

### Projektstruktur Sprint 5

```
sprint5/
├── rpa-erp-bot.js      # Playwright-Bot (ERP-Automatisierung)
└── screenshots/        # Audit-Trail (Screenshots + Videos, nicht in Git)
```

---

## Hinweis zu manuellen Schritten (Sprint 4)

Die Rechnungserfassung und ERP-Eingabe sind in Sprint 4 bewusst manuell:

- **Sprint 5 (RPA)**: Bot automatisiert die ERP-Dateneingabe
- **Sprint 6 (AI Agent)**: KI extrahiert Rechnungsdaten aus PDF und befuellt das Formular vor

---

## Extras und Erweiterungen

Folgende Features wurden über die Sprint-Anforderungen hinaus implementiert:

### Infrastruktur & Betrieb

| Feature | Beschreibung |
|---|---|
| **Ein-Kommando-Start** | `npm run start:servers` startet RabbitMQ (Docker), gRPC-Service und Payment Worker in einem Schritt |
| **Ein-Kommando-Stop** | `npm run stop:servers` beendet alle lokalen Prozesse sauber |
| **Idempotenter Start** | Das Start-Skript erkennt bereits laufende Dienste und startet sie nicht doppelt |
| **Port-Pruefung** | Start-Skript wartet aktiv bis Ports erreichbar sind, bevor es "fertig" meldet |
| **npm Scripts** | Alle Operationen per `npm run ...` aufrufbar — kein manuelles `node ...` noetig |

### Zuverlaessigkeit & Fehlertoleranz

| Feature | Beschreibung |
|---|---|
| **Exponentieller Backoff** | Payment Worker verbindet sich nach RabbitMQ-Ausfall automatisch neu (1s → 15s) |
| **Persistente RabbitMQ-Verbindung** | Camunda Worker haelt eine dauerhafte Verbindung zu RabbitMQ statt jedes Mal neu zu verbinden |
| **IPv4-Fix** | `localhost` wird automatisch zu `127.0.0.1` aufgeloest (verhindert IPv6-Fehler unter Windows) |
| **Duplikaterkennung** | gRPC Service und Payment Worker erkennen doppelte Rechnungen und Zahlungen |
| **Camunda 504 Retry** | `trigger-from-email.js` wartet automatisch bis der Camunda-Cluster aus dem Standby aufgewacht ist |
| **dataComplete-Pruefung** | `grpc-save-invoice` Worker prueft automatisch ob alle Pflichtfelder ausgefuellt sind und setzt `dataComplete = true/false` |

### Camunda Workflow

| Feature | Beschreibung |
|---|---|
| **E-Mail-Trigger Script** | `npm run trigger:email` simuliert eine eingehende E-Mail und startet automatisch eine neue Prozessinstanz |
| **BPMN Fehlerbehandlung** | Boundary Events fuer gRPC-Fehler (→ Korrektur-Task) und Payment-Fehler (→ End Event) |
| **BPMN-Variable dataComplete** | Automatische Weichenstellung ob Daten vollstaendig sind oder nacherfasst werden muessen |
| **ERP-Referenznummer** | RPA-Bot gibt die ERP-interne ID zurueck und speichert sie als Prozessvariable in Camunda |

### RPA (Sprint 5)

| Feature | Beschreibung |
|---|---|
| **Demo-Modus** | `npm run rpa:demo` startet den Bot mit sichtbarem Browser — ideal fuer Praesentation beim Professor |
| **Video-Aufnahme** | Im Demo-Modus wird die gesamte Browser-Automatisierung als `.webm` Video aufgezeichnet |
| **Screenshots als Audit-Trail** | Zwei Screenshots pro Vorgang (vor + nach dem Speichern) werden automatisch abgelegt |
| **Direkter Testlauf** | Bot kann mit `npm run rpa:test` unabhaengig von Camunda getestet werden |
| **Konfigurierbare Testdaten** | Umgebungsvariablen (`INV_ID`, `SUPPLIER`, `AMOUNT`) erlauben einfaches Testen mit eigenen Werten |

### Process Mining (Sprint 2)

| Feature | Beschreibung |
|---|---|
| **Prozess-Simulation** | `npm run simulate:process` generiert 50 realistische Rechnungsfaelle mit 4 Prozessvarianten |
| **Konsolidierter Event-Log** | `npm run analyze:events` fuehrt alle Event-Logs zusammen fuer den Celonis-Import |
| **4 Prozessvarianten** | Happy Path, Payment Retry, Duplicate Invoice, Invoice Not Found — mit realistischen Haeufigkeiten |

---

## Troubleshooting

| Problem | Loesung |
|---|---|
| `ECONNREFUSED 50051` | `npm run start:servers` ausfuehren |
| `ECONNREFUSED 5672` | Docker Desktop starten, dann `npm run start:servers` |
| Camunda 504 | Operate im Browser oeffnen (Cluster aufwecken), dann erneut versuchen |
| Worker 401 Unauthorized | `.env` pruefen: `ZEEBE_CLIENT_ID` und `ZEEBE_CLIENT_SECRET` korrekt? |
| Task haengt in Operate | Operate → Instanz anklicken → Modify → Token verschieben |
| Formular fehlt im Tasklist | BPMN + alle 3 Formulare zusammen neu in Camunda deployen |