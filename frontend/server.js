require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

function runCommand(cmd, opts) {
  return new Promise((resolve, reject) => {
    exec(cmd, opts, (err, stdout) => {
      if (err) { err.stdout = stdout; reject(err); }
      else { resolve(stdout); }
    });
  });
}

const app = express();
const config = require('./config.json');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/invoices', express.static(path.join(__dirname, '..', 'ai-agent')));

// FRONTEND_PORT (.env) überschreibt config.json, falls gesetzt — config.json bleibt
// die Quelle für die übrigen, an die Camunda-Cloud-Instanz gebundenen Werte (region/clusterId),
// die nicht pro Umgebung variieren.
const PORT = Number(process.env.FRONTEND_PORT) || config.server.port;
const projectRoot = path.join(__dirname, '..');
const eventLogPath = path.join(projectRoot, config.paths.eventLog);
const pidFilePath = path.join(projectRoot, config.paths.pidFile);

// ── SERVER STATE (für Live-Mode) ───────────────────────────────────────
let lastTriggeredCaseId = null;
let lastTriggeredAt = null;

// ── ROUTES ─────────────────────────────────────────────────────────────

// GET / → Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// GET /api/config → Sende Konfiguration ans Frontend (für URLs)
app.get('/api/config', (req, res) => {
  res.json({
    port: PORT,
    camunda: config.camunda
  });
});

// Hilfsfunktion: Schreibe Event in event-log.csv
function logEvent(caseId, activity, resource = 'frontend') {
  try {
    const timestamp = new Date().toISOString();
    const line = `${caseId},${activity},${timestamp},${resource}\n`;
    fs.appendFileSync(eventLogPath, line);
  } catch (error) {
    console.warn('[API] Konnte Event nicht loggen:', error.message);
  }
}

