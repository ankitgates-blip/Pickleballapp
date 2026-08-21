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
const CARD_HEIGHT = 310;

type TierPalette = { accent: string; accentDark: string };

const THREAT_PALETTE: Record<string, TierPalette> = {
  'LOW THREAT': { accent: '#16a34a', accentDark: '#052e16' },
  'WATCH OUT': { accent: '#ca8a04', accentDark: '#1c1503' },
  DANGEROUS: { accent: '#ea580c', accentDark: '#1c0a03' },
  'HIGH THREAT': { accent: '#dc2626', accentDark: '#1c0505' },
  'DO NOT PLAY': { accent: '#c026d3', accentDark: '#1a0526' },
};

const RISK_LABELS: Record<string, string> = {
  'LOW THREAT': 'LOW RISK',
  'WATCH OUT': 'MODERATE RISK',
  DANGEROUS: 'ELEVATED RISK',
  'HIGH THREAT': 'HIGH RISK',
  'DO NOT PLAY': 'CRITICAL RISK',
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

function renderStarRow(count: number): string {
  return '★'.repeat(count) + '☆'.repeat(5 - count);
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
  const riskLabel = RISK_LABELS[threatTier.label] ?? 'LOW RISK';
  const statusLine = STATUS_LINES[threatTier.label] ?? 'Just warming up.';
  const formColor = FORM_COLORS[formTier.label] ?? '#94a3b8';
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const trendLabel =
    trendPoints === null ? '—' : trendPoints > 0 ? `+${trendPoints}` : `${trendPoints}`;
  const meterWidth = (Math.max(0, Math.min(100, threatPercentage)) / 100) * 102;

  const handleDownload = async () => {
    if (!svgRef.current) return;
    setStatus('generating');
    try {
      const svgString = new XMLSerializer().serializeToString(svgRef.current);
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
        className="cursor-pointer border-0 bg-transparent p-0"
        aria-label="Download Player Stats Card as an image"
      >
        <svg
          ref={svgRef}
          width={CARD_WIDTH}
          height={CARD_HEIGHT}
          viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}
          xmlns="http://www.w3.org/2000/svg"
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
            <clipPath id="photoClip">
              <circle cx="66" cy="64" r="34" />
            </clipPath>
          </defs>

          <rect x="0" y="0" width="410" height="310" rx="16" fill="url(#mainBg)" />

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

          <text x="118" y="52" fontSize="21" fontWeight="800" fill="#7dd3fc" fontFamily="system-ui, sans-serif">
            {name}
          </text>
          <text x="118" y="70" fontSize="10" fill="#94a3b8" letterSpacing="1" fontFamily="system-ui, sans-serif">
            PICKLERALLY DXB PLAYER CARD
          </text>

          <rect x="18" y="96" width="118" height="58" rx="8" fill="#1c1917" stroke="#3f3f46" />
          <text x="77" y="120" fontSize="19" fontWeight="800" fill="#f8fafc" textAnchor="middle" fontFamily="system-ui, sans-serif">
            {rating.toFixed(2)}
          </text>
          <text x="77" y="133" fontSize="8" fill="#94a3b8" textAnchor="middle" letterSpacing="1" fontFamily="system-ui, sans-serif">
            RATING
          </text>
          <text x="77" y="146" fontSize="10" fill="#fbbf24" textAnchor="middle" fontFamily="system-ui, sans-serif">
            {renderStarRow(starCount)}
          </text>

          <rect x="144" y="96" width="118" height="58" rx="8" fill="#1c1917" stroke="#3f3f46" />
          <text x="203" y="120" fontSize="19" fontWeight="800" fill={formColor} textAnchor="middle" fontFamily="system-ui, sans-serif">
            {formPercentage}
          </text>
          <text x="203" y="133" fontSize="8" fill="#94a3b8" textAnchor="middle" letterSpacing="1" fontFamily="system-ui, sans-serif">
            FORM
          </text>
          <text x="203" y="147" fontSize="10" fill={formColor} textAnchor="middle" fontFamily="system-ui, sans-serif">
            {formTier.emoji} {formTier.label}
          </text>

          <rect x="270" y="96" width="118" height="58" rx="8" fill="#1c1917" stroke="#3f3f46" />
          <text x="329" y="120" fontSize="19" fontWeight="800" fill={palette.accent} textAnchor="middle" fontFamily="system-ui, sans-serif">
            {threatPercentage}
          </text>
          <text x="329" y="133" fontSize="8" fill="#94a3b8" textAnchor="middle" letterSpacing="1" fontFamily="system-ui, sans-serif">
            THREAT LVL
          </text>
          <rect x="278" y="140" width="102" height="6" rx="3" fill="#3f3f46" />
          <rect x="278" y="140" width={meterWidth} height="6" rx="3" fill={palette.accent} />

          <path
            d="M205 168 L245 182 L245 210 C245 235 227 250 205 258 C183 250 165 235 165 210 L165 182 Z"
            fill="url(#shieldGrad)"
            stroke={palette.accent}
            strokeWidth="1.5"
          />
          <text x="205" y="205" fontSize="26" textAnchor="middle" fontFamily="system-ui, sans-serif">
            {threatTier.emoji}
          </text>
          <text
            x="205"
            y="275"
            fontSize="14"
            fontWeight="900"
            fill={palette.accent}
            textAnchor="middle"
            letterSpacing="1"
            fontFamily="system-ui, sans-serif"
          >
            {threatTier.label}
          </text>

          <line x1="18" y1="290" x2="392" y2="290" stroke="#292524" />
          <text x="59" y="304" fontSize="10" textAnchor="middle" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            🏆 {wins}-{losses}
          </text>
          <text x="141" y="304" fontSize="10" textAnchor="middle" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            🔥 {winStreak}
          </text>
          <text x="223" y="304" fontSize="10" textAnchor="middle" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            📈 {trendLabel}
          </text>
          <text x="305" y="304" fontSize="10" textAnchor="middle" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            ⚔️ {winsVsHigherRated}
          </text>
          <text x="374" y="304" fontSize="10" textAnchor="middle" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            🎾 {totalMatches}
          </text>

          <rect x="420" y="0" width="220" height="310" rx="16" fill="url(#sideBg)" stroke={palette.accentDark} />
          <text
            x="530"
            y="30"
            fontSize="11"
            fontWeight="700"
            fill="#f8fafc"
            textAnchor="middle"
            letterSpacing="2"
            fontFamily="system-ui, sans-serif"
          >
            PLAYER STATUS
          </text>

          <text x="530" y="80" fontSize="40" textAnchor="middle" fontFamily="system-ui, sans-serif">
            {threatTier.emoji}
          </text>
          <text x="530" y="100" fontSize="10" fontWeight="700" fill={palette.accent} textAnchor="middle" fontFamily="system-ui, sans-serif">
            STATUS: {riskLabel}
          </text>
          <text
            x="530"
            y="125"
            fontSize="19"
            fontWeight="900"
            fill={palette.accent}
            textAnchor="middle"
            letterSpacing="1"
            fontFamily="system-ui, sans-serif"
          >
            {threatTier.label}
          </text>

          <text x="444" y="155" fontSize="10.5" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            🔥 {winStreak}-game winning streak
          </text>
          <text x="444" y="176" fontSize="10.5" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            🏆 {winsInLast10} wins in last 10 games
          </text>
          <text x="444" y="197" fontSize="10.5" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            📈 {trendLabel} percentage points
          </text>
          <text x="444" y="218" fontSize="10.5" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            ⚔️ {winsVsHigherRated} wins vs higher-rated
          </text>
          <text x="444" y="239" fontSize="10.5" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            🎾 {totalMatches} matches played
          </text>

          <text
            x="530"
            y="284"
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
