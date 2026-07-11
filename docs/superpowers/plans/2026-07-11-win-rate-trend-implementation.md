# Win Rate Trend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each player's win rate broken down by week/month/year with a trend indicator (improving/declining/flat) comparing each period to the one before it, on both profile pages.

**Architecture:** `buildPeriods` (the existing function already used to build `weekly`/`monthly`/`yearly`) gets a post-processing pass that computes each period's win percentage and compares it to the next entry in the same sorted array. A small new display-helper module renders the trend as an arrow + point-change string with a color class. Both profile pages get an identical new card.

**Tech Stack:** Same as prior work — Next.js (App Router, TypeScript), Supabase JS client, Vitest.

## Global Constraints

- Trend always compares a period to whichever period the player most recently actually played before it (the next entry in the already-sorted, gap-free array) — never a literal adjacent calendar period.
- Weekly shows the last 4 periods, Monthly the last 6, Yearly all of them — all three get trend arrows.
- The oldest period in each list has no trend (nothing earlier to compare against).
- Design reference: [docs/superpowers/specs/2026-07-11-win-rate-trend-design.md](../specs/2026-07-11-win-rate-trend-design.md).

---

### Task 1: `PeriodStats` gains `winPercentage`/`trend`/`trendPointsChange`

**Files:**
- Modify: `apps/organizer-web/lib/stats/types.ts`
- Modify: `apps/organizer-web/lib/stats/personStats.ts`
- Test: `apps/organizer-web/lib/stats/personStats.test.ts`

**Interfaces:**
- Produces: `PeriodStats.winPercentage: number | null`, `PeriodStats.trend: 'up' | 'down' | 'flat' | null`, `PeriodStats.trendPointsChange: number | null` — consumed by Task 3 and Task 4 (both profile pages) via `stats.weekly`/`stats.monthly`/`stats.yearly`.

- [ ] **Step 1: Update the failing test fixtures and add new test cases**

Replace the full contents of `apps/organizer-web/lib/stats/personStats.test.ts` with:

