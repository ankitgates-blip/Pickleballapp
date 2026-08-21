# Player Stats Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live "Player Stats Card" section to the Player Detail
page — an SVG trading-card replica of the reference image, built from
real (and honestly-derived) player stats, downloadable as a PNG on click.

**Architecture:** New small pure functions in `lib/stats/` compute the
stats the app doesn't already have (win streak, wins in last 10, wins vs
higher-rated opponents, a "Form" tier classifier). A new Client Component
`PlayerStatsCard` renders the card as inline SVG and handles the
click-to-download PNG conversion via an offscreen canvas — no new npm
dependency. The Player Detail page computes all the card's inputs from
data it already fetches and renders the component in a new section.

**Tech Stack:** React (Client Component), inline SVG, Canvas 2D API
(`OffscreenCanvas`-free — uses a regular `<canvas>` element), Vitest.

## Global Constraints

- Card title on the page: **"Player Stats Card"**.
- Clicking the card downloads it as a PNG — no separate button, no
  Web Share API integration (unlike the existing PDF export).
- Stats shown: Rating (derived, `winRate/100*5`), Form (this month's win
  %, falls back to overall), Threat Level (overall win %, already
  shipped), Trend (weekly win % change in points), Win Streak, Wins in
  Last 10, Wins vs Higher-Rated (derived), Record (W-L), and **Total
  Matches Played**.
- No new rating/ELO system — Rating/Form/Wins-vs-Higher-Rated stay
  explicitly derived approximations from existing win-rate data.
- A player with zero completed matches still shows the card (with 0s),
  never a crash or a missing section.
- No database migration.
- No public share-page (`/p/[id]`) placement — Player Detail page only.

---

### Task 1: Win-history stat functions

**Files:**
- Create: `apps/organizer-web/lib/stats/winStreak.ts`
- Create: `apps/organizer-web/lib/stats/winStreak.test.ts`
- Create: `apps/organizer-web/lib/stats/winsInLastN.ts`
- Create: `apps/organizer-web/lib/stats/winsInLastN.test.ts`
- Create: `apps/organizer-web/lib/stats/winsVsHigherRated.ts`
- Create: `apps/organizer-web/lib/stats/winsVsHigherRated.test.ts`

**Interfaces:**
- Consumes: `PersonMatchRecord` type from `./types` (existing — has
  `won: boolean` and `opponentIds: [string, string]`, among other
  fields already used elsewhere in this codebase).
- Produces:
  - `currentWinStreak(mostRecentFirst: PersonMatchRecord[]): number`
  - `winsInLastN(mostRecentFirst: PersonMatchRecord[], n: number): number`
  - `winsVsHigherRated(matches: PersonMatchRecord[], ownWinPercentage: number, winPercentageByPersonId: Map<string, number | null>): number`

  All three expect their `matches`/`mostRecentFirst` argument already
  sorted most-recent-first — exactly the order `stats.matchHistory`
  (from `computePersonStats`, already used throughout `people/[id]/page.tsx`)
  is already in. Task 4 wires these to that existing sorted array — no
  new sorting logic anywhere in this feature.

- [ ] **Step 1: Write the failing tests**

Create `apps/organizer-web/lib/stats/winStreak.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { currentWinStreak } from './winStreak';
import type { PersonMatchRecord } from './types';

function match(won: boolean): PersonMatchRecord {
  return {
    tournamentId: 't1',
    tournamentDate: '2026-01-01',
    venueName: 'Pickle Turf',
    partnerId: 'p1',
    opponentIds: ['o1', 'o2'],
    scoreFor: won ? 11 : 5,
    scoreAgainst: won ? 5 : 11,
    won,
  };
}

describe('currentWinStreak', () => {
  it('returns 0 when the most recent match is a loss', () => {
    expect(currentWinStreak([match(false), match(true)])).toBe(0);
  });

  it('counts consecutive wins from the most recent match', () => {
    expect(currentWinStreak([match(true), match(true), match(false), match(true)])).toBe(2);
  });

  it('returns the full length when every match was won', () => {
    expect(currentWinStreak([match(true), match(true), match(true)])).toBe(3);
  });

  it('returns 0 for an empty match history', () => {
    expect(currentWinStreak([])).toBe(0);
  });
});
```

