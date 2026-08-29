import { describe, it, expect } from 'vitest';
import { PDF_ACCENT_COLORS, pdfTableTheme } from './pdfBranding';

describe('PDF_ACCENT_COLORS', () => {
  it('has exactly the five document accents at their exact hex values', () => {
    expect(PDF_ACCENT_COLORS).toEqual({
      roster: '#a8874f',
      schedule: '#bf5919',
      results: '#0f766e',
      leaderboard: '#5b4b8a',
      playerStats: '#7c3a5c',
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

  it('converts the leaderboard accent hex to its exact RGB triple', () => {
    const theme = pdfTableTheme('leaderboard');
    expect(theme.headStyles.fillColor).toEqual([91, 75, 138]);
  });

  it('converts the playerStats accent hex to its exact RGB triple', () => {
    const theme = pdfTableTheme('playerStats');
    expect(theme.headStyles.fillColor).toEqual([124, 58, 92]);
  });

  it('tints the roster accent 92% toward white for alternating row fill', () => {
    const theme = pdfTableTheme('roster');
    expect(theme.alternateRowStyles.fillColor).toEqual([248, 245, 241]);
  });

  it('bolds the header font style', () => {
    expect(pdfTableTheme('roster').headStyles.fontStyle).toBe('bold');
  });

  it('colors a "+" diff cell win-green and a "-" diff cell loss-red via didParseCell', () => {
    const theme = pdfTableTheme('results', { diffColumn: 3 });
    const winCell = { section: 'body', column: { index: 3 }, row: { index: 5 }, cell: { raw: '+7', styles: {} as Record<string, unknown> } };
    const lossCell = { section: 'body', column: { index: 3 }, row: { index: 5 }, cell: { raw: '-3', styles: {} as Record<string, unknown> } };
    theme.didParseCell(winCell as never);
    theme.didParseCell(lossCell as never);
    expect(winCell.cell.styles.textColor).toEqual([15, 118, 110]);
    expect(lossCell.cell.styles.textColor).toEqual([159, 18, 57]);
  });

  it('does not color a diff cell outside the configured diffColumn', () => {
    const theme = pdfTableTheme('results', { diffColumn: 3 });
    const otherCell = { section: 'body', column: { index: 1 }, row: { index: 0 }, cell: { raw: '+7', styles: {} as Record<string, unknown> } };
    theme.didParseCell(otherCell as never);
    expect(otherCell.cell.styles.textColor).toBeUndefined();
  });

  it('whitens and bolds the medal rank column text for the top 3 rows only', () => {
    const theme = pdfTableTheme('results', { medalRankColumn: 0 });
    const rank1 = { section: 'body', column: { index: 0 }, row: { index: 0 }, cell: { raw: '1', styles: {} as Record<string, unknown> } };
    const rank4 = { section: 'body', column: { index: 0 }, row: { index: 3 }, cell: { raw: '4', styles: {} as Record<string, unknown> } };
    theme.didParseCell(rank1 as never);
    theme.didParseCell(rank4 as never);
    expect(rank1.cell.styles.textColor).toEqual([255, 255, 255]);
    expect(rank4.cell.styles.textColor).toBeUndefined();
  });
});
