# Frontend-Cockpit für die Rechnungsverarbeitung

## Ziel

Das Frontend-Cockpit ist ein **zentrales Demo- und Steuerungs-Interface** für den kompletten Rechnungsverarbeitungs-Workflow (Sprints 1–6). 

Es bietet:
- 🎯 **Ein-Klick-Testszenarios** (Standard-Rechnung / Compliance-Fall) ohne CLI nötig
- 📊 **Live-Status-Dashboard** mit Echtzeit-Prozessfortschritt aus `event-log.csv`
- 🔗 **Direktzugriff** auf Camunda Tasklist und Operate für Workflow-Monitoring
- ⏹️ **Graceful Shutdown** mit automatischer Browser-Fenster-Verwaltung
- 🎨 **HKA-Branding** mit echtem Logo von `h-ka.de`

**Adresse:** `http://localhost:4000` (automatisch beim Start geöffnet)

---

## Architektur

### Express-Server (`frontend/server.js`)

Lightweight Node.js-REST-API mit statischen Frontend-Assets:

```
frontend/
├── server.js              # Express.js (4.18+)
├── config.json            # Zentrale Konfiguration (URLs, Ports, Pfade)
├── package.json           # Dependencies (express nur)
└── public/
    ├── index.html         # HTML-Layout (Dark Theme)
    ├── app.js             # Frontend-Logik (Polling, API-Calls)
    ├── style.css          # CSS Variables + Dark Theme
    └── logo.svg           # HKA-Logo (201×66px)
```

### API-Endpoints

| Endpoint | Methode | Beschreibung |
|----------|---------|-------------|
| `GET /` | GET | Serve `index.html` |
| `GET /api/config` | GET | Return Camunda URLs (config.json) |
| `POST /api/trigger/standard` | POST | Starte Standard-Szenario: `npm run trigger:email:standard` |
| `POST /api/trigger/compliance` | POST | Starte Compliance-Szenario: `npm run trigger:email:compliance` |
| `GET /api/event-log` | GET | Parse + return letzte 15 Zeilen aus `event-log.csv` als JSON |
| `POST /api/shutdown` | POST | Graceful Shutdown: Kill Browser (PID), rufe `Stop-Server.ps1` auf, exit(0) |

### Konfiguration (`frontend/config.json`)

```json
{
  "server": {
    "port": 4000,
    "host": "localhost"
  },
  "camunda": {
    "region": "bru-2",
    "clusterId": "487e2664-45fe-4a21-9e53-860eddc37e5e",
    "urls": {
      "tasklist": "https://bru-2.tasklist.camunda.io/...",
      "operate": "https://bru-2.operate.camunda.io/..."
    }
  },
  "paths": {
    "eventLog": "event-log.csv",
    "pidFile": ".frontend-browser.pid"
  }
}
```

---

## Features

### 1. Testszenarios per Button

Zwei große Buttons starten den Prozess mit vorkonfiguriertem Szenario:

**▶ Standard-Rechnung** (15.470€, 92% KI-Konfidenz)
- PDF: `ai-agent/test-invoice.pdf` (TechSolutions)
- Ablauf: Vollautomatisch → gRPC → ERP
- Zeigt optimalen Flow ohne menschliche Intervention

**⚠ Compliance-Fall** (52.360€, 65% KI-Konfidenz)
- PDF: `ai-agent/test-invoice-2.pdf` (Nordwind IT)
- Ablauf: KI-Prüfung + Compliance-Check erforderlich
- Zeigt Human-in-the-Loop + Validierungsprozess

Jeder Button ist deaktivierbar während ein Prozess läuft.

### 2. Live-Status Dashboard

**2-Sekunden-Polling** auf `GET /api/event-log`:
- Monospace-Font für Zeitleisten-Darstellung
- Zeigt Case ID, Aktivität, Zeitstempel, Ressource
- Scrollable Container (max-height 400px)
- Automatisches Scroll zu neuesten Einträgen

Beispiel-Zeile: `12:45:30 [gRPC Service] Task_gRPC komplettiert`

### 3. Camunda-Navigation

Zwei Knöpfe öffnen Camunda-Interfaces in neuem Tab:

- 📋 **Tasklist öffnen**: `https://bru-2.tasklist.camunda.io/...` (User-Task-Management)
- 🔍 **Operate öffnen**: `https://bru-2.operate.camunda.io/...` (Process Monitoring)

### 4. Graceful Shutdown

**🔴 Herunterfahren-Button** (rot, oben-rechts):

