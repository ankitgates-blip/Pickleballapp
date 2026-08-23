'use client';

import { useState } from 'react';
import { outlineButtonClass } from '@/app/components/ui';
import { shareOrDownloadFile, sanitizeFileNamePart } from '@/lib/pdf/pdfShare';

export type ExportLeaderboardVenue = {
  venueName: string;
  rows: {
    rank: number;
    name: string;
    matchesPlayed: number;
    matchWins: number;
    losses: number;
    winPercentage: number | null;
  }[];
};

type ShareLeaderboardButtonProps = {
  venues: ExportLeaderboardVenue[];
};

export default function ShareLeaderboardButton({ venues }: ShareLeaderboardButtonProps) {
  const [status, setStatus] = useState<'idle' | 'generating' | 'unsupported' | 'error'>('idle');

  const handleClick = async () => {
    setStatus('generating');
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);

      const doc = new jsPDF();
      let y = 16;

      doc.setFontSize(16);
      doc.text('PicklerAlly DXB', 14, y);
      y += 8;
      doc.setFontSize(13);
      doc.text('Location Stats', 14, y);
      y += 10;

      for (const venue of venues) {
        if (y > 260) {
          doc.addPage();
          y = 16;
        }

        doc.setFontSize(12);
        doc.text(venue.venueName, 14, y);
        y += 2;

        if (venue.rows.length === 0) {
          doc.setFontSize(10);
          doc.text('No matches played here yet.', 14, y + 6);
          y += 14;
          continue;
        }

        const body = venue.rows.map((r) => [
          String(r.rank),
          r.name,
          String(r.matchesPlayed),
          String(r.matchWins),
          String(r.losses),
          r.winPercentage !== null ? `${r.winPercentage}%` : '—',
        ]);

        autoTable(doc, {
          startY: y + 4,
          head: [['#', 'Player', 'Matches', 'Wins', 'Losses', 'Win %']],
          body,
        });
        // @ts-expect-error -- autoTable augments jsPDF's instance type with lastAutoTable at runtime
        y = doc.lastAutoTable.finalY + 10;
      }

      const blob: Blob = doc.output('blob');
      const fileName = `${sanitizeFileNamePart('picklerally-dxb')}-leaderboard.pdf`;
      const result = await shareOrDownloadFile(blob, fileName, 'PicklerAlly DXB Leaderboard', 'application/pdf');
      setStatus(result === 'downloaded' ? 'unsupported' : 'idle');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'generating'}
        className={outlineButtonClass}
      >
        {status === 'generating' ? 'Generating…' : '📤 Share Leaderboard'}
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
