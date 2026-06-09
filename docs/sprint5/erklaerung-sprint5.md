# Sprint 5 — Dokumentation

## Sprint-Titel

**RPA-Integration: UiPath Bot für automatische ERP-Erfassung**

## Teammitglieder

- Dominik Wipfler
- Kim Kaul
- Leon Jungkind
- Lasse

---

## Ziel des Sprints

In Sprint 5 wurde der Rechnungsprozess um einen **RPA-Schritt (Robotic Process Automation)** erweitert. Statt die ERP-Erfassung manuell über ein Camunda-Formular durchzuführen, übernimmt ein **UiPath-Bot** das automatische Ausfüllen des ERP-Webformulars. Ziel war es, einen unattended Bot in UiPath Studio Web zu erstellen, zu testen und optional aus dem Camunda-Workflow heraus automatisch zu starten.

---

## Was wir umgesetzt haben

### 5.1 — UiPath Bot erstellt (Pflicht)

Ein Automatisierungs-Bot wurde in **UiPath Studio Web** mit dem App/Web Recorder aufgezeichnet:

- **Tool**: UiPath Studio Web (`cloud.uipath.com`)
- **Tenant**: `hkalshnhxm` / `DefaultTenant`
- **Ziel-URL**: `https://anhe0003.github.io/this-and-that/ERP_Rechnungserfassung.html`

Aufgezeichnete Schritte:
1. Klick auf „Neue Rechnung"
2. Felder ausfüllen: Rechnungsnummer, Datum, Lieferant, Lieferantennummer, Zahlungsbedingungen, Notizen
3. Position hinzufügen: Beschreibung, Menge, Einheit, Preis, 19 % MwSt.
4. Rechnung speichern

### 5.2 — Bot getestet (Pflicht)

- Test direkt in Studio Web über „Run" (Debug on Cloud)
- Alle Schritte mit Status `Successful` im Output-Panel
- **11 erfolgreiche Runs** im UiPath Orchestrator nachweisbar

### 5.3 — Einbindung in Camunda (Optional)

Der UiPath-Bot wurde als **Unattended Bot** im Orchestrator bereitgestellt und kann direkt aus dem Camunda-Worker aufgerufen werden:

**Orchestrator-Konfiguration:**
- Paket publiziert in Orchestrator (Shared Folder)
- Process angelegt: `ERP-Rechnungserfassung`
- Folder ID: `285336`
- External Application für API-Zugriff: `Camunda` (Scope: Orchestrator API Access)

**Technische Umsetzung im Camunda Worker (`sprint4/camunda-worker.js`):**
- Neuer Service-Task-Typ: `rpa-erp-entry`
- Authentifizierung: OAuth2 Client Credentials (UIPATH_CLIENT_ID + UIPATH_CLIENT_SECRET)
- API-Endpunkt: `https://cloud.uipath.com/{org}/{tenant}/orchestrator_/odata/Jobs/StartJobs`
- Bei vorhandenem UiPath-Token: Bot wird gestartet, Job-ID wird als Prozessvariable zurückgegeben
- Bei fehlendem UiPath (`.env` ohne Keys): Job schlägt mit klarer Fehlermeldung fehl (kein stiller Fallback)

**Konfiguration in `.env`:**
```
UIPATH_CLIENT_ID=...
UIPATH_CLIENT_SECRET=...
UIPATH_ORGANIZATION=hkalshnhxm
UIPATH_TENANT=DefaultTenant
UIPATH_FOLDER=Shared
UIPATH_FOLDER_ID=285336
UIPATH_PROCESS_NAME=ERP-Rechnungserfassung
```

**Ausgabe beim Worker-Start:**
```
[INFO] UiPath Orchestrator konfiguriert – Bot wird über API gestartet
RPA-Modus: UiPath Orchestrator API
```

### Playwright-Bot (`sprint5/rpa-erp-bot.js`) — nur für Tests und Demos

Als Fallback und für isolierte Demonstrations- und Testzwecke existiert ein Playwright-Bot. Dieser läuft **nie automatisch im Camunda-Prozess**, sondern ausschließlich über npm-Scripts:

```powershell
npm run rpa:test   # Headless (kein Browserfenster)
npm run rpa:demo   # Sichtbarer Browser + Videoaufnahme (für Präsentation)
```

---

## Ergebnisse

