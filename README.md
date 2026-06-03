# Eingangsrechnungsverarbeitung — Sprint 1 bis 5

Digitalisierung eines Eingangsrechnungsprozesses mit gRPC, RabbitMQ, Camunda 8 BPM und RPA.
Hochschule Karlruhe — Projekt Digitalisierung von Geschaeftsprozessen (SS 2026)

---

## Schnellstart

```powershell
# 1. Alle Dienste starten (RabbitMQ, gRPC, Payment Worker, Camunda Worker)
npm run start:servers

# 2. Neuen Prozess per E-Mail-Simulation starten
npm run trigger:email

# 3. Manuelle Tasks im Browser bearbeiten
# Tasklist: https://bru-2.tasklist.camunda.io/487e2664-45fe-4a21-9e53-860eddc37e5e
# Operate:  https://bru-2.operate.camunda.io/487e2664-45fe-4a21-9e53-860eddc37e5e

# 4. Alles stoppen
npm run stop:servers
```

---

## Voraussetzungen

| Voraussetzung | Version | Zweck |
|---|---|---|
| Node.js | 22.x LTS+ | Alle Services und Worker |
| Docker Desktop | aktuell | RabbitMQ Container |
| Camunda 8 SaaS | — | BPMN-Prozessausfuehrung |
| `.env`-Datei | — | Camunda-Zugangsdaten (siehe `.env.example`) |

---

## Systemarchitektur

```
                    ┌─────────────────────────────────────┐
                    │         Camunda 8 SaaS              │
                    │   (Process_11wgywq, bru-2)          │
                    └──────────────┬──────────────────────┘
                                   │ gRPC (Port 26500)
                    ┌──────────────▼──────────────────────┐
                    │         Camunda Worker              │
                    │      sprint4/camunda-worker.js      │
                    │  receive-invoice                    │
                    │  grpc-save-invoice ──────────────── ├──► gRPC Service :50051
                    │  rabbitmq-payment  ──────────────── ├──► RabbitMQ :5672
                    │  archive-invoice                    │         │
                    │  rpa-erp-entry ─────────────────── ├──► Playwright Bot
                    └─────────────────────────────────────┘         │
                                                                     ▼
                                                          ERP-Simulation (Browser)
```

---

## Vollstaendiger Prozessablauf

```
npm run trigger:email
        │
        │   Camunda startet neue Prozessinstanz
        ▼
[AUTO] receive-invoice
        Generiert invoiceId = INV-<timestamp>
        Speichert E-Mail-Metadaten als Prozessvariablen
        │
        ▼
[MANUELL] Rechnungsdaten erfassen  (Tasklist)
        Formular: Lieferant, Rechnungsnummer, Betrag (EUR), Datum, Eingangskanal
        │
        ▼
[AUTO] grpc-save-invoice
        Speichert Metadaten via gRPC Service (Port 50051)
        Setzt dataComplete = true / false
        │
        ├─ Fehler → Boundary Event → [MANUELL] Daten korrigieren → Retry
        ├─ dataComplete = false → [MANUELL] Fehlende Daten ergaenzen → zurueck
        ▼
[MANUELL] Rechnung pruefen und validieren  (Tasklist)
        │
        ├─ complianceNeeded → [MANUELL] Compliance Check (Finanzabteilung)
        ├─ infoNeeded → [MANUELL] Info beim Lieferanten anfragen → erhalten
        ▼
[MANUELL] Rechnung freigeben — Manager  (Tasklist)
        │
        ▼
[AUTO] rpa-erp-entry  ← Sprint 5: vollautomatisch per Playwright-Bot
        Oeffnet ERP-System im Browser
        Befuellt alle Felder mit Prozessvariablen
        Speichert Screenshots als Audit-Trail
        Gibt ERP-Referenznummer an Camunda zurueck
        │
        ▼
[AUTO] rabbitmq-payment
        Sendet Zahlungsauftrag an Queue payment_requests
        Payment Worker verarbeitet und bestaetigt
        │
        ├─ Fehler → Boundary Event → End: "Zahlung fehlgeschlagen"
        ▼
[AUTO] archive-invoice
        Schreibt Abschlusseintrag in event-log.csv
        │
        ▼
        ENDE: "Rechnung verarbeitet"
```