Create `apps/organizer-web/lib/stats/winsInLastN.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { winsInLastN } from './winsInLastN';
import type { PersonMatchRecord } from './types';

function match(won: boolean): PersonMatchRecord {
  return {
    tournamentId: 't1',
    tournamentDate: '2026-01-01',
    venueName: 'Pickle Turf',
    partnerId: 'p1',
    opponentIds: ['o1', 'o2'],
    scoreFor: won ? 11 : 5,
    scoreAgainst: won ? 5 : 11,
    won,
  };
}

describe('winsInLastN', () => {
  it('counts wins among the most recent N matches', () => {
    const history = [match(true), match(true), match(false), match(true)];
    expect(winsInLastN(history, 3)).toBe(2);
  });

  it('uses the full history when there are fewer matches than N', () => {
    const history = [match(true), match(false)];
    expect(winsInLastN(history, 10)).toBe(1);
  });

  it('returns 0 for an empty match history', () => {
    expect(winsInLastN([], 10)).toBe(0);
  });
});
```

Create `apps/organizer-web/lib/stats/winsVsHigherRated.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { winsVsHigherRated } from './winsVsHigherRated';
import type { PersonMatchRecord } from './types';

function win(opponentIds: [string, string]): PersonMatchRecord {
  return {
    tournamentId: 't1',
    tournamentDate: '2026-01-01',
    venueName: 'Pickle Turf',
    partnerId: 'p1',
    opponentIds,
    scoreFor: 11,
    scoreAgainst: 5,
    won: true,
  };
}

function loss(opponentIds: [string, string]): PersonMatchRecord {
  return {
    tournamentId: 't1',
    tournamentDate: '2026-01-01',
    venueName: 'Pickle Turf',
    partnerId: 'p1',
    opponentIds,
    scoreFor: 5,
    scoreAgainst: 11,
    won: false,
  };
}

describe('winsVsHigherRated', () => {
  it("counts a win when the opponent side's average win % is higher", () => {
    const history = [win(['a', 'b'])];
    const winPercentageByPersonId = new Map([
      ['a', 80],
      ['b', 70],
    ]);
    expect(winsVsHigherRated(history, 50, winPercentageByPersonId)).toBe(1);
  });

  it('does not count a win when the opponent side is not higher-rated', () => {
    const history = [win(['a', 'b'])];
    const winPercentageByPersonId = new Map([
      ['a', 30],
      ['b', 20],
    ]);
    expect(winsVsHigherRated(history, 50, winPercentageByPersonId)).toBe(0);
  });

  it('ignores losses even against higher-rated opponents', () => {
    const history = [loss(['a', 'b'])];
    const winPercentageByPersonId = new Map([
      ['a', 90],
      ['b', 90],
    ]);
    expect(winsVsHigherRated(history, 50, winPercentageByPersonId)).toBe(0);
  });

  it('treats a missing win percentage as 0', () => {
    const history = [win(['unknown', 'b'])];
    const winPercentageByPersonId = new Map([['b', 90]]);
    // average of (0 + 90) / 2 = 45, less than own 50 -> not counted
    expect(winsVsHigherRated(history, 50, winPercentageByPersonId)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/organizer-web && npx vitest run lib/stats/winStreak.test.ts lib/stats/winsInLastN.test.ts lib/stats/winsVsHigherRated.test.ts`
Expected: FAIL — none of the three source files exist yet.

- [ ] **Step 3: Implement the three functions**

Create `apps/organizer-web/lib/stats/winStreak.ts`:

```typescript
import type { PersonMatchRecord } from './types';

export function currentWinStreak(mostRecentFirst: PersonMatchRecord[]): number {
  let streak = 0;
  for (const record of mostRecentFirst) {
    if (!record.won) break;
    streak += 1;
  }
  return streak;
}
```

Create `apps/organizer-web/lib/stats/winsInLastN.ts`:

```typescript
import type { PersonMatchRecord } from './types';

export function winsInLastN(mostRecentFirst: PersonMatchRecord[], n: number): number {
  return mostRecentFirst.slice(0, n).filter((r) => r.won).length;
}
```

