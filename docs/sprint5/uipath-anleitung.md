# Sprint 5 — UiPath Dokumentation

## Was umgesetzt wurde

### 5.1 — UiPath Bot erstellt (Pflicht)

Bot in UiPath Studio Web erstellt:
- Tool: UiPath Studio Web (`cloud.uipath.com`)
- Tenant: `hkalshnhxm` / `DefaultTenant`
- Methode: App/Web Recorder — ERP-Formular aufgezeichnet
- ERP-URL: `https://anhe0003.github.io/this-and-that/ERP_Rechnungserfassung.html`

Aufgezeichnete Schritte:
1. Klick auf "Neue Rechnung"
2. Rechnungsnummer, Datum, Lieferant, Lieferantennummer, Zahlungsbedingungen, Notizen
3. Position hinzufügen mit Beschreibung, Menge, Einheit, Preis, 19% MwSt.
4. Rechnung speichern

### 5.2 — Bot getestet (Pflicht)

- Test in Studio Web über "Run" (Debug on cloud)
- Alle Schritte erfolgreich (`Successful` in Output-Panel)
- 11 erfolgreiche Runs in Orchestrator nachweisbar

### 5.3 — Einbindung in Camunda (Optional)

**Bereitstellung als Unattended Bot in UiPath Orchestrator:**
- Paket publiziert in Orchestrator (Shared Folder)
- Process angelegt: `ERP-Rechnungserfassung`
- Folder ID: `285336`
- External Application für API-Zugriff erstellt (`Camunda`, Scope: Orchestrator API Access)

**Aufruf aus dem Camunda Workflow:**
- Implementierung: UiPath Orchestrator REST API direkt aus dem Camunda Worker
- Endpoint: `https://cloud.uipath.com/{org}/{tenant}/orchestrator_/odata/Jobs/StartJobs`
- Authentifizierung: OAuth2 Client Credentials (`UIPATH_CLIENT_ID` + `UIPATH_CLIENT_SECRET`)
- Bei Prozessvariable `rpa-erp-entry` startet der Worker automatisch den UiPath Job
- Fallback auf Playwright wenn UiPath nicht konfiguriert

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

---

## RPA-Modus prüfen

Beim Start des Camunda Workers erscheint:

```
[INFO] UiPath Orchestrator konfiguriert – Bot wird über API gestartet
RPA-Modus: UiPath Orchestrator API
```

Oder bei fehlendem UiPath:

```
[INFO] UiPath nicht konfiguriert – Playwright-Fallback aktiv
RPA-Modus: Playwright
```

---

## Bot erneut in Studio Web öffnen

1. `https://cloud.uipath.com/hkalshnhxm/studio_/` öffnen
2. Projekt `RPA Workflow` auswählen
3. Bot bearbeiten oder erneut ausführen
