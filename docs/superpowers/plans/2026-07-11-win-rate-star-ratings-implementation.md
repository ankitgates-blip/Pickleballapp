# Win Rate & Star Ratings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each player's overall winning percentage and a derived 1-5 star rating on both profile pages, plus the same win rate + rating per location.

**Architecture:** A new standalone pure function (`starRating`/`renderStars`) handles the threshold/display logic in isolation. `computePersonStats` gains a `winPercentage` field, and the existing `LocationCount` type gains a `wins` field so per-location win rate can be derived. Both profile pages (`/people/[id]`, `/p/[id]`) get identical display additions.

**Tech Stack:** Same as prior work — Next.js (App Router, TypeScript), Supabase JS client, Vitest.

## Global Constraints

- Star thresholds (no overlaps): ≥75% → 5★, 60-74% → 4★, 50-59% → 3★, 25-49% → 2★, <25% → 1★.
- Both an overall rating and a per-location rating are shown — a player can rate differently at different venues.
- `winPercentage` is `null` (not `0`) when a player has zero completed matches ever.
- Design reference: [docs/superpowers/specs/2026-07-11-win-rate-star-ratings-design.md](../specs/2026-07-11-win-rate-star-ratings-design.md).

---

### Task 1: `starRating` / `renderStars` pure functions

**Files:**
- Create: `apps/organizer-web/lib/stats/starRating.ts`
- Test: `apps/organizer-web/lib/stats/starRating.test.ts`

**Interfaces:**
- Produces: `starRating(winPercentage: number): 1 | 2 | 3 | 4 | 5`, `renderStars(rating: number): string` — consumed by Task 3 and Task 4 (both profile pages).

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/organizer-web/lib/stats/starRating.test.ts
import { describe, it, expect } from 'vitest';
import { starRating, renderStars } from './starRating';

describe('starRating', () => {
  it('returns 5 stars at and above 75%', () => {
    expect(starRating(100)).toBe(5);
    expect(starRating(75)).toBe(5);
  });

  it('returns 4 stars from 60% to just under 75%', () => {
    expect(starRating(74)).toBe(4);
    expect(starRating(60)).toBe(4);
  });

  it('returns 3 stars from 50% to just under 60%', () => {
    expect(starRating(59)).toBe(3);
    expect(starRating(50)).toBe(3);
  });

  it('returns 2 stars from 25% to just under 50%', () => {
    expect(starRating(49)).toBe(2);
    expect(starRating(25)).toBe(2);
  });

  it('returns 1 star below 25%', () => {
    expect(starRating(24)).toBe(1);
    expect(starRating(0)).toBe(1);
  });
});

