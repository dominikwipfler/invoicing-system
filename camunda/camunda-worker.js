require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Camunda8 } = require('@camunda8/sdk');
const { CONFIDENCE_THRESHOLD } = require('../ai-agent/invoice-extractor');
const { GRPC_ADDRESS } = require('./lib/grpc-client');

// Verbindet sich mit Camunda 8 SaaS via Zeebe gRPC (Credentials aus .env)
const c8  = new Camunda8();
const zbc = c8.getZeebeGrpcApiClient();

// Jeder Task-Type ist als eigenständiges Modul unter camunda/workers/ ausgelagert
// (Single-Responsibility statt eines einzelnen "God File" mit allen Handlern).
const receiveInvoice          = require('./workers/receive-invoice');
const grpcSaveInvoice         = require('./workers/grpc-save-invoice');
const createRabbitmqPayment   = require('./workers/rabbitmq-payment');
const archiveInvoice          = require('./workers/archive-invoice');
const aiExtractInvoice        = require('./workers/ai-extract-invoice');
const rpaErpEntry             = require('./workers/rpa-erp-entry');
const notifySupplierRejection = require('./workers/notify-supplier-rejection');

zbc.createWorker(receiveInvoice);
zbc.createWorker(grpcSaveInvoice);
zbc.createWorker(createRabbitmqPayment(zbc));
zbc.createWorker(archiveInvoice);
zbc.createWorker(aiExtractInvoice);
zbc.createWorker(rpaErpEntry);
zbc.createWorker(notifySupplierRejection);

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  Camunda Worker gestartet                                ║');
console.log('║  Tasks: receive-invoice, ai-extract-invoice,             ║');
console.log('║         grpc-save-invoice, rabbitmq-payment,             ║');
console.log('║         archive-invoice, rpa-erp-entry,                  ║');
console.log('║         notify-supplier-rejection                        ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log(`  RPA-Modus  : Playwright (kein UiPath — siehe docs/uipath-research.md)`);
console.log(`  KI-Provider: ${aiExtractInvoice.AI_PROVIDER} | Konfidenz-Schwelle: ${CONFIDENCE_THRESHOLD * 100}%`);
console.log(`  gRPC       : ${GRPC_ADDRESS}`);
