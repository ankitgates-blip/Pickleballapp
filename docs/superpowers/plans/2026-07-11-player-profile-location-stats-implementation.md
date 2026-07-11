# Player Profile Location Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "last played" date and a per-location match count breakdown to both player profile pages (`/people/[id]` organizer, `/p/[id]` public), by threading venue names through the existing stats pipeline.

**Architecture:** `RawMatch` and `PersonMatchRecord` gain a `venueName` field (the same way `tournamentDate` already flows through the pipeline); `computePersonStats` gains two new derived outputs (`lastPlayedDate`, `matchesByLocation`). Both page components add a `venues(name)` join to their existing tournament query and pass the resolved venue name through when building `RawMatch[]`.

**Tech Stack:** Same as prior work — Next.js (App Router, TypeScript), Supabase JS client, Vitest.

## Global Constraints

- Location counts are per-match, not per-tournament.
- `lastPlayedDate` and `matchesByLocation` are both derived only from completed matches — same basis as every other stat in this pipeline.
- Both `/people/[id]` and `/p/[id]` get identical additions, kept in sync.
- Design reference: [docs/superpowers/specs/2026-07-11-player-profile-location-stats-design.md](../specs/2026-07-11-player-profile-location-stats-design.md).

---

### Task 1: Thread `venueName` through `RawMatch` / `PersonMatchRecord`

**Files:**
- Modify: `apps/organizer-web/lib/stats/types.ts`
- Modify: `apps/organizer-web/lib/stats/buildPersonMatchRecords.ts`
- Test: `apps/organizer-web/lib/stats/buildPersonMatchRecords.test.ts`

