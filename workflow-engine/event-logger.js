const fs = require('node:fs');
const path = require('node:path');

const LOG_FILE = path.join(__dirname, 'event-log.csv');

if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(LOG_FILE, 'case_id,activity,timestamp,resource\n');
}

function logEvent(caseId, activity, resource) {
  const timestamp = new Date().toISOString();
  const line = `${caseId},${activity},${timestamp},${resource}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

module.exports = { logEvent };
