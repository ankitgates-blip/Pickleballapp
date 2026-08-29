'use client';

import { useRef, useState } from 'react';
import { shareOrDownloadFile, sanitizeFileNamePart } from '@/lib/pdf/pdfShare';

export type LeaderboardCardRow = {
  rank: number;
  name: string;
  matchesPlayed: number;
  matchWins: number;
  // Raw (unrounded) percentage, e.g. 77.777... -- the card formats it to one decimal
  // place itself, matching this design's "00.0%" convention.
  winPercentage: number | null;
  leagueWins: number;
  totalPoints: number;
};

export type LocationLeaderboardCardProps = {
  venueName: string;
  // e.g. "Month to Date" or "August 2026" -- Points are a windowed stat (10/match win,
  // 25/league win, live from Sept 2026), so unlike the old all-time version of this
  // card, everything on it now describes one specific period, and that period has to
  // be named somewhere on the card itself.
  periodLabel: string;
  generatedDateLabel: string;
  rows: LeaderboardCardRow[];
};

const CARD_WIDTH = 800;
const PAD_X = 40;
const CONTENT_LEFT = PAD_X;
const CONTENT_RIGHT = CARD_WIDTH - PAD_X;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;

const HEADER_HEIGHT = 172;
const STAT_STRIP_HEIGHT = 72;
const SECTION_GAP = 24;
const TABLE_HEADER_HEIGHT = 40;
const ROW_HEIGHT = 58;
const FOOTER_HEIGHT = 64;

const NEON = '#eaff00';
const NEON_DIM = '#c9e800';
const BG_TOP = '#12161e';
const BG_BOTTOM = '#000000';
const WHITE = '#f8fafc';
const MUTED = '#94a3b8';
const GOLD_MEDAL = '#d6af36';
const SILVER = '#a7a7ad';
const BRONZE = '#a77044';
const NAVY_DEEP = '#0c1830';

const MATCHES_X = CONTENT_LEFT + 430;
const WINS_X = CONTENT_LEFT + 510;
const WINPCT_X = CONTENT_LEFT + 590;
const NAME_X = CONTENT_LEFT + 64;

