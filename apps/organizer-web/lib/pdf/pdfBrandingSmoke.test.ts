import { describe, it, expect } from 'vitest';

// A minimal valid 1x1 transparent PNG, used because drawPdfHeader needs a real
// addImage-compatible data URL -- the exact pixel content doesn't matter here, only
// that jsPDF can parse it without throwing.
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('pdfBranding drawing functions (smoke)', () => {
  it('drawPdfHeader draws without throwing and returns a Y past the header band', async () => {
    const [{ default: jsPDF }, { drawPdfHeader }] = await Promise.all([
      import('jspdf'),
      import('./pdfBranding'),
    ]);
    const doc = new jsPDF();

    const y = drawPdfHeader(doc, {
      accent: 'roster',
      title: 'Thursday Rumble',
      subtitle: 'Roster',
      metaLine: '2026-08-27 · Pickleturf · Evening · League + Playoffs',
      logoDataUrl: TINY_PNG_DATA_URL,
    });

    expect(typeof y).toBe('number');
    expect(y).toBeGreaterThan(32); // past the 32mm band + accent bar
  });

  it('drawPdfFooter stamps every existing page without throwing or adding pages', async () => {
    const [{ default: jsPDF }, { drawPdfFooter }] = await Promise.all([
      import('jspdf'),
      import('./pdfBranding'),
    ]);
    const doc = new jsPDF();
    doc.addPage();
    expect(doc.getNumberOfPages()).toBe(2);

    drawPdfFooter(doc);

    expect(doc.getNumberOfPages()).toBe(2);
  });

  it('drawHighlightBox draws without throwing and returns a Y below the box', async () => {
    const [{ default: jsPDF }, { drawHighlightBox }] = await Promise.all([
      import('jspdf'),
      import('./pdfBranding'),
    ]);
    const doc = new jsPDF();

    const y = drawHighlightBox(doc, { accent: 'results', text: 'Champion: Team Alpha', x: 14, y: 50 });

    expect(y).toBeGreaterThan(50);
  });
});
