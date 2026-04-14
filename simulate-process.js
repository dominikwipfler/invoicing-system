/**
 * simulate-process.js
 *
 * Generiert einen realistischen Event-Log mit mehreren Prozess-Varianten
 * für die Process Mining Analyse in Celonis.
 *
 * Prozess-Varianten:
 *   Variante A (Happy Path)     – Invoice Received → Stored → Payment Initiated → Processed
 *   Variante B (Payment Retry)  – ... → Payment Initiated → Failed → Payment Initiated → Processed
 *   Variante C (Duplicate)      – Invoice kommt doppelt an, zweite wird ignoriert
 *   Variante D (Not Found)      – GetInvoice schlägt fehl
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'event-log.csv');

// Alte Logdatei löschen und neu starten
fs.writeFileSync(LOG_FILE, 'case_id,activity,timestamp,resource\n');

function logEvent(caseId, activity, resource, baseTime, offsetMs) {
  const ts = new Date(baseTime.getTime() + offsetMs).toISOString();
  const line = `${caseId},${activity},${ts},${resource}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const suppliers = [
  'Muster GmbH', 'Alpha AG', 'Beta KG', 'Gamma UG',
  'Delta GmbH', 'Epsilon Corp', 'Zeta Ltd', 'Eta OHG'
];

let totalEvents = 0;

// ─── Variante A: Happy Path (60%) ───────────────────────────────────────────
console.log('Generiere Variante A (Happy Path)...');
for (let i = 1; i <= 30; i++) {
  const caseId = `INV-${String(i).padStart(3, '0')}`;
  const base = new Date(Date.now() - randomBetween(1000, 50000) * 1000);

  logEvent(caseId, 'Invoice Received',   'grpc-service',    base,  0);
  logEvent(caseId, 'Invoice Stored',     'grpc-service',    base,  randomBetween(30, 120));
  logEvent(caseId, 'Invoice Retrieved',  'grpc-service',    base,  randomBetween(200, 600));
  logEvent(caseId, 'Payment Initiated',  'payment-worker',  base,  randomBetween(600, 1500));
  logEvent(caseId, 'Payment Processed',  'payment-worker',  base,  randomBetween(1500, 3000));
  totalEvents += 5;
}

// ─── Variante B: Payment Retry (20%) ────────────────────────────────────────
console.log('Generiere Variante B (Payment Retry)...');
for (let i = 31; i <= 40; i++) {
  const caseId = `INV-${String(i).padStart(3, '0')}`;
  const base = new Date(Date.now() - randomBetween(1000, 50000) * 1000);

  logEvent(caseId, 'Invoice Received',   'grpc-service',    base,  0);
  logEvent(caseId, 'Invoice Stored',     'grpc-service',    base,  randomBetween(30, 120));
  logEvent(caseId, 'Invoice Retrieved',  'grpc-service',    base,  randomBetween(200, 600));
  logEvent(caseId, 'Payment Initiated',  'payment-worker',  base,  randomBetween(600, 1500));
  logEvent(caseId, 'Payment Failed',     'payment-worker',  base,  randomBetween(1500, 2500));  // Fehler!
  logEvent(caseId, 'Payment Initiated',  'payment-worker',  base,  randomBetween(3000, 5000));  // Retry
  logEvent(caseId, 'Payment Processed',  'payment-worker',  base,  randomBetween(5000, 7000));
  totalEvents += 7;
}

// ─── Variante C: Doppelte Rechnung (10%) ────────────────────────────────────
console.log('Generiere Variante C (Duplicate Invoice)...');
for (let i = 41; i <= 45; i++) {
  const caseId = `INV-${String(i).padStart(3, '0')}`;
  const base = new Date(Date.now() - randomBetween(1000, 50000) * 1000);

  logEvent(caseId, 'Invoice Received',       'grpc-service',    base,  0);
  logEvent(caseId, 'Invoice Stored',         'grpc-service',    base,  randomBetween(30, 120));
  logEvent(caseId, 'Invoice Received',       'grpc-service',    base,  randomBetween(200, 800));  // Duplikat!
  logEvent(caseId, 'Duplicate Rejected',     'grpc-service',    base,  randomBetween(810, 900));
  logEvent(caseId, 'Payment Initiated',      'payment-worker',  base,  randomBetween(1000, 2000));
  logEvent(caseId, 'Payment Processed',      'payment-worker',  base,  randomBetween(2000, 3500));
  totalEvents += 6;
}

// ─── Variante D: Invoice Not Found (10%) ────────────────────────────────────
console.log('Generiere Variante D (Invoice Not Found)...');
for (let i = 46; i <= 50; i++) {
  const caseId = `INV-${String(i).padStart(3, '0')}`;
  const base = new Date(Date.now() - randomBetween(1000, 50000) * 1000);

  logEvent(caseId, 'Invoice Received',   'grpc-service',    base,  0);
  logEvent(caseId, 'Invoice Stored',     'grpc-service',    base,  randomBetween(30, 120));
  logEvent(caseId, 'Invoice Not Found',  'grpc-service',    base,  randomBetween(500, 1500));  // Fehler beim Abruf
  totalEvents += 3;
}

console.log(`\n✅ Event-Log generiert: ${LOG_FILE}`);
console.log(`   ${totalEvents} Events für 50 Rechnungsfälle`);
console.log(`\nProzess-Varianten:`);
console.log(`   Variante A (Happy Path):      30 Fälle (60%)`);
console.log(`   Variante B (Payment Retry):   10 Fälle (20%)`);
console.log(`   Variante C (Duplicate):        5 Fälle (10%)`);
console.log(`   Variante D (Not Found):        5 Fälle (10%)`);
console.log(`\nNächster Schritt: event-log.csv in Celonis importieren`);
