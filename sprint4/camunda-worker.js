require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Camunda8 } = require('@camunda8/sdk');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const amqp = require('amqplib');
const fs = require('fs');
const path = require('path');
const { fillErpForm } = require('../sprint5/rpa-erp-bot');

// ── Konfiguration ─────────────────────────────────────────────────────────────
const GRPC_ADDRESS  = process.env.GRPC_ADDRESS  || '127.0.0.1:50051';
const RABBITMQ_URL  = (process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672')
                        .replace('localhost', '127.0.0.1');
const PAYMENT_QUEUE = 'payment_requests';
const ARCHIVE_LOG   = path.join(__dirname, '..', 'event-log.csv');

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
    grpcClient.SaveInvoiceMetadata(invoice, (err, response) => {
      if (err) return reject(err);
      resolve(response);
    });
  });
}

// Camunda Datums-Format normalisieren (ISO → YYYY-MM-DD)
function normalizeDate(raw) {
  if (!raw) return '';
  return String(raw).substring(0, 10);
}

// ── Camunda 8 Worker ──────────────────────────────────────────────────────────
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
      return job.complete({ grpcSuccess: true, amountCents, dataComplete });
    } catch (err) {
      console.error(`[grpc-save-invoice] Fehler: ${err.message}`);
      logEvent(invoiceId, 'gRPC Save Failed', 'camunda-worker');
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

// 5. ERP-Erfassung per RPA (Sprint 5)
zbc.createWorker({
  taskType: 'rpa-erp-entry',
  taskHandler: async (job) => {
    const { invoiceId, supplierName, invoiceNumber, amountEuro, invoiceDate } = job.variables;
    console.log(`[rpa-erp-entry] Starte RPA-Bot für Rechnung ${invoiceId}`);
    logEvent(invoiceId, 'RPA ERP Entry Started', 'camunda-worker');

    try {
      const result = await fillErpForm({ invoiceId, supplierName, invoiceNumber, amountEuro, invoiceDate });
      console.log(`[rpa-erp-entry] Abgeschlossen: ${result.erpReferenzNummer}`);
      logEvent(invoiceId, 'RPA ERP Entry Completed', 'camunda-worker');
      return job.complete({
        erpReferenzNummer: result.erpReferenzNummer,
        erpErfasst: true,
      });
    } catch (err) {
      console.error(`[rpa-erp-entry] Fehler: ${err.message}`);
      logEvent(invoiceId, 'RPA ERP Entry Failed', 'camunda-worker');
      return job.fail(err.message, { retries: 2, retryBackOff: 5000 });
    }
  },
});

console.log('Camunda Worker läuft – abonnierte Tasks: receive-invoice, grpc-save-invoice, rabbitmq-payment, archive-invoice, rpa-erp-entry');
