# Sprint 4 — Dokumentation

## Sprint-Titel

**Camunda-Integration: BPMN-Prozess, Formulare und E-Mail-Trigger**

## Teammitglieder

- Dominik Wipfler
- Kim Kaul
- Leon Jungkind
- Lasse

---

## Ziel des Sprints

In Sprint 4 wurde die bisher selbst entwickelte Workflow-Engine durch **Camunda 8** ersetzt. Statt eines eigenen In-Memory-Orchestrators läuft der Rechnungsprozess jetzt als offizielles BPMN-Modell in einer professionellen Process-Engine. Ziel war es, den Prozess visuell modellieren, in Camunda deployen und über User-Tasks mit echten Formularen steuern zu können.

---

## Was wir umgesetzt haben

### 1. BPMN-Prozessmodell (`sprint4/G4_sprint_4.bpmn`)

Der vollständige Rechnungsprozess wurde als BPMN 2.0-Modell für Camunda 8 neu modelliert:

- **Start-Event**: Eingehende E-Mail (simuliert durch `trigger-from-email.js`)
- **Service Tasks** (automatisch, via Camunda Worker):
  - `receive-invoice` — Rechnung entgegennehmen, `invoiceId` vergeben
  - `grpc-save-invoice` — Metadaten per gRPC speichern, `dataComplete` prüfen
  - `rabbitmq-payment` — Zahlungsauftrag per RabbitMQ abschicken
  - `archive-invoice` — Rechnung archivieren und Event loggen
- **User Tasks** (manuell, mit Camunda Forms):
  - Rechnungserfassung (Formular: `rechnungserfassung.form`)
  - Freigabe durch Sachbearbeiter (Formular: `freigabe.form`)
  - ERP-Bestätigung (Formular: `erp-bestaetigung.form`)
- **Gateway**: Datenvollständigkeit prüfen — bei unvollständigen Daten zurück zur Erfassung

### 2. Camunda Formulare (`sprint4/forms/`)

Drei JSON-basierte Camunda-Formulare erstellt, die direkt an die User Tasks im BPMN gebunden sind:

| Formular | Zweck |
|---|---|
| `rechnungserfassung.form` | Lieferant, Rechnungsnummer, Betrag, Datum, Zahlungsbedingungen eingeben |
| `freigabe.form` | Freigabe oder Ablehnung der Rechnung durch Sachbearbeiter |
| `erp-bestaetigung.form` | Bestätigung der ERP-Erfassung nach automatischer Verarbeitung |

### 3. E-Mail-Trigger (`sprint4/trigger-from-email.js`)

Skript zum Starten einer neuen Prozessinstanz in Camunda 8 per Kommandozeile — simuliert den Eingang einer Lieferantenrechnung per E-Mail. Übergibt `emailFrom`, `emailSubject` und `emailReceivedAt` als Prozessvariablen.

```powershell
node sprint4/trigger-from-email.js lieferant@beispiel.de "Rechnung RG-2026-042"
```

### 4. Camunda Worker (`sprint4/camunda-worker.js`)

Der Worker abonniert alle Service-Task-Typen des BPMN-Prozesses und verbindet Camunda mit den bestehenden Infrastrukturkomponenten:

- **gRPC**: Speichert Rechnungsmetadaten im gRPC-Service
- **RabbitMQ**: Sendet Zahlungsaufträge asynchron in die `payment_requests`-Queue
- **Event-Logging**: Jeder Schritt schreibt einen Eintrag in `event-log.csv`

### 5. Deploy- und Hilfsskripte

- `sprint4/deploy-bpmn.js` — deployed das BPMN-Modell direkt in den Camunda-Cluster
- `sprint4/cancel-incidents.js` — bricht fehlerhafte Prozessinstanzen im Camunda Operate ab

---

## Ergebnisse

- BPMN-Prozess erfolgreich in Camunda Cloud (Cluster `487e2664`, Region `bru-2`) deployed
- Prozessinstanzen werden in **Camunda Operate** visualisiert und überwacht
- User Tasks erscheinen in **Camunda Tasklist** und können per Formular bearbeitet werden
- End-to-End-Test: E-Mail-Trigger → Formular-Erfassung → Freigabe → Zahlung → Archivierung
- Event-Log enthält alle Schritte für späteres Process Mining

