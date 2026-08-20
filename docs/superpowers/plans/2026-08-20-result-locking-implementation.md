# Result Locking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scores stay freely editable while a tournament is in progress but team reassignment is unavailable; once a tournament is complete, everything locks by default with an explicit "Unlock Editing" option for corrections.

**Architecture:** A new `tournaments.results_unlocked_at` column, two pure helper functions (`canEditScore`/`canEditTeams`), server-side guards in `enterScore` and `updateMatchTeams`, two new lock/unlock actions, and UI gating on the Bracket and Matches pages.

**Tech Stack:** Next.js App Router Server Actions, Supabase Postgres, Vitest.

## Global Constraints

- Applies to every tournament format.
- `canEditScore(completedAt, resultsUnlockedAt)`: editable while not complete, OR complete-and-unlocked.
- `canEditTeams(completedAt, resultsUnlockedAt)`: editable only when complete AND unlocked — never while in progress.
- Both `enterScore` and `updateMatchTeams` enforce their respective helper server-side, before making any change — the authoritative check, not just a UI hide.
- UI hides (not just disables) controls that aren't currently allowed.

---

### Task 1: Migration — add `results_unlocked_at` to `tournaments`

**Files:**
- Create: `supabase/migrations/20260820190000_add_tournament_results_unlocked_at.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260820190000_add_tournament_results_unlocked_at.sql`:

```sql
alter table public.tournaments add column results_unlocked_at timestamptz;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260820190000_add_tournament_results_unlocked_at.sql
git commit -m "feat: add results_unlocked_at migration"
```

Note: not applied to the live database in this task — that happens in Task 7.

---

### Task 2: `canEditScore`/`canEditTeams` pure helpers (TDD)

**Files:**
- Modify: `apps/organizer-web/lib/tournament/completion.ts`
- Modify: `apps/organizer-web/lib/tournament/completion.test.ts`

**Interfaces:**
- Produces: `canEditScore(completedAt: string | null, resultsUnlockedAt: string | null): boolean`,
  `canEditTeams(completedAt: string | null, resultsUnlockedAt: string | null): boolean` — both
  consumed by Tasks 3-6.

- [ ] **Step 1: Write the failing tests**

At the end of `apps/organizer-web/lib/tournament/completion.test.ts`, add:

```typescript
describe('canEditScore', () => {
  it('is editable when the tournament is not complete', () => {
    expect(canEditScore(null, null)).toBe(true);
  });

  it('is editable when complete but not yet unlocked', () => {
    expect(canEditScore('2026-08-20T10:00:00.000Z', null)).toBe(false);
  });

  it('is editable when complete and unlocked', () => {
    expect(canEditScore('2026-08-20T10:00:00.000Z', '2026-08-20T11:00:00.000Z')).toBe(true);
  });
});

describe('canEditTeams', () => {
  it('is not editable when the tournament is not complete', () => {
    expect(canEditTeams(null, null)).toBe(false);
  });

  it('is not editable when complete but not unlocked', () => {
    expect(canEditTeams('2026-08-20T10:00:00.000Z', null)).toBe(false);
  });

  it('is editable when complete and unlocked', () => {
    expect(canEditTeams('2026-08-20T10:00:00.000Z', '2026-08-20T11:00:00.000Z')).toBe(true);
  });
});
```

Update the import line at the top of the file:

Find:

```typescript
import { isTournamentComplete } from './completion';
```

Replace with:

```typescript
import { isTournamentComplete, canEditScore, canEditTeams } from './completion';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/organizer-web && npx vitest run lib/tournament/completion.test.ts`
Expected: FAIL — `canEditScore`/`canEditTeams` are not exported yet.

- [ ] **Step 3: Write the implementation**

At the end of `apps/organizer-web/lib/tournament/completion.ts`, add:

```typescript
export function canEditScore(
  completedAt: string | null,
  resultsUnlockedAt: string | null
): boolean {
  return completedAt === null || resultsUnlockedAt !== null;
}

export function canEditTeams(
  completedAt: string | null,
  resultsUnlockedAt: string | null
): boolean {
  return completedAt !== null && resultsUnlockedAt !== null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/organizer-web && npx vitest run lib/tournament/completion.test.ts`
Expected: PASS — all tests in this file passing.

- [ ] **Step 5: Run the full suite**

Run: `cd apps/organizer-web && npm test`
Expected: all tests pass (156 pre-existing + 6 new = 162).

- [ ] **Step 6: Commit**

