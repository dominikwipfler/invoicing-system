require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Camunda8 } = require('@camunda8/sdk');
const path = require('path');

// BPMN Process ID (Process_Invoice = aktueller Prozess mit AI-Task + RPA + Payment)
const BPMN_PROCESS_ID = process.env.BPMN_PROCESS_ID || 'Process_Invoice';

// Test-Szenario: "standard" oder "compliance"
const TEST_SCENARIO = process.env.TEST_SCENARIO || 'standard';

// Scenario-Konfiguration
const scenarios = {
  standard: {
    pdf: 'test-invoice.pdf',
    from: 'techsolutions@beispiel.de',
    subject: 'Rechnung RE-2026-0748 von TechSolutions GmbH',
    description: 'Normaler Durchlauf: hohe KI-Konfidenz, Betrag < 10.000€, kein Compliance Check'
  },
  compliance: {
    pdf: 'test-invoice-2.pdf',
    from: 'nordwind@beispiel.de',
    subject: 'Rechnung RE-2026-1102 von Nordwind IT Consulting GmbH',
    description: 'Compliance-Szenario: niedrige KI-Konfidenz, Betrag > 10.000€, triggert KI-Prüfung + Compliance'
  },
  manual: {
    pdf: 'test-invoice.pdf',
    from: 'support@beispiel.de',
    subject: 'Rechnung zur manuellen Korrektur (Demo)',
    description: 'Manuelle Korrektur: forciere niedrige KI-Konfidenz (0%) → Sachbearbeiter muss Daten prüfen und korrigieren',
    forceLowConfidence: true  // Flag für Worker: ignoriere echte KI-Extraktion, setze alle Felder auf null + confidence=0
  }
};

// Fallback auf "standard" bei ungültigem Szenario
const scenario = scenarios[TEST_SCENARIO] || scenarios.standard;

// Argumente: node trigger-from-email.js [scenario]
// Oder Environment-Variablen: TEST_SCENARIO=compliance node trigger-from-email.js
const emailFrom    = process.argv[2] || scenario.from;
const emailSubject = process.argv[3] || scenario.subject;
const pdfPath      = process.argv[4] || path.join(__dirname, '..', 'ai-agent', scenario.pdf);

const emailVariables = {
  emailFrom,
  emailSubject,
  emailReceivedAt: new Date().toISOString(),
  eingangskanal:   'email',
  pdfPath,
  ...(scenario.forceLowConfidence ? { forceLowConfidence: true } : {}),
  ...(process.env.INVOICE_ID ? { invoiceId: process.env.INVOICE_ID } : {}),
};

async function triggerFromEmail() {
  const c8  = new Camunda8();
  const zbc = c8.getZeebeGrpcApiClient();

  console.log(`🧪 Test-Szenario: ${TEST_SCENARIO.toUpperCase()}`);
  console.log(`   ${scenario.description}`);
  console.log('');
  console.log('Eingehende E-Mail erkannt — starte Camunda Prozess:');
  console.log(`  Von:     ${emailFrom}`);
  console.log(`  Betreff: ${emailSubject}`);
  console.log(`  Zeit:    ${emailVariables.emailReceivedAt}`);
  console.log(`  PDF:     ${pdfPath}`);
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