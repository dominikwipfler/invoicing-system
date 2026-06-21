const path = require('path');
const fs = require('fs');
const { logEvent } = require('../lib/event-log');
const { renderPdfPreviewImage } = require('../lib/pdf-preview');
const { extractInvoiceData, CONFIDENCE_THRESHOLD } = require('../../ai-agent/invoice-extractor');
const { extractInvoiceDataViaN8n } = require('../../ai-agent/invoice-extractor-n8n');

const AI_PROVIDER = process.env.AI_PROVIDER || 'n8n';

// 5. KI-Extraktion von Rechnungsdaten aus PDF
module.exports = {
  taskType: 'ai-extract-invoice',
  taskHandler: async (job) => {
    const { invoiceId, pdfPath, forceLowConfidence } = job.variables;
    const defaultPdfPath = path.join(__dirname, '..', '..', 'ai-agent', 'test-invoice.pdf');
    const targetPath = pdfPath || defaultPdfPath;
    const mockMode = process.env.AI_MOCK_MODE === 'true';

    console.log(`[ai-extract-invoice] Starte KI-Extraktion für ${invoiceId} — Provider: ${mockMode ? 'MOCK' : AI_PROVIDER} — PDF: ${targetPath}`);
    logEvent(invoiceId, 'AI Extraction Started', mockMode ? 'mock' : AI_PROVIDER);

    const pdfImageDataUri = await renderPdfPreviewImage(targetPath);

    // Demo-Szenario: forceLowConfidence Flag ignoriert echte Extraktion
    if (forceLowConfidence) {
      console.log(`[ai-extract-invoice] Erzwinge niedrige Konfidenz für Demo (forceLowConfidence=true)`);
      logEvent(invoiceId, 'AI Extraction Done (force demo: low confidence)', 'demo');
      return job.complete({
        supplierName:        null,
        invoiceNumber:       null,
        amountEuro:          null,
        invoiceDate:         null,
        lineItems:           [],
        aiConfidence:        0,
        requiresHumanReview: true,
        aiExtractionDone:    true,
        pdfImageDataUri,
      });
    }

    if (!mockMode && !fs.existsSync(targetPath)) {
      console.warn(`[ai-extract-invoice] PDF nicht gefunden: ${targetPath} — Weiterleitung zur manuellen Prüfung`);
      logEvent(invoiceId, 'AI Extraction Skipped (PDF not found)', 'ai-agent');
      return job.complete({
        lineItems:           [],
        aiConfidence:        0,
        requiresHumanReview: true,
        aiExtractionDone:    false,
        aiError:             `PDF nicht gefunden: ${targetPath}`,
        pdfImageDataUri,
      });
    }

    try {
      let result;

      // Provider-Weiche: Mock-Mode hat Vorrang, dann AI_PROVIDER
      if (mockMode) {
        result = await extractInvoiceData(targetPath);
      } else if (AI_PROVIDER === 'claude') {
        result = await extractInvoiceData(targetPath);
      } else {
        // Default: n8n (Gemini)
        result = await extractInvoiceDataViaN8n(targetPath, invoiceId);
      }

      const pct = (result.aiConfidence * 100).toFixed(0);
      console.log(`[ai-extract-invoice] Extraktion abgeschlossen (${AI_PROVIDER}) — Konfidenz: ${pct}% (Schwelle: ${CONFIDENCE_THRESHOLD * 100}%)`);
      console.log(`  Lieferant:    ${result.supplierName}`);
      console.log(`  Rechnung-Nr.: ${result.invoiceNumber}`);
      console.log(`  Betrag:       ${result.amountEuro} EUR`);
      console.log(`  Datum:        ${result.invoiceDate}`);
      logEvent(invoiceId, `AI Extraction Done (provider=${AI_PROVIDER}, confidence=${result.aiConfidence})`, 'ai-agent');

      return job.complete({
        supplierName:        result.supplierName,
        invoiceNumber:       result.invoiceNumber,
        amountEuro:          result.amountEuro,
        invoiceDate:         result.invoiceDate,
        lineItems:           result.lineItems || [],
        aiConfidence:        result.aiConfidence,
        requiresHumanReview: result.requiresHumanReview,
        aiExtractionDone:    true,
        aiProvider:          AI_PROVIDER,
        pdfImageDataUri,
      });
    } catch (err) {
      console.error(`[ai-extract-invoice] KI-Fehler (${AI_PROVIDER}): ${err.message} — Weiterleitung zur manuellen Prüfung`);
      logEvent(invoiceId, `AI Extraction Failed (${AI_PROVIDER})`, 'ai-agent');
      // Kein BPMN-Fehler — stattdessen mit niedriger Konfidenz abschließen → menschliche Prüfung
      return job.complete({
        lineItems:           [],
        aiConfidence:        0,
        requiresHumanReview: true,
        aiExtractionDone:    false,
        aiError:             err.message,
        aiProvider:          AI_PROVIDER,
        pdfImageDataUri,
      });
    }
  },
};

module.exports.AI_PROVIDER = AI_PROVIDER;
