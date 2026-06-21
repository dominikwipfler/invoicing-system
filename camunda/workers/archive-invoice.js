const { logEvent } = require('../lib/event-log');

// 4. Rechnung archivieren
module.exports = {
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
};
