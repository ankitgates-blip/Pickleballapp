# Player Stats PDF + WhatsApp Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the organizer generate a PDF of a player's full stats (this month, by location, weekly/monthly/yearly trends, head-to-head, match history) from the Player Detail page and share it via the device share sheet, reusing the shared PDF share/download infrastructure.

**Architecture:** New pure data-shaping functions (`lib/stats/personStatsExport.ts`) convert `PersonStats` (already computed by the page) into flat, PDF-ready shapes, giving stars and trends plain-text equivalents since jsPDF's standard fonts can't render the page's Unicode glyphs. A new `SharePlayerStatsButton` Client Component builds the PDF body and calls the shared `shareOrDownloadPdf`/`sanitizeFileNamePart` utilities.

**Tech Stack:** Next.js App Router (Server + Client Components), `jspdf`, `jspdf-autotable` (already dependencies), Vitest.

## Global Constraints

- PDF generation and the share/download logic run entirely client-side — no new server code, no new database columns.
- `jspdf`/`jspdf-autotable` are dynamically imported inside the click handler, never statically imported at module scope.
- Any `autoTable` call MUST use the named-function form `autoTable(doc, options)` — never `doc.autoTable(options)`, which is broken under this app's ESM/bundler import path (see the Results PDF feature's Critical fix, commit `7f364a3`).
- The PDF export must NOT use the Unicode glyphs the page uses for stars (`★`/`☆`) or trend arrows (`▲`/`▼`/`—`) — jsPDF's standard fonts can't render them. Use plain-text equivalents instead, reusing the existing numeric logic (`starRating()`'s thresholds, `trendPointsChange`'s sign) rather than duplicating it.
- The Weekly/Monthly/Yearly trend tables in the PDF use the exact same slices the page already applies: weekly 4 most recent, monthly 6 most recent, yearly all. Match History is unbounded, matching the page.
- `navigator.share` rejecting due to user cancellation (`AbortError`) is a silent no-op, not an error state.
- The Player Detail page's Share Stats button renders unconditionally — even a player with zero matches produces a valid (sparse) PDF.
- Out of scope: Leaderboard PDF (a separate future increment), any change to `computePersonStats`/`buildPersonMatchRecords`, any change to the page's own on-screen Unicode display, the public `/p/[id]` page.

---

### Task 1: Pure data-shaping functions for the player stats export

**Files:**
- Create: `apps/organizer-web/lib/stats/personStatsExport.ts`
- Test: `apps/organizer-web/lib/stats/personStatsExport.test.ts`

**Interfaces:**
- Consumes: `PeriodStats`, `PersonMatchRecord`, `HeadToHeadRecord`, `LocationCount` types from `./types`; `starRating` from `./starRating`.
- Produces (consumed by Task 2's `SharePlayerStatsButton` props and Task 3's page wiring):
  ```typescript
  export type ExportPeriodRow = {
    period: string;
    winPercentageLabel: string;
    trendLabel: string;
    gamesWon: number;
    gamesLost: number;
  };
  export function buildPeriodRows(periods: PeriodStats[]): ExportPeriodRow[];

  export type ExportLocationRow = {
    location: string;
    matchCount: number;
    winPercentageLabel: string;
  };
  export function buildLocationRows(locations: LocationCount[]): ExportLocationRow[];

  export type ExportMatchHistoryRow = {
    date: string;
    partnerName: string;
    opponentsLabel: string;
    result: 'W' | 'L';
    scoreLabel: string;
  };
  export function buildMatchHistoryRows(
    matchHistory: PersonMatchRecord[],
    nameById: Map<string, string>
  ): ExportMatchHistoryRow[];

  export function formatHeadToHead(
    record: HeadToHeadRecord | null,
    nameById: Map<string, string>
  ): string;

  export function starRatingLabel(winPercentage: number | null): string;
  ```

- [ ] **Step 1: Write the failing tests**

