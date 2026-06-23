# Eingangsrechnungsverarbeitung — Sprint 1 bis 6

Digitalisierung eines Eingangsrechnungsprozesses mit gRPC, RabbitMQ, Camunda 8 BPM, RPA und KI-Extraktion.
Hochschule Karlruhe — Projekt Digitalisierung von Geschaeftsprozessen (SS 2026)

---

## Schnellstart

```powershell
# 1. Alle Dienste starten (RabbitMQ, gRPC, Payment Worker, Camunda Worker, Frontend-Cockpit)
.\Start-Server.ps1
# → Browser öffnet sich automatisch mit http://localhost:4000

# 2. Im Frontend-Cockpit:
#    - Klick auf "▶ Standard-Rechnung" oder "⚠ Compliance-Fall"
#    - Live-Status zeigt Prozessfortschritt
#    - Links zu Tasklist/Operate im Dashboard

# 3. Alternativ: Prozess per CLI starten
npm run trigger:email

# 4. Manuelle Tasks im Browser bearbeiten (Tasklist im Cockpit oder direkt):
#    Tasklist: https://bru-2.tasklist.camunda.io/487e2664-45fe-4a21-9e53-860eddc37e5e
#    Operate:  https://bru-2.operate.camunda.io/487e2664-45fe-4a21-9e53-860eddc37e5e

# 5. Alles stoppen (einschließlich Frontend & Browser)
.\Stop-Server.ps1
```

**Neu (Frontend-Cockpit):** Starten Sie das System mit `.\Start-Server.ps1` statt `npm run start:servers`. Der Browser öffnet sich automatisch mit dem Cockpit-Dashboard!

**Testszenarien** (verschiedene Prozesspfade ohne Codeänderung):

```powershell
# Standard-Szenario: Normaler Durchlauf (hohe KI-Konfidenz, Betrag < 10.000€, kein Compliance)
npm run trigger:email:standard

# Compliance-Szenario: KI-Prüfung + Compliance Check (niedrige Konfidenz, Betrag 52.360€)
npm run trigger:email:compliance

# Oder mit Mock-Mode testen (ohne echte API-Aufrufe):
AI_MOCK_MODE=true npm run trigger:email:standard
AI_MOCK_MODE=true npm run trigger:email:compliance
```

**Playwright-Bot isoliert ausfuehren** (nur fuer Tests/Demos — laeuft nie automatisch im Prozess):

```powershell
npm run rpa:test   # Headless (kein Browserfenster)
npm run rpa:demo   # Sichtbarer Browser + Videoaufnahme (fuer Praesentation)
```

**BPMN neu deployen** (nach Aenderungen am lokalen BPMN oder Formularen):

```powershell
npm run deploy:bpmn
```

---

## Frontend-Cockpit (Sprints 1–6)

**Zentrales Demo- und Steuerungs-Dashboard** für den kompletten Rechnungsverarbeitungs-Workflow.

```text
http://localhost:4000
```

### Features

- 🎯 **Ein-Klick-Szenarien:** Standard-Rechnung oder Compliance-Fall starten ohne CLI
- 📊 **Live-Status:** Echtzeit-Events aus `event-log.csv` (2-Sekunden-Updates)
- 🔗 **Direktlinks:** Zu Camunda Tasklist und Operate
- ⏹️ **Graceful Shutdown:** Browser + alle Services mit einem Knopf
- 🎨 **HKA-Branding:** Echtes Logo von h-ka.de integriert

### Automatischer Start

Das Cockpit startet automatisch beim Aufruf von `.\Start-Server.ps1` (Schritt 5/5):

```powershell
.\Start-Server.ps1
# [5/5] Frontend-Cockpit starten
# ✅ Frontend-Cockpit gestartet (PID 12345)
# ✅ Browser geöffnet (http://localhost:4000)
```

Browser öffnet sich automatisch (Edge/Chrome). Fallback-Warnung, falls kein Browser vorhanden.

### Herunterfahren

Klick auf **🔴 Herunterfahren** im Cockpit:

1. Sendet `POST /api/shutdown` an den Frontend-Server
2. Beendet alle Backend-Services
3. Schließt Browser automatisch

Alternativ: `.\Stop-Server.ps1`

