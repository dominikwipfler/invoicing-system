const { logEvent } = require('../lib/event-log');

// Lieferanten über eine Ablehnung informieren — der Prozess darf nach einer Ablehnung
// nicht einfach kommentarlos enden, im echten Geschäftsprozess würde der Lieferant
// benachrichtigt werden (z.B. per E-Mail mit Ablehnungsgrund). Wie auch der "E-Mail-Empfang"
// am Prozessanfang (Task_Receive) wird der Versand hier simuliert (kein echter Mailserver
// im Projekt vorhanden) und stattdessen protokolliert + auf der Konsole ausgegeben.
module.exports = {
  taskType: 'notify-supplier-rejection',
  taskHandler: async (job) => {
    const { invoiceId, supplierName, rejectionReason } = job.variables;
    const reason = rejectionReason || 'Kein Ablehnungsgrund angegeben.';

    console.log('┌─────────────────────────────────────────────────────────┐');
    console.log('│  Benachrichtigung an Lieferanten (simulierter E-Mail-Versand)');
    console.log('├─────────────────────────────────────────────────────────┤');
    console.log(`  An:      ${supplierName || 'Unbekannter Lieferant'}`);
    console.log(`  Betreff: Ihre Rechnung ${invoiceId} wurde abgelehnt`);
    console.log(`  Grund:   ${reason}`);
    console.log('└─────────────────────────────────────────────────────────┘');

    logEvent(invoiceId, `Supplier Notified of Rejection (${reason})`, 'camunda-worker');

    return job.complete({
      supplierNotified: true,
      supplierNotifiedAt: new Date().toISOString(),
    });
  },
};
