// ── KONFIGURATION LADEN ───────────────────────────────────────────
let config = {
  camunda: {
    urls: {
      tasklist: 'https://bru-2.tasklist.camunda.io/487e2664-45fe-4a21-9e53-860eddc37e5e',
      operate: 'https://bru-2.operate.camunda.io/487e2664-45fe-4a21-9e53-860eddc37e5e'
    }
  }
};

// Versuche Server-Config zu laden
async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    const serverConfig = await response.json();
    config = serverConfig;
  } catch (error) {
    console.warn('Server-Config konnte nicht geladen werden, nutze Fallback:', error);
  }
}

// ── ELEMENT-REFERENZEN ─────────────────────────────────────────────
const triggerStandardBtn = document.getElementById('trigger-standard');
const triggerComplianceBtn = document.getElementById('trigger-compliance');
const openTasklistBtn = document.getElementById('open-tasklist');
const openOperateBtn = document.getElementById('open-operate');
const shutdownBtn = document.getElementById('shutdown-btn');
const triggerStatus = document.getElementById('trigger-status');
const eventLog = document.getElementById('event-log');
const toastContainer = document.getElementById('toast-container');

// ── EVENT LISTENER (werden in DOMContentLoaded registriert) ───────

// ── FUNKTIONEN ─────────────────────────────────────────────────────

/**
 * Trigger ein Testszenario (standard oder compliance)
 */
async function triggerScenario(scenario) {
  const endpoint = `/api/trigger/${scenario}`;
  const displayName = scenario === 'standard' ? 'Standard-Rechnung' : 'Compliance-Fall';

  // UI: Zeige Lade-Status
  showStatus(`Starte ${displayName}...`, 'loading');
  triggerStandardBtn.disabled = true;
  triggerComplianceBtn.disabled = true;

  try {
    const response = await fetch(endpoint, { method: 'POST' });
    const data = await response.json();

    if (data.success) {
      showStatus(`✅ ${displayName} gestartet!`, 'success', 3000);
      showToast(`${displayName} wurde erfolgreich gestartet.`, 'success');
      console.log(`[${scenario}] Output:`, data.output);
    } else {
      showStatus(`❌ Fehler: ${data.error}`, 'error');
      showToast(`Fehler: ${data.error}`, 'error');
    }
  } catch (error) {
    showStatus(`❌ Netzwerkfehler: ${error.message}`, 'error');
    showToast(`Netzwerkfehler: ${error.message}`, 'error');
  } finally {
    triggerStandardBtn.disabled = false;
    triggerComplianceBtn.disabled = false;
  }
}

/**
 * Öffne URL in neuem Tab
 */
function openURL(url) {
  window.open(url, '_blank');
}

/**
 * Handle Shutdown (mit Bestätigung)
 */
async function handleShutdown() {
  const confirmed = confirm('Wirklich das System herunterfahren? Browser und Services werden beendet.');
  if (!confirmed) return;

  shutdownBtn.disabled = true;
  showToast('System wird heruntergefahren...', 'success');

  try {
    const response = await fetch('/api/shutdown', { method: 'POST' });
    const data = await response.json();

    if (data.success) {
      console.log('[Shutdown] Server antwortet mit:', data);
      // Browser wird automatisch nach kurzer Zeit geschlossen
      // Falls nicht: zeige Meldung
      setTimeout(() => {
        alert('Server wurde beendet. Browser-Fenster wird geschlossen.');
        window.close();
      }, 2000);
    }
  } catch (error) {
    console.error('[Shutdown] Fehler:', error);
    showToast(`Fehler beim Herunterfahren: ${error.message}`, 'error');
    shutdownBtn.disabled = false;
  }
}

/**
 * Zeige Status-Nachricht
 */
function showStatus(message, type = 'loading', timeout = null) {
  triggerStatus.textContent = message;
  triggerStatus.className = `status-message show ${type}`;

  if (timeout) {
    setTimeout(() => {
      triggerStatus.classList.remove('show');
    }, timeout);
  }
}

/**
 * Zeige Toast-Benachrichtigung
 */
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  toastContainer.appendChild(toast);

  // Auto-Remove nach 5 Sekunden
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

/**
 * Lade und zeige Event-Log
 */
async function refreshEventLog() {
  try {
    const response = await fetch('/api/event-log');
    const data = await response.json();

    if (!data.events || data.events.length === 0) {
      eventLog.innerHTML = '<div class="event-placeholder">Warte auf Ereignisse...</div>';
      return;
    }

    eventLog.innerHTML = '';
    data.events.forEach(event => {
      const eventItem = document.createElement('div');
      eventItem.className = 'event-item';

      const time = event.timestamp ? new Date(event.timestamp).toLocaleTimeString('de-DE') : '-';
      const activity = event.activity || '-';
      const resource = event.resource ? `[${event.resource}]` : '';

      eventItem.innerHTML = `
        <span class="event-time">${time}</span>
        <span class="event-activity">${activity} ${resource}</span>
      `;

      eventLog.appendChild(eventItem);
    });

    // Scrolle nach unten (neueste Ereignisse unten)
    eventLog.scrollTop = eventLog.scrollHeight;
  } catch (error) {
    console.error('[Event-Log] Fehler:', error);
  }
}

// ── POLLING FÜR EVENT-LOG ──────────────────────────────────────────
// Aktualisiere alle 2 Sekunden
setInterval(refreshEventLog, 2000);

// ── INITIALIZATION ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[App] Starte Initialisierung...');

  // Registriere Event-Listener (MUSS nach DOM vollständig geladen sein)
  triggerStandardBtn.addEventListener('click', () => triggerScenario('standard'));
  triggerComplianceBtn.addEventListener('click', () => triggerScenario('compliance'));
  openTasklistBtn.addEventListener('click', () => openURL(config.camunda.urls.tasklist));
  openOperateBtn.addEventListener('click', () => openURL(config.camunda.urls.operate));
  shutdownBtn.addEventListener('click', handleShutdown);

  await loadConfig();
  console.log('[App] Konfiguration geladen:', config);
  refreshEventLog();
  console.log('[App] Ready!');
});
