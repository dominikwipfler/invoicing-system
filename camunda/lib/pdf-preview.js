const fs = require('fs');
const { createCanvas } = require('canvas');

// Rendert die erste PDF-Seite als JPEG (Base64 Data-URI) für die "Image view"-Komponente
// im Tasklist-Formular (camunda/forms/ki-pruefung.form, Feld "source": "=pdfImageDataUri").
//
// Wichtig: Chromium (auch via Playwright) lässt sich dafür NICHT nutzen — die von Playwright
// gebündelte Chromium-Version enthält keinen PDF-Viewer-Plugin. Direktes page.goto() auf eine
// PDF löst stattdessen einen Download aus ("Download is starting"), und ein <embed>/<iframe>
// zeigt nur "Couldn't load plugin." Stattdessen rendert pdfjs-dist (PDF.js) die Seite rein in
// Node.js auf ein Canvas — ganz ohne Browser.
async function renderPdfPreviewImage(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    console.warn(`[renderPdfPreviewImage] PDF nicht gefunden: ${filePath}`);
    return null;
  }
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(fs.readFileSync(filePath));
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(viewport.width, viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    // JPEG statt PNG: Zeebe-Prozessvariablen sollten klein bleiben (Camunda rät von großen
    // Payloads ab) — JPEG mit reduzierter Qualität reicht für eine lesbare Vorschau locker aus.
    const buffer = canvas.toBuffer('image/jpeg', { quality: 0.7 });
    const dataUri = `data:image/jpeg;base64,${buffer.toString('base64')}`;
    console.log(`[renderPdfPreviewImage] PDF-Vorschau gerendert: ${(buffer.length / 1024).toFixed(0)} KB (${dataUri.length} Zeichen Data-URI)`);
    return dataUri;
  } catch (err) {
    console.warn(`[renderPdfPreviewImage] Konnte PDF-Vorschau nicht rendern: ${err.message}`);
    return null;
  }
}

module.exports = { renderPdfPreviewImage };
