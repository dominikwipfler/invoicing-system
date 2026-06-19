require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Camunda8 } = require('@camunda8/sdk');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const amqp = require('amqplib');
const fs = require('fs');
const path = require('path');

const { fillErpForm } = require('../rpa/rpa-erp-bot');
const { extractInvoiceData, CONFIDENCE_THRESHOLD } = require('../ai-agent/invoice-extractor');
const { extractInvoiceDataViaN8n } = require('../ai-agent/invoice-extractor-n8n');

// ── Konfiguration ─────────────────────────────────────────────────────────────
const GRPC_ADDRESS  = process.env.GRPC_ADDRESS  || '127.0.0.1:50051';
const RABBITMQ_URL  = (process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672')
                        .replace('localhost', '127.0.0.1');
const PAYMENT_QUEUE = 'payment_requests';
const ARCHIVE_LOG   = path.join(__dirname, '..', 'event-log.csv');
const GRPC_CALL_TIMEOUT_MS  = 5000;
const GRPC_RETRY_BACKOFF_MS = 2000;

// ── gRPC-Client ───────────────────────────────────────────────────────────────
const PROTO_PATH = path.join(__dirname, '..', 'proto', 'invoice.proto');
const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
});
const invoiceProto = grpc.loadPackageDefinition(packageDef).invoice;
const grpcClient   = new invoiceProto.InvoiceService(
  GRPC_ADDRESS,
  grpc.credentials.createInsecure()
);

// ── RabbitMQ: persistente Verbindung ──────────────────────────────────────────
let rabbitChannel = null;

async function getRabbitChannel() {
  if (rabbitChannel) return rabbitChannel;
  const connection = await amqp.connect(RABBITMQ_URL);
  const channel    = await connection.createChannel();
  await channel.assertQueue(PAYMENT_QUEUE, { durable: true });
  connection.on('close', () => { rabbitChannel = null; });
  connection.on('error', () => { rabbitChannel = null; });
  rabbitChannel = channel;
  return channel;
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────
function logEvent(caseId, activity, resource) {
  if (!fs.existsSync(ARCHIVE_LOG)) {
    fs.writeFileSync(ARCHIVE_LOG, 'case_id,activity,timestamp,resource\n');
  }
  fs.appendFileSync(ARCHIVE_LOG, `${caseId},${activity},${new Date().toISOString()},${resource}\n`);
}

function saveViaGrpc(invoice) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + GRPC_CALL_TIMEOUT_MS;
    grpcClient.SaveInvoiceMetadata(invoice, { deadline }, (err, response) => {
      if (err) return reject(err);
      resolve(response);
    });
  });
}

// Verbindungsfehler (Service nicht erreichbar / Timeout) sind technische Fehler —
// dafür ist Zeebes eingebauter Job-Retry zuständig, nicht der Sachbearbeiter.
const TRANSIENT_GRPC_CODES = new Set([grpc.status.UNAVAILABLE, grpc.status.DEADLINE_EXCEEDED]);
function isServiceUnavailable(err) {
  return TRANSIENT_GRPC_CODES.has(err.code);
}

// Camunda Datums-Format normalisieren (ISO → YYYY-MM-DD)
function normalizeDate(raw) {
  if (!raw) return '';
  return String(raw).substring(0, 10);
}

// ── Camunda 8 Worker ──────────────────────────────────────────────────────────
// Verbindet sich mit Camunda 8 SaaS via Zeebe gRPC (Credentials aus .env)
const c8  = new Camunda8();
const zbc = c8.getZeebeGrpcApiClient();

// 1. Rechnung empfangen (E-Mail-Simulation)
zbc.createWorker({
  taskType: 'receive-invoice',
  taskHandler: async (job) => {
    const invoiceId = `INV-${Date.now()}`;
    console.log(`[receive-invoice] Rechnung empfangen: ${invoiceId}`);
    logEvent(invoiceId, 'Invoice Email Received', 'camunda-worker');
    return job.complete({
      invoiceId,
      receivedAt: new Date().toISOString(),
    });
  },
});

