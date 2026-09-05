# Leaderboard On-Screen View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Locations and Player-of-the-Month leaderboards so the on-screen view is real, readable, zoomable DOM instead of a shareable SVG scaled down to ~0.45× on a phone.

**Architecture:** Extract the two SVG cards' shared color constants into one module; add a new real-DOM `LeaderboardTable` component (podium rows + a real `<table>`) used by both pages; narrow the two existing SVG components to a hidden export target plus a small explicit "Share" button, leaving their PNG-generation logic untouched.

**Tech Stack:** Next.js App Router, React Server/Client Components, Tailwind, Vitest.

## Global Constraints

- The exported PNG must be pixel-identical to today's — no changes to `handleDownload`'s font-embedding, image-inlining, or 2× canvas scaling logic in either SVG component.
- The on-screen `LeaderboardTable` shows every row passed to it — no 12-row (or any) cap. Only the SVG share components keep their own row limits (Locations: 12: `MAX_ROWS`; Player of the Month: none today, unchanged).
- Colors on the on-screen table must be the same "on-navy" values the SVG cards already use (`WIN_ON_NAVY`/`LOSS_ON_NAVY`/medal stops/etc.) — not this app's generic light-background `win`/`loss` Tailwind tokens (`--color-win`/`--color-loss`), which are calibrated for light surfaces and would have poor contrast on this navy card.
- `ThreatShieldBadge` is already a plain React component (no SVG-embedding tricks needed) — reuse it directly in `LeaderboardTable` at the same sizes the SVG cards use (24 for podium rows, 18 for body rows).
- Every commit message ends with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Shared palette module

**Files:**
- Create: `apps/organizer-web/app/components/leaderboardPalette.ts`
- Test: `apps/organizer-web/app/components/leaderboardPalette.test.ts`

**Interfaces:**
- Produces: every named color constant below, plus `medalStops(rank: number): { deep: string; core: string; light: string } | null`. Consumed by Task 2 (`LeaderboardTable`) and Tasks 3-4 (the two renamed share components, replacing their locally-duplicated copies of the same values).

Both `LocationLeaderboardCard.tsx` and `RaceLeaderboardCard.tsx` currently declare an identical set of color constants and an identical `medalStops` function. This task extracts them once so the new on-screen component and the two share components read from one source instead of a third copy being pasted in.

- [ ] **Step 1: Write the failing test**

Create `apps/organizer-web/app/components/leaderboardPalette.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { medalStops, GOLD_CORE, SILVER_CORE, BRONZE_CORE } from './leaderboardPalette';

describe('medalStops', () => {
  it('returns the gold stops for rank 1', () => {
    expect(medalStops(1)).toEqual({ deep: '#a8874f', core: GOLD_CORE, light: '#f7e6a8' });
  });

  it('returns the silver stops for rank 2', () => {
    expect(medalStops(2)).toEqual({ deep: '#7e8288', core: SILVER_CORE, light: '#e8eaed' });
  });

  it('returns the bronze stops for rank 3', () => {
    expect(medalStops(3)).toEqual({ deep: '#7a4b23', core: BRONZE_CORE, light: '#e0aa72' });
  });

  it('returns null for rank 4 and beyond', () => {
    expect(medalStops(4)).toBeNull();
    expect(medalStops(10)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/organizer-web && npx vitest run app/components/leaderboardPalette.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the module**

Create `apps/organizer-web/app/components/leaderboardPalette.ts`:

```typescript
// Shared color constants for the leaderboard card family (LocationLeaderboardShareCard,
// RaceLeaderboardShareCard, LeaderboardTable) -- these three all render the same
// "all-navy" leaderboard visual identity the organizer explicitly asked for (see
// LocationLeaderboardShareCard.tsx's file comment for the full history), and must not
// visually diverge without a stated reason. Extracted here so a color change is made
// once, not three times.

export const NAVY_MID = '#16294e';
export const NAVY_DEEP = '#0c1830';
export const NAVY_DARKER = '#0a1730';
export const NAVY_RULE = '#24406f';
export const PLATE = '#081328';
export const PLATE_STROKE = '#2c4a7d';
export const ON_NAVY_PRIMARY = '#ffffff';
export const ON_NAVY_SECOND = '#b8c8de';
export const ON_NAVY_MUTED = '#8ea6c8';
export const ON_NAVY_FAINT = '#5b7196';

export const GOLD_DEEP = '#a8874f';
export const GOLD_CORE = '#d6af36';
export const GOLD_LIGHT = '#f7e6a8';
export const SILVER_DEEP = '#7e8288';
export const SILVER_CORE = '#a7a7ad';
export const SILVER_LIGHT = '#e8eaed';
export const BRONZE_DEEP = '#7a4b23';
export const BRONZE_CORE = '#a77044';
export const BRONZE_LIGHT = '#e0aa72';

