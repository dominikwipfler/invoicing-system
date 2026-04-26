/**
 * analyze-events.js
 *
 * Analysiert Event-Logs für Process Mining und Bottleneck-Identifikation
 * - Konsolidiert Logs aus allen Services
 * - Identifiziert Prozess-Varianten
 * - Berechnet durchschnittliche Zeiten und mögliche Bottlenecks
 */

const fs = require('node:fs');
const path = require('node:path');

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const header = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    return header.reduce((obj, key, index) => {
      obj[key] = values[index];
      return obj;
    }, {});
  });
}

function consolidateLogs() {
  const logFiles = [
    path.join(__dirname, 'event-log.csv'),
    path.join(__dirname, 'grpc-service', 'event-log.csv'),
    path.join(__dirname, 'payment-system', 'event-log.csv'),
    path.join(__dirname, 'workflow-engine', 'event-log.csv')
  ];

  let allEvents = [];

  logFiles.forEach(file => {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.trim()) {
        const events = parseCSV(content);
        allEvents = allEvents.concat(events);
      }
    }
  });

  // Sortiere nach Timestamp
  allEvents.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  return allEvents;
}

function identifyVariants(events) {
  const variants = {};

  // Gruppiere Events nach case_id
  const cases = {};
  events.forEach(event => {
    if (!cases[event.case_id]) cases[event.case_id] = [];
    cases[event.case_id].push(event);
  });

  // Erstelle Varianten basierend auf Activity-Sequenzen
  Object.values(cases).forEach(caseEvents => {
    const activities = caseEvents.map(e => e.activity).join(' → ');
    if (!variants[activities]) variants[activities] = [];
    variants[activities].push(caseEvents[0].case_id);
  });

  return variants;
}

function calculateBottlenecks(events) {
  const bottlenecks = {};

  // Gruppiere Events nach case_id
  const cases = {};
  events.forEach(event => {
    if (!cases[event.case_id]) cases[event.case_id] = [];
    cases[event.case_id].push(event);
  });

  // Berechne Zeiten zwischen Aktivitäten
  Object.values(cases).forEach(caseEvents => {
    caseEvents.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    for (let i = 1; i < caseEvents.length; i++) {
      const prev = caseEvents[i-1];
      const curr = caseEvents[i];
      const duration = new Date(curr.timestamp) - new Date(prev.timestamp);
      const key = `${prev.activity} → ${curr.activity}`;

      if (!bottlenecks[key]) {
        bottlenecks[key] = { total: 0, count: 0, max: 0, min: Infinity };
      }

      bottlenecks[key].total += duration;
      bottlenecks[key].count++;
      bottlenecks[key].max = Math.max(bottlenecks[key].max, duration);
      bottlenecks[key].min = Math.min(bottlenecks[key].min, duration);
    }
  });

  // Berechne Durchschnitte
  Object.keys(bottlenecks).forEach(key => {
    bottlenecks[key].avg = bottlenecks[key].total / bottlenecks[key].count;
  });

  return bottlenecks;
}

function main() {
  console.log('🔍 Analysiere Event-Logs...\n');

  const events = consolidateLogs();
  console.log(`📊 ${events.length} Events gefunden\n`);

  // Prozess-Varianten identifizieren
  const variants = identifyVariants(events);
  console.log('📈 Prozess-Varianten:');
  Object.entries(variants).forEach(([variant, cases]) => {
    console.log(`   ${variant}: ${cases.length} Fälle`);
  });

  console.log('\n');

  // Bottlenecks berechnen
  const bottlenecks = calculateBottlenecks(events);
  console.log('⏱️  Mögliche Bottlenecks (Durchschnittszeiten in ms):');
  Object.entries(bottlenecks)
    .sort(([,a], [,b]) => b.avg - a.avg)
    .forEach(([transition, stats]) => {
      console.log(`   ${transition}:`);
      console.log(`      Ø ${Math.round(stats.avg)}ms (Min: ${stats.min}ms, Max: ${stats.max}ms, Anzahl: ${stats.count})`);
    });

  // Exportiere konsolidierten Log für Celonis
  const consolidatedCSV = 'case_id,activity,timestamp,resource\n' +
    events.map(e => `${e.case_id},${e.activity},${e.timestamp},${e.resource}`).join('\n');

  fs.writeFileSync(path.join(__dirname, 'consolidated-event-log.csv'), consolidatedCSV);
  console.log('\n💾 Konsolidierter Event-Log gespeichert: consolidated-event-log.csv');
  console.log('   Diesen kannst du direkt in Celonis importieren!');
}

if (require.main === module) {
  main();
}

module.exports = { consolidateLogs, identifyVariants, calculateBottlenecks };