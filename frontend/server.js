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

// POST /api/trigger/standard → Starte Standard-Szenario
app.post('/api/trigger/standard', (req, res) => {
  try {
    console.log('[API] Triggere Standard-Szenario...');
    const result = execSync('npm run trigger:email:standard', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    console.log('[API] Standard-Szenario gestartet');
    res.json({ success: true, message: 'Standard-Szenario gestartet', output: result });
  } catch (error) {
    console.error('[API] Fehler beim Standard-Szenario:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/trigger/compliance → Starte Compliance-Szenario
app.post('/api/trigger/compliance', (req, res) => {
  try {
    console.log('[API] Triggere Compliance-Szenario...');
    const result = execSync('npm run trigger:email:compliance', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    console.log('[API] Compliance-Szenario gestartet');
    res.json({ success: true, message: 'Compliance-Szenario gestartet', output: result });
  } catch (error) {
    console.error('[API] Fehler beim Compliance-Szenario:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/event-log → Lese die letzten 15 Zeilen aus event-log.csv
app.get('/api/event-log', (req, res) => {
  try {
    if (!fs.existsSync(eventLogPath)) {
      res.json({ events: [] });
      return;
    }

    const content = fs.readFileSync(eventLogPath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);

    // Header + letzte 15 Daten-Zeilen
    const header = lines[0];
    const dataLines = lines.slice(1);
    const lastLines = dataLines.slice(-15);

    // CSV-Parser: activity kann Kommas enthalten
    // Nutze ISO 8601 Timestamp als Ankerpunkt (eindeutig erkennbar)
    // Format: case_id,activity,timestamp,resource
    // Timestamp: YYYY-MM-DDTHH:mm:ss.SSSZ
    function parseCSVLine(line) {
      // Finde ISO 8601 Timestamp (eindeutig)
      const timestampMatch = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
      if (!timestampMatch) {
        // Fallback: Normales split
        return line.split(',').map(s => s.trim());
      }

      const timestamp = timestampMatch[0];
      const timestampIndex = line.indexOf(timestamp);

      // Teile: alles vor timestamp, timestamp, alles nach timestamp
      const before = line.substring(0, timestampIndex).trim();
      const after = line.substring(timestampIndex + timestamp.length).trim();

      // before: "case_id,activity," (activity kann Kommas haben, before endet mit Komma)
      // Komma zwischen case_id und activity ist das ERSTE Komma
      const firstCommaIndex = before.indexOf(',');
      const caseId = before.substring(0, firstCommaIndex).trim();
      const activity = before.substring(firstCommaIndex + 1)
        .replace(/,$/, '')  // Entferne trailing Komma
        .trim();

      // after: ",resource"
      const resource = after.replace(/^,/, '').trim();

      return [caseId, activity, timestamp, resource];
    }

    const headerFields = header.split(',').map(f => f.trim());
    const events = lastLines.map(line => {
      const values = parseCSVLine(line);
      const event = {};
      headerFields.forEach((field, index) => {
        event[field] = values[index] || '';
      });
      return event;
    });

    res.json({ events });
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