Create `apps/organizer-web/lib/stats/personStatsExport.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  buildPeriodRows,
  buildLocationRows,
  buildMatchHistoryRows,
  formatHeadToHead,
  starRatingLabel,
} from './personStatsExport';

describe('buildPeriodRows', () => {
  it('formats a period with a win percentage and an upward trend', () => {
    const result = buildPeriodRows([
      { period: '2026-08', gamesWon: 6, gamesLost: 2, tournamentsWon: 1, winPercentage: 75, trend: 'up', trendPointsChange: 5 },
    ]);
    expect(result).toEqual([
      { period: '2026-08', winPercentageLabel: '75%', trendLabel: 'Up +5pp', gamesWon: 6, gamesLost: 2 },
    ]);
  });

  it('formats a downward trend with the already-signed negative points change', () => {
    const result = buildPeriodRows([
      { period: '2026-07', gamesWon: 2, gamesLost: 6, tournamentsWon: 0, winPercentage: 25, trend: 'down', trendPointsChange: -10 },
    ]);
    expect(result[0].trendLabel).toBe('Down -10pp');
  });

  it('formats a flat trend as "Flat 0pp"', () => {
    const result = buildPeriodRows([
      { period: '2026-06', gamesWon: 4, gamesLost: 4, tournamentsWon: 0, winPercentage: 50, trend: 'flat', trendPointsChange: 0 },
    ]);
    expect(result[0].trendLabel).toBe('Flat 0pp');
  });

  it('formats a null trend (no previous period to compare) as an empty string', () => {
    const result = buildPeriodRows([
      { period: '2026-05', gamesWon: 3, gamesLost: 1, tournamentsWon: 0, winPercentage: 75, trend: null, trendPointsChange: null },
    ]);
    expect(result[0].trendLabel).toBe('');
  });

  it('formats a period with no games as "No matches"', () => {
    const result = buildPeriodRows([
      { period: '2026-04', gamesWon: 0, gamesLost: 0, tournamentsWon: 0, winPercentage: null, trend: null, trendPointsChange: null },
    ]);
    expect(result[0].winPercentageLabel).toBe('No matches');
  });
});

describe('buildLocationRows', () => {
  it('maps location counts to rows with a rounded win percentage', () => {
    const result = buildLocationRows([{ location: 'Pickle Turf', count: 4, wins: 3 }]);
    expect(result).toEqual([{ location: 'Pickle Turf', matchCount: 4, winPercentageLabel: '75%' }]);
  });

  it('formats a location with zero wins as "0%"', () => {
    const result = buildLocationRows([{ location: 'Picklers', count: 3, wins: 0 }]);
    expect(result[0].winPercentageLabel).toBe('0%');
  });
});

describe('buildMatchHistoryRows', () => {
  const nameById = new Map([
    ['p1', 'Alice'],
    ['p2', 'Bob'],
    ['p3', 'Carol'],
  ]);

  it('maps a won match to a W row with resolved names', () => {
    const result = buildMatchHistoryRows(
      [
        {
          tournamentId: 't1',
          tournamentDate: '2026-08-10',
          venueName: 'Pickle Turf',
          partnerId: 'p1',
          opponentIds: ['p2', 'p3'],
          scoreFor: 11,
          scoreAgainst: 7,
          won: true,
        },
      ],
      nameById
    );
    expect(result).toEqual([
      { date: '2026-08-10', partnerName: 'Alice', opponentsLabel: 'Bob / Carol', result: 'W', scoreLabel: '11-7' },
    ]);
  });

  it('maps a lost match to an L row', () => {
    const result = buildMatchHistoryRows(
      [
        {
          tournamentId: 't1',
          tournamentDate: '2026-08-10',
          venueName: 'Pickle Turf',
          partnerId: 'p1',
          opponentIds: ['p2', 'p3'],
          scoreFor: 7,
          scoreAgainst: 11,
          won: false,
        },
      ],
      nameById
    );
    expect(result[0].result).toBe('L');
  });

  it('falls back to "Unknown" for a missing name lookup', () => {
    const result = buildMatchHistoryRows(
      [
        {
          tournamentId: 't1',
          tournamentDate: '2026-08-10',
          venueName: 'Pickle Turf',
          partnerId: 'ghost',
          opponentIds: ['p2', 'ghost2'],
          scoreFor: 11,
          scoreAgainst: 7,
          won: true,
        },
      ],
      nameById
    );
    expect(result[0].partnerName).toBe('Unknown');
    expect(result[0].opponentsLabel).toBe('Bob / Unknown');
  });
});

describe('formatHeadToHead', () => {
  const nameById = new Map([['p1', 'Alice']]);

  it('formats a record with a resolved name and win-loss', () => {
    expect(formatHeadToHead({ personId: 'p1', wins: 5, losses: 2 }, nameById)).toBe('Alice (5-2)');
  });

  it('returns "Not enough matches yet" for a null record', () => {
    expect(formatHeadToHead(null, nameById)).toBe('Not enough matches yet');
  });

  it('falls back to "Unknown" for a missing name lookup', () => {
    expect(formatHeadToHead({ personId: 'ghost', wins: 1, losses: 0 }, nameById)).toBe('Unknown (1-0)');
  });
});

describe('starRatingLabel', () => {
  it('returns "No matches played yet" for a null win percentage', () => {
    expect(starRatingLabel(null)).toBe('No matches played yet');
  });

  it('formats an 80% win rate as 5/5 stars', () => {
    expect(starRatingLabel(80)).toBe('80% win rate (5/5 stars)');
  });

  it('formats a 55% win rate as 3/5 stars', () => {
    expect(starRatingLabel(55)).toBe('55% win rate (3/5 stars)');
  });

  it('formats a 10% win rate as 1/5 stars', () => {
    expect(starRatingLabel(10)).toBe('10% win rate (1/5 stars)');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/organizer-web && npx vitest run lib/stats/personStatsExport.test.ts`