1. Bestätigungsdialog: "Wirklich das System herunterfahren?"
2. POST `/api/shutdown` auf dem Frontend-Server
3. Server-Seite:
   - Versucht Browser-Fenster zu schließen (via gespeicherte PID)
   - Ruft `Stop-Server.ps1` auf (alle Services stoppen)
   - Antwortet mit JSON `{success: true}`
4. Client zeigt Toast "System wird heruntergefahren"
5. Nach 2 Sekunden wird Browser-Fenster geschlossen (falls nicht via API gelang)

---

## HKA-Branding

### Echtes Logo

Das HKA-Logo wurde direkt von `https://www.h-ka.de` extrahiert (inline SVG):

```xml
<svg width="201" height="66" viewBox="0 0 201 66" ...>
  <path fill="currentColor" d="M16.713 50.801c1.562 0 2.747.645 3.394 1.72..." />
</svg>
```

**Eigenschaften:**
- Größe: 201×66 Pixel (in `style.css` definiert)
- Platzierung: Oben-links im Header, neben Titel
- Farbe: `fill="currentColor"` → CSS-Variable `--color-primary: #00bcd4` (HKA Cyan)
- Hintergrund: Dark Theme (--color-bg-dark: #0f1419)

### Dark Theme mit HKA-Cyan

CSS-Variablen für konsistentes Branding:

```css
--color-primary: #00bcd4;           /* HKA Cyan */
--color-primary-dark: #0097a7;
--color-bg-dark: #0f1419;           /* Sehr dunkler BG */
--color-bg-card: #1a1f2e;           /* Card BG */
--color-border: #2a3f5f;
```

Animationen mit HKA-Cyan Glow auf Button-Hover.

---

## Integration in Start-Server.ps1 / Stop-Server.ps1

### Start-Server.ps1 — Schritt 5/5

```powershell
Write-Step '5/5' 'Frontend-Cockpit starten'

# npm install falls node_modules fehlt
if (-not (Test-Path "$frontendDir/node_modules")) {
  npm install (in frontend/)
}

# Starte node frontend/server.js
$frontendProcess = Start-Process -FilePath node `
  -ArgumentList 'frontend/server.js' `
  -WorkingDirectory $scriptRoot `
  -NoNewWindow -PassThru

# Warte auf Port 4000 (bis 15 Sekunden)
$frontendReady = Test-TcpPort -HostName '127.0.0.1' -Port 4000

# Öffne Browser automatisch
# Versuche: Edge → Chrome → Fallback-Warnung
$browserPath = (Edge oder Chrome path)
$browserProcess = Start-Process -FilePath $browserPath `
  -ArgumentList '--new-window http://localhost:4000' -PassThru

# Speichere Browser-PID für späteren Shutdown
$browserProcess.Id | Out-File -FilePath '.runtime/frontend-browser.pid'
```

**Ausgabe:**
```
[5/5] Frontend-Cockpit starten
  [i] Frontend-Cockpit wird gestartet...
  [OK] Frontend-Cockpit gestartet (PID 12345).
  [i] Warte auf Frontend-Cockpit auf Port 4000...
  [OK] Frontend-Cockpit ist auf Port 4000 erreichbar.
  [i] Öffne Browser-Fenster...
  [OK] Browser geöffnet (PID 54321).
```

### Stop-Server.ps1 — Schritt 1/5

```powershell
Write-Step '1/5' 'Frontend-Cockpit beenden'

# Graceful Shutdown via API
try {
  Invoke-RestMethod -Uri 'http://localhost:4000/api/shutdown' `
    -Method Post -TimeoutSec 3 | Out-Null
  Write-Success 'Shutdown-Signal gesendet.'
  Start-Sleep -Milliseconds 500
} catch {
  Write-Warn 'Shutdown-API nicht erreichbar, beende Prozess direkt.'
}

# Fallback: Beende Frontend-Prozess
Stop-NodeProcess -ProcessId $frontendService.ProcessId

# Beende Browser (via gespeicherte PID)
if (Test-Path '.runtime/frontend-browser.pid') {
  $browserPid = Get-Content '.runtime/frontend-browser.pid'
  Stop-Process -Id $browserPid -Force -ErrorAction SilentlyContinue
  Remove-Item '.runtime/frontend-browser.pid'
}
```

**Ausgabe:**
```
[1/5] Frontend-Cockpit beenden
  [i] Sende Shutdown-Signal an Frontend-Server...
  [OK] Shutdown-Signal gesendet.
  [OK] Frontend-Cockpit wurde beendet.
  [OK] Browser-Fenster geschlossen.
