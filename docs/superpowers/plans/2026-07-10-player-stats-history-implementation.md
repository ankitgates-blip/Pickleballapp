# Player Stats & Match History Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the organizer a cross-tournament dashboard for any player: weekly/monthly/yearly win-loss and tournaments-won breakdown, full match history, toughest opponent, and best partner — built on a new durable `people` identity that links roster entries across tournaments.

**Architecture:** A new `people` table (organizer-scoped, additive migration) that `players` rows link to via a new nullable `person_id` column. Roster paste becomes a two-step flow (paste → review matched/new names → confirm) using the same query-param-driven state pattern the login page already uses for its error message (no new client-side state library). All stats/matching logic is pure, dependency-free TypeScript in `lib/people/` and `lib/stats/`, unit-tested with Vitest — same pattern as `lib/tournament/` from Increments 1.1/1.2. Stats are computed live on page load (no background job), consistent with how standings already work.

**Tech Stack:** Same as prior increments — Next.js (App Router, TypeScript), Supabase JS client, Vitest, Supabase CLI (`npx`, no Docker) for the migration.

## Global Constraints

- `people` is organizer-private (RLS-scoped like `tournaments`, not publicly readable) — no player login/self-service view exists yet.
- Roster paste keeps its current bulk-paste UX; matching against existing `people` is case-insensitive and trimmed, and always re-verified server-side on confirm (never trust client-supplied match results).
- No fuzzy/automatic merging of `people` — the backfill migration creates exactly one `people` row per existing `players` row (1:1); duplicate names (e.g. the two "Mike"s) become two separate people, consistent with the duplicate-name warning already treating them as possibly-different.
- No background rollup job — stats computed live from raw match data by pure functions, same pattern as `lib/tournament/standings.ts`.
- Design reference: [docs/superpowers/specs/2026-07-09-player-stats-history-design.md](../specs/2026-07-09-player-stats-history-design.md).

---

### Task 1: Database migration — `people` table, `players.person_id`, RLS, backfill

**Files:**
- Create: `supabase/migrations/<timestamp>_add_people.sql`

**Interfaces:**
- Produces: `people(id, organizer_id, name, created_at)` table and `players.person_id` column — consumed by every later task.

- [ ] **Step 1: Create the migration file**

```bash
cd "C:\Users\ANKS\pickleball project"
SUPABASE_ACCESS_TOKEN=<your token from Increment 1.1 Task 6> npx supabase migration new add_people
```

Expected: creates `supabase/migrations/<timestamp>_add_people.sql` (note the actual filename).

- [ ] **Step 2: Fill in the migration**

```sql
-- supabase/migrations/<timestamp>_add_people.sql

create table public.people (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.people enable row level security;

create policy "people_select_own" on public.people
  for select using (
    organizer_id in (select id from public.organizers where auth_user_id = auth.uid())
  );
create policy "people_insert_own" on public.people
  for insert with check (
    organizer_id in (select id from public.organizers where auth_user_id = auth.uid())
  );
create policy "people_update_own" on public.people
  for update using (
    organizer_id in (select id from public.organizers where auth_user_id = auth.uid())
  );

alter table public.players add column person_id uuid references public.people(id);

-- Backfill: create exactly one Person per existing players row that doesn't have one yet
-- (no fuzzy merging — two rows both named "Mike" become two separate people).
do $$
declare
  r record;
  new_person_id uuid;
begin
  for r in
    select p.id as player_id, p.name, t.organizer_id, p.created_at
    from public.players p
    join public.tournaments t on t.id = p.tournament_id
    where p.person_id is null
  loop
    insert into public.people (organizer_id, name, created_at)
    values (r.organizer_id, r.name, r.created_at)
    returning id into new_person_id;

    update public.players set person_id = new_person_id where id = r.player_id;
  end loop;
end $$;
```

- [ ] **Step 3: Push the migration**

```bash
SUPABASE_ACCESS_TOKEN=<your token> npx supabase db push
```

Expected: confirms the migration applied, no errors.

- [ ] **Step 4: Verify the backfill in the Supabase dashboard**