// POST /api/trigger/standard → Starte Standard-Szenario
app.post('/api/trigger/standard', async (req, res) => {
  const caseId = 'INV-' + Date.now();
  lastTriggeredCaseId = caseId;
  lastTriggeredAt = new Date().toISOString();
  logEvent(caseId, 'Trigger Standard', 'frontend');
  console.log('[API] Triggere Standard-Szenario...');
  try {
    const result = await runCommand('npm run trigger:email:standard', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 60000,
      env: { ...process.env, INVOICE_ID: caseId },
      stdio: ['pipe', 'pipe', 'pipe'],  // Wichtig: stdin/stdout/stderr explizit auf pipes
    });
    const keyMatch = result.match(/Process Instance Key:\s+(\d+)/);
    const processInstanceKey = keyMatch ? keyMatch[1] : null;
    console.log('[API] Standard-Szenario gestartet, Key:', processInstanceKey);
    res.json({ success: true, message: 'Standard-Szenario gestartet', caseId, processInstanceKey, output: result });
  } catch (error) {
    console.error('[API] Fehler beim Standard-Szenario:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/trigger/compliance → Starte Compliance-Szenario
app.post('/api/trigger/compliance', async (req, res) => {
  const caseId = 'INV-' + Date.now();
  lastTriggeredCaseId = caseId;
  lastTriggeredAt = new Date().toISOString();
  logEvent(caseId, 'Trigger Compliance', 'frontend');
  console.log('[API] Triggere Compliance-Szenario...');
  try {
    const result = await runCommand('npm run trigger:email:compliance', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 60000,
      env: { ...process.env, INVOICE_ID: caseId },
      stdio: ['pipe', 'pipe', 'pipe'],  // Wichtig: stdin/stdout/stderr explizit auf pipes
    });
    const keyMatch = result.match(/Process Instance Key:\s+(\d+)/);
    const processInstanceKey = keyMatch ? keyMatch[1] : null;
    console.log('[API] Compliance-Szenario gestartet, Key:', processInstanceKey);
    res.json({ success: true, message: 'Compliance-Szenario gestartet', caseId, processInstanceKey, output: result });
  } catch (error) {
    console.error('[API] Fehler beim Compliance-Szenario:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/trigger/manual → Starte Manuelle-Korrektur-Szenario
app.post('/api/trigger/manual', async (req, res) => {
  const caseId = 'INV-' + Date.now();
  lastTriggeredCaseId = caseId;
  lastTriggeredAt = new Date().toISOString();
  logEvent(caseId, 'Trigger Manual', 'frontend');
  console.log('[API] Triggere Manuelle-Korrektur-Szenario...');
  try {
    const result = await runCommand('npm run trigger:email:manual', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 60000,
      env: { ...process.env, INVOICE_ID: caseId },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const keyMatch = result.match(/Process Instance Key:\s+(\d+)/);
    const processInstanceKey = keyMatch ? keyMatch[1] : null;
    console.log('[API] Manuelle-Korrektur-Szenario gestartet, Key:', processInstanceKey);
    res.json({ success: true, message: 'Manuelle-Korrektur-Szenario gestartet', caseId, processInstanceKey, output: result });
  } catch (error) {
    console.error('[API] Fehler beim Manuelle-Korrektur-Szenario:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/process-activity → Process Activity Feed mit mode Parameter
// ?mode=live   → nur Events der aktuellen case_id
// ?mode=history → letzte N Prozesse (alle ihre Events), default 50, steuerbar via ?maxProcesses=
app.get('/api/process-activity', (req, res) => {
  try {
    const mode = req.query.mode || 'history';
    const maxProcesses = parseInt(req.query.maxProcesses, 10) || 50;

    if (!fs.existsSync(eventLogPath)) {
      res.json({ events: [], mode, lastTriggeredCaseId });
      return;
    }

    const content = fs.readFileSync(eventLogPath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);

    // Header + Daten
    const header = lines[0];
    const dataLines = lines.slice(1);

    // CSV-Parser: activity kann Kommas enthalten
    function parseCSVLine(line) {
      const timestampMatch = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
      if (!timestampMatch) {
        return line.split(',').map(s => s.trim());
      }

      const timestamp = timestampMatch[0];
      const timestampIndex = line.indexOf(timestamp);
      const before = line.substring(0, timestampIndex).trim();
      const after = line.substring(timestampIndex + timestamp.length).trim();

      const firstCommaIndex = before.indexOf(',');
      const caseId = before.substring(0, firstCommaIndex).trim();
      const activity = before.substring(firstCommaIndex + 1)
        .replace(/,$/, '')
        .trim();

      const resource = after.replace(/^,/, '').trim();

      return [caseId, activity, timestamp, resource];
    }

    const headerFields = header.split(',').map(f => f.trim());

    // Filtere nach mode
    let filteredLines;
    if (mode === 'live') {
      if (!lastTriggeredCaseId) {
        res.json({
          events: [],
          mode: 'live',
          lastTriggeredCaseId,
          message: 'Noch kein Prozess gestartet'
        });
        return;
      }
      // Filtere nur auf Events mit matching case_id
      filteredLines = dataLines.filter(line => {
        const caseId = line.split(',')[0].trim();
        return caseId === lastTriggeredCaseId;
      });
    } else {
      // history: letzte N PROZESSE (eindeutige case_ids), nicht letzte N Events —
      // sonst verdrängen viele kurze Prozesse (wenig Events) die älteren mit mehr Events.
      const caseIdOrder = [];
      const caseIdLines = new Map();
      dataLines.forEach(line => {
        const caseId = line.split(',')[0].trim();
        if (!caseIdLines.has(caseId)) {
          caseIdOrder.push(caseId);
          caseIdLines.set(caseId, []);
        }
        caseIdLines.get(caseId).push(line);
      });

      // Neueste Prozesse zuerst (Reihenfolge im Log = chronologisch), dann auf maxProcesses begrenzen
      const lastCaseIds = caseIdOrder.slice(-maxProcesses);
      filteredLines = lastCaseIds.flatMap(caseId => caseIdLines.get(caseId));
    }

    // Parse alle gefilterten Events
    const events = filteredLines.map(line => {
      const values = parseCSVLine(line);
      const event = {};
      headerFields.forEach((field, index) => {
        event[field] = values[index] || '';
      });
      return event;
    });

    res.json({
      events,
      mode,
      lastTriggeredCaseId,
      lastTriggeredAt
    });
  } catch (error) {
    console.error('[API] Fehler beim Lesen des Event-Logs:', error.message);
    res.status(500).json({ events: [], error: error.message });
  }
});

// POST /api/shutdown → Fahre System herunter (Flag-File-Pattern)
app.post('/api/shutdown', (req, res) => {
  try {
    console.log('[API] Shutdown angefordert — schreibe Flag-Datei...');

    const runtimeDir = path.join(projectRoot, '.runtime');
    if (!fs.existsSync(runtimeDir)) {
      fs.mkdirSync(runtimeDir, { recursive: true });
    }
    const flagPath = path.join(runtimeDir, 'shutdown-requested');
    fs.writeFileSync(flagPath, new Date().toISOString());
    console.log('[API] Flag-Datei geschrieben — Start-Server.ps1 übernimmt den Shutdown.');

    res.json({ success: true, message: 'Shutdown angefordert' });

    setTimeout(() => {
      console.log('[API] Frontend-Server wird beendet');
      process.exit(0);
    }, 500);

  } catch (error) {
    console.error('[API] Fehler beim Shutdown:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── START SERVER ───────────────────────────────────────────────────────

app.listen(PORT, config.server.host, () => {
  console.log(`\n✅ Frontend-Server läuft auf http://${config.server.host}:${PORT}`);
  console.log(`   Camunda Cluster: ${config.camunda.region}/${config.camunda.clusterId}`);
  console.log(`   Event-Log: ${eventLogPath}\n`);
});

// Graceful Shutdown bei Strg+C
process.on('SIGINT', () => {
  console.log('\n[Server] Shutdown via SIGINT');
  process.exit(0);
});
