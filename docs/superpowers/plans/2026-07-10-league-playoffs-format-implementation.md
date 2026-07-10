# League + Playoffs Tournament Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "League + Playoffs" as a selectable tournament format — a round-robin league stage feeding a top-4 knockout stage (semifinals, then a final) — reusing the existing round-robin generator and standings calculator wherever possible.

**Architecture:** A new `matches.stage` column (`'league' | 'semifinal' | 'final'`) distinguishes which stage a match belongs to. Two new pure TypeScript functions (`generateSemifinals`, `isTournamentComplete`) join the existing `lib/tournament/` functions. The Bracket, Scores, and Results pages become stage-aware for this format only; every other format's behavior is unchanged (their matches are all implicitly `stage: 'league'`, which the code treats the same as today).

**Tech Stack:** Same as prior work — Next.js (App Router, TypeScript), Supabase JS client, Vitest, Supabase CLI (`npx`, no Docker) for the migration.

## Global Constraints

- Maximum 8 teams (16 players) for League + Playoffs tournaments only — enforced at team-pairing time (manual pair and shuffle), not at roster/player-add time.
- Fewer than 4 teams at the end of the league stage: no semifinal/final are generated; league standings alone decide the champion.
- Semifinal seeding is always 1st-vs-4th and 2nd-vs-3rd, derived from league standings (wins, then point differential — the same tiebreaker `computeStandings` already implements). No manual reseeding.
- Playoff stage progression (Generate Semifinals, Generate Final) is an explicit organizer button click, matching the existing "Generate Bracket" pattern — never automatic.
- Every other existing format's behavior must be provably unchanged by this work (verified in Task 8's tests and Task 10's manual check).
- Design reference: [docs/superpowers/specs/2026-07-10-league-playoffs-format-design.md](../specs/2026-07-10-league-playoffs-format-design.md).

---

### Task 1: Database migration — `league_playoffs` format, `matches.stage` column

**Files:**
- Create: `supabase/migrations/<timestamp>_add_league_playoffs_format.sql`

**Interfaces:**
- Produces: `'league_playoffs'` as a valid `tournaments.format` value; `matches.stage` column (`text not null default 'league'`) — consumed by every later task.

- [ ] **Step 1: Confirm the existing format check constraint's name**

```bash
cd "C:\Users\ANKS\pickleball project"
SUPABASE_ACCESS_TOKEN=<your token> npx supabase migration new add_league_playoffs_format
```

