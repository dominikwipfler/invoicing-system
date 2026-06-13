# Sprint 6 – AI Agent für die Vorverarbeitung von Rechnungsinformationen

## Ziel

Integration eines KI-Agenten in den bestehenden Rechnungsverarbeitungs-Workflow. Der Agent extrahiert 
automatisch Rechnungsdaten aus PDF-Dateien und bewertet die eigene Konfidenz. 

**Standard-Provider:** n8n Webhook mit Google Gemini (kosteneffizient, schnell)  
**Alternative:** Anthropic Claude API (höhere Genauigkeit, optional)

Liegt die Konfidenz unter einem konfigurierbaren Schwellenwert (Standard: 80 %), wird ein Mensch 
zur Überprüfung hinzugezogen (Human-in-the-Loop).

---

## Neue Komponenten

### `ai-agent/invoice-extractor.js`

Kernlogik des KI-Agenten. Nutzt die Anthropic Claude API (`claude-haiku-4-5-20251001`), um:

- Ein PDF-Dokument als Base64 an die API zu senden (natives Document-Format)
- Strukturierte Rechnungsdaten zu extrahieren: `supplierName`, `invoiceNumber`, `amountEuro`, `invoiceDate`
- Pro Feld einen Konfidenzwert (0,0–1,0) zurückzugeben
- Einen Gesamtkonfidenzwert (`aiConfidence`) zu berechnen
- Das Flag `requiresHumanReview` zu setzen, wenn `aiConfidence < 0.8`

**Verwendung als Standalone-Test:**
```bash
node ai-agent/invoice-extractor.js ai-agent/test-invoice.pdf
```

### `ai-agent/create-test-invoice.js`

Erstellt eine realistische Test-Rechnung als PDF mittels Playwright (bereits als Abhängigkeit
vorhanden). Die Rechnung enthält alle typischen Felder: Lieferant, Rechnungsnummer, Positionen,
Netto-/Bruttobetrag, MwSt., Bankverbindung.

**Ausführung:**
```bash
npm run ai:create-invoice
```

### `camunda/forms/ki-pruefung.form`

Neues Camunda-Formular für die manuelle Prüfung der KI-Extraktion bei niedriger Konfidenz.
Zeigt die KI-extrahierten Werte vor und erlaubt dem Sachbearbeiter, diese zu korrigieren.

---

## Angepasste Komponenten

### `camunda/invoice-process.bpmn` – Workflow-Anpassung

Der BPMN-Prozess wurde um folgende Elemente erweitert (zwischen `Task_Receive` und `Task_gRPC`):

```
Task_Receive
    ↓ Flow_Receive_AI
Task_AI_Extract   (Service Task, type: "ai-extract-invoice")
    ↓ Flow_AI_GWConf
GW_AIConfidence   (Exclusive Gateway: "KI-Extraktion zuverlässig?")
    ├── ja, ≥ 80%  → GW_KI_Join
    └── nein, < 80% → Task_KI_Pruefung (User Task, Form: ki-pruefung)
                            ↓
                       GW_KI_Join
                            ↓ Flow_KI_Join_gRPC
                       Task_gRPC
```

- `Task_AI_Extract` ruft den externen Worker `ai-extract-invoice` auf
- Der Worker setzt die Prozessvariablen `supplierName`, `invoiceNumber`, `amountEuro`, `invoiceDate`,
  `aiConfidence`, `requiresHumanReview`
- Das Gateway routet anhand von `aiConfidence >= 0.8` (FEEL-Ausdruck)
- Bei niedriger Konfidenz prüft und korrigiert der Sachbearbeiter die KI-Daten über das
  `ki-pruefung`-Formular im Camunda Tasklist
- `Task_Register` (manuelle Datenerfassung) dient weiterhin als Fallback in der
  gRPC-Fehlerkorrektur-Schleife

### `camunda/camunda-worker.js` – Neuer Task-Handler

Neuer Worker für den Task-Typ `ai-extract-invoice`:

- Liest den PDF-Pfad aus der Prozessvariable `pdfPath` (Standard: `ai-agent/test-invoice.pdf`)
- Ruft `extractInvoiceData()` auf und gibt die extrahierten Felder als Prozessvariablen zurück
- Bei fehlendem PDF oder API-Fehler: Abschluss mit `aiConfidence=0` und `requiresHumanReview=true`
  (kein BPMN-Fehler → Soft-Fallback auf menschliche Prüfung)

### `camunda/trigger-from-email.js` – PDF-Pfad übergabe

Der Prozess-Trigger akzeptiert jetzt einen dritten Parameter `<pdf-pfad>`:

```bash
node camunda/trigger-from-email.js "sender@firma.de" "Rechnung RE-2026-0748" "./ai-agent/test-invoice.pdf"
```

Standard ist `ai-agent/test-invoice.pdf` (sofern vorhanden).

---

## Konfiguration

| Variable                  | Beschreibung                                       | Standard        |
|---------------------------|----------------------------------------------------|-----------------|
| `ANTHROPIC_API_KEY`       | API-Key von console.anthropic.com (**erforderlich**) | –               |
| `AI_CONFIDENCE_THRESHOLD` | Schwellenwert für automatische Übernahme (0,0–1,0) | `0.8` (= 80 %)  |

Beide Variablen werden in `.env` eingetragen.

---