describe('renderStars', () => {
  it('renders the correct number of filled and empty stars', () => {
    expect(renderStars(5)).toBe('★★★★★');
    expect(renderStars(4)).toBe('★★★★☆');
    expect(renderStars(3)).toBe('★★★☆☆');
    expect(renderStars(2)).toBe('★★☆☆☆');
    expect(renderStars(1)).toBe('★☆☆☆☆');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/organizer-web && npm test
```

Expected: FAIL with `Cannot find module './starRating'`.

- [ ] **Step 3: Implement the functions**

```typescript
// apps/organizer-web/lib/stats/starRating.ts
export function starRating(winPercentage: number): 1 | 2 | 3 | 4 | 5 {
  if (winPercentage >= 75) return 5;
  if (winPercentage >= 60) return 4;
  if (winPercentage >= 50) return 3;
  if (winPercentage >= 25) return 2;
  return 1;
}

export function renderStars(rating: number): string {
  const filled = '★'.repeat(rating);
  const empty = '☆'.repeat(5 - rating);
  return filled + empty;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/organizer-web && npm test
```

Expected: PASS, all 7 new tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/lib/stats/starRating.ts apps/organizer-web/lib/stats/starRating.test.ts
git commit -m "Add star rating and rendering functions"
```

---

### Task 2: `winPercentage` on `PersonStats` + `wins` on `LocationCount`

**Files:**
- Modify: `apps/organizer-web/lib/stats/types.ts`
- Modify: `apps/organizer-web/lib/stats/personStats.ts`
- Test: `apps/organizer-web/lib/stats/personStats.test.ts`

**Interfaces:**
- Produces: `PersonStats.winPercentage: number | null`, `LocationCount.wins: number` (alongside the existing `location`/`count`) — consumed by Task 3 and Task 4.

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
      { period: '2026-07-13', gamesWon: 0, gamesLost: 1, tournamentsWon: 0 },
      { period: '2026-07-06', gamesWon: 1, gamesLost: 0, tournamentsWon: 0 },
    ]);
    expect(stats.monthly).toEqual([
      { period: '2026-07', gamesWon: 1, gamesLost: 1, tournamentsWon: 0 },
    ]);
    expect(stats.yearly).toEqual([
      { period: '2026', gamesWon: 1, gamesLost: 1, tournamentsWon: 0 },
    ]);
  });

  it('counts tournaments won in the correct period', () => {
    const tournamentsWon: TournamentWon[] = [{ tournamentId: 't1', date: '2026-07-06' }];
    const stats = computePersonStats([], tournamentsWon);

    expect(stats.monthly).toEqual([
      { period: '2026-07', gamesWon: 0, gamesLost: 0, tournamentsWon: 1 },
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
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/organizer-web && npm test
```

Expected: FAIL — the location test's expected `wins` field doesn't exist yet, and `winPercentage` is `undefined`, not the expected value.

- [ ] **Step 3: Add the `wins` field to `LocationCount` and `winPercentage` to `PersonStats`**

In `apps/organizer-web/lib/stats/types.ts`, change:

```typescript
export type LocationCount = {
  location: string;
  count: number;
};
```

to:

```typescript
export type LocationCount = {
  location: string;
  count: number;
  wins: number;
};
```

And change:

```typescript
export type PersonStats = {
  weekly: PeriodStats[];
  monthly: PeriodStats[];
  yearly: PeriodStats[];
  matchHistory: PersonMatchRecord[];
  toughestOpponent: HeadToHeadRecord | null;
  bestPartner: HeadToHeadRecord | null;
  lastPlayedDate: string | null;
  matchesByLocation: LocationCount[];
};
```

to:

```typescript
export type PersonStats = {
  weekly: PeriodStats[];
  monthly: PeriodStats[];
  yearly: PeriodStats[];
  matchHistory: PersonMatchRecord[];
  toughestOpponent: HeadToHeadRecord | null;
  bestPartner: HeadToHeadRecord | null;
  lastPlayedDate: string | null;
  matchesByLocation: LocationCount[];
  winPercentage: number | null;
};
```

- [ ] **Step 4: Update `countMatchesByLocation` and `computePersonStats`**

In `apps/organizer-web/lib/stats/personStats.ts`, change:

```typescript
function countMatchesByLocation(matches: PersonMatchRecord[]): LocationCount[] {
  const table = new Map<string, number>();
  for (const m of matches) {
    table.set(m.venueName, (table.get(m.venueName) ?? 0) + 1);
  }
  return Array.from(table.entries())
    .map(([location, count]) => ({ location, count }))
    .sort((a, b) => b.count - a.count);
}
```

to:

```typescript
function countMatchesByLocation(matches: PersonMatchRecord[]): LocationCount[] {
  const table = new Map<string, { count: number; wins: number }>();
  for (const m of matches) {
    const row = table.get(m.venueName) ?? { count: 0, wins: 0 };
    row.count += 1;
    if (m.won) {
      row.wins += 1;
    }
    table.set(m.venueName, row);
  }
  return Array.from(table.entries())
    .map(([location, { count, wins }]) => ({ location, count, wins }))
    .sort((a, b) => b.count - a.count);
}
```

Then change `computePersonStats`'s return statement from:

```typescript
  return {
    weekly: buildPeriods(matches, tournamentsWon, getWeekStart),
    monthly: buildPeriods(matches, tournamentsWon, getMonthKey),
    yearly: buildPeriods(matches, tournamentsWon, getYearKey),
    matchHistory: sortedHistory,
    toughestOpponent: findToughestOpponent(matches),
    bestPartner: findBestPartner(matches),
    lastPlayedDate: sortedHistory[0]?.tournamentDate ?? null,
    matchesByLocation: countMatchesByLocation(matches),
  };
```

to:

```typescript
  return {
    weekly: buildPeriods(matches, tournamentsWon, getWeekStart),
    monthly: buildPeriods(matches, tournamentsWon, getMonthKey),
    yearly: buildPeriods(matches, tournamentsWon, getYearKey),
    matchHistory: sortedHistory,
    toughestOpponent: findToughestOpponent(matches),
    bestPartner: findBestPartner(matches),
    lastPlayedDate: sortedHistory[0]?.tournamentDate ?? null,
    matchesByLocation: countMatchesByLocation(matches),
    winPercentage:
      matches.length > 0
        ? Math.round((matches.filter((m) => m.won).length / matches.length) * 100)
        : null,
  };
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd apps/organizer-web && npm test
```

Expected: PASS, all tests across the whole suite green.

- [ ] **Step 6: Commit**

```bash
git add apps/organizer-web/lib/stats/types.ts apps/organizer-web/lib/stats/personStats.ts apps/organizer-web/lib/stats/personStats.test.ts
git commit -m "Add winPercentage to PersonStats and wins to LocationCount"
```

---

### Task 3: Organizer Player Profile page — win rate + stars

**Files:**
- Modify: `apps/organizer-web/app/people/[id]/page.tsx`

**Interfaces:**
- Consumes: `starRating`, `renderStars` from `@/lib/stats/starRating` (Task 1); `PersonStats.winPercentage`, `LocationCount.wins` (Task 2).

- [ ] **Step 1: Replace the page**

Replace the full contents of `apps/organizer-web/app/people/[id]/page.tsx` with:

```typescript jsx
// apps/organizer-web/app/people/[id]/page.tsx
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass } from '@/app/components/ui';
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { computePersonStats } from '@/lib/stats/personStats';
import { starRating, renderStars } from '@/lib/stats/starRating';
import { computeStandings } from '@/lib/tournament/standings';
import type { RawMatch, RawTeam, TournamentWon } from '@/lib/stats/types';
import type { MatchResult } from '@/lib/types';

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, organizer } = await requireOrganizer();

  const { data: person } = await supabase
    .from('people')
    .select('id, name')
    .eq('id', id)
    .eq('organizer_id', organizer.id)
    .single();

  if (!person) {
    return (
      <OrganizerShell organizerName={organizer.name}>
        <p className="text-slate-500">Person not found.</p>
      </OrganizerShell>
    );
  }

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, name, date, venues(name)')
    .eq('organizer_id', organizer.id);

  const tournamentIds = (tournaments ?? []).map((t) => t.id);
  const tournamentDateById = new Map((tournaments ?? []).map((t) => [t.id, t.date]));
  const venueNameByTournamentId = new Map(
    (tournaments ?? []).map((t) => {
      const venue = t.venues as { name: string } | { name: string }[] | null;
      const name = Array.isArray(venue)
        ? (venue[0]?.name ?? 'Pickle Turf')
        : (venue?.name ?? 'Pickle Turf');
      return [t.id, name];
    })
  );

  const { data: players } = tournamentIds.length
    ? await supabase
        .from('players')
        .select('id, tournament_id, person_id')
        .in('tournament_id', tournamentIds)
    : { data: [] };

  const { data: teamsRaw } = tournamentIds.length
    ? await supabase
        .from('teams')
        .select('id, tournament_id, player_1_id, player_2_id')
        .in('tournament_id', tournamentIds)
    : { data: [] };

  const { data: matchesRaw } = tournamentIds.length
    ? await supabase
        .from('matches')
        .select('tournament_id, team_a_id, team_b_id, score_a, score_b, status')
        .in('tournament_id', tournamentIds)
    : { data: [] };

  const personIdByPlayerId = new Map(
    (players ?? []).map((p) => [p.id, p.person_id as string | null])
  );
  const personNameById = new Map<string, string>();
  // Only need names for people who appear as opponents/partners; fetch once for this organizer.
  const { data: allPeople } = await supabase
    .from('people')
    .select('id, name')
    .eq('organizer_id', organizer.id);
  for (const p of allPeople ?? []) {
    personNameById.set(p.id, p.name);
  }

  const teams: RawTeam[] = (teamsRaw ?? [])
    .map((t) => ({
      id: t.id,
      tournamentId: t.tournament_id,
      player1PersonId: personIdByPlayerId.get(t.player_1_id) ?? '',
      player2PersonId: personIdByPlayerId.get(t.player_2_id) ?? '',
    }))
    .filter((t) => t.player1PersonId && t.player2PersonId);

  const completeMatches: RawMatch[] = (matchesRaw ?? [])
    .filter((m) => m.team_b_id !== null && m.status === 'complete')
    .map((m) => ({
      tournamentId: m.tournament_id,
      tournamentDate: tournamentDateById.get(m.tournament_id) ?? '',
      venueName: venueNameByTournamentId.get(m.tournament_id) ?? '',
      teamAId: m.team_a_id!,
      teamBId: m.team_b_id!,
      scoreA: m.score_a ?? 0,
      scoreB: m.score_b ?? 0,
      status: 'complete' as const,
    }));

  const records = buildPersonMatchRecords(person.id, completeMatches, teams);

  // Determine which tournaments this person's team won, reusing Increment 1.1's
  // tested computeStandings per tournament rather than re-deriving ranking logic here.
  const tournamentsWon: TournamentWon[] = [];
  for (const tournamentId of tournamentIds) {
    const tournamentTeams = teams.filter((t) => t.tournamentId === tournamentId);
    const myTeam = tournamentTeams.find(
      (t) => t.player1PersonId === person.id || t.player2PersonId === person.id
    );
    if (!myTeam) continue;

    const tournamentMatches: MatchResult[] = (matchesRaw ?? [])
      .filter((m) => m.tournament_id === tournamentId)
      .map((m) => ({
        teamAId: m.team_a_id!,
        teamBId: m.team_b_id,
        scoreA: m.score_a,
        scoreB: m.score_b,
        status: m.status as 'pending' | 'complete',
      }));

    const standings = computeStandings(tournamentMatches);
    if (standings.length > 0 && standings[0].teamId === myTeam.id) {
      tournamentsWon.push({
        tournamentId,
        date: tournamentDateById.get(tournamentId) ?? '',
      });
    }
  }

  const stats = computePersonStats(records, tournamentsWon);
  const nameFor = (personId: string) => personNameById.get(personId) ?? 'Unknown';

  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const thisMonth = stats.monthly.find((m) => m.period === currentMonthKey) ?? {
    gamesWon: 0,
    gamesLost: 0,
    tournamentsWon: 0,
  };

  return (
    <OrganizerShell organizerName={organizer.name}>
      <h1 className="text-2xl font-extrabold text-slate-900 mb-1">{person.name}</h1>
      <p className="text-sm text-slate-500">
        {stats.lastPlayedDate ? `Last played: ${stats.lastPlayedDate}` : 'No matches played yet'}
      </p>
      <p className="text-sm text-slate-500 mb-6">
        {stats.winPercentage !== null
          ? `Win rate: ${stats.winPercentage}% ${renderStars(starRating(stats.winPercentage))}`
          : 'No matches played yet'}
      </p>

      <div className={`${cardClass} mb-6`}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">This Month</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-extrabold text-teal-700">
              {thisMonth.gamesWon}
            </div>
            <div className="text-xs text-slate-500">Games won</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-500">
              {thisMonth.gamesLost}
            </div>
            <div className="text-xs text-slate-500">Games lost</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-amber-500">
              {thisMonth.tournamentsWon}
            </div>
            <div className="text-xs text-slate-500">Tournaments won</div>
          </div>
        </div>
      </div>

      <div className={`${cardClass} mb-6`}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">By Location</h2>
        {stats.matchesByLocation.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {stats.matchesByLocation.map((l) => {
              const locationWinPercentage = Math.round((l.wins / l.count) * 100);
              return (
                <li
                  key={l.location}
                  className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0"
                >
                  <span className="font-semibold text-slate-900">{l.location}</span>
                  <span className="text-right">
                    <span className="font-bold text-teal-700">
                      {l.count} match{l.count === 1 ? '' : 'es'}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {locationWinPercentage}% {renderStars(starRating(locationWinPercentage))}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-slate-400 text-sm">No matches played yet.</p>
        )}
      </div>

      <div className={`${cardClass} mb-6`}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">Head-to-Head</h2>
        <p className="text-sm text-slate-700">
          <span className="font-semibold">Toughest opponent:</span>{' '}
          {stats.toughestOpponent
            ? `${nameFor(stats.toughestOpponent.personId)} (${stats.toughestOpponent.wins}-${stats.toughestOpponent.losses})`
            : 'Not enough matches yet'}
        </p>
        <p className="text-sm text-slate-700 mt-1">
          <span className="font-semibold">Best partner:</span>{' '}
          {stats.bestPartner
            ? `${nameFor(stats.bestPartner.personId)} (${stats.bestPartner.wins}-${stats.bestPartner.losses})`
            : 'Not enough matches yet'}
        </p>
      </div>

      <div className={cardClass}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">
          Match History ({stats.matchHistory.length})
        </h2>
        <ul className="space-y-2 text-sm">
          {stats.matchHistory.map((m, i) => (
            <li key={i} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
              <span>
                <span className="text-slate-400 mr-2">{m.tournamentDate}</span>
                with <span className="font-semibold">{nameFor(m.partnerId)}</span> vs{' '}
                <span className="font-semibold">
                  {nameFor(m.opponentIds[0])} / {nameFor(m.opponentIds[1])}
                </span>
              </span>
              <span className={m.won ? 'font-bold text-teal-700' : 'font-bold text-slate-400'}>
                {m.scoreFor}-{m.scoreAgainst}
              </span>
            </li>
          ))}
          {stats.matchHistory.length === 0 && (
            <li className="text-slate-400">No completed matches yet.</li>
          )}
        </ul>
      </div>
    </OrganizerShell>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

```bash
cd apps/organizer-web && npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Manual verification in browser**

Open `/people/{id}` for a player with completed matches at more than one venue. Confirm a "Win rate: X% [stars]" line appears under "Last played", and each row in "By Location" now shows a per-venue win rate and star rating alongside the match count.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/people/[id]/page.tsx"
git commit -m "Add win rate and star ratings to Player Profile"
```

---

### Task 4: Public player history page — win rate + stars

**Files:**
- Modify: `apps/organizer-web/app/p/[id]/page.tsx`

**Interfaces:**
- Consumes: same as Task 3, applied to the public page's parallel data pipeline.

- [ ] **Step 1: Replace the page**

Replace the full contents of `apps/organizer-web/app/p/[id]/page.tsx` with:

```typescript jsx
// apps/organizer-web/app/p/[id]/page.tsx
import { createClient } from '@/lib/supabase/server';
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { computePersonStats } from '@/lib/stats/personStats';
import { starRating, renderStars } from '@/lib/stats/starRating';
import { computeStandings } from '@/lib/tournament/standings';
import type { RawMatch, RawTeam, TournamentWon } from '@/lib/stats/types';
import type { MatchResult } from '@/lib/types';
import { cardClass } from '@/app/components/ui';

export default async function PublicPersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: person } = await supabase
    .from('people')
    .select('id, name, organizer_id')
    .eq('id', id)
    .single();

  if (!person) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Player not found.</p>
      </main>
    );
  }

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, name, date, venues(name)')
    .eq('organizer_id', person.organizer_id);

  const tournamentIds = (tournaments ?? []).map((t) => t.id);
  const tournamentDateById = new Map((tournaments ?? []).map((t) => [t.id, t.date]));
  const venueNameByTournamentId = new Map(
    (tournaments ?? []).map((t) => {
      const venue = t.venues as { name: string } | { name: string }[] | null;
      const name = Array.isArray(venue)
        ? (venue[0]?.name ?? 'Pickle Turf')
        : (venue?.name ?? 'Pickle Turf');
      return [t.id, name];
    })
  );

  const { data: players } = tournamentIds.length
    ? await supabase
        .from('players')
        .select('id, tournament_id, person_id')
        .in('tournament_id', tournamentIds)
    : { data: [] };

  const { data: teamsRaw } = tournamentIds.length
    ? await supabase
        .from('teams')
        .select('id, tournament_id, player_1_id, player_2_id')
        .in('tournament_id', tournamentIds)
    : { data: [] };

  const { data: matchesRaw } = tournamentIds.length
    ? await supabase
        .from('matches')
        .select('tournament_id, team_a_id, team_b_id, score_a, score_b, status')
        .in('tournament_id', tournamentIds)
    : { data: [] };

  const personIdByPlayerId = new Map(
    (players ?? []).map((p) => [p.id, p.person_id as string | null])
  );
  const personNameById = new Map<string, string>();
  const { data: allPeople } = await supabase
    .from('people')
    .select('id, name')
    .eq('organizer_id', person.organizer_id);
  for (const p of allPeople ?? []) {
    personNameById.set(p.id, p.name);
  }

  const teams: RawTeam[] = (teamsRaw ?? [])
    .map((t) => ({
      id: t.id,
      tournamentId: t.tournament_id,
      player1PersonId: personIdByPlayerId.get(t.player_1_id) ?? '',
      player2PersonId: personIdByPlayerId.get(t.player_2_id) ?? '',
    }))
    .filter((t) => t.player1PersonId && t.player2PersonId);

  const completeMatches: RawMatch[] = (matchesRaw ?? [])
    .filter((m) => m.team_b_id !== null && m.status === 'complete')
    .map((m) => ({
      tournamentId: m.tournament_id,
      tournamentDate: tournamentDateById.get(m.tournament_id) ?? '',
      venueName: venueNameByTournamentId.get(m.tournament_id) ?? '',
      teamAId: m.team_a_id!,
      teamBId: m.team_b_id!,
      scoreA: m.score_a ?? 0,
      scoreB: m.score_b ?? 0,
      status: 'complete' as const,
    }));

  const records = buildPersonMatchRecords(person.id, completeMatches, teams);

  const tournamentsWon: TournamentWon[] = [];
  for (const tournamentId of tournamentIds) {
    const tournamentTeams = teams.filter((t) => t.tournamentId === tournamentId);
    const myTeam = tournamentTeams.find(
      (t) => t.player1PersonId === person.id || t.player2PersonId === person.id
    );
    if (!myTeam) continue;

    const tournamentMatches: MatchResult[] = (matchesRaw ?? [])
      .filter((m) => m.tournament_id === tournamentId)
      .map((m) => ({
        teamAId: m.team_a_id!,
        teamBId: m.team_b_id,
        scoreA: m.score_a,
        scoreB: m.score_b,
        status: m.status as 'pending' | 'complete',
      }));

    const standings = computeStandings(tournamentMatches);
    if (standings.length > 0 && standings[0].teamId === myTeam.id) {
      tournamentsWon.push({
        tournamentId,
        date: tournamentDateById.get(tournamentId) ?? '',
      });
    }
  }

  const stats = computePersonStats(records, tournamentsWon);
  const nameFor = (personId: string) => personNameById.get(personId) ?? 'Unknown';

  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const thisMonth = stats.monthly.find((m) => m.period === currentMonthKey) ?? {
    gamesWon: 0,
    gamesLost: 0,
    tournamentsWon: 0,
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="relative overflow-hidden bg-gradient-to-br from-emerald-800 via-teal-600 to-cyan-600 text-white">
        <div
          aria-hidden
          className="ball-texture absolute -top-8 -right-6 h-32 w-32 rounded-full opacity-90"
          style={{ background: 'radial-gradient(circle at 35% 35%, #eaff00, #c9e800)' }}
        />
        <div className="relative max-w-2xl mx-auto px-4 py-6 text-center">
          <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-lime-300 text-xl shadow-md -rotate-6">
            🏓
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">{person.name}</h1>
          <p className="text-teal-50 text-sm mt-1 font-medium">
            {stats.lastPlayedDate ? `Last played: ${stats.lastPlayedDate}` : 'No matches played yet'}
          </p>
          <p className="text-teal-50 text-sm font-medium">
            {stats.winPercentage !== null
              ? `Win rate: ${stats.winPercentage}% ${renderStars(starRating(stats.winPercentage))}`
              : 'No matches played yet'}
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">This Month</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-extrabold text-teal-700">{thisMonth.gamesWon}</div>
              <div className="text-xs text-slate-500">Games won</div>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-slate-500">{thisMonth.gamesLost}</div>
              <div className="text-xs text-slate-500">Games lost</div>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-amber-500">
                {thisMonth.tournamentsWon}
              </div>
              <div className="text-xs text-slate-500">Tournaments won</div>
            </div>
          </div>
        </div>

        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">By Location</h2>
          {stats.matchesByLocation.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {stats.matchesByLocation.map((l) => {
                const locationWinPercentage = Math.round((l.wins / l.count) * 100);
                return (
                  <li
                    key={l.location}
                    className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0"
                  >
                    <span className="font-semibold text-slate-900">{l.location}</span>
                    <span className="text-right">
                      <span className="font-bold text-teal-700">
                        {l.count} match{l.count === 1 ? '' : 'es'}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {locationWinPercentage}% {renderStars(starRating(locationWinPercentage))}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-slate-400 text-sm">No matches played yet.</p>
          )}
        </div>

        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">Head-to-Head</h2>
          <p className="text-sm text-slate-700">
            <span className="font-semibold">Toughest opponent:</span>{' '}
            {stats.toughestOpponent
              ? `${nameFor(stats.toughestOpponent.personId)} (${stats.toughestOpponent.wins}-${stats.toughestOpponent.losses})`
              : 'Not enough matches yet'}
          </p>
          <p className="text-sm text-slate-700 mt-1">
            <span className="font-semibold">Best partner:</span>{' '}
            {stats.bestPartner
              ? `${nameFor(stats.bestPartner.personId)} (${stats.bestPartner.wins}-${stats.bestPartner.losses})`
              : 'Not enough matches yet'}
          </p>
        </div>

        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">
            Match History ({stats.matchHistory.length})
          </h2>
          <ul className="space-y-2 text-sm">
            {stats.matchHistory.map((m, i) => (
              <li
                key={i}
                className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0"
              >
                <span>
                  <span className="text-slate-400 mr-2">{m.tournamentDate}</span>
                  with <span className="font-semibold">{nameFor(m.partnerId)}</span> vs{' '}
                  <span className="font-semibold">
                    {nameFor(m.opponentIds[0])} / {nameFor(m.opponentIds[1])}
                  </span>
                </span>
                <span className={m.won ? 'font-bold text-teal-700' : 'font-bold text-slate-400'}>
                  {m.scoreFor}-{m.scoreAgainst}
                </span>
              </li>
            ))}
            {stats.matchHistory.length === 0 && (
              <li className="text-slate-400">No completed matches yet.</li>
            )}
          </ul>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

```bash
cd apps/organizer-web && npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Manual verification in browser**

Open the same player's public page (`/p/{id}`) and confirm it shows identical "Win rate" and per-location star ratings to the organizer's `/people/{id}` page from Task 3.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/p/[id]/page.tsx"
git commit -m "Add win rate and star ratings to public player page"
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

Pick a player with matches at both venues and manually compute their expected overall win rate and each location's win rate by hand from the Match History list, then confirm both `/people/{id}` and `/p/{id}` show matching percentages and star counts. Separately, open a player with zero completed matches and confirm both pages show "No matches played yet" for both the win-rate line and the By Location card, with no stars rendered and no crash.