Before writing the migration, confirm the constraint name added in the earlier `add_tournament_format` migration is `tournaments_format_check` (Postgres's default auto-generated name for the first check constraint on a column, `<table>_<column>_check`). If you have doubts, query it directly:

```bash
curl -s "https://cqhbouwhbnvyrmsqfzdt.supabase.co/rest/v1/rpc/pg_get_constraintdef" \
  -H "apikey: <service-role-key>" -H "Authorization: Bearer <service-role-key>"
```

(Or simpler: just run the migration in Step 3 — if the constraint name is wrong, `db push` will fail with a clear "constraint does not exist" error naming what to fix.)

- [ ] **Step 2: Fill in the migration**

```sql
-- supabase/migrations/<timestamp>_add_league_playoffs_format.sql

alter table public.tournaments drop constraint tournaments_format_check;
alter table public.tournaments add constraint tournaments_format_check check (format in (
  'round_robin',
  'popcorn',
  'gauntlet',
  'up_and_down_the_river',
  'claim_the_throne',
  'cream_of_the_crop',
  'double_header',
  'league_playoffs'
));

alter table public.matches add column stage text not null default 'league'
  check (stage in ('league', 'semifinal', 'final'));
```

- [ ] **Step 3: Push the migration**

```bash
SUPABASE_ACCESS_TOKEN=<your token> npx supabase db push
```

Expected: confirms the migration applied, no errors. If the constraint-drop fails, find the actual name via the Supabase dashboard's SQL editor (`select conname from pg_constraint where conrelid = 'public.tournaments'::regclass and contype = 'c';`), fix the migration file to use the real name, and re-run.

- [ ] **Step 4: Verify in the Supabase dashboard**

Confirm every existing `matches` row now has `stage = 'league'`, and that inserting a test row with `format = 'league_playoffs'` into `tournaments` succeeds (then delete the test row).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "Add league_playoffs format and matches.stage column"
```

---

### Task 2: Format option and shared types

**Files:**
- Modify: `apps/organizer-web/lib/tournament/formats.ts`
- Modify: `apps/organizer-web/lib/types.ts`

**Interfaces:**
- Produces: `'league_playoffs'` entry in `TOURNAMENT_FORMATS`; `CompletionCheckMatch` type — consumed by Task 4 (`isTournamentComplete`) and Task 8 (matches actions).

- [ ] **Step 1: Add the format option**

In `apps/organizer-web/lib/tournament/formats.ts`, add one entry to the `TOURNAMENT_FORMATS` array (after `'double_header'`):

```typescript
  { value: 'league_playoffs', label: 'League + Playoffs' },
```

The full array should read:

```typescript
export const TOURNAMENT_FORMATS = [
  { value: 'round_robin', label: 'Round Robin' },
  { value: 'popcorn', label: 'Popcorn' },
  { value: 'gauntlet', label: 'Gauntlet' },
  { value: 'up_and_down_the_river', label: 'Up and Down the River' },
  { value: 'claim_the_throne', label: 'Claim the Throne' },
  { value: 'cream_of_the_crop', label: 'Cream of the Crop' },
  { value: 'double_header', label: 'Double Header' },
  { value: 'league_playoffs', label: 'League + Playoffs' },
] as const;
```

- [ ] **Step 2: Add the shared type**

In `apps/organizer-web/lib/types.ts`, add:

```typescript
export type CompletionCheckMatch = {
  stage: 'league' | 'semifinal' | 'final';
  status: 'pending' | 'complete';
  teamBId: string | null;
};
```

- [ ] **Step 3: Verify the build compiles**

```bash
cd apps/organizer-web && npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/organizer-web/lib/tournament/formats.ts apps/organizer-web/lib/types.ts
git commit -m "Add League + Playoffs format option and CompletionCheckMatch type"
```

---

### Task 3: Semifinal pairing logic

**Files:**
- Create: `apps/organizer-web/lib/tournament/playoffs.ts`
- Test: `apps/organizer-web/lib/tournament/playoffs.test.ts`

**Interfaces:**
- Consumes: `StandingsRow` from `@/lib/types` (existing).
- Produces: `generateSemifinals(standings: StandingsRow[]): Array<{ teamAId: string; teamBId: string }>` — used by Task 6's `generateSemifinalMatches` action.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/organizer-web/lib/tournament/playoffs.test.ts
import { describe, it, expect } from 'vitest';
import { generateSemifinals } from './playoffs';
import type { StandingsRow } from '@/lib/types';

function row(teamId: string): StandingsRow {
  return { teamId, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
}

describe('generateSemifinals', () => {
  it('pairs 1st vs 4th and 2nd vs 3rd', () => {
    const standings = [row('a'), row('b'), row('c'), row('d')];
    const result = generateSemifinals(standings);
    expect(result).toEqual([
      { teamAId: 'a', teamBId: 'd' },
      { teamAId: 'b', teamBId: 'c' },
    ]);
  });

  it('only uses the top 4 when more are passed', () => {
    const standings = [row('a'), row('b'), row('c'), row('d'), row('e')];
    const result = generateSemifinals(standings);
    expect(result).toEqual([
      { teamAId: 'a', teamBId: 'd' },
      { teamAId: 'b', teamBId: 'c' },
    ]);
  });

  it('throws when fewer than 4 teams are passed', () => {
    const standings = [row('a'), row('b'), row('c')];
    expect(() => generateSemifinals(standings)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/organizer-web && npm test
```

Expected: FAIL with `Cannot find module './playoffs'`.

- [ ] **Step 3: Implement the pairing function**

```typescript
// apps/organizer-web/lib/tournament/playoffs.ts
import type { StandingsRow } from '@/lib/types';

export function generateSemifinals(
  standings: StandingsRow[]
): Array<{ teamAId: string; teamBId: string }> {
  if (standings.length < 4) {
    throw new Error('Need at least 4 teams in standings to generate semifinals');
  }

  const [first, second, third, fourth] = standings;

  return [
    { teamAId: first.teamId, teamBId: fourth.teamId },
    { teamAId: second.teamId, teamBId: third.teamId },
  ];
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/organizer-web && npm test
```

Expected: PASS, all 3 `generateSemifinals` tests green (28 total).

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/lib/tournament/playoffs.ts apps/organizer-web/lib/tournament/playoffs.test.ts
git commit -m "Add semifinal seeding logic (1v4, 2v3 from standings)"
```

---

### Task 4: Stage-aware completion detection

**Files:**
- Create: `apps/organizer-web/lib/tournament/completion.ts`
- Test: `apps/organizer-web/lib/tournament/completion.test.ts`

**Interfaces:**
- Consumes: `CompletionCheckMatch` from `@/lib/types` (Task 2).
- Produces: `isTournamentComplete(format: string, teamCount: number, matches: CompletionCheckMatch[]): boolean` — used by Task 8's `enterScore` action, replacing its current inline check.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/organizer-web/lib/tournament/completion.test.ts
import { describe, it, expect } from 'vitest';
import { isTournamentComplete } from './completion';
import type { CompletionCheckMatch } from '@/lib/types';

describe('isTournamentComplete', () => {
  it('returns false for a non-league_playoffs format with a pending match', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2' },
      { stage: 'league', status: 'pending', teamBId: 't3' },
    ];
    expect(isTournamentComplete('round_robin', 2, matches)).toBe(false);
  });

  it('returns true for a non-league_playoffs format once all real matches are complete', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2' },
      { stage: 'league', status: 'complete', teamBId: null },
    ];
    expect(isTournamentComplete('round_robin', 2, matches)).toBe(true);
  });

  it('treats league_playoffs with fewer than 4 teams like a normal single-stage format', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2' },
    ];
    expect(isTournamentComplete('league_playoffs', 3, matches)).toBe(true);
  });

  it('returns false for league_playoffs with 4+ teams when league is done but no final exists yet', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2' },
      { stage: 'league', status: 'complete', teamBId: 't4' },
      { stage: 'semifinal', status: 'complete', teamBId: 't5' },
    ];
    expect(isTournamentComplete('league_playoffs', 4, matches)).toBe(false);
  });

  it('returns true for league_playoffs with 4+ teams once the final match is complete', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2' },
      { stage: 'final', status: 'complete', teamBId: 't5' },
    ];
    expect(isTournamentComplete('league_playoffs', 4, matches)).toBe(true);
  });

  it('returns false for league_playoffs with 4+ teams when the final exists but is not complete', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'final', status: 'pending', teamBId: 't5' },
    ];
    expect(isTournamentComplete('league_playoffs', 4, matches)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/organizer-web && npm test
```

Expected: FAIL with `Cannot find module './completion'`.

- [ ] **Step 3: Implement the completion check**

```typescript
// apps/organizer-web/lib/tournament/completion.ts
import type { CompletionCheckMatch } from '@/lib/types';

export function isTournamentComplete(
  format: string,
  teamCount: number,
  matches: CompletionCheckMatch[]
): boolean {
  if (format === 'league_playoffs' && teamCount >= 4) {
    const finalMatch = matches.find((m) => m.stage === 'final');
    return Boolean(finalMatch && finalMatch.status === 'complete');
  }

  const realMatches = matches.filter((m) => m.teamBId !== null);
  return realMatches.length > 0 && realMatches.every((m) => m.status === 'complete');
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/organizer-web && npm test
```

Expected: PASS, all 6 `isTournamentComplete` tests green (34 total).

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/lib/tournament/completion.ts apps/organizer-web/lib/tournament/completion.test.ts
git commit -m "Add stage-aware tournament completion check"
```

---

### Task 5: Team cap enforcement (League + Playoffs only)

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/teams/actions.ts`
- Modify: `apps/organizer-web/app/tournaments/[id]/teams/page.tsx`

**Interfaces:**
- Consumes: `requireOrganizer()`, `shuffleIntoTeams` (existing).
- Produces: no new exports — `pairTeam` and `shuffleRemaining` now reject/limit team creation past 8 for `league_playoffs` tournaments.

- [ ] **Step 1: Replace the actions file**

Replace the full contents of `apps/organizer-web/app/tournaments/[id]/teams/actions.ts` with:

```typescript
// apps/organizer-web/app/tournaments/[id]/teams/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { shuffleIntoTeams } from '@/lib/tournament/shuffle';

const LEAGUE_PLAYOFFS_TEAM_CAP = 8;

export async function pairTeam(tournamentId: string, formData: FormData) {
  const { supabase } = await requireOrganizer();

  const player1Id = formData.get('player1Id') as string;
  const player2Id = formData.get('player2Id') as string;

  if (!player1Id || !player2Id || player1Id === player2Id) {
    throw new Error('Select two different players to pair');
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('format')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  if (tournament?.format === 'league_playoffs') {
    const { count, error: countError } = await supabase
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId);

    if (countError) {
      throw new Error(countError.message);
    }

    if ((count ?? 0) >= LEAGUE_PLAYOFFS_TEAM_CAP) {
      throw new Error('This format allows a maximum of 8 teams');
    }
  }

  const { error } = await supabase.from('teams').insert({
    tournament_id: tournamentId,
    player_1_id: player1Id,
    player_2_id: player2Id,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/teams`);
}

