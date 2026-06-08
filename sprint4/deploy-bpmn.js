require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Camunda8 } = require('@camunda8/sdk');
const fs   = require('fs');
const path = require('path');

async function deploy() {
  const c8  = new Camunda8();
  const zbc = c8.getZeebeGrpcApiClient();

  const bpmnFile  = path.resolve(__dirname, 'G4_sprint_4.bpmn');
  const formsDir  = path.resolve(__dirname, 'forms');

  console.log('Deploye BPMN + Formulare...');

  const result = await zbc.deployResources([
    { processFilename: bpmnFile },
    { name: 'rechnungserfassung.form', form: fs.readFileSync(path.join(formsDir, 'rechnungserfassung.form')) },
    { name: 'freigabe.form',           form: fs.readFileSync(path.join(formsDir, 'freigabe.form')) },
    { name: 'erp-bestaetigung.form',   form: fs.readFileSync(path.join(formsDir, 'erp-bestaetigung.form')) },
  ]);

  console.log('\nDeployment erfolgreich:');
  (result.deployments || []).forEach(dep => {
    const p = dep.process || dep.form;
    if (dep.process) console.log(`  BPMN: ${p.bpmnProcessId} v${p.version} (key: ${p.processDefinitionKey})`);
    if (dep.form)    console.log(`  Form: ${p.formId} v${p.version}`);
  });

  await zbc.close();
}

deploy().catch(err => {
  console.error('Fehler:', err.message);
  process.exit(1);
});
