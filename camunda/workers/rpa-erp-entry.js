const { logEvent } = require('../lib/event-log');
const { fillErpForm } = require('../../rpa/rpa-erp-bot');

// 6. ERP-Erfassung per Playwright RPA
module.exports = {
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
};