---

## Extras und Erweiterungen

| Gefordert | Extra | Beschreibung |
|---|---|---|
| Start per E-Mail | | Start-Event im BPMN |
| Manuelle Metadaten-Extraktion | | `rechnungserfassung.form` |
| Speicherung per gRPC | | `grpc-save-invoice` Worker |
| ERP-Erfassung manuell | | `erp-bestaetigung.form` |
| Zahlung via Messaging | | `rabbitmq-payment` Worker |
| | ✅ E-Mail-Trigger Script | Startet Prozessinstanz mit simulierten E-Mail-Metadaten (Absender, Betreff, Zeitstempel) |
| | ✅ BPMN Boundary Error Events | gRPC-Fehler → Korrektur-Task für Sachbearbeiter → Retry; Payment-Fehler → dediziertes End Event |
| | ✅ Datenvollständigkeit per Gateway | Worker setzt `dataComplete` — BPMN entscheidet automatisch ob Nacherfassung nötig ist |
| | ✅ Compliance- und Info-Gateways | Optionale Prozesszweige für Finanzprüfung und Lieferanten-Rückfragen |
| | ✅ ERP-Formular mit Prozesskontext | Formular zeigt Rechnungsdaten direkt aus Camunda-Variablen |
| | ✅ Datumsnormalisierung | ISO-Format automatisch auf YYYY-MM-DD normalisiert (gRPC-Kompatibilität) |
| | ✅ IPv4-Fix | `localhost` → `127.0.0.1` verhindert IPv6-Fehler unter Windows |
| | ✅ Persistente RabbitMQ-Verbindung | Auto-Reconnect statt Neuverbindung pro Job |
| | ✅ Camunda 504 Retry | Trigger wartet automatisch bis Cluster aus Standby aufgewacht ist |
| | ✅ Vollständiges Event-Logging | Alle 5 automatischen Schritte schreiben Celonis-kompatible Events in `event-log.csv` |

---

## Probleme / Erkenntnisse

- **Datums-Format**: Camunda übergibt Datumsfelder im ISO-Format — der Worker musste das Datum auf `YYYY-MM-DD` normalisieren, da der gRPC-Service nur dieses Format akzeptiert.
- **Pflichtfeld-Validierung im Gateway**: Das `dataComplete`-Flag muss explizit im Worker gesetzt werden, da BPMN-Gateways nur auf Prozessvariablen reagieren — keine implizite Validierung.
- **IPv6 unter Windows**: Node.js löst `localhost` unter Windows teilweise als IPv6 (`::1`) auf, was Verbindungsabbrüche zu gRPC und RabbitMQ verursacht. Fix: explizit `127.0.0.1` verwenden.
- **Camunda Cluster-Standby**: Der SaaS-Cluster schläft nach Inaktivität ein — der E-Mail-Trigger muss mit automatischem Retry auf 504-Antworten reagieren.
- **Erkenntnis**: Eine professionelle BPMN-Engine wie Camunda trennt Prozesslogik und Infrastruktur deutlich sauberer als eine selbst entwickelte Workflow-Engine. User Tasks mit Formularen machen den Prozess für Nicht-Entwickler bedienbar.

---

## Offene Punkte / Nächster Sprint

- RPA-Integration: Automatische ERP-Erfassung per UiPath-Bot statt manuellem Formular (→ Sprint 5)
- Prozessüberwachung und Fehlerbehandlung in Camunda Operate vertiefen
- Event-Logs für Process Mining weiter anreichern

---

## Technologie-Stack

| Technologie | Einsatz |
|---|---|
| Camunda 8 (SaaS) | Process Engine, Operate, Tasklist |
| `@camunda8/sdk` | Zeebe gRPC Worker und Prozessinstanz-Start |
| BPMN 2.0 | Prozessmodellierung |
| Camunda Forms (JSON) | User-Task-Formulare |
| gRPC | Persistenz der Rechnungsmetadaten |
| RabbitMQ | Asynchrone Zahlungsaufträge |
| Node.js | Worker und Hilfsskripte |
| CSV | Event-Logging für Process Mining |