## Ablauf im laufenden System

### Setup (einmalig)

```bash
npm install                    # Dependencies installieren (@anthropic-ai/sdk, etc.)
npm run ai:create-invoice      # Test-PDF generieren
```

In `.env` eintragen (Standard — n8n benötigt keine zusätzliche Config):
```
AI_PROVIDER=n8n                           # Standard: n8n + Gemini
N8N_WEBHOOK_URL=https://leonjungkind0909.app.n8n.cloud/webhook/invoice-extract
AI_CONFIDENCE_THRESHOLD=0.8

# Optional für Claude API Alternative:
# AI_PROVIDER=claude
# ANTHROPIC_API_KEY=sk-ant-...
```

### Prozess starten

```bash
npm run start:servers          # RabbitMQ + gRPC + Payment Worker starten
npm run start:camunda-worker   # Camunda Worker (neues Fenster)
npm run deploy:bpmn            # Aktualisiertes BPMN deployen
npm run trigger:email          # Prozessinstanz starten
```

Camunda Tasklist unter:
`https://bru-2.tasklist.camunda.io/487e2664-45fe-4a21-9e53-860eddc37e5e`

### Erwartetes Verhalten

| Szenario                        | Konfidenz | Ablauf                                      |
|---------------------------------|-----------|---------------------------------------------|
| PDF gut lesbar, alle Felder klar | ≥ 80 %    | Vollautomatisch → direkt zu gRPC            |
| PDF unvollständig / unlesbar    | < 80 %    | KI-Prüfung-Task im Tasklist → Sachbearbeiter |
| PDF nicht gefunden / API-Fehler | 0 %       | Automatischer Fallback → KI-Prüfung-Task    |

---

## Verwendete Technologien

| Technologie              | Verwendungszweck                          |
|--------------------------|-------------------------------------------|
| Anthropic Claude API     | KI-Extraktion (Modell: claude-haiku-4-5)  |
| `@anthropic-ai/sdk`      | Node.js-Client für die Anthropic API      |
| Playwright               | PDF-Generierung für Test-Rechnungen       |
| Camunda 8 (Zeebe)        | Workflow-Orchestrierung + Human Task      |
| FEEL (Camunda)           | Gateway-Kondition `=aiConfidence >= 0.8`  |

---

## Standard: n8n + Google Gemini Provider

Der **n8n-basierte Workflow ist der Standard-Provider** für die PDF-Rechnungsdaten-Extraktion. Dieser nutzt **Google Gemini** für schnelle und kosteneffiziente Dokumentenanalyse.

### n8n Webhook Architektur

Der n8n Workflow läuft auf der Production URL:
```
https://leonjungkind0909.app.n8n.cloud/webhook/invoice-extract
```

**Workflow-Struktur (n8n SaaS):**
1. HTTP-Webhook empfängt POST mit `invoiceId` + `pdfBase64`
2. Google Gemini `Analyze Document` Node extrahiert Rechnungsdaten
3. Confidence-Berechnung pro Feld + Overall Confidence
4. HTTP Response mit Rechnungsmetadaten + Confidence

**Response Format:**
```json
{
  "invoiceId": "<string>",
  "supplierName": "<string|null>",
  "invoiceNumber": "<string|null>",
  "amountEuro": <number|null>,
  "invoiceDate": "<string|null>",
  "aiConfidence": <number 0-1>,
  "requiresHumanReview": <boolean>,
  "aiExtractionDone": true
}
```

### Provider wechseln

Zwei Provider sind verfügbar und liefern **identisches Output-Format**. Die Wahl erfolgt über die Umgebungsvariable:

```bash
# n8n + Gemini (Standard — keine extra Config nötig):
AI_PROVIDER=n8n
N8N_WEBHOOK_URL=https://leonjungkind0909.app.n8n.cloud/webhook/invoice-extract

# Claude API (Alternative für höhere Genauigkeit):
AI_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
```

### Auswirkung auf BPMN

Das Gateway `GW_AIConfidence` behandelt beide Provider identisch:
- Prüft `requiresHumanReview` Flag (nicht Provider-spezifisch)
- Confidence Threshold (`AI_CONFIDENCE_THRESHOLD=0.8`) ist unabhängig vom Provider
- Fallback zu manueller Prüfung (`Task_KI_Pruefung`) funktioniert für beide

### Test der n8n Integration

```bash
npm run ai:test-extract-n8n     # Testet n8n Webhook (mit echtem API-Call)
```

---

## Architekturentscheidungen

**Warum ist n8n + Gemini der Standard-Provider?**
Google Gemini bietet ein ausgezeichnetes Preis-Leistungs-Verhältnis (kostenlos im Free-Tier), schnelle Dokumentenanalyse
und ist über n8n einfach zu integrieren. Claude ist als Alternative für höhere Genauigkeit verfügbar.

**Warum kein BPMN-Fehler-Boundary bei KI-Fehler?**
Ein weicher Fallback (Abschluss mit `aiConfidence=0`) ist robuster als ein harter Fehler.
Der Prozess läuft stets weiter – bei API-Ausfällen übernimmt automatisch der Sachbearbeiter.

**Warum Playwright für die Test-PDF?**
Playwright ist bereits als Abhängigkeit vorhanden (Sprint 5, RPA-Bot). Keine zusätzliche
PDF-Bibliothek nötig.
