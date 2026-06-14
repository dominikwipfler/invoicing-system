# UiPath — Recherche und Vergleich mit Playwright

Dieses Dokument beschreibt wie UiPath theoretisch in den Camunda-8-Prozess integriert worden wäre,
vergleicht UiPath mit dem implementierten Playwright-Bot und dokumentiert die Entscheidung
für Playwright als produktiven Fallback.

---

## 1. Ausgangssituation

Im Sprint 5 war das Ziel, die ERP-Dateneingabe vollautomatisch per **Unattended Bot** zu
erledigen — ausgelöst direkt aus dem Camunda-Worker heraus.

**ERP-Zielseite:** `https://anhe0003.github.io/this-and-that/ERP_Rechnungserfassung.html`

**Felder die befüllt werden müssen:**

| Feld | Camunda-Variable |
| --- | --- |
| Rechnungsnummer | `invoiceNumber` |
| Rechnungsdatum | `invoiceDate` |
| Lieferant (Kundenname) | `supplierName` |
| Kundennummer | `invoiceId` |
| Zahlungsziel | fix: "30 Tage netto" |
| Positionen (Beschreibung, Menge, Einheit, Preis, MwSt.) | `lineItems[]` |

---

## 2. UiPath Camunda 8 Integration — Theoretischer Ablauf

### 2.1 Wie UiPath einen Zeebe Job abholen würde

Camunda 8 stellt externe Jobs über das **Zeebe gRPC-Protokoll** bereit. Ein UiPath-Bot
kann auf zwei Wegen mit Camunda 8 interagieren:

**Weg A — UiPath Camunda Connector (offiziell):**

UiPath bietet seit 2023 einen dedizierten **Camunda 8 Connector** im UiPath Marketplace.
Er funktioniert so:

```text
Camunda 8 (Zeebe Engine)
   │
   │  Service Task: type = "rpa-erp-entry"
   │  → Engine hält den Job bereit (Job-Queue)
   │
   ▼
UiPath Orchestrator
   │  → Camunda Connector abonniert "rpa-erp-entry" via gRPC/REST
   │  → Holt Job-Variablen ab (invoiceId, supplierName, amountEuro, ...)
   │
   ▼
UiPath Robot (Unattended)
   │  → Führt den Prozess aus (ERP-Formular ausfüllen)
   │  → Schreibt Ergebnis zurück (erpReferenzNummer)
   │
   ▼
Camunda 8 (Zeebe Engine)
   → Job wird als "completed" markiert
   → Prozess läuft weiter
```

**Weg B — Camunda REST API (alternativ):**

Der UiPath-Bot ruft aktiv die Camunda REST API ab:

1. `GET /v2/jobs/activation` → Job-Details mit Variablen holen
2. ERP-Formular ausfüllen
3. `POST /v2/jobs/{jobKey}/completion` → Job als erledigt markieren

### 2.2 Konfiguration im UiPath Orchestrator

```text
Orchestrator → Processes → ERP-Rechnungserfassung
  ├── Robot: Unattended (lizenzpflichtig!)
  ├── Asset: CAMUNDA_ZEEBE_ADDRESS = bru-2.zeebe.camunda.io:443
  ├── Asset: CAMUNDA_CLIENT_ID = <aus .env>
  ├── Asset: CAMUNDA_CLIENT_SECRET = <aus .env>
  └── Schedule: Job polling alle 10s (oder Webhook-Trigger)
```

---

## 3. Vergleich: UiPath vs. Playwright (dieser Implementierung)

| Kriterium | UiPath (Orchestrator) | Playwright (rpa-erp-bot.js) |
| --- | --- | --- |
| **Lizenz** | Kostenpflichtig (Unattended Robot) | Open Source (MIT) |
| **Integration Camunda** | Offizieller Connector im Marketplace | Direkter Node.js-Aufruf aus Worker |
| **ERP-Seite** | Identisch (App/Web Recorder) | Identisch (Playwright Locators) |
| **lineItems-Logik** | Schleife im UiPath-Workflow | `for`-Schleife in JS (Zeile 63–104) |
| **Screenshots** | Konfigurierbar per Activity | Automatisch vor/nach Speichern |
| **Video** | Konfigurierbar | Demo-Modus: `recordVideo` |
| **Fehlerbehandlung** | Try-Catch in Studio + Retry-Scope | try/catch + Camunda-Retry (2x, 5s) |
| **Headless-Modus** | Immer (Unattended) | `RPA_HEADLESS=false` für Demo |
| **Audit-Trail** | Orchestrator-Logs + Screenshots | `rpa/screenshots/*.png` + event-log.csv |
| **Verfügbarkeit HKA** | ⚠️ Bildungslizenz: kein Unattended-API-Start | ✅ Läuft lokal ohne Lizenz |
| **Produktionsreife** | Enterprise-Standard | Prototyp / Hochschulprojekt |

### Gleiche Felder, gleiche Logik

Beide Implementierungen befüllen exakt dieselben Felder in derselben Reihenfolge:

```text
invoiceNumber → invoiceDate → supplierName → invoiceId →
paymentTerms → (für jede Position:) beschreibung, menge, einheit, einzelpreis, MwSt 19%
→ "Rechnung speichern / aktualisieren"
```

Der UiPath-Bot (Studio Web, App/Web Recorder) wurde auf derselben ERP-URL aufgezeichnet
und ist daher funktional äquivalent zum Playwright-Bot.

---

## 4. Fazit — Playwright als produktiver Fallback

**UiPath nicht verfügbar → Playwright als vollwertiger Ersatz dokumentiert.**

### Warum UiPath nicht automatisch aus Camunda starten konnte

Die HKA-Bildungslizenz für UiPath umfasst **keinen Unattended Robot** für den
API-basierten Start aus dem Orchestrator. Das bedeutet:

- ✅ Bot in UiPath Studio Web aufgezeichnet und getestet (11 erfolgreiche Runs)
- ✅ Prozess `ERP-Rechnungserfassung` im Orchestrator publiziert
- ❌ API-Start (`POST /odata/Jobs/UiPath.Server.Configuration.OData.StartJobs`) schlägt
  fehl mit HTTP 403 — Lizenz enthält keine Unattended-Ausführung

### Playwright als vollwertiger Fallback

Der Playwright-Bot (`rpa/rpa-erp-bot.js`) ist **produktionsbereit** für dieses Projekt:

- Wird direkt aus dem Camunda-Worker (`rpa-erp-entry`) aufgerufen
- Befüllt alle ERP-Felder inkl. mehrerer `lineItems`-Positionen
- Erstellt automatisch Screenshots als Audit-Trail
- Demo-Modus: `npm run rpa:demo` zeigt sichtbaren Browser + Video
- Fehler werden als Camunda `RPA_ERROR` geworfen → automatischer Retry (2x, 5s)

### Testen

```powershell
# Headless (wie im Produktivbetrieb)
npm run rpa:test

# Sichtbarer Browser + Videoaufnahme (für Präsentation)
npm run rpa:demo
```
