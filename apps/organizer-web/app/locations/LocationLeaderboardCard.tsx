'use client';

import { useRef, useState } from 'react';
import { shareOrDownloadFile, sanitizeFileNamePart } from '@/lib/pdf/pdfShare';
import { threatTierFor } from '@/lib/stats/threatLevel';

export type LeaderboardCardRow = {
  rank: number;
  name: string;
  // Drives the tier meter (pip dots + word) -- the player's overall, cross-venue
  // win%, matching how ThreatBadge is driven elsewhere in the app. Never colors the
  // hero number -- that's a different stat (this period's Total Points) and coloring
  // it by tier previously implied a relationship that doesn't exist.
  overallWinPercentage: number | null;
  matchesPlayed: number;
  matchWins: number;
  losses: number;
  tournamentWins: number;
  // Total Points for this same period/venue (lib/stats/points.ts) -- 0 for anyone who
  // didn't play a points-eligible format (Custom League/League + Playoffs) this
  // period, not hidden. This is the sole hero number on the card.
  totalPoints: number;
};

export type LocationLeaderboardCardProps = {
  venueName: string;
  // e.g. "MONTH TO DATE" or "AUGUST 2026" -- which period this ranking covers, so a
  // downloaded/shared card is self-explanatory about its scope on its own, not just
  // in the app's own UI around it.
  periodLabel: string;
  generatedDateLabel: string;
  rows: LeaderboardCardRow[];
};

const CARD_WIDTH = 760;
const PAD_X = 40;
const CONTENT_LEFT = PAD_X;
const CONTENT_RIGHT = CARD_WIDTH - PAD_X;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;

const HEADER_HEIGHT = 140; // cropped shorter than the old 180 so the skyline photo actually shows through the wash
const PODIUM_ROW_HEIGHT = 104;
const CUT_LINE_HEIGHT = 3;
const COL_HEADER_HEIGHT = 32;
const BODY_ROW_HEIGHT = 80;
const FOOTER_HEIGHT = 56;
// Caps the image at a shareable size -- previously unbounded, so a busy venue could
// produce a multi-thousand-pixel-tall PNG that thumbnails to nothing in a WhatsApp chat.
const MAX_ROWS = 12;

// All-navy throughout, on the organizer's explicit request after seeing the earlier
// two-tone "podium split" version (navy top, ivory body) -- this reverses that
// version's light body back to the same navy ground as the podium, all the way down
// the card. Medals/foils, tier meter, and the other structural fixes from that pass
// (stepped name sizing, capped rows, Oswald-only text, ★ instead of an emoji, hero
// not tier-colored) are unchanged -- only the body's ground and text colors flip.
const NAVY_MID = '#16294e';
const NAVY_DEEP = '#0c1830';
const NAVY_DARKER = '#0a1730';
const NAVY_RULE = '#24406f';
const PLATE = '#081328';
const PLATE_STROKE = '#2c4a7d';
const ON_NAVY_PRIMARY = '#ffffff';
const ON_NAVY_SECOND = '#b8c8de';
const ON_NAVY_MUTED = '#8ea6c8';
const ON_NAVY_FAINT = '#5b7196';

const GOLD_DEEP = '#a8874f';
const GOLD_CORE = '#d6af36';
const GOLD_LIGHT = '#f7e6a8';
const SILVER_DEEP = '#7e8288';
const SILVER_CORE = '#a7a7ad';
const SILVER_LIGHT = '#e8eaed';
const BRONZE_DEEP = '#7a4b23';
const BRONZE_CORE = '#a77044';
const BRONZE_LIGHT = '#e0aa72';

const WIN_ON_NAVY = '#34d8bd';
const LOSS_ON_NAVY = '#ff8a80';

// Same 5 tiers as ThreatBadge/threatTierFor, expressed as a pip count (1-5) rather
// than 5 separate saturated hues -- tier becomes a countable meter instead of a
// color fight with the hero number for attention.
const TIER_PIPS: Record<string, { pips: number; word: string }> = {
  'LOW THREAT': { pips: 1, word: 'LOW' },
  'WATCH OUT': { pips: 2, word: 'WATCH' },
  DANGEROUS: { pips: 3, word: 'DANGER' },
  'HIGH THREAT': { pips: 4, word: 'HIGH' },
  'DO NOT PLAY': { pips: 5, word: 'AVOID' },
};

