# Rechnungsverarbeitung - Sprint 1 bis Sprint 4

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

### Schritt 1 — Infrastruktur starten

```powershell
npm run start:servers
```

Startet automatisch: RabbitMQ (Docker) + gRPC Service (Port 50051) + Payment Worker.
Warten bis `Start abgeschlossen.` erscheint.

### Schritt 2 — Camunda Worker starten (separates Terminal)

```powershell
npm run start:camunda-worker
```

Der Worker verbindet sich mit Camunda SaaS und abonniert folgende Tasks:
- `receive-invoice` — Rechnung empfangen, invoiceId generieren
- `grpc-save-invoice` — Metadaten per gRPC speichern
- `rabbitmq-payment` — Zahlungsauftrag an RabbitMQ senden
- `archive-invoice` — Rechnung archivieren und loggen

### Schritt 3 — Prozess per E-Mail triggern (separates Terminal)

```powershell
npm run trigger:email
# Optional mit eigenen Daten:
node sprint4/trigger-from-email.js "lieferant@beispiel.de" "Rechnung April 2026"
```

Startet eine neue Prozessinstanz in Camunda. Danach erscheint automatisch die erste Aufgabe im Tasklist.

### Schritt 4 — Prozess im Browser bearbeiten

| Tool | URL |
|---|---|
| **Tasklist** (User Tasks ausfuellen) | https://bru-2.tasklist.camunda.io/487e2664-45fe-4a21-9e53-860eddc37e5e |
| **Operate** (Prozess live verfolgen) | https://bru-2.operate.camunda.io/487e2664-45fe-4a21-9e53-860eddc37e5e |

### Schritt 5 — Stoppen

```powershell
npm run stop:servers
# Camunda Worker: Strg+C im entsprechenden Terminal
```

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

## Hinweis zu manuellen Schritten (Sprint 4)

Die Rechnungserfassung und ERP-Eingabe sind in Sprint 4 bewusst manuell:

- **Sprint 5 (RPA)**: Bot automatisiert die ERP-Dateneingabe
- **Sprint 6 (AI Agent)**: KI extrahiert Rechnungsdaten aus PDF und befuellt das Formular vor

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