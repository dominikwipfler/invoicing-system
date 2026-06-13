const fs = require('fs');

async function extractInvoiceDataViaN8n(pdfPath, invoiceId) {
  if (!process.env.N8N_WEBHOOK_URL) {
    throw new Error('N8N_WEBHOOK_URL ist nicht in der .env Datei gesetzt');
  }

  // PDF als Base64 encodieren
  let pdfBase64;
  try {
    const pdfBuffer = fs.readFileSync(pdfPath);
    pdfBase64 = pdfBuffer.toString('base64');
  } catch (err) {
    console.error(`[invoice-extractor-n8n] PDF-Lesefehler: ${err.message}`);
    return {
      supplierName: null,
      invoiceNumber: null,
      amountEuro: null,
      invoiceDate: null,
      lineItems: [],
      aiConfidence: 0,
      requiresHumanReview: true,
      aiExtractionDone: true,
      error: `PDF-Lesefehler: ${err.message}`,
    };
  }

  try {
    const response = await fetch(process.env.N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        invoiceId,
        pdfBase64,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    // Validierung der Response-Struktur
    if (
      !result.hasOwnProperty('aiConfidence') ||
      !result.hasOwnProperty('requiresHumanReview') ||
      !result.hasOwnProperty('aiExtractionDone')
    ) {
      throw new Error('n8n Webhook hat ungültiges Response-Format geliefert');
    }

    // lineItems als Array or empty array sicherstellen
    const lineItemsArray = Array.isArray(result.lineItems) ? result.lineItems : [];

    return {
      supplierName: result.supplierName || null,
      invoiceNumber: result.invoiceNumber || null,
      amountEuro: result.amountEuro || null,
      invoiceDate: result.invoiceDate || null,
      lineItems: lineItemsArray,
      aiConfidence: result.aiConfidence,
      requiresHumanReview: result.requiresHumanReview,
      aiExtractionDone: result.aiExtractionDone,
    };
  } catch (err) {
    console.error(`[invoice-extractor-n8n] Webhook-Fehler: ${err.message}`);
    return {
      supplierName: null,
      invoiceNumber: null,
      amountEuro: null,
      invoiceDate: null,
      lineItems: [],
      aiConfidence: 0,
      requiresHumanReview: true,
      aiExtractionDone: true,
      error: `n8n Webhook-Fehler: ${err.message}`,
    };
  }
}

module.exports = { extractInvoiceDataViaN8n };

// Standalone-Test: node ai-agent/invoice-extractor-n8n.js <pdf-pfad>
if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
  const pdfPath = process.argv[2] || require('path').join(__dirname, 'test-invoice.pdf');
  const invoiceId = `INV-${Date.now()}`;
  console.log(`Teste n8n KI-Extraktion mit: ${pdfPath}`);
  extractInvoiceDataViaN8n(pdfPath, invoiceId)
    .then(result => {
      console.log('\nExtraktion erfolgreich:');
      console.log(JSON.stringify(result, null, 2));
      if (result.error) {
        console.log(`\n⚠️ Fehler: ${result.error}`);
      } else {
        console.log(`\nKonfidenz: ${(result.aiConfidence * 100).toFixed(0)}% — Manuelle Prüfung nötig: ${result.requiresHumanReview}`);
      }
    })
    .catch(err => {
      console.error('Fehler:', err.message);
      process.exit(1);
    });
}
