const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { logEvent } = require('./event-logger');

const PROTO_PATH = path.join(__dirname, '../proto/invoice.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const invoiceProto = grpc.loadPackageDefinition(packageDefinition).invoice;
const invoices = {};

function centsToEuro(amountCents) {
  const cents = Number(amountCents);
  if (!Number.isFinite(cents)) {
    return 'unbekannt';
  }
  return (cents / 100).toFixed(2);
}

const invoiceServiceImplementation = {
  SaveInvoiceMetadata: (call, callback) => {
    const invoice = call.request;

    // Überprüfung auf Duplikat
    if (invoices[invoice.id]) {
      logEvent(invoice.id, 'Duplicate Invoice Attempt', 'grpc-service');
      return callback({
        code: grpc.status.ALREADY_EXISTS,
        message: 'Rechnung bereits gespeichert oder gezahlt.'
      });
    }

    // Event: Rechnung empfangen
    logEvent(invoice.id, 'Invoice Received', 'grpc-service');

    invoices[invoice.id] = invoice;

    const logInvoice = {
      ...invoice,
      amount_eur: centsToEuro(invoice.amount_cents)
    };

    console.log('Rechnung gespeichert:', logInvoice);

    // Event: Rechnung gespeichert
    logEvent(invoice.id, 'Invoice Stored', 'grpc-service');

    callback(null, {
      success: true,
      id: invoice.id,
      error: ''
    });
  },

  GetInvoice: (call, callback) => {
    const id = call.request.id;
    const invoice = invoices[id];

    if (!invoice) {
      logEvent(id, 'Invoice Not Found', 'grpc-service');
      return callback({
        code: grpc.status.NOT_FOUND,
        message: 'Rechnung nicht gefunden'
      });
    }

    logEvent(id, 'Invoice Retrieved', 'grpc-service');
    callback(null, invoice);
  }
};

const server = new grpc.Server();
server.addService(invoiceProto.InvoiceService.service, invoiceServiceImplementation);

server.bindAsync('127.0.0.1:50051', grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) {
    console.error('gRPC Bind-Fehler:', err.message);
    process.exit(1);
  }

  if (!port) {
    console.error('gRPC Bind fehlgeschlagen: kein Port wurde gebunden.');
    process.exit(1);
  }

  console.log(`gRPC Server läuft auf Port ${port}`);
});
