'use client';

import { useState } from 'react';
import { outlineButtonClass } from '@/app/components/ui';
import { shareOrDownloadPdf, sanitizeFileNamePart } from '@/lib/pdf/pdfShare';
import type { ExportLocationRow, ExportMatchHistoryRow, ExportPeriodRow } from '@/lib/stats/personStatsExport';

type SharePlayerStatsButtonProps = {
  personName: string;
  nickname: string | null;
  photoUrl: string | null;
  lastPlayedDate: string | null;
  starLabel: string;
  handedness: string | null;
  age: number | null;
  playingStyle: string | null;
  paddleBrand: string | null;
  signatureShot: string[];
  strengths: string[];
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

async function loadPhotoDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export default function SharePlayerStatsButton({
  personName,
  nickname,
  photoUrl,
  lastPlayedDate,
  starLabel,
  handedness,
  age,
  playingStyle,
  paddleBrand,
  signatureShot,
  strengths,
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
      const [{ default: jsPDF }, { default: autoTable }, photoDataUrl] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
        photoUrl ? loadPhotoDataUrl(photoUrl) : Promise.resolve(null),
      ]);

      const doc = new jsPDF();
      let y = 16;

      if (photoDataUrl) {
        try {
          const format = photoDataUrl.startsWith('data:image/png')
            ? 'PNG'
            : photoDataUrl.startsWith('data:image/webp')
              ? 'WEBP'
              : 'JPEG';
          doc.addImage(photoDataUrl, format, 160, 10, 30, 30);
        } catch {
          // Malformed image data shouldn't break the rest of the export.
        }
      }

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
      doc.text(nickname ? `${personName} (${nickname})` : personName, 14, y);
      y += 7;

      doc.setFontSize(10);
      doc.text(
        [lastPlayedDate ? `Last played: ${lastPlayedDate}` : 'No matches played yet', starLabel].join(' · '),
        14,
        y
      );
      y += 8;

      const profileRows: [string, string][] = [
        handedness ? (['Handedness', handedness] as [string, string]) : null,
        age !== null ? (['Age', String(age)] as [string, string]) : null,
        playingStyle ? (['Playing Style', playingStyle] as [string, string]) : null,
        paddleBrand ? (['Paddle Brand', paddleBrand] as [string, string]) : null,
        signatureShot.length > 0 ? (['Signature Shot', signatureShot.join(', ')] as [string, string]) : null,
        strengths.length > 0 ? (['Strengths', strengths.join(', ')] as [string, string]) : null,
      ].filter((row): row is [string, string] => row !== null);

      for (const [label, value] of profileRows) {
        doc.text(`${label}: ${value}`, 14, y);
        y += 6;
      }

      y += 2;

      ensureSpace(20);
      doc.setFontSize(12);
      doc.text('This Month', 14, y);
      y += 6;
      doc.setFontSize(10);
      doc.text(
        `Games Won: ${thisMonthGamesWon}   Games Lost: ${thisMonthGamesLost}   Leagues Won: ${thisMonthTournamentsWon}`,
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
