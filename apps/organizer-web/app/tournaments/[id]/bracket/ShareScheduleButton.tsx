'use client';

import { useState } from 'react';
import { outlineButtonClass } from '@/app/components/ui';
import { shareOrDownloadPdf, sanitizeFileNamePart } from '@/lib/pdf/pdfShare';
import { drawPdfHeader, drawPdfFooter, pdfTableTheme, loadImageAsDataUrl } from '@/lib/pdf/pdfBranding';
import type { ExportMatchGroup } from '@/lib/tournament/resultsExport';

type ShareScheduleButtonProps = {
  tournamentName: string;
  date: string;
  venueName: string;
  timeslotLabel: string;
  formatLabel: string;
  matchGroups: ExportMatchGroup[];
};

export default function ShareScheduleButton({
  tournamentName,
  date,
  venueName,
  timeslotLabel,
  formatLabel,
  matchGroups,
}: ShareScheduleButtonProps) {
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
      let y = drawPdfHeader(doc, {
        accent: 'schedule',
        title: tournamentName,
        subtitle: 'Match Schedule',
        metaLine: [date, venueName, timeslotLabel, formatLabel].join(' · '),
        logoDataUrl,
      });

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
        autoTable(doc, { startY: y + 4, head: [['Round', 'Team A', 'Team B', 'Score']], body, ...pdfTableTheme('schedule') });
        // @ts-expect-error -- doc.lastAutoTable is set at runtime by jspdf-autotable, with no official type augmentation
        y = doc.lastAutoTable.finalY + 8;
      }

      drawPdfFooter(doc);
      const blob: Blob = doc.output('blob');
      const fileName = `${sanitizeFileNamePart(tournamentName)}-schedule.pdf`;
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
        {status === 'generating' ? 'Generating…' : '📤 Share Schedule'}
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