// 2. Metadaten per gRPC speichern + dataComplete prüfen
zbc.createWorker({
  taskType: 'grpc-save-invoice',
  taskHandler: async (job) => {
    const { invoiceId, supplierName, invoiceNumber, amountEuro, invoiceDate } = job.variables;

    // Prüfen ob alle Pflichtfelder vorhanden sind
    const dataComplete = !!(invoiceId && supplierName && invoiceNumber && amountEuro && invoiceDate);
    const amountCents  = Math.round(parseFloat(amountEuro || 0) * 100);

    const invoicePayload = {
      id:             String(invoiceId),
      supplier_name:  supplierName  || '',
      invoice_number: invoiceNumber || '',
      amount_cents:   amountCents,
      date:           normalizeDate(invoiceDate),
    };

    try {
      await saveViaGrpc(invoicePayload);
      console.log(`[grpc-save-invoice] ${invoiceId} gespeichert — dataComplete=${dataComplete}, ${amountCents} Cent`);
      logEvent(invoiceId, 'gRPC Save Success', 'camunda-worker');

      // Berechne: Compliance Check nötig? (ab 10.000 EUR) — parseFloat sichert Typkonvertierung
      const complianceNeeded = parseFloat(amountEuro) >= 10000;

      // Berechne: Info vom Lieferanten nötig? (standardmäßig false, kann von Sachbearbeiter im Formular gesetzt werden)
      // Wird initialerweise auf false gesetzt, kann aber im Task_Validate überschrieben werden

      return job.complete({
        grpcSuccess: true,
        amountCents,
        dataComplete,
        complianceNeeded,
        infoNeeded: false,  // Default: nein, wird durch Formular-Input überschrieben
      });
    } catch (err) {
      console.error(`[grpc-save-invoice] Fehler: ${err.message}`);
      logEvent(invoiceId, 'gRPC Save Failed', 'camunda-worker');

      if (isServiceUnavailable(err)) {
        // Technischer Fehler (Service down/Timeout) — automatischer Zeebe-Retry statt
        // Sachbearbeiter-Task, da Datenkorrektur hier nichts beheben würde.
        // Wichtig: "retries" hier MUSS explizit gesetzt werden — das SDK dezimiert
        // bei job.fail(config) ohne explizites "retries" NICHT automatisch (Bug in
        // ZBWorkerBase.js, conf.retries ?? 0 statt job.retries - 1), sondern setzt
        // sonst sofort 0 und beendet die Retries nach dem ersten Versuch.
        const retriesLeft = job.retries - 1;
        console.warn(`[grpc-save-invoice] Service nicht erreichbar — Zeebe-Retry (verbleibend: ${retriesLeft})`);
        return job.fail({
          errorMessage: `gRPC Service nicht erreichbar: ${err.message}`,
          retries: retriesLeft,
          retryBackOff: GRPC_RETRY_BACKOFF_MS,
        });
      }

      return job.error('GRPC_ERROR', `gRPC Fehler: ${err.message}`);
    }
  },
});

// 3. Zahlung via RabbitMQ senden
zbc.createWorker({
  taskType: 'rabbitmq-payment',
  taskHandler: async (job) => {
    const { invoiceId, supplierName, amountCents } = job.variables;

    const paymentOrder = {
      invoiceId:    String(invoiceId),
      supplier:     supplierName,
      amount_cents: Number(amountCents),
      currency:     'EUR',
      timestamp:    new Date().toISOString(),
    };

    try {
      const channel = await getRabbitChannel();
      channel.sendToQueue(PAYMENT_QUEUE, Buffer.from(JSON.stringify(paymentOrder)), { persistent: true });
      console.log(`[rabbitmq-payment] Zahlungsauftrag gesendet für ${invoiceId}`);
      logEvent(invoiceId, 'Payment Sent to RabbitMQ', 'camunda-worker');
      return job.complete({ paymentTriggered: true });
    } catch (err) {
      console.error(`[rabbitmq-payment] Fehler: ${err.message}`);
      logEvent(invoiceId, 'Payment Send Failed', 'camunda-worker');
      return job.error('PAYMENT_ERROR', `RabbitMQ Fehler: ${err.message}`);
    }
  },
});

