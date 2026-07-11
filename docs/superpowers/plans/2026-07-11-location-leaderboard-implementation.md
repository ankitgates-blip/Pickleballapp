# Location Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an organizer-only "Location Stats" page showing each venue's top 5 players, ranked by a 60%-tournament-wins / 40%-match-wins weighted score, both scoped to that venue only.

**Architecture:** A new pure function (`computeLocationLeaderboard`) does the scoring/ranking math in isolation, fully unit-tested. A new page assembles the per-venue candidate data by reusing the existing `buildPersonMatchRecords` and `computeStandings` functions the profile-stats feature already established — the same pattern, just aggregated across every person instead of one.

**Tech Stack:** Same as prior work — Next.js (App Router, TypeScript), Supabase JS client, Vitest.

## Global Constraints

- Score = `0.6 * (tournamentWins / maxTournamentWins) + 0.4 * (matchWins / maxMatchWins)`, both maxes computed per-location among that location's candidates; either half is 0 (not NaN) if that location's max is 0.
- Both tournament wins and match wins only count activity at that specific venue.
- No minimum match count for eligibility — anyone with ≥1 match at a location is a candidate; ties broken by total matches played there (descending).
- The page is organizer-only, both venues shown on one page.
- Design reference: [docs/superpowers/specs/2026-07-11-location-leaderboard-design.md](../specs/2026-07-11-location-leaderboard-design.md).

---

### Task 1: `computeLocationLeaderboard` pure function

**Files:**
- Create: `apps/organizer-web/lib/stats/locationLeaderboard.ts`
- Test: `apps/organizer-web/lib/stats/locationLeaderboard.test.ts`

**Interfaces:**
- Produces: `LocationLeaderboardEntry = { personId: string; matchWins: number; tournamentWins: number; score: number }`, `computeLocationLeaderboard(candidates: Array<{ personId: string; matchWins: number; tournamentWins: number; matchesPlayed: number }>): LocationLeaderboardEntry[]` — consumed by Task 2 (the `/locations` page).

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/organizer-web/lib/stats/locationLeaderboard.test.ts
import { describe, it, expect } from 'vitest';
import { computeLocationLeaderboard } from './locationLeaderboard';