---

## Projektstruktur

```
invoicing-system/
├── grpc-service/                   # Sprint 1: gRPC Server (Port 50051)
│   ├── server.js
│   └── event-logger.js
├── payment-system/                 # Sprint 1: RabbitMQ Payment Worker
│   ├── payment-worker.js
│   └── event-logger.js
├── client/                         # Sprint 1: Test-Clients
│   ├── invoice-client.js
│   ├── send-payment.js
│   └── workflow-client.js
├── workflow-engine/                # Sprint 3: Eigene Workflow Engine (Port 3001)
│   └── server.js
├── sprint4/                        # Sprint 4+5: Camunda-Implementierung
│   ├── G4_sprint_4.bpmn            # BPMN-Prozess (deployed in Camunda)
│   ├── camunda-worker.js           # External Task Worker (5 Tasks)
│   ├── trigger-from-email.js       # E-Mail-Simulation: Prozess starten
│   └── forms/
│       ├── rechnungserfassung.form
│       ├── freigabe.form
│       └── erp-bestaetigung.form
├── sprint5/                        # Sprint 5: RPA
│   ├── rpa-erp-bot.js              # Playwright-Bot
│   └── screenshots/                # Audit-Trail (nicht in Git)
├── docs/
│   ├── sprint1/erklaerung-sprint1.md
│   ├── sprint2/erklaerung-sprint2.md
│   └── sprint3/                    # Soll-Prozess, Zielarchitektur, Optimierungen
├── proto/invoice.proto             # gRPC Schnittstellendefinition
├── analyze-events.js               # Bottleneck-Analyse + Celonis-Export
├── simulate-process.js             # Event-Log Simulation (50 Faelle)
├── Start-Server.ps1                # Alle Dienste starten
├── Stop-Server.ps1                 # Alle Dienste stoppen
├── .env                            # Zugangsdaten (nicht in Git)
└── .env.example                    # Vorlage fuer .env
```

---

## npm Scripts

| Befehl | Beschreibung |
|---|---|
| `npm run start:servers` | RabbitMQ + gRPC + Payment Worker + Camunda Worker starten |
| `npm run stop:servers` | Alle Dienste stoppen |
| `npm run trigger:email` | Neuen Prozess per E-Mail-Simulation starten |
| `npm run rpa:test` | RPA-Bot isoliert testen (headless) |
| `npm run rpa:demo` | RPA-Bot mit sichtbarem Browser + Video (Praesentation) |
| `npm run start:camunda-worker` | Nur Camunda Worker starten (ohne andere Dienste) |
| `npm run start:workflow` | Sprint-3 Workflow Engine starten (Port 3001) |
| `npm run simulate:process` | 50 Rechnungsfaelle mit 4 Varianten generieren |
| `npm run analyze:events` | Logs konsolidieren + Bottlenecks berechnen |
| `npm run check:grpc` | gRPC Verbindung testen |
| `npm run check:messaging` | RabbitMQ + Zahlungsfluss testen |
| `npm run check:integration` | Beide Checks hintereinander |

---

## Sprint-Dokumentation

### Sprint 1 — Bausteine und Integrationsarchitektur

**Aufgabe:** gRPC Service, Zahlungssystem via Messaging, Client

| Komponente | Datei | Beschreibung |
|---|---|---|
| gRPC Service | `grpc-service/server.js` | Speichert und liefert Rechnungsmetadaten (Port 50051) |
| Payment Worker | `payment-system/payment-worker.js` | Verarbeitet Zahlungsauftraege aus RabbitMQ |
| gRPC Client | `client/invoice-client.js` | Testet Speichern und Abrufen |
| Payment Client | `client/send-payment.js` | Testet Zahlungsauftrag via RabbitMQ |
| Proto-Definition | `proto/invoice.proto` | gRPC Schnittstellenvertrag |

Testen:
```powershell
npm run start:servers
npm run check:integration
```

---

