const { logEvent } = require('../lib/event-log');
const { createChannelCache } = require('../../shared/rabbitmq');

const PAYMENT_QUEUE = 'payment_requests';
const PAYMENT_RETRY_BACKOFF_MS = Number(process.env.PAYMENT_RETRY_BACKOFF_MS) || 2000;
const RABBITMQ_CONNECT_TIMEOUT_MS = Number(process.env.RABBITMQ_CONNECT_TIMEOUT_MS) || 5000;

const getRabbitChannel = createChannelCache({
  connectTimeoutMs: RABBITMQ_CONNECT_TIMEOUT_MS,
  assertQueues: [PAYMENT_QUEUE],
});

// Verbindungsfehler (RabbitMQ nicht erreichbar/Timeout) sind technische Fehler —
// dafür ist Zeebes eingebauter Job-Retry zuständig, nicht die Finanzabteilung.
const CONNECTION_ERROR_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'EPIPE']);
function isConnectionError(err) {
  if (err.code && CONNECTION_ERROR_CODES.has(err.code)) return true;
  return /socket closed abruptly|connect ECONNREFUSED|connection.*closed/i.test(err.message || '');
}

// 3. Zahlung via RabbitMQ senden
// Factory statt einfachem Objekt-Export, da dieser Handler im Eskalationsfall
// zbc.setVariables() braucht (Prozessinstanz-Variable außerhalb des Job-Scopes setzen).
module.exports = function createRabbitmqPaymentWorker(zbc) {
  return {
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

        if (isConnectionError(err) && job.retries > 1) {
          // Technischer Fehler, noch Versuche übrig — automatischer Zeebe-Retry,
          // analog zum gRPC-Fix (kein Eingriff der Finanzabteilung bei kurzem Aussetzer).
          const retriesLeft = job.retries - 1;
          console.warn(`[rabbitmq-payment] RabbitMQ nicht erreichbar — Zeebe-Retry (verbleibend: ${retriesLeft})`);
          return job.fail({
            errorMessage: `RabbitMQ nicht erreichbar: ${err.message}`,
            retries: retriesLeft,
            retryBackOff: PAYMENT_RETRY_BACKOFF_MS,
          });
        }

        // Letzter Versuch ausgeschöpft (oder kein reiner Verbindungsfehler) —
        // Eskalation an die Finanzabteilung statt stillem Prozessabbruch.
        console.warn(`[rabbitmq-payment] Keine Versuche mehr übrig — Eskalation an Finanzabteilung (Grund: ${err.message})`);
        logEvent(invoiceId, 'Payment Escalated to Finance', 'camunda-worker');

        // job.error()'s "variables" landen laut Zeebe-Doku nur im lokalen Scope des
        // Error-Catch-Boundary-Events und sind im nachfolgenden Formular NICHT sichtbar.
        // Deshalb die Variable direkt auf der Prozessinstanz setzen (separater API-Call).
        await zbc.setVariables({
          elementInstanceKey: job.processInstanceKey,
          variables: { paymentFailureReason: err.message },
        });

        return job.error('PAYMENT_ERROR', `Zahlung fehlgeschlagen: ${err.message}`);
      }
    },
  };
};
