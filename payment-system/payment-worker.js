const amqp = require('amqplib');
const { logEvent } = require('./event-logger');

const RABBITMQ_URL = 'amqp://guest:guest@localhost:5672';
const QUEUE_NAME = 'payment_requests';
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatAmount(payment) {
  const cents = Number(payment.amount_cents);
  if (!Number.isFinite(cents)) {
    return 'unbekannt';
  }
  return `${(cents / 100).toFixed(2)} ${payment.currency || 'EUR'}`;
}

async function startPaymentWorker() {
  let attempt = 0;

  while (true) {
    try {
      const connection = await amqp.connect(RABBITMQ_URL);
      const channel = await connection.createChannel();

      attempt = 0;

      await channel.assertQueue(QUEUE_NAME, { durable: true });
      await channel.prefetch(1);

      console.log('Payment Worker läuft und wartet auf Nachrichten...');

      connection.on('error', (error) => {
        console.error('RabbitMQ-Verbindungsfehler:', error.message);
      });

      await new Promise((resolve) => {
        connection.on('close', () => {
          console.warn('RabbitMQ-Verbindung geschlossen. Reconnect wird gestartet...');
          resolve();
        });

        channel.consume(QUEUE_NAME, (msg) => {
          if (msg === null) return;

          try {
            const payment = JSON.parse(msg.content.toString());

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
              console.warn(`Zahlung fehlgeschlagen für Rechnung ${payment.invoiceId} - wird wiederholt`);
              channel.nack(msg, false, true); // zurück in die Queue
              return;
            }

            console.log(`Zahlung verarbeitet für Rechnung ${payment.invoiceId} über ${formatAmount(payment)}`);

            // Event: Zahlung erfolgreich
            logEvent(payment.invoiceId, 'Payment Processed', 'payment-worker');

            channel.ack(msg);
          } catch (parseError) {
            console.error('Ungültige Zahlungsnachricht:', parseError.message);
            logEvent('unknown', 'Payment Parse Error', 'payment-worker');
            channel.nack(msg, false, false);
          }
        }, { noAck: false });
      });
    } catch (error) {
      attempt += 1;
      const backoffMs = Math.min(INITIAL_BACKOFF_MS * (2 ** (attempt - 1)), MAX_BACKOFF_MS);
      console.error(`Fehler im Payment Worker: ${error.message}`);
      console.warn(`Neuer Verbindungsversuch in ${backoffMs}ms (Versuch ${attempt})...`);
      await sleep(backoffMs);
    }
  }
}

startPaymentWorker();
