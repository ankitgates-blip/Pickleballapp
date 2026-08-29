'use client';

import { useRef, useState } from 'react';
import { shareOrDownloadFile, sanitizeFileNamePart } from '@/lib/pdf/pdfShare';
import { threatTierFor } from '@/lib/stats/threatLevel';

export type RaceCardRow = {
  rank: number;
  name: string;
  // The hero number -- rankMonthlyCandidates' weighted composite (50% league wins +
  // 30% match wins + 20% win%), scaled to 0-100. Deliberately not raw win% or match
  // wins: the row order is driven by this score, so it has to be the number shown
  // biggest, or the rank order would visibly contradict the displayed stat.
  raceScore: number;
  matchWins: number;
  leagueWins: number;
  // Month-scoped, byline only (see raceScore above for why this isn't the hero stat).
  winPercentage: number;
  // Drives the tier chip -- the player's overall, cross-venue win%, same convention
  // as LocationLeaderboardCard's chip (a different lens than the month-local stats).
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

const HEADER_HEIGHT = 148;
const ROW_HEIGHT = 72;
const SECTION_GAP = 28;
const FOOTER_HEIGHT = 58;

const GOLD_BRIGHT = '#d6af36';
const GOLD_HIGHLIGHT = '#fde68a';
const GOLD_CHROME = '#a8874f';
const SILVER = '#a7a7ad';
const BRONZE = '#a77044';
const NAVY_DEEP = '#0c1830';
const NAVY_MID = '#16294e';
const NAVY_LIGHT = '#1c3560';
const MUTED_SILVER = '#94a3b8';

function medalFill(rank: number): string | null {
  if (rank === 1) return 'url(#raceGoldMedal)';
  if (rank === 2) return SILVER;
  if (rank === 3) return BRONZE;
  return null;
}

// Pastel tones tuned for text/chips on a dark ground (as opposed to
// LocationLeaderboardCard's saturated "accent" tones, which are tuned for text on a
// light ground) -- same 5 tiers as ThreatBadge/threatTierFor.
const THREAT_CHIP: Record<string, { short: string; color: string; width: number }> = {
  'LOW THREAT': { short: 'LOW', color: '#86efac', width: 68 },
  'WATCH OUT': { short: 'WATCH', color: '#fde047', width: 84 },
  DANGEROUS: { short: 'DANGER', color: '#fdba74', width: 96 },
  'HIGH THREAT': { short: 'HIGH', color: '#fca5a5', width: 74 },
  'DO NOT PLAY': { short: 'AVOID', color: '#f0abfc', width: 84 },
};

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

export default function RaceLeaderboardCard({
  venueName,
  monthLabel,
  generatedDateLabel,
  rows,
}: RaceLeaderboardCardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [status, setStatus] = useState<'idle' | 'generating' | 'error'>('idle');

  const totalHeight = HEADER_HEIGHT + rows.length * ROW_HEIGHT + SECTION_GAP + FOOTER_HEIGHT;
  const footerY = HEADER_HEIGHT + rows.length * ROW_HEIGHT + SECTION_GAP;

  const handleDownload = async () => {
    if (!svgRef.current) return;
    setStatus('generating');
    try {
      const exportSvg = svgRef.current.cloneNode(true) as SVGSVGElement;

      const imageEl = exportSvg.querySelector('image');
      if (imageEl) {
        const logoDataUrl = await loadDataUrl('/logo.png');
        if (logoDataUrl) {
          imageEl.setAttribute('href', logoDataUrl);
        } else {
          imageEl.remove();
        }
      }

      // See ChampionCard.tsx / LocationLeaderboardCard.tsx for why both of these are
      // necessary: an isolated standalone-SVG render never sees the page's next/font
      // stylesheet, so an unresolved var(--font-oswald)/var(--font-geist-sans) would
      // invalidate the whole font-family declaration and silently fall back to the
      // browser's serif default rather than just skipping to "sans-serif".
      const fontDataUrl = await loadDataUrl('/fonts/oswald-variable.ttf');
      if (fontDataUrl) {
        const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        styleEl.textContent = `@font-face{font-family:'Oswald Export';src:url(${fontDataUrl}) format('truetype');font-weight:200 900;}`;
        const defs = exportSvg.querySelector('defs');
        if (defs) defs.insertBefore(styleEl, defs.firstChild);
        exportSvg.style.setProperty('--font-oswald', "'Oswald Export'");
      }
      exportSvg.style.setProperty('--font-geist-sans', 'sans-serif');

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
      <button
        type="button"
        onClick={handleDownload}
        disabled={status === 'generating'}
        className="block w-full cursor-pointer border-0 bg-transparent p-0"
        aria-label={`Download ${venueName} Player of the Month Race as an image`}
      >
        <svg
          ref={svgRef}
          width={CARD_WIDTH}
          height={totalHeight}
          viewBox={`0 0 ${CARD_WIDTH} ${totalHeight}`}
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto max-w-[760px] rounded-2xl"
        >
          <defs>
            <linearGradient id="raceBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={NAVY_LIGHT} />
              <stop offset="45%" stopColor={NAVY_MID} />
              <stop offset="100%" stopColor={NAVY_DEEP} />
            </linearGradient>
            <linearGradient id="raceGoldMedal" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={GOLD_BRIGHT} />
              <stop offset="50%" stopColor={GOLD_HIGHLIGHT} />
              <stop offset="100%" stopColor={GOLD_BRIGHT} />
            </linearGradient>
            <linearGradient id="raceDivider" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={GOLD_CHROME} stopOpacity="0" />
              <stop offset="50%" stopColor={GOLD_BRIGHT} stopOpacity="0.9" />
              <stop offset="100%" stopColor={GOLD_CHROME} stopOpacity="0" />
            </linearGradient>
            <radialGradient id="raceGlow" cx="50%" cy="0%" r="70%">
              <stop offset="0%" stopColor={GOLD_HIGHLIGHT} stopOpacity="0.22" />
              <stop offset="100%" stopColor={GOLD_HIGHLIGHT} stopOpacity="0" />
            </radialGradient>
            <pattern id="raceTexture" width="14" height="14" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.5" fill="#ffffff" fillOpacity="0.05" />
            </pattern>
            <clipPath id="raceLogoClip">
              <circle cx={CONTENT_LEFT + 21} cy="46" r="21" />
            </clipPath>
            <clipPath id="raceCardClip">
              <rect x="0" y="0" width={CARD_WIDTH} height={totalHeight} rx="20" />
            </clipPath>
          </defs>

          <g clipPath="url(#raceCardClip)">
            <rect x="0" y="0" width={CARD_WIDTH} height={totalHeight} fill="url(#raceBg)" />
            <rect x="0" y="0" width={CARD_WIDTH} height={totalHeight} fill="url(#raceTexture)" />
            <rect x="0" y="0" width={CARD_WIDTH} height={HEADER_HEIGHT + 30} fill="url(#raceGlow)" />

            {/* Header: logo + wordmark, venue name, kicker, month + generated-on stamp */}
            <image
              href="/logo.png"
              x={CONTENT_LEFT}
              y="25"
              width="42"
              height="42"
              preserveAspectRatio="xMidYMid slice"
              clipPath="url(#raceLogoClip)"
            />
            <circle
              cx={CONTENT_LEFT + 21}
              cy="46"
              r="21"
              fill="none"
              stroke={GOLD_BRIGHT}
              strokeOpacity="0.6"
              strokeWidth="1.5"
            />
            <text
              x={CONTENT_LEFT + 56}
              y="54"
              fontSize="21"
              fontWeight="700"
              fontStyle="italic"
              fill={GOLD_HIGHLIGHT}
              letterSpacing="1"
              fontFamily="var(--font-oswald), sans-serif"
            >
              PICKLERALLY DXB
            </text>

            <text
              x={CONTENT_RIGHT}
              y="46"
              fontSize="26"
              fontWeight="800"
              fill="#f8fafc"
              textAnchor="end"
              fontFamily="var(--font-oswald), sans-serif"
            >
              {venueName}
            </text>
            <text
              x={CONTENT_RIGHT}
              y="66"
              fontSize="13"
              fontWeight="700"
              fill={GOLD_BRIGHT}
              textAnchor="end"
              letterSpacing="1.5"
              fontFamily="var(--font-oswald), sans-serif"
            >
              RACE TO PLAYER OF THE MONTH
            </text>
            <text
              x={CONTENT_RIGHT}
              y="84"
              fontSize="11.5"
              fill={MUTED_SILVER}
              textAnchor="end"
              fontFamily="var(--font-geist-sans), sans-serif"
            >
              {monthLabel} · Generated {generatedDateLabel}
            </text>
            <rect
              x={CONTENT_LEFT}
              y={HEADER_HEIGHT - 2}
              width={CONTENT_WIDTH}
              height="2"
              fill="url(#raceDivider)"
            />

            {rows.map((row, i) => {
              const rowY = HEADER_HEIGHT + i * ROW_HEIGHT;
              const line1Y = rowY + 30;
              const line2Y = rowY + 58;
              const medal = medalFill(row.rank);
              const tier =
                row.overallWinPercentage !== null ? threatTierFor(row.overallWinPercentage) : null;
              const chip = tier ? THREAT_CHIP[tier.label] : null;
              const heroColor = chip ? chip.color : MUTED_SILVER;

              return (
                <g key={row.rank}>
                  {i > 0 && (
                    <line
                      x1={CONTENT_LEFT}
                      y1={rowY}
                      x2={CONTENT_RIGHT}
                      y2={rowY}
                      stroke="#ffffff"
                      strokeOpacity="0.08"
                    />
                  )}

                  {medal ? (
                    <circle cx={CONTENT_LEFT + 16} cy={line1Y - 6} r="16" fill={medal} />
                  ) : (
                    <circle
                      cx={CONTENT_LEFT + 16}
                      cy={line1Y - 6}
                      r="16"
                      fill="none"
                      stroke={MUTED_SILVER}
                      strokeOpacity="0.5"
                      strokeWidth="1.5"
                    />
                  )}
                  <text
                    x={CONTENT_LEFT + 16}
                    y={line1Y - 1}
                    fontSize="15"
                    fontWeight="800"
                    fill={medal ? NAVY_DEEP : MUTED_SILVER}
                    textAnchor="middle"
                    fontFamily="var(--font-oswald), sans-serif"
                  >
                    {row.rank}
                  </text>

                  <text
                    x={CONTENT_LEFT + 46}
                    y={line1Y}
                    fontSize="23"
                    fontWeight="800"
                    fill="#f8fafc"
                    fontFamily="var(--font-oswald), sans-serif"
                    {...(row.name.length > 20
                      ? { textLength: CONTENT_WIDTH - 195, lengthAdjust: 'spacingAndGlyphs' }
                      : {})}
                  >
                    {row.name}
                  </text>
                  <text
                    x={CONTENT_RIGHT}
                    y={line1Y + 3}
                    fontSize="32"
                    fontWeight="900"
                    fill={heroColor}
                    textAnchor="end"
                    fontFamily="var(--font-oswald), sans-serif"
                  >
                    {row.winPercentage}%
                  </text>

                  {chip && (
                    <>
                      <rect
                        x={CONTENT_LEFT + 46}
                        y={line2Y - 14}
                        width={chip.width}
                        height="19"
                        rx="9.5"
                        fill={chip.color}
                        fillOpacity="0.18"
                        stroke={chip.color}
                        strokeOpacity="0.5"
                      />
                      <text
                        x={CONTENT_LEFT + 46 + chip.width / 2}
                        y={line2Y}
                        fontSize="12"
                        fontWeight="800"
                        fill={chip.color}
                        textAnchor="middle"
                        letterSpacing="0.5"
                        fontFamily="var(--font-oswald), sans-serif"
                      >
                        {chip.short}
                      </text>
                    </>
                  )}
                  <text
                    x={CONTENT_LEFT + 46 + (chip ? chip.width + 12 : 0)}
                    y={line2Y}
                    fontSize="15"
                    fill={MUTED_SILVER}
                    fontFamily="var(--font-geist-sans), sans-serif"
                  >
                    {row.matchWins} wins
                    {row.leagueWins > 0 ? ` · 🏆×${row.leagueWins}` : ''}
                    {' · '}Race Score {row.raceScore}
                  </text>
                </g>
              );
            })}

            <text
              x={CARD_WIDTH / 2}
              y={footerY + 20}
              fontSize="11"
              fill={MUTED_SILVER}
              textAnchor="middle"
              fontFamily="var(--font-geist-sans), sans-serif"
            >
              Ranked by 50% league wins · 30% match wins · 20% win rate · 3+ matches to qualify
            </text>
            <text
              x={CARD_WIDTH / 2}
              y={footerY + 42}
              fontSize="12"
              fill={MUTED_SILVER}
              fillOpacity="0.8"
              textAnchor="middle"
              letterSpacing="1.5"
              fontFamily="var(--font-oswald), sans-serif"
            >
              PICKLERALLY DXB
            </text>
          </g>
          <rect
            x="1"
            y="1"
            width={CARD_WIDTH - 2}
            height={totalHeight - 2}
            rx="19"
            fill="none"
            stroke={GOLD_BRIGHT}
            strokeOpacity="0.35"
          />
        </svg>
      </button>
      <p className="text-xs text-muted mt-1.5">Click the card to share or download it as an image.</p>
      {status === 'error' && (
        <p className="text-xs text-red-600 mt-1">Couldn&apos;t generate the image. Try again.</p>
      )}
    </div>
  );
}
