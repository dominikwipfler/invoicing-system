require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Camunda8 } = require('@camunda8/sdk');

const CLUSTER      = '487e2664-45fe-4a21-9e53-860eddc37e5e';
const REGION       = 'bru-2';
const OPERATE_BASE = `https://${REGION}.operate.camunda.io/${CLUSTER}`;
const OAUTH_URL    = process.env.CAMUNDA_OAUTH_URL || 'https://login.cloud.camunda.io/oauth/token';
const CLIENT_ID    = process.env.ZEEBE_CLIENT_ID;
const CLIENT_SECRET = process.env.ZEEBE_CLIENT_SECRET;

async function getOperateToken() {
  const res = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, audience: 'operate.camunda.io' }),
  });
  if (!res.ok) throw new Error(`Token-Fehler: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function cancelAllIncidents() {
  console.log('Hole OAuth-Token für Operate...');
  const token = await getOperateToken();

  console.log('Suche aktive Instanzen mit Incidents...');
  const searchRes = await fetch(`${OPERATE_BASE}/v1/process-instances/search`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter: { state: 'ACTIVE' }, size: 50 }),
  });
  if (!searchRes.ok) throw new Error(`Suche fehlgeschlagen: ${searchRes.status} ${await searchRes.text()}`);
  const data = await searchRes.json();
  const instances = data.items || [];
  console.log(`Gefunden: ${instances.length} Instanzen\n`);

  if (instances.length === 0) {
    console.log('Nichts zu tun.');
    return;
  }

  console.log('Erste Instanz zum Test:', instances[0].key, typeof instances[0].key);

  const c8  = new Camunda8();
  const zbc = c8.getZeebeGrpcApiClient();

  let cancelled = 0;
  let failed = 0;

  for (const inst of instances) {
    try {
      // Zeebe gRPC cancelProcessInstance nimmt den Key direkt (kein Objekt-Wrapper)
      await zbc.cancelProcessInstance(inst.key);
      console.log(`  OK   ${inst.key}`);
      cancelled++;
    } catch (err) {
      // Fallback: als String versuchen
      try {
        await zbc.cancelProcessInstance(String(inst.key));
        console.log(`  OK   ${inst.key} (als String)`);
        cancelled++;
      } catch (err2) {
        console.log(`  FAIL ${inst.key}: ${err2.message}`);
        failed++;
      }
    }
  }

  console.log(`\nErgebnis: ${cancelled} abgebrochen, ${failed} Fehler`);
  await zbc.close();
}

cancelAllIncidents().catch(err => {
  console.error('Fehler:', err.message);
  process.exit(1);
});