function medalStops(rank: number): { deep: string; core: string; light: string } | null {
  if (rank === 1) return { deep: GOLD_DEEP, core: GOLD_CORE, light: GOLD_LIGHT };
  if (rank === 2) return { deep: SILVER_DEEP, core: SILVER_CORE, light: SILVER_LIGHT };
  if (rank === 3) return { deep: BRONZE_DEEP, core: BRONZE_CORE, light: BRONZE_LIGHT };
  return null;
}

// Rough Oswald-bold-condensed average-character-width heuristic (fraction of the
// font size) -- not exact glyph metrics, but enough to replace the old textLength
// hack, which stretched a 21-character name to more than double its natural width.
// Steps the size down before ever resorting to truncation.
const AVG_CHAR_WIDTH_RATIO = 0.54;

function fitName(name: string, maxWidth: number, baseSize: number, minSize: number): { size: number; text: string } {
  let size = baseSize;
  while (size > minSize && name.length * size * AVG_CHAR_WIDTH_RATIO > maxWidth) {
    size -= 2;
  }
  const maxChars = Math.floor(maxWidth / (size * AVG_CHAR_WIDTH_RATIO));
  const text = name.length > maxChars ? `${name.slice(0, Math.max(1, maxChars - 1))}…` : name;
  return { size, text };
}

function TierMeter({ tier, x, y }: { tier: { pips: number; word: string } | null; x: number; y: number }) {
  if (!tier) return null;
  const pipGap = 10;
  return (
    <>
      {Array.from({ length: 5 }).map((_, p) => (
        <circle
          key={p}
          cx={x + p * pipGap}
          cy={y - 4}
          r="3"
          fill={p < tier.pips ? ON_NAVY_SECOND : 'none'}
          stroke={p < tier.pips ? 'none' : NAVY_RULE}
          strokeWidth="1"
        />
      ))}
      <text
        x={x + 5 * pipGap + 8}
        y={y}
        fontSize="14"
        fontWeight="700"
        fill={ON_NAVY_SECOND}
        fontFamily="var(--font-oswald), sans-serif"
      >
        {tier.word}
      </text>
    </>
  );
}

