require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const CONFIDENCE_THRESHOLD = parseFloat(process.env.AI_CONFIDENCE_THRESHOLD || '0.8');

// Mock-Modus: Gibt realistische Test-Daten zurück ohne API-Aufruf
// Aktivierung: AI_MOCK_MODE=true in .env setzen
// Unterschiedliche Daten je nach pdfPath (Szenario-Unterstützung)
function mockExtract(pdfPath) {
  console.log('[invoice-extractor] MOCK-MODUS aktiv — kein API-Aufruf');

  // Compliance-Szenario: test-invoice-2.pdf (hoher Betrag, niedrige Konfidenz)
  if (pdfPath && pdfPath.includes('test-invoice-2')) {
    const aiConfidence = 0.65;  // < 0.8 → triggert Task_KI_Pruefung
    return {
      supplierName:        'Nordwind IT Consulting GmbH',
      invoiceNumber:       'RE-2026-1102',
      amountEuro:          52360.00,  // >= 10000 → triggert GW_ComplianceNeeded
      invoiceDate:         '2026-06-12',
      lineItems: [
        { beschreibung: 'Beratung & Migration ERP-System (Cloud-Umzug)', menge: 100, einheit: 'Std.', einzelpreis: 180.00 },
        { beschreibung: 'Projektleitung und Koordination', menge: 30, einheit: 'Std.', einzelpreis: 150.00 },
        { beschreibung: 'Server-Hardware inkl. Lizenzen (Rack-Server)', menge: 3, einheit: 'Stk.', einzelpreis: 6500.00 },
        { beschreibung: 'Schulung Mitarbeiter (Workshop, 2 Tage)', menge: 1, einheit: 'Pauschal', einzelpreis: 2000.00 }
      ],
      aiConfidence,
      confidence: {
        supplierName: 0.70,
        invoiceNumber: 0.65,
        amountEuro: 0.60,
        invoiceDate: 0.65,
        lineItems: 0.60
      },
      requiresHumanReview: aiConfidence < CONFIDENCE_THRESHOLD,
    };
  }

  // Standard-Szenario (default): test-invoice.pdf (normaler Betrag, hohe Konfidenz)
  const aiConfidence = 0.92;  // > 0.8 → kein Task_KI_Pruefung
  return {
    supplierName:        'TechSolutions GmbH',
    invoiceNumber:       'RE-2026-0748',
    amountEuro:          15470.00,  // < 10000 → kein GW_ComplianceNeeded
    invoiceDate:         '2026-06-07',
    lineItems: [
      { beschreibung: 'Softwareentwicklung', menge: 40, einheit: 'h', einzelpreis: 150.00 },
      { beschreibung: 'Projektmanagement', menge: 10, einheit: 'h', einzelpreis: 120.00 },
      { beschreibung: 'Cloud-Infrastruktur (AWS)', menge: 3, einheit: 'Monat', einzelpreis: 800.00 },
      { beschreibung: 'Softwarelizenzgebühren', menge: 1, einheit: 'Paket', einzelpreis: 2670.00 }
    ],
    aiConfidence,
    confidence: {
      supplierName: 0.95,
      invoiceNumber: 0.93,
      amountEuro: 0.90,
      invoiceDate: 0.91,
      lineItems: 0.85
    },
    requiresHumanReview: aiConfidence < CONFIDENCE_THRESHOLD,
  };
}

async function extractInvoiceData(pdfPath) {
  if (process.env.AI_MOCK_MODE === 'true') {
    return mockExtract(pdfPath);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY ist nicht in der .env Datei gesetzt');
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfBase64 = pdfBuffer.toString('base64');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64,
            },
          },
          {
            type: 'text',
            text: `Extrahiere die Rechnungsdaten aus diesem PDF-Dokument.
Antworte ausschließlich mit einem gültigen JSON-Objekt, ohne jeglichen zusätzlichen Text:

{
  "supplierName": "Vollständiger Name des Lieferanten / Rechnungsstellers",
  "invoiceNumber": "Rechnungsnummer oder Belegnummer",
  "amountEuro": 123.45,
  "invoiceDate": "YYYY-MM-DD",
  "lineItems": [
    { "beschreibung": "Leistung/Material", "menge": 1, "einheit": "Stk.", "einzelpreis": 99.00 }
  ],
  "confidence": {
    "supplierName": 0.95,
    "invoiceNumber": 0.90,
    "amountEuro": 0.85,
    "invoiceDate": 0.80,
    "lineItems": 0.75
  }
}

Wichtige Regeln:
- amountEuro muss der Gesamtbetrag inklusive MwSt als Dezimalzahl sein (z.B. 14696.50)
- invoiceDate muss im Format YYYY-MM-DD angegeben werden
- lineItems ist ein Array von Positionen mit: beschreibung (String), menge (Zahl), einheit (String, z.B. "Stk.", "h", "Monat"), einzelpreis (Dezimalzahl Netto)
- Falls keine Positionen gefunden werden: lineItems = []
- confidence-Werte liegen zwischen 0.0 (nicht gefunden / unsicher) und 1.0 (sehr sicher)
- Falls ein Feld nicht gefunden wird: Wert null setzen, confidence 0.0
- Nur JSON ausgeben, keinerlei Erklärungen oder Markdown`,
          },
        ],
      },
    ],
  });

  const responseText = response.content[0].text.trim();

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`KI hat kein gültiges JSON geliefert. Antwort: ${responseText.substring(0, 200)}`);
  }

  const extracted = JSON.parse(jsonMatch[0]);

  const confValues = Object.values(extracted.confidence || {}).filter(v => typeof v === 'number');
  const overallConfidence = confValues.length > 0
    ? confValues.reduce((a, b) => a + b, 0) / confValues.length
    : 0;

  // lineItems als Array or empty array sicherstellen
  const lineItemsArray = Array.isArray(extracted.lineItems) ? extracted.lineItems : [];

  return {
    supplierName:        extracted.supplierName  || null,
    invoiceNumber:       extracted.invoiceNumber || null,
    amountEuro:          extracted.amountEuro    || null,
    invoiceDate:         extracted.invoiceDate   || null,
    lineItems:           lineItemsArray,
    aiConfidence:        Math.round(overallConfidence * 100) / 100,
    confidence:          extracted.confidence   || {},
    requiresHumanReview: overallConfidence < CONFIDENCE_THRESHOLD,
  };
}

module.exports = { extractInvoiceData, CONFIDENCE_THRESHOLD };

// Standalone-Test: node ai-agent/invoice-extractor.js <pdf-pfad>
if (require.main === module) {
  const pdfPath = process.argv[2] || require('path').join(__dirname, 'test-invoice.pdf');
  console.log(`Teste KI-Extraktion mit: ${pdfPath}`);
  extractInvoiceData(pdfPath)
    .then(result => {
      console.log('\nExtraktion erfolgreich:');
      console.log(JSON.stringify(result, null, 2));
      console.log(`\nKonfidenz: ${(result.aiConfidence * 100).toFixed(0)}% — Manuelle Prüfung nötig: ${result.requiresHumanReview}`);
    })
    .catch(err => {
      console.error('Fehler:', err.message);
      process.exit(1);
    });
}