**Siehe auch:** `docs/frontend/erklaerung-frontend.md` für vollständige Anleitung.

---

## Sprint 6 — KI-Rechnungsextraktion

Automatische PDF-Rechnungsdaten-Extraktion mit zwei verfügbaren KI-Providern:

### Standard: n8n + Google Gemini

```powershell
# In .env (Standard — keine zusätzliche Konfiguration nötig):
AI_PROVIDER=n8n
N8N_WEBHOOK_URL=https://leonjungkind0909.app.n8n.cloud/webhook/invoice-extract
```

**Dies ist der Standard-Provider.** Nutzt n8n Webhook mit Google Gemini für schnelle, kostengünstige Dokumentenanalyse.

### Alternative: Claude API (Direct)

```powershell
# In .env um auf Claude zu wechseln:
AI_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...  # Von https://console.anthropic.com
```

Nutzt Anthropic Claude Haiku direkt zur Dokumentenanalyse (höhere Genauigkeit, höhere Kosten).

### Beide Provider testen

```powershell
npm run ai:test-extract         # Claude (wenn konfiguriert)
npm run ai:test-extract-n8n     # n8n + Gemini
```

**Hinweis:** Beide Provider liefern identisches Output-Format und werden im BPMN-Gateway `GW_AIConfidence` gleich behandelt.

### Rechnungspositionen (lineItems)

Die KI-Extraktion erfasst auch **Rechnungspositionen** (lineItems):

- Jede Position: Beschreibung, Menge, Einheit, Einzelpreis
- Wird per IoMapping durch BPMN propagiert
- RPA-Bot füllt mehrere Positionen im ERP-Formular ein (+ Knopf "Position hinzufügen")
- Fallback: Einzelposition mit Rechnungsnummer, falls keine Positionen erkannt

Siehe auch: `docs/sprint6/erklaerung-sprint6.md` → Abschnitt "Rechnungspositionen" für technische Details.

---

## Voraussetzungen

| Voraussetzung | Version | Zweck |
| --- | --- | --- |
| Node.js | 22.x LTS+ | Alle Services und Worker |
| Docker Desktop | aktuell | RabbitMQ Container |
| Camunda 8 SaaS | — | BPMN-Prozessausfuehrung |
| `.env`-Datei | — | Camunda-Zugangsdaten (siehe `.env.example`) |

---

## Systemarchitektur

```text
                    ┌─────────────────────────────────────┐
                    │         Camunda 8 SaaS              │
                    │   (Process_Invoice, bru-2)          │
                    └──────────────┬──────────────────────┘
                                   │ gRPC (Port 26500)
                    ┌──────────────▼──────────────────────┐
                    │         Camunda Worker              │
                    │      sprint4/camunda-worker.js      │
                    │  receive-invoice                    │
                    │  grpc-save-invoice ──────────────── ├──► gRPC Service :50051
                    │  rabbitmq-payment  ──────────────── ├──► RabbitMQ :5672
                    │  archive-invoice                    │         │
                    │  rpa-erp-entry ─────────────────── ├──► UiPath Bot (Orchestrator API)
                    └─────────────────────────────────────┘         │

                                                                     ▼
                                                          ERP-Simulation (Browser)
```

Stoppt automatisch alle gestarteten Dienste (RabbitMQ, gRPC Service, Payment Worker, Camunda Worker).

---

## Vollstaendiger Prozessablauf

### Mit automatischem Camunda Worker (empfohlen)