export async function shuffleRemaining(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id')
    .eq('tournament_id', tournamentId);

  if (playersError) {
    throw new Error(playersError.message);
  }

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('player_1_id, player_2_id')
    .eq('tournament_id', tournamentId);

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  const pairedPlayerIds = new Set(
    (teams ?? []).flatMap((t) => [t.player_1_id, t.player_2_id])
  );
  let unpairedIds = (players ?? [])
    .map((p) => p.id)
    .filter((id) => !pairedPlayerIds.has(id));

  if (unpairedIds.length < 2) {
    return;
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('format')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  if (tournament?.format === 'league_playoffs') {
    const existingTeamCount = (teams ?? []).length;
    const remainingSlots = LEAGUE_PLAYOFFS_TEAM_CAP - existingTeamCount;

    if (remainingSlots <= 0) {
      return;
    }

    unpairedIds = unpairedIds.slice(0, remainingSlots * 2);

    if (unpairedIds.length < 2) {
      return;
    }
  }

  const newTeams = shuffleIntoTeams(unpairedIds);

  const { error } = await supabase.from('teams').insert(
    newTeams.map((t) => ({
      tournament_id: tournamentId,
      player_1_id: t.player1Id,
      player_2_id: t.player2Id,
    }))
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/teams`);
}

export async function removeTeam(tournamentId: string, teamId: string) {
  const { supabase } = await requireOrganizer();

  const { error } = await supabase.from('teams').delete().eq('id', teamId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/teams`);
}
```

- [ ] **Step 2: Replace the page**

Replace the full contents of `apps/organizer-web/app/tournaments/[id]/teams/page.tsx` with:

```typescript jsx
// apps/organizer-web/app/tournaments/[id]/teams/page.tsx
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass, primaryButtonClass, accentButtonClass, pillClass } from '@/app/components/ui';
import { pairTeam, shuffleRemaining, removeTeam } from './actions';

const LEAGUE_PLAYOFFS_TEAM_CAP = 8;