```typescript
import { describe, it, expect } from 'vitest';
import { computePersonStats } from './personStats';
import type { PersonMatchRecord, TournamentWon } from './types';

describe('computePersonStats', () => {
  it('rolls up games won/lost by week, month, and year', () => {
    const matches: PersonMatchRecord[] = [
      {
        tournamentId: 't1',
        tournamentDate: '2026-07-06', // a Monday
        venueName: 'Pickle Turf',
        partnerId: 'p-bob',
        opponentIds: ['p-carol', 'p-dave'],
        scoreFor: 11,
        scoreAgainst: 7,
        won: true,
      },
      {
        tournamentId: 't2',
        tournamentDate: '2026-07-13', // the following Monday
        venueName: 'Pickle Turf',
        partnerId: 'p-bob',
        opponentIds: ['p-carol', 'p-dave'],
        scoreFor: 6,
        scoreAgainst: 11,
        won: false,
      },
    ];

    const stats = computePersonStats(matches, []);

    expect(stats.weekly).toEqual([
      { period: '2026-07-13', gamesWon: 0, gamesLost: 1, tournamentsWon: 0, winPercentage: 0, trend: 'down', trendPointsChange: -100 },
      { period: '2026-07-06', gamesWon: 1, gamesLost: 0, tournamentsWon: 0, winPercentage: 100, trend: null, trendPointsChange: null },
    ]);
    expect(stats.monthly).toEqual([
      { period: '2026-07', gamesWon: 1, gamesLost: 1, tournamentsWon: 0, winPercentage: 50, trend: null, trendPointsChange: null },
    ]);
    expect(stats.yearly).toEqual([
      { period: '2026', gamesWon: 1, gamesLost: 1, tournamentsWon: 0, winPercentage: 50, trend: null, trendPointsChange: null },
    ]);
  });

  it('counts tournaments won in the correct period', () => {
    const tournamentsWon: TournamentWon[] = [{ tournamentId: 't1', date: '2026-07-06' }];
    const stats = computePersonStats([], tournamentsWon);

    expect(stats.monthly).toEqual([
      { period: '2026-07', gamesWon: 0, gamesLost: 0, tournamentsWon: 1, winPercentage: null, trend: null, trendPointsChange: null },
    ]);
  });

  it('identifies the toughest opponent by worst win rate, tie-broken by match count', () => {
    const matches: PersonMatchRecord[] = [
      { tournamentId: 't1', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't1', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-eve', 'p-frank'], scoreFor: 4, scoreAgainst: 11, won: false },
      { tournamentId: 't2', tournamentDate: '2026-07-13', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-eve', 'p-frank'], scoreFor: 6, scoreAgainst: 11, won: false },
    ];

    const stats = computePersonStats(matches, []);

    expect(stats.toughestOpponent).toEqual({ personId: 'p-eve', wins: 0, losses: 2 });
  });

  it('identifies the best partner by highest win rate, tie-broken by match count', () => {
    const matches: PersonMatchRecord[] = [
      { tournamentId: 't1', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't2', tournamentDate: '2026-07-13', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 9, won: true },
      { tournamentId: 't3', tournamentDate: '2026-07-20', venueName: 'Pickle Turf', partnerId: 'p-zara', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 3, won: true },
    ];

    const stats = computePersonStats(matches, []);

    // p-bob (2-0) and p-zara (1-0) are both undefeated; p-bob wins the tie-break with more matches.
    expect(stats.bestPartner).toEqual({ personId: 'p-bob', wins: 2, losses: 0 });
  });

  it('returns null toughestOpponent/bestPartner when there are no matches', () => {
    const stats = computePersonStats([], []);
    expect(stats.toughestOpponent).toBeNull();
    expect(stats.bestPartner).toBeNull();
  });

  it('sorts match history newest first', () => {
    const matches: PersonMatchRecord[] = [
      { tournamentId: 't1', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't2', tournamentDate: '2026-07-20', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 9, won: true },
    ];

    const stats = computePersonStats(matches, []);
    expect(stats.matchHistory.map((m) => m.tournamentId)).toEqual(['t2', 't1']);
  });

  it('returns the most recent match date as lastPlayedDate, or null with no matches', () => {
    const matches: PersonMatchRecord[] = [
      { tournamentId: 't1', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't2', tournamentDate: '2026-07-20', venueName: 'Picklers', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 9, won: true },
    ];

    expect(computePersonStats(matches, []).lastPlayedDate).toBe('2026-07-20');
    expect(computePersonStats([], []).lastPlayedDate).toBeNull();
  });

  it('counts matches and wins by location, sorted by count descending', () => {
    const matches: PersonMatchRecord[] = [
      { tournamentId: 't1', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't2', tournamentDate: '2026-07-13', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 6, scoreAgainst: 11, won: false },
      { tournamentId: 't3', tournamentDate: '2026-07-20', venueName: 'Picklers', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 3, won: true },
    ];

    const stats = computePersonStats(matches, []);

    expect(stats.matchesByLocation).toEqual([
      { location: 'Pickle Turf', count: 2, wins: 1 },
      { location: 'Picklers', count: 1, wins: 1 },
    ]);
    expect(computePersonStats([], []).matchesByLocation).toEqual([]);
  });

  it('computes overall win percentage, rounded, or null with no matches', () => {
    const matches: PersonMatchRecord[] = [
      { tournamentId: 't1', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't2', tournamentDate: '2026-07-13', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 6, scoreAgainst: 11, won: false },
      { tournamentId: 't3', tournamentDate: '2026-07-20', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 3, won: true },
    ];

    // 2 wins out of 3 matches = 66.67%, rounds to 67
    expect(computePersonStats(matches, []).winPercentage).toBe(67);
    expect(computePersonStats([], []).winPercentage).toBeNull();
  });

  it('computes win percentage and trend per period, comparing to the next most recent period with data', () => {
    const matches: PersonMatchRecord[] = [
      // Week 1 (oldest): 2026-06-22, 1W 1L = 50%
      { tournamentId: 't1', tournamentDate: '2026-06-22', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't1', tournamentDate: '2026-06-22', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 5, scoreAgainst: 11, won: false },
      // Week 2: 2026-06-29, 3W 1L = 75% (up from 50%)
      { tournamentId: 't2', tournamentDate: '2026-06-29', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't2', tournamentDate: '2026-06-29', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't2', tournamentDate: '2026-06-29', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't2', tournamentDate: '2026-06-29', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 5, scoreAgainst: 11, won: false },
      // Week 3 (most recent): 2026-07-06, 1W 3L = 25% (down from 75%)
      { tournamentId: 't3', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't3', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 5, scoreAgainst: 11, won: false },
      { tournamentId: 't3', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 5, scoreAgainst: 11, won: false },
      { tournamentId: 't3', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 5, scoreAgainst: 11, won: false },
    ];

    const stats = computePersonStats(matches, []);

    expect(stats.weekly).toEqual([
      { period: '2026-07-06', gamesWon: 1, gamesLost: 3, tournamentsWon: 0, winPercentage: 25, trend: 'down', trendPointsChange: -50 },
      { period: '2026-06-29', gamesWon: 3, gamesLost: 1, tournamentsWon: 0, winPercentage: 75, trend: 'up', trendPointsChange: 25 },
      { period: '2026-06-22', gamesWon: 1, gamesLost: 1, tournamentsWon: 0, winPercentage: 50, trend: null, trendPointsChange: null },
    ]);
  });

  it('marks trend as flat when win percentage is unchanged between periods', () => {
    const matches: PersonMatchRecord[] = [
      { tournamentId: 't1', tournamentDate: '2026-06-29', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't1', tournamentDate: '2026-06-29', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 5, scoreAgainst: 11, won: false },
      { tournamentId: 't2', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't2', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 5, scoreAgainst: 11, won: false },
    ];

    const stats = computePersonStats(matches, []);

    expect(stats.weekly[0].trend).toBe('flat');
    expect(stats.weekly[0].trendPointsChange).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/organizer-web && npm test
```

