require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Camunda8 } = require('@camunda8/sdk');

// BPMN Process ID aus Camunda Operate (Process_11wgywq = deployed Sprint 4 Prozess)
const BPMN_PROCESS_ID = process.env.BPMN_PROCESS_ID || 'Process_11wgywq';

// Simulierte E-Mail-Daten — Argumente: node trigger-from-email.js <absender> <betreff>
const emailFrom    = process.argv[2] || 'lieferant@beispiel.de';
const emailSubject = process.argv[3] || 'Rechnung RG-2026-042 für Lieferung Mai 2026';

const emailVariables = {
  emailFrom,
  emailSubject,
  emailReceivedAt: new Date().toISOString(),
  eingangskanal:   'email',
};

async function triggerFromEmail() {
  const c8  = new Camunda8();
  const zbc = c8.getZeebeGrpcApiClient();

  console.log('Eingehende E-Mail erkannt — starte Camunda Prozess:');
  console.log(`  Von:     ${emailFrom}`);
  console.log(`  Betreff: ${emailSubject}`);
  console.log(`  Zeit:    ${emailVariables.emailReceivedAt}`);
  console.log('');

  const result = await zbc.createProcessInstance({
    bpmnProcessId: BPMN_PROCESS_ID,
    variables:     emailVariables,
  });

  const CLUSTER   = '487e2664-45fe-4a21-9e53-860eddc37e5e';
  const REGION    = 'bru-2';
  const key       = result.processInstanceKey;

  console.log('Prozessinstanz erfolgreich gestartet:');
  console.log(`  Process Instance Key: ${key}`);
  console.log(`  BPMN Process ID:      ${result.bpmnProcessId}`);
  console.log(`  Version:              ${result.version}`);
  console.log('');
  console.log('── Links ──────────────────────────────────────────────────────');
  console.log(`  Tasklist (manuelle Aufgaben):`)
  console.log(`  https://${REGION}.tasklist.camunda.io/${CLUSTER}`);
  console.log('');
  console.log(`  Operate (Prozess verfolgen — direkt zu dieser Instanz):`);
  console.log(`  https://${REGION}.operate.camunda.io/${CLUSTER}/processes/${key}`);
  console.log('────────────────────────────────────────────────────────────────');

  await zbc.close();
}

triggerFromEmail().catch(err => {
  console.error('Fehler beim Starten des Prozesses:', err.message);
  process.exit(1);
});