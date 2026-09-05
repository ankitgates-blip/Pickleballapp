'use client';

import { useRef, useState } from 'react';
import { shareOrDownloadFile, sanitizeFileNamePart } from '@/lib/pdf/pdfShare';
import { threatTierFor } from '@/lib/stats/threatLevel';
import ThreatShieldBadge from '@/app/components/ThreatShieldBadge';
import {
  NAVY_MID,
  NAVY_DEEP,
  NAVY_DARKER,
  NAVY_RULE,
  PLATE,
  PLATE_STROKE,
  ON_NAVY_PRIMARY,
  ON_NAVY_SECOND,
  ON_NAVY_MUTED,
  ON_NAVY_FAINT,
  GOLD_DEEP,
  GOLD_CORE,
  GOLD_LIGHT,
  SILVER_DEEP,
  SILVER_CORE,
  SILVER_LIGHT,
  BRONZE_DEEP,
  BRONZE_CORE,
  BRONZE_LIGHT,
  WIN_ON_NAVY,
  LOSS_ON_NAVY,
  LIVE_COLOR,
  medalStops,
} from '@/app/components/leaderboardPalette';
import { outlineButtonClass } from '@/app/components/ui';

export type RaceCardRow = {
  rank: number;
  name: string;
  matchWins: number;
  losses: number;
  leagueWins: number;
  // Total Points for this month (lib/stats/points.ts) -- the sole hero stat. 0 for a
  // pre-September month still ranked by the legacy formula, which has no real points
  // concept yet.
  totalPoints: number;
  // Drives the tier meter (pip dots + word) -- the player's overall, cross-venue
  // win%, same convention as LocationLeaderboardCard.
  overallWinPercentage: number | null;
};

export type RaceLeaderboardCardProps = {
  venueName: string;
  monthLabel: string; // e.g. "AUGUST 2026"
  generatedDateLabel: string;
  rows: RaceCardRow[];
};

const CARD_WIDTH = 760;
const PAD_X = 40;
const CONTENT_LEFT = PAD_X;
const CONTENT_RIGHT = CARD_WIDTH - PAD_X;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;

const HEADER_HEIGHT = 156; // taller than the Leaderboard twin's 140 -- room for the LIVE pill
const PODIUM_ROW_HEIGHT = 104;
const CUT_LINE_HEIGHT = 3;
const COL_HEADER_HEIGHT = 32;
const BODY_ROW_HEIGHT = 80;
const FOOTER_HEIGHT = 56;

// All-navy throughout -- see LocationLeaderboardCard.tsx for the full rationale
// (the organizer's explicit request, after the earlier two-tone "podium split"
// version, to make the whole card one consistent color instead of dark-top/
// light-bottom). These two cards are a twin family and must not visually diverge
// without a stated reason. The only intentional differences from the Leaderboard
// card are: the LIVE pill (this ranking is a live snapshot of an in-progress month,
// not a frozen period), the kicker text, and the footer's ranking-basis caption (a
// different formula).
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