### Sprint 2 — Process Mining und Prozessanalyse

**Aufgabe:** Celonis Process Mining, Prozessvarianten, Bottlenecks

```powershell
npm run simulate:process   # Generiert event-log.csv mit 50 Faellen
npm run analyze:events     # Erstellt consolidated-event-log.csv + Bottleneck-Report
```

Celonis-Import: `consolidated-event-log.csv` — Spalten: `case_id`, `activity`, `timestamp`, `resource`

Prozessvarianten:

| Variante | Anteil | Ablauf |
|---|---|---|
| A — Happy Path | 60% | Rechnung empfangen → gespeichert → Zahlung verarbeitet |
| B — Payment Retry | 20% | Zahlung schlaegt fehl → wird wiederholt |
| C — Duplicate Invoice | 10% | Zweite identische Rechnung wird abgewiesen |
| D — Invoice Not Found | 10% | Rechnung beim Abruf nicht gefunden |

Dokumentation: `docs/sprint2/erklaerung-sprint2.md`

---

### Sprint 3 — Soll-Prozess und Zielarchitektur

**Aufgabe:** BPMN Soll-Prozess, Systemarchitektur, Optimierungspotenziale

| Artefakt | Datei |
|---|---|
| BPMN Soll-Prozess | `docs/sprint3/sollprozess.bpmn` |
| Zielarchitektur | `docs/sprint3/zielarchitektur.md` |
| Optimierungspotenziale | `docs/sprint3/optimierungspotenziale.md` |
| Eigene Workflow Engine | `workflow-engine/server.js` (Port 3001) |

Workflow Engine Endpunkte:
```
POST /workflows/start
POST /workflows/:workflowId/approve
GET  /workflows/:workflowId
GET  /workflows
```

---

### Sprint 4 — Workflow Implementierung mit Camunda

**Aufgabe:** Digitaler Freigabeprozess in Camunda 8

| Artefakt | Datei | Beschreibung |
|---|---|---|
| BPMN Prozess | `sprint4/G4_sprint_4.bpmn` | Deployed in Camunda SaaS als `Process_11wgywq` |
| Camunda Worker | `sprint4/camunda-worker.js` | Automatisiert alle Service Tasks |
| E-Mail-Trigger | `sprint4/trigger-from-email.js` | Startet neuen Prozess |
| Formular Erfassung | `sprint4/forms/rechnungserfassung.form` | Manuelle Dateneingabe |
| Formular Pruefung | `sprint4/forms/freigabe.form` | Validierung und Freigabe |
| Formular ERP | `sprint4/forms/erp-bestaetigung.form` | ERP-Bestaetigung (Sprint 4) |

Camunda URLs:

| Tool | URL |
|---|---|
| Tasklist | https://bru-2.tasklist.camunda.io/487e2664-45fe-4a21-9e53-860eddc37e5e |
| Operate | https://bru-2.operate.camunda.io/487e2664-45fe-4a21-9e53-860eddc37e5e |
| Web Modeler | https://modeler.camunda.io |

---

### Sprint 5 — RPA fuer ERP-Erfassung

**Aufgabe:** Bot automatisiert die Dateneingabe ins ERP-System

Der Playwright-Bot (`sprint5/rpa-erp-bot.js`) ersetzt den manuellen ERP-Task:

1. Oeffnet `https://anhe0003.github.io/this-and-that/ERP_Rechnungserfassung.html`
2. Legt eine neue Rechnung an
3. Befuellt alle Felder (Rechnungsnummer, Datum, Lieferant, Betrag inkl. 19% MwSt.)
4. Speichert im ERP-System
5. Erstellt zwei Screenshots als Audit-Trail (`sprint5/screenshots/`)
6. Gibt die ERP-interne Referenznummer an Camunda zurueck

Bot testen:
```powershell
# Headless (Standard)
npm run rpa:test

# Sichtbarer Browser mit Video — ideal fuer Praesentation
npm run rpa:demo

# Mit eigenen Testdaten
$env:INV_ID="INV-001"; $env:SUPPLIER="BMW AG"; $env:AMOUNT="5000"
node sprint5/rpa-erp-bot.js
```