Expected: FAIL — the existing weekly/monthly/yearly assertions no longer match (missing the three new fields), and the two new trend tests fail because `winPercentage`/`trend`/`trendPointsChange` don't exist on `PeriodStats` yet.

- [ ] **Step 3: Add the three fields to `PeriodStats`**

In `apps/organizer-web/lib/stats/types.ts`, change:

```typescript
export type PeriodStats = {
  period: string; // Monday date (weekly), 'YYYY-MM' (monthly), or 'YYYY' (yearly)
  gamesWon: number;
  gamesLost: number;
  tournamentsWon: number;
};
```

to:

```typescript
export type PeriodStats = {
  period: string; // Monday date (weekly), 'YYYY-MM' (monthly), or 'YYYY' (yearly)
  gamesWon: number;
  gamesLost: number;
  tournamentsWon: number;
  winPercentage: number | null;
  trend: 'up' | 'down' | 'flat' | null;
  trendPointsChange: number | null;
};
```

- [ ] **Step 4: Update `buildPeriods` to compute win percentage and trend**

In `apps/organizer-web/lib/stats/personStats.ts`, change the `buildPeriods` function from:

```typescript
function buildPeriods(
  matches: PersonMatchRecord[],
  tournamentsWon: TournamentWon[],
  keyFn: (date: string) => string
): PeriodStats[] {
  const table = new Map<string, PeriodStats>();

  const ensure = (period: string): PeriodStats => {
    let row = table.get(period);
    if (!row) {
      row = { period, gamesWon: 0, gamesLost: 0, tournamentsWon: 0 };
      table.set(period, row);
    }
    return row;
  };

  for (const m of matches) {
    const row = ensure(keyFn(m.tournamentDate));
    if (m.won) {
      row.gamesWon += 1;
    } else {
      row.gamesLost += 1;
    }
  }

  for (const t of tournamentsWon) {
    ensure(keyFn(t.date)).tournamentsWon += 1;
  }

  return Array.from(table.values()).sort((a, b) => (a.period < b.period ? 1 : -1));
}
```

to:

