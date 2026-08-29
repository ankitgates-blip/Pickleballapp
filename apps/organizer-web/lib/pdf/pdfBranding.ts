// apps/organizer-web/lib/pdf/pdfBranding.ts
import type jsPDF from 'jspdf';

export type PdfAccent = 'roster' | 'schedule' | 'results' | 'leaderboard' | 'playerStats';

export const PDF_ACCENT_COLORS: Record<PdfAccent, string> = {
  roster: '#a8874f',
  schedule: '#bf5919',
  results: '#0f766e',
  leaderboard: '#5b4b8a',
  playerStats: '#7c3a5c',
};

const GOLD: [number, number, number] = [168, 135, 79]; // #a8874f, footer text color
const GOLD_BRIGHT: [number, number, number] = [214, 175, 54]; // #d6af36, "medal gold" -- brighter than GOLD, used for anything meant to read as metal/trophy rather than brand chrome
const WIN_RGB: [number, number, number] = [15, 118, 110]; // #0f766e, matches the web app's --color-win
const LOSS_RGB: [number, number, number] = [159, 18, 57]; // #9f1239, matches the web app's --color-loss
const MEDAL_COLORS: [number, number, number][] = [
  [214, 175, 54], // #d6af36 gold
  [167, 167, 173], // #a7a7ad silver
  [167, 112, 68], // #a77044 bronze
];
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