```bash
git add apps/organizer-web/lib/tournament/completion.ts apps/organizer-web/lib/tournament/completion.test.ts
git commit -m "feat: add canEditScore and canEditTeams helpers"
```

---

### Task 3: Guard `enterScore` against locked scores

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/matches/actions.ts`

**Interfaces:**
- Consumes: `canEditScore` (Task 2).

- [ ] **Step 1: Replace the entire `enterScore` function**

In `apps/organizer-web/app/tournaments/[id]/matches/actions.ts`, find the entire function:

```typescript
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
    .select(
      'format, gauntlet_rounds, claim_the_throne_rounds, up_and_down_the_river_rounds, league_playoffs_rounds'
    )
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
    .select('stage, status, team_b_id, round')
    .eq('tournament_id', tournamentId);

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const targetRounds =
    tournament?.format === 'gauntlet'
      ? (tournament?.gauntlet_rounds ?? 5)
      : tournament?.format === 'claim_the_throne'
        ? (tournament?.claim_the_throne_rounds ?? 5)
        : tournament?.format === 'up_and_down_the_river'
          ? (tournament?.up_and_down_the_river_rounds ?? 5)
          : tournament?.format === 'league_playoffs'
            ? (tournament?.league_playoffs_rounds ??
                ((teamCount ?? 0) % 2 === 0 ? (teamCount ?? 0) - 1 : (teamCount ?? 0)))
            : undefined;

  const complete = isTournamentComplete(
    tournament?.format ?? 'round_robin',
    teamCount ?? 0,
    (allMatches ?? []).map((m) => ({
      stage: m.stage as 'league' | 'semifinal' | 'final',
      status: m.status as 'pending' | 'complete',
      teamBId: m.team_b_id,
      round: m.round,
    })),
    targetRounds
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

Replace it with:

```typescript
export async function enterScore(
  tournamentId: string,
  matchId: string,
  formData: FormData
) {
  const { supabase } = await requireOrganizer();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select(
      'format, gauntlet_rounds, claim_the_throne_rounds, up_and_down_the_river_rounds, league_playoffs_rounds, completed_at, results_unlocked_at'
    )
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  if (!canEditScore(tournament?.completed_at ?? null, tournament?.results_unlocked_at ?? null)) {
    throw new Error('Scores are locked — unlock editing first to make a change.');
  }

  const scoreA = Number(formData.get('scoreA'));
  const scoreB = Number(formData.get('scoreB'));

  const { error } = await supabase
    .from('matches')
    .update({ score_a: scoreA, score_b: scoreB, status: 'complete' })
    .eq('id', matchId);

  if (error) {
    throw new Error(error.message);
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
    .select('stage, status, team_b_id, round')
    .eq('tournament_id', tournamentId);

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const targetRounds =
    tournament?.format === 'gauntlet'
      ? (tournament?.gauntlet_rounds ?? 5)
      : tournament?.format === 'claim_the_throne'
        ? (tournament?.claim_the_throne_rounds ?? 5)
        : tournament?.format === 'up_and_down_the_river'
          ? (tournament?.up_and_down_the_river_rounds ?? 5)
          : tournament?.format === 'league_playoffs'
            ? (tournament?.league_playoffs_rounds ??
                ((teamCount ?? 0) % 2 === 0 ? (teamCount ?? 0) - 1 : (teamCount ?? 0)))
            : undefined;

  const complete = isTournamentComplete(
    tournament?.format ?? 'round_robin',
    teamCount ?? 0,
    (allMatches ?? []).map((m) => ({
      stage: m.stage as 'league' | 'semifinal' | 'final',
      status: m.status as 'pending' | 'complete',
      teamBId: m.team_b_id,
      round: m.round,
    })),
    targetRounds
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

The only substantive change: the tournament fetch (widened to also select
`completed_at, results_unlocked_at`) now happens FIRST, with a
`canEditScore` guard immediately after it and before the score update —
so a locked tournament's score update never reaches the database. This
also removes a redundant second round-trip that would otherwise be
needed to check lock state separately, by widening the SAME query the
function already made for `targetRounds` computation.

- [ ] **Step 2: Update the import line**

Find:

```typescript
import { isTournamentComplete } from '@/lib/tournament/completion';
```

Replace with:

```typescript
import { isTournamentComplete, canEditScore } from '@/lib/tournament/completion';
```

- [ ] **Step 3: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 162 tests pass
(this task adds no new pure-function logic beyond Task 2's, which is
already covered).

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/matches/actions.ts"
git commit -m "feat: guard enterScore against locked results"
```

---

### Task 4: Guard `updateMatchTeams` and add lock/unlock actions

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`

**Interfaces:**
- Consumes: `canEditTeams` (Task 2).
- Produces: `unlockTournamentResults(tournamentId: string): Promise<void>`,
  `lockTournamentResults(tournamentId: string): Promise<void>` — both
  consumed by Task 5's page wiring.

- [ ] **Step 1: Update the import line**

In `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`, find:

```typescript
import { computeStandings } from '@/lib/tournament/standings';
```

Replace with:

```typescript
import { computeStandings } from '@/lib/tournament/standings';
import { canEditTeams } from '@/lib/tournament/completion';
```

- [ ] **Step 2: Guard `updateMatchTeams`**

Find:

```typescript
export async function updateMatchTeams(
  tournamentId: string,
  matchId: string,
  formData: FormData
) {
  const { supabase } = await requireOrganizer();
  const teamAId = formData.get('teamAId');
  const teamBId = formData.get('teamBId');
```

Replace with:

```typescript
export async function updateMatchTeams(
  tournamentId: string,
  matchId: string,
  formData: FormData
) {
  const { supabase } = await requireOrganizer();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('completed_at, results_unlocked_at')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  if (!canEditTeams(tournament?.completed_at ?? null, tournament?.results_unlocked_at ?? null)) {
    throw new Error(
      'Team changes are only allowed once the tournament is complete and editing is unlocked.'
    );
  }

  const teamAId = formData.get('teamAId');
  const teamBId = formData.get('teamBId');
```

- [ ] **Step 3: Add the two new actions**

At the end of `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`
(after the closing `}` of `updateMatchTeams`), add:

```typescript

export async function unlockTournamentResults(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('completed_at')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  if (!tournament?.completed_at) {
    throw new Error('Editing can only be unlocked once the tournament is complete');
  }

  const { error } = await supabase
    .from('tournaments')
    .update({ results_unlocked_at: new Date().toISOString() })
    .eq('id', tournamentId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
  revalidatePath(`/tournaments/${tournamentId}/matches`);
}

export async function lockTournamentResults(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { error } = await supabase
    .from('tournaments')
    .update({ results_unlocked_at: null })
    .eq('id', tournamentId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
  revalidatePath(`/tournaments/${tournamentId}/matches`);
}
```

- [ ] **Step 4: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 162 tests pass.

- [ ] **Step 5: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/actions.ts"
git commit -m "feat: guard updateMatchTeams and add lock/unlock actions"
```

---

### Task 5: Wire locking into the Bracket page

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`

**Interfaces:**
- Consumes: `canEditScore`, `canEditTeams` (Task 2); `unlockTournamentResults`,
  `lockTournamentResults` (Task 4).

- [ ] **Step 1: Widen the imports**

Find:

```tsx
import { cardClass, accentButtonClass, linkClass, inputClass, primaryButtonClass } from '@/app/components/ui';
```

Replace with:

```tsx
import { cardClass, accentButtonClass, linkClass, inputClass, primaryButtonClass, outlineButtonClass } from '@/app/components/ui';
```

Find:

```tsx
import { computeStandings } from '@/lib/tournament/standings';
```

Replace with:

```tsx
import { computeStandings } from '@/lib/tournament/standings';
import { canEditScore, canEditTeams } from '@/lib/tournament/completion';
```

Find:

```tsx
import { generateBracket, generatePopcornBracket, advanceGauntletRound, advanceClaimTheThroneRound, advanceUpAndDownRiverRound, generateLeaguePlayoffsBracket, regenerateLeaguePlayoffsBracket, generateSemifinalMatches, generateFinalMatch, updateMatchTeams } from './actions';
```

Replace with:

```tsx
import { generateBracket, generatePopcornBracket, advanceGauntletRound, advanceClaimTheThroneRound, advanceUpAndDownRiverRound, generateLeaguePlayoffsBracket, regenerateLeaguePlayoffsBracket, generateSemifinalMatches, generateFinalMatch, updateMatchTeams, unlockTournamentResults, lockTournamentResults } from './actions';
```

- [ ] **Step 2: Widen the tournament query**

Find:

```tsx
  const { data: tournament } = await supabase
    .from('tournaments')
    .select(
      'name, date, timeslot, format, popcorn_rounds, gauntlet_rounds, claim_the_throne_rounds, up_and_down_the_river_rounds, league_playoffs_rounds, venues(name)'
    )
    .eq('id', id)
    .single();
```

Replace with:

```tsx
  const { data: tournament } = await supabase
    .from('tournaments')
    .select(
      'name, date, timeslot, format, popcorn_rounds, gauntlet_rounds, claim_the_throne_rounds, up_and_down_the_river_rounds, league_playoffs_rounds, completed_at, results_unlocked_at, venues(name)'
    )
    .eq('id', id)
    .single();
```

- [ ] **Step 3: Bind the new actions and compute the edit flags**

Find:

```tsx
  const generateSemifinalMatchesWithId = generateSemifinalMatches.bind(null, id);
  const generateFinalMatchWithId = generateFinalMatch.bind(null, id);
```

Replace with:

```tsx
  const generateSemifinalMatchesWithId = generateSemifinalMatches.bind(null, id);
  const generateFinalMatchWithId = generateFinalMatch.bind(null, id);
  const unlockTournamentResultsWithId = unlockTournamentResults.bind(null, id);
  const lockTournamentResultsWithId = lockTournamentResults.bind(null, id);

  const canEditScoreValue = canEditScore(tournament?.completed_at ?? null, tournament?.results_unlocked_at ?? null);
  const canEditTeamsValue = canEditTeams(tournament?.completed_at ?? null, tournament?.results_unlocked_at ?? null);
```

- [ ] **Step 4: Add the Unlock/Lock Editing button**

Find:

```tsx
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Bracket</h1>
        <span className="text-sm font-semibold text-teal-700 bg-teal-50 rounded-full px-3 py-1">
          {formatLabel(format)}
        </span>
      </div>
```

Replace with:

```tsx
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Bracket</h1>
        <span className="text-sm font-semibold text-teal-700 bg-teal-50 rounded-full px-3 py-1">
          {formatLabel(format)}
        </span>
      </div>

      {tournament?.completed_at && (
        <form
          action={canEditTeamsValue ? lockTournamentResultsWithId : unlockTournamentResultsWithId}
          className="mb-6"
        >
          <button type="submit" className={outlineButtonClass}>
            {canEditTeamsValue ? '🔒 Lock Editing' : '🔓 Unlock Editing'}
          </button>
        </form>
      )}
```

- [ ] **Step 5: Gate the score form and team-reassignment form inside `renderMatchList`**

Find:

```tsx
              <form action={enterScoreForMatch} className="flex items-center gap-3 mt-2 pl-1">
                <input
                  name="scoreA"
                  type="number"
                  defaultValue={m.score_a ?? ''}
                  placeholder="Team A"
                  required
                  className={`${inputClass} w-20`}
                />
                <span className="text-slate-400 font-bold">–</span>
                <input
                  name="scoreB"
                  type="number"
                  defaultValue={m.score_b ?? ''}
                  placeholder="Team B"
                  required
                  className={`${inputClass} w-20`}
                />
                <SaveButton className={primaryButtonClass} pendingLabel="Saving…">
                  Save
                </SaveButton>
              </form>
              <div className="mt-3 pl-1">
                <p className="text-xs text-slate-400 mb-2">
                  Standings recalculate automatically when you change a match&apos;s teams. Already-generated
                  semifinals, finals, and later rounds do <strong>not</strong> update — and if this tournament
                  has no final match, the champion shown elsewhere can change as a result.
                </p>
                <form action={updateMatchTeamsForMatch} className="flex items-center gap-3">
                  <select name="teamAId" defaultValue={m.team_a_id ?? ''} className={inputClass}>
                    {(teams ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {teamById.get(t.id)}
                      </option>
                    ))}
                  </select>
                  <span className="text-slate-400 font-bold">vs</span>
                  <select name="teamBId" defaultValue={m.team_b_id ?? ''} className={inputClass}>
                    {(teams ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {teamById.get(t.id)}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className={primaryButtonClass}>
                    Save Teams
                  </button>
                </form>
              </div>
```

Replace with:

```tsx
              {canEditScoreValue ? (
                <form action={enterScoreForMatch} className="flex items-center gap-3 mt-2 pl-1">
                  <input
                    name="scoreA"
                    type="number"
                    defaultValue={m.score_a ?? ''}
                    placeholder="Team A"
                    required
                    className={`${inputClass} w-20`}
                  />
                  <span className="text-slate-400 font-bold">–</span>
                  <input
                    name="scoreB"
                    type="number"
                    defaultValue={m.score_b ?? ''}
                    placeholder="Team B"
                    required
                    className={`${inputClass} w-20`}
                  />
                  <SaveButton className={primaryButtonClass} pendingLabel="Saving…">
                    Save
                  </SaveButton>
                </form>
              ) : (
                <p className="text-sm font-semibold text-slate-700 mt-2 pl-1">
                  Final: {m.score_a}-{m.score_b}
                </p>
              )}
              {canEditTeamsValue && (
                <div className="mt-3 pl-1">
                  <p className="text-xs text-slate-400 mb-2">
                    Standings recalculate automatically when you change a match&apos;s teams. Already-generated
                    semifinals, finals, and later rounds do <strong>not</strong> update — and if this tournament
                    has no final match, the champion shown elsewhere can change as a result.
                  </p>
                  <form action={updateMatchTeamsForMatch} className="flex items-center gap-3">
                    <select name="teamAId" defaultValue={m.team_a_id ?? ''} className={inputClass}>
                      {(teams ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {teamById.get(t.id)}
                        </option>
                      ))}
                    </select>
                    <span className="text-slate-400 font-bold">vs</span>
                    <select name="teamBId" defaultValue={m.team_b_id ?? ''} className={inputClass}>
                      {(teams ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {teamById.get(t.id)}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className={primaryButtonClass}>
                      Save Teams
                    </button>
                  </form>
                </div>
              )}
```

- [ ] **Step 6: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 162 tests pass.

- [ ] **Step 7: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/page.tsx"
git commit -m "feat: gate Bracket score/team editing on result locking"
```

---

### Task 6: Wire locking into the Matches page

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/matches/page.tsx`

**Interfaces:**
- Consumes: `canEditScore` (Task 2).

- [ ] **Step 1: Add the import**

Find:

```tsx
import { enterScore } from './actions';
import SaveButton from '@/app/components/SaveButton';
```

Replace with:

```tsx
import { enterScore } from './actions';
import SaveButton from '@/app/components/SaveButton';
import { canEditScore } from '@/lib/tournament/completion';
```

- [ ] **Step 2: Fetch the tournament's lock state**

Find:

```tsx
  const { id } = await params;
  const { supabase, organizer } = await requireOrganizer();

  const { data: teams } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', id);
```

Replace with:

```tsx
  const { id } = await params;
  const { supabase, organizer } = await requireOrganizer();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('completed_at, results_unlocked_at')
    .eq('id', id)
    .single();

  const canEditScoreValue = canEditScore(
    tournament?.completed_at ?? null,
    tournament?.results_unlocked_at ?? null
  );

  const { data: teams } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', id);
```

- [ ] **Step 3: Gate the score-entry form**

Find:

```tsx
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
                      <SaveButton className={primaryButtonClass} pendingLabel="Saving…">
                        Save
                      </SaveButton>
                    </form>
```

Replace with:

```tsx
                    {canEditScoreValue ? (
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
                        <SaveButton className={primaryButtonClass} pendingLabel="Saving…">
                          Save
                        </SaveButton>
                      </form>
                    ) : (
                      <p className="text-sm font-semibold text-slate-700">
                        Final: {m.score_a}-{m.score_b}
                      </p>
                    )}
```

- [ ] **Step 4: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 162 tests pass.

- [ ] **Step 5: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/matches/page.tsx"
git commit -m "feat: gate Matches page score editing on result locking"
```

---

### Task 7: Apply the migration, push, verify CI, manual regression

**Files:** none (verification-only task).

- [ ] **Step 1: Apply the migration to the live database**

Using a fresh, transient Supabase personal access token (never persisted
to disk), apply Task 1's migration via the Supabase Management API's SQL
execution endpoint. Verify afterward: `tournaments.results_unlocked_at`
exists, nullable, existing rows read `null`.

- [ ] **Step 2: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 3: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 4: Manual regression**

Using a tournament still in progress:

- Confirm scores can still be entered/edited freely on both the Bracket
  and Matches pages.
- Confirm the "Save Teams" (team reassignment) section no longer appears
  on any match, anywhere.
- Confirm no "Unlock/Lock Editing" button appears yet.

Play the tournament out to completion (score every match, including the
Final if the format has one):

- Confirm every match's score now shows as read-only "Final: X-Y" text
  on both pages — the score-entry form is gone.
- Confirm a "🔓 Unlock Editing" button now appears on the Bracket page.
- Click it — confirm score-entry forms and the team-reassignment section
  reappear on every match.
- Change a score and/or reassign a match's teams — confirm it saves
  successfully.
- Click "🔒 Lock Editing" — confirm everything reverts to read-only/hidden
  again.
- Try submitting a score directly (e.g. via a stale open tab) while
  locked — confirm a clear error, not a silent failure or crash.

Clean up any disposable test tournament/data used for this check
afterward.