---

## Fehlerbehandlung

| Fehlerfall | Wo | Verhalten |
|---|---|---|
| gRPC nicht erreichbar | `grpc-save-invoice` | Boundary Error → Korrektur-Task fuer Sachbearbeiter → Retry |
| Daten unvollstaendig | `grpc-save-invoice` | Gateway → Task "Fehlende Daten ergaenzen" |
| RabbitMQ nicht erreichbar | `rabbitmq-payment` | Boundary Error → End Event "Zahlung fehlgeschlagen" |
| Zahlung schlaegt fehl (10%) | `payment-worker` | Nachricht bleibt in Queue → automatischer Retry |
| RPA-Bot schlaegt fehl | `rpa-erp-entry` | 2 automatische Wiederholungsversuche mit 5s Verzoegerung |
| Camunda Cluster schlaeft | `trigger-from-email` | SDK wiederholt automatisch bis Cluster antwortet |
| Payment Worker Verbindungsverlust | `payment-worker` | Exponentieller Backoff: 1s, 2s, 4s, 8s, max. 15s |

---

## Extras und Erweiterungen

Uebersicht was pro Sprint gefordert war und was zusaetzlich implementiert wurde.

### Sprint 1 — Bausteine

| Gefordert | Extra | Beschreibung |
|---|---|---|
| gRPC Service | | Speichert Rechnungsmetadaten auf Port 50051 |
| Zahlungssystem via Messaging | | RabbitMQ Payment Worker |
| Client | | `invoice-client.js` + `send-payment.js` |
| | ✅ Duplikaterkennung gRPC | Server weist doppelte Rechnungen mit `ALREADY_EXISTS` ab |
| | ✅ Duplikaterkennung Payment | Worker haelt Set bezahlter Rechnungen — doppelte Zahlungen werden verworfen |
| | ✅ Payment-Status-Queue | Zweite Queue `payment_status_updates` sendet Rueckmeldung (PROCESSED / FAILED / DUPLICATE_REJECTED) |
| | ✅ Exponentieller Backoff | Reconnect nach 1s, 2s, 4s, 8s bis max. 15s |
| | ✅ Simulierter Zahlungsfehler | 10% Fehlerquote erzeugt realistische Process-Mining-Varianten |
| | ✅ Geldbetraege in Cent | `int64` statt Float — kein Rundungsfehler moeglich |
| | ✅ Event-Logging pro Service | Jeder Service schreibt eigene `event-log.csv` |

### Sprint 2 — Process Mining

| Gefordert | Extra | Beschreibung |
|---|---|---|
| Celonis Process Mining | | Import und Analyse durchgefuehrt |
| Prozessvarianten + Bottlenecks | | Dokumentiert in `docs/sprint2/` |
| | ✅ Prozess-Simulation | 50 Rechnungsfaelle mit 4 Varianten generiert — kein manuelles Erzeugen noetig |
| | ✅ Automatische Bottleneck-Analyse | Durchschnitts-/Min-/Max-Zeiten fuer jede Transition berechnet |
| | ✅ Log-Konsolidierung | Logs aus allen Services werden zusammengefuehrt und als saubere CSV exportiert |

### Sprint 3 — Soll-Prozess

| Gefordert | Extra | Beschreibung |
|---|---|---|
| BPMN Soll-Prozess | | `docs/sprint3/sollprozess.bpmn` |
| Systemarchitektur | | `docs/sprint3/zielarchitektur.md` |
| | ✅ Eigene Workflow Engine | Vollstaendige REST API mit Endpunkten; aktualisiert Prozessstatus automatisch wenn Zahlung eintrifft |

### Sprint 4 — Workflow Implementierung

