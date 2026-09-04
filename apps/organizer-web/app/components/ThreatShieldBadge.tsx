'use client';

import { useId } from 'react';
import type { ThreatTier } from '@/lib/stats/threatLevel';

export type ThreatShieldBadgeProps = {
  tier: ThreatTier;
  size?: number;
};

const SHIELD_PATH = 'M22 2 L40 9 L40 26 C40 38 32 46 22 50 C12 46 4 38 4 26 L4 9 Z';

// One small decorative glyph per tier, sitting above the letter inside the shield --
// matches the reference (crossed paddles / star / wings / flame / crown), each
// simple enough to survive rasterization to PNG (plain shapes, no emoji, no icon
// font) the same way this app's other exportable cards already have to.
function TierGlyph({ label, color }: { label: string; color: string }) {
  switch (label) {
    case 'ROOKIE':
      // Two crossed paddles -- an oval head + handle, rotated opposite ways about
      // the crossing point so the heads land apart (an X), not stacked into a heart.
      return (
        <g>
          <g transform="rotate(-45 22 17)">
            <ellipse cx="22" cy="9.8" rx="3.4" ry="5" fill={color} fillOpacity="0.9" />
            <line x1="22" y1="14.8" x2="22" y2="25" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
          </g>
          <g transform="rotate(45 22 17)">
            <ellipse cx="22" cy="9.8" rx="3.4" ry="5" fill={color} fillOpacity="0.9" />
            <line x1="22" y1="14.8" x2="22" y2="25" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
          </g>
        </g>
      );
    case 'CONTENDER':
      // Standard 5-point star, point-up.
      return (
        <path
          d="M22 9.5 L24.6 15 L30.5 15.8 L26.2 19.9 L27.3 25.8 L22 22.9 L16.7 25.8 L17.8 19.9 L13.5 15.8 L19.4 15 Z"
          fill={color}
        />
      );
    case 'ENFORCER':
      // Two filled wings fanning out from a center point.
      return (
        <g fill={color}>
          <path d="M22 17 C17.5 15.2 12.5 16.8 9.5 21.5 C13 19.8 16 19.6 18.7 20.5 C15.8 21.8 13 23.7 11 26.5 C15 24.6 18 23.2 21 21.3 Z" />
          <path d="M22 17 C26.5 15.2 31.5 16.8 34.5 21.5 C31 19.8 28 19.6 25.3 20.5 C28.2 21.8 31 23.7 33 26.5 C29 24.6 26 23.2 23 21.3 Z" />
        </g>
      );
    case 'APEX THREAT':
      // Classic flame silhouette with an inner cutout for depth.
      return (
        <g>
          <path
            d="M22 9 C26 13.2 27.8 16.8 25.5 20.2 C24.6 21.5 22.9 21.8 22.3 20.5 C23.3 18.4 21.8 16.9 20.5 18.6 C18.7 21 19.3 23.8 21.8 25.3 C18.7 25 15.8 22.5 15.8 18.4 C15.8 14.3 18.8 11.5 22 9 Z"
            fill={color}
          />
          <path
            d="M22.3 16 C23.4 17.8 23.5 19.3 22.2 20.3 C21.3 21 20.3 20.1 20.9 19.1 C21.6 18 22.1 17 22.3 16 Z"
            fill="#0f172a"
            fillOpacity="0.55"
          />
        </g>
      );
    default:
      // Crown -- three points, a base band, and a small gem on each point.
      return (
        <g>
          <path d="M11.5 22.5 L15.5 10.5 L22 17.2 L28.5 10.5 L32.5 22.5 Z" fill={color} />
          <rect x="11.5" y="21.5" width="21" height="3.6" rx="1.2" fill={color} />
          <circle cx="15.5" cy="10.5" r="1.4" fill="#fde68a" />
          <circle cx="22" cy="17.2" r="1.4" fill="#fde68a" />
          <circle cx="28.5" cy="10.5" r="1.4" fill="#fde68a" />
        </g>
      );
  }
}