describe('computeLocationLeaderboard', () => {
  it('weights tournament wins at 60% and match wins at 40%, both normalized to the max', () => {
    const result = computeLocationLeaderboard([
      { personId: 'a', tournamentWins: 2, matchWins: 10, matchesPlayed: 15 },
      { personId: 'b', tournamentWins: 1, matchWins: 20, matchesPlayed: 25 },
    ]);

    // a: tournamentScore = 2/2 = 1, matchScore = 10/20 = 0.5 -> score = 0.6*1 + 0.4*0.5 = 0.8
    // b: tournamentScore = 1/2 = 0.5, matchScore = 20/20 = 1 -> score = 0.6*0.5 + 0.4*1 = 0.7
    expect(result.map((r) => r.personId)).toEqual(['a', 'b']);
    expect(result[0].score).toBeCloseTo(0.8);
    expect(result[1].score).toBeCloseTo(0.7);
  });

  it('returns only the top 5, dropping the lowest scores', () => {
    const candidates = Array.from({ length: 6 }, (_, i) => ({
      personId: `p${i}`,
      tournamentWins: 0,
      matchWins: 6 - i, // p0 has 6 wins (highest), p5 has 1 win (lowest)
      matchesPlayed: 10,
    }));

    const result = computeLocationLeaderboard(candidates);

    expect(result).toHaveLength(5);
    expect(result.map((r) => r.personId)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
  });

  it('breaks ties by matchesPlayed descending', () => {
    const result = computeLocationLeaderboard([
      { personId: 'fewer-matches', tournamentWins: 0, matchWins: 5, matchesPlayed: 8 },
      { personId: 'more-matches', tournamentWins: 0, matchWins: 5, matchesPlayed: 10 },
    ]);

    // Both have identical score (same matchWins, same max, 0 tournament wins) -> tie-break by matchesPlayed
    expect(result.map((r) => r.personId)).toEqual(['more-matches', 'fewer-matches']);
  });

  it('scores everyone 0 for the tournament-win half when nobody has any tournament wins', () => {
    const result = computeLocationLeaderboard([
      { personId: 'a', tournamentWins: 0, matchWins: 10, matchesPlayed: 10 },
      { personId: 'b', tournamentWins: 0, matchWins: 5, matchesPlayed: 5 },
    ]);

    // No NaN from dividing by a zero max; ranking driven entirely by matchWins
    expect(result[0].personId).toBe('a');
    expect(result[0].score).toBeCloseTo(0.4); // 0.6*0 + 0.4*(10/10)
    expect(result[1].score).toBeCloseTo(0.2); // 0.6*0 + 0.4*(5/10)
  });

  it('includes a player with zero wins as long as they have played matches', () => {
    const result = computeLocationLeaderboard([
      { personId: 'winner', tournamentWins: 0, matchWins: 3, matchesPlayed: 3 },
      { personId: 'never-won', tournamentWins: 0, matchWins: 0, matchesPlayed: 4 },
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.personId)).toEqual(['winner', 'never-won']);
    expect(result[1].score).toBe(0);
  });

  it('returns an empty array for no candidates', () => {
    expect(computeLocationLeaderboard([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/organizer-web && npm test
```

Expected: FAIL with `Cannot find module './locationLeaderboard'`.

- [ ] **Step 3: Implement the function**

```typescript
// apps/organizer-web/lib/stats/locationLeaderboard.ts
export type LocationLeaderboardEntry = {
  personId: string;
  matchWins: number;
  tournamentWins: number;
  score: number;
};

type Candidate = {
  personId: string;
  matchWins: number;
  tournamentWins: number;
  matchesPlayed: number;
};

export function computeLocationLeaderboard(candidates: Candidate[]): LocationLeaderboardEntry[] {
  const maxTournamentWins = Math.max(0, ...candidates.map((c) => c.tournamentWins));
  const maxMatchWins = Math.max(0, ...candidates.map((c) => c.matchWins));

  return candidates
    .map((c) => {
      const tournamentScore = maxTournamentWins > 0 ? c.tournamentWins / maxTournamentWins : 0;
      const matchScore = maxMatchWins > 0 ? c.matchWins / maxMatchWins : 0;
      return {
        personId: c.personId,
        matchWins: c.matchWins,
        tournamentWins: c.tournamentWins,
        score: 0.6 * tournamentScore + 0.4 * matchScore,
        matchesPlayed: c.matchesPlayed,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.matchesPlayed - a.matchesPlayed;
    })
    .slice(0, 5)
    .map(({ personId, matchWins, tournamentWins, score }) => ({
      personId,
      matchWins,
      tournamentWins,
      score,
    }));
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/organizer-web && npm test
```

Expected: PASS, all 6 new tests green (44 total).

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/lib/stats/locationLeaderboard.ts apps/organizer-web/lib/stats/locationLeaderboard.test.ts
git commit -m "Add location leaderboard scoring function"
```

---

### Task 2: `/locations` page + nav link

**Files:**
- Create: `apps/organizer-web/app/locations/page.tsx`
- Modify: `apps/organizer-web/app/components/OrganizerShell.tsx`

**Interfaces:**
- Consumes: `computeLocationLeaderboard` from `@/lib/stats/locationLeaderboard` (Task 1); `buildPersonMatchRecords` from `@/lib/stats/buildPersonMatchRecords` (existing); `computeStandings` from `@/lib/tournament/standings` (existing); `RawTeam`, `RawMatch` from `@/lib/stats/types` (existing).

- [ ] **Step 1: Create the page**

```typescript jsx
// apps/organizer-web/app/locations/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass } from '@/app/components/ui';
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { computeLocationLeaderboard } from '@/lib/stats/locationLeaderboard';
import { computeStandings } from '@/lib/tournament/standings';
import type { RawMatch, RawTeam } from '@/lib/stats/types';
import type { MatchResult } from '@/lib/types';

export default async function LocationsPage() {
  const { supabase, organizer } = await requireOrganizer();

  const { data: venues } = await supabase.from('venues').select('id, name').order('name');

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, date, venue_id')
    .eq('organizer_id', organizer.id);

  const { data: people } = await supabase
    .from('people')
    .select('id, name')
    .eq('organizer_id', organizer.id);

  const personNameById = new Map((people ?? []).map((p) => [p.id, p.name]));

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

  const teams: RawTeam[] = (teamsRaw ?? [])
    .map((t) => ({
      id: t.id,
      tournamentId: t.tournament_id,
      player1PersonId: personIdByPlayerId.get(t.player_1_id) ?? '',
      player2PersonId: personIdByPlayerId.get(t.player_2_id) ?? '',
    }))
    .filter((t) => t.player1PersonId && t.player2PersonId);

  const leaderboardsByVenue = (venues ?? []).map((venue) => {
    const venueTournamentIds = new Set(
      (tournaments ?? []).filter((t) => t.venue_id === venue.id).map((t) => t.id)
    );

    const venueCompleteMatches: RawMatch[] = (matchesRaw ?? [])
      .filter(
        (m) =>
          venueTournamentIds.has(m.tournament_id) && m.team_b_id !== null && m.status === 'complete'
      )
      .map((m) => ({
        tournamentId: m.tournament_id,
        tournamentDate: tournamentDateById.get(m.tournament_id) ?? '',
        venueName: venue.name,
        teamAId: m.team_a_id!,
        teamBId: m.team_b_id!,
        scoreA: m.score_a ?? 0,
        scoreB: m.score_b ?? 0,
        status: 'complete' as const,
      }));

    const tournamentWinsByPersonId = new Map<string, number>();
    for (const tournamentId of venueTournamentIds) {
      const tournamentTeams = teams.filter((t) => t.tournamentId === tournamentId);
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
      if (standings.length === 0) continue;

      const winningTeam = tournamentTeams.find((t) => t.id === standings[0].teamId);
      if (!winningTeam) continue;

      for (const personId of [winningTeam.player1PersonId, winningTeam.player2PersonId]) {
        tournamentWinsByPersonId.set(personId, (tournamentWinsByPersonId.get(personId) ?? 0) + 1);
      }
    }

    const candidates = (people ?? [])
      .map((person) => {
        const records = buildPersonMatchRecords(person.id, venueCompleteMatches, teams);
        return {
          personId: person.id,
          matchWins: records.filter((r) => r.won).length,
          tournamentWins: tournamentWinsByPersonId.get(person.id) ?? 0,
          matchesPlayed: records.length,
        };
      })
      .filter((c) => c.matchesPlayed > 0);

    return {
      venueId: venue.id,
      venueName: venue.name,
      leaderboard: computeLocationLeaderboard(candidates),
    };
  });

  return (
    <OrganizerShell organizerName={organizer.name}>
      <h1 className="text-2xl font-extrabold text-slate-900 mb-6">Location Stats</h1>

      {leaderboardsByVenue.map(({ venueId, venueName, leaderboard }) => (
        <div key={venueId} className={`${cardClass} mb-6`}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">{venueName}</h2>
          {leaderboard.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {leaderboard.map((entry, i) => {
                const medal = ['🥇', '🥈', '🥉'][i];
                return (
                  <li
                    key={entry.personId}
                    className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0"
                  >
                    <Link
                      href={`/people/${entry.personId}`}
                      className={`font-semibold hover:underline ${i === 0 ? 'text-base text-slate-900' : 'text-slate-800'}`}
                    >
                      {medal && <span className="mr-1.5">{medal}</span>}
                      {personNameById.get(entry.personId) ?? 'Unknown'}
                    </Link>
                    <span className="text-slate-500">
                      {entry.tournamentWins} tournament{entry.tournamentWins === 1 ? '' : 's'} won ·{' '}
                      {entry.matchWins} match{entry.matchWins === 1 ? '' : 'es'} won
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-slate-400 text-sm">No matches played here yet.</p>
          )}
        </div>
      ))}
    </OrganizerShell>
  );
}
```

- [ ] **Step 2: Add the nav link**

In `apps/organizer-web/app/components/OrganizerShell.tsx`, change:

```typescript jsx
            <Link href="/people" className="text-sm font-semibold text-teal-50 hover:text-white">
              Player Profile
            </Link>
```

to:

```typescript jsx
            <Link href="/people" className="text-sm font-semibold text-teal-50 hover:text-white">
              Player Profile
            </Link>
            <Link href="/locations" className="text-sm font-semibold text-teal-50 hover:text-white">
              Locations
            </Link>
```

- [ ] **Step 3: Verify the build compiles**

```bash
cd apps/organizer-web && npm run build
```

Expected: build succeeds with no errors, and a new `/locations` route appears in the build output.

- [ ] **Step 4: Manual verification in browser**

Click "Locations" in the nav. Confirm both venues appear, each with a top-5 list (or "No matches played here yet." if a venue has no completed matches). Confirm the ranking makes sense given known match/tournament results at each venue (a player who's won a tournament there should generally rank above one who hasn't, all else being comparable), and that clicking a player's name navigates to their `/people/{id}` profile.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/app/locations/page.tsx apps/organizer-web/app/components/OrganizerShell.tsx
git commit -m "Add location leaderboard page and nav link"
```

---

### Task 3: Push and verify CI

**Files:** none (repo-level)

- [ ] **Step 1: Push to GitHub**

```bash
cd "C:\Users\ANKS\pickleball project"
git push
```

- [ ] **Step 2: Confirm CI passes**

Check the Actions tab on GitHub (or poll `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`) and confirm the latest run's `conclusion` is `success`.

- [ ] **Step 3: Full manual regression check**

Open `/locations` and manually recompute one venue's expected top player by hand from known match/tournament data (using the formula: `0.6 * (tournamentWins / maxTournamentWins) + 0.4 * (matchWins / maxMatchWins)`), and confirm the displayed order matches. Separately confirm the existing `/people` list and `/people/[id]` pages still work exactly as before — this feature only adds a new page and one new nav link, nothing else should have changed.