```

---

## Bekannte Einschränkungen

| Einschränkung | Grund | Workaround |
|---------------|-------|-----------|
| Browser-Steuerung nur Edge/Chrome | PowerShell `Start-Process` + PID-Tracking nur unter Windows | Firefox/Safari öffnen manuell; Cockpit läuft trotzdem |
| event-log.csv muss existieren | GET `/api/event-log` parst CSV-Datei | Event-Log wird beim ersten Trigger erstellt |
| Port 4000 blockiert | Andere Service nutzt Port | `netstat -ano \| findstr :4000` → PID beenden |
| CORS nur localhost | Frontend und Backend auf localhost | Externe Zugriffe nicht möglich (by design) |

---

## Anleitung: Cockpit nutzen (Schritt-für-Schritt)

### 1. System starten

```powershell
cd C:\Uni\DVG\Repository\invoicing-system
.\Start-Server.ps1
```

**Erwartet:**
- PowerShell zeigt Banner + Statusmeldungen
- Browser öffnet sich automatisch mit `http://localhost:4000`
- Drei Karten sichtbar: "Prozess starten", "Live-Status", "Navigation"

### 2. Standard-Szenario starten

1. Klick auf **▶ Standard-Rechnung**
2. Status zeigt: "Starte Standard-Rechnung..."
3. Toast-Benachrichtigung unten-rechts: "Standard-Rechnung wurde erfolgreich gestartet."
4. Live-Status-Card zeigt erste Events:
   ```
   12:45:30 [Camunda Worker] Task_Receive komplettiert
   12:45:31 [AI-Agent] KI-Extraktion: 92% Konfidenz
   12:45:32 [gRPC Service] Task_gRPC gestartet
   ...
   ```

### 3. Compliance-Szenario mit menschlicher Prüfung

1. Klick auf **⚠ Compliance-Fall**
2. Status: "Starte Compliance-Fall..."
3. Events zeigen KI-Extraktion mit 65% Konfidenz
4. Process stoppt bei **Task_KI_Pruefung** → menschliche Überprüfung nötig
5. Klick auf **📋 Tasklist öffnen** → neuer Tab mit Camunda Tasklist
6. Dort sieht man "KI-Prüfung" Task
7. Sachbearbeiter prüft/korrigiert die KI-Daten
8. Nach Freigabe läuft Prozess weiter

### 4. Tasklist/Operate öffnen

- **📋 Tasklist:** Alle aktiven User-Tasks
- **🔍 Operate:** Process-Instances, Variables, Logs

### 5. System herunterfahren

1. Klick auf **🔴 Herunterfahren** (oben-rechts)
2. Dialog: "Wirklich das System herunterfahren? Browser und Services werden beendet."
3. Bestätige mit "OK"
4. Toast: "System wird heruntergefahren..."
5. Nach ~2 Sekunden: Browser schließt sich automatisch
6. PowerShell zeigt:
   ```
   [1/5] Frontend-Cockpit beenden
   [OK] Browser-Fenster geschlossen.
   [2/5] gRPC Service beenden
   ...
   ```

---

## Verwendete Technologien

| Technologie | Verwendungszweck |
|-------------|-----------------|
| **Express.js 4.18+** | REST-API für Testszenarios + Shutdown |
| **Node.js 16+** | Backend-Runtime |
| **Vanilla JavaScript** | Frontend-Logik (Polling, DOM-Updates) |
| **CSS3 Variables** | Dark Theme + HKA-Branding |
| **SVG** | HKA-Logo (skalierbar, echte Vektorform) |
| **CSV-Parser** | event-log.csv zeilenweise lesen |
| **PowerShell** | Browser-Steuerung + Shutdown-Orchestrierung |
| **Windows API** | Process-Management (PID, Ports) |

---

## Zusammenfassung

Das Frontend-Cockpit ist:
- ✅ **Einfach zu nutzen**: Zwei Knöpfe für die wichtigsten Szenarien
- ✅ **Echtzeitfeedback**: 2-Sekunden-Updates aus event-log.csv
- ✅ **Vollständig integriert**: Automatischer Start/Stopp in PowerShell-Skripten
- ✅ **Professional designed**: HKA-Branding, Dark Theme, keine Abhängigkeiten (nur Express)
- ✅ **Produktionsreif**: Graceful Shutdown, Error-Handling, Fallbacks

**Adresse:** `http://localhost:4000` (ab Schritt 5/5 im Start-Server.ps1)