Expected: FAIL — `personStatsExport.ts` does not exist yet.

- [ ] **Step 3: Implement `personStatsExport.ts`**

Create `apps/organizer-web/lib/stats/personStatsExport.ts`:

```typescript
import type { HeadToHeadRecord, LocationCount, PeriodStats, PersonMatchRecord } from './types';
import { starRating } from './starRating';

export type ExportPeriodRow = {
  period: string;
  winPercentageLabel: string;
  trendLabel: string;
  gamesWon: number;
  gamesLost: number;
};

function formatTrendPlain(
  trend: 'up' | 'down' | 'flat' | null,
  pointsChange: number | null
): string {
  if (trend === null || pointsChange === null) return '';
  if (trend === 'up') return `Up +${pointsChange}pp`;
  if (trend === 'down') return `Down ${pointsChange}pp`;
  return 'Flat 0pp';
}

export function buildPeriodRows(periods: PeriodStats[]): ExportPeriodRow[] {
  return periods.map((p) => ({
    period: p.period,
    winPercentageLabel: p.winPercentage !== null ? `${p.winPercentage}%` : 'No matches',
    trendLabel: formatTrendPlain(p.trend, p.trendPointsChange),
    gamesWon: p.gamesWon,
    gamesLost: p.gamesLost,
  }));
}

export type ExportLocationRow = {
  location: string;
  matchCount: number;
  winPercentageLabel: string;
};

export function buildLocationRows(locations: LocationCount[]): ExportLocationRow[] {
  return locations.map((l) => ({
    location: l.location,
    matchCount: l.count,
    winPercentageLabel: `${Math.round((l.wins / l.count) * 100)}%`,
  }));
}

export type ExportMatchHistoryRow = {
  date: string;
  partnerName: string;
  opponentsLabel: string;
  result: 'W' | 'L';
  scoreLabel: string;
};

export function buildMatchHistoryRows(
  matchHistory: PersonMatchRecord[],
  nameById: Map<string, string>
): ExportMatchHistoryRow[] {
  return matchHistory.map((m) => ({
    date: m.tournamentDate,
    partnerName: nameById.get(m.partnerId) ?? 'Unknown',
    opponentsLabel: `${nameById.get(m.opponentIds[0]) ?? 'Unknown'} / ${nameById.get(m.opponentIds[1]) ?? 'Unknown'}`,
    result: m.won ? 'W' : 'L',
    scoreLabel: `${m.scoreFor}-${m.scoreAgainst}`,
  }));
}

export function formatHeadToHead(
  record: HeadToHeadRecord | null,
  nameById: Map<string, string>
): string {
  if (!record) return 'Not enough matches yet';
  return `${nameById.get(record.personId) ?? 'Unknown'} (${record.wins}-${record.losses})`;
}

export function starRatingLabel(winPercentage: number | null): string {
  if (winPercentage === null) return 'No matches played yet';
  return `${winPercentage}% win rate (${starRating(winPercentage)}/5 stars)`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/organizer-web && npx vitest run lib/stats/personStatsExport.test.ts`
Expected: PASS, 15/15 tests.

- [ ] **Step 5: Run the full suite**

Run: `cd apps/organizer-web && npm test`
Expected: all tests pass (previous count + 15 new).

