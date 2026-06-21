require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { logEvent } = require('./event-logger');
const { createChannelCache, consumeWithReconnect } = require('../shared/rabbitmq');

const PROTO_PATH = path.join(__dirname, '../proto/invoice.proto');
const GRPC_ADDRESS = process.env.GRPC_ADDRESS || '127.0.0.1:50051';
const PAYMENT_QUEUE = 'payment_requests';
const PAYMENT_STATUS_QUEUE = 'payment_status_updates';
const PORT = Number(process.env.WORKFLOW_ENGINE_PORT) || 3001;

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const invoiceProto = grpc.loadPackageDefinition(packageDefinition).invoice;
const grpcClient = new invoiceProto.InvoiceService(GRPC_ADDRESS, grpc.credentials.createInsecure());

const app = express();
app.use(express.json());

const workflows = new Map();
const getPublishChannel = createChannelCache({ assertQueues: [PAYMENT_QUEUE] });

function getWorkflowId(invoiceId) {
  return `wf-${invoiceId}`;
}

function saveInvoiceMetadata(invoice) {
  return new Promise((resolve, reject) => {
    grpcClient.SaveInvoiceMetadata(invoice, (err, response) => {
      if (!err) {
        return resolve(response);
      }

      if (err.code === grpc.status.ALREADY_EXISTS) {
        return resolve({ success: true, id: invoice.id, error: err.message });
      }

      reject(err);
    });
  });
}

function getInvoice(invoiceId) {
  return new Promise((resolve, reject) => {
    grpcClient.GetInvoice({ id: invoiceId }, (err, response) => {
      if (err) return reject(err);
      resolve(response);
    });
  });
}

function updateWorkflowStatusByPayment(paymentUpdate) {
  const workflowId = getWorkflowId(paymentUpdate.invoiceId);
  const workflow = workflows.get(workflowId);

  if (!workflow) {
    return;
  }

  if (paymentUpdate.status === 'PAYMENT_FAILED') {
    workflow.status = 'PAYMENT_RETRY_PENDING';
    logEvent(workflow.invoiceId, 'Workflow Payment Retry Pending', 'workflow-engine');
  }

  if (paymentUpdate.status === 'PAYMENT_PROCESSED') {
    workflow.status = 'COMPLETED';
    workflow.completedAt = paymentUpdate.timestamp;
    logEvent(workflow.invoiceId, 'Workflow Completed', 'workflow-engine');
  }

  if (paymentUpdate.status === 'PAYMENT_DUPLICATE_REJECTED') {
    workflow.status = 'FAILED_DUPLICATE_PAYMENT';
    workflow.failedAt = paymentUpdate.timestamp;
    logEvent(workflow.invoiceId, 'Workflow Failed Duplicate Payment', 'workflow-engine');
  }

  workflows.set(workflowId, workflow);
}

function startPaymentStatusConsumer() {
  return consumeWithReconnect({
    assertQueues: [PAYMENT_STATUS_QUEUE],
    consumeQueue: PAYMENT_STATUS_QUEUE,
    label: 'Workflow Engine (payment_status_updates)',
    onMessage: (msg, channel) => {
      try {
        const paymentUpdate = JSON.parse(msg.content.toString());
        updateWorkflowStatusByPayment(paymentUpdate);
        channel.ack(msg);
      } catch (error) {
        console.error('Ungültiges Payment-Status-Event:', error.message);
        channel.nack(msg, false, false);
      }
    },
  });
}

app.post('/workflows/start', async (req, res) => {
  const invoice = req.body;

  if (!invoice?.id || !invoice?.supplier_name || !invoice?.invoice_number || invoice?.amount_cents == null || !invoice?.date) {
    return res.status(400).json({ error: 'Fehlende Pflichtfelder für invoice.' });
  }

  const workflowId = getWorkflowId(invoice.id);
  if (workflows.has(workflowId)) {
    return res.status(409).json({ error: `Workflow ${workflowId} existiert bereits.` });
  }

  try {
    await saveInvoiceMetadata(invoice);

    const workflow = {
      workflowId,
      invoiceId: invoice.id,
      status: 'PENDING_APPROVAL',
      startedAt: new Date().toISOString(),
      approvalBy: 'Sachbearbeiter',
    };

    workflows.set(workflowId, workflow);

    logEvent(invoice.id, 'Workflow Started', 'workflow-engine');
    logEvent(invoice.id, 'Manual Approval Pending', 'workflow-engine');

    return res.status(201).json(workflow);
  } catch (error) {
    return res.status(502).json({ error: `Workflow konnte nicht gestartet werden: ${error.message}` });
  }
});

app.post('/workflows/:workflowId/approve', async (req, res) => {
  const { workflowId } = req.params;
  const workflow = workflows.get(workflowId);

  if (!workflow) {
    return res.status(404).json({ error: 'Workflow nicht gefunden.' });
  }

  if (workflow.status !== 'PENDING_APPROVAL') {
    return res.status(409).json({ error: `Workflow ist nicht genehmigungsfähig (Status: ${workflow.status}).` });
  }

  try {
    const invoice = await getInvoice(workflow.invoiceId);

    const paymentOrder = {
      invoiceId: invoice.id,
      supplier: invoice.supplier_name,
      amount_cents: Number(invoice.amount_cents),
      currency: 'EUR',
      timestamp: new Date().toISOString(),
      source: 'workflow-engine',
    };

    const publishChannel = await getPublishChannel();
    publishChannel.sendToQueue(PAYMENT_QUEUE, Buffer.from(JSON.stringify(paymentOrder)), { persistent: true });

    workflow.status = 'PAYMENT_IN_PROGRESS';
    workflow.approvedAt = new Date().toISOString();
    workflows.set(workflowId, workflow);

    logEvent(invoice.id, 'Manual Approval Granted', 'workflow-engine');
    logEvent(invoice.id, 'Payment Request Sent', 'workflow-engine');

    return res.json(workflow);
  } catch (error) {
    return res.status(502).json({ error: `Genehmigung fehlgeschlagen: ${error.message}` });
  }
});

app.get('/workflows/:workflowId', (req, res) => {
  const workflow = workflows.get(req.params.workflowId);
  if (!workflow) {
    return res.status(404).json({ error: 'Workflow nicht gefunden.' });
  }

  return res.json(workflow);
});

app.get('/workflows', (req, res) => {
  return res.json(Array.from(workflows.values()));
});

async function bootstrap() {
  try {
    await getPublishChannel();
    startPaymentStatusConsumer();

    app.listen(PORT, () => {
      console.log(`Workflow Engine läuft auf http://localhost:${PORT}`);
      console.log('Endpoints: POST /workflows/start, POST /workflows/:id/approve, GET /workflows');
    });
  } catch (error) {
    console.error('Workflow Engine konnte nicht gestartet werden:', error.message);
    process.exit(1);
  }
}

bootstrap();
