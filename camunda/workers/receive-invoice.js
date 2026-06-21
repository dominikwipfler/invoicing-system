const { logEvent } = require('../lib/event-log');

// 1. Rechnung empfangen (E-Mail-Simulation)
module.exports = {
  taskType: 'receive-invoice',
  taskHandler: async (job) => {
    const invoiceId = job.variables.invoiceId || `INV-${Date.now()}`;
    console.log(`[receive-invoice] Rechnung empfangen: ${invoiceId}`);
    logEvent(invoiceId, 'Invoice Email Received', 'camunda-worker');
    return job.complete({
      invoiceId,
      receivedAt: new Date().toISOString(),
    });
  },
};
