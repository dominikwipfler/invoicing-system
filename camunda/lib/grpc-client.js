const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const GRPC_ADDRESS = process.env.GRPC_ADDRESS || '127.0.0.1:50051';
const GRPC_CALL_TIMEOUT_MS = Number(process.env.GRPC_CALL_TIMEOUT_MS) || 5000;
const GRPC_RETRY_BACKOFF_MS = Number(process.env.GRPC_RETRY_BACKOFF_MS) || 2000;

const PROTO_PATH = path.join(__dirname, '..', '..', 'proto', 'invoice.proto');
const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
});
const invoiceProto = grpc.loadPackageDefinition(packageDef).invoice;
const grpcClient = new invoiceProto.InvoiceService(
  GRPC_ADDRESS,
  grpc.credentials.createInsecure()
);

function saveViaGrpc(invoice) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + GRPC_CALL_TIMEOUT_MS;
    grpcClient.SaveInvoiceMetadata(invoice, { deadline }, (err, response) => {
      if (err) return reject(err);
      resolve(response);
    });
  });
}

// Verbindungsfehler (Service nicht erreichbar / Timeout) sind technische Fehler —
// dafür ist Zeebes eingebauter Job-Retry zuständig, nicht der Sachbearbeiter.
const TRANSIENT_GRPC_CODES = new Set([grpc.status.UNAVAILABLE, grpc.status.DEADLINE_EXCEEDED]);
function isServiceUnavailable(err) {
  return TRANSIENT_GRPC_CODES.has(err.code);
}

module.exports = { GRPC_ADDRESS, GRPC_RETRY_BACKOFF_MS, grpcClient, saveViaGrpc, isServiceUnavailable };
