# Threat Level Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a compact "Threat Level" badge (derived from overall win rate) next to a player's name on the Player Detail page, the Leaderboard page, and a tournament's Roster and Teams pages.

**Architecture:** Two new pure `lib/stats/` modules (`threatLevel.ts` for the tier mapping, `winRate.ts` for deriving a percentage from match records), one shared `ThreatBadge` component, and independent wiring into each of the 4 pages — reusing already-computed data where it exists (Player Detail) and adding an organizer-wide teams/matches query where it doesn't (Roster, Teams).

**Tech Stack:** Next.js App Router Server Components, Vitest.

## Global Constraints

- Tiers: 0–20 🟢 LOW THREAT, 21–40 🟡 WATCH OUT, 41–60 🟠 DANGEROUS, 61–80 🔴 HIGH THREAT, 81–100 💀 DO NOT PLAY.
- Win rate is always the player's *overall* rate (same number used for star ratings) — never scoped per-page.
- `ThreatBadge` renders nothing when `winPercentage` is `null` (no completed matches) — same omit-if-empty behavior as star ratings.
- No new Supabase queries on the Player Detail page (reuses already-computed `stats.winPercentage`); the Leaderboard page's new computation reuses data it already fetches (no new queries either); Roster and Teams pages each add one new organizer-wide teams/matches fetch.
- Each of the 4 page-wiring tasks (4-7) is independent of the other three — none share a new export, so they can run in any order relative to each other.

---

### Task 1: `threatLevel.ts` (TDD)

**Files:**
- Create: `apps/organizer-web/lib/stats/threatLevel.ts`
- Create: `apps/organizer-web/lib/stats/threatLevel.test.ts`

**Interfaces:**
- Produces: `ThreatTier = { emoji: string; label: string; colorClass: string }`,
  `threatTierFor(winPercentage: number): ThreatTier` — consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

Create `apps/organizer-web/lib/stats/threatLevel.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { threatTierFor } from './threatLevel';

describe('threatTierFor', () => {
  it('returns DO NOT PLAY at and above 81%', () => {
    expect(threatTierFor(100)).toEqual({
      emoji: '💀',
      label: 'DO NOT PLAY',
      colorClass: 'bg-purple-100 text-purple-800',
    });
    expect(threatTierFor(81)).toEqual({
      emoji: '💀',
      label: 'DO NOT PLAY',
      colorClass: 'bg-purple-100 text-purple-800',
    });
  });

  it('returns HIGH THREAT from 61% to just under 81%', () => {
    expect(threatTierFor(80)).toEqual({
      emoji: '🔴',
      label: 'HIGH THREAT',
      colorClass: 'bg-red-100 text-red-800',
    });
    expect(threatTierFor(61)).toEqual({
      emoji: '🔴',
      label: 'HIGH THREAT',
      colorClass: 'bg-red-100 text-red-800',
    });
  });

  it('returns DANGEROUS from 41% to just under 61%', () => {
    expect(threatTierFor(60)).toEqual({
      emoji: '🟠',
      label: 'DANGEROUS',
      colorClass: 'bg-orange-100 text-orange-800',
    });
    expect(threatTierFor(41)).toEqual({
      emoji: '🟠',
      label: 'DANGEROUS',
      colorClass: 'bg-orange-100 text-orange-800',
    });
  });

  it('returns WATCH OUT from 21% to just under 41%', () => {
    expect(threatTierFor(40)).toEqual({
      emoji: '🟡',
      label: 'WATCH OUT',
      colorClass: 'bg-yellow-100 text-yellow-800',
    });
    expect(threatTierFor(21)).toEqual({
      emoji: '🟡',
      label: 'WATCH OUT',
      colorClass: 'bg-yellow-100 text-yellow-800',
    });
  });

  it('returns LOW THREAT below 21%', () => {
    expect(threatTierFor(20)).toEqual({
      emoji: '🟢',
      label: 'LOW THREAT',
      colorClass: 'bg-green-100 text-green-800',
    });
    expect(threatTierFor(0)).toEqual({
      emoji: '🟢',
      label: 'LOW THREAT',
      colorClass: 'bg-green-100 text-green-800',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/organizer-web && npx vitest run lib/stats/threatLevel.test.ts`
