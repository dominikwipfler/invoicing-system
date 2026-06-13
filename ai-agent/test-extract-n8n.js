require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { extractInvoiceDataViaN8n } = require('./invoice-extractor-n8n');
const path = require('path');

const pdfPath = process.argv[2] || path.join(__dirname, 'test-invoice.pdf');
const invoiceId = `INV-${Date.now()}`;

console.log('Teste n8n KI-Extraktion...');
console.log(`PDF-Pfad: ${pdfPath}`);
console.log(`Invoice ID: ${invoiceId}`);
console.log(`Webhook URL: ${process.env.N8N_WEBHOOK_URL || '(nicht gesetzt)'}`);
console.log('');

extractInvoiceDataViaN8n(pdfPath, invoiceId)
  .then(result => {
    console.log('✅ n8n Extraktion erfolgreich:');
    console.log(JSON.stringify(result, null, 2));

    if (result.error) {
      console.log(`\n⚠️ Fehler während Extraktion: ${result.error}`);
    } else {
      const confidence = (result.aiConfidence * 100).toFixed(0);
      console.log(`\nKonfidenz: ${confidence}%`);
      console.log(`Manuelle Prüfung nötig: ${result.requiresHumanReview}`);
    }
  })
  .catch(err => {
    console.error('❌ Fehler:', err.message);
    process.exit(1);
  });
