import { describe, expect, it } from 'vitest';
import { LocalOCREngine } from '../../src/server/services/ocr/ocrEngine.js';

describe('LocalOCREngine Adapter & Parsing', () => {
  const ocrEngine = new LocalOCREngine();

  it('guarantees local processing without external AI or third-party cloud service', () => {
    expect(ocrEngine.isLocal).toBe(true);
    expect(ocrEngine.name).toContain('Local-First');
  });

  it('processes a synthetic prescription PNG image and preserves coordinates', async () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const prescriptionText = Buffer.from(`===PRESCRIPTION_START===
Rx: Glucophage XR (Metformin Hydrochloride) 500 mg
Oral Tablet
Sig: Take 1 tablet by mouth twice daily with meals.
Disp: #60 Refills: 3
===PRESCRIPTION_END===`);

    const imageBuffer = Buffer.concat([pngHeader, prescriptionText]);

    const result = await ocrEngine.processDocument(imageBuffer, 'test_prescription.png', 'image/png');

    expect(result.documentId).toBeDefined();
    expect(result.fileName).toBe('test_prescription.png');
    expect(result.fileType).toBe('image/png');
    expect(result.pageCount).toBe(1);
    expect(result.pages.length).toBe(1);
    expect(result.pages[0].lines.length).toBeGreaterThanOrEqual(4);
    expect(result.overallConfidence).toBeGreaterThanOrEqual(0.85);

    // Verify first line coordinate extraction
    const firstLine = result.pages[0].lines[0];
    expect(firstLine.pageNumber).toBe(1);
    expect(firstLine.lineIndex).toBe(1);
    expect(firstLine.text).toContain('Glucophage');
    expect(firstLine.boundingBox).toBeDefined();
    expect(firstLine.boundingBox.x).toBeGreaterThan(0);
    expect(firstLine.boundingBox.y).toBeGreaterThan(0);
  });

  it('processes a synthetic PDF document with stream objects', async () => {
    const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 120 >>
stream
(Rx: Prinivil (Lisinopril) 10 mg) Tj
(Sig: Take 1 tablet daily.) Tj
endstream
endobj
xref
trailer
<< /Root 1 0 R >>
%%EOF`;

    const pdfBuffer = Buffer.from(pdfContent, 'binary');

    const result = await ocrEngine.processDocument(pdfBuffer, 'printed_order.pdf', 'application/pdf');

    expect(result.pageCount).toBe(1);
    expect(result.pages[0].lines.length).toBeGreaterThanOrEqual(1);
    expect(result.rawText).toContain('Prinivil');
    expect(result.rawText).toContain('Lisinopril');
  });

  it('detects degraded/low-quality scans and emits clinical confidence warning', async () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const prescriptionText = Buffer.from(`===PRESCRIPTION_START===
Rx: Atorvastatin 20 mg
Take 1 tab at bedtime??
===PRESCRIPTION_END===`);

    const imageBuffer = Buffer.concat([pngHeader, prescriptionText]);

    const result = await ocrEngine.processDocument(
      imageBuffer,
      'blurry_low_quality_scan.png',
      'image/png'
    );

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('below 200 DPI') || w.includes('optical'))).toBe(true);
    expect(result.overallConfidence).toBeLessThan(0.7);
  });

  it('rejects unsupported file formats (e.g. text/plain, zip)', async () => {
    const textBuffer = Buffer.from('Just plain text');

    await expect(
      ocrEngine.processDocument(textBuffer, 'notes.txt', 'text/plain')
    ).rejects.toThrow('Unsupported document format');
  });

  it('rejects empty (0 byte) file uploads', async () => {
    const emptyBuffer = Buffer.alloc(0);

    await expect(
      ocrEngine.processDocument(emptyBuffer, 'empty.png', 'image/png')
    ).rejects.toThrow('Uploaded document is empty');
  });

  it('rejects invalid or corrupted PDF headers', async () => {
    const corruptedPdfBuffer = Buffer.from('NOT A PDF FILE BODY');

    await expect(
      ocrEngine.processDocument(corruptedPdfBuffer, 'corrupted.pdf', 'application/pdf')
    ).rejects.toThrow('Corrupted or invalid PDF header');
  });
});
