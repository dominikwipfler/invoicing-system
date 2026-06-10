require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const CONFIDENCE_THRESHOLD = parseFloat(process.env.AI_CONFIDENCE_THRESHOLD || '0.8');

// Mock-Modus: Gibt realistische Test-Daten zurück ohne API-Aufruf
// Aktivierung: AI_MOCK_MODE=true in .env setzen
function mockExtract(pdfPath) {
  const aiConfidence = 0.92;
  console.log('[invoice-extractor] MOCK-MODUS aktiv — kein API-Aufruf');
  return {
    supplierName:        'TechSolutions GmbH',
    invoiceNumber:       'RE-2026-0748',
    amountEuro:          15470.00,
    invoiceDate:         '2026-06-07',
    lineItems:           'Softwareentwicklung, Projektmanagement, Cloud-Infrastruktur, Lizenzgebühren',
    aiConfidence,
    confidenceDetails:   { supplierName: 0.95, invoiceNumber: 0.93, amountEuro: 0.90, invoiceDate: 0.91 },
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
  "lineItems": "Kurze Beschreibung der Rechnungspositionen",
  "confidence": {
    "supplierName": 0.95,
    "invoiceNumber": 0.90,
    "amountEuro": 0.85,
    "invoiceDate": 0.80
  }
}

Wichtige Regeln:
- amountEuro muss der Gesamtbetrag inklusive MwSt als Dezimalzahl sein (z.B. 14696.50)
- invoiceDate muss im Format YYYY-MM-DD angegeben werden
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

  return {
    supplierName:        extracted.supplierName  || null,
    invoiceNumber:       extracted.invoiceNumber || null,
    amountEuro:          extracted.amountEuro    || null,
    invoiceDate:         extracted.invoiceDate   || null,
    lineItems:           extracted.lineItems     || null,
    aiConfidence:        Math.round(overallConfidence * 100) / 100,
    confidenceDetails:   extracted.confidence   || {},
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