export default function RaceLeaderboardShareCard({
  venueName,
  monthLabel,
  generatedDateLabel,
  rows,
}: RaceLeaderboardCardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [status, setStatus] = useState<'idle' | 'generating' | 'error'>('idle');

  // Split by RANK, not array position -- assignRanksWithTies gives every player tied
  // for a top-3 spot the same rank number (e.g. two people tied for 3rd both get
  // rank 3), and both must get the podium/medal treatment. Slicing the first 3 array
  // entries instead would strand the second tied player in the plain body-row list
  // even though they're genuinely 3rd place too.
  const podiumRows = rows.filter((r) => r.rank <= 3);
  const bodyRows = rows.filter((r) => r.rank > 3);
  const podiumHeight = podiumRows.length * PODIUM_ROW_HEIGHT;
  const hasColumnHeader = bodyRows.length > 0;
  const listHeight =
    podiumHeight +
    (podiumRows.length > 0 ? CUT_LINE_HEIGHT : 0) +
    (hasColumnHeader ? COL_HEADER_HEIGHT : 0) +
    bodyRows.length * BODY_ROW_HEIGHT;
  const totalHeight = HEADER_HEIGHT + listHeight + FOOTER_HEIGHT;
  const footerY = HEADER_HEIGHT + listHeight;
  const top3Names = podiumRows.map((r) => r.name).join(', ');

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

      // Every text element on this card uses Oswald now -- see
      // LocationLeaderboardCard.tsx for why embedding just this one font is enough
      // to make the exported PNG match what's shown on screen.
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

      const fileName = `${sanitizeFileNamePart(venueName)}-poty-race.png`;
      await shareOrDownloadFile(blob, fileName, `${venueName} Player of the Month Race`, 'image/png');
      setStatus('idle');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  return (
    <div>
      <div className="hidden" aria-hidden="true">
        <svg
          ref={svgRef}
          width={CARD_WIDTH}
          height={totalHeight}
          viewBox={`0 0 ${CARD_WIDTH} ${totalHeight}`}
          xmlns="http://www.w3.org/2000/svg"
          role="img"
        >
          <title>{`${venueName} Race to Player of the Month, ${monthLabel}`}</title>
          {top3Names && <desc>{`Currently leading: ${top3Names}`}</desc>}
          <defs>
            <linearGradient id="raceGold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={GOLD_DEEP} />
              <stop offset="50%" stopColor={GOLD_LIGHT} />
              <stop offset="100%" stopColor={GOLD_CORE} />
            </linearGradient>
            <linearGradient id="raceSilver" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={SILVER_DEEP} />
              <stop offset="50%" stopColor={SILVER_LIGHT} />
              <stop offset="100%" stopColor={SILVER_CORE} />
            </linearGradient>
            <linearGradient id="raceBronze" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={BRONZE_DEEP} />
              <stop offset="50%" stopColor={BRONZE_LIGHT} />
              <stop offset="100%" stopColor={BRONZE_CORE} />
            </linearGradient>
            <linearGradient id="raceNavy" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={NAVY_MID} />
              <stop offset="100%" stopColor={NAVY_DEEP} />
            </linearGradient>
            <linearGradient id="raceGoldRule" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={GOLD_DEEP} stopOpacity="0.3" />
              <stop offset="50%" stopColor={GOLD_LIGHT} />
              <stop offset="100%" stopColor={GOLD_DEEP} stopOpacity="0.3" />
            </linearGradient>
            <radialGradient id="raceGlow" cx="50%" cy="0%" r="80%">
              <stop offset="0%" stopColor={GOLD_LIGHT} stopOpacity="0.14" />
              <stop offset="100%" stopColor={GOLD_LIGHT} stopOpacity="0" />
            </radialGradient>
            <clipPath id="raceLogoClip">
              <circle cx={CONTENT_LEFT + 21} cy="46" r="21" />
            </clipPath>
            <clipPath id="raceCardClip">
              <rect x="0" y="0" width={CARD_WIDTH} height={totalHeight} rx="20" />
            </clipPath>
          </defs>

          <g clipPath="url(#raceCardClip)">
            <rect x="0" y="0" width={CARD_WIDTH} height={totalHeight} fill={NAVY_DEEP} />

            <image
              href="/header-dxb-skyline.webp"
              x="0"
              y="0"
              width={CARD_WIDTH}
              height={HEADER_HEIGHT}
              preserveAspectRatio="xMidYMid slice"
              opacity="0.55"
            />
            <rect x="0" y="0" width={CARD_WIDTH} height={HEADER_HEIGHT} fill="url(#raceNavy)" opacity="0.72" />
            <rect x="0" y="0" width={CARD_WIDTH} height={HEADER_HEIGHT + 20} fill="url(#raceGlow)" />

            <image
              href="/logo.png"
              x={CONTENT_LEFT}
              y="24"
              width="42"
              height="42"
              preserveAspectRatio="xMidYMid slice"
              clipPath="url(#raceLogoClip)"
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
              letterSpacing="2"
              fontFamily="var(--font-oswald), sans-serif"
            >
              RACE TO PLAYER OF THE MONTH
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

            {/* LIVE pill -- the one deliberate divergence from the Leaderboard twin:
                this ranking is a live snapshot of an in-progress month, not a frozen
                period. */}
            <rect x={CONTENT_LEFT} y="80" width="60" height="24" rx="12" fill={LIVE_COLOR} />
            <text
              x={CONTENT_LEFT + 30}
              y="96"
              fontSize="12"
              fontWeight="800"
              fill="#ffffff"
              textAnchor="middle"
              letterSpacing="1"
              fontFamily="var(--font-oswald), sans-serif"
            >
              LIVE
            </text>

            <text
              x={CONTENT_LEFT}
              y="138"
              fontSize="36"
              fontWeight="800"
              fill={ON_NAVY_PRIMARY}
              fontFamily="var(--font-oswald), sans-serif"
            >
              {venueName}
            </text>
            <text
              x={CONTENT_RIGHT}
              y="138"
              fontSize="15"
              fontWeight="700"
              fill={ON_NAVY_SECOND}
              textAnchor="end"
              letterSpacing="1.5"
              fontFamily="var(--font-oswald), sans-serif"
            >
              {monthLabel}
            </text>
            <rect x={CONTENT_LEFT} y={HEADER_HEIGHT - 2} width={CONTENT_WIDTH} height="2" fill="url(#raceGoldRule)" />

            {podiumRows.map((row, i) => {
              const y = HEADER_HEIGHT + i * PODIUM_ROW_HEIGHT;
              const medal = medalStops(row.rank);
              const tier = row.overallWinPercentage !== null ? threatTierFor(row.overallWinPercentage) : null;
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
                      fill={`url(#race${row.rank === 1 ? 'Gold' : row.rank === 2 ? 'Silver' : 'Bronze'})`}
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
                  {tier && (
                    <g transform={`translate(${CONTENT_LEFT + 74 + 68}, ${y + 55})`}>
                      <ThreatShieldBadge tier={tier} size={24} />
                    </g>
                  )}
                  {row.leagueWins > 0 && (
                    <text
                      x={CONTENT_LEFT + 74 + 68 + 24 + 12}
                      y={y + 76}
                      fontSize="14"
                      fontWeight="700"
                      fill={GOLD_LIGHT}
                      fontFamily="var(--font-oswald), sans-serif"
                    >
                      {`★ ${row.leagueWins}`}
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
              <rect x="0" y={HEADER_HEIGHT + podiumHeight} width={CARD_WIDTH} height={CUT_LINE_HEIGHT} fill="url(#raceGoldRule)" />
            )}

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

            {bodyRows.map((row, i) => {
              const y = HEADER_HEIGHT + podiumHeight + CUT_LINE_HEIGHT + COL_HEADER_HEIGHT + i * BODY_ROW_HEIGHT;
              const tier = row.overallWinPercentage !== null ? threatTierFor(row.overallWinPercentage) : null;
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
                  {tier && (
                    <g transform={`translate(${CONTENT_LEFT + 64 + 60}, ${y + 42})`}>
                      <ThreatShieldBadge tier={tier} size={18} />
                    </g>
                  )}
                  {/* Same boxed "TOTAL POINTS" treatment as the podium rows, just
                      sized for the shorter body row height -- every rank gets the
                      identical plate style, not just the top 3. */}
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
              y={footerY + 24}
              fontSize="12.5"
              fill={ON_NAVY_SECOND}
              textAnchor="middle"
              fontFamily="var(--font-oswald), sans-serif"
            >
              Ranked by 75% Total Points · 15% appearance · 10% league wins · 60% of the busiest player&apos;s matches to qualify
            </text>
            <text
              x={CARD_WIDTH / 2}
              y={footerY + 44}
              fontSize="12"
              fill={ON_NAVY_MUTED}
              textAnchor="middle"
              letterSpacing="2"
              fontFamily="var(--font-oswald), sans-serif"
            >
              PICKLERALLY DXB
            </text>
          </g>
          <rect x="1" y="1" width={CARD_WIDTH - 2} height={totalHeight - 2} rx="19" fill="none" stroke={GOLD_CORE} strokeOpacity="0.35" strokeWidth="1.5" />
        </svg>
      </div>
      <button type="button" onClick={handleDownload} disabled={status === 'generating'} className={outlineButtonClass}>
        {status === 'generating' ? 'Generating…' : `📤 Share ${venueName} Race`}
      </button>
      {status === 'error' && (
        <p className="text-xs text-red-600 mt-1.5">Couldn&apos;t generate the image. Try again.</p>
      )}
    </div>
  );
}