In the Table Editor, confirm: `people` has one row per pre-existing `players` row (e.g. 14, matching the real roster already in "Test Round Robin" as of this plan's writing), and every `players` row now has a non-null `person_id`. Spot-check: the two `players` rows named "Mike" now point to two different `people.id` values.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "Add people table, players.person_id, and backfill migration"
```

---

### Task 2: Name-matching for roster entry

**Files:**
- Create: `apps/organizer-web/lib/people/matchNames.ts`
- Test: `apps/organizer-web/lib/people/matchNames.test.ts`

**Interfaces:**
- Produces: `matchNamesToPeople(names: string[], existingPeople: Array<{ id: string; name: string }>): { matched: Array<{ name: string; personId: string }>; newNames: string[] }` — used by Task 5's roster actions and page.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/organizer-web/lib/people/matchNames.test.ts
import { describe, it, expect } from 'vitest';
import { matchNamesToPeople } from './matchNames';

describe('matchNamesToPeople', () => {
  it('matches names case-insensitively and trims whitespace', () => {
    const result = matchNamesToPeople(
      [' alice ', 'BOB'],
      [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' },
      ]
    );

    expect(result.matched).toEqual([
      { name: ' alice ', personId: 'p1' },
      { name: 'BOB', personId: 'p2' },
    ]);
    expect(result.newNames).toEqual([]);
  });

  it('treats unmatched names as new', () => {
    const result = matchNamesToPeople(['Zara'], [{ id: 'p1', name: 'Alice' }]);

    expect(result.matched).toEqual([]);
    expect(result.newNames).toEqual(['Zara']);
  });

  it('handles a mix of matched and new names', () => {
    const result = matchNamesToPeople(['Alice', 'Zara'], [{ id: 'p1', name: 'Alice' }]);

    expect(result.matched).toEqual([{ name: 'Alice', personId: 'p1' }]);
    expect(result.newNames).toEqual(['Zara']);
  });

  it('treats two identically-named new entries as two separate new names', () => {
    const result = matchNamesToPeople(['Mike', 'Mike'], []);

    expect(result.matched).toEqual([]);
    expect(result.newNames).toEqual(['Mike', 'Mike']);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/organizer-web && npm test
```

Expected: FAIL with `Cannot find module './matchNames'`.

- [ ] **Step 3: Implement the matcher**

```typescript
// apps/organizer-web/lib/people/matchNames.ts
export function matchNamesToPeople(
  names: string[],
  existingPeople: Array<{ id: string; name: string }>
): { matched: Array<{ name: string; personId: string }>; newNames: string[] } {
  const byLowerName = new Map(
    existingPeople.map((p) => [p.name.trim().toLowerCase(), p.id])
  );

  const matched: Array<{ name: string; personId: string }> = [];
  const newNames: string[] = [];

  for (const name of names) {
    const personId = byLowerName.get(name.trim().toLowerCase());
    if (personId) {
      matched.push({ name, personId });
    } else {
      newNames.push(name);
    }
  }

  return { matched, newNames };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/organizer-web && npm test
```

Expected: PASS, all 4 `matchNamesToPeople` tests green (16 total including prior increments).

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/lib/people
git commit -m "Add name-matching for roster-to-person linking"
```

---

### Task 3: Stats types and match-record builder

**Files:**
- Create: `apps/organizer-web/lib/stats/types.ts`
- Create: `apps/organizer-web/lib/stats/buildPersonMatchRecords.ts`
- Test: `apps/organizer-web/lib/stats/buildPersonMatchRecords.test.ts`

**Interfaces:**
- Produces: all stats-domain types (`RawTeam`, `RawMatch`, `PersonMatchRecord`, `TournamentWon`, `PeriodStats`, `HeadToHeadRecord`, `PersonStats`) and `buildPersonMatchRecords(personId: string, matches: RawMatch[], teams: RawTeam[]): PersonMatchRecord[]` — used by Task 4 (`computePersonStats`) and Tasks 6/7 (the `/people` pages).

- [ ] **Step 1: Add the shared types**

```typescript
// apps/organizer-web/lib/stats/types.ts
export type RawTeam = {
  id: string;
  tournamentId: string;
  player1PersonId: string;
  player2PersonId: string;
};

export type RawMatch = {
  tournamentId: string;
  tournamentDate: string; // ISO date, e.g. '2026-07-15'
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
  status: 'pending' | 'complete';
};

export type PersonMatchRecord = {
  tournamentId: string;
  tournamentDate: string;
  partnerId: string;
  opponentIds: [string, string];
  scoreFor: number;
  scoreAgainst: number;
  won: boolean;
};

export type TournamentWon = {
  tournamentId: string;
  date: string; // ISO date
};

export type PeriodStats = {
  period: string; // Monday date (weekly), 'YYYY-MM' (monthly), or 'YYYY' (yearly)
  gamesWon: number;
  gamesLost: number;
  tournamentsWon: number;
};

export type HeadToHeadRecord = {
  personId: string;
  wins: number;
  losses: number;
};

export type PersonStats = {
  weekly: PeriodStats[];
  monthly: PeriodStats[];
  yearly: PeriodStats[];
  matchHistory: PersonMatchRecord[];
  toughestOpponent: HeadToHeadRecord | null;
  bestPartner: HeadToHeadRecord | null;
};
```

- [ ] **Step 2: Write the failing tests**

```typescript
// apps/organizer-web/lib/stats/buildPersonMatchRecords.test.ts
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

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd apps/organizer-web && npm test
```

Expected: FAIL with `Cannot find module './buildPersonMatchRecords'`.

- [ ] **Step 4: Implement the builder**

```typescript
// apps/organizer-web/lib/stats/buildPersonMatchRecords.ts
import type { PersonMatchRecord, RawMatch, RawTeam } from './types';

export function buildPersonMatchRecords(
  personId: string,
  matches: RawMatch[],
  teams: RawTeam[]
): PersonMatchRecord[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const records: PersonMatchRecord[] = [];

  for (const m of matches) {
    if (m.status !== 'complete') continue;

    const teamA = teamById.get(m.teamAId);
    const teamB = teamById.get(m.teamBId);
    if (!teamA || !teamB) continue;

    let myTeam: RawTeam;
    let otherTeam: RawTeam;
    let scoreFor: number;
    let scoreAgainst: number;

    if (teamA.player1PersonId === personId || teamA.player2PersonId === personId) {
      myTeam = teamA;
      otherTeam = teamB;
      scoreFor = m.scoreA;
      scoreAgainst = m.scoreB;
    } else if (teamB.player1PersonId === personId || teamB.player2PersonId === personId) {
      myTeam = teamB;
      otherTeam = teamA;
      scoreFor = m.scoreB;
      scoreAgainst = m.scoreA;
    } else {
      continue;
    }

    const partnerId =
      myTeam.player1PersonId === personId ? myTeam.player2PersonId : myTeam.player1PersonId;

    records.push({
      tournamentId: m.tournamentId,
      tournamentDate: m.tournamentDate,
      partnerId,
      opponentIds: [otherTeam.player1PersonId, otherTeam.player2PersonId],
      scoreFor,
      scoreAgainst,
      won: scoreFor > scoreAgainst,
    });
  }

  return records;
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd apps/organizer-web && npm test
```

Expected: PASS, all 3 `buildPersonMatchRecords` tests green (19 total).

- [ ] **Step 6: Commit**

```bash
git add apps/organizer-web/lib/stats/types.ts apps/organizer-web/lib/stats/buildPersonMatchRecords.ts apps/organizer-web/lib/stats/buildPersonMatchRecords.test.ts
git commit -m "Add stats types and per-person match record builder"
```

---

### Task 4: Stats aggregation (weekly/monthly/yearly, toughest opponent, best partner)

**Files:**
- Create: `apps/organizer-web/lib/stats/personStats.ts`
- Test: `apps/organizer-web/lib/stats/personStats.test.ts`

**Interfaces:**
- Consumes: `PersonMatchRecord`, `TournamentWon`, `PersonStats`, `PeriodStats`, `HeadToHeadRecord` from `./types` (Task 3).
- Produces: `computePersonStats(matches: PersonMatchRecord[], tournamentsWon: TournamentWon[]): PersonStats` — used by Task 7's `/people/[id]` page.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/organizer-web/lib/stats/personStats.test.ts
import { describe, it, expect } from 'vitest';
import { computePersonStats } from './personStats';
import type { PersonMatchRecord, TournamentWon } from './types';

describe('computePersonStats', () => {
  it('rolls up games won/lost by week, month, and year', () => {
    const matches: PersonMatchRecord[] = [
      {
        tournamentId: 't1',
        tournamentDate: '2026-07-06', // a Monday
        partnerId: 'p-bob',
        opponentIds: ['p-carol', 'p-dave'],
        scoreFor: 11,
        scoreAgainst: 7,
        won: true,
      },
      {
        tournamentId: 't2',
        tournamentDate: '2026-07-13', // the following Monday
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
      { tournamentId: 't1', tournamentDate: '2026-07-06', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't1', tournamentDate: '2026-07-06', partnerId: 'p-bob', opponentIds: ['p-eve', 'p-frank'], scoreFor: 4, scoreAgainst: 11, won: false },
      { tournamentId: 't2', tournamentDate: '2026-07-13', partnerId: 'p-bob', opponentIds: ['p-eve', 'p-frank'], scoreFor: 6, scoreAgainst: 11, won: false },
    ];

    const stats = computePersonStats(matches, []);

    expect(stats.toughestOpponent).toEqual({ personId: 'p-eve', wins: 0, losses: 2 });
  });

  it('identifies the best partner by highest win rate, tie-broken by match count', () => {
    const matches: PersonMatchRecord[] = [
      { tournamentId: 't1', tournamentDate: '2026-07-06', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't2', tournamentDate: '2026-07-13', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 9, won: true },
      { tournamentId: 't3', tournamentDate: '2026-07-20', partnerId: 'p-zara', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 3, won: true },
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
      { tournamentId: 't1', tournamentDate: '2026-07-06', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't2', tournamentDate: '2026-07-20', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 9, won: true },
    ];

    const stats = computePersonStats(matches, []);
    expect(stats.matchHistory.map((m) => m.tournamentId)).toEqual(['t2', 't1']);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/organizer-web && npm test
```

Expected: FAIL with `Cannot find module './personStats'`.

- [ ] **Step 3: Implement the aggregation**

```typescript
// apps/organizer-web/lib/stats/personStats.ts
import type {
  HeadToHeadRecord,
  PeriodStats,
  PersonMatchRecord,
  PersonStats,
  TournamentWon,
} from './types';

function getWeekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function getYearKey(dateStr: string): string {
  return dateStr.slice(0, 4);
}

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

function winRate(record: { wins: number; losses: number }): number {
  const total = record.wins + record.losses;
  return total === 0 ? 0 : record.wins / total;
}

function tallyByPerson(
  matches: PersonMatchRecord[],
  getIds: (m: PersonMatchRecord) => string[]
): Map<string, { wins: number; losses: number }> {
  const table = new Map<string, { wins: number; losses: number }>();

  for (const m of matches) {
    for (const personId of getIds(m)) {
      const row = table.get(personId) ?? { wins: 0, losses: 0 };
      if (m.won) {
        row.wins += 1;
      } else {
        row.losses += 1;
      }
      table.set(personId, row);
    }
  }

  return table;
}

function findToughestOpponent(matches: PersonMatchRecord[]): HeadToHeadRecord | null {
  const table = tallyByPerson(matches, (m) => m.opponentIds);

  let result: HeadToHeadRecord | null = null;
  for (const [personId, record] of table.entries()) {
    const total = record.wins + record.losses;
    if (total === 0) continue;

    const isWorse =
      result === null ||
      winRate(record) < winRate(result) ||
      (winRate(record) === winRate(result) && total > result.wins + result.losses);

    if (isWorse) {
      result = { personId, wins: record.wins, losses: record.losses };
    }
  }

  return result;
}

function findBestPartner(matches: PersonMatchRecord[]): HeadToHeadRecord | null {
  const table = tallyByPerson(matches, (m) => [m.partnerId]);

  let result: HeadToHeadRecord | null = null;
  for (const [personId, record] of table.entries()) {
    const total = record.wins + record.losses;
    if (total === 0) continue;

    const isBetter =
      result === null ||
      winRate(record) > winRate(result) ||
      (winRate(record) === winRate(result) && total > result.wins + result.losses);

    if (isBetter) {
      result = { personId, wins: record.wins, losses: record.losses };
    }
  }

  return result;
}

export function computePersonStats(
  matches: PersonMatchRecord[],
  tournamentsWon: TournamentWon[]
): PersonStats {
  const sortedHistory = [...matches].sort((a, b) =>
    a.tournamentDate < b.tournamentDate ? 1 : -1
  );

  return {
    weekly: buildPeriods(matches, tournamentsWon, getWeekStart),
    monthly: buildPeriods(matches, tournamentsWon, getMonthKey),
    yearly: buildPeriods(matches, tournamentsWon, getYearKey),
    matchHistory: sortedHistory,
    toughestOpponent: findToughestOpponent(matches),
    bestPartner: findBestPartner(matches),
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/organizer-web && npm test
```

Expected: PASS, all 6 `computePersonStats` tests green (25 total).

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/lib/stats/personStats.ts apps/organizer-web/lib/stats/personStats.test.ts
git commit -m "Add weekly/monthly/yearly stats, toughest opponent, best partner"
```

---

### Task 5: Roster entry — review step before confirming

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/roster/actions.ts`
- Modify: `apps/organizer-web/app/tournaments/[id]/roster/page.tsx`

**Interfaces:**
- Consumes: `matchNamesToPeople` from `@/lib/people/matchNames` (Task 2); `requireOrganizer()` (Increment 1.1).
- Produces: `players.person_id` populated on every newly-added roster entry — consumed by Tasks 6/7's `/people` pages.

- [ ] **Step 1: Replace the actions file**

Replace the full contents of `apps/organizer-web/app/tournaments/[id]/roster/actions.ts` with:

```typescript
// apps/organizer-web/app/tournaments/[id]/roster/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { matchNamesToPeople } from '@/lib/people/matchNames';

export async function startAddPlayers(tournamentId: string, formData: FormData) {
  const raw = formData.get('names') as string;
  redirect(`/tournaments/${tournamentId}/roster?pendingNames=${encodeURIComponent(raw)}`);
}

export async function confirmAddPlayers(tournamentId: string, formData: FormData) {
  const { supabase, organizer } = await requireOrganizer();

  const raw = formData.get('names') as string;
  const names = raw
    .split('\n')
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  if (names.length === 0) {
    redirect(`/tournaments/${tournamentId}/roster`);
  }

  const { data: existingPeople, error: peopleError } = await supabase
    .from('people')
    .select('id, name')
    .eq('organizer_id', organizer.id);

  if (peopleError) {
    throw new Error(peopleError.message);
  }

  const { matched, newNames } = matchNamesToPeople(names, existingPeople ?? []);

  let createdPeople: Array<{ id: string; name: string }> = [];
  if (newNames.length > 0) {
    const { data, error } = await supabase
      .from('people')
      .insert(newNames.map((name) => ({ organizer_id: organizer.id, name })))
      .select('id, name');

    if (error) {
      throw new Error(error.message);
    }
    createdPeople = data ?? [];
  }

  const allAssignments = [
    ...matched,
    ...createdPeople.map((p) => ({ name: p.name, personId: p.id })),
  ];

  const { error: playersError } = await supabase.from('players').insert(
    allAssignments.map((a) => ({
      tournament_id: tournamentId,
      name: a.name,
      person_id: a.personId,
    }))
  );

  if (playersError) {
    throw new Error(playersError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/roster`);
  redirect(`/tournaments/${tournamentId}/roster`);
}
```

- [ ] **Step 2: Replace the page**

Replace the full contents of `apps/organizer-web/app/tournaments/[id]/roster/page.tsx` with:

```typescript jsx
// apps/organizer-web/app/tournaments/[id]/roster/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass, primaryButtonClass, accentButtonClass, pillClass, linkClass } from '@/app/components/ui';
import { matchNamesToPeople } from '@/lib/people/matchNames';
import { startAddPlayers, confirmAddPlayers } from './actions';