Expected: FAIL — `Cannot find module './threatLevel'`.

- [ ] **Step 3: Write the implementation**

Create `apps/organizer-web/lib/stats/threatLevel.ts`:

```typescript
export type ThreatTier = {
  emoji: string;
  label: string;
  colorClass: string;
};

export function threatTierFor(winPercentage: number): ThreatTier {
  if (winPercentage >= 81) {
    return { emoji: '💀', label: 'DO NOT PLAY', colorClass: 'bg-purple-100 text-purple-800' };
  }
  if (winPercentage >= 61) {
    return { emoji: '🔴', label: 'HIGH THREAT', colorClass: 'bg-red-100 text-red-800' };
  }
  if (winPercentage >= 41) {
    return { emoji: '🟠', label: 'DANGEROUS', colorClass: 'bg-orange-100 text-orange-800' };
  }
  if (winPercentage >= 21) {
    return { emoji: '🟡', label: 'WATCH OUT', colorClass: 'bg-yellow-100 text-yellow-800' };
  }
  return { emoji: '🟢', label: 'LOW THREAT', colorClass: 'bg-green-100 text-green-800' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/organizer-web && npx vitest run lib/stats/threatLevel.test.ts`
Expected: PASS — 5/5 tests passing.

- [ ] **Step 5: Run the full suite**

Run: `cd apps/organizer-web && npm test`
Expected: all tests pass (163 pre-existing + 5 new = 168).

- [ ] **Step 6: Commit**

```bash
git add apps/organizer-web/lib/stats/threatLevel.ts apps/organizer-web/lib/stats/threatLevel.test.ts
git commit -m "feat: add threatTierFor tier mapping"
```

---

### Task 2: `winRate.ts` (TDD)

**Files:**
- Create: `apps/organizer-web/lib/stats/winRate.ts`
- Create: `apps/organizer-web/lib/stats/winRate.test.ts`

**Interfaces:**
- Produces: `winPercentageFromRecords(records: PersonMatchRecord[]): number | null` —
  consumed by Tasks 5, 6, 7.

- [ ] **Step 1: Write the failing tests**

Create `apps/organizer-web/lib/stats/winRate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { winPercentageFromRecords } from './winRate';
import type { PersonMatchRecord } from './types';

const record = (won: boolean): PersonMatchRecord => ({
  tournamentId: 't1',
  tournamentDate: '2026-01-01',
  venueName: 'Pickle Turf',
  partnerId: 'p2',
  opponentIds: ['p3', 'p4'],
  scoreFor: won ? 11 : 5,
  scoreAgainst: won ? 5 : 11,
  won,
});

describe('winPercentageFromRecords', () => {
  it('returns null when there are no records', () => {
    expect(winPercentageFromRecords([])).toBeNull();
  });

  it('returns 100 when every record is a win', () => {
    expect(winPercentageFromRecords([record(true), record(true)])).toBe(100);
  });

  it('returns 0 when every record is a loss', () => {
    expect(winPercentageFromRecords([record(false), record(false)])).toBe(0);
  });

  it('rounds to the nearest whole percent', () => {
    expect(winPercentageFromRecords([record(true), record(false), record(false)])).toBe(33);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/organizer-web && npx vitest run lib/stats/winRate.test.ts`
Expected: FAIL — `Cannot find module './winRate'`.

- [ ] **Step 3: Write the implementation**

Create `apps/organizer-web/lib/stats/winRate.ts`:

```typescript
import type { PersonMatchRecord } from './types';

export function winPercentageFromRecords(records: PersonMatchRecord[]): number | null {
  if (records.length === 0) {
    return null;
  }
  const wins = records.filter((r) => r.won).length;
  return Math.round((wins / records.length) * 100);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/organizer-web && npx vitest run lib/stats/winRate.test.ts`
Expected: PASS — 4/4 tests passing.

- [ ] **Step 5: Run the full suite**

Run: `cd apps/organizer-web && npm test`
Expected: all tests pass (168 pre-existing + 4 new = 172).

- [ ] **Step 6: Commit**

```bash
git add apps/organizer-web/lib/stats/winRate.ts apps/organizer-web/lib/stats/winRate.test.ts
git commit -m "feat: add winPercentageFromRecords helper"
```

---

### Task 3: `ThreatBadge` component

**Files:**
- Create: `apps/organizer-web/app/components/ThreatBadge.tsx`

**Interfaces:**
- Consumes: `threatTierFor` (Task 1).
- Produces: `ThreatBadge({ winPercentage: number | null }): JSX.Element | null` — a
  default export, consumed by Tasks 4-7.

- [ ] **Step 1: Create the component**

Create `apps/organizer-web/app/components/ThreatBadge.tsx`:

```tsx
import { threatTierFor } from '@/lib/stats/threatLevel';
import { pillClass } from './ui';

export default function ThreatBadge({ winPercentage }: { winPercentage: number | null }) {
  if (winPercentage === null) {
    return null;
  }

  const tier = threatTierFor(winPercentage);

  return (
    <span className={`${pillClass} ${tier.colorClass}`}>
      {tier.emoji} {tier.label}
    </span>
  );
}
```

- [ ] **Step 2: Run the build**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no TypeScript or ESLint errors (this is a
new, currently-unused file — nothing imports it yet).

- [ ] **Step 3: Commit**

```bash
git add apps/organizer-web/app/components/ThreatBadge.tsx
git commit -m "feat: add ThreatBadge component"
```

---

### Task 4: Wire the badge into the Player Detail page

**Files:**
- Modify: `apps/organizer-web/app/people/[id]/page.tsx`

**Interfaces:**
- Consumes: `ThreatBadge` (Task 3).

- [ ] **Step 1: Add the import**

In `apps/organizer-web/app/people/[id]/page.tsx`, find:

```tsx
import PersonAvatar from '@/app/components/PersonAvatar';
import SaveButton from '@/app/components/SaveButton';
```

Replace with:

```tsx
import PersonAvatar from '@/app/components/PersonAvatar';
import SaveButton from '@/app/components/SaveButton';
import ThreatBadge from '@/app/components/ThreatBadge';
```

- [ ] **Step 2: Render the badge next to the name**

Find:

```tsx
      <div className="flex items-center gap-4 mb-1">
        <PersonAvatar photoUrl={person.photo_url} name={person.name} size={80} />
        <h1 className="text-2xl font-bold text-slate-900">{displayName}</h1>
      </div>
```

Replace with:

```tsx
      <div className="flex items-center gap-4 mb-1">
        <PersonAvatar photoUrl={person.photo_url} name={person.name} size={80} />
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold text-slate-900">{displayName}</h1>
          <ThreatBadge winPercentage={stats.winPercentage} />
        </div>
      </div>
```

`stats.winPercentage` is already computed above this point in the file
(via `computePersonStats`) — no new query needed.

