const workflowInvoice = {
  id: 'WF-1001',
  supplier_name: 'Workflow Demo GmbH',
  invoice_number: 'WF-RG-1001',
  amount_cents: 45999,
  date: '2026-04-26',
};

async function runWorkflowDemo() {
  const startResponse = await fetch('http://localhost:3001/workflows/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(workflowInvoice),
  });

  const startedWorkflow = await startResponse.json();

  if (!startResponse.ok) {
    throw new Error(`Start fehlgeschlagen: ${startedWorkflow.error || startResponse.statusText}`);
  }

  console.log('Workflow gestartet:', startedWorkflow);

  const approveResponse = await fetch(`http://localhost:3001/workflows/${startedWorkflow.workflowId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const approvedWorkflow = await approveResponse.json();
  if (!approveResponse.ok) {
    throw new Error(`Freigabe fehlgeschlagen: ${approvedWorkflow.error || approveResponse.statusText}`);
  }

  console.log('Workflow genehmigt:', approvedWorkflow);

  console.log('Warte auf asynchrone Zahlungsverarbeitung...');
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const finalResponse = await fetch(`http://localhost:3001/workflows/${startedWorkflow.workflowId}`);
  const finalWorkflow = await finalResponse.json();

  if (!finalResponse.ok) {
    throw new Error(`Abruf fehlgeschlagen: ${finalWorkflow.error || finalResponse.statusText}`);
  }

  console.log('Finaler Workflow-Status:', finalWorkflow);
}

runWorkflowDemo().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
