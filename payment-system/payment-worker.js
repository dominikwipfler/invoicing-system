require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const { logEvent } = require('./event-logger');
const { consumeWithReconnect } = require('../shared/rabbitmq');

const QUEUE_NAME = 'payment_requests';
const PAYMENT_STATUS_QUEUE = 'payment_status_updates';

const paidInvoices = new Set();

function formatAmount(payment) {
  const cents = Number(payment.amount_cents);
  if (!Number.isFinite(cents)) {
    return 'unbekannt';
  }
  return `${(cents / 100).toFixed(2)} ${payment.currency || 'EUR'}`;
}

function handlePaymentMessage(msg, channel) {
  try {
    const payment = JSON.parse(msg.content.toString());

    // Überprüfung auf Duplikat-Zahlung
    if (paidInvoices.has(payment.invoiceId)) {
      logEvent(payment.invoiceId, 'Duplicate Payment Attempt', 'payment-worker');
      channel.sendToQueue(PAYMENT_STATUS_QUEUE, Buffer.from(JSON.stringify({
        invoiceId: payment.invoiceId,
        status: 'PAYMENT_DUPLICATE_REJECTED',
        timestamp: new Date().toISOString()
      })), { persistent: true });
      console.warn(`Duplikat-Zahlung für bereits bezahlte Rechnung ${payment.invoiceId} - Nachricht verworfen`);
      channel.nack(msg, false, false); // nicht requeue
      return;
    }

    // Event: Zahlung empfangen
    logEvent(payment.invoiceId, 'Payment Initiated', 'payment-worker');

    console.log('Zahlungsauftrag empfangen:');
    console.log({
      ...payment,
      amount_eur: formatAmount(payment)
    });

    // Simuliere gelegentlichen Fehler für Prozess-Varianten (10% Chance)
    if (Math.random() < 0.1) {
      logEvent(payment.invoiceId, 'Payment Failed', 'payment-worker');
      channel.sendToQueue(PAYMENT_STATUS_QUEUE, Buffer.from(JSON.stringify({
        invoiceId: payment.invoiceId,
        status: 'PAYMENT_FAILED',
        timestamp: new Date().toISOString()
      })), { persistent: true });
      console.warn(`Zahlung fehlgeschlagen für Rechnung ${payment.invoiceId} - wird wiederholt`);
      channel.nack(msg, false, true); // zurück in die Queue
      return;
    }

    console.log(`Zahlung verarbeitet für Rechnung ${payment.invoiceId} über ${formatAmount(payment)}`);

    // Event: Zahlung erfolgreich
    logEvent(payment.invoiceId, 'Payment Processed', 'payment-worker');
    channel.sendToQueue(PAYMENT_STATUS_QUEUE, Buffer.from(JSON.stringify({
      invoiceId: payment.invoiceId,
      status: 'PAYMENT_PROCESSED',
      timestamp: new Date().toISOString()
    })), { persistent: true });

    // Markiere Rechnung als bezahlt
    paidInvoices.add(payment.invoiceId);

    channel.ack(msg);
  } catch (parseError) {
    console.error('Ungültige Zahlungsnachricht:', parseError.message);
    logEvent('unknown', 'Payment Parse Error', 'payment-worker');
    channel.nack(msg, false, false);
  }
}

consumeWithReconnect({
  assertQueues: [QUEUE_NAME, PAYMENT_STATUS_QUEUE],
  consumeQueue: QUEUE_NAME,
  prefetch: 1,
  label: 'Payment Worker',
  onMessage: handlePaymentMessage,
});
