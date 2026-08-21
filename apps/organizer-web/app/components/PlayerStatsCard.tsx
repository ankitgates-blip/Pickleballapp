'use client';

import { useRef, useState } from 'react';
import { threatTierFor } from '@/lib/stats/threatLevel';
import { formTierFor } from '@/lib/stats/form';
import { sanitizeFileNamePart } from '@/lib/pdf/pdfShare';

export type PlayerStatsCardProps = {
  name: string;
  photoUrl: string | null;
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
};

const CARD_WIDTH = 640;
const CARD_HEIGHT = 360;

type TierPalette = { accent: string; accentDark: string };

const THREAT_PALETTE: Record<string, TierPalette> = {
  'LOW THREAT': { accent: '#16a34a', accentDark: '#052e16' },
  'WATCH OUT': { accent: '#ca8a04', accentDark: '#1c1503' },
  DANGEROUS: { accent: '#ea580c', accentDark: '#1c0a03' },
  'HIGH THREAT': { accent: '#dc2626', accentDark: '#1c0505' },
  'DO NOT PLAY': { accent: '#c026d3', accentDark: '#1a0526' },
};

const STATUS_LINES: Record<string, string> = {
  'LOW THREAT': 'Just warming up.',
  'WATCH OUT': 'Getting dangerous.',
  DANGEROUS: "Don't underestimate.",
  'HIGH THREAT': 'Serious competition.',
  'DO NOT PLAY': 'You have been warned.',
};

