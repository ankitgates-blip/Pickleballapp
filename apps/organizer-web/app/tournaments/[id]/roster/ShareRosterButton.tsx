'use client';

import { useState } from 'react';
import { outlineButtonClass } from '@/app/components/ui';
import { shareOrDownloadPdf, sanitizeFileNamePart } from '@/lib/pdf/pdfShare';
import { drawPdfHeader, drawPdfFooter, pdfTableTheme, loadImageAsDataUrl } from '@/lib/pdf/pdfBranding';
import type { ExportRosterTeam } from '@/lib/tournament/rosterExport';

type ShareRosterButtonProps = {
  tournamentName: string;
  date: string;
  venueName: string;
  timeslotLabel: string;
  formatLabel: string;
  hasTeams: boolean;
  rosterTeams: ExportRosterTeam[];
  unpairedPlayerNames: string[];
  allPlayerNames: string[];
};

export default function ShareRosterButton({
  tournamentName,
  date,
  venueName,
  timeslotLabel,
  formatLabel,
  hasTeams,
  rosterTeams,
  unpairedPlayerNames,
  allPlayerNames,
}: ShareRosterButtonProps) {
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
        accent: 'roster',
        title: tournamentName,
        subtitle: 'Roster',
        metaLine: [date, venueName, timeslotLabel, formatLabel].join(' · '),
        logoDataUrl,
      });

      if (hasTeams) {
        doc.setFontSize(12);
        doc.text('Teams', 14, y);
        y += 2;
        const body = rosterTeams.map((t, i) => [String(i + 1), t.player1Name, t.player2Name]);
        autoTable(doc, { startY: y + 4, head: [['#', 'Player 1', 'Player 2']], body, ...pdfTableTheme('roster') });
        // @ts-expect-error -- doc.lastAutoTable is set at runtime by jspdf-autotable, with no official type augmentation
        y = doc.lastAutoTable.finalY + 8;

        if (unpairedPlayerNames.length > 0) {
          doc.setFontSize(12);
          doc.text('Unpaired Players', 14, y);
          y += 2;
          autoTable(doc, {
            ...pdfTableTheme('roster'),
            startY: y + 4,
            head: [['Player']],
            body: unpairedPlayerNames.map((name) => [name]),
          });
        }
      } else {
        doc.setFontSize(12);
        doc.text('Players', 14, y);
        y += 2;
        autoTable(doc, {
          ...pdfTableTheme('roster'),
          startY: y + 4,
          head: [['Player']],
          body: allPlayerNames.map((name) => [name]),
        });
      }

      drawPdfFooter(doc);
      const blob: Blob = doc.output('blob');
      const fileName = `${sanitizeFileNamePart(tournamentName)}-roster.pdf`;
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
        {status === 'generating' ? 'Generating…' : '📤 Share Roster'}
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