- UiPath Bot erfolgreich erstellt und in Studio Web aufgezeichnet
- 11 erfolgreiche Test-Runs im UiPath Orchestrator dokumentiert
- Camunda Worker abonniert den Task-Typ `rpa-erp-entry` und startet den Bot per REST-API
- Prozessvariable `erpReferenzNummer` (Wert: `UIPATH-<JobId>`) wird nach erfolgreichem Bot-Start an Camunda zurückgegeben
- Event-Logging: `RPA ERP Entry Started`, `RPA ERP Entry via UiPath` und `RPA ERP Entry Failed` werden in `event-log.csv` geschrieben

---

## Extras und Erweiterungen

| Gefordert | Extra | Beschreibung |
|---|---|---|
| UiPath Bot erstellen (5.1) | | Bot in UiPath Studio Web mit App/Web Recorder aufgezeichnet |
| Bot testen (5.2) | | Erfolgreich getestet (Debug on cloud, 11 erfolgreiche Runs) |
| Unattended Bot in Orchestrator (5.3) | | Paket publiziert, Process `ERP-Rechnungserfassung` in Shared Folder angelegt |
| Aufruf aus Camunda Workflow (5.3) | | Worker ruft UiPath Orchestrator REST API auf (OAuth2 + ReleaseKey) |
| | ⚠️ Lizenzlimitierung | HKA-Bildungslizenz unterstützt keinen API-basierten Unattended-Start; manueller Start in Studio Web funktioniert |
| | ✅ Playwright für isolierte Tests | Playwright-Bot läuft via `npm run rpa:test/demo` — nie automatisch im Prozess |
| | ✅ Screenshots als Audit-Trail | Zwei Screenshots pro Vorgang (vor + nach Speichern) in `sprint5/screenshots/` |
| | ✅ Demo-Modus | Sichtbarer Browser mit verlangsamter Ausführung für Präsentation |
| | ✅ Video-Aufnahme | Playwright zeichnet gesamte Automatisierung als `.webm` auf |
| | ✅ ERP-Referenznummer in Camunda | UiPath Job-ID wird als Prozessvariable `erpReferenzNummer` zurückgegeben |
| | ✅ Automatischer Retry | Camunda startet RPA-Task bei Fehlern 2× neu (5s Verzögerung) |
| | ✅ RPA-Modus-Anzeige | Worker zeigt beim Start ob UiPath korrekt konfiguriert ist |

---

## Probleme / Erkenntnisse

- **Lizenzproblem**: Die HKA-Bildungslizenz erlaubt keinen API-basierten Unattended-Start — der Bot lässt sich im Orchestrator konfigurieren, aber nicht automatisch per API auf einem Cloud-Robot starten. Manuelle Ausführung in Studio Web funktioniert weiterhin.
- **Release Key vs. Process Name**: Der Job-Start per API benötigt einen `ReleaseKey` (UUID), nicht nur den Prozessnamen. Dieser muss einmalig aus dem Orchestrator ausgelesen und in die `.env` eingetragen werden.
- **OAuth2-Token-Handling**: Der Token hat begrenzte Gültigkeit — bei vielen Prozessinstanzen in kurzer Folge kann es zu Token-Fehlern kommen.
- **Erkenntnis**: RPA eignet sich gut für repetitive, UI-basierte Aufgaben, aber Lizenz- und Infrastrukturkosten für echten unattended Betrieb sind erheblich. Der Playwright-Bot war wertvoller als erwartet, da er vollständig ohne Cloud-Abhängigkeit und Lizenzprobleme lauffähig ist.

---

## Offene Punkte / Nächster Sprint

- AI-Workflow / Agent-Integration mit n8n (→ Sprint 6)
- Persönliche Zusammenfassung (2 Seiten pro Person) für das Portfolio

---

## Technologie-Stack

| Technologie | Einsatz |
|---|---|
| UiPath Studio Web | Bot-Erstellung per App/Web Recorder |
| UiPath Orchestrator | Bot-Deployment, Unattended Runs, API-Zugriff |
| UiPath Orchestrator REST API | Programmatischer Job-Start aus Camunda |
| OAuth2 Client Credentials | Authentifizierung gegen UiPath Cloud |
| Camunda 8 / Zeebe Worker | Einbindung des RPA-Schritts in den BPMN-Prozess |
| Playwright | Isolierter Test- und Demo-Bot mit Screenshot + Video |
| Node.js (`fetch`) | HTTP-Aufrufe gegen UiPath API |
| CSV | Event-Logging der RPA-Schritte |