export default async function TeamsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, organizer } = await requireOrganizer();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('format')
    .eq('id', id)
    .single();

  const isLeaguePlayoffs = tournament?.format === 'league_playoffs';

  const { data: players } = await supabase
    .from('players')
    .select('id, name')
    .eq('tournament_id', id)
    .order('created_at', { ascending: true });

  const { data: teams } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', id);

  const teamCount = (teams ?? []).length;
  const atCap = isLeaguePlayoffs && teamCount >= LEAGUE_PLAYOFFS_TEAM_CAP;

  const pairedPlayerIds = new Set(
    (teams ?? []).flatMap((t) => [t.player_1_id, t.player_2_id])
  );
  const unpairedPlayers = (players ?? []).filter((p) => !pairedPlayerIds.has(p.id));
  const playerById = new Map((players ?? []).map((p) => [p.id, p.name]));

  const pairTeamWithId = pairTeam.bind(null, id);
  const shuffleRemainingWithId = shuffleRemaining.bind(null, id);
  const selectClass =
    'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 flex-1';

  return (
    <OrganizerShell organizerName={organizer.name}>
      <TournamentNav tournamentId={id} current="teams" />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Pair Teams</h1>
        {isLeaguePlayoffs && (
          <span className="text-sm font-semibold text-teal-700 bg-teal-50 rounded-full px-3 py-1">
            {teamCount}/{LEAGUE_PLAYOFFS_TEAM_CAP} teams
          </span>
        )}
      </div>

      {atCap ? (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-6">
          8/8 teams — maximum reached for this format.
        </div>
      ) : (
        <>
          {unpairedPlayers.length >= 2 && (
            <div className={`${cardClass} mb-6 text-center`}>
              <p className="text-slate-600 mb-3">
                {unpairedPlayers.length} players unpaired. Shuffle them into random teams, or
                pair manually below.
              </p>
              <form action={shuffleRemainingWithId}>
                <button type="submit" className={accentButtonClass}>
                  Shuffle Remaining Players
                </button>
              </form>
            </div>
          )}

          <div className={`${cardClass} mb-6`}>
            <form action={pairTeamWithId} className="flex flex-col sm:flex-row gap-3">
              <select name="player1Id" required defaultValue="" className={selectClass}>
                <option value="" disabled>Player 1</option>
                {unpairedPlayers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select name="player2Id" required defaultValue="" className={selectClass}>
                <option value="" disabled>Player 2</option>
                {unpairedPlayers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button type="submit" className={primaryButtonClass}>
                Pair
              </button>
            </form>
          </div>
        </>
      )}

      <div className={`${cardClass} mb-6`}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">Teams ({(teams ?? []).length})</h2>
        <ul className="space-y-2">
          {(teams ?? []).map((t) => {
            const removeTeamForTeam = removeTeam.bind(null, id, t.id);
            return (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900"
              >
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  {playerById.get(t.player_1_id)} / {playerById.get(t.player_2_id)}
                </span>
                <form action={removeTeamForTeam}>
                  <button
                    type="submit"
                    className="text-xs font-semibold text-teal-700 hover:text-red-600 transition-colors"
                  >
                    Remove
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={cardClass}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">
          Unpaired players ({unpairedPlayers.length})
        </h2>
        <ul className="flex flex-wrap gap-2">
          {unpairedPlayers.map((p) => (
            <li key={p.id} className={`${pillClass} bg-slate-100 text-slate-700`}>
              {p.name}
            </li>
          ))}
        </ul>
      </div>
    </OrganizerShell>
  );
}
```

- [ ] **Step 3: Verify the build compiles**

```bash
cd apps/organizer-web && npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Manual verification in browser**

1. Create a tournament with format "League + Playoffs", add 18 players to its roster.
2. Go to Teams. Confirm the header shows "0/8 teams". Shuffle repeatedly (or pair manually) until 8 teams exist.
3. Confirm the page now shows "8/8 teams — maximum reached" instead of the pairing controls, and 2 players remain permanently unpaired.
4. Go to a **different**, non-League-Playoffs tournament's Teams page and confirm there is no team-count badge and no cap — pairing works exactly as before.

- [ ] **Step 5: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/teams"
git commit -m "Enforce 8-team cap for League + Playoffs tournaments"
```

---

### Task 6: Playoff generation actions

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`

**Interfaces:**
- Consumes: `generateRoundRobin` (existing), `generateSemifinals` from `@/lib/tournament/playoffs` (Task 3), `computeStandings` (existing), `MatchResult` from `@/lib/types` (existing).
- Produces: `generateSemifinalMatches(tournamentId: string)` and `generateFinalMatch(tournamentId: string)` — used by Task 7's Bracket page.

- [ ] **Step 1: Replace the actions file**

Replace the full contents of `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts` with:

```typescript
// apps/organizer-web/app/tournaments/[id]/bracket/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { generateRoundRobin } from '@/lib/tournament/roundRobin';
import { generateSemifinals } from '@/lib/tournament/playoffs';
import { computeStandings } from '@/lib/tournament/standings';
import type { MatchResult } from '@/lib/types';

export async function generateBracket(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id')
    .eq('tournament_id', tournamentId);

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  if (!teams || teams.length < 2) {
    throw new Error('Need at least 2 teams to generate a bracket');
  }

  const pairings = generateRoundRobin(teams.map((t) => t.id));

  const { error: matchesError } = await supabase.from('matches').insert(
    pairings.map((p) => ({
      tournament_id: tournamentId,
      round: p.round,
      stage: 'league' as const,
      team_a_id: p.teamAId,
      team_b_id: p.teamBId,
      status: 'pending' as const,
    }))
  );

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}

export async function generateSemifinalMatches(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: leagueMatches, error: matchesError } = await supabase
    .from('matches')
    .select('team_a_id, team_b_id, score_a, score_b, status')
    .eq('tournament_id', tournamentId)
    .eq('stage', 'league');

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const matchResults: MatchResult[] = (leagueMatches ?? []).map((m) => ({
    teamAId: m.team_a_id!,
    teamBId: m.team_b_id,
    scoreA: m.score_a,
    scoreB: m.score_b,
    status: m.status as 'pending' | 'complete',
  }));

  const standings = computeStandings(matchResults);
  const pairings = generateSemifinals(standings.slice(0, 4));

  const { error: insertError } = await supabase.from('matches').insert(
    pairings.map((p) => ({
      tournament_id: tournamentId,
      round: 1,
      stage: 'semifinal' as const,
      team_a_id: p.teamAId,
      team_b_id: p.teamBId,
      status: 'pending' as const,
    }))
  );

  if (insertError) {
    throw new Error(insertError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}

export async function generateFinalMatch(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: semifinalMatches, error: matchesError } = await supabase
    .from('matches')
    .select('team_a_id, team_b_id, score_a, score_b, status')
    .eq('tournament_id', tournamentId)
    .eq('stage', 'semifinal');

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  if (
    !semifinalMatches ||
    semifinalMatches.length !== 2 ||
    semifinalMatches.some((m) => m.status !== 'complete')
  ) {
    throw new Error('Both semifinal matches must be complete before generating the final');
  }

  const winners = semifinalMatches.map((m) =>
    (m.score_a ?? 0) > (m.score_b ?? 0) ? m.team_a_id! : m.team_b_id!
  );

  const { error: insertError } = await supabase.from('matches').insert({
    tournament_id: tournamentId,
    round: 1,
    stage: 'final' as const,
    team_a_id: winners[0],
    team_b_id: winners[1],
    status: 'pending' as const,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}
```

- [ ] **Step 2: Verify the build compiles**

```bash
cd apps/organizer-web && npm run build
```

Expected: build succeeds with no errors. (Full functional verification happens in Task 7, once the Bracket page can actually call these actions from the UI.)

- [ ] **Step 3: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/actions.ts"
git commit -m "Add semifinal and final generation actions"
```

---

### Task 7: Bracket page — multi-stage flow

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`

**Interfaces:**
- Consumes: `generateBracket`, `generateSemifinalMatches`, `generateFinalMatch` (Task 6); `computeStandings` (existing); `formatLabel` (Task 2).

- [ ] **Step 1: Replace the page**

Replace the full contents of `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx` with:

```typescript jsx
// apps/organizer-web/app/tournaments/[id]/bracket/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass, accentButtonClass, linkClass } from '@/app/components/ui';
import { formatLabel } from '@/lib/tournament/formats';
import { computeStandings } from '@/lib/tournament/standings';
import type { MatchResult } from '@/lib/types';
import { generateBracket, generateSemifinalMatches, generateFinalMatch } from './actions';

export default async function BracketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, organizer } = await requireOrganizer();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('format')
    .eq('id', id)
    .single();

  const format = tournament?.format ?? 'round_robin';
  const isRoundRobin = format === 'round_robin';
  const isLeaguePlayoffs = format === 'league_playoffs';
  const isSupported = isRoundRobin || isLeaguePlayoffs;

  const { data: teams } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', id);

  const { data: players } = await supabase
    .from('players')
    .select('id, name')
    .eq('tournament_id', id);

  const playerById = new Map((players ?? []).map((p) => [p.id, p.name]));
  const teamById = new Map(
    (teams ?? []).map((t) => [
      t.id,
      `${playerById.get(t.player_1_id)} / ${playerById.get(t.player_2_id)}`,
    ])
  );

  const { data: matches } = await supabase
    .from('matches')
    .select('id, round, stage, team_a_id, team_b_id, score_a, score_b, status')
    .eq('tournament_id', id)
    .order('round', { ascending: true });

  const teamCount = (teams ?? []).length;

  const leagueMatches = (matches ?? []).filter((m) => m.stage === 'league');
  const semifinalMatches = (matches ?? []).filter((m) => m.stage === 'semifinal');
  const finalMatches = (matches ?? []).filter((m) => m.stage === 'final');

  const hasLeagueMatches = leagueMatches.length > 0;
  const realLeagueMatches = leagueMatches.filter((m) => m.team_b_id !== null);
  const allLeagueComplete =
    realLeagueMatches.length > 0 && realLeagueMatches.every((m) => m.status === 'complete');
  const allSemifinalComplete =
    semifinalMatches.length === 2 && semifinalMatches.every((m) => m.status === 'complete');
  const hasFinalMatch = finalMatches.length > 0;

  const generateBracketWithId = generateBracket.bind(null, id);
  const generateSemifinalMatchesWithId = generateSemifinalMatches.bind(null, id);
  const generateFinalMatchWithId = generateFinalMatch.bind(null, id);

  const showGenerateSemifinals =
    isLeaguePlayoffs && allLeagueComplete && semifinalMatches.length === 0 && teamCount >= 4;
  const showGenerateFinal = isLeaguePlayoffs && allSemifinalComplete && !hasFinalMatch;

  const leagueStandings = isLeaguePlayoffs
    ? computeStandings(
        leagueMatches.map(
          (m): MatchResult => ({
            teamAId: m.team_a_id!,
            teamBId: m.team_b_id,
            scoreA: m.score_a,
            scoreB: m.score_b,
            status: m.status as 'pending' | 'complete',
          })
        )
      )
    : [];

  type MatchRow = NonNullable<typeof matches>[number];
  const roundsFor = (list: MatchRow[]) => {
    const rounds = new Map<number, MatchRow[]>();
    for (const m of list) {
      const round = rounds.get(m.round) ?? [];
      round.push(m);
      rounds.set(m.round, round);
    }
    return rounds;
  };

  const renderMatchList = (list: MatchRow[]) => (
    <ul className="space-y-2">
      {list.map((m) => (
        <li key={m.id} className="text-sm text-slate-800 flex items-center gap-2">
          <span className="font-semibold">{teamById.get(m.team_a_id!) ?? 'Bye'}</span>
          <span className="text-slate-400">vs</span>
          <span className="font-semibold">
            {m.team_b_id ? teamById.get(m.team_b_id) : 'BYE'}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <OrganizerShell organizerName={organizer.name}>
      <TournamentNav tournamentId={id} current="bracket" />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Bracket</h1>
        <span className="text-sm font-semibold text-teal-700 bg-teal-50 rounded-full px-3 py-1">
          {formatLabel(format)}
        </span>
      </div>

      {!isSupported && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-6">
          {formatLabel(format)} isn't available yet — bracket generation for this format is
          coming soon. Round Robin and League + Playoffs are the only formats that work today.
        </div>
      )}

      {isSupported && !hasLeagueMatches && teamCount < 2 && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-6">
          Need at least 2 teams to generate a bracket — you have {teamCount}. Go back and
          pair more teams first.
        </div>
      )}

      {isSupported && !hasLeagueMatches && teamCount >= 2 && (
        <form action={generateBracketWithId} className={`${cardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            {teamCount} teams ready. Generate a round-robin league schedule.
          </p>
          <button type="submit" className={accentButtonClass}>
            Generate League Bracket
          </button>
        </form>
      )}

      {hasLeagueMatches && (
        <div className="space-y-4 mb-6">
          {Array.from(roundsFor(leagueMatches).entries()).map(([round, roundMatches]) => (
            <div key={round} className={cardClass}>
              <h2 className="text-sm font-bold text-teal-700 uppercase tracking-wide mb-2">
                League — Round {round}
              </h2>
              {renderMatchList(roundMatches)}
            </div>
          ))}
        </div>
      )}

      {isLeaguePlayoffs && allLeagueComplete && teamCount < 4 && (
        <div className="rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-sm px-4 py-3 mb-6">
          Fewer than 4 teams — no playoff stage. League standings decide the champion.
        </div>
      )}

      {showGenerateSemifinals && (
        <form action={generateSemifinalMatchesWithId} className={`${cardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            League complete. Generate the semifinals from the top 4 teams.
          </p>
          <button type="submit" className={accentButtonClass}>
            Generate Semifinals
          </button>
        </form>
      )}

      {semifinalMatches.length > 0 && (
        <div className={`${cardClass} mb-6`}>
          <h2 className="text-sm font-bold text-teal-700 uppercase tracking-wide mb-2">
            Semifinals
          </h2>
          {renderMatchList(semifinalMatches)}
        </div>
      )}

      {showGenerateFinal && (
        <form action={generateFinalMatchWithId} className={`${cardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">Semifinals complete. Generate the final.</p>
          <button type="submit" className={accentButtonClass}>
            Generate Final
          </button>
        </form>
      )}

      {finalMatches.length > 0 && (
        <div className={`${cardClass} mb-6`}>
          <h2 className="text-sm font-bold text-teal-700 uppercase tracking-wide mb-2">Final</h2>
          {renderMatchList(finalMatches)}
        </div>
      )}

      {isLeaguePlayoffs && leagueStandings.length > 0 && (
        <div className={`${cardClass} mb-6 overflow-x-auto`}>
          <h2 className="text-sm font-bold text-teal-700 uppercase tracking-wide mb-2">
            League Standings
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="pb-2 font-semibold">Team</th>
                <th className="pb-2 font-semibold text-center">W</th>
                <th className="pb-2 font-semibold text-center">L</th>
              </tr>
            </thead>
            <tbody>
              {leagueStandings.map((s) => (
                <tr key={s.teamId} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 font-semibold text-slate-900">{teamById.get(s.teamId)}</td>
                  <td className="py-2 text-center text-teal-700 font-bold">{s.wins}</td>
                  <td className="py-2 text-center text-slate-500">{s.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasLeagueMatches && (
        <p className="mt-6 flex gap-4">
          <Link href={`/tournaments/${id}/matches`} className={linkClass}>
            Enter scores →
          </Link>
          <Link href={`/tournaments/${id}/standings`} className={linkClass}>
            View standings →
          </Link>
        </p>
      )}
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

Using the 8-team League + Playoffs tournament from Task 5:

1. Go to Bracket. Confirm "Generate League Bracket" appears; click it. Confirm 7 rounds of league matches appear (8 teams → C(8,2)=28 matches across 7 rounds), each round labeled "League — Round N".
2. Go to Scores, enter scores for all 28 league matches (any values, team A wins say half).
3. Return to Bracket. Confirm league standings now show, and "Generate Semifinals" appears. Click it. Confirm 2 semifinal matches appear, correctly seeded 1v4 and 2v3 against the standings just shown.
4. Go to Scores, enter both semifinal scores.
5. Return to Bracket. Confirm "Generate Final" appears. Click it. Confirm 1 final match appears between the two semifinal winners.
6. Go to Scores, enter the final's score. Return to `/tournaments` and confirm this tournament now appears under "Recently Completed".

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/page.tsx"
git commit -m "Add multi-stage bracket flow for League + Playoffs"
```

---

### Task 8: Score entry — stage-aware completion + grouped display

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/matches/actions.ts`
- Modify: `apps/organizer-web/app/tournaments/[id]/matches/page.tsx`

**Interfaces:**
- Consumes: `isTournamentComplete` from `@/lib/tournament/completion` (Task 4).

- [ ] **Step 1: Replace the actions file**

Replace the full contents of `apps/organizer-web/app/tournaments/[id]/matches/actions.ts` with:

```typescript
// apps/organizer-web/app/tournaments/[id]/matches/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { isTournamentComplete } from '@/lib/tournament/completion';

export async function enterScore(
  tournamentId: string,
  matchId: string,
  formData: FormData
) {
  const { supabase } = await requireOrganizer();

  const scoreA = Number(formData.get('scoreA'));
  const scoreB = Number(formData.get('scoreB'));

  const { error } = await supabase
    .from('matches')
    .update({ score_a: scoreA, score_b: scoreB, status: 'complete' })
    .eq('id', matchId);

  if (error) {
    throw new Error(error.message);
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('format')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  const { count: teamCount, error: teamCountError } = await supabase
    .from('teams')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);

  if (teamCountError) {
    throw new Error(teamCountError.message);
  }

  const { data: allMatches, error: matchesError } = await supabase
    .from('matches')
    .select('stage, status, team_b_id')
    .eq('tournament_id', tournamentId);

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const complete = isTournamentComplete(
    tournament?.format ?? 'round_robin',
    teamCount ?? 0,
    (allMatches ?? []).map((m) => ({
      stage: m.stage as 'league' | 'semifinal' | 'final',
      status: m.status as 'pending' | 'complete',
      teamBId: m.team_b_id,
    }))
  );

  if (complete) {
    const { error: completeError } = await supabase
      .from('tournaments')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', tournamentId)
      .is('completed_at', null);

    if (completeError) {
      throw new Error(completeError.message);
    }
  }

  revalidatePath(`/tournaments/${tournamentId}/matches`);
  revalidatePath(`/tournaments/${tournamentId}/standings`);
  revalidatePath(`/tournaments/${tournamentId}/bracket`);
  revalidatePath('/tournaments');
}
```

- [ ] **Step 2: Replace the page**

Replace the full contents of `apps/organizer-web/app/tournaments/[id]/matches/page.tsx` with:

```typescript jsx
// apps/organizer-web/app/tournaments/[id]/matches/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass, inputClass, primaryButtonClass, pillClass, linkClass } from '@/app/components/ui';
import { enterScore } from './actions';

const STAGE_LABELS: Record<string, string> = {
  league: 'League',
  semifinal: 'Semifinal',
  final: 'Final',
};

export default async function MatchesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, organizer } = await requireOrganizer();

  const { data: teams } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', id);

  const { data: players } = await supabase
    .from('players')
    .select('id, name')
    .eq('tournament_id', id);

  const playerById = new Map((players ?? []).map((p) => [p.id, p.name]));
  const teamById = new Map(
    (teams ?? []).map((t) => [
      t.id,
      `${playerById.get(t.player_1_id)} / ${playerById.get(t.player_2_id)}`,
    ])
  );

  const { data: matches } = await supabase
    .from('matches')
    .select('id, round, stage, team_a_id, team_b_id, score_a, score_b, status')
    .eq('tournament_id', id)
    .order('round', { ascending: true });

  const stages: Array<'league' | 'semifinal' | 'final'> = ['league', 'semifinal', 'final'];

  return (
    <OrganizerShell organizerName={organizer.name}>
      <TournamentNav tournamentId={id} current="matches" />
      <h1 className="text-2xl font-extrabold text-slate-900 mb-6">Enter Scores</h1>

      {stages.map((stage) => {
        const stageMatches = (matches ?? []).filter(
          (m) => m.stage === stage && m.team_b_id !== null
        );
        if (stageMatches.length === 0) return null;

        return (
          <div key={stage} className="mb-6">
            <h2 className="text-sm font-bold text-teal-700 uppercase tracking-wide mb-3">
              {STAGE_LABELS[stage]}
            </h2>
            <div className="space-y-3">
              {stageMatches.map((m) => {
                const enterScoreForMatch = enterScore.bind(null, id, m.id);
                const isComplete = m.status === 'complete';
                return (
                  <div key={m.id} className={cardClass}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-semibold text-slate-800">
                        {teamById.get(m.team_a_id!)}{' '}
                        <span className="text-slate-400">vs</span> {teamById.get(m.team_b_id!)}
                      </div>
                      <span
                        className={`${pillClass} ${
                          isComplete ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {m.status}
                      </span>
                    </div>
                    <form action={enterScoreForMatch} className="flex items-center gap-3">
                      <input
                        name="scoreA"
                        type="number"
                        defaultValue={m.score_a ?? ''}
                        placeholder="Team A"
                        required
                        className={`${inputClass} w-24`}
                      />
                      <span className="text-slate-400 font-bold">–</span>
                      <input
                        name="scoreB"
                        type="number"
                        defaultValue={m.score_b ?? ''}
                        placeholder="Team B"
                        required
                        className={`${inputClass} w-24`}
                      />
                      <button type="submit" className={primaryButtonClass}>
                        Save
                      </button>
                    </form>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="mt-6">
        <Link href={`/tournaments/${id}/standings`} className={linkClass}>
          View standings →
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

Expected: build succeeds with no errors.

- [ ] **Step 4: Manual verification — confirm existing formats are unaffected**

Go to the Scores page of an existing **Round Robin** tournament (not League + Playoffs). Confirm it still shows a single "League" section header above the (unchanged) match list, scoring still works, and the tournament still auto-completes once all matches are scored — i.e., behavior is identical to before except for the new section header.

- [ ] **Step 5: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/matches"
git commit -m "Group score entry by stage; use stage-aware completion check"
```

---

### Task 9: Results page — multi-stage + champion banner

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/results/page.tsx`

**Interfaces:**
- Consumes: `formatLabel` (Task 2), `computeStandings` (existing).

- [ ] **Step 1: Replace the page**

Replace the full contents of `apps/organizer-web/app/tournaments/[id]/results/page.tsx` with:

```typescript jsx
// apps/organizer-web/app/tournaments/[id]/results/page.tsx
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { computeStandings } from '@/lib/tournament/standings';
import { formatLabel } from '@/lib/tournament/formats';
import type { MatchResult } from '@/lib/types';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass } from '@/app/components/ui';

const STAGE_LABELS: Record<string, string> = {
  league: 'League',
  semifinal: 'Semifinal',
  final: 'Final',
};

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, organizer } = await requireOrganizer();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name, date, format, completed_at')
    .eq('id', id)
    .eq('organizer_id', organizer.id)
    .single();

  if (!tournament) {
    return (
      <OrganizerShell organizerName={organizer.name}>
        <p className="text-slate-500">Tournament not found.</p>
      </OrganizerShell>
    );
  }

  const { data: teams } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', id);

  const { data: players } = await supabase
    .from('players')
    .select('id, name')
    .eq('tournament_id', id);

  const { data: matches } = await supabase
    .from('matches')
    .select('id, round, stage, team_a_id, team_b_id, score_a, score_b, status')
    .eq('tournament_id', id)
    .order('round', { ascending: true });

  const playerById = new Map((players ?? []).map((p) => [p.id, p.name]));
  const teamById = new Map(
    (teams ?? []).map((t) => [
      t.id,
      `${playerById.get(t.player_1_id)} / ${playerById.get(t.player_2_id)}`,
    ])
  );

  const leagueMatches = (matches ?? []).filter((m) => m.stage === 'league');
  const finalMatches = (matches ?? []).filter((m) => m.stage === 'final');

  const leagueMatchResults: MatchResult[] = leagueMatches.map((m) => ({
    teamAId: m.team_a_id!,
    teamBId: m.team_b_id,
    scoreA: m.score_a,
    scoreB: m.score_b,
    status: m.status as 'pending' | 'complete',
  }));

  const standings = computeStandings(leagueMatchResults);

  const isLeaguePlayoffs = tournament.format === 'league_playoffs';
  const finalMatch = finalMatches[0];
  const championTeamId = finalMatch
    ? (finalMatch.score_a ?? 0) > (finalMatch.score_b ?? 0)
      ? finalMatch.team_a_id
      : finalMatch.team_b_id
    : standings[0]?.teamId;

  const renderMatch = (m: NonNullable<typeof matches>[number]) => {
    const teamAName = teamById.get(m.team_a_id!) ?? 'Unknown';
    const teamBName = teamById.get(m.team_b_id!) ?? 'Unknown';
    const isComplete = m.status === 'complete';
    const teamAWon = isComplete && (m.score_a ?? 0) > (m.score_b ?? 0);
    const teamBWon = isComplete && (m.score_b ?? 0) > (m.score_a ?? 0);

    return (
      <li key={m.id} className="text-sm border-b border-slate-100 last:border-0 pb-2">
        {m.stage === 'league' && (
          <div className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-1">
            Round {m.round}
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className={teamAWon ? 'font-extrabold text-slate-900' : 'font-medium text-slate-600'}>
            {teamAWon && <span className="mr-1">🏆</span>}
            {teamAName}
          </span>
          <span className="text-slate-400 text-xs">vs</span>
          <span className={teamBWon ? 'font-extrabold text-slate-900' : 'font-medium text-slate-600'}>
            {teamBWon && <span className="mr-1">🏆</span>}
            {teamBName}
          </span>
        </div>
        {isComplete ? (
          <div className="text-center font-bold text-teal-700 mt-1">
            {m.score_a}-{m.score_b}
          </div>
        ) : (
          <div className="text-center text-slate-400 text-xs mt-1">Not yet played</div>
        )}
      </li>
    );
  };

  return (
    <OrganizerShell organizerName={organizer.name}>
      <h1 className="text-2xl font-extrabold text-slate-900 mb-1">{tournament.name}</h1>
      <p className="text-sm text-slate-500 mb-6">
        {tournament.date} · {formatLabel(tournament.format)}
        {tournament.completed_at && (
          <> · Completed {new Date(tournament.completed_at).toLocaleDateString()}</>
        )}
      </p>

      {championTeamId && (
        <div
          className={`${cardClass} mb-6 text-center bg-gradient-to-br from-amber-50 to-lime-50 border-amber-200`}
        >
          <div className="text-3xl mb-1">🏆</div>
          <div className="text-xs font-bold text-amber-700 uppercase tracking-wide">Champion</div>
          <div className="text-xl font-extrabold text-slate-900">
            {teamById.get(championTeamId)}
          </div>
        </div>
      )}

      <div className={`${cardClass} mb-6 overflow-x-auto`}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">
          {isLeaguePlayoffs ? 'League Standings' : 'Final Standings'}
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="pb-2 font-semibold">Team</th>
              <th className="pb-2 font-semibold text-center">W</th>
              <th className="pb-2 font-semibold text-center">L</th>
              <th className="pb-2 font-semibold text-center">Point Diff</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => {
              const medal = ['🥇', '🥈', '🥉'][i];
              return (
                <tr key={s.teamId} className="border-b border-slate-100 last:border-0">
                  <td className={`py-2 ${i === 0 ? 'font-extrabold text-base' : 'font-semibold'} text-slate-900`}>
                    {medal && <span className="mr-1.5">{medal}</span>}
                    {teamById.get(s.teamId)}
                  </td>
                  <td className="py-2 text-center text-teal-700 font-extrabold">{s.wins}</td>
                  <td className="py-2 text-center text-slate-400 font-semibold">{s.losses}</td>
                  <td className="py-2 text-center font-bold">
                    {s.pointsFor - s.pointsAgainst > 0 ? '+' : ''}
                    {s.pointsFor - s.pointsAgainst}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isLeaguePlayoffs ? (
        (['league', 'semifinal', 'final'] as const).map((stage) => {
          const stageMatches = (matches ?? []).filter(
            (m) => m.stage === stage && m.team_b_id !== null
          );
          if (stageMatches.length === 0) return null;
          return (
            <div key={stage} className={`${cardClass} mb-6`}>
              <h2 className="text-lg font-bold text-slate-900 mb-3">{STAGE_LABELS[stage]}</h2>
              <ul className="space-y-2">{stageMatches.map(renderMatch)}</ul>
            </div>
          );
        })
      ) : (
        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">All Matches</h2>
          <ul className="space-y-2">
            {(matches ?? []).filter((m) => m.team_b_id !== null).map(renderMatch)}
          </ul>
        </div>
      )}
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

1. Open the Results page for the completed League + Playoffs tournament from Task 7. Confirm: a "Champion" banner shows the final's winning team; "League Standings" table shows all league results; separate "League", "Semifinal", and "Final" sections below list every match with the winner marked 🏆 and the correct score.
2. Open the Results page for an existing completed **Round Robin** tournament. Confirm it looks exactly as before (no champion banner — wait, check this: the `championTeamId` fallback is `standings[0]?.teamId` when there's no final match, which means a Round Robin tournament's Results page will now ALSO show a Champion banner using its standings leader. Confirm this is a reasonable and intended enhancement — it's a strict addition (banner + label), nothing existing is removed or changed) and shows "Final Standings" (not "League Standings") plus a single "All Matches" section, matching the pre-existing behavior.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/results/page.tsx"
git commit -m "Add multi-stage results view with champion banner"
```

---

### Task 10: Push and verify CI

**Files:** none (repo-level)

- [ ] **Step 1: Push to GitHub**

```bash
cd "C:\Users\ANKS\pickleball project"
git push
```

- [ ] **Step 2: Confirm CI passes**

Check the Actions tab on GitHub (or poll `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`) and confirm the latest run's `conclusion` is `success`.

- [ ] **Step 3: Full manual regression check**

Run through one complete League + Playoffs tournament end-to-end in the browser (roster → team cap → league bracket → semifinals → final → completion → results), and separately confirm one existing Round Robin tournament still works unchanged (bracket, scores, standings, results, auto-completion, public link) — this is the final confirmation that nothing else in the app regressed.
