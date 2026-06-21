require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs/promises');
const amqp = require('amqplib');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { RABBITMQ_URL } = require('../shared/rabbitmq');

const GRPC_ADDRESS = process.env.GRPC_ADDRESS || '127.0.0.1:50051';
const PAYMENT_QUEUE = 'payment_requests';
const PROTO_PATH = path.join(__dirname, '../proto/invoice.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const invoiceProto = grpc.loadPackageDefinition(packageDefinition).invoice;
const grpcClient = new invoiceProto.InvoiceService(
  GRPC_ADDRESS,
  grpc.credentials.createInsecure()
);

const sentPaymentsPath = path.join(__dirname, 'sent-payments.json');

async function loadSentPayments() {
  try {
    const content = await fs.readFile(sentPaymentsPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function saveSentPayments(sentPayments) {
  await fs.writeFile(sentPaymentsPath, JSON.stringify(sentPayments, null, 2), 'utf8');
}

function centsToEuro(amountCents) {
  const cents = Number(amountCents);
  if (!Number.isFinite(cents)) {
    return 'unbekannt';
  }
  return (cents / 100).toFixed(2);
}

function verifyInvoice(invoiceId) {
  return new Promise((resolve, reject) => {
    grpcClient.GetInvoice({ id: invoiceId }, (err, response) => {
      if (err) {
        return reject(err);
      }
      resolve(response);
    });
  });
}

async function sendPayment() {
  const invoiceId = process.argv[2] || '2';
  const sentPayments = await loadSentPayments();

  if (sentPayments.includes(invoiceId)) {
    console.log(`Zahlung für Rechnung ${invoiceId} wurde bereits gesendet. Kein erneuter Versand.`);
    return;
  }

  try {
    const invoice = await verifyInvoice(invoiceId);

    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    const queue = PAYMENT_QUEUE;
    await channel.assertQueue(queue, { durable: true });

    const paymentOrder = {
      invoiceId: invoice.id,
      supplier: invoice.supplier_name,
      amount_cents: Number(invoice.amount_cents),
      currency: 'EUR',
      timestamp: new Date().toISOString()
    };

    const paymentLog = {
      ...paymentOrder,
      amount_eur: centsToEuro(paymentOrder.amount_cents)
    };

    channel.sendToQueue(queue, Buffer.from(JSON.stringify(paymentOrder)), {
      persistent: true
    });

    await saveSentPayments([...sentPayments, invoiceId]);

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