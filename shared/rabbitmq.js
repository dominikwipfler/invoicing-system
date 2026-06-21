// Gemeinsames RabbitMQ-Verbindungsmodul, genutzt von camunda-worker.js,
// payment-worker.js und workflow-engine/server.js. Vorher hatte jeder dieser
// drei Services seine eigene, leicht abweichende Verbindungs-/Reconnect-Logik
// (Code-Duplikation) — jetzt eine einzige Implementierung pro Verbindungstyp.
const amqp = require('amqplib');

// 'localhost' löst unter Windows manchmal zu IPv6 (::1) auf, wo Docker Desktop/WSL2
// das AMQP-Forwarding nicht zuverlässig übernimmt ("Socket closed abruptly during
// opening handshake") — daher feste IPv4-Adresse als Default.
const RABBITMQ_URL = (process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672')
  .replace('localhost', '127.0.0.1');

const RECONNECT_INITIAL_MS = Number(process.env.RABBITMQ_RECONNECT_INITIAL_MS) || 1000;
const RECONNECT_MAX_MS = Number(process.env.RABBITMQ_RECONNECT_MAX_MS) || 15000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextBackoffMs(attempt) {
  return Math.min(RECONNECT_INITIAL_MS * (2 ** (attempt - 1)), RECONNECT_MAX_MS);
}

// Lazy, selbst-invalidierender Channel für einzelne Publishes (z.B. aus Zeebe-Job-Handlern,
// wo Zeebes eigener Job-Retry bereits für Resilienz bei Verbindungsfehlern sorgt).
function createChannelCache({ url = RABBITMQ_URL, connectTimeoutMs, assertQueues = [] } = {}) {
  let channelPromise = null;

  async function connect() {
    const connection = await amqp.connect(url, connectTimeoutMs ? { timeout: connectTimeoutMs } : undefined);
    const channel = await connection.createChannel();
    for (const queue of assertQueues) {
      await channel.assertQueue(queue, { durable: true });
    }
    connection.on('close', () => { channelPromise = null; });
    connection.on('error', () => { channelPromise = null; });
    return channel;
  }

  return function getChannel() {
    if (!channelPromise) channelPromise = connect();
    return channelPromise;
  };
}

// Verbindet sich dauerhaft mit RabbitMQ und konsumiert eine Queue; reconnected bei
// Verbindungsabbruch automatisch mit exponentiellem Backoff. Für langlaufende Worker-Prozesse
// (payment-worker, workflow-engine), die — anders als Zeebe-Jobs — nicht einzeln neu
// angestoßen werden, sondern dauerhaft auf Nachrichten warten müssen.
async function consumeWithReconnect({ url = RABBITMQ_URL, assertQueues, consumeQueue, prefetch, label, onReady, onMessage }) {
  let attempt = 0;

  while (true) {
    try {
      const connection = await amqp.connect(url);
      const channel = await connection.createChannel();
      attempt = 0;

      for (const queue of assertQueues) {
        await channel.assertQueue(queue, { durable: true });
      }
      if (prefetch) await channel.prefetch(prefetch);

      console.log(`${label || 'RabbitMQ-Consumer'} läuft und wartet auf Nachrichten...`);

      connection.on('error', (error) => {
        console.error('RabbitMQ-Verbindungsfehler:', error.message);
      });

      if (onReady) onReady(channel);

      await new Promise((resolve) => {
        connection.on('close', () => {
          console.warn('RabbitMQ-Verbindung geschlossen. Reconnect wird gestartet...');
          resolve();
        });

        channel.consume(consumeQueue, (msg) => {
          if (msg === null) return;
          onMessage(msg, channel);
        }, { noAck: false });
      });
    } catch (error) {
      attempt += 1;
      const backoffMs = nextBackoffMs(attempt);
      console.error(`${label || 'RabbitMQ-Consumer'} Fehler: ${error.message}`);
      console.warn(`Neuer Verbindungsversuch in ${backoffMs}ms (Versuch ${attempt})...`);
      await sleep(backoffMs);
    }
  }
}

module.exports = { RABBITMQ_URL, sleep, nextBackoffMs, createChannelCache, consumeWithReconnect };
