'use client';

import { useRef, useState } from 'react';
import { threatTierFor } from '@/lib/stats/threatLevel';
import { shareOrDownloadFile, sanitizeFileNamePart } from '@/lib/pdf/pdfShare';

export type PlayerStatsCardProps = {
  name: string;
  photoUrl: string | null;
  playerNumber: string | null;
  ageHandednessLabel: string | null;
  rating: number;
  starCount: 1 | 2 | 3 | 4 | 5;
  formPercentage: number;
  threatPercentage: number;
  wins: number;
  losses: number;
  winStreak: number;
  trendPoints: number | null;
  winsVsHigherRated: number;
  totalMatches: number;
  winsInLast10: number;
  signatureShots: { emoji: string; skillName: string }[];
  celebrationLabel?: string; // e.g. "PLAYER OF THE MONTH — AUGUST 2026" -- when set, adds a gold banner above the card
};

const CARD_WIDTH = 640;
const CARD_HEIGHT = 360;
const MAX_SIGNATURE_SHOTS_SHOWN = 5;
const SIGNATURE_SHOTS_START_Y = 222;
const SIGNATURE_SHOTS_END_Y = 340;
const SIGNATURE_SHOTS_MIN_SPACING = 18;
const SIGNATURE_SHOTS_MAX_SPACING = 32;

type TierPalette = { accent: string; accentDark: string; accentLight: string };

const THREAT_PALETTE: Record<string, TierPalette> = {
  'LOW THREAT': { accent: '#16a34a', accentDark: '#052e16', accentLight: '#86efac' },
  'WATCH OUT': { accent: '#ca8a04', accentDark: '#1c1503', accentLight: '#fde047' },
  DANGEROUS: { accent: '#ea580c', accentDark: '#1c0a03', accentLight: '#fdba74' },
  'HIGH THREAT': { accent: '#dc2626', accentDark: '#1c0505', accentLight: '#fca5a5' },
  'DO NOT PLAY': { accent: '#c026d3', accentDark: '#1a0526', accentLight: '#f0abfc' },
};

const STATUS_LINES: Record<string, string> = {
  'LOW THREAT': 'Just warming up.',
  'WATCH OUT': 'Getting dangerous.',
  DANGEROUS: "Don't underestimate.",
  'HIGH THREAT': 'Serious competition.',
  'DO NOT PLAY': 'You have been warned.',
};

const CHEVRON_COUNT: Record<string, number> = {
  'LOW THREAT': 1,
  'WATCH OUT': 2,
  DANGEROUS: 3,
  'HIGH THREAT': 3,
  'DO NOT PLAY': 2,
};

function chevronYPositions(count: number): number[] {
  if (count === 1) return [78];
  if (count === 2) return [68, 86];
  return [58, 74, 90];
}

function renderStarRow(count: number): string {
  return '★'.repeat(count) + '☆'.repeat(5 - count);
}

// SVG rendered as an <img> src runs in "secure static mode": external resource references
// (like a remote <image href>) are never loaded, so drawing that image to canvas would silently
// omit the player's photo -- not a CORS/taint error, just a blank ring. Fetching the photo and
// inlining it as a data: URI before serializing (same pattern as SharePlayerStatsButton's PDF
// export) avoids that entirely.
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