```text
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
[AUTO] rpa-erp-entry  ← Sprint 5: vollautomatisch per UiPath Bot
        Startet UiPath Job im Orchestrator via REST API
        UiPath Bot oeffnet ERP-System und befuellt alle Felder
        Gibt UiPath Job-ID als ERP-Referenznummer zurueck
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

## Generierte Laufzeit-Dateien

Die folgenden Dateien werden **zur Laufzeit automatisch generiert** und sind **nicht versioniert** (in `.gitignore`):

| Datei | Zweck | Generiert von |
| ------- | ------- | --------------- |
| `event-log.csv` (root + Service-Dir) | Prozess-Event Log für Process Mining | `logEvent()` in Camunda Worker / Service-Logs |
| `consolidated-event-log.csv` | Konsolidierte Event-Log über alle Services | `npm run analyze:events` |
| `rpa/screenshots/*.png` | Screenshots vor/nach ERP-Eingabe (Audit-Trail) | Playwright RPA Bot |
| `rpa/screenshots/*.webm` | Video der Automatisierung (Demo-Modus) | Playwright RPA Bot |

**Hinweis:** Nach einem frischen `git clone` müssen diese Dateien nicht manuell erstellt werden — sie entstehen beim Starten von Prozessen automatisch. `event-log.csv` wird beim ersten `logEvent()`-Aufruf mit CSV-Header initialisiert.

---

## Projektstruktur

```text
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
├── camunda/                        # Sprint 4+5: Camunda-Implementierung
│   ├── invoice-process.bpmn        # BPMN-Prozess (deployed in Camunda)
│   ├── camunda-worker.js           # External Task Worker (5 Tasks)
│   ├── trigger-from-email.js       # E-Mail-Simulation: Prozess starten
│   └── forms/
│       ├── rechnungserfassung.form
│       ├── freigabe.form
│       └── erp-bestaetigung.form
├── rpa/                            # Sprint 5: RPA
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
| --- | --- |
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
| `npm run docker:up` | RabbitMQ Docker-Container starten |
| `npm run docker:down` | RabbitMQ Docker-Container stoppen |

---

## Sprint-Dokumentation

### Sprint 1 — Bausteine und Integrationsarchitektur

**Aufgabe:** gRPC Service, Zahlungssystem via Messaging, Client

| Komponente | Datei | Beschreibung |
| --- | --- | --- |
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
| --- | --- | --- |
| A — Happy Path | 60% | Rechnung empfangen → gespeichert → Zahlung verarbeitet |
| B — Payment Retry | 20% | Zahlung schlaegt fehl → wird wiederholt |
| C — Duplicate Invoice | 10% | Zweite identische Rechnung wird abgewiesen |
| D — Invoice Not Found | 10% | Rechnung beim Abruf nicht gefunden |

Dokumentation: `docs/sprint2/erklaerung-sprint2.md`

---

### Sprint 3 — Soll-Prozess und Zielarchitektur

**Aufgabe:** BPMN Soll-Prozess, Systemarchitektur, Optimierungspotenziale

| Artefakt | Datei |
| --- | --- |
| BPMN Soll-Prozess | `docs/sprint3/sollprozess.bpmn` |
| Zielarchitektur | `docs/sprint3/zielarchitektur.md` |
| Optimierungspotenziale | `docs/sprint3/optimierungspotenziale.md` |
| Eigene Workflow Engine | `workflow-engine/server.js` (Port 3001) |

Workflow Engine Endpunkte:

```text
POST /workflows/start
POST /workflows/:workflowId/approve
GET  /workflows/:workflowId
GET  /workflows
```

---

### Sprint 4 — Workflow Implementierung mit Camunda

**Aufgabe:** Digitaler Freigabeprozess in Camunda 8

| Artefakt | Datei | Beschreibung |
| --- | --- | --- |
| BPMN Prozess | `camunda/invoice-process.bpmn` | Deployed in Camunda SaaS als `Process_Invoice` |
| Camunda Worker | `camunda/camunda-worker.js` | Automatisiert alle Service Tasks |
| E-Mail-Trigger | `camunda/trigger-from-email.js` | Startet neuen Prozess |
| Formular Erfassung | `camunda/forms/rechnungserfassung.form` | Manuelle Dateneingabe |
| Formular Pruefung | `camunda/forms/freigabe.form` | Validierung und Freigabe |
| Formular ERP | `camunda/forms/erp-bestaetigung.form` | ERP-Bestaetigung (Sprint 4) |

Camunda URLs:

| Tool | URL |
| --- | --- |
| Tasklist | <https://bru-2.tasklist.camunda.io/487e2664-45fe-4a21-9e53-860eddc37e5e> |
| Operate | <https://bru-2.operate.camunda.io/487e2664-45fe-4a21-9e53-860eddc37e5e> |
| Web Modeler | <https://modeler.camunda.io> |

---

### Sprint 5 — RPA fuer ERP-Erfassung

**Aufgabe:** UiPath Bot automatisiert die Dateneingabe ins ERP-System

ERP-URL: `https://anhe0003.github.io/this-and-that/ERP_Rechnungserfassung.html`

| Teilaufgabe | Umsetzung | Status |
| --- | --- | --- |
| 5.1 UiPath Bot erstellen | UiPath Studio Web — App/Web Recorder | ✅ |
| 5.2 Bot testen | Debug on cloud in Studio Web (11+ erfolgreiche Runs) | ✅ |
| 5.3 Unattended Bot in Orchestrator | Paket publiziert, Process `ERP-Rechnungserfassung` in Solution Folder angelegt | ✅ |
| 5.3 REST API Integration in Camunda | OAuth2 + Orchestrator API vollstaendig implementiert im Camunda Worker | ✅ |
| 5.3 Vollautomatischer API-Trigger | Nicht moeglich — HKA-Bildungslizenz enthaelt keine Unattended Robot Ausfuehrung via API | ⚠️ |

**UiPath Bot** (`cloud.uipath.com`, Tenant `hkalshnhxm`):

- Aufgezeichnet mit App/Web Recorder
- Befuellt alle ERP-Felder automatisch (Rechnungsnummer, Datum, Lieferant, Betrag, MwSt.)
- Laeuft als Unattended Process im Orchestrator (Shared Folder)

**Playwright-Bot** (`sprint5/rpa-erp-bot.js`) — nur fuer isolierte Tests und Demos, laeuft nie automatisch im Camunda-Prozess:

```powershell
npm run rpa:test    # Headless
npm run rpa:demo    # Sichtbarer Browser + Video
```

**Dokumentation:** `docs/sprint5/erklaerung-sprint5.md`

---

## Fehlerbehandlung

| Fehlerfall | Wo | Verhalten |
| --- | --- | --- |
| gRPC nicht erreichbar (kurzer Aussetzer) | `grpc-save-invoice` | Automatischer Zeebe-Retry (3x, 2s Backoff) — kein Sachbearbeiter-Eingriff |
| gRPC dauerhaft nicht erreichbar | `grpc-save-invoice` | Nach 3 gescheiterten Retries: Incident in Operate (kontrolliert pausiert) |
| gRPC liefert Datenfehler (z.B. Duplikat) | `grpc-save-invoice` | Boundary Error → Korrektur-Task fuer Sachbearbeiter → Retry |
| Daten unvollstaendig | `grpc-save-invoice` | Gateway → Task "Fehlende Daten ergaenzen" |
| RabbitMQ nicht erreichbar (kurzer Aussetzer) | `rabbitmq-payment` | Automatischer Zeebe-Retry (3x, 2s Backoff) — kein Sachbearbeiter-Eingriff |
| RabbitMQ dauerhaft nicht erreichbar | `rabbitmq-payment` | Nach 3 gescheiterten Retries: Boundary Error → Eskalations-Task "Zahlung manuell pruefen" (Finanzabteilung) → End Event "Zahlung fehlgeschlagen" |
| Zahlung schlaegt fehl (10%, simuliert) | `payment-worker` | Nachricht bleibt in Queue → automatischer Retry |
| RPA-Bot schlaegt fehl | `rpa-erp-entry` | 2 automatische Wiederholungsversuche mit 5s Verzoegerung |
| Camunda Cluster schlaeft | `trigger-from-email` | SDK wiederholt automatisch bis Cluster antwortet |
| Payment Worker Verbindungsverlust | `payment-worker` | Exponentieller Backoff: 1s, 2s, 4s, 8s, max. 15s |

### Service-Ausfall manuell testen

Sowohl der gRPC-Service als auch RabbitMQ lassen sich gezielt stoppen, um die Fehlerbehandlung
live zu beobachten. Es gibt jeweils zwei Testfaelle: ein **dauerhafter** Ausfall (zeigt Retry +
Eskalation/Incident) und ein **kurzer** Aussetzer (zeigt, dass er komplett unsichtbar abgefangen
wird). Wichtig: nach jeder Code-Aenderung an `camunda-worker.js` den Worker-Prozess neu starten
(`.\Stop-Server.ps1` + `.\Start-Server.ps1`, oder den Node-Prozess gezielt killen), sonst laeuft
noch der alte Code im Speicher.

#### gRPC-Service — dauerhafter Ausfall (Punkt 2: Incident statt Sachbearbeiter-Aufgabe)

```powershell
# 1. gRPC-Service stoppen
$grpcPid = (Get-NetTCPConnection -LocalPort 50051 | Where-Object State -eq 'Listen').OwningProcess
Stop-Process -Id $grpcPid -Force

# 2. Neue Prozessinstanz starten
npm run trigger:email
```

Im Camunda-Worker-Fenster erscheinen 3 Fehlversuche (`Service nicht erreichbar — Zeebe-Retry`,
Retries 2 → 1 → 0), danach in Operate ein Incident vom Typ "No more retries left" am Task
"Metadaten per gRPC speichern". **Keine** Aufgabe in der Tasklist.

Auflösen:

```powershell
node grpc-service/server.js
```

Danach in Operate: Instanz oeffnen → Incident → **Retry**.

#### gRPC-Service — kurzer Aussetzer (zeigt: kein Incident, kein Sachbearbeiter-Eingriff)

```powershell
$grpcPid = (Get-NetTCPConnection -LocalPort 50051 | Where-Object State -eq 'Listen').OwningProcess
Stop-Process -Id $grpcPid -Force
Start-Job -ScriptBlock {
    Set-Location "<Projektpfad>"
    Get-Content -Path "event-log.csv" -Wait -Tail 0 | ForEach-Object {
        if ($_ -match "gRPC Save Failed") { node grpc-service/server.js }
    }
} | Out-Null
npm run trigger:email
```

Erwartung: genau **ein** Fehlversuch im Log, dann sofort `... gespeichert` — kein Incident,
keine Aufgabe.

#### RabbitMQ — dauerhafter Ausfall (Punkt 3: Eskalation an Finanzabteilung)

```powershell
docker stop rabbitmq
npm run trigger:email:standard
```

Tasklist durchklicken: **Rechnung pruefen und validieren** (genehmigt, Haken "Info..." aus) →
**Rechnung freigeben** (genehmigt). Nach automatischer ERP-Erfassung (Playwright) erscheinen im
Worker-Fenster 3 Fehlversuche (`RabbitMQ nicht erreichbar — Zeebe-Retry`, Retries 2 → 1 → 0),
danach in der Tasklist die neue Aufgabe **"Zahlung manuell pruefen"** mit der Fehlermeldung im
Formular. Nach Abschluss laeuft die Instanz zum End Event "Zahlung fehlgeschlagen" (nicht zum
Erfolgs-Ende "Rechnung verarbeitet" — pruefbar z.B. ueber `event-log.csv`: es darf danach kein
`Invoice Archived`-Eintrag fuer diese Rechnung mehr folgen).

Danach wieder starten: `docker start rabbitmq`

#### RabbitMQ — kurzer Aussetzer

Gleiches Prinzip wie beim gRPC-Aussetzer-Test, nur mit `docker stop rabbitmq` /
`docker start rabbitmq` und Ueberwachung auf `"Payment Send Failed"` im Event-Log statt
`"gRPC Save Failed"`.

---

## Extras und Erweiterungen

Uebersicht was pro Sprint gefordert war und was zusaetzlich implementiert wurde.

### Sprint 1 — Bausteine

| Gefordert | Extra | Beschreibung |
| --- | --- | --- |
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
| --- | --- | --- |
| Celonis Process Mining | | Import und Analyse durchgefuehrt |
| Prozessvarianten + Bottlenecks | | Dokumentiert in `docs/sprint2/` |
| | ✅ Prozess-Simulation | 50 Rechnungsfaelle mit 4 Varianten generiert — kein manuelles Erzeugen noetig |
| | ✅ Automatische Bottleneck-Analyse | Durchschnitts-/Min-/Max-Zeiten fuer jede Transition berechnet |
| | ✅ Log-Konsolidierung | Logs aus allen Services werden zusammengefuehrt und als saubere CSV exportiert |

### Sprint 3 — Soll-Prozess

| Gefordert | Extra | Beschreibung |
| --- | --- | --- |
| BPMN Soll-Prozess | | `docs/sprint3/sollprozess.bpmn` |
| Systemarchitektur | | `docs/sprint3/zielarchitektur.md` |
| | ✅ Eigene Workflow Engine | Vollstaendige REST API mit Endpunkten; aktualisiert Prozessstatus automatisch wenn Zahlung eintrifft |

### Sprint 4 — Workflow Implementierung

| Gefordert | Extra | Beschreibung |
| --- | --- | --- |
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
| --- | --- | --- |
| UiPath Bot erstellen (5.1) | | Bot in UiPath Studio Web mit App/Web Recorder aufgezeichnet |
| Bot testen (5.2) | | Erfolgreich getestet (Debug on cloud, 11 erfolgreiche Runs) |
| Unattended Bot in Orchestrator (5.3) | | Paket publiziert, Process `ERP-Rechnungserfassung` in Shared Folder angelegt |
| Aufruf aus Camunda Workflow (5.3) | | Worker ruft UiPath Orchestrator REST API auf (OAuth2 + ReleaseKey) |
| | ⚠️ Lizenzlimitierung | HKA-Bildungslizenz unterstuetzt keinen API-basierten Unattended-Start; manueller Start in Studio Web funktioniert |
| | ✅ Playwright fuer isolierte Tests | Playwright-Bot laeuft via `npm run rpa:test/demo` — nie automatisch im Prozess |
| | ✅ Screenshots als Audit-Trail | Zwei Screenshots pro Vorgang (vor + nach Speichern) |
| | ✅ Demo-Modus | Sichtbarer Browser mit verlangsamter Ausfuehrung fuer Praesentation |
| | ✅ Video-Aufnahme | Playwright zeichnet gesamte Automatisierung als `.webm` auf |
| | ✅ ERP-Referenznummer in Camunda | ERP-interne ID / UiPath Job-ID wird als Prozessvariable zurueckgegeben |
| | ✅ Automatischer Retry | Camunda startet RPA-Task bei Fehlern 2x neu (5s Verzoegerung) |
| | ✅ RPA-Modus-Anzeige | Worker zeigt beim Start ob UiPath korrekt konfiguriert ist |

### Infrastruktur (sprintuebergreifend)

| Extra | Beschreibung |
| --- | --- |
| ✅ Ein-Kommando-Start | `npm run start:servers` startet alle 4 Dienste automatisch |
| ✅ Camunda Worker im eigenen Fenster | Oeffnet sich automatisch separat damit Job-Logs sichtbar sind |
| ✅ Ein-Kommando-Stop | Beendet alle 4 Dienste sauber, auch ohne gespeicherte PIDs |
| ✅ Idempotenter Start | Erkennt laufende Prozesse und startet nicht doppelt |
| ✅ Aktive Port-Pruefung | Wartet bis Ports 50051 und 5672 tatsaechlich erreichbar sind |
| ✅ npm Scripts fuer alle Operationen | Kein manuelles `node ...` noetig |

---

## Troubleshooting

| Problem | Loesung |
| --- | --- |
| `ECONNREFUSED 50051` | `npm run start:servers` ausfuehren |
| `ECONNREFUSED 5672` | Docker Desktop starten, dann `npm run start:servers` |
| Camunda 504 beim Trigger | Operate im Browser oeffnen (Cluster aufwecken), dann erneut versuchen |
| Worker 401 Unauthorized | `.env` pruefen: `ZEEBE_CLIENT_ID` und `ZEEBE_CLIENT_SECRET` korrekt? |
| Task haengt in Operate | Operate → Instanz → Modify → Token verschieben |
| Formular fehlt im Tasklist | BPMN + alle Formulare zusammen neu in Camunda deployen |
| RPA-Bot schlaegt fehl | `npm run rpa:test` zum isolierten Testen; `RPA_HEADLESS=false` fuer sichtbare Ausfuehrung |
| Compliance-Check wird uebersprungen | BPMN neu deployen: `npm run deploy:bpmn` — complianceNeeded muss in Task_gRPC outputParameters stehen |
| Info-Schleife laeuft endlos | freigabe.form: infoNeeded Checkbox muss beim zweiten Durchlauf abgehakt werden (defaultValue=false) |
