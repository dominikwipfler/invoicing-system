const amqp = require('amqplib');

async function startPaymentWorker() {
  try {
    const connection = await amqp.connect('amqp://guest:guest@localhost:5672');
    const channel = await connection.createChannel();

    const queue = 'payment_requests';
    await channel.assertQueue(queue, { durable: true });

    console.log('Payment Worker läuft und wartet auf Nachrichten...');

    channel.consume(queue, (msg) => {
      if (msg !== null) {
        const payment = JSON.parse(msg.content.toString());

        console.log('Zahlungsauftrag empfangen:');
        console.log(payment);

        console.log(`Zahlung verarbeitet für Rechnung ${payment.invoiceId}`);

        channel.ack(msg);
      }
    });
  } catch (error) {
    console.error('Fehler im Payment Worker:', error.message);
  }
}

startPaymentWorker();