Create `apps/organizer-web/lib/stats/winsVsHigherRated.ts`:

```typescript
import type { PersonMatchRecord } from './types';

export function winsVsHigherRated(
  matches: PersonMatchRecord[],
  ownWinPercentage: number,
  winPercentageByPersonId: Map<string, number | null>
): number {
  let count = 0;
  for (const m of matches) {
    if (!m.won) continue;
    const [opponentA, opponentB] = m.opponentIds;
    const pctA = winPercentageByPersonId.get(opponentA) ?? 0;
    const pctB = winPercentageByPersonId.get(opponentB) ?? 0;
    const opponentAveragePercentage = (pctA + pctB) / 2;
    if (opponentAveragePercentage > ownWinPercentage) {
      count += 1;
    }
  }
  return count;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/organizer-web && npx vitest run lib/stats/winStreak.test.ts lib/stats/winsInLastN.test.ts lib/stats/winsVsHigherRated.test.ts`
Expected: PASS — all 11 tests across the 3 files green.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/lib/stats/winStreak.ts apps/organizer-web/lib/stats/winStreak.test.ts apps/organizer-web/lib/stats/winsInLastN.ts apps/organizer-web/lib/stats/winsInLastN.test.ts apps/organizer-web/lib/stats/winsVsHigherRated.ts apps/organizer-web/lib/stats/winsVsHigherRated.test.ts
git commit -m "feat: add win-history stat functions for the Player Stats Card"
```

---

### Task 2: `formTierFor` tier classifier

**Files:**
- Create: `apps/organizer-web/lib/stats/form.ts`
- Create: `apps/organizer-web/lib/stats/form.test.ts`

**Interfaces:**
- Produces: `formTierFor(formPercentage: number): { emoji: string; label: string }`,
  exported from `apps/organizer-web/lib/stats/form.ts`. Task 3's
  `PlayerStatsCard` component imports and calls this.

This mirrors the existing `threatTierFor` in `lib/stats/threatLevel.ts`
(same 5 score bands, same boundary-check style) but with its own
distinct emoji/label set, since "Form" (recent performance) and "Threat
Level" (overall performance) are different concepts shown side by side
on the card.

- [ ] **Step 1: Write the failing tests**

Create `apps/organizer-web/lib/stats/form.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formTierFor } from './form';

