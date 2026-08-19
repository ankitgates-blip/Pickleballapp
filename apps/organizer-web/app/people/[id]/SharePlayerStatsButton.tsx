'use client';

import { useState } from 'react';
import { outlineButtonClass } from '@/app/components/ui';
import { shareOrDownloadPdf, sanitizeFileNamePart } from '@/lib/pdf/pdfShare';
import type { ExportLocationRow, ExportMatchHistoryRow, ExportPeriodRow } from '@/lib/stats/personStatsExport';

type SharePlayerStatsButtonProps = {
  personName: string;
  lastPlayedDate: string | null;
  starLabel: string;
  thisMonthGamesWon: number;
  thisMonthGamesLost: number;
  thisMonthTournamentsWon: number;
  locationRows: ExportLocationRow[];
  weeklyRows: ExportPeriodRow[];
  monthlyRows: ExportPeriodRow[];
  yearlyRows: ExportPeriodRow[];
  toughestOpponentLabel: string;
  bestPartnerLabel: string;
  matchHistoryRows: ExportMatchHistoryRow[];
};

export default function SharePlayerStatsButton({
  personName,
  lastPlayedDate,
  starLabel,
  thisMonthGamesWon,
  thisMonthGamesLost,
  thisMonthTournamentsWon,
  locationRows,
  weeklyRows,
  monthlyRows,
  yearlyRows,
  toughestOpponentLabel,
  bestPartnerLabel,
  matchHistoryRows,
}: SharePlayerStatsButtonProps) {
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

      const ensureSpace = (needed: number) => {
        if (y + needed > doc.internal.pageSize.getHeight() - 14) {
          doc.addPage();
          y = 16;
        }
      };

      doc.setFontSize(16);
      doc.text('PicklerAlly DXB', 14, y);
      y += 8;
      doc.setFontSize(13);
      doc.text(personName, 14, y);
      y += 7;

      doc.setFontSize(10);
      doc.text(
        [lastPlayedDate ? `Last played: ${lastPlayedDate}` : 'No matches played yet', starLabel].join(' · '),
        14,
        y
      );
      y += 10;

      ensureSpace(20);
      doc.setFontSize(12);
      doc.text('This Month', 14, y);
      y += 6;
      doc.setFontSize(10);
      doc.text(
        `Games Won: ${thisMonthGamesWon}   Games Lost: ${thisMonthGamesLost}   Tournaments Won: ${thisMonthTournamentsWon}`,
        14,
        y
      );
      y += 10;

      ensureSpace(30);
      doc.setFontSize(12);
      doc.text('By Location', 14, y);
      y += 2;
      autoTable(doc, {
        startY: y + 4,
        head: [['Location', 'Matches', 'Win %']],
        body: locationRows.map((r) => [r.location, String(r.matchCount), r.winPercentageLabel]),
      });
      // @ts-expect-error -- doc.lastAutoTable is set at runtime by jspdf-autotable, with no official type augmentation
      y = doc.lastAutoTable.finalY + 8;

      const trendTable = (title: string, rows: ExportPeriodRow[]) => {
        ensureSpace(30);
        doc.setFontSize(12);
        doc.text(title, 14, y);
        y += 2;
        autoTable(doc, {
          startY: y + 4,
          head: [['Period', 'Win %', 'Trend', 'W', 'L']],
          body: rows.map((r) => [
            r.period,
            r.winPercentageLabel,
            r.trendLabel,
            String(r.gamesWon),
            String(r.gamesLost),
          ]),
        });
        // @ts-expect-error -- doc.lastAutoTable is set at runtime by jspdf-autotable, with no official type augmentation
        y = doc.lastAutoTable.finalY + 8;
      };

      trendTable('Weekly Trend', weeklyRows);
      trendTable('Monthly Trend', monthlyRows);
      trendTable('Yearly Trend', yearlyRows);

      ensureSpace(30);
      doc.setFontSize(12);
      doc.text('Head-to-Head', 14, y);
      y += 6;
      doc.setFontSize(10);
      doc.text(`Toughest opponent: ${toughestOpponentLabel}`, 14, y);
      y += 6;
      doc.text(`Best partner: ${bestPartnerLabel}`, 14, y);
      y += 10;

      ensureSpace(30);
      doc.setFontSize(12);
      doc.text('Match History', 14, y);
      y += 2;
      autoTable(doc, {
        startY: y + 4,
        head: [['Date', 'Partner', 'Opponents', 'Result', 'Score']],
        body: matchHistoryRows.map((r) => [
          r.date,
          r.partnerName,
          r.opponentsLabel,
          r.result,
          r.scoreLabel,
        ]),
      });

      const blob: Blob = doc.output('blob');
      const fileName = `${sanitizeFileNamePart(personName)}-stats.pdf`;
      const result = await shareOrDownloadPdf(blob, fileName, personName);
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
        {status === 'generating' ? 'Generating…' : '📤 Share Stats'}
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