// Brighter than this app's generic --color-win/--color-loss tokens (#0f766e/#9f1239),
// which are calibrated for light backgrounds -- these two are specifically tuned for
// readability on the navy ground this card family uses.
export const WIN_ON_NAVY = '#34d8bd';
export const LOSS_ON_NAVY = '#ff8a80';

// The Race-to-Player-of-the-Month card's one deliberate divergence from its Leaderboard
// twin: a live in-progress-month snapshot, not a frozen period.
export const LIVE_COLOR = '#d1601f';

export function medalStops(rank: number): { deep: string; core: string; light: string } | null {
  if (rank === 1) return { deep: GOLD_DEEP, core: GOLD_CORE, light: GOLD_LIGHT };
  if (rank === 2) return { deep: SILVER_DEEP, core: SILVER_CORE, light: SILVER_LIGHT };
  if (rank === 3) return { deep: BRONZE_DEEP, core: BRONZE_CORE, light: BRONZE_LIGHT };
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/organizer-web && npx vitest run app/components/leaderboardPalette.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/app/components/leaderboardPalette.ts apps/organizer-web/app/components/leaderboardPalette.test.ts
git commit -m "feat: extract shared leaderboard color palette"
```

---

### Task 2: `LeaderboardTable` — the real on-screen view

**Files:**
- Create: `apps/organizer-web/app/components/LeaderboardTable.tsx`

**Interfaces:**
- Consumes: `medalStops`, `NAVY_DEEP`, `NAVY_DARKER`, `PLATE`, `PLATE_STROKE`, `ON_NAVY_PRIMARY`, `ON_NAVY_SECOND`, `ON_NAVY_MUTED`, `ON_NAVY_FAINT`, `WIN_ON_NAVY`, `LOSS_ON_NAVY`, `LIVE_COLOR` from Task 1's `leaderboardPalette.ts`; `ThreatShieldBadge` (existing, `apps/organizer-web/app/components/ThreatShieldBadge.tsx`, props `{ tier: ThreatTier; size?: number }`); `threatTierFor` (existing, `@/lib/stats/threatLevel`).
- Produces: `LeaderboardTableRow` type and the default-exported `LeaderboardTable` component, consumed by Tasks 5-6 (`app/locations/page.tsx`, `app/player-of-the-month/page.tsx`).

This is a presentational component with no new business logic (rank/tier/points are all pre-computed by its caller) — no unit tests, matching how every other page-level component in this app is verified (visual, via a temporary dev-preview route, not an automated test file — confirmed none of `TournamentCard.tsx`, `ScheduleCard.tsx`, or any other card component in this app has one).

- [ ] **Step 1: Write the component**

Create `apps/organizer-web/app/components/LeaderboardTable.tsx`:

```tsx
// The real on-screen leaderboard view -- shares its visual identity (navy ground,
// medal gradients, boxed "points" plate) with LocationLeaderboardShareCard and
// RaceLeaderboardShareCard, the SVGs those two now only use to generate a shareable
// PNG. See docs/superpowers/specs/2026-09-05-leaderboard-onscreen-view-design.md for
// why the SVG couldn't stay the on-screen view: at real phone widths it scaled down to
// an effective ~11.7px for names and ~4.3px for the smallest label.
import {
  medalStops,
  NAVY_DEEP,
  NAVY_DARKER,
  PLATE,
  PLATE_STROKE,
  ON_NAVY_PRIMARY,
  ON_NAVY_SECOND,
  ON_NAVY_MUTED,
  ON_NAVY_FAINT,
  WIN_ON_NAVY,
  LOSS_ON_NAVY,
  LIVE_COLOR,
} from './leaderboardPalette';
import { threatTierFor } from '@/lib/stats/threatLevel';
import ThreatShieldBadge from './ThreatShieldBadge';

export type LeaderboardTableRow = {
  rank: number;
  name: string;
  overallWinPercentage: number | null;
  matchWins: number;
  losses: number;
  totalPoints: number;
  // Covers tournamentWins (Locations) and leagueWins (Player of the Month) -- both
  // render as the identical "★ N" treatment the SVG cards already use, just with a
  // different source field name at each call site.
  secondaryWins: number;
};

export type LeaderboardTableProps = {
  title: string;
  kicker: string;
  isLive?: boolean;
  footerCaption: string;
  rows: LeaderboardTableRow[];
};

function GoldStar() {
  return (
    <span aria-hidden="true" style={{ fontSize: '14px' }}>
      ★
    </span>
  );
}

export default function LeaderboardTable({ title, kicker, isLive = false, footerCaption, rows }: LeaderboardTableProps) {
  const podiumRows = rows.filter((r) => r.rank <= 3);
  const bodyRows = rows.filter((r) => r.rank > 3);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: NAVY_DEEP, border: `1px solid ${PLATE_STROKE}` }}>
      <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          {isLive && (
            <span
              className="inline-block rounded-full px-3 py-1 text-xs font-extrabold text-white mb-2"
              style={{ background: LIVE_COLOR, letterSpacing: '1px' }}
            >
              LIVE
            </span>
          )}
          <h2 className="font-heading font-extrabold text-2xl" style={{ color: ON_NAVY_PRIMARY }}>
            {title}
          </h2>
        </div>
        <span className="font-heading font-bold text-sm" style={{ color: ON_NAVY_SECOND, letterSpacing: '1.5px' }}>
          {kicker}
        </span>
      </div>

      {podiumRows.map((row) => {
        const medal = medalStops(row.rank);
        const tier = row.overallWinPercentage !== null ? threatTierFor(row.overallWinPercentage) : null;
        return (
          <div
            key={row.rank}
            className="flex items-center gap-4 px-5 py-4 border-t"
            style={{ borderColor: '#24406f', borderLeft: medal ? `6px solid ${medal.core}` : undefined }}
          >
            <div
              className="flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center font-heading font-extrabold text-2xl"
              style={{
                background: medal ? `linear-gradient(135deg, ${medal.deep}, ${medal.light} 50%, ${medal.core})` : NAVY_DARKER,
                color: NAVY_DEEP,
                border: medal ? `2px solid ${medal.deep}` : undefined,
              }}
            >
              {row.rank}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-heading font-bold text-lg truncate" style={{ color: ON_NAVY_PRIMARY }}>
                  {row.name}
                </span>
                {tier && <ThreatShieldBadge tier={tier} size={24} />}
                {row.secondaryWins > 0 && (
                  <span className="font-heading font-bold text-sm flex items-center gap-1 flex-shrink-0" style={{ color: '#f7e6a8' }}>
                    <GoldStar /> {row.secondaryWins}
                  </span>
                )}
              </div>
              <div className="stat-num text-sm">
                <span style={{ color: WIN_ON_NAVY, fontWeight: 700 }}>{row.matchWins}W</span>
                <span style={{ color: ON_NAVY_SECOND }}> – </span>
                <span style={{ color: LOSS_ON_NAVY, fontWeight: 700 }}>{row.losses}L</span>
              </div>
            </div>
            <div
              className="flex-shrink-0 rounded-lg px-4 py-2 text-center"
              style={{ background: PLATE, border: `1px solid ${PLATE_STROKE}` }}
            >
              <div className="text-[10px] font-bold" style={{ color: ON_NAVY_MUTED, letterSpacing: '1.5px' }}>
                TOTAL POINTS
              </div>
              <div className="stat-num font-heading font-extrabold text-2xl" style={{ color: ON_NAVY_PRIMARY }}>
                {row.totalPoints}
              </div>
            </div>
          </div>
        );
      })}

      {bodyRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <caption className="sr-only">{`${title} leaderboard, ranks ${podiumRows.length + 1} and below`}</caption>
            <thead>
              <tr style={{ background: '#0a1730' }}>
                <th scope="col" className="text-left px-5 py-2 text-[10.5px] font-bold" style={{ color: ON_NAVY_MUTED, letterSpacing: '2px' }}>
                  POS
                </th>
                <th scope="col" className="text-left px-2 py-2 text-[10.5px] font-bold" style={{ color: ON_NAVY_MUTED, letterSpacing: '2px' }}>
                  PLAYER
                </th>
                <th scope="col" className="text-right px-5 py-2 text-[10.5px] font-bold" style={{ color: ON_NAVY_MUTED, letterSpacing: '2px' }}>
                  PTS
                </th>
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, i) => {
                const tier = row.overallWinPercentage !== null ? threatTierFor(row.overallWinPercentage) : null;
                return (
                  <tr key={row.rank} style={{ background: i % 2 === 0 ? NAVY_DEEP : NAVY_DARKER }}>
                    <td className="stat-num px-5 py-3 font-heading font-extrabold text-lg text-center" style={{ color: ON_NAVY_FAINT }}>
                      {row.rank}
                    </td>
                    <td className="px-2 py-3 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-heading font-bold truncate" style={{ color: ON_NAVY_PRIMARY }}>
                          {row.name}
                        </span>
                        {tier && <ThreatShieldBadge tier={tier} size={18} />}
                      </div>
                      <div className="stat-num text-xs">
                        <span style={{ color: WIN_ON_NAVY, fontWeight: 700 }}>{row.matchWins}W</span>
                        <span style={{ color: ON_NAVY_SECOND }}> – </span>
                        <span style={{ color: LOSS_ON_NAVY, fontWeight: 700 }}>{row.losses}L</span>
                      </div>
                    </td>
                    <td
                      className="stat-num px-5 py-3 text-right font-heading font-extrabold text-lg"
                      style={{ color: row.totalPoints > 0 ? ON_NAVY_PRIMARY : ON_NAVY_FAINT }}
                    >
                      {row.totalPoints}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-5 py-3 border-t text-center text-xs" style={{ borderColor: '#24406f', color: ON_NAVY_SECOND }}>
        {footerCaption}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint app/components/LeaderboardTable.tsx
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/organizer-web/app/components/LeaderboardTable.tsx
git commit -m "feat: add LeaderboardTable, the real on-screen leaderboard view"
```

---

### Task 3: Narrow `LocationLeaderboardCard` to a share-only component

**Files:**
- Modify (and rename): `apps/organizer-web/app/locations/LocationLeaderboardCard.tsx` → `apps/organizer-web/app/locations/LocationLeaderboardShareCard.tsx`

**Interfaces:**
- Consumes: `NAVY_MID, NAVY_DEEP, NAVY_DARKER, NAVY_RULE, PLATE, PLATE_STROKE, ON_NAVY_PRIMARY, ON_NAVY_SECOND, ON_NAVY_MUTED, ON_NAVY_FAINT, GOLD_DEEP, GOLD_CORE, GOLD_LIGHT, SILVER_DEEP, SILVER_CORE, SILVER_LIGHT, BRONZE_DEEP, BRONZE_CORE, BRONZE_LIGHT, WIN_ON_NAVY, LOSS_ON_NAVY, medalStops` from Task 1's `leaderboardPalette.ts` (replacing this file's own local copies of the same values). `outlineButtonClass` (existing, `@/app/components/ui`).
- Produces: default-exported `LocationLeaderboardShareCard` with the exact same props (`LeaderboardCardRow`, `LocationLeaderboardCardProps` — keep these type names unchanged so Task 5 doesn't need to rename anything at the call site beyond the import path). Consumed by Task 5.

This task changes nothing about `handleDownload`, the SVG's internal markup, or its row-slicing — only three things: (1) delete the locally-duplicated color constants and `medalStops`, importing them from Task 1 instead; (2) hide the `<svg>` from visual layout; (3) replace the whole-card-is-a-button wrapper with a small explicit share button.

- [ ] **Step 1: Rename the file**

```bash
git mv apps/organizer-web/app/locations/LocationLeaderboardCard.tsx apps/organizer-web/app/locations/LocationLeaderboardShareCard.tsx
```

- [ ] **Step 2: Replace the local color constants with the shared import**

In `apps/organizer-web/app/locations/LocationLeaderboardShareCard.tsx`, delete lines defining `NAVY_MID` through `LOSS_ON_NAVY` (currently lines 58-80) and the `medalStops` function (lines 82-87), and add this import alongside the existing ones at the top of the file:

```typescript
import {
  NAVY_MID,
  NAVY_DEEP,
  NAVY_DARKER,
  NAVY_RULE,
  PLATE,
  PLATE_STROKE,
  ON_NAVY_PRIMARY,
  ON_NAVY_SECOND,
  ON_NAVY_MUTED,
  ON_NAVY_FAINT,
  GOLD_DEEP,
  GOLD_CORE,
  GOLD_LIGHT,
  SILVER_DEEP,
  SILVER_CORE,
  SILVER_LIGHT,
  BRONZE_DEEP,
  BRONZE_CORE,
  BRONZE_LIGHT,
  WIN_ON_NAVY,
  LOSS_ON_NAVY,
  medalStops,
} from '@/app/components/leaderboardPalette';
```

Also add: `import { outlineButtonClass } from '@/app/components/ui';`

Every place in the file that referenced these as local `const`s continues to work unchanged — only their declaration moved.

- [ ] **Step 3: Rename the component and hide the SVG**

Change the function name from `LocationLeaderboardCard` to `LocationLeaderboardShareCard`, and change the return statement's structure. Replace:

```tsx
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
          role="img"
        >
```

with:

```tsx
  return (
    <div>
      <div className="hidden" aria-hidden="true">
        <svg
          ref={svgRef}
          width={CARD_WIDTH}
          height={totalHeight}
          viewBox={`0 0 ${CARD_WIDTH} ${totalHeight}`}
          xmlns="http://www.w3.org/2000/svg"
          role="img"
        >
```

And replace the closing tags. Find:

```tsx
          <rect x="1" y="1" width={CARD_WIDTH - 2} height={totalHeight - 2} rx="19" fill="none" stroke={GOLD_CORE} strokeOpacity="0.35" strokeWidth="1.5" />
        </svg>
      </button>
      <p className="text-xs text-muted mt-1.5">Click the card to share or download it as an image.</p>
      {status === 'error' && (
        <p className="text-xs text-red-600 mt-1">Couldn&apos;t generate the image. Try again.</p>
      )}
    </div>
  );
}
```

Replace with:

```tsx
          <rect x="1" y="1" width={CARD_WIDTH - 2} height={totalHeight - 2} rx="19" fill="none" stroke={GOLD_CORE} strokeOpacity="0.35" strokeWidth="1.5" />
        </svg>
      </div>
      <button type="button" onClick={handleDownload} disabled={status === 'generating'} className={outlineButtonClass}>
        {status === 'generating' ? 'Generating…' : `📤 Share ${venueName} Leaderboard`}
      </button>
      {status === 'error' && (
        <p className="text-xs text-red-600 mt-1.5">Couldn&apos;t generate the image. Try again.</p>
      )}
    </div>
  );
}
```

`handleDownload` itself is untouched — `svgRef.current.cloneNode(true)` works identically on a `display:none` element (cloning and serializing a DOM node doesn't depend on whether it's visually rendered), and the export already rebuilds its own fonts and inlined images from scratch rather than relying on the live page's rendering.

- [ ] **Step 4: Type-check, lint, verify the PNG export still works**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint app/locations/LocationLeaderboardShareCard.tsx
```
Expected: clean. (Manual confirmation that the exported PNG is unchanged happens in Task 7, once the page wires this component in alongside `LeaderboardTable`.)

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/app/locations/LocationLeaderboardCard.tsx apps/organizer-web/app/locations/LocationLeaderboardShareCard.tsx
git commit -m "refactor: LocationLeaderboardCard becomes a hidden share-only export target"
```

---

### Task 4: Narrow `RaceLeaderboardCard` to a share-only component

**Files:**
- Modify (and rename): `apps/organizer-web/app/player-of-the-month/RaceLeaderboardCard.tsx` → `apps/organizer-web/app/player-of-the-month/RaceLeaderboardShareCard.tsx`

**Interfaces:**
- Same as Task 3, applied to the Race card's twin set of constants (this file additionally has `LIVE_COLOR`, which also moves to the shared import).
- Produces: default-exported `RaceLeaderboardShareCard` with the same props (`RaceCardRow`, `RaceLeaderboardCardProps` unchanged). Consumed by Task 6.

This is the identical refactor to Task 3, applied to the Race card's twin file. The LIVE pill's SVG markup (`RaceLeaderboardCard.tsx:317-332`) is untouched — it's still part of the exported PNG.

- [ ] **Step 1: Rename the file**

```bash
git mv apps/organizer-web/app/player-of-the-month/RaceLeaderboardCard.tsx apps/organizer-web/app/player-of-the-month/RaceLeaderboardShareCard.tsx
```

- [ ] **Step 2: Replace the local color constants with the shared import**

In `apps/organizer-web/app/player-of-the-month/RaceLeaderboardShareCard.tsx`, delete the local `NAVY_MID` through `LIVE_COLOR` constants (lines 51-74) and the `medalStops` function (lines 76-81), replacing them with:

```typescript
import {
  NAVY_MID,
  NAVY_DEEP,
  NAVY_DARKER,
  NAVY_RULE,
  PLATE,
  PLATE_STROKE,
  ON_NAVY_PRIMARY,
  ON_NAVY_SECOND,
  ON_NAVY_MUTED,
  ON_NAVY_FAINT,
  GOLD_DEEP,
  GOLD_CORE,
  GOLD_LIGHT,
  SILVER_DEEP,
  SILVER_CORE,
  SILVER_LIGHT,
  BRONZE_DEEP,
  BRONZE_CORE,
  BRONZE_LIGHT,
  WIN_ON_NAVY,
  LOSS_ON_NAVY,
  LIVE_COLOR,
  medalStops,
} from '@/app/components/leaderboardPalette';
```

Also add: `import { outlineButtonClass } from '@/app/components/ui';`

- [ ] **Step 3: Rename the component and hide the SVG**

Change the function name from `RaceLeaderboardCard` to `RaceLeaderboardShareCard`. Replace:

```tsx
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
          role="img"
        >
