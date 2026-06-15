// ── THEME MANAGEMENT ──────────────────────────────────────────────
function initTheme() {
  // Lade gespeichertes Theme oder Standard
  const savedTheme = localStorage.getItem('theme') || 'light';
  setTheme(savedTheme);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);

  // Update Toggle-Button Icon
  const toggleBtn = document.getElementById('theme-toggle-btn');
  if (toggleBtn) {
    toggleBtn.textContent = theme === 'light' ? '🌙' : '☀️';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = current === 'light' ? 'dark' : 'light';
  setTheme(newTheme);
}

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
const triggerManualBtn = document.getElementById('trigger-manual');
const openTasklistBtn = document.getElementById('open-tasklist');
const openOperateBtn = document.getElementById('open-operate');
const shutdownBtn = document.getElementById('shutdown-btn');
const triggerStatus = document.getElementById('trigger-status');
const eventLog = document.getElementById('event-log');
const toastContainer = document.getElementById('toast-container');
const modeToggle = document.querySelectorAll('.mode-btn');
const liveCaseIndicator = document.getElementById('live-case-indicator');
const liveCaseId = document.getElementById('live-case-id');

// ── STATE ──────────────────────────────────────────────────────────────
let currentMode = 'live';

// ── PROZESS-HISTORY (localStorage) ────────────────────────────────────
const HISTORY_KEY = 'invoicing_process_history';

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveToHistory(entry) {
  const history = loadHistory();
  history.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 5)));
  renderHistory();
}

function renderHistory() {
  const container = document.getElementById('process-history');
  if (!container) return;
  const history = loadHistory();
  if (history.length === 0) {
    container.innerHTML = '<p class="history-empty">Noch keine Prozesse gestartet.</p>';
    return;
  }
  container.innerHTML = history.map(h => `
    <div class="history-item">
      <span class="history-scenario">${h.scenario}</span>
      <span class="history-case">${h.caseId}</span>
      <span class="history-time">${new Date(h.startedAt).toLocaleTimeString('de-DE')}</span>
    </div>
  `).join('');
}

// ── EVENT LISTENER (werden in DOMContentLoaded registriert) ───────

// ── FUNKTIONEN ─────────────────────────────────────────────────────

/**
 * Trigger ein Testszenario (standard, compliance oder manual)
 */
