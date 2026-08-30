'use client';

import { useRef, useState } from 'react';
import { shareOrDownloadFile, sanitizeFileNamePart } from '@/lib/pdf/pdfShare';
import type { ExportStandingsRow, ExportMatchGroup } from '@/lib/tournament/resultsExport';

export type ChampionCardProps = {
  tournamentName: string;
  date: string;
  venueName: string;
  timeslotLabel: string;
  formatLabel: string;
  completedAt: string | null;
  championName: string;
  standingsTitle: string;
  standingsRows: ExportStandingsRow[];
  matchGroups: ExportMatchGroup[];
};

const CARD_WIDTH = 640;
const PAD_X = 40;
const CONTENT_LEFT = PAD_X;
const CONTENT_RIGHT = CARD_WIDTH - PAD_X;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;

const HEADER_HEIGHT = 240;
const RIBBON_HEIGHT = 78;
const SECTION_GAP = 28;
const SECTION_HEADER_HEIGHT = 30;
const STANDINGS_ROW_HEIGHT = 36;
const MATCH_ROW_HEIGHT = 27;
const FINAL_BOX_PADDING = 14;
const FOOTER_HEIGHT = 34;

const GOLD_BRIGHT = '#d6af36';
const GOLD_HIGHLIGHT = '#fde68a';
const SILVER = '#a7a7ad';
const BRONZE = '#a77044';
const NAVY_DEEP = '#0c1830';
const NAVY_MID = '#16294e';
const NAVY_LIGHT = '#1c3560';
const BRAND_ORANGE = '#bf5919';
const BRAND_ORANGE_DARK = '#b6462a';
const MUTED_SILVER = '#94a3b8';

function medalColor(rank: number): string | null {
  if (rank === 1) return GOLD_BRIGHT;
  if (rank === 2) return SILVER;
  if (rank === 3) return BRONZE;
  return null;
}

// SVG rendered as an <img> src runs in "secure static mode": external resource references
// (a remote <image href>, or a browser-loaded @font-face) are never fetched, so drawing
// that image to canvas would silently lose the logo and fall back to a generic font.
// Fetching each asset and inlining it as a data: URI before serializing avoids that.
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