// Not tier.label's first letter -- "Contender" and "Court Dominator" both start
// with C, which would put the same letter in two different tiers' badges.
const TIER_LETTER: Record<string, string> = {
  ROOKIE: 'R',
  CONTENDER: 'C',
  ENFORCER: 'E',
  'APEX THREAT': 'A',
  'COURT DOMINATOR': 'D',
};

// Shield badge for a Threat Tier -- the identity mark (used at small inline size
// next to a name, and larger in the Threat Tiers legend) separate from the
// number-over-gradient-bar meter in ThreatBadge, which shows the raw score.
//
// Depth is layered on in four passes, back to front: a drop shadow (feDropShadow
// on the whole group), a dark navy->near-black gradient fill (instead of a flat
// color) for a beveled/embossed feel, a tier-colored radial glow behind the icon,
// then a diagonal glass-like highlight streak clipped to the shield's own outline.
// useId keeps every gradient/filter/clip id unique per rendered badge -- several
// of these can appear on one page (a roster list, the tiers legend) and SVG ids
// are global to the document, so a hardcoded id would have the last badge's
// gradient silently win for every earlier one.
export default function ThreatShieldBadge({ tier, size = 44 }: ThreatShieldBadgeProps) {
  const letter = TIER_LETTER[tier.label] ?? tier.label.trim().charAt(0);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gradId = `tsbGrad${uid}`;
  const glowId = `tsbGlow${uid}`;
  const clipId = `tsbClip${uid}`;
  const shadowId = `tsbShadow${uid}`;
  const haloBlurId = `tsbHaloBlur${uid}`;

  return (
    <svg
      width={size}
      height={size * (52 / 44)}
      viewBox="0 0 44 52"
      role="img"
      aria-label={`${tier.label} tier badge`}
      overflow="visible"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#243044" />
          <stop offset="55%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#050810" />
        </linearGradient>
        <radialGradient id={glowId} cx="50%" cy="34%" r="55%">
          <stop offset="0%" stopColor={tier.accent} stopOpacity="0.55" />
          <stop offset="100%" stopColor={tier.accent} stopOpacity="0" />
        </radialGradient>
        <clipPath id={clipId}>
          <path d={SHIELD_PATH} />
        </clipPath>
        <filter id={shadowId} x="-60%" y="-30%" width="220%" height="190%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2.2" floodColor="#000000" floodOpacity="0.5" />
        </filter>
        <filter id={haloBlurId} x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
      </defs>
      {/* Outer glow -- a blurred, tier-colored copy of the shield sitting behind
          everything else, bleeding past the crisp edge like a lit emblem. */}
      <path d={SHIELD_PATH} fill={tier.accent} opacity="0.55" filter={`url(#${haloBlurId})`} />
      <g filter={`url(#${shadowId})`}>
        <path d={SHIELD_PATH} fill={`url(#${gradId})`} stroke={tier.accent} strokeWidth="2.5" />
        <g clipPath={`url(#${clipId})`}>
          <path d={SHIELD_PATH} fill={`url(#${glowId})`} />
          {/* Glass highlight streak, upper-left */}
          <path d="M8 10 L16 6.5 L11.5 25 L6 28.5 Z" fill="#ffffff" fillOpacity="0.16" />
          {/* Inner bevel edge, just inside the outer stroke */}
          <path
            d={SHIELD_PATH}
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.18"
            strokeWidth="1"
            transform="translate(22 26) scale(0.93) translate(-22 -26)"
          />
        </g>
        <TierGlyph label={tier.label} color={tier.accent} />
        <text
          x="22"
          y="38.7"
          fontSize="15"
          fontWeight="800"
          fill="#000000"
          fillOpacity="0.55"
          textAnchor="middle"
          fontFamily="var(--font-oswald), Oswald, sans-serif"
        >
          {letter}
        </text>
        <text
          x="22"
          y="38"
          fontSize="15"
          fontWeight="800"
          fill={tier.accent}
          textAnchor="middle"
          fontFamily="var(--font-oswald), Oswald, sans-serif"
        >
          {letter}
        </text>
      </g>
    </svg>
  );
}