- [ ] **Step 6: Commit**

```bash
git add apps/organizer-web/lib/stats/personStatsExport.ts apps/organizer-web/lib/stats/personStatsExport.test.ts
git commit -m "feat: add pure data-shaping functions for player stats PDF export"
```

---

### Task 2: `SharePlayerStatsButton` component

**Files:**
- Create: `apps/organizer-web/app/people/[id]/SharePlayerStatsButton.tsx`

**Interfaces:**
- Consumes: `shareOrDownloadPdf`, `sanitizeFileNamePart` from `@/lib/pdf/pdfShare`; `ExportLocationRow`, `ExportPeriodRow`, `ExportMatchHistoryRow` types from `@/lib/stats/personStatsExport` (Task 1); `jspdf` default export, `jspdf-autotable` default export — both dynamically imported inside the click handler.
- Produces: default-exported React component `SharePlayerStatsButton`, rendered by Task 3 with the props below.

- [ ] **Step 1: Create the component**

Create `apps/organizer-web/app/people/[id]/SharePlayerStatsButton.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { outlineButtonClass } from '@/app/components/ui';
import { shareOrDownloadPdf, sanitizeFileNamePart } from '@/lib/pdf/pdfShare';
import type { ExportLocationRow, ExportMatchHistoryRow, ExportPeriodRow } from '@/lib/stats/personStatsExport';

type SharePlayerStatsButtonProps = {
  personName: string;
  lastPlayedDate: string | null;
  starLabel: string;
  thisMonthGamesWon: number;
  thisMonthGamesLost: number;
  thisMonthTournamentsWon: number;
  locationRows: ExportLocationRow[];
  weeklyRows: ExportPeriodRow[];
  monthlyRows: ExportPeriodRow[];
  yearlyRows: ExportPeriodRow[];
  toughestOpponentLabel: string;
  bestPartnerLabel: string;
  matchHistoryRows: ExportMatchHistoryRow[];
};

export default function SharePlayerStatsButton({
  personName,
  lastPlayedDate,
  starLabel,
  thisMonthGamesWon,
  thisMonthGamesLost,
  thisMonthTournamentsWon,
  locationRows,
  weeklyRows,
  monthlyRows,
  yearlyRows,
  toughestOpponentLabel,
  bestPartnerLabel,
  matchHistoryRows,
}: SharePlayerStatsButtonProps) {
  const [status, setStatus] = useState<'idle' | 'generating' | 'unsupported' | 'error'>('idle');

  const handleClick = async () => {
    setStatus('generating');
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);

      const doc = new jsPDF();
      let y = 16;

      doc.setFontSize(16);
      doc.text('PicklerAlly DXB', 14, y);
      y += 8;
      doc.setFontSize(13);
      doc.text(personName, 14, y);
      y += 7;

      doc.setFontSize(10);
      doc.text(
        [lastPlayedDate ? `Last played: ${lastPlayedDate}` : 'No matches played yet', starLabel].join(' · '),
        14,
        y
      );
      y += 10;

      doc.setFontSize(12);
      doc.text('This Month', 14, y);
      y += 6;
      doc.setFontSize(10);
      doc.text(
        `Games Won: ${thisMonthGamesWon}   Games Lost: ${thisMonthGamesLost}   Tournaments Won: ${thisMonthTournamentsWon}`,
        14,
        y
      );
      y += 10;

      doc.setFontSize(12);
      doc.text('By Location', 14, y);
      y += 2;
      autoTable(doc, {
        startY: y + 4,
        head: [['Location', 'Matches', 'Win %']],
        body: locationRows.map((r) => [r.location, String(r.matchCount), r.winPercentageLabel]),
      });
      // @ts-expect-error -- doc.lastAutoTable is set at runtime by jspdf-autotable, with no official type augmentation
      y = doc.lastAutoTable.finalY + 8;

      const trendTable = (title: string, rows: ExportPeriodRow[]) => {
        doc.setFontSize(12);
        doc.text(title, 14, y);
        y += 2;
        autoTable(doc, {
          startY: y + 4,
          head: [['Period', 'Win %', 'Trend', 'W', 'L']],
          body: rows.map((r) => [
            r.period,
            r.winPercentageLabel,
            r.trendLabel,
            String(r.gamesWon),
            String(r.gamesLost),
          ]),
        });
        // @ts-expect-error -- doc.lastAutoTable is set at runtime by jspdf-autotable, with no official type augmentation
        y = doc.lastAutoTable.finalY + 8;
      };

      trendTable('Weekly Trend', weeklyRows);
      trendTable('Monthly Trend', monthlyRows);
      trendTable('Yearly Trend', yearlyRows);

      doc.setFontSize(12);
      doc.text('Head-to-Head', 14, y);
      y += 6;
      doc.setFontSize(10);
      doc.text(`Toughest opponent: ${toughestOpponentLabel}`, 14, y);
      y += 6;
      doc.text(`Best partner: ${bestPartnerLabel}`, 14, y);
      y += 10;

      doc.setFontSize(12);
      doc.text('Match History', 14, y);
      y += 2;
      autoTable(doc, {
        startY: y + 4,
        head: [['Date', 'Partner', 'Opponents', 'Result', 'Score']],
        body: matchHistoryRows.map((r) => [
          r.date,
          r.partnerName,
          r.opponentsLabel,
          r.result,
          r.scoreLabel,
        ]),
      });

      const blob: Blob = doc.output('blob');
      const fileName = `${sanitizeFileNamePart(personName)}-stats.pdf`;
      const result = await shareOrDownloadPdf(blob, fileName, personName);
      setStatus(result === 'downloaded' ? 'unsupported' : 'idle');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'generating'}
        className={outlineButtonClass}
      >
        {status === 'generating' ? 'Generating…' : '📤 Share Stats'}
      </button>
      {status === 'unsupported' && (
        <p className="text-xs text-slate-500 mt-1.5">
          Downloaded — this browser doesn't support direct sharing. Attach the file to WhatsApp manually.
        </p>
      )}
      {status === 'error' && (
        <p className="text-xs text-red-600 mt-1.5">
          Something went wrong generating the PDF. Try again.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run the build to verify it compiles**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds. This component isn't wired into any page yet (Task 3 does that), so the build only confirms it type-checks and has no syntax errors — it's dead code until Task 3.

- [ ] **Step 3: Commit**

```bash
git add "apps/organizer-web/app/people/[id]/SharePlayerStatsButton.tsx"
git commit -m "feat: add SharePlayerStatsButton component (player stats PDF generation + share/download)"
```

---

### Task 3: Wire `SharePlayerStatsButton` into the Player Detail page

**Files:**
- Modify: `apps/organizer-web/app/people/[id]/page.tsx`

**Interfaces:**
- Consumes: `buildLocationRows`, `buildPeriodRows`, `buildMatchHistoryRows`, `formatHeadToHead`, `starRatingLabel` from `@/lib/stats/personStatsExport` (Task 1); default-exported `SharePlayerStatsButton` from `./SharePlayerStatsButton` (Task 2), with the exact prop names defined in Task 2's `SharePlayerStatsButtonProps`.

- [ ] **Step 1: Add the import statements**

In `apps/organizer-web/app/people/[id]/page.tsx`, find:

```tsx
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { computePersonStats } from '@/lib/stats/personStats';
import { starRating, renderStars } from '@/lib/stats/starRating';
```

Replace with:

```tsx
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { computePersonStats } from '@/lib/stats/personStats';
import { starRating, renderStars } from '@/lib/stats/starRating';
import {
  buildLocationRows,
  buildPeriodRows,
  buildMatchHistoryRows,
  formatHeadToHead,
  starRatingLabel,
} from '@/lib/stats/personStatsExport';
import SharePlayerStatsButton from './SharePlayerStatsButton';
```

- [ ] **Step 2: Compute the export props after `thisMonth` is derived**

Find:

```tsx
  const stats = computePersonStats(records, tournamentsWon);
  const nameFor = (personId: string) => personNameById.get(personId) ?? 'Unknown';

  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const thisMonth = stats.monthly.find((m) => m.period === currentMonthKey) ?? {
    gamesWon: 0,
    gamesLost: 0,
    tournamentsWon: 0,
  };