describe('formTierFor', () => {
  it('returns ON FIRE at 81 and above', () => {
    expect(formTierFor(81)).toEqual({ emoji: '🔥', label: 'ON FIRE' });
    expect(formTierFor(100)).toEqual({ emoji: '🔥', label: 'ON FIRE' });
  });

  it('returns IN FORM from 61 to 80', () => {
    expect(formTierFor(61)).toEqual({ emoji: '📈', label: 'IN FORM' });
    expect(formTierFor(80)).toEqual({ emoji: '📈', label: 'IN FORM' });
  });

  it('returns STEADY from 41 to 60', () => {
    expect(formTierFor(41)).toEqual({ emoji: '➖', label: 'STEADY' });
    expect(formTierFor(60)).toEqual({ emoji: '➖', label: 'STEADY' });
  });

  it('returns COOLING OFF from 21 to 40', () => {
    expect(formTierFor(21)).toEqual({ emoji: '📉', label: 'COOLING OFF' });
    expect(formTierFor(40)).toEqual({ emoji: '📉', label: 'COOLING OFF' });
  });

  it('returns COLD below 21', () => {
    expect(formTierFor(20)).toEqual({ emoji: '🧊', label: 'COLD' });
    expect(formTierFor(0)).toEqual({ emoji: '🧊', label: 'COLD' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/organizer-web && npx vitest run lib/stats/form.test.ts`
Expected: FAIL — `./form` does not exist.

- [ ] **Step 3: Implement `formTierFor`**

Create `apps/organizer-web/lib/stats/form.ts`:

```typescript
export type FormTier = {
  emoji: string;
  label: string;
};

export function formTierFor(formPercentage: number): FormTier {
  if (formPercentage >= 81) {
    return { emoji: '🔥', label: 'ON FIRE' };
  }
  if (formPercentage >= 61) {
    return { emoji: '📈', label: 'IN FORM' };
  }
  if (formPercentage >= 41) {
    return { emoji: '➖', label: 'STEADY' };
  }
  if (formPercentage >= 21) {
    return { emoji: '📉', label: 'COOLING OFF' };
  }
  return { emoji: '🧊', label: 'COLD' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/organizer-web && npx vitest run lib/stats/form.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/lib/stats/form.ts apps/organizer-web/lib/stats/form.test.ts
git commit -m "feat: add formTierFor tier classifier"
```

---

### Task 3: `PlayerStatsCard` component

**Files:**
- Create: `apps/organizer-web/app/components/PlayerStatsCard.tsx`

**Interfaces:**
- Consumes: `threatTierFor` from `@/lib/stats/threatLevel` (existing),
  `formTierFor` from `@/lib/stats/form` (Task 2), `sanitizeFileNamePart`
  from `@/lib/pdf/pdfShare` (existing, already used by
  `SharePlayerStatsButton.tsx`).
- Produces: default export `PlayerStatsCard`, a Client Component with
  this exact prop shape — Task 4 constructs and passes these props:

  ```typescript
  export type PlayerStatsCardProps = {
    name: string;
    photoUrl: string | null;
    rating: number; // 0-5, 2 decimal places
    starCount: 1 | 2 | 3 | 4 | 5;
    formPercentage: number; // 0-100
    threatPercentage: number; // 0-100, overall win %
    wins: number;
    losses: number;
    winStreak: number;
    trendPoints: number | null;
    winsVsHigherRated: number;
    totalMatches: number;
    winsInLast10: number;
  };
  ```

This is a UI component with no dedicated test file — per this project's
established convention (see `ThreatBadge.tsx`, which shipped the same
way), correctness here is verified by the build passing and by manual
regression in Task 5.

- [ ] **Step 1: Create the component**

Create `apps/organizer-web/app/components/PlayerStatsCard.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the build**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no TypeScript errors. (This component
isn't imported anywhere yet, so it won't render, but it must compile.)

- [ ] **Step 3: Commit**

```bash
git add apps/organizer-web/app/components/PlayerStatsCard.tsx
git commit -m "feat: add PlayerStatsCard component"
```

---

### Task 4: Wire the card into the Player Detail page

**Files:**
- Modify: `apps/organizer-web/app/people/[id]/page.tsx`

**Interfaces:**
- Consumes: `PlayerStatsCard` (Task 3), `currentWinStreak`,
  `winsInLastN`, `winsVsHigherRated` (Task 1), `winPercentageFromRecords`
  from `@/lib/stats/winRate` (existing, already used elsewhere this
  session for the same organizer-wide win-rate pattern).

- [ ] **Step 1: Add the imports**

Find:

```tsx
import ThreatBadge from '@/app/components/ThreatBadge';
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
```

Replace with:

```tsx
import ThreatBadge from '@/app/components/ThreatBadge';
import PlayerStatsCard from '@/app/components/PlayerStatsCard';
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { winPercentageFromRecords } from '@/lib/stats/winRate';
import { currentWinStreak } from '@/lib/stats/winStreak';
import { winsInLastN } from '@/lib/stats/winsInLastN';
import { winsVsHigherRated } from '@/lib/stats/winsVsHigherRated';
```

- [ ] **Step 2: Compute the organizer-wide win-rate map**

Find:

```tsx
  const records = buildPersonMatchRecords(person.id, completeMatches, teams);

  // Determine which tournaments this person's team won, reusing Increment 1.1's
```

Replace with:

```tsx
  const records = buildPersonMatchRecords(person.id, completeMatches, teams);

  // Overall win rate for every person this organizer has ever seen, computed once from the
  // already-fetched teams/completeMatches — needed for the Wins vs Higher-Rated stat on the
  // Player Stats Card below (separate from this specific player's own winPercentage).
  const winPercentageByPersonId = new Map(
    (allPeople ?? []).map((p) => [
      p.id,
      winPercentageFromRecords(buildPersonMatchRecords(p.id, completeMatches, teams)),
    ])
  );

  // Determine which tournaments this person's team won, reusing Increment 1.1's
```

- [ ] **Step 3: Compute the card's stat props**

Find:

```tsx
  const starLabel = starRatingLabel(stats.winPercentage);
```

Replace with:

```tsx
  const starLabel = starRatingLabel(stats.winPercentage);

  const thisMonthWinPercentage =
    stats.monthly.find((m) => m.period === currentMonthKey)?.winPercentage ?? null;
  const cardRating =
    stats.winPercentage !== null ? Math.round((stats.winPercentage / 100) * 5 * 100) / 100 : 0;
  const cardStarCount = starRating(stats.winPercentage ?? 0);
  const cardFormPercentage = thisMonthWinPercentage ?? stats.winPercentage ?? 0;
  const cardThreatPercentage = stats.winPercentage ?? 0;
  const cardWins = stats.matchHistory.filter((m) => m.won).length;
  const cardLosses = stats.matchHistory.length - cardWins;
  const cardWinStreak = currentWinStreak(stats.matchHistory);
  const cardWinsInLast10 = winsInLastN(stats.matchHistory, 10);
  const cardTrendPoints = stats.weekly[0]?.trendPointsChange ?? null;
  const cardWinsVsHigherRated = winsVsHigherRated(
    stats.matchHistory,
    stats.winPercentage ?? 0,
    winPercentageByPersonId
  );
  const cardTotalMatches = stats.matchHistory.length;
```

- [ ] **Step 4: Render the card**

Find:

```tsx
      {signatureShotBadges.length === 0 && profileSummary && <div className="mb-6" />}

      <div className="mb-6">
        <details>
```

Replace with:

```tsx
      {signatureShotBadges.length === 0 && profileSummary && <div className="mb-6" />}

      <div className="mb-6">
        <h2 className="text-sm font-bold text-slate-700 mb-2">Player Stats Card</h2>
        <PlayerStatsCard
          name={displayName}
          photoUrl={person.photo_url}
          rating={cardRating}
          starCount={cardStarCount}
          formPercentage={cardFormPercentage}
          threatPercentage={cardThreatPercentage}
          wins={cardWins}
          losses={cardLosses}
          winStreak={cardWinStreak}
          trendPoints={cardTrendPoints}
          winsVsHigherRated={cardWinsVsHigherRated}
          totalMatches={cardTotalMatches}
          winsInLast10={cardWinsInLast10}
        />
      </div>

      <div className="mb-6">
        <details>
```

- [ ] **Step 5: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 195 tests pass
(179 existing + 11 win-history tests + 5 `formTierFor` tests from Tasks
1-2).

- [ ] **Step 6: Commit**

```bash
git add "apps/organizer-web/app/people/[id]/page.tsx"
git commit -m "feat: show Player Stats Card on the Player Detail page"
```

---

### Task 5: Push, verify CI, manual regression

**Files:** none (verification-only task). No database migration is
needed — this task touches no schema.

- [ ] **Step 1: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 2: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 3: Manual regression**

- Open a player's `/people/[id]` page. Confirm the "Player Stats Card"
  section renders: gold-ring photo (or initial-letter fallback if the
  player has no photo), name, Rating/Form/Threat Level boxes, the
  tier-colored shield with emoji, the bottom 5-stat row, and the purple
  side panel with its own bullets and warning line — all populated with
  this player's real numbers.
- Click the card. Confirm it downloads a PNG file (check the browser's
  downloads) that visually matches what's shown on the page. **This is
  the single most important check** — if the player's photo comes from
  Supabase Storage, confirm the download succeeds without a
  browser-console "tainted canvas" / CORS security error. If it fails
  specifically for photo-bearing players but works for players with no
  photo, that confirms a CORS gap on the storage bucket — report back
  rather than guessing at a fix.
- Check a player with **zero completed matches**: confirm the card still
  renders (0s across the board, LOW THREAT tier, no crash) rather than
  showing a blank section or erroring the whole page.
- Check a player with a **very long name**: confirm it doesn't overflow
  outside the card's dark background (cosmetic check — if it does,
  that's a quick follow-up fix, not a blocker).
- Confirm the existing "📤 Share Stats" PDF button elsewhere on the page
  still works exactly as before (regression check — this feature must
  not have disturbed it).

Clean up any disposable test data used for this check afterward.