export default async function RosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pendingNames?: string }>;
}) {
  const { id } = await params;
  const { pendingNames } = await searchParams;
  const { supabase, organizer } = await requireOrganizer();

  const { data: players } = await supabase
    .from('players')
    .select('id, name')
    .eq('tournament_id', id)
    .order('created_at', { ascending: true });

  const nameCounts = new Map<string, number>();
  for (const p of players ?? []) {
    const key = p.name.trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const duplicateNames = new Set(
    (players ?? [])
      .map((p) => p.name)
      .filter((name) => (nameCounts.get(name.trim().toLowerCase()) ?? 0) > 1)
  );

  if (pendingNames) {
    const names = pendingNames
      .split('\n')
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    const { data: existingPeople } = await supabase
      .from('people')
      .select('id, name')
      .eq('organizer_id', organizer.id);

    const { matched, newNames } = matchNamesToPeople(names, existingPeople ?? []);
    const confirmAddPlayersWithId = confirmAddPlayers.bind(null, id);

    return (
      <OrganizerShell organizerName={organizer.name}>
        <TournamentNav tournamentId={id} current="roster" />
        <h1 className="text-2xl font-extrabold text-slate-900 mb-6">Review Roster Additions</h1>

        <div className={`${cardClass} mb-6`}>
          <h2 className="text-lg font-bold text-slate-900 mb-2">
            Matched to existing person ({matched.length})
          </h2>
          <ul className="flex flex-wrap gap-2 mb-4">
            {matched.map((m, i) => (
              <li key={i} className={`${pillClass} bg-teal-50 text-teal-800`}>
                {m.name}
              </li>
            ))}
            {matched.length === 0 && <li className="text-sm text-slate-400">None</li>}
          </ul>

          <h2 className="text-lg font-bold text-slate-900 mb-2">New people ({newNames.length})</h2>
          <ul className="flex flex-wrap gap-2 mb-4">
            {newNames.map((name, i) => (
              <li key={i} className={`${pillClass} bg-amber-50 text-amber-800`}>
                {name}
              </li>
            ))}
            {newNames.length === 0 && <li className="text-sm text-slate-400">None</li>}
          </ul>

          <form action={confirmAddPlayersWithId} className="flex items-center gap-4">
            <input type="hidden" name="names" value={pendingNames} />
            <button type="submit" className={accentButtonClass}>
              Confirm
            </button>
            <Link href={`/tournaments/${id}/roster`} className={linkClass}>
              Cancel
            </Link>
          </form>
        </div>
      </OrganizerShell>
    );
  }

  const startAddPlayersWithId = startAddPlayers.bind(null, id);

  return (
    <OrganizerShell organizerName={organizer.name}>
      <TournamentNav tournamentId={id} current="roster" />
      <h1 className="text-2xl font-extrabold text-slate-900 mb-6">Roster</h1>

      <div className={`${cardClass} mb-6`}>
        <form action={startAddPlayersWithId} className="space-y-3">
          <textarea
            name="names"
            rows={8}
            placeholder="One player name per line"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
          <button type="submit" className={primaryButtonClass}>
            Add Players
          </button>
        </form>
      </div>

      <div className={cardClass}>
        <h2 className="text-lg font-bold text-slate-900 mb-2">
          Players ({(players ?? []).length})
        </h2>
        {duplicateNames.size > 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            ⚠ Duplicate name(s) — double-check pairing later:{' '}
            {Array.from(duplicateNames).join(', ')}
          </p>
        )}
        <ul className="flex flex-wrap gap-2">
          {(players ?? []).map((p) => (
            <li key={p.id} className={`${pillClass} bg-teal-50 text-teal-800`}>
              {p.name}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-6">
        <Link href={`/tournaments/${id}/teams`} className={linkClass}>
          Next: pair teams →
        </Link>
      </p>
    </OrganizerShell>
  );
}
```

- [ ] **Step 3: Verify the build compiles**

```bash
cd apps/organizer-web && npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Manual verification in browser**

1. Go to an existing tournament's roster page. Paste a mix of names: one that already exists as a `people` row (e.g. "Alice", case-different like "ALICE" should still match), and one brand-new name (e.g. "Zoe"). Click "Add Players."
2. Confirm the review screen shows "Alice"-style entry under "Matched to existing person" and "Zoe" under "New people."
3. Click "Confirm." Confirm you land back on the roster page and the new names appear in the player list.
4. In the Supabase dashboard, confirm a new `players` row was created with `person_id` pointing to the *existing* `people.id` for the matched name (not a new person), and a brand-new `people` row was created for "Zoe" and linked.
5. Repeat the paste step but click "Cancel" on the review screen instead of "Confirm" — confirm no new rows were created and you're back on the normal roster page.

- [ ] **Step 5: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/roster"
git commit -m "Add review step to roster entry, linking names to durable people"
```

---

### Task 6: `/people` list page

**Files:**
- Create: `apps/organizer-web/app/people/page.tsx`
- Modify: `apps/organizer-web/app/components/OrganizerShell.tsx`

**Interfaces:**
- Consumes: `requireOrganizer()` (Increment 1.1); `buildPersonMatchRecords` from `@/lib/stats/buildPersonMatchRecords` (Task 3).
- Produces: the `/people` route, linked from the header nav on every page.

- [ ] **Step 1: Add a "People" link to the shared header**

In `apps/organizer-web/app/components/OrganizerShell.tsx`, replace the full contents with:

```typescript jsx
// apps/organizer-web/app/components/OrganizerShell.tsx
import Link from 'next/link';
import { signOut } from '@/app/login/actions';

export default function OrganizerShell({
  children,
  organizerName,
}: {
  children: React.ReactNode;
  organizerName?: string;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-teal-600 text-white shadow-md">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/tournaments" className="flex items-center gap-2 font-extrabold text-lg tracking-tight">
              <span className="inline-block h-3 w-3 rounded-full bg-amber-400" />
              Pickle Turf Organizer
            </Link>
            <Link href="/people" className="text-sm font-semibold text-teal-50 hover:text-white">
              People
            </Link>
          </div>
          {organizerName && (
            <form action={signOut} className="flex items-center gap-3">
              <span className="text-sm text-teal-50 hidden sm:inline">
                Hi, {organizerName}
              </span>
              <button
                type="submit"
                className="text-sm font-semibold bg-teal-700 hover:bg-teal-800 transition-colors px-3 py-1.5 rounded-full"
              >
                Sign out
              </button>
            </form>
          )}
        </div>
      </header>
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Add the `/people` list page**

```typescript jsx
// apps/organizer-web/app/people/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass } from '@/app/components/ui';
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import type { RawMatch, RawTeam } from '@/lib/stats/types';

export default async function PeopleListPage() {
  const { supabase, organizer } = await requireOrganizer();

  const { data: people } = await supabase
    .from('people')
    .select('id, name')
    .eq('organizer_id', organizer.id)
    .order('name', { ascending: true });

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, date')
    .eq('organizer_id', organizer.id);

  const tournamentIds = (tournaments ?? []).map((t) => t.id);
  const tournamentDateById = new Map((tournaments ?? []).map((t) => [t.id, t.date]));

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
        .not('team_b_id', 'is', null)
    : { data: [] };

  const personIdByPlayerId = new Map(
    (players ?? []).map((p) => [p.id, p.person_id as string | null])
  );

  const teams: RawTeam[] = (teamsRaw ?? [])
    .map((t) => ({
      id: t.id,
      tournamentId: t.tournament_id,
      player1PersonId: personIdByPlayerId.get(t.player_1_id) ?? '',
      player2PersonId: personIdByPlayerId.get(t.player_2_id) ?? '',
    }))
    .filter((t) => t.player1PersonId && t.player2PersonId);

  const matches: RawMatch[] = (matchesRaw ?? []).map((m) => ({
    tournamentId: m.tournament_id,
    tournamentDate: tournamentDateById.get(m.tournament_id) ?? '',
    teamAId: m.team_a_id!,
    teamBId: m.team_b_id!,
    scoreA: m.score_a ?? 0,
    scoreB: m.score_b ?? 0,
    status: m.status as 'pending' | 'complete',
  }));

  const summaries = (people ?? []).map((person) => {
    const records = buildPersonMatchRecords(person.id, matches, teams);
    const wins = records.filter((r) => r.won).length;
    const losses = records.length - wins;
    const tournamentsPlayed = new Set(records.map((r) => r.tournamentId)).size;
    return { ...person, wins, losses, tournamentsPlayed };
  });

  return (
    <OrganizerShell organizerName={organizer.name}>
      <h1 className="text-2xl font-extrabold text-slate-900 mb-6">People</h1>

      {summaries.length === 0 && (
        <div className={`${cardClass} text-center text-slate-500`}>
          No people yet — they're created automatically the first time you add them to a
          tournament roster.
        </div>
      )}

      <ul className="space-y-3">
        {summaries.map((person) => (
          <li key={person.id}>
            <Link
              href={`/people/${person.id}`}
              className={`${cardClass} flex items-center justify-between hover:border-teal-400 transition-colors block`}
            >
              <span className="font-semibold text-slate-900">{person.name}</span>
              <span className="text-sm text-slate-500">
                {person.tournamentsPlayed} tournament{person.tournamentsPlayed === 1 ? '' : 's'} —{' '}
                {person.wins}-{person.losses}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </OrganizerShell>
  );
}
```

- [ ] **Step 3: Verify the build compiles**

```bash
cd apps/organizer-web && npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Manual verification in browser**

Go to any page, confirm "People" now appears in the header next to "Pickle Turf Organizer." Click it, confirm `/people` lists every person from your real roster with a tournaments-played count and a win-loss record that looks plausible against what you already know is in "Test Round Robin" (e.g. Alice should show 1 tournament, some win-loss record from the matches you scored during Increment 1.1's verification).

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/app/people/page.tsx apps/organizer-web/app/components/OrganizerShell.tsx
git commit -m "Add /people list page with tournaments-played and win-loss summary"
```

---

### Task 7: `/people/[id]` detail page

**Files:**
- Create: `apps/organizer-web/app/people/[id]/page.tsx`

**Interfaces:**
- Consumes: `requireOrganizer()`; `buildPersonMatchRecords` (Task 3); `computePersonStats` from `@/lib/stats/personStats` (Task 4); `computeStandings` from `@/lib/tournament/standings` (Increment 1.1, reused to determine which tournaments this person's team won).

- [ ] **Step 1: Add the detail page**

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
    .select('id, name, date')
    .eq('organizer_id', organizer.id);

  const tournamentIds = (tournaments ?? []).map((t) => t.id);
  const tournamentDateById = new Map((tournaments ?? []).map((t) => [t.id, t.date]));

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

  return (
    <OrganizerShell organizerName={organizer.name}>
      <h1 className="text-2xl font-extrabold text-slate-900 mb-6">{person.name}</h1>

      <div className={`${cardClass} mb-6`}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">This Month</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-extrabold text-teal-700">
              {stats.monthly[0]?.gamesWon ?? 0}
            </div>
            <div className="text-xs text-slate-500">Games won</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-500">
              {stats.monthly[0]?.gamesLost ?? 0}
            </div>
            <div className="text-xs text-slate-500">Games lost</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-amber-500">
              {stats.monthly[0]?.tournamentsWon ?? 0}
            </div>
            <div className="text-xs text-slate-500">Tournaments won</div>
          </div>
        </div>
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

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Manual verification in browser**

Go to `/people`, click into a real person from your roster who has completed matches (e.g. Alice, Carol, or Mike from "Test Round Robin"). Confirm:
1. "This Month" shows game counts matching what you actually scored for them during Increment 1.1's verification.
2. Toughest opponent / best partner show a real name and a plausible record (or "Not enough matches yet" if they've only ever played one opponent/partner).
3. Match history lists every completed match this person played, newest first, with the correct partner, opponents, and score.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/people/[id]"
git commit -m "Add person detail page: stats, head-to-head, match history"
```

---

### Task 8: Push and verify CI

**Files:** none (repo-level)

- [ ] **Step 1: Push to GitHub**

```bash
cd "C:\Users\ANKS\pickleball project"
git push
```

- [ ] **Step 2: Confirm CI passes**

Check the Actions tab on GitHub (or poll `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`) and confirm the latest run's `conclusion` is `success`.
