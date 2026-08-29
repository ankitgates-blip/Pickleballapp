'use client';

import { useRef, useState } from 'react';
import { shareOrDownloadFile, sanitizeFileNamePart } from '@/lib/pdf/pdfShare';
import type { UpcomingStageGroup } from '@/lib/tournament/resultsExport';

export type ScheduleCardTeam = {
  name: string;
};

export type ScheduleCardProps = {
  tournamentName: string;
  date: string;
  venueName: string;
  timeslotLabel: string;
  formatLabel: string;
  stageGroups: UpcomingStageGroup[];
  teams: ScheduleCardTeam[];
};

const CARD_WIDTH = 640;
const PAD_X = 40;
const CONTENT_LEFT = PAD_X;
const CONTENT_RIGHT = CARD_WIDTH - PAD_X;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;

const HEADER_HEIGHT = 150;
const ROUND_HEADER_HEIGHT = 26;
const STAGE_BOX_HEADER_HEIGHT = 26;
const MATCH_ROW_HEIGHT = 26;
const ROUND_GROUP_GAP = 12;
const STAGE_GAP = 26;
const BOX_PADDING = 14;
const NO_MATCHES_HEIGHT = 40;
const ROSTER_HEADER_HEIGHT = 32;
const ROSTER_ROW_HEIGHT = 24;
const ROSTER_BOX_PADDING = 16;
const FOOTER_HEIGHT = 34;

const GOLD_BRIGHT = '#d6af36';
const GOLD_HIGHLIGHT = '#fde68a';
const NAVY_DEEP = '#0c1830';
const NAVY_MID = '#16294e';
const NAVY_LIGHT = '#1c3560';
const BRAND_ORANGE = '#bf5919';
const BRAND_ORANGE_DARK = '#b6462a';
const MUTED_SILVER = '#94a3b8';

type ScheduleBlock =
  | { type: 'round'; y: number; round: number; matches: { teamAName: string; teamBName: string }[] }
  | {
      type: 'box';
      y: number;
      height: number;
      stageLabel: string;
      matches: { teamAName: string; teamBName: string }[];
    };

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

