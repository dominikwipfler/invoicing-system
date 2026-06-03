const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const ERP_URL        = process.env.ERP_URL || 'https://anhe0003.github.io/this-and-that/ERP_Rechnungserfassung.html';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
// RPA_HEADLESS=false → sichtbarer Browser (gut für Demo / Präsentation)
const HEADLESS       = process.env.RPA_HEADLESS !== 'false';

function normalizeDate(raw) {
  if (!raw) return '';
  return String(raw).substring(0, 10); // YYYY-MM-DD
}

/**
 * Füllt das ERP-Formular automatisch aus.
 * Gibt { erpReferenzNummer, screenshotPath } zurück.
 */
async function fillErpForm({ invoiceId, supplierName, invoiceNumber, amountEuro, invoiceDate }) {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo:   HEADLESS ? 0 : 80, // sichtbare Verlangsamung im Demo-Modus
  });

  const context = await browser.newContext({
    // Video nur im Demo-Modus aufnehmen
    ...(HEADLESS ? {} : { recordVideo: { dir: SCREENSHOTS_DIR, size: { width: 1280, height: 800 } } }),
  });

  const page = await context.newPage();

  console.log(`[rpa-bot] Öffne ERP: ${ERP_URL}`);
  await page.goto(ERP_URL);
  await page.waitForLoadState('domcontentloaded');

  // Neue Rechnung anlegen (leeres Formular)
  await page.click('button:has-text("+ Neue Rechnung")');
  await page.waitForTimeout(300);

  // ── Kopfdaten befüllen ────────────────────────────────────────────────────
  await page.fill('#invoiceNumber', invoiceNumber || String(invoiceId));
  await page.fill('#invoiceDate',   normalizeDate(invoiceDate));
  await page.fill('#customerName',  supplierName || '');
  await page.fill('#customerNumber', String(invoiceId));
  await page.fill('#paymentTerms',  '30 Tage netto');
  await page.fill('#invoiceNotes',  `Automatisch erfasst durch RPA – ${new Date().toISOString()}`);

  // ── Rechnungsposition hinzufügen ──────────────────────────────────────────
  await page.click('button:has-text("+ Position hinzufügen")');
  await page.waitForTimeout(300);

  const lastRow = page.locator('#itemsBody tr:last-child');
  await lastRow.locator('.desc').fill(`${invoiceNumber || invoiceId} – ${supplierName || 'Lieferant'}`);
  await lastRow.locator('.qty').fill('1');
  await lastRow.locator('.unit').fill('Stk.');
  // Betrag als Nettobetrag eintragen, 19% MwSt.
  const nettoPrice = (parseFloat(amountEuro) / 1.19).toFixed(2);
  await lastRow.locator('.price').fill(nettoPrice);
  await lastRow.locator('.vat').selectOption('19');
  await page.waitForTimeout(400);

  // ── Screenshot vor dem Speichern ─────────────────────────────────────────
  const prefix = `erp-${String(invoiceId).replace(/[^a-zA-Z0-9-]/g, '')}-${Date.now()}`;
  const screenshotBefore = path.join(SCREENSHOTS_DIR, `${prefix}-filled.png`);
  await page.screenshot({ path: screenshotBefore, fullPage: true });
  console.log(`[rpa-bot] Screenshot: ${screenshotBefore}`);

  // ── Speichern ─────────────────────────────────────────────────────────────
  await page.click('button:has-text("Rechnung speichern / aktualisieren")');
  await page.waitForTimeout(600);

  // ── Screenshot nach dem Speichern ────────────────────────────────────────
  const screenshotAfter = path.join(SCREENSHOTS_DIR, `${prefix}-saved.png`);
  await page.screenshot({ path: screenshotAfter, fullPage: true });
  console.log(`[rpa-bot] Screenshot gespeichert: ${screenshotAfter}`);

  // ── ERP-interne ID aus localStorage lesen ─────────────────────────────────
  const erpId = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('mini_erp_invoices');
      if (!raw) return null;
      const list = JSON.parse(raw);
      return list.length > 0 ? list[list.length - 1].id : null;
    } catch {
      return null;
    }
  });

  await context.close();
  await browser.close();

  const erpReferenzNummer = erpId || `ERP-${invoiceId}`;
  console.log(`[rpa-bot] ERP-Referenznummer: ${erpReferenzNummer}`);

  return { erpReferenzNummer, screenshotPath: screenshotAfter };
}

module.exports = { fillErpForm };

// ── Direkter Testlauf: node sprint5/rpa-erp-bot.js ───────────────────────────
if (require.main === module) {
  fillErpForm({
    invoiceId:     process.env.INV_ID   || 'INV-TEST-001',
    supplierName:  process.env.SUPPLIER  || 'Muster GmbH',
    invoiceNumber: process.env.INV_NUM   || 'RG-2026-001',
    amountEuro:    parseFloat(process.env.AMOUNT || '119.00'),
    invoiceDate:   process.env.INV_DATE  || new Date().toISOString().substring(0, 10),
  }).then(result => {
    console.log('Fertig:', result);
  }).catch(err => {
    console.error('Fehler:', err.message);
    process.exit(1);
  });
}