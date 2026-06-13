const express = require('express');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const config = require('./config.json');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = config.server.port;
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
    port: config.server.port,
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
app.post('/api/trigger/standard', (req, res) => {
  try {
    // Generiere case_id für diesen Trigger
    const caseId = 'INV-' + Date.now();
    lastTriggeredCaseId = caseId;
    lastTriggeredAt = new Date().toISOString();

    console.log('[API] Triggere Standard-Szenario...');
    logEvent(caseId, 'Trigger Standard', 'frontend');

    const result = execSync('npm run trigger:email:standard', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    console.log('[API] Standard-Szenario gestartet');
    res.json({
      success: true,
      message: 'Standard-Szenario gestartet',
      caseId,
      output: result
    });
  } catch (error) {
    console.error('[API] Fehler beim Standard-Szenario:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/trigger/compliance → Starte Compliance-Szenario
app.post('/api/trigger/compliance', (req, res) => {
  try {
    // Generiere case_id für diesen Trigger
    const caseId = 'INV-' + Date.now();
    lastTriggeredCaseId = caseId;
    lastTriggeredAt = new Date().toISOString();

    console.log('[API] Triggere Compliance-Szenario...');
    logEvent(caseId, 'Trigger Compliance', 'frontend');

    const result = execSync('npm run trigger:email:compliance', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    console.log('[API] Compliance-Szenario gestartet');
    res.json({
      success: true,
      message: 'Compliance-Szenario gestartet',
      caseId,
      output: result
    });
  } catch (error) {
    console.error('[API] Fehler beim Compliance-Szenario:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/event-log → Event-Log mit mode Parameter
// ?mode=live   → nur Events der aktuellen case_id
// ?mode=history → letzte 15-20 Events (default)
app.get('/api/event-log', (req, res) => {
  try {
    const mode = req.query.mode || 'history';

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
    let filteredLines = dataLines;
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
      // history: letzte 15-20 Events
      filteredLines = dataLines.slice(-20);
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

// POST /api/shutdown → Fahre System herunter
app.post('/api/shutdown', async (req, res) => {
  try {
    console.log('[API] Shutdown initiiert...');

    // 1. Versuche Browser-Fenster zu schließen (falls PID vorhanden)
    if (fs.existsSync(pidFilePath)) {
      try {
        const pidContent = fs.readFileSync(pidFilePath, 'utf-8').trim();
        const pid = parseInt(pidContent);
        if (pid > 0) {
          console.log(`[API] Versuche Browser-Prozess zu beenden (PID: ${pid})...`);
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
          fs.unlinkSync(pidFilePath);
          console.log('[API] Browser-Prozess beendet');
        }
      } catch (err) {
        console.warn('[API] Browser-Prozess konnte nicht beendet werden:', err.message);
      }
    }

    // 2. Rufe Stop-Server.ps1 auf (auf Windows über PowerShell)
    console.log('[API] Starte Stop-Server.ps1...');
    try {
      exec('powershell -ExecutionPolicy Bypass -File .\\Stop-Server.ps1', {
        cwd: projectRoot,
        stdio: 'ignore'
      });
      console.log('[API] Stop-Server.ps1 gestartet');
    } catch (err) {
      console.warn('[API] Stop-Server.ps1 konnte nicht aufgerufen werden:', err.message);
    }

    // 3. Sende OK-Response (der Browser wird kurz danach geschlossen)
    res.json({ success: true, message: 'System wird heruntergefahren...' });

    // 4. Beende diesen Prozess nach kurzer Verzögerung
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
