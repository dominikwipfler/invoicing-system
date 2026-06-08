# Sprint 5 — Anleitung für Kommilitonen

Diese Anleitung beschreibt die verbleibenden Schritte für Sprint 5.3 (Camunda UiPath Integration).

**Voraussetzung:** Dominik hat euch per E-Mail zum UiPath-Tenant eingeladen — Einladung zuerst annehmen.

---

## SCHRITT 1 — UiPath Einladung annehmen

1. Prüft euer E-Mail-Postfach auf eine Einladung von UiPath
2. Klickt auf den Link in der E-Mail → ihr werdet zu cloud.uipath.com weitergeleitet
3. Mit eurem Google-Account (`kimkaul01@gmail.com`) anmelden
4. Einladung bestätigen → ihr seid jetzt im HKA-Tenant (`hkalshnhxm`)

---

## SCHRITT 2 — Process in Orchestrator anlegen

1. Öffne: `https://cloud.uipath.com/hkalshnhxm/DefaultTenant/orchestrator_`
2. Im linken Sidebar: klicke auf **"Shared"**
3. Im linken Sidebar erscheint jetzt **"Processes"** — klicke darauf
4. Klicke oben rechts auf **"+"** oder **"Add Process"**
5. Fülle aus:
   - **Package Name**: `RPA Workflow` (aus Dropdown auswählen)
   - **Process Name**: `ERP-Rechnungserfassung`
   - **Description**: `Sprint 5 — ERP RPA Bot`
6. Klicke **"Create"**

---

## SCHRITT 3 — Camunda Secrets anlegen

Die UiPath-Credentials müssen sicher in Camunda hinterlegt werden.

1. Öffne: `https://console.cloud.camunda.io`
2. Klicke auf euren Cluster (der mit `bru-2` in der Adresse)
3. Im linken Menü: klicke auf **"Secrets"**
4. Klicke **"+ Create"** — legt diese zwei Secrets an:

| Secret Name | Wert |
|---|---|
| `UIPATH_CLIENT_ID` | `fd5afc9c-cd27-4350-b73c-e8bbd946cff2` |
| `UIPATH_CLIENT_SECRET` | `tAN1~uFM7rT9bBE0mZ#)hSY~5@Jks0W8vmondoNzK3juEpKecHMcx6M!L~)_3h%x` |

Für jedes Secret: Name eingeben → Wert einfügen → **"Create"** klicken.

---

## SCHRITT 4 — BPMN in Camunda Web Modeler anpassen

1. Öffne: `https://modeler.camunda.io`
2. Öffnet euer Projekt → öffnet `G4_sprint_4.bpmn`
3. Klickt auf den Task **"Rechnungsdaten ins ERP System eingeben (RPA)"**
4. Rechts im Properties-Panel: klickt auf **"Change type"** oder das Template-Icon
5. Sucht nach **"UiPath"** → wählt **"UiPath Outbound Connector"**
6. Konfiguriert die Felder:

| Feld | Wert |
|---|---|
| Orchestrator URL | `https://cloud.uipath.com` |
| Organization | `hkalshnhxm` |
| Tenant | `DefaultTenant` |
| Client ID | `{{secrets.UIPATH_CLIENT_ID}}` |
| Client Secret | `{{secrets.UIPATH_CLIENT_SECRET}}` |
| Folder Path | `Shared` |
| Process Name | `ERP-Rechnungserfassung` |

7. Klickt oben auf **"Deploy"**

---

## SCHRITT 5 — Testen

1. Stellt sicher dass alle Services laufen:
   ```powershell
   npm run start:servers
   ```
2. Neuen Prozess starten:
   ```powershell
   npm run trigger:email
   ```
3. In Camunda Tasklist die manuellen Schritte durchführen:
   - Rechnungsdaten erfassen
   - Rechnung prüfen und validieren
   - Rechnung freigeben
4. Wenn der ERP-Task erreicht wird → UiPath Bot startet automatisch
5. Bot füllt das ERP-Formular aus
6. Prozess läuft bis zum Ende durch

**Camunda Links:**
- Tasklist: `https://bru-2.tasklist.camunda.io/487e2664-45fe-4a21-9e53-860eddc37e5e`
- Operate: `https://bru-2.operate.camunda.io/487e2664-45fe-4a21-9e53-860eddc37e5e`

---

## Zusammenfassung

| Schritt | Was | Wo |
|---|---|---|
| 1 | Einladung annehmen | E-Mail |
| 2 | Process anlegen | UiPath Orchestrator → Shared → Processes |
| 3 | Secrets anlegen | Camunda Console → Cluster → Secrets |
| 4 | BPMN updaten + deployen | Camunda Web Modeler |
| 5 | Testen | Terminal + Camunda Tasklist |