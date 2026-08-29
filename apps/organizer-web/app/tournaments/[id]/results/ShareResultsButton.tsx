'use client';

import { useState } from 'react';
import { outlineButtonClass } from '@/app/components/ui';
import { shareOrDownloadPdf, sanitizeFileNamePart } from '@/lib/pdf/pdfShare';
import { drawPdfHeader, drawPdfFooter, pdfTableTheme, drawChampionBanner, loadImageAsDataUrl } from '@/lib/pdf/pdfBranding';
import type { ExportStandingsRow, ExportMatchGroup } from '@/lib/tournament/resultsExport';

type ShareResultsButtonProps = {
  tournamentName: string;
  date: string;
  venueName: string;
  timeslotLabel: string;
  formatLabel: string;
  completedAt: string | null;
  championName: string | undefined;
  standingsTitle: string;
  standingsRows: ExportStandingsRow[];
  matchGroups: ExportMatchGroup[];
};

export default function ShareResultsButton({
  tournamentName,
  date,
  venueName,
  timeslotLabel,
  formatLabel,
  completedAt,
  championName,
  standingsTitle,
  standingsRows,
  matchGroups,
}: ShareResultsButtonProps) {
  const [status, setStatus] = useState<'idle' | 'generating' | 'unsupported' | 'error'>('idle');

  const handleClick = async () => {
    setStatus('generating');
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);

      const doc = new jsPDF();
      const logoDataUrl = await loadImageAsDataUrl('/pdf-logo.png');
      const metaParts = [date, venueName, timeslotLabel, formatLabel];
      if (completedAt) metaParts.push(`Completed ${new Date(completedAt).toLocaleDateString()}`);
      let y = drawPdfHeader(doc, {
        accent: 'results',
        title: tournamentName,
        subtitle: 'Results',
        metaLine: metaParts.join(' · '),
        logoDataUrl,
      });

      if (championName) {
        const pageWidth = doc.internal.pageSize.getWidth();
        y = drawChampionBanner(doc, { accent: 'results', name: championName, x: 14, y, width: pageWidth - 28 });
      }

      const hasPrimaryStat = standingsRows.some((r) => r.primaryStat !== '');
      const standingsHead = hasPrimaryStat
        ? [['#', standingsTitle, 'Pts', 'W', 'L', 'Diff']]
        : [['#', standingsTitle, 'W', 'L', 'Diff']];
      const standingsBody = standingsRows.map((r) =>
        hasPrimaryStat
          ? [String(r.rank), r.name, r.primaryStat, String(r.wins), String(r.losses), r.diffLabel]
          : [String(r.rank), r.name, String(r.wins), String(r.losses), r.diffLabel]
      );
      const diffColumnIndex = hasPrimaryStat ? 5 : 4;

      autoTable(doc, {
        startY: y,
        head: standingsHead,
        body: standingsBody,
        ...pdfTableTheme('results', { medalRankColumn: 0, diffColumn: diffColumnIndex }),
      });
      // @ts-expect-error -- autoTable augments jsPDF's instance type with lastAutoTable at runtime
      y = doc.lastAutoTable.finalY + 8;

      for (const group of matchGroups) {
        doc.setFontSize(11);
        doc.text(group.stageLabel, 14, y);
        y += 2;
        const body = group.matches.map((m) => [
          m.round !== null ? String(m.round) : '',
          m.teamAName,
          m.teamBName,
          m.scoreLabel,
        ]);
        autoTable(doc, { startY: y + 4, head: [['Round', 'Team A', 'Team B', 'Score']], body, ...pdfTableTheme('results') });
        // @ts-expect-error -- see above
        y = doc.lastAutoTable.finalY + 8;
      }

      drawPdfFooter(doc);
      const blob: Blob = doc.output('blob');
      const fileName = `${sanitizeFileNamePart(tournamentName)}-results.pdf`;
      const result = await shareOrDownloadPdf(blob, fileName, tournamentName);
      setStatus(result === 'downloaded' ? 'unsupported' : 'idle');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'generating'}
        className={outlineButtonClass}
      >
        {status === 'generating' ? 'Generating…' : '📤 Share Results'}
      </button>
      {status === 'unsupported' && (
        <p className="text-xs text-slate-500 mt-1.5">
          Downloaded — this browser doesn't support direct sharing. Attach the file to WhatsApp manually.
        </p>
      )}
      {status === 'error' && (
        <p className="text-xs text-red-600 mt-1.5">
          Something went wrong generating the PDF. Try again.
        </p>
      )}
    </div>
  );
}