// 4. Rechnung archivieren
zbc.createWorker({
  taskType: 'archive-invoice',
  taskHandler: async (job) => {
    const { invoiceId, supplierName, amountCents, paymentTriggered } = job.variables;
    console.log(`[archive-invoice] Rechnung ${invoiceId} archiviert`);
    logEvent(invoiceId, 'Invoice Archived', 'camunda-worker');
    console.log({
      invoiceId,
      supplierName,
      amountEur:        ((Number(amountCents) || 0) / 100).toFixed(2),
      paymentTriggered: paymentTriggered ?? false,
      archivedAt:       new Date().toISOString(),
    });
    return job.complete({});
  },
});

// 5. KI-Extraktion von Rechnungsdaten aus PDF
const AI_PROVIDER = process.env.AI_PROVIDER || 'n8n';
zbc.createWorker({
  taskType: 'ai-extract-invoice',
  taskHandler: async (job) => {
    const { invoiceId, pdfPath } = job.variables;
    const defaultPdfPath = path.join(__dirname, '..', 'ai-agent', 'test-invoice.pdf');
    const targetPath = pdfPath || defaultPdfPath;
    const mockMode = process.env.AI_MOCK_MODE === 'true';

    console.log(`[ai-extract-invoice] Starte KI-Extraktion für ${invoiceId} — Provider: ${mockMode ? 'MOCK' : AI_PROVIDER} — PDF: ${targetPath}`);
    logEvent(invoiceId, 'AI Extraction Started', mockMode ? 'mock' : AI_PROVIDER);

    if (!mockMode && !fs.existsSync(targetPath)) {
      console.warn(`[ai-extract-invoice] PDF nicht gefunden: ${targetPath} — Weiterleitung zur manuellen Prüfung`);
      logEvent(invoiceId, 'AI Extraction Skipped (PDF not found)', 'ai-agent');
      return job.complete({
        lineItems:           [],
        aiConfidence:        0,
        requiresHumanReview: true,
        aiExtractionDone:    false,
        aiError:             `PDF nicht gefunden: ${targetPath}`,
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
      });
    }
  },
});

// 6. ERP-Erfassung per Playwright RPA
zbc.createWorker({
  taskType: 'rpa-erp-entry',
  taskHandler: async (job) => {
    const { invoiceId, supplierName, invoiceNumber, amountEuro, invoiceDate, lineItems } = job.variables;
    console.log(`[rpa-erp-entry] Starte Playwright Bot für Rechnung ${invoiceId}`);
    logEvent(invoiceId, 'RPA ERP Entry Started', 'camunda-worker');

    try {
      const { erpReferenzNummer } = await fillErpForm({
        invoiceId,
        supplierName,
        invoiceNumber,
        amountEuro,
        invoiceDate,
        lineItems: lineItems || [],
      });
      console.log(`[rpa-erp-entry] ERP-Referenz: ${erpReferenzNummer}`);
      logEvent(invoiceId, 'RPA ERP Entry via Playwright', 'camunda-worker');
      return job.complete({
        erpReferenzNummer,
        erpErfasst: true,
        rpaMode: 'playwright',
      });
    } catch (err) {
      console.error(`[rpa-erp-entry] Fehler: ${err.message}`);
      logEvent(invoiceId, 'RPA ERP Entry Failed', 'camunda-worker');
      return job.error('RPA_ERROR', `Playwright Fehler: ${err.message}`);
    }
  },
});

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  Camunda Worker gestartet                                ║');
console.log('║  Tasks: receive-invoice, ai-extract-invoice,             ║');
console.log('║         grpc-save-invoice, rabbitmq-payment,             ║');
console.log('║         archive-invoice, rpa-erp-entry                   ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log(`  RPA-Modus  : Playwright (kein UiPath — siehe docs/uipath-research.md)`);
console.log(`  KI-Provider: ${process.env.AI_PROVIDER || 'n8n'} | Konfidenz-Schwelle: ${CONFIDENCE_THRESHOLD * 100}%`);
console.log(`  gRPC       : ${process.env.GRPC_ADDRESS || '127.0.0.1:50051'}`);
