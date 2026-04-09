const amqp = require('amqplib');

async function sendPayment() {
  try {
    const connection = await amqp.connect('amqp://guest:guest@localhost:5672');
    const channel = await connection.createChannel();

    const queue = 'payment_requests';
    await channel.assertQueue(queue, { durable: true });

    const paymentOrder = {
      invoiceId: '1',
      supplier: 'Muster GmbH',
      amount_cents: 19999,
      currency: 'EUR',
      timestamp: new Date().toISOString()
    };

    const paymentLog = {
      ...paymentOrder,
      amount_eur: (paymentOrder.amount_cents / 100).toFixed(2)
    };

    channel.sendToQueue(queue, Buffer.from(JSON.stringify(paymentOrder)), {
      persistent: true
    });

    console.log('Zahlungsauftrag gesendet:');
    console.log(paymentLog);

    setTimeout(() => {
      connection.close();
    }, 500);
  } catch (error) {
    console.error('Fehler beim Senden:', error.message);
  }
}

sendPayment();