// `medalRankColumn` draws a gold/silver/bronze filled circle behind the top-3 rows'
// value in that column index (e.g. a "#" rank column) -- the actual text (set to
// white by didParseCell below) is drawn by autoTable's own default renderer on top
// of it afterwards, so there's a single source of truth for the number, not two
// overlapping draws. `diffColumn` colors a +/- point-diff column win/loss-token
// green/red based on the cell's own "+"/"-" prefix (already present in every
// diffLabel this app produces) -- the sign character is the glyph half of a
// glyph+color signal, so direction is never carried by color alone.
export function pdfTableTheme(
  accent: PdfAccent,
  options?: { medalRankColumn?: number; diffColumn?: number }
) {
  const rgb = hexToRgb(PDF_ACCENT_COLORS[accent]);
  const { medalRankColumn, diffColumn } = options ?? {};

  return {
    headStyles: {
      fillColor: rgb,
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: 'bold' as const,
    },
    alternateRowStyles: {
      fillColor: tintTowardWhite(rgb, 0.92),
    },
    styles: {
      lineColor: tintTowardWhite(rgb, 0.7) as [number, number, number],
      lineWidth: 0.1,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jspdf-autotable's
    // CellHookData type doesn't structurally match a plain object literal here; the
    // runtime shape (section/column/row/cell) is accurate regardless.
    didParseCell: (data: any) => {
      if (data.section !== 'body') return;
      if (medalRankColumn !== undefined && data.column.index === medalRankColumn && data.row.index < 3) {
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.halign = 'center';
      }
      if (diffColumn !== undefined && data.column.index === diffColumn) {
        const label = String(data.cell.raw ?? '');
        if (label.startsWith('+')) {
          data.cell.styles.textColor = WIN_RGB;
          data.cell.styles.fontStyle = 'bold';
        } else if (label.startsWith('-')) {
          data.cell.styles.textColor = LOSS_RGB;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see didParseCell above
    willDrawCell: (data: any) => {
      if (
        data.section === 'body' &&
        medalRankColumn !== undefined &&
        data.column.index === medalRankColumn &&
        data.row.index < 3
      ) {
        const [r, g, b] = MEDAL_COLORS[data.row.index];
        const cx = data.cell.x + data.cell.width / 2;
        const cy = data.cell.y + data.cell.height / 2;
        const radius = Math.min(data.cell.width, data.cell.height) / 2 - 0.5;
        data.doc.setFillColor(r, g, b);
        data.doc.circle(cx, cy, radius, 'F');
      }
    },
  };
}

// Fetches an image URL -- the bundled logo asset (e.g. /pdf-logo.png) or a player's
// stored photo -- and converts it to a data URL for jsPDF's addImage, which needs image
// data directly rather than a URL it can fetch itself. Not cached across calls -- assets
// are small, so a repeat fetch is cheap and this avoids any module-level mutable state.
// Returns null on any failure (404, offline, corrupt response) rather than throwing, so a
// broken image degrades gracefully (a text-only header, or no player photo) instead of
// blocking the entire PDF export -- before this module existed, PDF generation had zero
// network dependency, and a decorative image shouldn't introduce one.
export async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// A small perforated pickleball, drawn in the header's top-right corner -- the same
// hand-drawn motif (gold circle + a cross of dark dots for perforation) already
// established as this app's brand accent, rather than a raster asset or an emoji
// glyph jsPDF's built-in fonts can't render.
function drawBallIcon(doc: jsPDF, centerX: number, centerY: number, radius: number): void {
  doc.setFillColor(GOLD_BRIGHT[0], GOLD_BRIGHT[1], GOLD_BRIGHT[2]);
  doc.circle(centerX, centerY, radius, 'F');
  doc.setFillColor(NAVY_BAND_STOPS[0][0], NAVY_BAND_STOPS[0][1], NAVY_BAND_STOPS[0][2]);
  const dotR = radius * 0.12;
  const offsets: [number, number][] = [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4], [0, 0]];
  for (const [dx, dy] of offsets) {
    doc.circle(centerX + dx * radius, centerY + dy * radius, dotR, 'F');
  }
}

// A vector gold trophy icon (bowl, handles, stem, base) -- built from jsPDF's own
// shape primitives rather than an emoji glyph, since jsPDF's built-in fonts have no
// 🏆 glyph and would silently render nothing (or a missing-glyph box) in the actual
// exported PDF. Exported so any document can drop a trophy next to a champion.
export function drawTrophyIcon(doc: jsPDF, x: number, y: number, size: number): void {
  const [r, g, b] = GOLD_BRIGHT;
  doc.setFillColor(r, g, b);
  doc.roundedRect(x, y, size, size * 0.55, size * 0.15, size * 0.15, 'F');
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(size * 0.09);
  doc.circle(x - size * 0.06, y + size * 0.18, size * 0.16, 'S');
  doc.circle(x + size * 1.06, y + size * 0.18, size * 0.16, 'S');
  doc.setFillColor(r, g, b);
  doc.rect(x + size * 0.4, y + size * 0.55, size * 0.2, size * 0.28, 'F');
  doc.roundedRect(x + size * 0.18, y + size * 0.8, size * 0.64, size * 0.16, size * 0.04, size * 0.04, 'F');
}

// Draws a gold ribbon banner with a trophy icon and the champion's name -- the
// Results PDF's "grand" replacement for a plain colored text box. Returns the Y
// position immediately below the banner.
export function drawChampionBanner(
  doc: jsPDF,
  params: { accent: PdfAccent; name: string; x: number; y: number; width: number }
): number {
  const { accent, name, x, y, width } = params;
  const [r, g, b] = hexToRgb(PDF_ACCENT_COLORS[accent]);
  const trophySize = 14;
  drawTrophyIcon(doc, x + width / 2 - trophySize / 2, y, trophySize);

  const bannerY = y + trophySize + 4;
  const bannerHeight = 16;
  const ribbonStops: [number, number, number][] = [[r, g, b], GOLD_BRIGHT, [r, g, b]];
  const stripWidth = width / ribbonStops.length;
  ribbonStops.forEach((rgb, i) => {
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.rect(x + i * stripWidth, bannerY, stripWidth + 0.5, bannerHeight, 'F');
  });

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('CHAMPION', x + width / 2, bannerY + 6, { align: 'center' });
  doc.setFontSize(13);
  doc.text(name, x + width / 2, bannerY + 13, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);

  return bannerY + bannerHeight + 8;
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
    logoDataUrl: string | null;
  }
): number {
  const { accent, title, subtitle, metaLine, logoDataUrl } = params;
  const pageWidth = doc.internal.pageSize.getWidth();
  const bandHeight = 36;
  const stripHeight = bandHeight / NAVY_BAND_STOPS.length;

  NAVY_BAND_STOPS.forEach((rgb, i) => {
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.rect(0, i * stripHeight, pageWidth, stripHeight + 0.5, 'F'); // +0.5 avoids hairline gaps between strips
  });

  drawBallIcon(doc, pageWidth - 12, 10, 6);

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', 12, 5, 26, 26);
  }

  const textX = 44;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(title, textX, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(subtitle, textX, 22);
  doc.setTextColor(GOLD_BRIGHT[0], GOLD_BRIGHT[1], GOLD_BRIGHT[2]);
  doc.setFontSize(9);
  doc.text(metaLine, textX, 29);

  // Two-tone accent bar: the document's own accent color, edged with a thin gold
  // line -- a wider, "ribbon" version of the single flat 2mm bar this used to be.
  const [r, g, b] = hexToRgb(PDF_ACCENT_COLORS[accent]);
  doc.setFillColor(r, g, b);
  doc.rect(0, bandHeight, pageWidth, 3, 'F');
  doc.setFillColor(GOLD_BRIGHT[0], GOLD_BRIGHT[1], GOLD_BRIGHT[2]);
  doc.rect(0, bandHeight + 3, pageWidth, 0.8, 'F');

  doc.setTextColor(0, 0, 0); // reset for whatever the caller draws next
  doc.setFontSize(10);
  return bandHeight + 3 + 0.8 + 8;
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
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFontSize(12); // getTextWidth measures at the currently-set font size
  const boxWidth = Math.min(doc.getTextWidth(text) + 12, pageWidth - x - 14);

  doc.setFillColor(r, g, b);
  doc.roundedRect(x, y, boxWidth, boxHeight, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text(text, x + 6, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);

  return y + boxHeight + 6;
}