async function triggerScenario(scenario) {
  const endpoint = `/api/trigger/${scenario}`;
  const displayNames = {
    standard: 'Standard-Rechnung',
    compliance: 'Compliance-Fall',
    manual: 'Manuelle Korrektur'
  };
  const displayName = displayNames[scenario] || scenario;

  // UI: Zeige Lade-Status + Spinner auf dem angeklickten Button
  showStatus(`Starte ${displayName}...`, 'loading');
  triggerStandardBtn.disabled = true;
  triggerComplianceBtn.disabled = true;
  triggerManualBtn.disabled = true;

  const buttonMap = {
    standard: triggerStandardBtn,
    compliance: triggerComplianceBtn,
    manual: triggerManualBtn
  };
  const activeBtn = buttonMap[scenario];
  const originalIcon = activeBtn.querySelector('.btn-icon').textContent;
  activeBtn.querySelector('.btn-icon').innerHTML = '<span class="spinner"></span>';

  try {
    const response = await fetch(endpoint, { method: 'POST' });
    const data = await response.json();

    if (data.success) {
      // Überschreibe lokal generierte Case-ID mit der vom Backend bestätigten
      lastTriggeredCaseId = data.caseId;

      // Wechsle automatisch zu Live-Modus
      switchMode('live');

      showStatus(`✅ ${displayName} gestartet!`, 'success', 3000);
      showToast(`${displayName} wurde erfolgreich gestartet.`, 'success');
      saveToHistory({ scenario: displayName, caseId: data.caseId, startedAt: new Date().toISOString() });
      console.log(`[${scenario}] Output:`, data.output);
      console.log(`[${scenario}] Case ID:`, data.caseId);

      // Öffne Operate-Detailseite dieser Prozessinstanz
      if (data.processInstanceKey) {
        const operateUrl = `${config.camunda.urls.operate}/processes/${data.processInstanceKey}`;
        window.open(operateUrl, '_blank');
        console.log(`[${scenario}] Operate URL:`, operateUrl);
      }
    } else {
      showStatus(`❌ Fehler: ${data.error}`, 'error');
      showToast(`Fehler: ${data.error}`, 'error');
    }
  } catch (error) {
    const isNetworkError = error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed');
    const userMessage = isNetworkError
      ? '❌ Server nicht erreichbar — ist das System gestartet? (Start-Server.ps1)'
      : `❌ Fehler: ${error.message}`;
    showStatus(userMessage, 'error');
    showToast(userMessage.replace('❌ ', ''), 'error');
  } finally {
    triggerStandardBtn.disabled = false;
    triggerComplianceBtn.disabled = false;
    triggerManualBtn.disabled = false;
    activeBtn.querySelector('.btn-icon').textContent = originalIcon;
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
  const confirmed = confirm('Wirklich das System herunterfahren? Das Fenster wird geschlossen.');
  if (!confirmed) return;

  shutdownBtn.disabled = true;
  showToast('System wird heruntergefahren...', 'success');

  try {
    const response = await fetch('/api/shutdown', { method: 'POST' });
    const data = await response.json();

    if (data.success) {
      console.log('[Shutdown] Server antwortet mit:', data);
      showToast('Fenster wird geschlossen...', 'success');
      // Fenster wird von Stop-Server.ps1 geschlossen (mit Profil-Verifikation)
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
 * Wechsle Mode (live/history)
 */
function switchMode(mode) {
  currentMode = mode;

  // Update Button States
  modeToggle.forEach(btn => {
    if (btn.dataset.mode === mode) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update case_id indicator Sichtbarkeit
  liveCaseIndicator.style.display = mode === 'live' ? 'block' : 'none';

  // Refresh sofort mit neuem Mode
  refreshEventLog();
}

/**
 * Lade und zeige Event-Log
 */
async function refreshEventLog() {
  try {
    const isAtBottom = eventLog.scrollHeight - eventLog.scrollTop - eventLog.clientHeight < 50;

    const response = await fetch(`/api/process-activity?mode=${currentMode}`);
    const data = await response.json();

    // Update case_id indicator
    if (data.lastTriggeredCaseId && currentMode === 'live') {
      liveCaseId.textContent = data.lastTriggeredCaseId;
    }

    if (!data.events || data.events.length === 0) {
      if (data.message) {
        eventLog.innerHTML = `<div class="event-placeholder">${data.message}</div>`;
      } else {
        eventLog.innerHTML = '<div class="event-placeholder">Warte auf Ereignisse...</div>';
      }
      return;
    }

    eventLog.innerHTML = '';
    data.events.forEach(event => {
      const eventItem = document.createElement('div');
      eventItem.className = 'event-item';

      const time = event.timestamp ? new Date(event.timestamp).toLocaleTimeString('de-DE') : '-';
      const activity = event.activity || '-';
      const resource = event.resource ? `[${event.resource}]` : '';

      // In Historie-Modus: zeige case_id als Badge
      let caseIdBadge = '';
      if (currentMode === 'history' && event.case_id) {
        caseIdBadge = `<span class="event-case-id">${event.case_id}</span>`;
      }

      eventItem.innerHTML = `
        <span class="event-time">${time}</span>
        <span class="event-activity">${activity} ${resource}</span>
        ${caseIdBadge}
      `;

      eventLog.appendChild(eventItem);
    });

    if (isAtBottom) {
      eventLog.scrollTop = eventLog.scrollHeight;
    }
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

  // Initialisiere Theme (vor anderen Elementen)
  initTheme();

  // Registriere Event-Listener (MUSS nach DOM vollständig geladen sein)
  triggerStandardBtn.addEventListener('click', () => triggerScenario('standard'));
  triggerComplianceBtn.addEventListener('click', () => triggerScenario('compliance'));
  triggerManualBtn.addEventListener('click', () => triggerScenario('manual'));
  openTasklistBtn.addEventListener('click', () => openURL(config.camunda.urls.tasklist));
  openOperateBtn.addEventListener('click', () => openURL(config.camunda.urls.operate));
  shutdownBtn.addEventListener('click', handleShutdown);

  // Theme Toggle Listener
  document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);

  // Mode Toggle Listener
  modeToggle.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      switchMode(mode);
    });
  });

  await loadConfig();
  console.log('[App] Konfiguration geladen:', config);
  refreshEventLog();
  renderHistory();
  console.log('[App] Ready!');
});
