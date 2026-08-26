// apps/organizer-web/lib/pdf/pdfBranding.ts
import type jsPDF from 'jspdf';

export type PdfAccent = 'roster' | 'schedule' | 'results';

export const PDF_ACCENT_COLORS: Record<PdfAccent, string> = {
  roster: '#a8874f',
  schedule: '#bf5919',
  results: '#0f766e',
};

const GOLD: [number, number, number] = [168, 135, 79]; // #a8874f, footer text color
const NAVY_BAND_STOPS: [number, number, number][] = [
  [12, 24, 48], // #0c1830
  [22, 41, 78], // #16294e
  [28, 53, 96], // #1c3560
];

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

// Mixes an RGB triple toward white by `amount` (0-1), rounding each channel --
// used for autoTable's zebra-striped alternate rows so they read as a light tint
// of the document's accent color instead of the library's default flat gray.
function tintTowardWhite(rgb: [number, number, number], amount: number): [number, number, number] {
  return rgb.map((c) => Math.round(c + (255 - c) * amount)) as [number, number, number];
}

export function pdfTableTheme(accent: PdfAccent) {
  const rgb = hexToRgb(PDF_ACCENT_COLORS[accent]);
  return {
    headStyles: {
      fillColor: rgb,
      textColor: [255, 255, 255] as [number, number, number],
    },
    alternateRowStyles: {
      fillColor: tintTowardWhite(rgb, 0.92),
    },
  };
}

// Fetches a same-origin static asset (e.g. /pdf-logo.png) and converts it to a data URL
// for jsPDF's addImage, which needs image data directly rather than a URL it can fetch
// itself. Not cached across calls -- the asset is small and already browser-cached by
// the time a Share button is clicked, so a repeat fetch is cheap and this avoids any
// module-level mutable state.
export async function loadImageAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Draws the branded header band (logo + title + subtitle + meta line + accent bar) at
// the top of the current page and returns the Y coordinate (mm) content should continue
// from. The navy gradient is approximated as 3 stacked flat bands interpolating between
// the app's own navy tones, since jsPDF has no native linear-gradient fill.
export function drawPdfHeader(
  doc: jsPDF,
  params: {
    accent: PdfAccent;
    title: string;
    subtitle: string;
    metaLine: string;
    logoDataUrl: string;
  }
): number {
  const { accent, title, subtitle, metaLine, logoDataUrl } = params;
  const pageWidth = doc.internal.pageSize.getWidth();
  const bandHeight = 32;
  const stripHeight = bandHeight / NAVY_BAND_STOPS.length;

  NAVY_BAND_STOPS.forEach((rgb, i) => {
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.rect(0, i * stripHeight, pageWidth, stripHeight + 0.5, 'F'); // +0.5 avoids hairline gaps between strips
  });

  doc.addImage(logoDataUrl, 'PNG', 14, 4, 24, 24);

  const textX = 44;
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(title, textX, 14);
  doc.setFontSize(11);
  doc.text(subtitle, textX, 20);
  doc.setTextColor(185, 196, 221); // #b9c4dd, matches the app shell's own inactive-nav-link blue
  doc.setFontSize(9);
  doc.text(metaLine, textX, 26);

  const [r, g, b] = hexToRgb(PDF_ACCENT_COLORS[accent]);
  doc.setFillColor(r, g, b);
  doc.rect(0, bandHeight, pageWidth, 2, 'F');

  doc.setTextColor(0, 0, 0); // reset for whatever the caller draws next
  return bandHeight + 2 + 8;
}

// Stamps "Page X of Y" and the brand tagline on every page already in the document.
// Must be called after all content is added -- it needs the final page count.
export function drawPdfFooter(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.text('Premier Dubai Pickleball League App', 14, pageHeight - 10);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
  }
}

// Draws a filled, rounded, accent-colored box with white bold text -- used for the
// Results PDF's champion callout. Returns the Y position immediately below the box.
export function drawHighlightBox(
  doc: jsPDF,
  params: { accent: PdfAccent; text: string; x: number; y: number }
): number {
  const { accent, text, x, y } = params;
  const [r, g, b] = hexToRgb(PDF_ACCENT_COLORS[accent]);
  const boxHeight = 10;
  const textWidth = doc.getStringUnitWidth(text) * 12 * 1.15; // approx width at 12pt for box sizing
  const boxWidth = textWidth * 0.5 + 12; // getStringUnitWidth returns em units, not mm -- pad generously

  doc.setFillColor(r, g, b);
  doc.roundedRect(x, y, boxWidth, boxHeight, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text(text, x + 6, y + 7);
  doc.setTextColor(0, 0, 0);

  return y + boxHeight + 6;
}
