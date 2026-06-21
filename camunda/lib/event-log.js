const fs = require('fs');
const path = require('path');

// Konsolidiertes Event-Log auf Projektebene (nicht pro Service wie bei den anderen
// event-logger.js-Varianten), da der Camunda-Worker den zentralen, lane-übergreifenden
// Prozessverlauf protokolliert.
const ARCHIVE_LOG = path.join(__dirname, '..', '..', 'event-log.csv');

function logEvent(caseId, activity, resource) {
  if (!fs.existsSync(ARCHIVE_LOG)) {
    fs.writeFileSync(ARCHIVE_LOG, 'case_id,activity,timestamp,resource\n');
  }
  fs.appendFileSync(ARCHIVE_LOG, `${caseId},${activity},${new Date().toISOString()},${resource}\n`);
}

module.exports = { logEvent };