async function loadDataUrl(url: string): Promise<string | null> {
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

export default function LocationLeaderboardCard({
  venueName,
  periodLabel,
  generatedDateLabel,
  rows,
}: LocationLeaderboardCardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [status, setStatus] = useState<'idle' | 'generating' | 'error'>('idle');

  const shownRows = rows.slice(0, MAX_ROWS);
  const overflowCount = rows.length - shownRows.length;
  const podiumRows = shownRows.slice(0, Math.min(3, shownRows.length));
  const bodyRows = shownRows.slice(podiumRows.length);
  const podiumHeight = podiumRows.length * PODIUM_ROW_HEIGHT;
  const hasColumnHeader = bodyRows.length > 0;
  const listHeight =
    podiumHeight +
    (podiumRows.length > 0 ? CUT_LINE_HEIGHT : 0) +
    (hasColumnHeader ? COL_HEADER_HEIGHT : 0) +
    bodyRows.length * BODY_ROW_HEIGHT;
  const totalHeight = HEADER_HEIGHT + listHeight + FOOTER_HEIGHT;
  const footerY = HEADER_HEIGHT + listHeight;
  const top3Names = shownRows.slice(0, 3).map((r) => r.name).join(', ');

  const handleDownload = async () => {
    if (!svgRef.current) return;
    setStatus('generating');
    try {
      const exportSvg = svgRef.current.cloneNode(true) as SVGSVGElement;

      for (const imageEl of Array.from(exportSvg.querySelectorAll('image'))) {
        const href = imageEl.getAttribute('href');
        if (!href) continue;
        const dataUrl = await loadDataUrl(href);
        if (dataUrl) {
          imageEl.setAttribute('href', dataUrl);
        } else {
          imageEl.remove();
        }
      }

      // Every text element on this card uses Oswald now (no Geist references left),
      // so embedding this one font is enough to make the exported PNG match what's
      // shown on screen -- previously the byline/footer text silently fell back to
      // Arial/Helvetica in the export because Geist was never embedded here.
      const fontDataUrl = await loadDataUrl('/fonts/oswald-variable.ttf');
      if (fontDataUrl) {
        const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        styleEl.textContent = `@font-face{font-family:'Oswald Export';src:url(${fontDataUrl}) format('truetype');font-weight:200 900;}`;
        const defs = exportSvg.querySelector('defs');
        if (defs) defs.insertBefore(styleEl, defs.firstChild);
        exportSvg.style.setProperty('--font-oswald', "'Oswald Export'");
      }

      const svgString = new XMLSerializer().serializeToString(exportSvg);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to render card image'));
        img.src = svgUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = CARD_WIDTH * 2;
      canvas.height = totalHeight * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(svgUrl);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Failed to generate image');

      const fileName = `${sanitizeFileNamePart(venueName)}-leaderboard.png`;
      await shareOrDownloadFile(blob, fileName, `${venueName} Leaderboard`, 'image/png');
      setStatus('idle');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={status === 'generating'}
        className="block w-full cursor-pointer border-0 bg-transparent p-0"
        aria-label={`Download ${venueName} Leaderboard as an image`}
      >
        <svg
          ref={svgRef}
          width={CARD_WIDTH}
          height={totalHeight}
          viewBox={`0 0 ${CARD_WIDTH} ${totalHeight}`}
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto max-w-[760px] rounded-2xl"
          role="img"
        >
          <title>{`${venueName} leaderboard, ${periodLabel}`}</title>
          {top3Names && <desc>{`Top of the ranking: ${top3Names}`}</desc>}
          <defs>
            <linearGradient id="lbGold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={GOLD_DEEP} />
              <stop offset="50%" stopColor={GOLD_LIGHT} />
              <stop offset="100%" stopColor={GOLD_CORE} />
            </linearGradient>
            <linearGradient id="lbSilver" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={SILVER_DEEP} />
              <stop offset="50%" stopColor={SILVER_LIGHT} />
              <stop offset="100%" stopColor={SILVER_CORE} />
            </linearGradient>
            <linearGradient id="lbBronze" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={BRONZE_DEEP} />
              <stop offset="50%" stopColor={BRONZE_LIGHT} />
              <stop offset="100%" stopColor={BRONZE_CORE} />
            </linearGradient>
            <linearGradient id="lbNavy" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={NAVY_MID} />
              <stop offset="100%" stopColor={NAVY_DEEP} />
            </linearGradient>
            <linearGradient id="lbGoldRule" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={GOLD_DEEP} stopOpacity="0.3" />
              <stop offset="50%" stopColor={GOLD_LIGHT} />
              <stop offset="100%" stopColor={GOLD_DEEP} stopOpacity="0.3" />
            </linearGradient>
            <radialGradient id="lbGlow" cx="50%" cy="0%" r="80%">
              <stop offset="0%" stopColor={GOLD_LIGHT} stopOpacity="0.14" />
              <stop offset="100%" stopColor={GOLD_LIGHT} stopOpacity="0" />
            </radialGradient>
            <clipPath id="lbLogoClip">
              <circle cx={CONTENT_LEFT + 21} cy="46" r="21" />
            </clipPath>
            <clipPath id="lbCardClip">
              <rect x="0" y="0" width={CARD_WIDTH} height={totalHeight} rx="20" />
            </clipPath>
          </defs>

          <g clipPath="url(#lbCardClip)">
            <rect x="0" y="0" width={CARD_WIDTH} height={totalHeight} fill={NAVY_DEEP} />

            {/* Header: skyline photo cropped shorter with a lighter wash than before,
                so it's actually visible instead of reading as near-black. */}
            <image
              href="/header-dxb-skyline.webp"
              x="0"
              y="0"
              width={CARD_WIDTH}
              height={HEADER_HEIGHT}
              preserveAspectRatio="xMidYMid slice"
              opacity="0.55"
            />
            <rect x="0" y="0" width={CARD_WIDTH} height={HEADER_HEIGHT} fill="url(#lbNavy)" opacity="0.72" />
            <rect x="0" y="0" width={CARD_WIDTH} height={HEADER_HEIGHT + 20} fill="url(#lbGlow)" />

            <image
              href="/logo.png"
              x={CONTENT_LEFT}
              y="24"
              width="42"
              height="42"
              preserveAspectRatio="xMidYMid slice"
              clipPath="url(#lbLogoClip)"
            />
            <circle cx={CONTENT_LEFT + 21} cy="45" r="21" fill="none" stroke={GOLD_CORE} strokeOpacity="0.6" strokeWidth="1.5" />
            <text
              x={CONTENT_LEFT + 56}
              y="52"
              fontSize="20"
              fontWeight="700"
              fontStyle="italic"
              fill={GOLD_LIGHT}
              letterSpacing="1"
              fontFamily="var(--font-oswald), sans-serif"
            >
              PICKLERALLY DXB
            </text>

            <text
              x={CONTENT_RIGHT}
              y="46"
              fontSize="16"
              fontWeight="700"
              fill={GOLD_CORE}
              textAnchor="end"
              letterSpacing="3"
              fontFamily="var(--font-oswald), sans-serif"
            >
              LEADERBOARD
            </text>
            <text
              x={CONTENT_RIGHT}
              y="65"
              fontSize="12.5"
              fill={ON_NAVY_MUTED}
              textAnchor="end"
              fontFamily="var(--font-oswald), sans-serif"
            >
              Generated {generatedDateLabel}
            </text>

            <text
              x={CONTENT_LEFT}
              y="110"
              fontSize="36"
              fontWeight="800"
              fill={ON_NAVY_PRIMARY}
              fontFamily="var(--font-oswald), sans-serif"
            >
              {venueName}
            </text>
            <text
              x={CONTENT_RIGHT}
              y="110"
              fontSize="15"
              fontWeight="700"
              fill={ON_NAVY_SECOND}
              textAnchor="end"
              letterSpacing="1.5"
              fontFamily="var(--font-oswald), sans-serif"
            >
              {periodLabel}
            </text>
            <rect x={CONTENT_LEFT} y={HEADER_HEIGHT - 2} width={CONTENT_WIDTH} height="2" fill="url(#lbGoldRule)" />

            {/* Podium block -- top 3 array positions, on a slightly lighter navy than
                the body rows below so it still reads as its own "stage" even though
                the whole card is now one tone. */}
            {podiumRows.map((row, i) => {
              const y = HEADER_HEIGHT + i * PODIUM_ROW_HEIGHT;
              const medal = medalStops(row.rank);
              const tier = row.overallWinPercentage !== null ? threatTierFor(row.overallWinPercentage) : null;
              const tierMeter = tier ? TIER_PIPS[tier.label] ?? null : null;
              const { size: nameSize, text: nameText } = fitName(row.name, 380, 30, 20);
              return (
                <g key={i}>
                  <rect x="0" y={y} width={CARD_WIDTH} height={PODIUM_ROW_HEIGHT} fill="#17284c" />
                  {medal && <rect x="0" y={y} width="6" height={PODIUM_ROW_HEIGHT} fill={medal.core} />}
                  {i > 0 && <line x1={CONTENT_LEFT} y1={y} x2={CONTENT_RIGHT} y2={y} stroke={NAVY_RULE} />}

                  {medal && (
                    <circle
                      cx={CONTENT_LEFT + 30}
                      cy={y + 52}
                      r="28"
                      fill={`url(#lb${row.rank === 1 ? 'Gold' : row.rank === 2 ? 'Silver' : 'Bronze'})`}
                      stroke={medal.deep}
                      strokeWidth="2"
                    />
                  )}
                  {row.rank === 1 && (
                    <text x={CONTENT_LEFT + 30} y={y + 16} fontSize="15" textAnchor="middle">★</text>
                  )}
                  <text
                    x={CONTENT_LEFT + 30}
                    y={y + 61}
                    fontSize="26"
                    fontWeight="800"
                    fill={NAVY_DEEP}
                    textAnchor="middle"
                    fontFamily="var(--font-oswald), sans-serif"
                  >
                    {row.rank}
                  </text>

                  <text
                    x={CONTENT_LEFT + 74}
                    y={y + 46}
                    fontSize={nameSize}
                    fontWeight="700"
                    fill={ON_NAVY_PRIMARY}
                    fontFamily="var(--font-oswald), sans-serif"
                  >
                    {nameText}
                  </text>
                  <text x={CONTENT_LEFT + 74} y={y + 76} fontSize="15" fontFamily="var(--font-oswald), sans-serif">
                    <tspan fill={WIN_ON_NAVY} fontWeight="700">{row.matchWins}W</tspan>
                    <tspan fill={ON_NAVY_SECOND}>–</tspan>
                    <tspan fill={LOSS_ON_NAVY} fontWeight="700">{row.losses}L</tspan>
                  </text>
                  <TierMeter tier={tierMeter} x={CONTENT_LEFT + 74 + 68} y={y + 76} />
                  {row.tournamentWins > 0 && (
                    <text
                      x={CONTENT_LEFT + 74 + 68 + 5 * 10 + 8 + (tierMeter?.word.length ?? 4) * 9 + 16}
                      y={y + 76}
                      fontSize="14"
                      fontWeight="700"
                      fill={GOLD_LIGHT}
                      fontFamily="var(--font-oswald), sans-serif"
                    >
                      {`★ ${row.tournamentWins}`}
                    </text>
                  )}

                  <rect x={CONTENT_RIGHT - 172} y={y + 20} width="172" height="64" rx="10" fill={PLATE} stroke={PLATE_STROKE} />
                  <text
                    x={CONTENT_RIGHT - 86}
                    y={y + 38}
                    fontSize="11"
                    fontWeight="700"
                    fill={ON_NAVY_MUTED}
                    textAnchor="middle"
                    letterSpacing="2"
                    fontFamily="var(--font-oswald), sans-serif"
                  >
                    TOTAL POINTS
                  </text>
                  <text
                    x={CONTENT_RIGHT - 86}
                    y={y + 72}
                    fontSize="34"
                    fontWeight="900"
                    fill={ON_NAVY_PRIMARY}
                    textAnchor="middle"
                    fontFamily="var(--font-oswald), sans-serif"
                  >
                    {row.totalPoints}
                  </text>
                </g>
              );
            })}

            {podiumRows.length > 0 && (
              <rect x="0" y={HEADER_HEIGHT + podiumHeight} width={CARD_WIDTH} height={CUT_LINE_HEIGHT} fill="url(#lbGoldRule)" />
            )}

            {/* Column header strip -- states the PTS unit once instead of on every row. */}
            {hasColumnHeader && (
              <>
                <rect
                  x="0"
                  y={HEADER_HEIGHT + podiumHeight + CUT_LINE_HEIGHT}
                  width={CARD_WIDTH}
                  height={COL_HEADER_HEIGHT}
                  fill={NAVY_DARKER}
                />
                <line
                  x1="0"
                  y1={HEADER_HEIGHT + podiumHeight + CUT_LINE_HEIGHT + COL_HEADER_HEIGHT}
                  x2={CARD_WIDTH}
                  y2={HEADER_HEIGHT + podiumHeight + CUT_LINE_HEIGHT + COL_HEADER_HEIGHT}
                  stroke={NAVY_RULE}
                />
                <text
                  x={CONTENT_LEFT}
                  y={HEADER_HEIGHT + podiumHeight + CUT_LINE_HEIGHT + 21}
                  fontSize="10.5"
                  fontWeight="700"
                  fill={ON_NAVY_MUTED}
                  letterSpacing="2"
                  fontFamily="var(--font-oswald), sans-serif"
                >
                  POS
                </text>
                <text
                  x={CONTENT_LEFT + 64}
                  y={HEADER_HEIGHT + podiumHeight + CUT_LINE_HEIGHT + 21}
                  fontSize="10.5"
                  fontWeight="700"
                  fill={ON_NAVY_MUTED}
                  letterSpacing="2"
                  fontFamily="var(--font-oswald), sans-serif"
                >
                  PLAYER
                </text>
                <text
                  x={CONTENT_RIGHT}
                  y={HEADER_HEIGHT + podiumHeight + CUT_LINE_HEIGHT + 21}
                  fontSize="10.5"
                  fontWeight="700"
                  fill={ON_NAVY_MUTED}
                  textAnchor="end"
                  letterSpacing="2"
                  fontFamily="var(--font-oswald), sans-serif"
                >
                  PTS
                </text>
              </>
            )}

            {/* Body rows (rank 4+, or beyond) -- bare rank numeral, no medal circle,
                so the podium discs stay the special thing. Zebra striping (two navy
                shades) does the visual separation instead of a hairline per row. */}
            {bodyRows.map((row, i) => {
              const y = HEADER_HEIGHT + podiumHeight + CUT_LINE_HEIGHT + COL_HEADER_HEIGHT + i * BODY_ROW_HEIGHT;
              const tier = row.overallWinPercentage !== null ? threatTierFor(row.overallWinPercentage) : null;
              const tierMeter = tier ? TIER_PIPS[tier.label] ?? null : null;
              const { size: nameSize, text: nameText } = fitName(row.name, 400, 26, 18);
              return (
                <g key={i}>
                  <rect x="0" y={y} width={CARD_WIDTH} height={BODY_ROW_HEIGHT} fill={i % 2 === 0 ? NAVY_DEEP : NAVY_DARKER} />
                  <text
                    x={CONTENT_LEFT + 20}
                    y={y + 50}
                    fontSize="26"
                    fontWeight="800"
                    fill={ON_NAVY_FAINT}
                    textAnchor="middle"
                    fontFamily="var(--font-oswald), sans-serif"
                  >
                    {row.rank}
                  </text>
                  <text
                    x={CONTENT_LEFT + 64}
                    y={y + 38}
                    fontSize={nameSize}
                    fontWeight="700"
                    fill={ON_NAVY_PRIMARY}
                    fontFamily="var(--font-oswald), sans-serif"
                  >
                    {nameText}
                  </text>
                  <text x={CONTENT_LEFT + 64} y={y + 64} fontSize="13.5" fontFamily="var(--font-oswald), sans-serif">
                    <tspan fill={WIN_ON_NAVY} fontWeight="700">{row.matchWins}W</tspan>
                    <tspan fill={ON_NAVY_SECOND}>–</tspan>
                    <tspan fill={LOSS_ON_NAVY} fontWeight="700">{row.losses}L</tspan>
                  </text>
                  <TierMeter tier={tierMeter} x={CONTENT_LEFT + 64 + 60} y={y + 64} />
                  {/* Same boxed "TOTAL POINTS" treatment as the podium rows, just
                      sized for the shorter body row height -- every rank gets the
                      identical plate style, not just the top 3. Muted when zero so a
                      legitimate zero doesn't shout, never hidden. */}
                  <rect x={CONTENT_RIGHT - 150} y={y + 15} width="150" height="50" rx="8" fill={PLATE} stroke={PLATE_STROKE} />
                  <text
                    x={CONTENT_RIGHT - 75}
                    y={y + 30}
                    fontSize="9.5"
                    fontWeight="700"
                    fill={ON_NAVY_MUTED}
                    textAnchor="middle"
                    letterSpacing="1.5"
                    fontFamily="var(--font-oswald), sans-serif"
                  >
                    TOTAL POINTS
                  </text>
                  <text
                    x={CONTENT_RIGHT - 75}
                    y={y + 57}
                    fontSize="26"
                    fontWeight="900"
                    fill={row.totalPoints > 0 ? ON_NAVY_PRIMARY : ON_NAVY_FAINT}
                    textAnchor="middle"
                    fontFamily="var(--font-oswald), sans-serif"
                  >
                    {row.totalPoints}
                  </text>
                </g>
              );
            })}

            <line x1="0" y1={footerY} x2={CARD_WIDTH} y2={footerY} stroke={NAVY_RULE} />
            <text
              x={CARD_WIDTH / 2}
              y={footerY + 22}
              fontSize="12.5"
              fill={ON_NAVY_SECOND}
              textAnchor="middle"
              fontFamily="var(--font-oswald), sans-serif"
            >
              Ranked by league wins (60%) + match wins (40%) · PTS = Total Points this period
            </text>
            {overflowCount > 0 && (
              <text
                x={CARD_WIDTH / 2}
                y={footerY + 40}
                fontSize="12"
                fill={ON_NAVY_MUTED}
                textAnchor="middle"
                fontFamily="var(--font-oswald), sans-serif"
              >
                {`+${overflowCount} more player${overflowCount === 1 ? '' : 's'} ranked at ${venueName}`}
              </text>
            )}
          </g>
          <rect x="1" y="1" width={CARD_WIDTH - 2} height={totalHeight - 2} rx="19" fill="none" stroke={GOLD_CORE} strokeOpacity="0.35" strokeWidth="1.5" />
        </svg>
      </button>
      <p className="text-xs text-muted mt-1.5">Click the card to share or download it as an image.</p>
      {status === 'error' && (
        <p className="text-xs text-red-600 mt-1">Couldn&apos;t generate the image. Try again.</p>
      )}
    </div>
  );
}