**Interfaces:**
- Produces: `RawMatch.venueName: string`, `PersonMatchRecord.venueName: string` — consumed by Task 2 (`computePersonStats`'s new `matchesByLocation`) and Tasks 3/4 (both pages, which now must supply this field).

- [ ] **Step 1: Update the failing test fixtures first**

Replace the full contents of `apps/organizer-web/lib/stats/buildPersonMatchRecords.test.ts` with:

```typescript
import { describe, it, expect } from 'vitest';
import { buildPersonMatchRecords } from './buildPersonMatchRecords';
import type { RawMatch, RawTeam } from './types';

describe('buildPersonMatchRecords', () => {
  const teams: RawTeam[] = [
    { id: 'team-ab', tournamentId: 't1', player1PersonId: 'alice', player2PersonId: 'bob' },
    { id: 'team-cd', tournamentId: 't1', player1PersonId: 'carol', player2PersonId: 'dave' },
  ];

  it('builds a record from the perspective of the requested person, on either side', () => {
    const matches: RawMatch[] = [
      {
        tournamentId: 't1',
        tournamentDate: '2026-07-06',
        venueName: 'Pickle Turf',
        teamAId: 'team-ab',
        teamBId: 'team-cd',
        scoreA: 11,
        scoreB: 7,
        status: 'complete',
      },
    ];

    const aliceRecords = buildPersonMatchRecords('alice', matches, teams);
    expect(aliceRecords).toEqual([
      {
        tournamentId: 't1',
        tournamentDate: '2026-07-06',
        venueName: 'Pickle Turf',
        partnerId: 'bob',
        opponentIds: ['carol', 'dave'],
        scoreFor: 11,
        scoreAgainst: 7,
        won: true,
      },
    ]);

    const carolRecords = buildPersonMatchRecords('carol', matches, teams);
    expect(carolRecords).toEqual([
      {
        tournamentId: 't1',
        tournamentDate: '2026-07-06',
        venueName: 'Pickle Turf',
        partnerId: 'dave',
        opponentIds: ['alice', 'bob'],
        scoreFor: 7,
        scoreAgainst: 11,
        won: false,
      },
    ]);
  });

  it('excludes pending (incomplete) matches', () => {
    const matches: RawMatch[] = [
      {
        tournamentId: 't1',
        tournamentDate: '2026-07-06',
        venueName: 'Pickle Turf',
        teamAId: 'team-ab',
        teamBId: 'team-cd',
        scoreA: 0,
        scoreB: 0,
        status: 'pending',
      },
    ];

    expect(buildPersonMatchRecords('alice', matches, teams)).toEqual([]);
  });

  it('excludes matches the requested person was not part of', () => {
    const matches: RawMatch[] = [
      {
        tournamentId: 't1',
        tournamentDate: '2026-07-06',
        venueName: 'Pickle Turf',
        teamAId: 'team-ab',
        teamBId: 'team-cd',
        scoreA: 11,
        scoreB: 7,
        status: 'complete',
      },
    ];

    expect(buildPersonMatchRecords('someone-else', matches, teams)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/organizer-web && npm test
```

Expected: FAIL — TypeScript errors, since `RawMatch`/`PersonMatchRecord` don't have a `venueName` field yet.

- [ ] **Step 3: Add `venueName` to the types**

In `apps/organizer-web/lib/stats/types.ts`, change:

```typescript
export type RawMatch = {
  tournamentId: string;
  tournamentDate: string; // ISO date, e.g. '2026-07-15'
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
  status: 'pending' | 'complete';
};
```

to:

```typescript
export type RawMatch = {
  tournamentId: string;
  tournamentDate: string; // ISO date, e.g. '2026-07-15'
  venueName: string;
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
  status: 'pending' | 'complete';
};
```

And change:

```typescript
export type PersonMatchRecord = {
  tournamentId: string;
  tournamentDate: string;
  partnerId: string;
  opponentIds: [string, string];
  scoreFor: number;
  scoreAgainst: number;
  won: boolean;
};
```

to:

```typescript
export type PersonMatchRecord = {
  tournamentId: string;
  tournamentDate: string;
  venueName: string;
  partnerId: string;
  opponentIds: [string, string];
  scoreFor: number;
  scoreAgainst: number;
  won: boolean;
};
```

- [ ] **Step 4: Copy `venueName` across in `buildPersonMatchRecords`**

In `apps/organizer-web/lib/stats/buildPersonMatchRecords.ts`, change the `records.push({...})` call from:

```typescript
    records.push({
      tournamentId: m.tournamentId,
      tournamentDate: m.tournamentDate,
      partnerId,
      opponentIds: [otherTeam.player1PersonId, otherTeam.player2PersonId],
      scoreFor,
      scoreAgainst,
      won: scoreFor > scoreAgainst,
    });
```

to:

```typescript
    records.push({
      tournamentId: m.tournamentId,
      tournamentDate: m.tournamentDate,
      venueName: m.venueName,
      partnerId,
      opponentIds: [otherTeam.player1PersonId, otherTeam.player2PersonId],
      scoreFor,
      scoreAgainst,
      won: scoreFor > scoreAgainst,
    });
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd apps/organizer-web && npm test
```

Expected: PASS — all tests in `buildPersonMatchRecords.test.ts` green. Other test files (`personStats.test.ts`) will still fail at this point because their fixtures don't have `venueName` yet — that's expected and fixed in Task 2.

- [ ] **Step 6: Commit**

```bash
git add apps/organizer-web/lib/stats/types.ts apps/organizer-web/lib/stats/buildPersonMatchRecords.ts apps/organizer-web/lib/stats/buildPersonMatchRecords.test.ts
git commit -m "Thread venueName through RawMatch and PersonMatchRecord"
```

---

### Task 2: `lastPlayedDate` and `matchesByLocation` in `computePersonStats`

**Files:**
- Modify: `apps/organizer-web/lib/stats/types.ts`
- Modify: `apps/organizer-web/lib/stats/personStats.ts`
- Test: `apps/organizer-web/lib/stats/personStats.test.ts`

**Interfaces:**
- Consumes: `PersonMatchRecord.venueName` (Task 1).
- Produces: `PersonStats.lastPlayedDate: string | null`, `PersonStats.matchesByLocation: LocationCount[]` where `LocationCount = { location: string; count: number }` — consumed by Tasks 3/4 (both pages).

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

  it('counts matches by location, sorted by count descending', () => {
    const matches: PersonMatchRecord[] = [
      { tournamentId: 't1', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't2', tournamentDate: '2026-07-13', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 9, won: true },
      { tournamentId: 't3', tournamentDate: '2026-07-20', venueName: 'Picklers', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 3, won: true },
    ];

    const stats = computePersonStats(matches, []);

    expect(stats.matchesByLocation).toEqual([
      { location: 'Pickle Turf', count: 2 },
      { location: 'Picklers', count: 1 },
    ]);
    expect(computePersonStats([], []).matchesByLocation).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/organizer-web && npm test
```

Expected: FAIL — the two new tests fail because `lastPlayedDate`/`matchesByLocation` don't exist on `PersonStats` yet.

- [ ] **Step 3: Add `LocationCount` type and the two new `PersonStats` fields**

In `apps/organizer-web/lib/stats/types.ts`, add this new type (near `HeadToHeadRecord`):

```typescript
export type LocationCount = {
  location: string;
  count: number;
};
```

Then change `PersonStats` from:

```typescript
export type PersonStats = {
  weekly: PeriodStats[];
  monthly: PeriodStats[];
  yearly: PeriodStats[];
  matchHistory: PersonMatchRecord[];
  toughestOpponent: HeadToHeadRecord | null;
  bestPartner: HeadToHeadRecord | null;
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
};
```

- [ ] **Step 4: Implement the two new computations**

In `apps/organizer-web/lib/stats/personStats.ts`, change the import line from:

```typescript
import type {
  HeadToHeadRecord,
  PeriodStats,
  PersonMatchRecord,
  PersonStats,
  TournamentWon,
} from './types';
```

to:

```typescript
import type {
  HeadToHeadRecord,
  LocationCount,
  PeriodStats,
  PersonMatchRecord,
  PersonStats,
  TournamentWon,
} from './types';
```

Add this new function anywhere after `findBestPartner` and before `computePersonStats`:

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

Then change `computePersonStats`'s return statement from:

```typescript
  return {
    weekly: buildPeriods(matches, tournamentsWon, getWeekStart),
    monthly: buildPeriods(matches, tournamentsWon, getMonthKey),
    yearly: buildPeriods(matches, tournamentsWon, getYearKey),
    matchHistory: sortedHistory,
    toughestOpponent: findToughestOpponent(matches),
    bestPartner: findBestPartner(matches),
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
  };
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd apps/organizer-web && npm test
```

Expected: PASS — all tests across the whole suite green (this fixes the `personStats.test.ts` failures left over from Task 1, plus the two new tests).

- [ ] **Step 6: Commit**

```bash
git add apps/organizer-web/lib/stats/types.ts apps/organizer-web/lib/stats/personStats.ts apps/organizer-web/lib/stats/personStats.test.ts
git commit -m "Add lastPlayedDate and matchesByLocation to computePersonStats"
```

---

### Task 3: Organizer Player Profile page (`/people/[id]`)

**Files:**
- Modify: `apps/organizer-web/app/people/[id]/page.tsx`

**Interfaces:**
- Consumes: `PersonStats.lastPlayedDate`, `PersonStats.matchesByLocation` (Task 2); `RawMatch.venueName` (Task 1).

- [ ] **Step 1: Replace the page**

Replace the full contents of `apps/organizer-web/app/people/[id]/page.tsx` with:

```typescript jsx
// apps/organizer-web/app/people/[id]/page.tsx
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass } from '@/app/components/ui';
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { computePersonStats } from '@/lib/stats/personStats';
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
      <p className="text-sm text-slate-500 mb-6">
        {stats.lastPlayedDate ? `Last played: ${stats.lastPlayedDate}` : 'No matches played yet'}
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
            {stats.matchesByLocation.map((l) => (
              <li
                key={l.location}
                className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0"
              >
                <span className="font-semibold text-slate-900">{l.location}</span>
                <span className="font-bold text-teal-700">{l.count}</span>
              </li>
            ))}
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

Open `/people/{id}` for a player with completed matches at more than one venue. Confirm a "Last played: {date}" line appears under their name (matching their most recent completed match's date), and a new "By Location" card lists each venue with a match count, highest first.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/people/[id]/page.tsx"
git commit -m "Add last-played date and by-location stats to Player Profile"
```

---

### Task 4: Public player history page (`/p/[id]`)

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
              {stats.matchesByLocation.map((l) => (
                <li
                  key={l.location}
                  className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0"
                >
                  <span className="font-semibold text-slate-900">{l.location}</span>
                  <span className="font-bold text-teal-700">{l.count}</span>
                </li>
              ))}
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

Open the same player's public page (`/p/{personId}`) and confirm it shows identical "Last played" and "By Location" content to the organizer's `/people/{id}` page from Task 3.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/p/[id]/page.tsx"
git commit -m "Add last-played date and by-location stats to public player page"
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

Pick a player who has completed matches at both "Pickle Turf" and "Picklers". Confirm both `/people/{id}` and `/p/{id}` show the same "Last played" date and the same per-venue match counts (highest first). Separately, open a player with zero completed matches and confirm both pages show "No matches played yet" for last-played and the By Location card, without crashing.