| Gefordert | Extra | Beschreibung |
|---|---|---|
| Start per E-Mail | | Start-Event im BPMN |
| Manuelle Metadaten-Extraktion | | `rechnungserfassung.form` |
| Speicherung per gRPC | | `grpc-save-invoice` Worker |
| ERP-Erfassung manuell | | `erp-bestaetigung.form` |
| Zahlung via Messaging | | `rabbitmq-payment` Worker |
| | ✅ E-Mail-Trigger Script | Startet Prozessinstanz mit simulierten E-Mail-Metadaten (Absender, Betreff, Zeitstempel) |
| | ✅ BPMN Boundary Error Events | gRPC-Fehler → Korrektur-Task; Payment-Fehler → dediziertes End Event |
| | ✅ Datenvollstaendigkeit per Gateway | Worker setzt `dataComplete` — BPMN entscheidet automatisch ob Nacherfassung noetig ist |
| | ✅ Compliance- und Info-Gateways | Optionale Prozesszweige fuer Finanzpruefung und Lieferanten-Rueckfragen |
| | ✅ ERP-Formular mit Prozesskontext | Formular zeigt Rechnungsdaten direkt aus Camunda-Variablen |
| | ✅ Datumsnormalisierung | ISO-Format automatisch auf YYYY-MM-DD normalisiert |
| | ✅ IPv4-Fix | `localhost` → `127.0.0.1` verhindert IPv6-Fehler unter Windows |
| | ✅ Persistente RabbitMQ-Verbindung | Auto-Reconnect statt Neuverbindung pro Job |
| | ✅ Camunda 504 Retry | Trigger wartet automatisch bis Cluster aus Standby aufgewacht ist |
| | ✅ Vollstaendiges Event-Logging | Alle 5 automatischen Schritte schreiben Celonis-kompatible Events |

### Sprint 5 — RPA

| Gefordert | Extra | Beschreibung |
|---|---|---|
| RPA-Bot befuellt ERP-Formular | | Playwright-Bot befuellt alle Felder, speichert Rechnung |
| | ✅ Screenshots als Audit-Trail | Zwei Screenshots pro Vorgang (vor + nach Speichern) |
| | ✅ Demo-Modus | Sichtbarer Browser mit verlangsamter Ausfuehrung fuer Praesentation |
| | ✅ Video-Aufnahme | Playwright zeichnet gesamte Automatisierung als `.webm` auf |
| | ✅ ERP-Referenznummer in Camunda | ERP-interne ID wird als Prozessvariable zurueckgegeben |
| | ✅ Automatischer Retry | Camunda startet RPA-Task bei Fehlern 2x neu (5s Verzoegerung) |
| | ✅ Isolierter Testlauf | Bot unabhaengig von Camunda mit eigenen Testdaten testbar |

### Infrastruktur (sprintuebergreifend)

| Extra | Beschreibung |
|---|---|
| ✅ Ein-Kommando-Start | `npm run start:servers` startet alle 4 Dienste automatisch |
| ✅ Camunda Worker im eigenen Fenster | Oeffnet sich automatisch separat damit Job-Logs sichtbar sind |
| ✅ Ein-Kommando-Stop | Beendet alle 4 Dienste sauber, auch ohne gespeicherte PIDs |
| ✅ Idempotenter Start | Erkennt laufende Prozesse und startet nicht doppelt |
| ✅ Aktive Port-Pruefung | Wartet bis Ports 50051 und 5672 tatsaechlich erreichbar sind |
| ✅ npm Scripts fuer alle Operationen | Kein manuelles `node ...` noetig |

---

## Troubleshooting

| Problem | Loesung |
|---|---|
| `ECONNREFUSED 50051` | `npm run start:servers` ausfuehren |
| `ECONNREFUSED 5672` | Docker Desktop starten, dann `npm run start:servers` |
| Camunda 504 beim Trigger | Operate im Browser oeffnen (Cluster aufwecken), dann erneut versuchen |
| Worker 401 Unauthorized | `.env` pruefen: `ZEEBE_CLIENT_ID` und `ZEEBE_CLIENT_SECRET` korrekt? |
| Task haengt in Operate | Operate → Instanz → Modify → Token verschieben |
| Formular fehlt im Tasklist | BPMN + alle Formulare zusammen neu in Camunda deployen |
| RPA-Bot schlaegt fehl | `npm run rpa:test` zum isolierten Testen; `RPA_HEADLESS=false` fuer sichtbare Ausfuehrung |
