const { logEvent } = require('../lib/event-log');
const { saveViaGrpc, isServiceUnavailable, GRPC_RETRY_BACKOFF_MS } = require('../lib/grpc-client');

// Camunda Datums-Format normalisieren (ISO → YYYY-MM-DD)
function normalizeDate(raw) {
  if (!raw) return '';
  return String(raw).substring(0, 10);
}

// 2. Metadaten per gRPC speichern + dataComplete prüfen
module.exports = {
  taskType: 'grpc-save-invoice',
  taskHandler: async (job) => {
    const { invoiceId, supplierName, invoiceNumber, amountEuro, invoiceDate, aiConfidence, requiresHumanReview } = job.variables;

    // Prüfen ob alle Pflichtfelder vorhanden sind UND KI-Konfidenz ausreichend (Schwelle wie n8n/Gemini: 0.8)
    const hasMinConfidence = aiConfidence !== undefined ? parseFloat(aiConfidence) >= 0.8 : false;
    const allFieldsPresent = !!(supplierName && invoiceNumber && amountEuro && invoiceDate);
    const dataComplete = allFieldsPresent && hasMinConfidence && !requiresHumanReview;

    // amountCents: verwende 0 wenn null/undefined, nicht eine Garbage-Zahl
    const amountCents = amountEuro ? Math.round(parseFloat(amountEuro) * 100) : 0;

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
};
