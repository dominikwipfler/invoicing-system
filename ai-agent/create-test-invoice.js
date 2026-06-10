const { chromium } = require('playwright');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, 'test-invoice.pdf');

const INVOICE_HTML = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #333; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .supplier-info { line-height: 1.6; }
    .supplier-name { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
    .invoice-title { font-size: 32px; font-weight: bold; color: #2c5aa0; text-align: right; }
    .invoice-meta { background: #f8f8f8; border-left: 4px solid #2c5aa0; padding: 16px 20px; margin-bottom: 30px; }
    .invoice-meta table { width: 400px; }
    .invoice-meta td { padding: 4px 8px; }
    .invoice-meta td:first-child { font-weight: bold; width: 180px; }
    .recipient { margin-bottom: 30px; }
    .recipient strong { display: block; margin-bottom: 4px; }
    table.items { width: 100%; border-collapse: collapse; margin: 20px 0; }
    table.items th { background: #2c5aa0; color: white; padding: 10px 12px; text-align: left; }
    table.items th:last-child, table.items td:last-child { text-align: right; }
    table.items td { padding: 10px 12px; border-bottom: 1px solid #e0e0e0; }
    table.items tr:nth-child(even) td { background: #f9f9f9; }
    .totals { width: 300px; margin-left: auto; margin-top: 10px; }
    .totals table { width: 100%; border-collapse: collapse; }
    .totals td { padding: 6px 10px; }
    .totals td:last-child { text-align: right; }
    .totals .total-row { background: #2c5aa0; color: white; font-weight: bold; font-size: 14px; }
    .totals .total-row td { padding: 10px; }
    .bank-info { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; }
    .footer { margin-top: 20px; font-size: 11px; color: #888; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div class="supplier-info">
      <div class="supplier-name">TechSolutions GmbH</div>
      Innovationsstraße 17<br>
      76131 Karlsruhe<br>
      Tel: +49 721 98765-0<br>
      E-Mail: buchhaltung@techsolutions.de<br>
      USt-IdNr.: DE287654321
    </div>
    <div class="invoice-title">RECHNUNG</div>
  </div>

  <div class="invoice-meta">
    <table>
      <tr><td>Rechnungsnummer:</td><td><strong>RE-2026-0748</strong></td></tr>
      <tr><td>Rechnungsdatum:</td><td>07.06.2026</td></tr>
      <tr><td>Leistungszeitraum:</td><td>01.05.2026 – 31.05.2026</td></tr>
      <tr><td>Fälligkeitsdatum:</td><td>07.07.2026 (30 Tage netto)</td></tr>
      <tr><td>Auftragsnummer:</td><td>AUF-2026-112</td></tr>
    </table>
  </div>

  <div class="recipient">
    <strong>Rechnungsempfänger:</strong>
    Beispiel Handels AG<br>
    z.Hd. Buchhaltung<br>
    Hauptstraße 100<br>
    76133 Karlsruhe
  </div>

  <table class="items">
    <thead>
      <tr>
        <th style="width:40px">Pos.</th>
        <th>Leistungsbeschreibung</th>
        <th style="width:60px">Menge</th>
        <th style="width:60px">Einheit</th>
        <th style="width:110px">Einzelpreis (€)</th>
        <th style="width:110px">Gesamtpreis (€)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>Softwareentwicklung – Backend-API Sprint Mai</td>
        <td>80</td>
        <td>Std.</td>
        <td style="text-align:right">125,00</td>
        <td>10.000,00</td>
      </tr>
      <tr>
        <td>2</td>
        <td>Konzeption und technische Dokumentation</td>
        <td>16</td>
        <td>Std.</td>
        <td style="text-align:right">110,00</td>
        <td>1.760,00</td>
      </tr>
      <tr>
        <td>3</td>
        <td>Cloud-Infrastruktur (AWS) Mai 2026</td>
        <td>1</td>
        <td>Monat</td>
        <td style="text-align:right">890,00</td>
        <td>890,00</td>
      </tr>
      <tr>
        <td>4</td>
        <td>Lizenzgebühren Entwicklungstools (quartalsweise)</td>
        <td>1</td>
        <td>Pauschal</td>
        <td style="text-align:right">350,00</td>
        <td>350,00</td>
      </tr>
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr><td>Nettobetrag:</td><td>13.000,00 €</td></tr>
      <tr><td>Mehrwertsteuer 19%:</td><td>2.470,00 €</td></tr>
      <tr class="total-row"><td>Gesamtbetrag:</td><td>15.470,00 €</td></tr>
    </table>
  </div>

  <div class="bank-info">
    <strong>Bankverbindung:</strong><br>
    Kontoinhaber: TechSolutions GmbH<br>
    Kreditinstitut: Volksbank Karlsruhe eG<br>
    IBAN: DE44 6619 0000 0012 3456 78 &nbsp;|&nbsp; BIC: VBKADE61XXX<br>
    Verwendungszweck: RE-2026-0748 / AUF-2026-112
  </div>

  <div class="footer">
    TechSolutions GmbH · Innovationsstraße 17 · 76131 Karlsruhe ·
    Geschäftsführer: Dr. Martina Schreiber · Amtsgericht Karlsruhe HRB 54321
  </div>
</body>
</html>`;

async function createTestInvoice() {
  console.log('Erstelle Test-Rechnung als PDF...');
  const browser = await chromium.launch();
  const page    = await browser.newPage();

  await page.setContent(INVOICE_HTML, { waitUntil: 'networkidle' });
  await page.pdf({
    path:            OUTPUT_PATH,
    format:          'A4',
    printBackground: true,
    margin:          { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
  });

  await browser.close();
  console.log(`Test-Rechnung gespeichert: ${OUTPUT_PATH}`);
  console.log('Rechnungsdaten:');
  console.log('  Lieferant:        TechSolutions GmbH');
  console.log('  Rechnungsnummer:  RE-2026-0748');
  console.log('  Betrag (brutto):  15.470,00 EUR');
  console.log('  Datum:            2026-06-07');
}

createTestInvoice().catch(err => {
  console.error('Fehler beim Erstellen der Test-Rechnung:', err.message);
  process.exit(1);
});
