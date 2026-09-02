'use client';

import { useRef, useState } from 'react';
import { shareOrDownloadFile, sanitizeFileNamePart } from '@/lib/pdf/pdfShare';
import { threatTierFor } from '@/lib/stats/threatLevel';

export type LeaderboardCardRow = {
  rank: number;
  name: string;
  // Hero number on line 1 -- this venue's own win% (not cross-venue), shown next to
  // totalPoints rather than as the sole hero stat (see totalPoints below).
  venueWinPercentage: number | null;
  // Drives the tier chip on line 2 -- the player's overall, cross-venue win%,
  // matching how ThreatBadge is driven elsewhere in the app.
  overallWinPercentage: number | null;
  matchesPlayed: number;
  matchWins: number;
  losses: number;
  tournamentWins: number;
  // Total Points for this same period/venue (lib/stats/points.ts) -- 0 for anyone who
  // didn't play a points-eligible format (Custom League/League + Playoffs) this
  // period, not hidden. This card is now the single leaderboard (no separate Total
  // Points section), so this is the primary hero number, with venueWinPercentage
  // shown right beside it as context.
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

const HEADER_HEIGHT = 180;
const ROW_HEIGHT = 72;
const SECTION_GAP = 28;
const FOOTER_HEIGHT = 40;

const GOLD_BRIGHT = '#d6af36';
const GOLD_CHROME = '#a8874f';
const SILVER = '#a7a7ad';
const BRONZE = '#a77044';
const NAVY_DEEP = '#0c1830';
// A single light card throughout (no navy block) -- navy/gold are used only as text
// and accent color. Reworked from an earlier all-navy version after user feedback
// that it read as "too dark"; see the sports-ux-designer research this was built
// from for why a dense ranked list benefits from a light ground while a single-hero
// celebratory card (ChampionCard/PlayerStatsCard) does not.
const BODY_BG = '#f8fafc';
const BODY_BORDER = '#e2e8f0';
const MUTED_TEXT = '#64748b';

function medalFill(rank: number): string | null {
  if (rank === 1) return 'url(#lbGoldMedal)';
  if (rank === 2) return SILVER;
  if (rank === 3) return BRONZE;
  return null;
}

// Solid (non-gradient) medal color, for the top-3 row wash/accent bar -- the
// gradient reference above is for the small circle badge specifically.
function medalHex(rank: number): string | null {
  if (rank === 1) return GOLD_BRIGHT;
  if (rank === 2) return SILVER;
  if (rank === 3) return BRONZE;
  return null;
}

// Same 5 tiers as ThreatBadge/threatTierFor: a one-word label (the actual signal)
// plus the tier's own color (reinforcement, not the only channel). On this light
// ground, the saturated "accent" tone (the same one PlayerStatsCard.THREAT_PALETTE
// uses for on-light surfaces) carries the hero-stat/chip text, and its paler "light"
// partner becomes the chip's fill tint.
const THREAT_CHIP: Record<string, { short: string; accent: string; light: string; width: number }> = {
  'LOW THREAT': { short: 'LOW', accent: '#16a34a', light: '#86efac', width: 74 },
  'WATCH OUT': { short: 'WATCH', accent: '#ca8a04', light: '#fde047', width: 90 },
  DANGEROUS: { short: 'DANGER', accent: '#ea580c', light: '#fdba74', width: 102 },
  'HIGH THREAT': { short: 'HIGH', accent: '#dc2626', light: '#fca5a5', width: 80 },
  'DO NOT PLAY': { short: 'AVOID', accent: '#c026d3', light: '#f0abfc', width: 90 },
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

export default function LocationLeaderboardCard({
  venueName,
  periodLabel,
  generatedDateLabel,
  rows,
}: LocationLeaderboardCardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [status, setStatus] = useState<'idle' | 'generating' | 'error'>('idle');

  const totalHeight = HEADER_HEIGHT + rows.length * ROW_HEIGHT + SECTION_GAP + FOOTER_HEIGHT;
  const footerY = HEADER_HEIGHT + rows.length * ROW_HEIGHT + SECTION_GAP;

  const handleDownload = async () => {
    if (!svgRef.current) return;
    setStatus('generating');
    try {
      const exportSvg = svgRef.current.cloneNode(true) as SVGSVGElement;

      // Two <image> elements now: the skyline banner photo and the circular logo --
      // inline each by its own original href so neither clobbers the other.
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

      // See ChampionCard.tsx for why both of these are necessary: an isolated
      // standalone-SVG render never sees the page's next/font stylesheet, so an
      // unresolved var(--font-oswald)/var(--font-geist-sans) would invalidate the
      // whole font-family declaration and silently fall back to the browser's serif
      // default rather than just skipping to "sans-serif".
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
        >
          <defs>
            <linearGradient id="lbGoldMedal" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={GOLD_BRIGHT} />
              <stop offset="50%" stopColor="#fde68a" />
              <stop offset="100%" stopColor={GOLD_BRIGHT} />
            </linearGradient>
            <clipPath id="lbLogoClip">
              <circle cx={CONTENT_LEFT + 21} cy="46" r="21" />
            </clipPath>
            <clipPath id="lbCardClip">
              <rect x="0" y="0" width={CARD_WIDTH} height={totalHeight} rx="20" />
            </clipPath>
            <linearGradient id="lbHeaderWash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1c3560" stopOpacity="0.55" />
              <stop offset="55%" stopColor="#16294e" stopOpacity="0.72" />
              <stop offset="100%" stopColor="#0c1830" stopOpacity="0.92" />
            </linearGradient>
          </defs>

          <g clipPath="url(#lbCardClip)">
            <rect x="0" y="0" width={CARD_WIDTH} height={totalHeight} fill={BODY_BG} />

            {/* Header: same real Dubai skyline banner as the app's own header, so the
                shareable card carries the same identity -- logo + wordmark, venue name,
                kicker, generated-on stamp all sit on the dark photo band; row content
                below returns to the card's light body. */}
            <image
              href="/header-dxb-skyline.webp"
              x="0"
              y="0"
              width={CARD_WIDTH}
              height={HEADER_HEIGHT}
              preserveAspectRatio="xMidYMid slice"
            />
            <rect x="0" y="0" width={CARD_WIDTH} height={HEADER_HEIGHT} fill="url(#lbHeaderWash)" />
            <image
              href="/logo.png"
              x={CONTENT_LEFT}
              y="25"
              width="42"
              height="42"
              preserveAspectRatio="xMidYMid slice"
              clipPath="url(#lbLogoClip)"
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
              fill="#fde68a"
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
              letterSpacing="2.5"
              fontFamily="var(--font-oswald), sans-serif"
            >
              {`LEADERBOARD · ${periodLabel}`}
            </text>
            <text
              x={CONTENT_RIGHT}
              y="84"
              fontSize="11.5"
              fill="#94a3b8"
              textAnchor="end"
              fontFamily="var(--font-geist-sans), sans-serif"
            >
              Generated {generatedDateLabel}
            </text>
            <line
              x1={CONTENT_LEFT}
              y1={HEADER_HEIGHT - 1}
              x2={CONTENT_RIGHT}
              y2={HEADER_HEIGHT - 1}
              stroke={GOLD_BRIGHT}
              strokeOpacity="0.5"
              strokeWidth="1.5"
            />

            {rows.map((row, i) => {
              const rowY = HEADER_HEIGHT + i * ROW_HEIGHT;
              const line1Y = rowY + 30;
              const line2Y = rowY + 58;
              const medal = medalFill(row.rank);
              const medalColor = medalHex(row.rank);
              const tier =
                row.overallWinPercentage !== null ? threatTierFor(row.overallWinPercentage) : null;
              const chip = tier ? THREAT_CHIP[tier.label] : null;
              const heroColor =
                row.venueWinPercentage !== null && tier ? THREAT_CHIP[tier.label].accent : MUTED_TEXT;

              return (
                <g key={row.rank}>
                  {medalColor && (
                    <>
                      <rect
                        x={CONTENT_LEFT - 10}
                        y={rowY}
                        width={CONTENT_WIDTH + 20}
                        height={ROW_HEIGHT}
                        fill={medalColor}
                        fillOpacity="0.16"
                      />
                      <rect x={CONTENT_LEFT - 10} y={rowY} width="5" height={ROW_HEIGHT} fill={medalColor} />
                    </>
                  )}
                  {i > 0 &&
                    (row.rank === 4 ? (
                      <line
                        x1={CONTENT_LEFT}
                        y1={rowY}
                        x2={CONTENT_RIGHT}
                        y2={rowY}
                        stroke={GOLD_CHROME}
                        strokeOpacity="0.5"
                        strokeWidth="1.5"
                      />
                    ) : (
                      <line x1={CONTENT_LEFT} y1={rowY} x2={CONTENT_RIGHT} y2={rowY} stroke={BODY_BORDER} />
                    ))}

                  {medal ? (
                    <circle cx={CONTENT_LEFT + 16} cy={line1Y - 6} r="16" fill={medal} />
                  ) : (
                    <circle
                      cx={CONTENT_LEFT + 16}
                      cy={line1Y - 6}
                      r="16"
                      fill="none"
                      stroke="#cbd5e1"
                      strokeWidth="1.5"
                    />
                  )}
                  <text
                    x={CONTENT_LEFT + 16}
                    y={line1Y - 1}
                    fontSize="15"
                    fontWeight="800"
                    fill={medal ? NAVY_DEEP : '#94a3b8'}
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
                    fill={NAVY_DEEP}
                    fontFamily="var(--font-oswald), sans-serif"
                    {...(row.name.length > 20
                      ? { textLength: CONTENT_WIDTH - 195, lengthAdjust: 'spacingAndGlyphs' }
                      : {})}
                  >
                    {row.name}
                  </text>
                  {/* One combined hero: Total Points is the primary number (this card is
                      now the single leaderboard -- no separate Total Points section),
                      with this venue's win% right beside it as context. Both runs sit in
                      one right-anchored <text> so they stay glued together as the name
                      grows/shrinks, rather than two independently-positioned elements
                      that could drift apart. */}
                  <text
                    x={CONTENT_RIGHT}
                    y={line1Y + 3}
                    textAnchor="end"
                    fontFamily="var(--font-oswald), sans-serif"
                  >
                    <tspan fontSize="15" fontWeight="700" fill={MUTED_TEXT}>
                      {row.venueWinPercentage !== null ? `${row.venueWinPercentage}% · ` : '— · '}
                    </tspan>
                    <tspan fontSize="30" fontWeight="900" fill={heroColor}>
                      {row.totalPoints}
                    </tspan>
                    <tspan fontSize="15" fontWeight="700" fill={heroColor}>
                      {' '}pts
                    </tspan>
                  </text>

                  {chip && (
                    <>
                      <rect
                        x={CONTENT_LEFT + 46}
                        y={line2Y - 15}
                        width={chip.width}
                        height="21"
                        rx="10.5"
                        fill={chip.light}
                        fillOpacity="0.5"
                        stroke={chip.accent}
                        strokeWidth="1.25"
                        strokeOpacity="0.7"
                      />
                      <text
                        x={CONTENT_LEFT + 46 + chip.width / 2}
                        y={line2Y + 1}
                        fontSize="13"
                        fontWeight="800"
                        fill={chip.accent}
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
                    fill={MUTED_TEXT}
                    fontFamily="var(--font-geist-sans), sans-serif"
                  >
                    {row.matchesPlayed}M · {row.matchWins}W–{row.losses}L
                    {row.tournamentWins > 0 ? ` · 🏆×${row.tournamentWins}` : ''}
                  </text>
                </g>
              );
            })}

            <text
              x={CARD_WIDTH / 2}
              y={footerY + 24}
              fontSize="12"
              fill={MUTED_TEXT}
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
            stroke={BODY_BORDER}
            strokeWidth="1.5"
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