```

Replace with:

```tsx
  const stats = computePersonStats(records, tournamentsWon);
  const nameFor = (personId: string) => personNameById.get(personId) ?? 'Unknown';

  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const thisMonth = stats.monthly.find((m) => m.period === currentMonthKey) ?? {
    gamesWon: 0,
    gamesLost: 0,
    tournamentsWon: 0,
  };

  const locationRows = buildLocationRows(stats.matchesByLocation);
  const weeklyRows = buildPeriodRows(stats.weekly.slice(0, 4));
  const monthlyRows = buildPeriodRows(stats.monthly.slice(0, 6));
  const yearlyRows = buildPeriodRows(stats.yearly);
  const matchHistoryRows = buildMatchHistoryRows(stats.matchHistory, personNameById);
  const toughestOpponentLabel = formatHeadToHead(stats.toughestOpponent, personNameById);
  const bestPartnerLabel = formatHeadToHead(stats.bestPartner, personNameById);
  const starLabel = starRatingLabel(stats.winPercentage);
```

- [ ] **Step 3: Render the button below the summary line**

Find:

```tsx
      <p className="text-sm text-slate-500 mb-6">
        {stats.winPercentage !== null ? (
          <>
            Win rate: {stats.winPercentage}%{' '}
            <span className="text-green-600">
              {renderStars(starRating(stats.winPercentage))}
            </span>
          </>
        ) : (
          'No matches played yet'
        )}
      </p>

      <div className={`${cardClass} mb-6`}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">This Month</h2>
