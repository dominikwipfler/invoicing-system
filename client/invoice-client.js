const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.join(__dirname, '../proto/invoice.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const invoiceProto = grpc.loadPackageDefinition(packageDefinition).invoice;

const client = new invoiceProto.InvoiceService(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

function centsToEuro(amountCents) {
  const cents = Number(amountCents);
  if (!Number.isFinite(cents)) {
    return 'unbekannt';
  }

  return (cents / 100).toFixed(2);
}

const invoice = {
  id: '2',
  supplier_name: 'Muster GmbH',
  invoice_number: 'RG-1002',
  amount_cents: 29999,
  date: '2026-03-31',
};

client.SaveInvoiceMetadata(invoice, (err, response) => {
  if (err) {
    if (err.code === grpc.status.ALREADY_EXISTS) {
      console.warn('Rechnung bereits vorhanden:', err.message);
    } else {
      console.error('Fehler beim Speichern:', err.message);
      return;
    }
  } else {
    console.log('Speichern erfolgreich:', response);
  }

  client.GetInvoice({ id: invoice.id }, (err2, invoiceResponse) => {
    if (err2) {
      console.error('Fehler beim Abrufen:', err2.message);
      return;
    }

    const enrichedResponse = {
      ...invoiceResponse,
      amount_eur: centsToEuro(invoiceResponse.amount_cents)
    };

    console.log('Rechnung geladen:', enrichedResponse);
  });
});