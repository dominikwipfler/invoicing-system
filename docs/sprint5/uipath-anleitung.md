# Sprint 5 — UiPath Anleitung

## Status

| Aufgabe | Status |
|---|---|
| 5.1 UiPath Bot in Studio Web erstellt | ✅ Fertig |
| 5.2 Bot erfolgreich getestet (Run) | ✅ Fertig |
| Bot in Orchestrator publiziert (Publish) | ✅ Fertig |
| External Application "Camunda" angelegt | ⏳ Fast fertig — Scope noch ausstehend |
| Process in Orchestrator anlegen | ❌ Noch offen |
| 5.3 Camunda UiPath Connector konfigurieren | ❌ Noch offen |

---

## Was noch zu tun ist — in dieser Reihenfolge

---

### SCHRITT 1 — External Application fertigstellen (5 Minuten)

**Ziel:** Client ID + Client Secret bekommen, damit Camunda UiPath aufrufen darf.

1. Öffne: `https://cloud.uipath.com/hkalshnhxm/portal_/admin/external-apps`
2. Klicke auf die Application **"Camunda"** (die du vorhin angelegt hast)
3. Klicke auf **"Add Scopes"** oder **"Edit"**
4. In der Scope-Liste: klicke auf **"Orchestrator API Access"**
5. Klicke **"Update"** oder **"Save"**
6. Klicke unten auf **"Add"** → die Application wird gespeichert
7. Du siehst jetzt:
   - **Client ID** — kopiere sie
   - **Client Secret** — kopiere ihn sofort (wird nur einmal angezeigt!)
8. Gib mir Client ID und Client Secret

---

### SCHRITT 2 — Process in Orchestrator anlegen (3 Minuten)

**Ziel:** Den publizierten Bot als ausführbaren Process registrieren.

1. Öffne: `https://cloud.uipath.com/hkalshnhxm/DefaultTenant/orchestrator_`
2. Oben in der Navigation: klicke **"Automations"**
3. Im Dropdown: klicke **"Processes"**
4. Klicke **"+"** (oben rechts)
5. Bei **"Package"**: wähle **"RPA Workflow"** aus der Liste
6. Name: `ERP-Rechnungserfassung`
7. Klicke **"Create"**

---

### SCHRITT 3 — Camunda Secrets anlegen (3 Minuten)

**Ziel:** Client ID und Secret sicher in Camunda speichern (nicht im Code).

1. Öffne: `https://console.cloud.camunda.io`
2. Klicke auf dein Cluster (das mit `bru-2`)
3. Linkes Menü: **"Secrets"**
4. Klicke **"+ Create"** — lege diese zwei Secrets an:

| Secret Name | Wert |
|---|---|
| `UIPATH_CLIENT_ID` | deine Client ID aus Schritt 1 |
| `UIPATH_CLIENT_SECRET` | dein Client Secret aus Schritt 1 |

---

### SCHRITT 4 — BPMN in Camunda Web Modeler anpassen (10 Minuten)

**Ziel:** Den ERP-Task von Playwright-Worker auf UiPath Connector umstellen.

1. Öffne: `https://modeler.camunda.io`
2. Öffne dein Projekt → öffne `G4_sprint_4.bpmn`
3. Klicke auf den Task **"Rechnungsdaten ins ERP System eingeben (RPA)"**
4. Rechts im Panel: klicke auf das **Schraubenschlüssel-Icon** oder **"Change type"**
5. Suche nach **"UiPath"** in der Connector-Liste
6. Wähle **"UiPath Outbound Connector"**
7. Konfiguriere die Felder:

| Feld | Wert |
|---|---|
| Orchestrator URL | `https://cloud.uipath.com` |
| Organization | `hkalshnhxm` |
| Tenant | `DefaultTenant` |
| Client ID | `{{secrets.UIPATH_CLIENT_ID}}` |
| Client Secret | `{{secrets.UIPATH_CLIENT_SECRET}}` |
| Folder Path | `My Workspace` |
| Process Name | `ERP-Rechnungserfassung` |
| Input Arguments | (siehe unten) |

Input Arguments (JSON):
```json
{
  "invoiceNumber": "{{invoiceNumber}}",
  "invoiceDate": "{{invoiceDate}}",
  "supplierName": "{{supplierName}}",
  "invoiceId": "{{invoiceId}}",
  "amountEuro": "{{amountEuro}}"
}
```

8. Klicke **"Deploy"** → BPMN wird in Camunda deployed

---

### SCHRITT 5 — Testen

1. `npm run trigger:email` ausführen
2. In Camunda Tasklist die manuellen Schritte durchführen
3. Wenn der ERP-Task erreicht wird → UiPath Orchestrator startet den Bot automatisch
4. Bot füllt das ERP-Formular aus
5. Prozess läuft weiter bis zum Ende

---

## Für mich — was ich vorbereitet habe

- `.env.example` mit UiPath-Credential-Platzhaltern aktualisiert
- Sobald du mir Client ID + Secret gibst und Schritt 3 (Camunda Secrets) erledigt ist, kann ich die BPMN-Datei lokal vorbereiten

---

## Kurzfassung — deine To-Do-Liste

- [ ] Schritt 1: External App → Scope hinzufügen → Client ID + Secret kopieren → mir geben
- [ ] Schritt 2: Orchestrator → Automations → Processes → Process anlegen
- [ ] Schritt 3: Camunda Console → Secrets → UIPATH_CLIENT_ID + UIPATH_CLIENT_SECRET
- [ ] Schritt 4: Web Modeler → ERP-Task → UiPath Connector → Deploy
- [ ] Schritt 5: Testen mit `npm run trigger:email`