```typescript
type PeriodTotals = {
  period: string;
  gamesWon: number;
  gamesLost: number;
  tournamentsWon: number;
};

function periodWinPercentage(row: PeriodTotals): number | null {
  const totalGames = row.gamesWon + row.gamesLost;
  return totalGames > 0 ? Math.round((row.gamesWon / totalGames) * 100) : null;
}

function buildPeriods(
  matches: PersonMatchRecord[],
  tournamentsWon: TournamentWon[],
  keyFn: (date: string) => string
): PeriodStats[] {
  const table = new Map<string, PeriodTotals>();

  const ensure = (period: string): PeriodTotals => {
    let row = table.get(period);
    if (!row) {
      row = { period, gamesWon: 0, gamesLost: 0, tournamentsWon: 0 };
      table.set(period, row);
    }
    return row;
  };

  for (const m of matches) {
    const row = ensure(keyFn(m.tournamentDate));
    if (m.won) {
      row.gamesWon += 1;
    } else {
      row.gamesLost += 1;
    }
  }

  for (const t of tournamentsWon) {
    ensure(keyFn(t.date)).tournamentsWon += 1;
  }

  const sorted = Array.from(table.values()).sort((a, b) => (a.period < b.period ? 1 : -1));

  return sorted.map((row, i) => {
    const winPercentage = periodWinPercentage(row);
    const previous = sorted[i + 1];

    let trend: 'up' | 'down' | 'flat' | null = null;
    let trendPointsChange: number | null = null;

    if (previous) {
      const previousWinPercentage = periodWinPercentage(previous);
      if (winPercentage !== null && previousWinPercentage !== null) {
        trendPointsChange = winPercentage - previousWinPercentage;
        trend = trendPointsChange > 0 ? 'up' : trendPointsChange < 0 ? 'down' : 'flat';
      }
    }

    return { ...row, winPercentage, trend, trendPointsChange };
  });
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd apps/organizer-web && npm test
```

Expected: PASS, all tests across the whole suite green.

- [ ] **Step 6: Commit**

```bash
git add apps/organizer-web/lib/stats/types.ts apps/organizer-web/lib/stats/personStats.ts apps/organizer-web/lib/stats/personStats.test.ts
git commit -m "Add win percentage and trend to weekly/monthly/yearly period stats"
```

---

### Task 2: `renderTrend` / `trendColorClass` display helpers

**Files:**
- Create: `apps/organizer-web/lib/stats/trend.ts`
- Test: `apps/organizer-web/lib/stats/trend.test.ts`

**Interfaces:**
- Consumes: `PeriodStats.trend`, `PeriodStats.trendPointsChange` (Task 1) as its two parameters.
- Produces: `renderTrend(trend: 'up' | 'down' | 'flat' | null, pointsChange: number | null): string`, `trendColorClass(trend: 'up' | 'down' | 'flat' | null): string` — consumed by Task 3 and Task 4.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/organizer-web/lib/stats/trend.test.ts
import { describe, it, expect } from 'vitest';
import { renderTrend, trendColorClass } from './trend';

describe('renderTrend', () => {
  it('renders an up arrow with a positive points change', () => {
    expect(renderTrend('up', 25)).toBe('▲ +25pp');
  });

  it('renders a down arrow with a negative points change', () => {
    expect(renderTrend('down', -50)).toBe('▼ -50pp');
  });

  it('renders a flat dash with zero points change', () => {
    expect(renderTrend('flat', 0)).toBe('— 0pp');
  });

  it('renders nothing when there is no prior period to compare against', () => {
    expect(renderTrend(null, null)).toBe('');
  });
});