export default function PlayerStatsCard({
  name,
  photoUrl,
  playerNumber,
  ageHandednessLabel,
  rating,
  starCount,
  formPercentage,
  threatPercentage,
  wins,
  losses,
  winStreak,
  trendPoints,
  winsVsHigherRated,
  totalMatches,
  winsInLast10,
  signatureShots,
  celebrationLabel,
}: PlayerStatsCardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [status, setStatus] = useState<'idle' | 'generating' | 'error'>('idle');

  const BANNER_HEIGHT = 44;
  const totalHeight = celebrationLabel ? CARD_HEIGHT + BANNER_HEIGHT : CARD_HEIGHT;

  const threatTier = threatTierFor(threatPercentage);
  const palette = THREAT_PALETTE[threatTier.label] ?? THREAT_PALETTE['LOW THREAT'];
  const statusLine = STATUS_LINES[threatTier.label] ?? 'Just warming up.';
  const chevronCount = CHEVRON_COUNT[threatTier.label] ?? 1;
  const chevronYs = chevronYPositions(chevronCount);
  const isDoNotPlay = threatTier.label === 'DO NOT PLAY';
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const trendLabel =
    trendPoints === null ? '—' : trendPoints > 0 ? `+${trendPoints}` : `${trendPoints}`;
  // Position (x) of the bright marker along each stat's fixed gold->orange->red
  // heat-scale track (102 wide), clamped so an out-of-range percentage can't push
  // the marker off either end of the bar.
  const HEAT_SCALE_WIDTH = 102;
  const HEAT_SCALE_MARKER_WIDTH = 2.5;
  const heatScaleMarkerX = (trackX: number, pct: number) =>
    trackX +
    (Math.max(0, Math.min(100, pct)) / 100) * HEAT_SCALE_WIDTH -
    HEAT_SCALE_MARKER_WIDTH / 2;
  const formMarkerX = heatScaleMarkerX(152, formPercentage);
  const threatMarkerX = heatScaleMarkerX(278, threatPercentage);
  // The player-number badge sits above the name row now (not sharing its baseline),
  // so the full panel width is available to the name/nickname at full size for all
  // but pathologically long combinations -- this is just a safety net so an
  // extreme name+nickname never runs past the card edge, not a routine shrink.
  const nameNeedsCompression = name.length > 30;
  const PLAYER_NUMBER_BADGE_RIGHT = 392;
  const playerNumberBadgeWidth = playerNumber ? Math.max(46, 26 + playerNumber.length * 16) : 0;
  const playerNumberBadgeX = PLAYER_NUMBER_BADGE_RIGHT - playerNumberBadgeWidth;
  const shownShots = signatureShots.slice(0, MAX_SIGNATURE_SHOTS_SHOWN);
  const extraShotsCount = Math.max(0, signatureShots.length - MAX_SIGNATURE_SHOTS_SHOWN);
  // Spread the shown lines across the whole reserved band (rather than a fixed line
  // height) so a short list still fills the space down toward the shield/ribbon instead
  // of stopping short and leaving a block of empty card below it. Clamped so a single
  // line doesn't jump way down, and a full 5-shots-plus-"+more" list never overflows
  // past the reserved band.
  const signatureLineCount = shownShots.length + (extraShotsCount > 0 ? 1 : 0);
  const signatureLineSpacing =
    signatureLineCount > 1
      ? Math.min(
          SIGNATURE_SHOTS_MAX_SPACING,
          Math.max(
            SIGNATURE_SHOTS_MIN_SPACING,
            (SIGNATURE_SHOTS_END_Y - SIGNATURE_SHOTS_START_Y) / (signatureLineCount - 1)
          )
        )
      : SIGNATURE_SHOTS_MIN_SPACING;

  const handleDownload = async () => {
    if (!svgRef.current) return;
    setStatus('generating');
    try {
      const exportSvg = svgRef.current.cloneNode(true) as SVGSVGElement;
      const imageEl = exportSvg.querySelector('image');
      if (imageEl) {
        const dataUrl = photoUrl && !photoFailed ? await loadPhotoDataUrl(photoUrl) : null;
        if (dataUrl) {
          imageEl.setAttribute('href', dataUrl);
        } else {
          // Couldn't inline the photo (fetch failed, or there wasn't one to begin with) --
          // drop the reference rather than shipping a PNG with a blank ring where it'd sit.
          imageEl.remove();
        }
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

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      );
      if (!blob) throw new Error('Failed to generate image');

      const fileName = `${sanitizeFileNamePart(name)}-stats-card.png`;
      await shareOrDownloadFile(blob, fileName, name, 'image/png');
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
        aria-label="Download Player Stats Card as an image"
      >
        <svg
          ref={svgRef}
          width={CARD_WIDTH}
          height={totalHeight}
          viewBox={`0 0 ${CARD_WIDTH} ${totalHeight}`}
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto max-w-[640px]"
        >
          <defs>
            <linearGradient id="mainBg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#292524" />
              <stop offset="100%" stopColor="#0c0a09" />
            </linearGradient>
            <linearGradient id="goldRing" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fde68a" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#fde68a" />
            </linearGradient>
            <linearGradient id="sideBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={palette.accentDark} />
              <stop offset="100%" stopColor="#0c0a09" />
            </linearGradient>
            <radialGradient id="shieldGloss" cx="32%" cy="22%" r="85%">
              <stop offset="0%" stopColor={palette.accentLight} />
              <stop offset="45%" stopColor={palette.accent} />
              <stop offset="100%" stopColor={palette.accentDark} />
            </radialGradient>
            <linearGradient id="shieldShadow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="55%" stopColor="#000000" stopOpacity="0" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
            </linearGradient>
            <radialGradient id="ballGrad" cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </radialGradient>
            <linearGradient id="heatScale" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="50%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#dc2626" />
            </linearGradient>
            <linearGradient id="ribbonGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={palette.accentDark} />
              <stop offset="50%" stopColor={palette.accent} />
              <stop offset="100%" stopColor={palette.accentDark} />
            </linearGradient>
            <linearGradient id="numberBadgeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="100%" stopColor="#991b1b" />
            </linearGradient>
            <clipPath id="photoClip">
              <circle cx="66" cy="64" r="34" />
            </clipPath>
            <pattern id="cardTexture" width="14" height="14" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.5" fill="#ffffff" fillOpacity="0.05" />
            </pattern>
          </defs>

          <g transform={celebrationLabel ? `translate(0, ${BANNER_HEIGHT})` : undefined}>
          <rect x="0" y="0" width="410" height={CARD_HEIGHT} rx="16" fill="url(#mainBg)" />
          <rect x="0" y="0" width="410" height={CARD_HEIGHT} rx="16" fill="url(#cardTexture)" />
          <rect
            x="1"
            y="1"
            width="408"
            height={CARD_HEIGHT - 2}
            rx="15"
            fill="none"
            stroke="#475569"
            strokeOpacity="0.4"
          />

          <circle cx="66" cy="64" r="38" fill="none" stroke="url(#goldRing)" strokeWidth="4" />
          {photoUrl && !photoFailed ? (
            <image
              href={photoUrl}
              x="32"
              y="30"
              width="68"
              height="68"
              clipPath="url(#photoClip)"
              preserveAspectRatio="xMidYMid slice"
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <>
              <circle cx="66" cy="64" r="34" fill="url(#goldRing)" />
              <text
                x="66"
                y="73"
                fontSize="26"
                fontWeight="700"
                fill="#451a03"
                textAnchor="middle"
                fontFamily="system-ui, sans-serif"
              >
                {initial}
              </text>
            </>
          )}

          <text
            x="118"
            y="50"
            fontSize="23"
            fontWeight="900"
            fill="#f8fafc"
            fontFamily="system-ui, sans-serif"
            {...(nameNeedsCompression ? { textLength: 270, lengthAdjust: 'spacingAndGlyphs' } : {})}
          >
            {name}
          </text>
          {playerNumber && (
            <>
              <rect
                x={playerNumberBadgeX + 1.5}
                y="13.5"
                width={playerNumberBadgeWidth}
                height="27"
                rx="7"
                fill="#000000"
                opacity="0.35"
              />
              <rect
                x={playerNumberBadgeX}
                y="12"
                width={playerNumberBadgeWidth}
                height="27"
                rx="7"
                fill="url(#numberBadgeGrad)"
                stroke="#7f1d1d"
                strokeWidth="1.5"
              />
              <text
                x={playerNumberBadgeX + playerNumberBadgeWidth / 2}
                y="31.5"
                fontSize="18"
                fontWeight="900"
                fill="#ffffff"
                textAnchor="middle"
                fontFamily="system-ui, sans-serif"
              >
                #{playerNumber}
              </text>
            </>
          )}
          {ageHandednessLabel && (
            <text x="118" y="64" fontSize="11" fill="#c9a865" fontFamily="system-ui, sans-serif">
              {ageHandednessLabel}
            </text>
          )}
          <text x="118" y="79" fontSize="10" fill="#94a3b8" letterSpacing="1" fontFamily="system-ui, sans-serif">
            PICKLERALLY DXB PLAYER CARD
          </text>

          <rect x="18" y="114" width="118" height="60" rx="8" fill="#1c1917" stroke="#3f3f46" />
          <text x="77" y="142" fontSize="21" fontWeight="800" fill="#f8fafc" textAnchor="middle" fontFamily="system-ui, sans-serif">
            {rating.toFixed(2)}
          </text>
          <text x="77" y="156" fontSize="8" fill="#94a3b8" textAnchor="middle" letterSpacing="1" fontFamily="system-ui, sans-serif">
            RATING
          </text>
          <text x="77" y="169" fontSize="11" fill="#fbbf24" textAnchor="middle" fontFamily="system-ui, sans-serif">
            {renderStarRow(starCount)}
          </text>

          <rect x="144" y="114" width="118" height="60" rx="8" fill="#1c1917" stroke="#3f3f46" />
          <text x="203" y="142" fontSize="21" fontWeight="800" fill={palette.accent} textAnchor="middle" fontFamily="system-ui, sans-serif">
            {formPercentage}
          </text>
          <text x="203" y="156" fontSize="8" fill="#94a3b8" textAnchor="middle" letterSpacing="1" fontFamily="system-ui, sans-serif">
            FORM
          </text>
          <rect x="152" y="161" width="102" height="6" rx="3" fill="url(#heatScale)" />
          <rect x={formMarkerX} y="159" width="2.5" height="10" rx="1.25" fill="#ffffff" />

          <rect x="270" y="114" width="118" height="60" rx="8" fill="#1c1917" stroke="#3f3f46" />
          <text x="329" y="142" fontSize="21" fontWeight="800" fill={palette.accent} textAnchor="middle" fontFamily="system-ui, sans-serif">
            {threatPercentage}
          </text>
          <text x="329" y="156" fontSize="8" fill="#94a3b8" textAnchor="middle" letterSpacing="1" fontFamily="system-ui, sans-serif">
            THREAT LVL
          </text>
          <rect x="278" y="161" width="102" height="6" rx="3" fill="url(#heatScale)" />
          <rect x={threatMarkerX} y="159" width="2.5" height="10" rx="1.25" fill="#ffffff" />

          {shownShots.length > 0 && (
            <>
              <text x="18" y="198" fontSize="12" fontWeight="700" fill="#94a3b8" letterSpacing="1.5" fontFamily="system-ui, sans-serif">
                SIGNATURE SHOTS
              </text>
              {shownShots.map((shot, i) => (
                <text
                  key={`${shot.skillName}-${i}`}
                  x="18"
                  y={SIGNATURE_SHOTS_START_Y + i * signatureLineSpacing}
                  fontSize="14"
                  fontStyle="italic"
                  fill="#e2e8f0"
                  fontFamily="system-ui, sans-serif"
                >
                  {shot.emoji} {shot.skillName}
                </text>
              ))}
              {extraShotsCount > 0 && (
                <text
                  x="18"
                  y={SIGNATURE_SHOTS_START_Y + shownShots.length * signatureLineSpacing}
                  fontSize="14"
                  fontStyle="italic"
                  fill="#94a3b8"
                  fontFamily="system-ui, sans-serif"
                >
                  +{extraShotsCount} more
                </text>
              )}
            </>
          )}

          <g transform="translate(248,188) scale(0.8)">
            <ellipse cx="90" cy="152" rx="46" ry="8" fill="#000000" opacity="0.35" />
            <path
              d="M90 20 L128 34 L128 78 C128 112 110 132 90 142 C70 132 52 112 52 78 L52 34 Z"
              fill="url(#shieldGloss)"
              stroke={palette.accentDark}
              strokeWidth="2.5"
            />
            <path
              d="M90 20 L128 34 L128 78 C128 112 110 132 90 142 C70 132 52 112 52 78 L52 34 Z"
              fill="url(#shieldShadow)"
            />
            <path d="M62 32 L78 26 L68 68 L54 74 Z" fill="#ffffff" fillOpacity="0.25" />
            <path
              d="M90 26 L122 38 L122 78 C122 106 107 123 90 133 C73 123 58 106 58 78 L58 38 Z"
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.18"
              strokeWidth="1.2"
            />
            <circle cx="90" cy="44" r="13" fill="url(#ballGrad)" stroke="#94a3b8" strokeWidth="1.2" />
            {[
              [84, 38],
              [96, 38],
              [90, 42],
              [80, 44],
              [100, 44],
              [84, 50],
              [96, 50],
              [90, 46],
              [87, 54],
              [93, 54],
            ].map(([cx, cy], i) => (
              <circle key={i} cx={cx} cy={cy} r="1.1" fill="#64748b" />
            ))}
            {chevronYs.map((y) => (
              <g key={y}>
                <path
                  d={`M68 ${y + 1.5} L90 ${y + 13.5} L112 ${y + 1.5}`}
                  fill="none"
                  stroke={palette.accentDark}
                  strokeWidth="7"
                  strokeLinecap="round"
                />
                <path
                  d={`M68 ${y} L90 ${y + 12} L112 ${y}`}
                  fill="none"
                  stroke={palette.accentLight}
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </g>
            ))}
            {isDoNotPlay && (
              <>
                <circle cx="90" cy="118" r="12" fill="#e4e4e7" />
                <circle cx="85" cy="116" r="2.4" fill="#27272a" />
                <circle cx="95" cy="116" r="2.4" fill="#27272a" />
                <rect x="86" y="122" width="8" height="3" fill="#27272a" rx="1" />
                <path d="M52 118 C44 110 44 96 52 88" fill="none" stroke={palette.accent} strokeWidth="2.5" />
                <path d="M128 118 C136 110 136 96 128 88" fill="none" stroke={palette.accent} strokeWidth="2.5" />
              </>
            )}
          </g>

          <text
            x="320"
            y="347"
            fontSize="13"
            fontWeight="900"
            fill={palette.accent}
            textAnchor="middle"
            letterSpacing="1"
            fontFamily="system-ui, sans-serif"
          >
            {threatTier.label}
          </text>

          <rect x="420" y="0" width="220" height={CARD_HEIGHT} rx="16" fill="url(#sideBg)" stroke={palette.accentDark} />
          <rect x="420" y="0" width="220" height={CARD_HEIGHT} rx="16" fill="url(#cardTexture)" />
          <rect
            x="421"
            y="1"
            width="218"
            height={CARD_HEIGHT - 2}
            rx="15"
            fill="none"
            stroke="#475569"
            strokeOpacity="0.4"
          />

          <rect x="450" y="36" width="160" height="24" rx="4" fill="url(#ribbonGrad)" />
          <text
            x="530"
            y="52"
            fontSize="12"
            fontWeight="900"
            fill="#ffffff"
            textAnchor="middle"
            letterSpacing="1"
            fontFamily="system-ui, sans-serif"
          >
            {threatTier.emoji} {threatTier.label} {threatTier.emoji}
          </text>

          <text x="444" y="84" fontSize="11.5" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            🏆 {wins}-{losses} record
          </text>
          <line x1="444" y1="94" x2="616" y2="94" stroke="#3f1d5c" />
          <text x="444" y="122" fontSize="11.5" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            🔥 Best streak: {winStreak} games
          </text>
          <line x1="444" y1="132" x2="616" y2="132" stroke="#3f1d5c" />
          <text x="444" y="160" fontSize="11.5" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            🏆 {winsInLast10} wins in last 10 games
          </text>
          <line x1="444" y1="170" x2="616" y2="170" stroke="#3f1d5c" />
          <text x="444" y="198" fontSize="11.5" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            📈 {trendLabel} percentage points
          </text>
          <line x1="444" y1="208" x2="616" y2="208" stroke="#3f1d5c" />
          <text x="444" y="236" fontSize="11.5" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            ⚔️ {winsVsHigherRated} wins vs higher-rated
          </text>
          <line x1="444" y1="246" x2="616" y2="246" stroke="#3f1d5c" />
          <text x="444" y="274" fontSize="11.5" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            🎾 {totalMatches} matches played
          </text>

          <rect x="445" y="294" width="170" height="32" rx="6" fill="none" stroke={palette.accent} strokeWidth="1" />
          <text
            x="530"
            y="314"
            fontSize="10.5"
            fontWeight="800"
            fill={palette.accent}
            textAnchor="middle"
            fontFamily="system-ui, sans-serif"
          >
            ☠️ {statusLine.toUpperCase()}
          </text>
          </g>
          {celebrationLabel && (
            <>
              <rect x="0" y="0" width={CARD_WIDTH} height={BANNER_HEIGHT} rx="0" fill="url(#ribbonGrad)" />
              <text
                x={CARD_WIDTH / 2}
                y={BANNER_HEIGHT / 2 - 6}
                fontSize="16"
                fontWeight="900"
                fill="#ffffff"
                textAnchor="middle"
                letterSpacing="1"
                fontFamily="system-ui, sans-serif"
              >
                🏆 {celebrationLabel} 🏆
              </text>
              <text
                x={CARD_WIDTH / 2}
                y={BANNER_HEIGHT / 2 + 14}
                fontSize="11"
                fontWeight="700"
                fill="#fef3c7"
                textAnchor="middle"
                letterSpacing="2"
                fontFamily="system-ui, sans-serif"
              >
                CONGRATULATIONS
              </text>
              {[40, 120, 200, 440, 520, 600].map((x, i) => (
                <circle key={x} cx={x} cy={i % 2 === 0 ? 10 : 34} r="2.5" fill="#fef3c7" opacity="0.8" />
              ))}
            </>
          )}
        </svg>
      </button>
      <p className="text-xs text-muted mt-1.5">Click the card to share or download it as an image.</p>
      {status === 'error' && (
        <p className="text-xs text-red-600 mt-1">Couldn&apos;t generate the image. Try again.</p>
      )}
    </div>
  );
}