const FORM_COLORS: Record<string, string> = {
  COLD: '#38bdf8',
  'COOLING OFF': '#60a5fa',
  STEADY: '#94a3b8',
  'IN FORM': '#4ade80',
  'ON FIRE': '#f97316',
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
}: PlayerStatsCardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [status, setStatus] = useState<'idle' | 'generating' | 'error'>('idle');

  const threatTier = threatTierFor(threatPercentage);
  const formTier = formTierFor(formPercentage);
  const palette = THREAT_PALETTE[threatTier.label] ?? THREAT_PALETTE['LOW THREAT'];
  const statusLine = STATUS_LINES[threatTier.label] ?? 'Just warming up.';
  const formColor = FORM_COLORS[formTier.label] ?? '#94a3b8';
  const chevronCount = CHEVRON_COUNT[threatTier.label] ?? 1;
  const chevronYs = chevronYPositions(chevronCount);
  const isDoNotPlay = threatTier.label === 'DO NOT PLAY';
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const trendLabel =
    trendPoints === null ? '—' : trendPoints > 0 ? `+${trendPoints}` : `${trendPoints}`;
  const meterWidth = (Math.max(0, Math.min(100, threatPercentage)) / 100) * 102;

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
      canvas.height = CARD_HEIGHT * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(svgUrl);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      );
      if (!blob) throw new Error('Failed to generate image');

      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${sanitizeFileNamePart(name)}-stats-card.png`;
      link.click();
      URL.revokeObjectURL(downloadUrl);
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
          height={CARD_HEIGHT}
          viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}
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
            <linearGradient id="shieldGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={palette.accent} />
              <stop offset="100%" stopColor={palette.accentDark} />
            </linearGradient>
            <linearGradient id="wingL" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={palette.accent} stopOpacity="0.1" />
              <stop offset="100%" stopColor={palette.accent} stopOpacity="0.85" />
            </linearGradient>
            <linearGradient id="wingR" x1="1" y1="0" x2="0" y2="0">
              <stop offset="0%" stopColor={palette.accent} stopOpacity="0.1" />
              <stop offset="100%" stopColor={palette.accent} stopOpacity="0.85" />
            </linearGradient>
            <linearGradient id="ribbonGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={palette.accentDark} />
              <stop offset="50%" stopColor={palette.accent} />
              <stop offset="100%" stopColor={palette.accentDark} />
            </linearGradient>
            <clipPath id="photoClip">
              <circle cx="66" cy="64" r="34" />
            </clipPath>
          </defs>

          <rect x="0" y="0" width="410" height={CARD_HEIGHT} rx="16" fill="url(#mainBg)" />

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
              <circle cx="66" cy="64" r="34" fill="#3f3f46" />
              <text
                x="66"
                y="73"
                fontSize="26"
                fontWeight="700"
                fill="#fbbf24"
                textAnchor="middle"
                fontFamily="system-ui, sans-serif"
              >
                {initial}
              </text>
            </>
          )}

          <text x="118" y="50" fontSize="23" fontWeight="900" fill="#f8fafc" fontFamily="system-ui, sans-serif">
            {name}
          </text>
          <text x="118" y="68" fontSize="10" fill="#94a3b8" letterSpacing="1" fontFamily="system-ui, sans-serif">
            PICKLERALLY DXB PLAYER CARD
          </text>

          <rect x="18" y="94" width="118" height="60" rx="8" fill="#1c1917" stroke="#3f3f46" />
          <text x="77" y="122" fontSize="21" fontWeight="800" fill="#f8fafc" textAnchor="middle" fontFamily="system-ui, sans-serif">
            {rating.toFixed(2)}
          </text>
          <text x="77" y="136" fontSize="8" fill="#94a3b8" textAnchor="middle" letterSpacing="1" fontFamily="system-ui, sans-serif">
            RATING
          </text>
          <text x="77" y="149" fontSize="11" fill="#fbbf24" textAnchor="middle" fontFamily="system-ui, sans-serif">
            {renderStarRow(starCount)}
          </text>

          <rect x="144" y="94" width="118" height="60" rx="8" fill="#1c1917" stroke="#3f3f46" />
          <text x="203" y="122" fontSize="21" fontWeight="800" fill={formColor} textAnchor="middle" fontFamily="system-ui, sans-serif">
            {formPercentage}
          </text>
          <text x="203" y="136" fontSize="8" fill="#94a3b8" textAnchor="middle" letterSpacing="1" fontFamily="system-ui, sans-serif">
            FORM
          </text>
          <text x="203" y="149" fontSize="11" fill={formColor} textAnchor="middle" fontFamily="system-ui, sans-serif">
            {formTier.emoji} {formTier.label}
          </text>

          <rect x="270" y="94" width="118" height="60" rx="8" fill="#1c1917" stroke="#3f3f46" />
          <text x="329" y="122" fontSize="21" fontWeight="800" fill={palette.accent} textAnchor="middle" fontFamily="system-ui, sans-serif">
            {threatPercentage}
          </text>
          <text x="329" y="136" fontSize="8" fill="#94a3b8" textAnchor="middle" letterSpacing="1" fontFamily="system-ui, sans-serif">
            THREAT LVL
          </text>
          <rect x="278" y="140" width="102" height="6" rx="3" fill="#3f3f46" />
          <rect x="278" y="140" width={meterWidth} height="6" rx="3" fill={palette.accent} />

          <g transform="translate(133,168) scale(0.8)">
            <path d="M78 40 L18 30 L26 38 L18 46 L30 50 L20 58 L34 60 L78 52 Z" fill="url(#wingL)" />
            <path d="M102 40 L162 30 L154 38 L162 46 L150 50 L160 58 L146 60 L102 52 Z" fill="url(#wingR)" />
            <path
              d="M90 20 L128 34 L128 78 C128 112 110 132 90 142 C70 132 52 112 52 78 L52 34 Z"
              fill="url(#shieldGrad)"
              stroke={palette.accent}
              strokeWidth="2"
            />
            <circle cx="90" cy="46" r="11" fill="#e4e4e7" stroke="#a1a1aa" strokeWidth="1" />
            <circle cx="86" cy="42" r="1.2" fill="#71717a" />
            <circle cx="94" cy="42" r="1.2" fill="#71717a" />
            <circle cx="90" cy="47" r="1.2" fill="#71717a" />
            <circle cx="85" cy="50" r="1.2" fill="#71717a" />
            <circle cx="95" cy="50" r="1.2" fill="#71717a" />
            {chevronYs.map((y) => (
              <path
                key={y}
                d={`M68 ${y} L90 ${y + 12} L112 ${y}`}
                fill="none"
                stroke={palette.accent}
                strokeWidth="6"
                strokeLinecap="round"
              />
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

          <rect x="155" y="308" width="100" height="16" rx="3" fill="url(#ribbonGrad)" />
          <text
            x="205"
            y="319"
            fontSize="10"
            fontWeight="900"
            fill="#ffffff"
            textAnchor="middle"
            letterSpacing="1"
            fontFamily="system-ui, sans-serif"
          >
            {threatTier.label}
          </text>

          <line x1="18" y1="330" x2="392" y2="330" stroke="#292524" />
          <text x="65" y="348" fontSize="13" textAnchor="middle" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            🏆 {wins}-{losses}
          </text>
          <text x="158" y="348" fontSize="13" textAnchor="middle" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            🔥 {winStreak}
          </text>
          <text x="252" y="348" fontSize="13" textAnchor="middle" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            📈 {trendLabel}
          </text>
          <text x="345" y="348" fontSize="13" textAnchor="middle" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            ⚔️ {winsVsHigherRated}
          </text>

          <rect x="420" y="0" width="220" height={CARD_HEIGHT} rx="16" fill="url(#sideBg)" stroke={palette.accentDark} />

          <text
            x="530"
            y="38"
            fontSize="14"
            fontWeight="900"
            fill="#f8fafc"
            textAnchor="middle"
            fontFamily="system-ui, sans-serif"
          >
            🚨 THREAT LEVEL: <tspan fill={palette.accent}>{threatPercentage}</tspan>
          </text>

          <rect x="450" y="52" width="160" height="24" rx="4" fill="url(#ribbonGrad)" />
          <text
            x="530"
            y="68"
            fontSize="12"
            fontWeight="900"
            fill="#ffffff"
            textAnchor="middle"
            letterSpacing="1"
            fontFamily="system-ui, sans-serif"
          >
            {threatTier.emoji} {threatTier.label} {threatTier.emoji}
          </text>

          <text x="444" y="110" fontSize="11.5" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            🔥 {winStreak}-game winning streak
          </text>
          <line x1="444" y1="122" x2="616" y2="122" stroke="#3f1d5c" />
          <text x="444" y="155" fontSize="11.5" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            🏆 {winsInLast10} wins in last 10 games
          </text>
          <line x1="444" y1="167" x2="616" y2="167" stroke="#3f1d5c" />
          <text x="444" y="200" fontSize="11.5" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            📈 {trendLabel} percentage points
          </text>
          <line x1="444" y1="212" x2="616" y2="212" stroke="#3f1d5c" />
          <text x="444" y="245" fontSize="11.5" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            ⚔️ {winsVsHigherRated} wins vs higher-rated
          </text>
          <line x1="444" y1="257" x2="616" y2="257" stroke="#3f1d5c" />
          <text x="444" y="290" fontSize="11.5" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            🎾 {totalMatches} matches played
          </text>

          <rect x="445" y="310" width="170" height="32" rx="6" fill="none" stroke={palette.accent} strokeWidth="1" />
          <text
            x="530"
            y="330"
            fontSize="10.5"
            fontWeight="800"
            fill={palette.accent}
            textAnchor="middle"
            fontFamily="system-ui, sans-serif"
          >
            ☠️ {statusLine.toUpperCase()}
          </text>
        </svg>
      </button>
      <p className="text-xs text-slate-400 mt-1.5">Click the card to download it as an image.</p>
      {status === 'error' && (
        <p className="text-xs text-red-600 mt-1">Couldn&apos;t generate the image. Try again.</p>
      )}
    </div>
  );
}