describe('trendColorClass', () => {
  it('returns a teal class for up', () => {
    expect(trendColorClass('up')).toBe('text-teal-700');
  });

  it('returns a red class for down', () => {
    expect(trendColorClass('down')).toBe('text-red-600');
  });

  it('returns a slate class for flat', () => {
    expect(trendColorClass('flat')).toBe('text-slate-400');
  });

  it('returns a slate class for null', () => {
    expect(trendColorClass(null)).toBe('text-slate-400');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/organizer-web && npm test
```

Expected: FAIL with `Cannot find module './trend'`.

- [ ] **Step 3: Implement the functions**

```typescript
// apps/organizer-web/lib/stats/trend.ts
export function renderTrend(
  trend: 'up' | 'down' | 'flat' | null,
  pointsChange: number | null
): string {
  if (trend === null || pointsChange === null) {
    return '';
  }
  if (trend === 'up') {
    return `▲ +${pointsChange}pp`;
  }
  if (trend === 'down') {
    return `▼ ${pointsChange}pp`;
  }
  return '— 0pp';
}

export function trendColorClass(trend: 'up' | 'down' | 'flat' | null): string {
  if (trend === 'up') {
    return 'text-teal-700';
  }
  if (trend === 'down') {
    return 'text-red-600';
  }
  return 'text-slate-400';
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/organizer-web && npm test
```

Expected: PASS, all 8 new tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/lib/stats/trend.ts apps/organizer-web/lib/stats/trend.test.ts
git commit -m "Add trend rendering and color helpers"
```

---

### Task 3: Organizer Player Profile page — Win Rate Trend card

**Files:**
- Modify: `apps/organizer-web/app/people/[id]/page.tsx`

**Interfaces:**
- Consumes: `renderTrend`, `trendColorClass` from `@/lib/stats/trend` (Task 2); `PeriodStats.winPercentage`/`trend`/`trendPointsChange` via `stats.weekly`/`stats.monthly`/`stats.yearly` (Task 1).

- [ ] **Step 1: Add the import**

In `apps/organizer-web/app/people/[id]/page.tsx`, add this import alongside the existing ones:

```typescript
import { renderTrend, trendColorClass } from '@/lib/stats/trend';
```

- [ ] **Step 2: Add the "Win Rate Trend" card**

Immediately after the closing `</div>` of the existing "By Location" card and before the "Head-to-Head" card's opening `<div className={`${cardClass} mb-6`}>`, add:

```typescript jsx
      <div className={`${cardClass} mb-6`}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">Win Rate Trend</h2>

        <h3 className="text-sm font-bold text-slate-700 mb-2">Weekly</h3>
        {stats.weekly.length > 0 ? (
          <ul className="space-y-1 text-sm mb-4">
            {stats.weekly.slice(0, 4).map((p) => (
              <li key={p.period} className="flex items-center justify-between">
                <span className="text-slate-600">{p.period}</span>
                <span>
                  <span className="font-semibold text-slate-900">
                    {p.winPercentage !== null ? `${p.winPercentage}%` : 'No matches'}
                  </span>{' '}
                  <span className={`text-xs font-semibold ${trendColorClass(p.trend)}`}>
                    {renderTrend(p.trend, p.trendPointsChange)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-400 text-sm mb-4">No matches played yet.</p>
        )}

        <h3 className="text-sm font-bold text-slate-700 mb-2">Monthly</h3>
        {stats.monthly.length > 0 ? (
          <ul className="space-y-1 text-sm mb-4">
            {stats.monthly.slice(0, 6).map((p) => (
              <li key={p.period} className="flex items-center justify-between">
                <span className="text-slate-600">{p.period}</span>
                <span>
                  <span className="font-semibold text-slate-900">
                    {p.winPercentage !== null ? `${p.winPercentage}%` : 'No matches'}
                  </span>{' '}
                  <span className={`text-xs font-semibold ${trendColorClass(p.trend)}`}>
                    {renderTrend(p.trend, p.trendPointsChange)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-400 text-sm mb-4">No matches played yet.</p>
        )}

        <h3 className="text-sm font-bold text-slate-700 mb-2">Yearly</h3>
        {stats.yearly.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {stats.yearly.map((p) => (
              <li key={p.period} className="flex items-center justify-between">
                <span className="text-slate-600">{p.period}</span>
                <span>
                  <span className="font-semibold text-slate-900">
                    {p.winPercentage !== null ? `${p.winPercentage}%` : 'No matches'}
                  </span>{' '}
                  <span className={`text-xs font-semibold ${trendColorClass(p.trend)}`}>
                    {renderTrend(p.trend, p.trendPointsChange)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-400 text-sm">No matches played yet.</p>
        )}
      </div>
```

- [ ] **Step 3: Verify the build compiles**

```bash
cd apps/organizer-web && npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Manual verification in browser**

Open `/people/{id}` for a player with matches spread across at least two different weeks and two different months. Confirm a new "Win Rate Trend" card appears after "By Location", with Weekly (up to 4 rows), Monthly (up to 6 rows), and Yearly (all rows) subsections, each row showing a win percentage and a colored trend arrow (except the oldest row in each subsection, which shows no arrow).

- [ ] **Step 5: Commit**

```bash
git add "apps/organizer-web/app/people/[id]/page.tsx"
git commit -m "Add Win Rate Trend card to Player Profile"
```

---

### Task 4: Public player history page — Win Rate Trend card

**Files:**
- Modify: `apps/organizer-web/app/p/[id]/page.tsx`

**Interfaces:**
- Consumes: same as Task 3, applied to the public page's parallel data pipeline.

- [ ] **Step 1: Add the import**

In `apps/organizer-web/app/p/[id]/page.tsx`, add this import alongside the existing ones:

```typescript
import { renderTrend, trendColorClass } from '@/lib/stats/trend';
```

- [ ] **Step 2: Add the "Win Rate Trend" card**

Immediately after the closing `</div>` of the existing "By Location" card and before the "Head-to-Head" card's opening `<div className={cardClass}>`, add:

```typescript jsx
        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">Win Rate Trend</h2>

          <h3 className="text-sm font-bold text-slate-700 mb-2">Weekly</h3>
          {stats.weekly.length > 0 ? (
            <ul className="space-y-1 text-sm mb-4">
              {stats.weekly.slice(0, 4).map((p) => (
                <li key={p.period} className="flex items-center justify-between">
                  <span className="text-slate-600">{p.period}</span>
                  <span>
                    <span className="font-semibold text-slate-900">
                      {p.winPercentage !== null ? `${p.winPercentage}%` : 'No matches'}
                    </span>{' '}
                    <span className={`text-xs font-semibold ${trendColorClass(p.trend)}`}>
                      {renderTrend(p.trend, p.trendPointsChange)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-400 text-sm mb-4">No matches played yet.</p>
          )}

          <h3 className="text-sm font-bold text-slate-700 mb-2">Monthly</h3>
          {stats.monthly.length > 0 ? (
            <ul className="space-y-1 text-sm mb-4">
              {stats.monthly.slice(0, 6).map((p) => (
                <li key={p.period} className="flex items-center justify-between">
                  <span className="text-slate-600">{p.period}</span>
                  <span>
                    <span className="font-semibold text-slate-900">
                      {p.winPercentage !== null ? `${p.winPercentage}%` : 'No matches'}
                    </span>{' '}
                    <span className={`text-xs font-semibold ${trendColorClass(p.trend)}`}>
                      {renderTrend(p.trend, p.trendPointsChange)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-400 text-sm mb-4">No matches played yet.</p>
          )}

          <h3 className="text-sm font-bold text-slate-700 mb-2">Yearly</h3>
          {stats.yearly.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {stats.yearly.map((p) => (
                <li key={p.period} className="flex items-center justify-between">
                  <span className="text-slate-600">{p.period}</span>
                  <span>
                    <span className="font-semibold text-slate-900">
                      {p.winPercentage !== null ? `${p.winPercentage}%` : 'No matches'}
                    </span>{' '}
                    <span className={`text-xs font-semibold ${trendColorClass(p.trend)}`}>
                      {renderTrend(p.trend, p.trendPointsChange)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-400 text-sm">No matches played yet.</p>
          )}
        </div>
```

- [ ] **Step 3: Verify the build compiles**

```bash
cd apps/organizer-web && npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Manual verification in browser**

Open the same player's public page (`/p/{id}`) and confirm it shows an identical "Win Rate Trend" card to the organizer's `/people/{id}` page from Task 3.

- [ ] **Step 5: Commit**

```bash
git add "apps/organizer-web/app/p/[id]/page.tsx"
git commit -m "Add Win Rate Trend card to public player page"
```

---

### Task 5: Push and verify CI

**Files:** none (repo-level)

- [ ] **Step 1: Push to GitHub**

```bash
cd "C:\Users\ANKS\pickleball project"
git push
```

- [ ] **Step 2: Confirm CI passes**

Check the Actions tab on GitHub (or poll `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`) and confirm the latest run's `conclusion` is `success`.

- [ ] **Step 3: Full manual regression check**

Pick a player with matches spread across multiple weeks and months. Manually compute the expected win percentage for their two most recent weeks by hand from Match History, confirm the displayed percentages match, and confirm the trend arrow/color correctly reflects whether the more recent week is better or worse than the one before it. Confirm both `/people/{id}` and `/p/{id}` show identical results. Separately, open a player with matches in only one period ever and confirm that period shows a win percentage but no trend arrow (nothing earlier to compare against).