```

Replace with:

```tsx
      <p className="text-sm text-slate-500 mb-6">
        {stats.winPercentage !== null ? (
          <>
            Win rate: {stats.winPercentage}%{' '}
            <span className="text-green-600">
              {renderStars(starRating(stats.winPercentage))}
            </span>
          </>
        ) : (
          'No matches played yet'
        )}
      </p>

      <div className="mb-6">
        <SharePlayerStatsButton
          personName={person.name}
          lastPlayedDate={stats.lastPlayedDate}
          starLabel={starLabel}
          thisMonthGamesWon={thisMonth.gamesWon}
          thisMonthGamesLost={thisMonth.gamesLost}
          thisMonthTournamentsWon={thisMonth.tournamentsWon}
          locationRows={locationRows}
          weeklyRows={weeklyRows}
          monthlyRows={monthlyRows}
          yearlyRows={yearlyRows}
          toughestOpponentLabel={toughestOpponentLabel}
          bestPartnerLabel={bestPartnerLabel}
          matchHistoryRows={matchHistoryRows}
        />
        <p className="text-xs text-slate-400 mt-1.5">
          Opens your share sheet on mobile — downloads the file on desktop.
        </p>
      </div>

      <div className={`${cardClass} mb-6`}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">This Month</h2>
```

- [ ] **Step 4: Run the build**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no TypeScript errors — this confirms `SharePlayerStatsButtonProps`' field names match exactly what the page now passes.

- [ ] **Step 5: Run the full test suite**

Run: `cd apps/organizer-web && npm test`
Expected: all tests still pass — this task adds no new pure-function logic (it's a Server Component composing existing, already-tested pieces).

- [ ] **Step 6: Commit**

```bash
git add "apps/organizer-web/app/people/[id]/page.tsx"
git commit -m "feat: wire Share Stats button into the Player Detail page"
```

---

### Task 4: Push and verify CI + manual regression

**Files:** none (verification-only task).

- [ ] **Step 1: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 2: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 3: Manual regression**

No database migration is needed for this feature. On a player's `/people/[id]` page:

- Confirm a "📤 Share Stats" button appears below the win-rate summary line.
- Click it and confirm the PDF shows: header/summary (last played date, plain-text star rating like "62% win rate (4/5 stars)" — NOT the ★ glyph), This Month numbers, a By Location table, three Trend tables (Weekly/Monthly/Yearly, with plain-text trend labels like "Up +5pp" — NOT the ▲ glyph), Head-to-Head lines, and a Match History table.
- Confirm the Weekly table shows at most 4 rows and the Monthly table at most 6 rows, matching the page's own display caps; confirm Yearly and Match History are unbounded (all rows shown), matching the page.
- On a player with zero matches played: confirm Share Stats still works and produces a sparse-but-valid PDF ("No matches played yet" copy, empty tables) rather than crashing.
- Confirm on mobile the OS share sheet opens with WhatsApp selectable, and on desktop the file downloads directly.
- Confirm the on-page display (still showing ★/▲/▼ Unicode glyphs) is completely unchanged — this task only added a new button and new data-shaping calls, it didn't touch any existing JSX section.

Clean up any disposable test data used for this check afterward.
