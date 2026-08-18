'use client';

import { useState } from 'react';
import { outlineButtonClass } from '@/app/components/ui';
import { sanitizeFileNamePart, type ExportStandingsRow, type ExportMatchGroup } from '@/lib/tournament/resultsExport';

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
  const [status, setStatus] = useState<'idle' | 'generating' | 'unsupported'>('idle');

  const handleClick = async () => {
    setStatus('generating');
    try {
      const [{ default: jsPDF }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);

      const doc = new jsPDF();
      let y = 16;

      doc.setFontSize(16);
      doc.text('PicklerAlly DXB', 14, y);
      y += 8;
      doc.setFontSize(13);
      doc.text(tournamentName, 14, y);
      y += 7;

      doc.setFontSize(10);
      const metaParts = [date, venueName, timeslotLabel, formatLabel];
      if (completedAt) metaParts.push(`Completed ${new Date(completedAt).toLocaleDateString()}`);
      doc.text(metaParts.join(' · '), 14, y);
      y += 8;

      if (championName) {
        doc.setFontSize(12);
        doc.text(`Champion: ${championName}`, 14, y);
        y += 8;
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

      // @ts-expect-error -- autoTable attaches itself to the jsPDF instance as a side effect of the import above
      doc.autoTable({ startY: y, head: standingsHead, body: standingsBody });
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
        // @ts-expect-error -- see above
        doc.autoTable({ startY: y + 4, head: [['Round', 'Team A', 'Team B', 'Score']], body });
        // @ts-expect-error -- see above
        y = doc.lastAutoTable.finalY + 8;
      }

      const blob: Blob = doc.output('blob');
      const fileName = `${sanitizeFileNamePart(tournamentName)}-results.pdf`;
      const file = new File([blob], fileName, { type: 'application/pdf' });

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: tournamentName });
        } catch (err) {
          if (!(err instanceof Error) || err.name !== 'AbortError') throw err;
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        setStatus('unsupported');
        return;
      }

      setStatus('idle');
    } catch {
      setStatus('idle');
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
    </div>
  );
}