```

with:

```tsx
  return (
    <div>
      <div className="hidden" aria-hidden="true">
        <svg
          ref={svgRef}
          width={CARD_WIDTH}
          height={totalHeight}
          viewBox={`0 0 ${CARD_WIDTH} ${totalHeight}`}
          xmlns="http://www.w3.org/2000/svg"
          role="img"
        >
```

Find the closing section (identical structure to `LocationLeaderboardShareCard.tsx`'s, confirmed):

```tsx
          <rect x="1" y="1" width={CARD_WIDTH - 2} height={totalHeight - 2} rx="19" fill="none" stroke={GOLD_CORE} strokeOpacity="0.35" strokeWidth="1.5" />
        </svg>
      </button>
      <p className="text-xs text-muted mt-1.5">Click the card to share or download it as an image.</p>
      {status === 'error' && (
        <p className="text-xs text-red-600 mt-1">Couldn&apos;t generate the image. Try again.</p>
      )}
    </div>
  );
}
```

Replace with:

```tsx
          <rect x="1" y="1" width={CARD_WIDTH - 2} height={totalHeight - 2} rx="19" fill="none" stroke={GOLD_CORE} strokeOpacity="0.35" strokeWidth="1.5" />
        </svg>
      </div>
      <button type="button" onClick={handleDownload} disabled={status === 'generating'} className={outlineButtonClass}>
        {status === 'generating' ? 'Generating…' : `📤 Share ${venueName} Race`}
      </button>
      {status === 'error' && (
        <p className="text-xs text-red-600 mt-1.5">Couldn&apos;t generate the image. Try again.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Type-check and lint**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint app/player-of-the-month/RaceLeaderboardShareCard.tsx
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/app/player-of-the-month/RaceLeaderboardCard.tsx apps/organizer-web/app/player-of-the-month/RaceLeaderboardShareCard.tsx
git commit -m "refactor: RaceLeaderboardCard becomes a hidden share-only export target"
```

---

### Task 5: Wire `LeaderboardTable` into the Locations page

**Files:**
- Modify: `apps/organizer-web/app/locations/page.tsx`

**Interfaces:**
- Consumes: `LeaderboardTable`, `LeaderboardTableRow` (Task 2); `LocationLeaderboardShareCard` (Task 3, replacing the old `LocationLeaderboardCard` import).

The `rows` array this page already builds (`leaderboardCardRowsByVenue`, from `assignRanksWithTies(sortLeaderboardCardRows(rowsWithoutRank), ...)`) is passed to BOTH components unchanged — `LeaderboardTable` gets every row (no slicing), `LocationLeaderboardShareCard` keeps its own internal 12-row cap for the PNG, exactly as it does today.

- [ ] **Step 1: Update imports**

In `apps/organizer-web/app/locations/page.tsx`, replace:

```typescript
import LocationLeaderboardCard from './LocationLeaderboardCard';
```

with:

```typescript
import LocationLeaderboardShareCard from './LocationLeaderboardShareCard';
import LeaderboardTable, { type LeaderboardTableRow } from '@/app/components/LeaderboardTable';
```

- [ ] **Step 2: Render both components per venue, and fix the empty-state ground**

Replace:

```tsx
      {leaderboardCardRowsByVenue.map(({ venueId, venueName, rows }) =>
        rows.length > 0 ? (
          <div key={venueId} className="mb-6">
            <LocationLeaderboardCard
              venueName={venueName}
              periodLabel={periodLabel}
              generatedDateLabel={generatedDateLabel}
              rows={rows}
            />
          </div>
        ) : (
          <div key={venueId} className={`${cardClass} mb-6`}>
            <h2 className="text-lg font-bold text-slate-900 mb-3">{venueName}</h2>
            <EmptyState icon={<PaddleIcon />}>No matches played here yet {selectedMonthParam ? `in ${periodLabel.toLowerCase()}` : 'this month'}.</EmptyState>
          </div>
        )
      )}
```

with:

```tsx
      {leaderboardCardRowsByVenue.map(({ venueId, venueName, rows }) =>
        rows.length > 0 ? (
          <div key={venueId} className="mb-6 space-y-3">
            <LeaderboardTable
              title={venueName}
              kicker={periodLabel}
              footerCaption="Ranked by Total Points (75%) + matches played (15%) + league wins (10%)"
              rows={rows.map(
                (r): LeaderboardTableRow => ({
                  rank: r.rank,
                  name: r.name,
                  overallWinPercentage: r.overallWinPercentage,
                  matchWins: r.matchWins,
                  losses: r.losses,
                  totalPoints: r.totalPoints,
                  secondaryWins: r.tournamentWins,
                })
              )}
            />
            <LocationLeaderboardShareCard
              venueName={venueName}
              periodLabel={periodLabel}
              generatedDateLabel={generatedDateLabel}
              rows={rows}
            />
          </div>
        ) : (
          <div
            key={venueId}
            className="mb-6 rounded-2xl p-6"
            style={{ background: '#0c1830', border: '1px solid #2c4a7d' }}
          >
            <h2 className="text-lg font-bold text-white mb-3">{venueName}</h2>
            <EmptyState icon={<PaddleIcon />}>
              <span style={{ color: '#b8c8de' }}>
                No matches played here yet {selectedMonthParam ? `in ${periodLabel.toLowerCase()}` : 'this month'}.
              </span>
            </EmptyState>
          </div>
        )
      )}
```

`EmptyState` (`apps/organizer-web/app/components/EmptyState.tsx`) places `children` inside a `<p className="text-slate-500 ...">` — wrapping the passed text in a `<span style={{ color: '#b8c8de' }}>` overrides that inherited color for its own text (a more specific color always wins over an inherited one), so this reads correctly on the navy ground without needing to touch the shared `EmptyState` component itself (which is used elsewhere on light cards and shouldn't change). Its icon badge (a small cream circle) stays as-is — a minor, non-blocking cosmetic note, not worth a prop addition to a shared component for one call site.

- [ ] **Step 3: Type-check, lint, build**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint app/locations/page.tsx
npm run build
```
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add apps/organizer-web/app/locations/page.tsx
git commit -m "feat: Locations page shows a real on-screen leaderboard, not a scaled-down SVG"
```

---

### Task 6: Wire `LeaderboardTable` into the Player of the Month page

**Files:**
- Modify: `apps/organizer-web/app/player-of-the-month/page.tsx`

**Interfaces:**
- Consumes: `LeaderboardTable`, `LeaderboardTableRow` (Task 2); `RaceLeaderboardShareCard` (Task 4, replacing the old `RaceLeaderboardCard` import).

- [ ] **Step 1: Update imports**

Replace:

```typescript
import RaceLeaderboardCard from './RaceLeaderboardCard';
```

with:

```typescript
import RaceLeaderboardShareCard from './RaceLeaderboardShareCard';
import LeaderboardTable, { type LeaderboardTableRow } from '@/app/components/LeaderboardTable';
```

- [ ] **Step 2: Render both components**

Replace:

```tsx
              <RaceLeaderboardCard
                venueName={venue.name}
                monthLabel={`${MONTH_NAMES[currentMonth - 1].toUpperCase()} ${currentYear}`}
                generatedDateLabel={generatedDateLabel}
                rows={assignRanksWithTies(
                  race.map((entry) => ({
                    name: personById.get(entry.personId)?.name ?? 'Unknown',
                    matchWins: entry.matchWins,
                    losses: entry.matchesPlayed - entry.matchWins,
                    leagueWins: entry.leagueWins,
                    // rankMonthlyCandidates (legacy, pre-September) has no real points
                    // concept -- 0 there is correct, not a fallback masking a bug,
                    // since the points system didn't exist yet for any month it
                    // still governs.
                    totalPoints: (entry as { totalPoints?: number }).totalPoints ?? 0,
                    overallWinPercentage: winPercentageByPersonId.get(entry.personId) ?? null,
                  })),
                  // Same tie criteria as the Locations Leaderboard: two people
                  // identical on match wins, losses, and league wins share a rank
                  // instead of an arbitrary 1st/2nd from array order -- deliberately
                  // NOT keyed on Total Points, so a small bonus-point difference (a
                  // shutout, a close loss) between two otherwise-identical records
                  // doesn't split them into different ranks.
                  (r) => `${r.matchWins}|${r.losses}|${r.leagueWins}`
                )}
              />
```

with:

```tsx
              {(() => {
                const raceRows = assignRanksWithTies(
                  race.map((entry) => ({
                    name: personById.get(entry.personId)?.name ?? 'Unknown',
                    matchWins: entry.matchWins,
                    losses: entry.matchesPlayed - entry.matchWins,
                    leagueWins: entry.leagueWins,
                    // rankMonthlyCandidates (legacy, pre-September) has no real points
                    // concept -- 0 there is correct, not a fallback masking a bug,
                    // since the points system didn't exist yet for any month it
                    // still governs.
                    totalPoints: (entry as { totalPoints?: number }).totalPoints ?? 0,
                    overallWinPercentage: winPercentageByPersonId.get(entry.personId) ?? null,
                  })),
                  // Same tie criteria as the Locations Leaderboard: two people
                  // identical on match wins, losses, and league wins share a rank
                  // instead of an arbitrary 1st/2nd from array order -- deliberately
                  // NOT keyed on Total Points, so a small bonus-point difference (a
                  // shutout, a close loss) between two otherwise-identical records
                  // doesn't split them into different ranks.
                  (r) => `${r.matchWins}|${r.losses}|${r.leagueWins}`
                );
                const monthLabel = `${MONTH_NAMES[currentMonth - 1].toUpperCase()} ${currentYear}`;
                return (
                  <div className="space-y-3">
                    <LeaderboardTable
                      title={venue.name}
                      kicker={monthLabel}
                      isLive
                      footerCaption="Ranked by 75% Total Points · 15% appearance · 10% league wins · 60% of the busiest player's matches to qualify"
                      rows={raceRows.map(
                        (r): LeaderboardTableRow => ({
                          rank: r.rank,
                          name: r.name,
                          overallWinPercentage: r.overallWinPercentage,
                          matchWins: r.matchWins,
                          losses: r.losses,
                          totalPoints: r.totalPoints,
                          secondaryWins: r.leagueWins,
                        })
                      )}
                    />
                    <RaceLeaderboardShareCard
                      venueName={venue.name}
                      monthLabel={monthLabel}
                      generatedDateLabel={generatedDateLabel}
                      rows={raceRows}
                    />
                  </div>
                );
              })()}
```

(An IIFE here avoids computing `raceRows` twice, since it now feeds two sibling components instead of one — confirmed neither `monthLabel` nor the ranked rows exist as a variable anywhere earlier in this function; `race` in scope at this point is the raw candidate array, pre-`assignRanksWithTies`.)

- [ ] **Step 3: Type-check, lint, build**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint app/player-of-the-month/page.tsx
npm run build
```
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add apps/organizer-web/app/player-of-the-month/page.tsx
git commit -m "feat: Player of the Month race shows a real on-screen leaderboard"
```

---

### Task 7: Visual verification, cleanup, push

**Files:**
- Create (temporary): `apps/organizer-web/app/dev-preview-leaderboard-table/page.tsx`
- Delete (before finishing): the same temporary file.

- [ ] **Step 1: Write a temporary preview route with realistic sample data**

Create `apps/organizer-web/app/dev-preview-leaderboard-table/page.tsx`:

```tsx
// TEMP dev-preview route -- not shipped. Delete before commit.
import LeaderboardTable from '@/app/components/LeaderboardTable';

export default function Page() {
  return (
    <div className="min-h-screen p-4 space-y-4" style={{ background: '#f3efe6' }}>
      <LeaderboardTable
        title="Pickleturf"
        kicker="MONTH TO DATE"
        footerCaption="Ranked by Total Points (75%) + matches played (15%) + league wins (10%)"
        rows={[
          { rank: 1, name: 'Ankit Gupta', overallWinPercentage: 78, matchWins: 22, losses: 6, totalPoints: 340, secondaryWins: 2 },
          { rank: 2, name: 'Nihad Rahman', overallWinPercentage: 71, matchWins: 19, losses: 8, totalPoints: 305, secondaryWins: 1 },
          { rank: 3, name: 'Ranjit Kaur Bhamra', overallWinPercentage: 64, matchWins: 17, losses: 10, totalPoints: 288, secondaryWins: 0 },
          { rank: 4, name: 'Chirag Mehta', overallWinPercentage: 55, matchWins: 14, losses: 12, totalPoints: 210, secondaryWins: 0 },
          { rank: 5, name: 'A Very Extremely Long Doubles Player Name', overallWinPercentage: 40, matchWins: 9, losses: 15, totalPoints: 90, secondaryWins: 0 },
        ]}
      />
      <LeaderboardTable
        title="Picklers"
        kicker="AUGUST 2026"
        isLive
        footerCaption="Ranked by 75% Total Points · 15% appearance · 10% league wins · 60% of the busiest player's matches to qualify"
        rows={[
          { rank: 1, name: 'Priya Nair', overallWinPercentage: 82, matchWins: 12, losses: 2, totalPoints: 150, secondaryWins: 1 },
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 2: View it in the Browser pane at mobile width**

Using `mcp__Claude_Browser__preview_start` (`{name: "organizer-web"}`), navigate to `/dev-preview-leaderboard-table`, use `resize_window` with `preset: "mobile"`, then screenshot.

Check specifically:
- Player names and the "TOTAL POINTS" numbers read as normal, comfortable body/heading text — not scaled-down.
- The long name in row 5 truncates with an ellipsis instead of overflowing or wrapping awkwardly.
- The podium rows (1-3) are visually distinct from the table rows (4+) via the medal discs.
- The LIVE pill appears on the Picklers card and not on the Pickleturf card.

If anything looks wrong, fix `LeaderboardTable.tsx` and re-check before moving on — do not proceed to Step 3 with a known visual bug.

- [ ] **Step 3: Delete the temporary preview route**

```bash
rm -rf apps/organizer-web/app/dev-preview-leaderboard-table
```

- [ ] **Step 4: Full verification**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx vitest run
npx eslint app/components/leaderboardPalette.ts app/components/LeaderboardTable.tsx app/locations/LocationLeaderboardShareCard.tsx app/player-of-the-month/RaceLeaderboardShareCard.tsx app/locations/page.tsx app/player-of-the-month/page.tsx
npm run build
```
Expected: `tsc` clean; test count is the pre-existing count plus the 4 new `medalStops` tests; lint clean; build clean; the temporary preview route does not appear in the build's route list.

- [ ] **Step 5: Manual check of the real Share buttons**

This step needs a real, authenticated session, which this session's own tooling can't reach (confirmed earlier: every attempt to open an authenticated page this session hit the Google sign-in wall). Note in the final report to the user: click "📤 Share Leaderboard" on the real `/locations` page and "📤 Share Race" on `/player-of-the-month`, and confirm each still produces the same PNG it did before this change (same layout, same fonts, same row cap) — since `handleDownload`'s logic was never touched, this should need no fix, but it's worth the user's one real click to be sure before calling this fully done.

- [ ] **Step 6: Commit and push**

```bash
cd "C:\Users\ANKS\pickleball project"
git add -A
git commit -m "chore: remove temporary leaderboard preview route"
git push origin main
```

Then poll `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1` until the run for the pushed commit shows `"conclusion": "success"`.