export default function ScheduleCard({
  tournamentName,
  date,
  venueName,
  timeslotLabel,
  formatLabel,
  stageGroups,
  teams,
}: ScheduleCardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [status, setStatus] = useState<'idle' | 'generating' | 'error'>('idle');

  const metaLine = [date, venueName, timeslotLabel, formatLabel].join('  ·  ');

  // Layout is computed up front (a plain loop, not a .map() reassigning a captured
  // variable across iterations) since the number of rounds, matches per round, and
  // teams all vary per tournament -- this card grows vertically to fit whatever the
  // tournament actually has left to play, same as ChampionCard.
  const blocks: ScheduleBlock[] = [];
  let cursorY = HEADER_HEIGHT;
  for (const stageGroup of stageGroups) {
    const isBoxed = stageGroup.stageLabel === 'Semifinal' || stageGroup.stageLabel === 'Final';
    if (!isBoxed) {
      for (const roundGroup of stageGroup.roundGroups) {
        blocks.push({
          type: 'round',
          y: cursorY,
          round: roundGroup.round ?? 0,
          matches: roundGroup.matches,
        });
        cursorY += ROUND_HEADER_HEIGHT + roundGroup.matches.length * MATCH_ROW_HEIGHT + ROUND_GROUP_GAP;
      }
      cursorY += STAGE_GAP - ROUND_GROUP_GAP;
    } else {
      const matches = stageGroup.roundGroups[0]?.matches ?? [];
      const boxHeight = BOX_PADDING * 2 + STAGE_BOX_HEADER_HEIGHT + matches.length * MATCH_ROW_HEIGHT;
      blocks.push({ type: 'box', y: cursorY, height: boxHeight, stageLabel: stageGroup.stageLabel, matches });
      cursorY += boxHeight + STAGE_GAP;
    }
  }
  const hasSchedule = stageGroups.length > 0;
  const scheduleEndY = hasSchedule ? cursorY : HEADER_HEIGHT + NO_MATCHES_HEIGHT;

  const rosterColumns = teams.length > 6 ? 2 : 1;
  const rosterRowsPerColumn = Math.ceil(teams.length / rosterColumns);
  const rosterInnerHeight = rosterRowsPerColumn * ROSTER_ROW_HEIGHT;
  const rosterY = scheduleEndY + STAGE_GAP;
  const rosterBoxHeight =
    teams.length > 0 ? ROSTER_BOX_PADDING * 2 + ROSTER_HEADER_HEIGHT + rosterInnerHeight : 0;

  const footerY = teams.length > 0 ? rosterY + rosterBoxHeight + STAGE_GAP : scheduleEndY + STAGE_GAP;
  const totalHeight = footerY + FOOTER_HEIGHT;

  const handleDownload = async () => {
    if (!svgRef.current) return;
    setStatus('generating');
    try {
      const exportSvg = svgRef.current.cloneNode(true) as SVGSVGElement;

      // See ChampionCard.tsx for why both of these are necessary: an isolated
      // standalone-SVG render never sees the page's next/font stylesheet, so an
      // unresolved var(--font-oswald)/var(--font-geist-sans) would invalidate the
      // whole font-family declaration and silently fall back to the browser's serif
      // default rather than just skipping to "sans-serif".
      exportSvg.style.setProperty('--font-geist-sans', 'sans-serif');

      const imageEl = exportSvg.querySelector('image');
      if (imageEl) {
        const logoDataUrl = await loadDataUrl('/logo.png');
        if (logoDataUrl) {
          imageEl.setAttribute('href', logoDataUrl);
        } else {
          imageEl.remove();
        }
      }

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

      const fileName = `${sanitizeFileNamePart(tournamentName)}-schedule.png`;
      await shareOrDownloadFile(blob, fileName, `${tournamentName} Schedule`, 'image/png');
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
        aria-label="Download upcoming schedule as an image"
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
            <linearGradient id="scBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={NAVY_LIGHT} />
              <stop offset="45%" stopColor={NAVY_MID} />
              <stop offset="100%" stopColor={NAVY_DEEP} />
            </linearGradient>
            <clipPath id="scLogoClip">
              <circle cx={CONTENT_LEFT + 17} cy="37" r="17" />
            </clipPath>
          </defs>

          <rect x="0" y="0" width={CARD_WIDTH} height={totalHeight} rx="20" fill="url(#scBg)" />
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

          {/* Header: logo + wordmark, tournament name, meta, kicker -- circular logo
              clip + gold ring + italic wordmark, matching LocationLeaderboardCard/
              RaceLeaderboardCard/ChampionCard. */}
          <image
            href="/logo.png"
            x={CONTENT_LEFT}
            y="20"
            width="34"
            height="34"
            preserveAspectRatio="xMidYMid slice"
            clipPath="url(#scLogoClip)"
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

          <text
            x={CARD_WIDTH / 2}
            y="80"
            fontSize="23"
            fontWeight="800"
            fill="#f8fafc"
            textAnchor="middle"
            fontFamily="var(--font-oswald), sans-serif"
          >
            {tournamentName}
          </text>
          <text
            x={CARD_WIDTH / 2}
            y="100"
            fontSize="11.5"
            fill={MUTED_SILVER}
            textAnchor="middle"
            fontFamily="var(--font-geist-sans), sans-serif"
          >
            {metaLine}
          </text>
          <text
            x={CARD_WIDTH / 2}
            y="124"
            fontSize="13"
            fontWeight="700"
            fill={GOLD_BRIGHT}
            textAnchor="middle"
            letterSpacing="3"
            fontFamily="var(--font-oswald), sans-serif"
          >
            UPCOMING SCHEDULE
          </text>

          {!hasSchedule && (
            <text
              x={CARD_WIDTH / 2}
              y={HEADER_HEIGHT + 24}
              fontSize="13"
              fill={MUTED_SILVER}
              textAnchor="middle"
              fontFamily="var(--font-geist-sans), sans-serif"
            >
              No matches left to play.
            </text>
          )}

          {blocks.map((block, i) => {
            if (block.type === 'round') {
              const rowsY = block.y + ROUND_HEADER_HEIGHT;
              return (
                <g key={`round-${block.round}-${i}`}>
                  <text
                    x={CONTENT_LEFT}
                    y={block.y + 14}
                    fontSize="13"
                    fontWeight="800"
                    fill={GOLD_BRIGHT}
                    letterSpacing="1.5"
                    fontFamily="var(--font-oswald), sans-serif"
                  >
                    ROUND {block.round}
                  </text>
                  <line
                    x1={CONTENT_LEFT}
                    y1={block.y + 22}
                    x2={CONTENT_RIGHT}
                    y2={block.y + 22}
                    stroke={GOLD_BRIGHT}
                    strokeOpacity="0.3"
                  />
                  {block.matches.map((m, mi) => {
                    const rowY = rowsY + mi * MATCH_ROW_HEIGHT;
                    const rowMidY = rowY + MATCH_ROW_HEIGHT / 2 + 4;
                    return (
                      <g key={mi}>
                        {mi > 0 && (
                          <line
                            x1={CONTENT_LEFT}
                            y1={rowY}
                            x2={CONTENT_RIGHT}
                            y2={rowY}
                            stroke="#ffffff"
                            strokeOpacity="0.06"
                          />
                        )}
                        <text
                          x={CONTENT_LEFT}
                          y={rowMidY}
                          fontSize="13"
                          fill="#e2e8f0"
                          fontFamily="var(--font-geist-sans), sans-serif"
                        >
                          <tspan fontWeight="700" fill="#f8fafc">
                            {m.teamAName}
                          </tspan>
                          <tspan fill={MUTED_SILVER}>{'  vs  '}</tspan>
                          <tspan fontWeight="700" fill="#f8fafc">
                            {m.teamBName}
                          </tspan>
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            }

            const isFinal = block.stageLabel === 'Final';
            const boxColor = isFinal ? BRAND_ORANGE : GOLD_BRIGHT;
            const boxColorDark = isFinal ? BRAND_ORANGE_DARK : GOLD_BRIGHT;
            const innerY = block.y + BOX_PADDING;
            const rowsY = innerY + STAGE_BOX_HEADER_HEIGHT;
            return (
              <g key={`box-${block.stageLabel}-${i}`}>
                <rect
                  x={CONTENT_LEFT - 10}
                  y={block.y}
                  width={CONTENT_WIDTH + 20}
                  height={block.height}
                  rx="12"
                  fill={boxColor}
                  fillOpacity="0.14"
                  stroke={boxColor}
                  strokeOpacity="0.6"
                />
                <text
                  x={CONTENT_LEFT}
                  y={innerY + 14}
                  fontSize="13"
                  fontWeight="800"
                  fill={isFinal ? '#ffffff' : GOLD_BRIGHT}
                  letterSpacing="1.5"
                  fontFamily="var(--font-oswald), sans-serif"
                >
                  {block.stageLabel.toUpperCase()} MATCHES
                </text>
                <line
                  x1={CONTENT_LEFT}
                  y1={innerY + 22}
                  x2={CONTENT_RIGHT}
                  y2={innerY + 22}
                  stroke={boxColorDark}
                  strokeOpacity={isFinal ? 0.5 : 0.3}
                />
                {block.matches.map((m, mi) => {
                  const rowY = rowsY + mi * MATCH_ROW_HEIGHT;
                  const rowMidY = rowY + MATCH_ROW_HEIGHT / 2 + 4;
                  return (
                    <g key={mi}>
                      {mi > 0 && (
                        <line
                          x1={CONTENT_LEFT}
                          y1={rowY}
                          x2={CONTENT_RIGHT}
                          y2={rowY}
                          stroke="#ffffff"
                          strokeOpacity="0.08"
                        />
                      )}
                      <text
                        x={CONTENT_LEFT}
                        y={rowMidY}
                        fontSize="13"
                        fontFamily="var(--font-geist-sans), sans-serif"
                      >
                        <tspan fontWeight="700" fill="#f8fafc">
                          {m.teamAName}
                        </tspan>
                        <tspan fill={MUTED_SILVER}>{'  vs  '}</tspan>
                        <tspan fontWeight="700" fill="#f8fafc">
                          {m.teamBName}
                        </tspan>
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Teams roster */}
          {teams.length > 0 && (
            <g>
              <rect
                x={CONTENT_LEFT - 10}
                y={rosterY}
                width={CONTENT_WIDTH + 20}
                height={rosterBoxHeight}
                rx="12"
                fill="none"
                stroke={GOLD_BRIGHT}
                strokeOpacity="0.35"
              />
              <text
                x={CONTENT_LEFT}
                y={rosterY + ROSTER_BOX_PADDING + 12}
                fontSize="13"
                fontWeight="800"
                fill={GOLD_BRIGHT}
                letterSpacing="1.5"
                fontFamily="var(--font-oswald), sans-serif"
              >
                TEAMS
              </text>
              <line
                x1={CONTENT_LEFT}
                y1={rosterY + ROSTER_BOX_PADDING + 20}
                x2={CONTENT_RIGHT}
                y2={rosterY + ROSTER_BOX_PADDING + 20}
                stroke={GOLD_BRIGHT}
                strokeOpacity="0.3"
              />
              {teams.map((team, i) => {
                const col = Math.floor(i / rosterRowsPerColumn);
                const rowInCol = i % rosterRowsPerColumn;
                const colWidth = (CONTENT_WIDTH - (rosterColumns - 1) * 24) / rosterColumns;
                const x = CONTENT_LEFT + col * (colWidth + 24);
                const y =
                  rosterY + ROSTER_BOX_PADDING + ROSTER_HEADER_HEIGHT + rowInCol * ROSTER_ROW_HEIGHT + 4;
                return (
                  <text
                    key={i}
                    x={x}
                    y={y}
                    fontSize="13"
                    fontFamily="var(--font-geist-sans), sans-serif"
                    {...(team.name.length > 26
                      ? { textLength: colWidth - 60, lengthAdjust: 'spacingAndGlyphs' }
                      : {})}
                  >
                    <tspan fontWeight="800" fill={GOLD_HIGHLIGHT}>
                      TEAM {i + 1}{'  '}
                    </tspan>
                    <tspan fill="#e2e8f0">{team.name}</tspan>
                  </text>
                );
              })}
            </g>
          )}

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
