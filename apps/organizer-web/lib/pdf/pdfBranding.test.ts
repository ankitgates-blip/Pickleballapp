import { describe, it, expect } from 'vitest';
import { PDF_ACCENT_COLORS, pdfTableTheme } from './pdfBranding';

describe('PDF_ACCENT_COLORS', () => {
  it('has exactly the three document accents at their exact hex values', () => {
    expect(PDF_ACCENT_COLORS).toEqual({
      roster: '#a8874f',
      schedule: '#bf5919',
      results: '#0f766e',
    });
  });
});

describe('pdfTableTheme', () => {
  it('converts the roster accent hex to its exact RGB triple for the header fill', () => {
    const theme = pdfTableTheme('roster');
    expect(theme.headStyles.fillColor).toEqual([168, 135, 79]);
    expect(theme.headStyles.textColor).toEqual([255, 255, 255]);
  });

  it('converts the schedule accent hex to its exact RGB triple', () => {
    const theme = pdfTableTheme('schedule');
    expect(theme.headStyles.fillColor).toEqual([191, 89, 25]);
  });

  it('converts the results accent hex to its exact RGB triple', () => {
    const theme = pdfTableTheme('results');
    expect(theme.headStyles.fillColor).toEqual([15, 118, 110]);
  });

  it('tints the roster accent 92% toward white for alternating row fill', () => {
    const theme = pdfTableTheme('roster');
    expect(theme.alternateRowStyles.fillColor).toEqual([248, 245, 241]);
  });
});