function medalFill(rank: number): string | null {
  if (rank === 1) return 'url(#llGoldMedal)';
  if (rank === 2) return SILVER;
  if (rank === 3) return BRONZE;
  return null;
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

  const totalLeagueWins = rows.reduce((sum, r) => sum + r.leagueWins, 0);
  const totalPointsAwarded = rows.reduce((sum, r) => sum + r.totalPoints, 0);

  const tableHeaderY = HEADER_HEIGHT + STAT_STRIP_HEIGHT + SECTION_GAP;
  const rowsStartY = tableHeaderY + TABLE_HEADER_HEIGHT;
  const footerY = rowsStartY + rows.length * ROW_HEIGHT + SECTION_GAP;
  const totalHeight = footerY + FOOTER_HEIGHT;

  const handleDownload = async () => {
    if (!svgRef.current) return;
    setStatus('generating');
    try {
      const exportSvg = svgRef.current.cloneNode(true) as SVGSVGElement;

      // Two <image> elements now (logo + the skyline photo) -- inline each from its
      // own original href, since neither survives an isolated standalone-SVG render.
      for (const imageEl of Array.from(exportSvg.querySelectorAll('image'))) {
        const src = imageEl.getAttribute('href');
        if (!src) continue;
        const dataUrl = await loadDataUrl(src);
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

  const statColW = (CONTENT_WIDTH - 110) / 3;

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
          className="w-full h-auto max-w-[800px] rounded-2xl"
        >
          <defs>
            <linearGradient id="llBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BG_TOP} />
              <stop offset="100%" stopColor={BG_BOTTOM} />
            </linearGradient>
            <linearGradient id="llGoldMedal" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={GOLD_MEDAL} />
              <stop offset="50%" stopColor="#fde68a" />
              <stop offset="100%" stopColor={GOLD_MEDAL} />
            </linearGradient>
            <linearGradient id="llSkylineFadeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
              <stop offset="70%" stopColor="#ffffff" stopOpacity="1" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
            <mask id="llSkylineFade">
              <rect x={CARD_WIDTH - 138} y="0" width="32" height="160" fill="url(#llSkylineFadeGrad)" />
            </mask>
          </defs>

          <rect x="0" y="0" width={CARD_WIDTH} height={totalHeight} rx="20" fill="url(#llBg)" />
          <rect
            x="1"
            y="1"
            width={CARD_WIDTH - 2}
            height={totalHeight - 2}
            rx="19"
            fill="none"
            stroke={NEON}
            strokeOpacity="0.3"
          />

          {/* Decorative Dubai skyline photo (top-right) + a vector paddle icon --
              the skyline is a real photo (cropped from a reference the user provided,
              with its text and the branded paddle removed); no unbranded paddle photo
              was available, so the paddle stays a simple vector drawing. */}
          <image
            href="/dxb-skyline.webp"
            x={CARD_WIDTH - 138}
            y="0"
            width="32"
            height="160"
            mask="url(#llSkylineFade)"
          />
          <g transform={`translate(${CARD_WIDTH - 60}, 88) rotate(18)`} opacity="0.9">
            <ellipse cx="0" cy="0" rx="17" ry="21" fill="#0c0a09" stroke={NEON} strokeWidth="2.5" />
            <rect x="-3" y="19" width="6" height="16" rx="2" fill="#0c0a09" stroke={NEON} strokeWidth="2" />
          </g>
          <circle cx={CARD_WIDTH - 92} cy="140" r="7" fill={NEON} opacity="0.85" />

          {/* Header: logo + wordmark */}
          <image href="/logo.png" x={CONTENT_LEFT} y="20" width="30" height="30" />
          <text
            x={CONTENT_LEFT + 38}
            y="40"
            fontSize="12"
            fontWeight="700"
            fill={NEON}
            letterSpacing="2"
            fontFamily="var(--font-oswald), sans-serif"
          >
            PICKLERALLY DXB
          </text>

          <text
            x={CONTENT_LEFT}
            y="106"
            fontSize="46"
            fontWeight="900"
            fill={WHITE}
            letterSpacing="1"
            fontFamily="var(--font-oswald), sans-serif"
          >
            LEADERBOARD
          </text>
          <rect x={CONTENT_LEFT} y="115" width="130" height="4" fill={NEON} />
          <text
            x={CONTENT_LEFT}
            y="148"
            fontSize="15"
            fontFamily="var(--font-oswald), sans-serif"
          >
            <tspan fontWeight="800" fill={NEON} letterSpacing="1">
              {venueName.toUpperCase()}
            </tspan>
            <tspan fill={MUTED} fontWeight="500">
              {'   ·   '}
              {periodLabel}
            </tspan>
          </text>

          {/* Stat strip */}
          <rect
            x={CONTENT_LEFT}
            y={HEADER_HEIGHT}
            width={CONTENT_WIDTH}
            height={STAT_STRIP_HEIGHT}
            rx="12"
            fill="#ffffff"
            fillOpacity="0.04"
            stroke={NEON}
            strokeOpacity="0.25"
          />
          {[
            { label: 'PLAYERS', value: String(rows.length) },
            { label: 'LEAGUE WINS', value: String(totalLeagueWins) },
            { label: 'TOTAL POINTS', value: String(totalPointsAwarded) },
          ].map((stat, i) => {
            const cx = CONTENT_LEFT + i * statColW + statColW / 2;
            return (
              <g key={stat.label}>
                {i > 0 && (
                  <line
                    x1={CONTENT_LEFT + i * statColW}
                    y1={HEADER_HEIGHT + 14}
                    x2={CONTENT_LEFT + i * statColW}
                    y2={HEADER_HEIGHT + STAT_STRIP_HEIGHT - 14}
                    stroke={NEON}
                    strokeOpacity="0.2"
                  />
                )}
                <text
                  x={cx}
                  y={HEADER_HEIGHT + 34}
                  fontSize="24"
                  fontWeight="800"
                  fill={NEON}
                  textAnchor="middle"
                  fontFamily="var(--font-oswald), sans-serif"
                >
                  {stat.value}
                </text>
                <text
                  x={cx}
                  y={HEADER_HEIGHT + 52}
                  fontSize="9.5"
                  fontWeight="700"
                  fill={MUTED}
                  textAnchor="middle"
                  letterSpacing="1"
                  fontFamily="var(--font-oswald), sans-serif"
                >
                  {stat.label}
                </text>
              </g>
            );
          })}
          <rect
            x={CONTENT_RIGHT - 92}
            y={HEADER_HEIGHT + 22}
            width="82"
            height="28"
            rx="14"
            fill="none"
            stroke={NEON}
            strokeOpacity="0.5"
          />
          <text
            x={CONTENT_RIGHT - 51}
            y={HEADER_HEIGHT + 40}
            fontSize="12"
            fontWeight="800"
            fill={NEON}
            textAnchor="middle"
            fontFamily="var(--font-oswald), sans-serif"
          >
            📍 DXB
          </text>

          {/* Table header bar */}
          <rect
            x={CONTENT_LEFT}
            y={tableHeaderY}
            width={CONTENT_WIDTH}
            height={TABLE_HEADER_HEIGHT}
            rx="8"
            fill={NEON}
          />
          <text x={CONTENT_LEFT + 26} y={tableHeaderY + 25} fontSize="12" fontWeight="800" fill={NAVY_DEEP} textAnchor="middle" letterSpacing="0.5" fontFamily="var(--font-oswald), sans-serif">
            RANK
          </text>
          <text x={NAME_X} y={tableHeaderY + 25} fontSize="12" fontWeight="800" fill={NAVY_DEEP} letterSpacing="0.5" fontFamily="var(--font-oswald), sans-serif">
            PLAYER / TEAM
          </text>
          <text x={MATCHES_X} y={tableHeaderY + 25} fontSize="12" fontWeight="800" fill={NAVY_DEEP} textAnchor="middle" letterSpacing="0.5" fontFamily="var(--font-oswald), sans-serif">
            MATCHES
          </text>
          <text x={WINS_X} y={tableHeaderY + 25} fontSize="12" fontWeight="800" fill={NAVY_DEEP} textAnchor="middle" letterSpacing="0.5" fontFamily="var(--font-oswald), sans-serif">
            WINS
          </text>
          <text x={WINPCT_X} y={tableHeaderY + 25} fontSize="12" fontWeight="800" fill={NAVY_DEEP} textAnchor="middle" letterSpacing="0.5" fontFamily="var(--font-oswald), sans-serif">
            WIN %
          </text>
          <text x={CONTENT_RIGHT - 4} y={tableHeaderY + 25} fontSize="12" fontWeight="800" fill={NAVY_DEEP} textAnchor="end" letterSpacing="0.5" fontFamily="var(--font-oswald), sans-serif">
            POINTS
          </text>

          {rows.map((row, i) => {
            const rowY = rowsStartY + i * ROW_HEIGHT;
            const rowMidY = rowY + ROW_HEIGHT / 2 + 5;
            const medal = medalFill(row.rank);
            const badgeCx = CONTENT_LEFT + 26;
            const badgeCy = rowY + ROW_HEIGHT / 2;

            return (
              <g key={row.rank}>
                {i > 0 && (
                  <line
                    x1={CONTENT_LEFT}
                    y1={rowY}
                    x2={CONTENT_RIGHT}
                    y2={rowY}
                    stroke="#ffffff"
                    strokeOpacity="0.07"
                  />
                )}

                {medal ? (
                  <circle cx={badgeCx} cy={badgeCy} r="17" fill={medal} />
                ) : (
                  <rect
                    x={badgeCx - 15}
                    y={badgeCy - 15}
                    width="30"
                    height="30"
                    rx="8"
                    fill="none"
                    stroke={MUTED}
                    strokeOpacity="0.5"
                  />
                )}
                <text
                  x={badgeCx}
                  y={badgeCy + 5}
                  fontSize="15"
                  fontWeight="800"
                  fill={medal ? NAVY_DEEP : WHITE}
                  textAnchor="middle"
                  fontFamily="var(--font-oswald), sans-serif"
                >
                  {row.rank}
                </text>

                <text
                  x={NAME_X}
                  y={rowMidY}
                  fontSize="17"
                  fontWeight="700"
                  fill={WHITE}
                  fontFamily="var(--font-oswald), sans-serif"
                  {...(row.name.length > 24
                    ? { textLength: WINPCT_X - 40 - NAME_X, lengthAdjust: 'spacingAndGlyphs' }
                    : {})}
                >
                  {row.name}
                </text>
                <text x={MATCHES_X} y={rowMidY} fontSize="14" fill={MUTED} textAnchor="middle" fontFamily="var(--font-geist-sans), sans-serif">
                  {row.matchesPlayed}
                </text>
                <text x={WINS_X} y={rowMidY} fontSize="14" fontWeight="700" fill={WHITE} textAnchor="middle" fontFamily="var(--font-geist-sans), sans-serif">
                  {row.matchWins}
                </text>
                <text x={WINPCT_X} y={rowMidY} fontSize="14" fill={MUTED} textAnchor="middle" fontFamily="var(--font-geist-sans), sans-serif">
                  {row.winPercentage !== null ? `${row.winPercentage.toFixed(1)}%` : '—'}
                </text>
                <text
                  x={CONTENT_RIGHT}
                  y={rowMidY}
                  fontSize="16"
                  fontWeight="800"
                  fill={NEON}
                  textAnchor="end"
                  fontFamily="var(--font-oswald), sans-serif"
                >
                  🏆 {row.totalPoints}
                </text>
              </g>
            );
          })}

          {/* Footer */}
          <line
            x1={CONTENT_LEFT}
            y1={footerY - 6}
            x2={CONTENT_RIGHT}
            y2={footerY - 6}
            stroke={NEON}
            strokeOpacity="0.2"
          />
          <text
            x={CONTENT_LEFT}
            y={footerY + 18}
            fontSize="12"
            fontStyle="italic"
            fill={NEON_DIM}
            fontFamily="var(--font-geist-sans), sans-serif"
          >
            Every match counts — keep climbing the ranks!
          </text>
          <text
            x={CONTENT_RIGHT}
            y={footerY + 18}
            fontSize="11"
            fill={MUTED}
            textAnchor="end"
            letterSpacing="0.5"
            fontFamily="var(--font-oswald), sans-serif"
          >
            UPDATED {generatedDateLabel.toUpperCase()}
          </text>
          <text
            x={CARD_WIDTH / 2}
            y={footerY + 44}
            fontSize="10"
            fill={MUTED}
            fillOpacity="0.7"
            textAnchor="middle"
            letterSpacing="1.5"
            fontFamily="var(--font-oswald), sans-serif"
          >
            PICKLERALLY DXB
          </text>
        </svg>
      </button>
      <p className="text-xs text-muted mt-1.5">Click the card to share or download it as an image.</p>
      {status === 'error' && (
        <p className="text-xs text-red-600 mt-1">Couldn&apos;t generate the image. Try again.</p>
      )}
    </div>
  );
}