- [ ] **Step 3: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 172 tests pass.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/people/[id]/page.tsx"
git commit -m "feat: show Threat Level badge on the Player Detail page"
```

---

### Task 5: Wire the badge into the Leaderboard page

**Files:**
- Modify: `apps/organizer-web/app/locations/page.tsx`

**Interfaces:**
- Consumes: `ThreatBadge` (Task 3), `winPercentageFromRecords` (Task 2).

- [ ] **Step 1: Add the imports**

In `apps/organizer-web/app/locations/page.tsx`, find:

```tsx
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { computeLocationLeaderboard } from '@/lib/stats/locationLeaderboard';
```

Replace with:

```tsx
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { computeLocationLeaderboard } from '@/lib/stats/locationLeaderboard';
import { winPercentageFromRecords } from '@/lib/stats/winRate';
import ThreatBadge from '@/app/components/ThreatBadge';
```

- [ ] **Step 2: Compute each displayed person's overall win rate once**

Find:

```tsx
  const teams: RawTeam[] = (teamsRaw ?? [])
    .map((t) => ({
      id: t.id,
      tournamentId: t.tournament_id,
      player1PersonId: personIdByPlayerId.get(t.player_1_id) ?? '',
      player2PersonId: personIdByPlayerId.get(t.player_2_id) ?? '',
    }))
    .filter((t) => t.player1PersonId && t.player2PersonId);

  const leaderboardsByVenue = (venues ?? []).map((venue) => {
```

Replace with:

```tsx
  const teams: RawTeam[] = (teamsRaw ?? [])
    .map((t) => ({
      id: t.id,
      tournamentId: t.tournament_id,
      player1PersonId: personIdByPlayerId.get(t.player_1_id) ?? '',
      player2PersonId: personIdByPlayerId.get(t.player_2_id) ?? '',
    }))
    .filter((t) => t.player1PersonId && t.player2PersonId);

  // Overall (not venue-scoped) win rate, computed once from data already fetched above,
  // for the Threat Level badge — separate from each venue's own winPercentage below.
  const allCompleteMatches: RawMatch[] = (matchesRaw ?? [])
    .filter((m) => m.team_b_id !== null && m.status === 'complete')
    .map((m) => ({
      tournamentId: m.tournament_id,
      tournamentDate: tournamentDateById.get(m.tournament_id) ?? '',
      venueName: '',
      teamAId: m.team_a_id!,
      teamBId: m.team_b_id!,
      scoreA: m.score_a ?? 0,
      scoreB: m.score_b ?? 0,
      status: 'complete' as const,
    }));

  const overallWinPercentageByPersonId = new Map(
    (people ?? []).map((person) => [
      person.id,
      winPercentageFromRecords(buildPersonMatchRecords(person.id, allCompleteMatches, teams)),
    ])
  );

  const leaderboardsByVenue = (venues ?? []).map((venue) => {
```

- [ ] **Step 3: Render the badge next to each ranked player's name**

Find:

```tsx
                  <Link
                    href={`/people/${entry.personId}`}
                    className={`flex items-center gap-2 font-semibold hover:underline ${i === 0 ? 'text-base text-slate-900' : 'text-slate-800'}`}
                  >
                    <span className="text-slate-500">{i + 1}.</span>
                    {personNameById.get(entry.personId) ?? 'Unknown'}
                  </Link>
```

Replace with:

```tsx
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/people/${entry.personId}`}
                      className={`flex items-center gap-2 font-semibold hover:underline ${i === 0 ? 'text-base text-slate-900' : 'text-slate-800'}`}
                    >
                      <span className="text-slate-500">{i + 1}.</span>
                      {personNameById.get(entry.personId) ?? 'Unknown'}
                    </Link>
                    <ThreatBadge
                      winPercentage={overallWinPercentageByPersonId.get(entry.personId) ?? null}
                    />
                  </div>
```

- [ ] **Step 4: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 172 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/app/locations/page.tsx
git commit -m "feat: show Threat Level badge on the Leaderboard page"
```

---

### Task 6: Wire the badge into the Roster page

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/roster/page.tsx`

**Interfaces:**
- Consumes: `ThreatBadge` (Task 3), `winPercentageFromRecords` (Task 2).

- [ ] **Step 1: Add the imports**

In `apps/organizer-web/app/tournaments/[id]/roster/page.tsx`, find:

```tsx
import { buildRosterTeams, buildUnpairedPlayerNames } from '@/lib/tournament/rosterExport';
```

Replace with:

```tsx
import { buildRosterTeams, buildUnpairedPlayerNames } from '@/lib/tournament/rosterExport';
import ThreatBadge from '@/app/components/ThreatBadge';
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { winPercentageFromRecords } from '@/lib/stats/winRate';
import type { RawMatch, RawTeam } from '@/lib/stats/types';
```

- [ ] **Step 2: Fetch organizer-wide teams/matches and compute each roster player's win rate**

Find:

```tsx
  const { data: players } = await supabase
    .from('players')
    .select('id, name, person_id')
    .eq('tournament_id', id)
    .order('created_at', { ascending: true });

  const { data: teams } = !isIndividual
```

Replace with:

```tsx
  const { data: players } = await supabase
    .from('players')
    .select('id, name, person_id')
    .eq('tournament_id', id)
    .order('created_at', { ascending: true });

  const { data: allTournaments } = await supabase
    .from('tournaments')
    .select('id')
    .eq('organizer_id', organizer.id);

  const allTournamentIds = (allTournaments ?? []).map((t) => t.id);

  const { data: allTeamsRaw } = allTournamentIds.length
    ? await supabase
        .from('teams')
        .select('id, player_1_id, player_2_id')
        .in('tournament_id', allTournamentIds)
    : { data: [] };

  const { data: allPlayersRaw } = allTournamentIds.length
    ? await supabase
        .from('players')
        .select('id, person_id')
        .in('tournament_id', allTournamentIds)
    : { data: [] };

  const { data: allMatchesRaw } = allTournamentIds.length
    ? await supabase
        .from('matches')
        .select('tournament_id, team_a_id, team_b_id, score_a, score_b, status')
        .in('tournament_id', allTournamentIds)
    : { data: [] };

  const personIdByAllPlayerId = new Map(
    (allPlayersRaw ?? []).map((p) => [p.id, p.person_id as string | null])
  );

  // tournamentId/tournamentDate/venueName are unused by buildPersonMatchRecords for this
  // purpose (only `.won` is read off the resulting records), so they're left as placeholders.
  const allTeams: RawTeam[] = (allTeamsRaw ?? [])
    .map((t) => ({
      id: t.id,
      tournamentId: '',
      player1PersonId: personIdByAllPlayerId.get(t.player_1_id) ?? '',
      player2PersonId: personIdByAllPlayerId.get(t.player_2_id) ?? '',
    }))
    .filter((t) => t.player1PersonId && t.player2PersonId);

  const allCompleteMatches: RawMatch[] = (allMatchesRaw ?? [])
    .filter((m) => m.team_b_id !== null && m.status === 'complete')
    .map((m) => ({
      tournamentId: m.tournament_id,
      tournamentDate: '',
      venueName: '',
      teamAId: m.team_a_id!,
      teamBId: m.team_b_id!,
      scoreA: m.score_a ?? 0,
      scoreB: m.score_b ?? 0,
      status: 'complete' as const,
    }));

  const winPercentageByPersonId = new Map<string, number | null>();
  for (const p of players ?? []) {
    if (!p.person_id || winPercentageByPersonId.has(p.person_id)) continue;
    winPercentageByPersonId.set(
      p.person_id,
      winPercentageFromRecords(buildPersonMatchRecords(p.person_id, allCompleteMatches, allTeams))
    );
  }

  const { data: teams } = !isIndividual
```

- [ ] **Step 3: Render the badge next to each player's name**

Find:

```tsx
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900"
              >
                <span>{p.name}</span>
                {!isCompleted && (
```

Replace with:

```tsx
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900"
              >
                <span className="flex items-center gap-2 flex-wrap">
                  {p.name}
                  <ThreatBadge
                    winPercentage={p.person_id ? (winPercentageByPersonId.get(p.person_id) ?? null) : null}
                  />
                </span>
                {!isCompleted && (
```

- [ ] **Step 4: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 172 tests pass.

- [ ] **Step 5: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/roster/page.tsx"
git commit -m "feat: show Threat Level badge on the Roster page"
```

---

### Task 7: Wire the badge into the Teams page

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/teams/page.tsx`

**Interfaces:**
- Consumes: `ThreatBadge` (Task 3), `winPercentageFromRecords` (Task 2).

- [ ] **Step 1: Add the imports**

In `apps/organizer-web/app/tournaments/[id]/teams/page.tsx`, find:

```tsx
import { formatLabel, isIndividualFormat } from '@/lib/tournament/formats';
import { pairTeam, shuffleRemaining, removeTeam } from './actions';
```

Replace with:

```tsx
import { formatLabel, isIndividualFormat } from '@/lib/tournament/formats';
import { pairTeam, shuffleRemaining, removeTeam } from './actions';
import ThreatBadge from '@/app/components/ThreatBadge';
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { winPercentageFromRecords } from '@/lib/stats/winRate';
import type { RawMatch, RawTeam } from '@/lib/stats/types';
```

- [ ] **Step 2: Widen the `players` query to include `person_id`**

Find:

```tsx
  const { data: players } = await supabase
    .from('players')
    .select('id, name')
    .eq('tournament_id', id)
    .order('created_at', { ascending: true });
```

Replace with:

```tsx
  const { data: players } = await supabase
    .from('players')
    .select('id, name, person_id')
    .eq('tournament_id', id)
    .order('created_at', { ascending: true });
```

- [ ] **Step 3: Fetch organizer-wide teams/matches and compute each player's win rate**

Find:

```tsx
  const { data: teams } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', id);

  const { count: leagueMatchCount } = await supabase
```

Replace with:

```tsx
  const { data: teams } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', id);

  const { data: allTournaments } = await supabase
    .from('tournaments')
    .select('id')
    .eq('organizer_id', organizer.id);

  const allTournamentIds = (allTournaments ?? []).map((t) => t.id);

  const { data: allTeamsRaw } = allTournamentIds.length
    ? await supabase
        .from('teams')
        .select('id, player_1_id, player_2_id')
        .in('tournament_id', allTournamentIds)
    : { data: [] };

  const { data: allPlayersRaw } = allTournamentIds.length
    ? await supabase
        .from('players')
        .select('id, person_id')
        .in('tournament_id', allTournamentIds)
    : { data: [] };

  const { data: allMatchesRaw } = allTournamentIds.length
    ? await supabase
        .from('matches')
        .select('tournament_id, team_a_id, team_b_id, score_a, score_b, status')
        .in('tournament_id', allTournamentIds)
    : { data: [] };

  const personIdByAllPlayerId = new Map(
    (allPlayersRaw ?? []).map((p) => [p.id, p.person_id as string | null])
  );

  // tournamentId/tournamentDate/venueName are unused by buildPersonMatchRecords for this
  // purpose (only `.won` is read off the resulting records), so they're left as placeholders.
  const allTeams: RawTeam[] = (allTeamsRaw ?? [])
    .map((t) => ({
      id: t.id,
      tournamentId: '',
      player1PersonId: personIdByAllPlayerId.get(t.player_1_id) ?? '',
      player2PersonId: personIdByAllPlayerId.get(t.player_2_id) ?? '',
    }))
    .filter((t) => t.player1PersonId && t.player2PersonId);

  const allCompleteMatches: RawMatch[] = (allMatchesRaw ?? [])
    .filter((m) => m.team_b_id !== null && m.status === 'complete')
    .map((m) => ({
      tournamentId: m.tournament_id,
      tournamentDate: '',
      venueName: '',
      teamAId: m.team_a_id!,
      teamBId: m.team_b_id!,
      scoreA: m.score_a ?? 0,
      scoreB: m.score_b ?? 0,
      status: 'complete' as const,
    }));

  const winPercentageByPersonId = new Map<string, number | null>();
  for (const p of players ?? []) {
    if (!p.person_id || winPercentageByPersonId.has(p.person_id)) continue;
    winPercentageByPersonId.set(
      p.person_id,
      winPercentageFromRecords(buildPersonMatchRecords(p.person_id, allCompleteMatches, allTeams))
    );
  }

  const { count: leagueMatchCount } = await supabase
```

- [ ] **Step 4: Add a per-player-id win-rate lookup and the person-id map**

Find:

```tsx
  const playerById = new Map((players ?? []).map((p) => [p.id, p.name]));
```

Replace with:

```tsx
  const playerById = new Map((players ?? []).map((p) => [p.id, p.name]));
  const personIdByPlayerId = new Map((players ?? []).map((p) => [p.id, p.person_id as string | null]));
  const winPercentageForPlayerId = (playerId: string): number | null => {
    const personId = personIdByPlayerId.get(playerId);
    return personId ? (winPercentageByPersonId.get(personId) ?? null) : null;
  };
```

- [ ] **Step 5: Render the badge in the Teams list, splitting the concatenated name string**

Find:

```tsx
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  {playerById.get(t.player_1_id)} / {playerById.get(t.player_2_id)}
                </span>
```

Replace with:

```tsx
                <span className="flex items-center gap-2 flex-wrap">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  <span className="inline-flex items-center gap-1.5">
                    {playerById.get(t.player_1_id)}
                    <ThreatBadge winPercentage={winPercentageForPlayerId(t.player_1_id)} />
                  </span>
                  <span>/</span>
                  <span className="inline-flex items-center gap-1.5">
                    {playerById.get(t.player_2_id)}
                    <ThreatBadge winPercentage={winPercentageForPlayerId(t.player_2_id)} />
                  </span>
                </span>
```

- [ ] **Step 6: Render the badge in the Unpaired players list**

Find:

```tsx
        <ul className="flex flex-wrap gap-2">
          {unpairedPlayers.map((p) => (
            <li key={p.id} className={`${pillClass} bg-slate-100 text-slate-700`}>
              {p.name}
            </li>
          ))}
        </ul>
```

Replace with:

```tsx
        <ul className="flex flex-wrap gap-2">
          {unpairedPlayers.map((p) => (
            <li key={p.id} className={`${pillClass} bg-slate-100 text-slate-700 flex items-center gap-1.5`}>
              {p.name}
              <ThreatBadge winPercentage={winPercentageForPlayerId(p.id)} />
            </li>
          ))}
        </ul>
```

- [ ] **Step 7: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 172 tests pass.

- [ ] **Step 8: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/teams/page.tsx"
git commit -m "feat: show Threat Level badge on the Teams page"
```

---

### Task 8: Push, verify CI, manual regression

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

- On a player's `/people/[id]` page: confirm a colored Threat Level pill
  (e.g. "🔴 HIGH THREAT") appears next to their name, matching their
  known win rate. On a player with zero completed matches, confirm no
  badge appears at all.
- On `/locations` (Leaderboard): confirm each ranked player shows a
  badge next to their name, and confirm the badge's tier matches that
  player's *overall* win rate (check this against their Player Detail
  page), not the venue-scoped percentage still shown in the line below.
- On a tournament's Roster page: confirm each player in the "Players"
  list shows their badge (or none, if they haven't played any matches
  yet across any tournament).
- On the same tournament's Teams page: confirm both paired-team names
  and unpaired-player names show their own individual badges — this is
  a new layout (previously "PlayerA / PlayerB" as one string), confirm
  it reads cleanly.
- Confirm the same player's badge is identical (same tier, same label)
  across all 4 pages — no page shows a contradictory Threat Level for
  the same person.

Clean up any disposable test data used for this check afterward.
