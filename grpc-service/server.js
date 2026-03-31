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
const invoices = {};

const invoiceServiceImplementation = {
  SaveInvoiceMetadata: (call, callback) => {
    const invoice = call.request;
    invoices[invoice.id] = invoice;
    console.log('Rechnung gespeichert:', invoice);
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
      return callback({
        code: grpc.status.NOT_FOUND,
        message: 'Rechnung nicht gefunden'
      });
    }

    callback(null, invoice);
  }
};

const server = new grpc.Server();
server.addService(invoiceProto.InvoiceService.service, invoiceServiceImplementation);

server.bindAsync('127.0.0.1:50051', grpc.ServerCredentials.createInsecure(), () => {
  console.log('gRPC Server läuft auf Port 50051');
  server.start();
});