export default function ChampionCard({
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
}: ChampionCardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [status, setStatus] = useState<'idle' | 'generating' | 'error'>('idle');

  const metaParts = [date, venueName, timeslotLabel, formatLabel];
  // Pinned to UTC rather than the ambient locale/timezone -- this component renders
  // once server-side (SSR, in the server's timezone) and again client-side during
  // hydration (in the viewer's timezone). An unpinned toLocaleDateString() can format
  // the same instant onto different calendar days in the two environments (e.g. a late
  // evening UTC timestamp lands a day later for a Dubai viewer, UTC+4) and React flags
  // that as a hydration mismatch. Formatting in a fixed zone keeps both renders identical.
  if (completedAt) {
    metaParts.push(
      `Completed ${new Date(completedAt).toLocaleDateString('en-US', { timeZone: 'UTC' })}`
    );
  }
  const metaLine = metaParts.join('  ·  ');

  // Layout is computed up front rather than fixed, since the number of standings rows
  // and matches varies per tournament and format -- unlike a fixed-content player card,
  // this one grows vertically to fit whatever the tournament actually produced.
  const ribbonY = HEADER_HEIGHT;
  const standingsY = ribbonY + RIBBON_HEIGHT + SECTION_GAP;
  const standingsRowsY = standingsY + SECTION_HEADER_HEIGHT;
  const standingsHeight = SECTION_HEADER_HEIGHT + standingsRows.length * STANDINGS_ROW_HEIGHT;

  let cursorY = standingsY + standingsHeight;
  const groupLayouts = matchGroups.map((group) => {
    const isFinal = group.stageLabel === 'Final';
    const boxPad = isFinal ? FINAL_BOX_PADDING : 0;
    const groupY = cursorY + SECTION_GAP;
    const innerHeight = SECTION_HEADER_HEIGHT + group.matches.length * MATCH_ROW_HEIGHT;
    const groupHeight = innerHeight + boxPad * 2;
    cursorY = groupY + groupHeight;
    return { group, isFinal, groupY, boxPad };
  });

  const footerY = cursorY + SECTION_GAP;
  const totalHeight = footerY + FOOTER_HEIGHT;

  const handleDownload = async () => {
    if (!svgRef.current) return;
    setStatus('generating');
    try {
      const exportSvg = svgRef.current.cloneNode(true) as SVGSVGElement;

      // The body/number text uses `var(--font-geist-sans), sans-serif`. In the
      // isolated export context that custom property is never defined (no next/font
      // stylesheet there), and an undefined var() reference invalidates the whole
      // font-family declaration rather than just skipping to the "sans-serif"
      // fallback that follows it -- so without this the exported PNG silently drops
      // all the way to the browser's serif default. Pointing it at a plain generic
      // family keeps the declaration valid; no real Geist file is embedded here since
      // its condensed-vs-not difference from a system sans is minor compared to Oswald's.
      exportSvg.style.setProperty('--font-geist-sans', 'sans-serif');

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

      // Embed the real Oswald font directly in the cloned SVG's own <style> -- a
      // standalone SVG loaded via `img.src = blob:...` gets re-parsed as an isolated
      // document that never sees the parent page's next/font stylesheet, so the
      // `var(--font-oswald)` custom property the live card relies on would otherwise
      // resolve to nothing there. Embedding a real @font-face and pointing the same
      // custom property at it (on the clone's root, so it cascades to every
      // descendant text element) makes the export resolve to the genuine Oswald
      // font instead of silently falling back to a generic system font.
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

      const fileName = `${sanitizeFileNamePart(tournamentName)}-champion-card.png`;
      await shareOrDownloadFile(blob, fileName, tournamentName, 'image/png');
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
        aria-label="Download Champion Card as an image"
      >
        <svg
          ref={svgRef}
          width={CARD_WIDTH}
          height={totalHeight}
          viewBox={`0 0 ${CARD_WIDTH} ${totalHeight}`}
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto max-w-[640px] rounded-2xl"
        >
          <defs>
            <linearGradient id="ccBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={NAVY_LIGHT} />
              <stop offset="45%" stopColor={NAVY_MID} />
              <stop offset="100%" stopColor={NAVY_DEEP} />
            </linearGradient>
            <linearGradient id="ccRibbon" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={GOLD_BRIGHT} />
              <stop offset="50%" stopColor={GOLD_HIGHLIGHT} />
              <stop offset="100%" stopColor={GOLD_BRIGHT} />
            </linearGradient>
            <radialGradient id="ccGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={GOLD_HIGHLIGHT} stopOpacity="0.55" />
              <stop offset="100%" stopColor={GOLD_HIGHLIGHT} stopOpacity="0" />
            </radialGradient>
            <clipPath id="ccLogoClip">
              <circle cx={CONTENT_LEFT + 17} cy="37" r="17" />
            </clipPath>
            <clipPath id="ccHeaderClip">
              <rect x="0" y="0" width={CARD_WIDTH} height={totalHeight} rx="20" />
            </clipPath>
            <linearGradient id="ccHeaderWash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={NAVY_LIGHT} stopOpacity="0.5" />
              <stop offset="100%" stopColor={NAVY_LIGHT} stopOpacity="0.92" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width={CARD_WIDTH} height={totalHeight} rx="20" fill="url(#ccBg)" />

          {/* Header: same real Dubai skyline banner as the app's own header, kept to a
              slim strip behind just the logo + wordmark row -- the trophy/glow moment
              below stays on the plain navy gradient so the two don't visually compete.
              The wash's bottom stop matches ccBg's own NAVY_LIGHT start color so the
              strip blends into the gradient below it instead of a hard seam. */}
          <image
            href="/header-dxb-skyline.webp"
            x="0"
            y="0"
            width={CARD_WIDTH}
            height="150"
            preserveAspectRatio="xMidYMid slice"
            clipPath="url(#ccHeaderClip)"
          />
          <rect x="0" y="0" width={CARD_WIDTH} height="150" fill="url(#ccHeaderWash)" clipPath="url(#ccHeaderClip)" />

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

          {/* Header: logo + wordmark -- circular logo clip + gold ring + italic
              wordmark, matching LocationLeaderboardCard/RaceLeaderboardCard. */}
          <image
            href="/logo.png"
            x={CONTENT_LEFT}
            y="20"
            width="34"
            height="34"
            preserveAspectRatio="xMidYMid slice"
            clipPath="url(#ccLogoClip)"
          />
          <circle
            cx={CONTENT_LEFT + 17}
            cy="37"
            r="17"
            fill="none"
            stroke={GOLD_BRIGHT}
            strokeOpacity="0.6"
            strokeWidth="1.5"
          />
          <text
            x={CONTENT_LEFT + 44}
            y="42"
            fontSize="13"
            fontWeight="700"
            fontStyle="italic"
            fill={GOLD_HIGHLIGHT}
            letterSpacing="2"
            fontFamily="var(--font-oswald), sans-serif"
          >
            PICKLERALLY DXB
          </text>

          {/* Trophy with glow */}
          <circle cx={CARD_WIDTH / 2} cy="100" r="58" fill="url(#ccGlow)" />
          <g transform={`translate(${CARD_WIDTH / 2 - 26}, 74)`}>
            <rect x="0" y="0" width="52" height="29" rx="8" fill={GOLD_BRIGHT} />
            <circle cx="-3" cy="9" r="8.5" fill="none" stroke={GOLD_BRIGHT} strokeWidth="4.7" />
            <circle cx="55" cy="9" r="8.5" fill="none" stroke={GOLD_BRIGHT} strokeWidth="4.7" />
            <rect x="20.8" y="29" width="10.4" height="14.6" fill={GOLD_BRIGHT} />
            <rect x="9.4" y="41.6" width="33.3" height="8.3" rx="2" fill={GOLD_BRIGHT} />
          </g>

          {/* Tournament name + meta */}
          <text
            x={CARD_WIDTH / 2}
            y="172"
            fontSize="24"
            fontWeight="800"
            fill="#f8fafc"
            textAnchor="middle"
            fontFamily="var(--font-oswald), sans-serif"
          >
            {tournamentName}
          </text>
          <text
            x={CARD_WIDTH / 2}
            y="194"
            fontSize="11.5"
            fill={MUTED_SILVER}
            textAnchor="middle"
            fontFamily="var(--font-geist-sans), sans-serif"
          >
            {metaLine}
          </text>

          {/* Winners ribbon */}
          <rect x={CONTENT_LEFT} y={ribbonY} width={CONTENT_WIDTH} height={RIBBON_HEIGHT} rx="10" fill="url(#ccRibbon)" />
          <text
            x={CARD_WIDTH / 2}
            y={ribbonY + 26}
            fontSize="12"
            fontWeight="800"
            fill={NAVY_DEEP}
            textAnchor="middle"
            letterSpacing="4"
            fontFamily="var(--font-oswald), sans-serif"
          >
            WINNERS
          </text>
          <text
            x={CARD_WIDTH / 2}
            y={ribbonY + 58}
            fontSize="26"
            fontWeight="900"
            fill={NAVY_DEEP}
            textAnchor="middle"
            fontFamily="var(--font-oswald), sans-serif"
          >
            🏆 {championName} 🏆
          </text>

          {/* Standings */}
          <text
            x={CONTENT_LEFT}
            y={standingsY + 14}
            fontSize="14"
            fontWeight="800"
            fill={GOLD_BRIGHT}
            letterSpacing="1.5"
            fontFamily="var(--font-oswald), sans-serif"
          >
            {standingsTitle.toUpperCase()}
          </text>
          <line
            x1={CONTENT_LEFT}
            y1={standingsY + 22}
            x2={CONTENT_RIGHT}
            y2={standingsY + 22}
            stroke={GOLD_BRIGHT}
            strokeOpacity="0.3"
          />
          {standingsRows.map((row, i) => {
            const rowY = standingsRowsY + i * STANDINGS_ROW_HEIGHT;
            const medal = medalColor(row.rank);
            const rowMidY = rowY + STANDINGS_ROW_HEIGHT / 2 + 5;
            const statLine = `${row.primaryStat ? `${row.primaryStat} pts  ·  ` : ''}${row.wins}W-${row.losses}L  ·  ${row.diffLabel}`;
            return (
              <g key={row.rank}>
                {i > 0 && (
                  <line
                    x1={CONTENT_LEFT}
                    y1={rowY}
                    x2={CONTENT_RIGHT}
                    y2={rowY}
                    stroke="#ffffff"
                    strokeOpacity="0.06"
                  />
                )}
                {medal ? (
                  <circle cx={CONTENT_LEFT + 13} cy={rowMidY - 5} r="13" fill={medal} />
                ) : (
                  <circle cx={CONTENT_LEFT + 13} cy={rowMidY - 5} r="13" fill="none" stroke={MUTED_SILVER} strokeOpacity="0.5" />
                )}
                <text
                  x={CONTENT_LEFT + 13}
                  y={rowMidY - 1}
                  fontSize="12"
                  fontWeight="800"
                  fill={medal ? NAVY_DEEP : MUTED_SILVER}
                  textAnchor="middle"
                  fontFamily="var(--font-oswald), sans-serif"
                >
                  {row.rank}
                </text>
                <text x={CONTENT_LEFT + 34} y={rowMidY - 1} fontSize="15" fontWeight="700" fill="#f8fafc" fontFamily="var(--font-geist-sans), sans-serif">
                  {row.name}
                </text>
                <text
                  x={CONTENT_RIGHT}
                  y={rowMidY - 1}
                  fontSize="12.5"
                  fontWeight="700"
                  fill={GOLD_HIGHLIGHT}
                  textAnchor="end"
                  fontFamily="var(--font-geist-sans), sans-serif"
                >
                  {statLine}
                </text>
              </g>
            );
          })}

          {/* Match groups (League / Semifinal / Final, or a single "Matches" group) */}
          {groupLayouts.map(({ group, isFinal, groupY, boxPad }) => {
            const innerY = groupY + boxPad;
            const rowsY = innerY + SECTION_HEADER_HEIGHT;
            const groupHeight =
              SECTION_HEADER_HEIGHT + group.matches.length * MATCH_ROW_HEIGHT + boxPad * 2;
            return (
              <g key={group.stageLabel}>
                {isFinal && (
                  <rect
                    x={CONTENT_LEFT - 10}
                    y={groupY}
                    width={CONTENT_WIDTH + 20}
                    height={groupHeight}
                    rx="12"
                    fill={BRAND_ORANGE}
                    fillOpacity="0.14"
                    stroke={BRAND_ORANGE}
                    strokeOpacity="0.6"
                  />
                )}
                <text
                  x={CONTENT_LEFT}
                  y={innerY + 14}
                  fontSize="14"
                  fontWeight="800"
                  fill={isFinal ? '#ffffff' : GOLD_BRIGHT}
                  letterSpacing="1.5"
                  fontFamily="var(--font-oswald), sans-serif"
                >
                  {group.stageLabel === 'Matches' ? 'MATCHES' : `${group.stageLabel.toUpperCase()} MATCHES`}
                </text>
                <line
                  x1={CONTENT_LEFT}
                  y1={innerY + 22}
                  x2={CONTENT_RIGHT}
                  y2={innerY + 22}
                  stroke={isFinal ? BRAND_ORANGE_DARK : GOLD_BRIGHT}
                  strokeOpacity={isFinal ? 0.5 : 0.3}
                />
                {group.matches.map((m, i) => {
                  const rowY = rowsY + i * MATCH_ROW_HEIGHT;
                  const rowMidY = rowY + MATCH_ROW_HEIGHT / 2 + 4;
                  const roundW = m.round !== null ? 26 : 0;
                  return (
                    <g key={i}>
                      {i > 0 && (
                        <line
                          x1={CONTENT_LEFT}
                          y1={rowY}
                          x2={CONTENT_RIGHT}
                          y2={rowY}
                          stroke="#ffffff"
                          strokeOpacity="0.06"
                        />
                      )}
                      {m.round !== null && (
                        <text x={CONTENT_LEFT} y={rowMidY} fontSize="10" fill={MUTED_SILVER} fontFamily="var(--font-geist-sans), sans-serif">
                          R{m.round}
                        </text>
                      )}
                      <text x={CONTENT_LEFT + roundW} y={rowMidY} fontSize="12.5" fontFamily="var(--font-geist-sans), sans-serif">
                        <tspan fontWeight={m.winner === 'a' ? '800' : '500'} fill={m.winner === 'a' ? '#ffffff' : MUTED_SILVER}>
                          {m.teamAName}
                          {m.winner === 'a' ? ' (W)' : ''}
                        </tspan>
                        <tspan fill={MUTED_SILVER}>{'  vs  '}</tspan>
                        <tspan fontWeight={m.winner === 'b' ? '800' : '500'} fill={m.winner === 'b' ? '#ffffff' : MUTED_SILVER}>
                          {m.teamBName}
                          {m.winner === 'b' ? ' (W)' : ''}
                        </tspan>
                      </text>
                      <text
                        x={CONTENT_RIGHT}
                        y={rowMidY}
                        fontSize="12.5"
                        fontWeight="800"
                        fill={isFinal ? '#ffffff' : GOLD_HIGHLIGHT}
                        textAnchor="end"
                        fontFamily="var(--font-geist-sans), sans-serif"
                      >
                        {m.scoreLabel}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Footer */}
          <text
            x={CARD_WIDTH / 2}
            y={footerY + 20}
            fontSize="10"
            fill={MUTED_SILVER}
            fillOpacity="0.8"
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
