# Custom Tournament Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Custom Tournament" format where the organizer manually adds
every matchup themselves via a round-number + Team A/Team B form on the
Bracket page, instead of an algorithm auto-generating the schedule.

**Architecture:** A new format value `custom` joins the existing
`TOURNAMENT_FORMATS` list and gets its own nullable `custom_rounds` column
(same pattern as `gauntlet_rounds`/`claim_the_throne_rounds`/etc.), set at
creation via `FormatFields.tsx`. The Bracket page grows a new `isCustom`
flag and an "Add Match" form, wired to a new `addCustomMatch` server action
that mirrors the existing `updateMatchTeams` action's validation
(both-teams-selected, teamA≠teamB, teams-belong-to-tournament) but inserts a
new `matches` row instead of updating one. `isTournamentComplete` and
`enterScore`'s `targetRounds` computation both extend their existing
round-count-gated branch to include `custom`, mirroring
`gauntlet`/`claim_the_throne`/`up_and_down_the_river`. Everything else
(scoring, standings, Results/Roster/Teams pages) is already
format-agnostic and needs no changes.

**Tech Stack:** Next.js Server Actions, Supabase (Postgres), Vitest.

## Global Constraints

- No auto-pairing algorithm of any kind for this format — the organizer
  assigns every matchup manually.
- No per-round match-count limit — any number of matches can be added to
  any round.
- No changes to any other existing format's behavior.
- No UI to edit/remove a match beyond what already exists (the existing
  "Save Teams" reassignment and score-entry forms already work on any
  match, Custom included).
- `custom_rounds` defaults to 5 if left blank at creation, matching the
  existing default for `gauntlet_rounds`/`claim_the_throne_rounds`/etc.
- Inserted Custom matches use `stage: 'league'` and `status: 'pending'`,
  matching every other non-playoff format.
- The action rejects (server-side) a submission where Team A and Team B
  are the same team.

---

### Task 1: Add the `custom` format value, its `custom_rounds` column, and creation-form wiring

**Files:**
- Modify: `apps/organizer-web/lib/tournament/formats.ts`
- Create: `supabase/migrations/20260822120000_add_tournament_custom_rounds.sql`
- Modify: `apps/organizer-web/app/tournaments/new/FormatFields.tsx`
- Modify: `apps/organizer-web/app/tournaments/new/actions.ts`

**Interfaces:**
- Produces: format value `'custom'` in `TOURNAMENT_FORMATS`
  (`lib/tournament/formats.ts`); nullable `tournaments.custom_rounds
  integer` column; `createTournament` stores the form's `customRounds`
  field as `custom_rounds` on insert.
- Consumed by: Task 2 (`isTournamentComplete`/`enterScore` read
  `format === 'custom'` and `custom_rounds`) and Task 3 (Bracket page
  reads the same).

- [ ] **Step 1: Add the format value**

In `apps/organizer-web/lib/tournament/formats.ts`, find:

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

Replace with:

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
  { value: 'custom', label: 'Custom Tournament' },
] as const;
```

Do **not** add `'custom'` to `INDIVIDUAL_FORMATS` — Custom Tournament uses
fixed teams, set up via the existing Roster/Teams pages, same as Round
Robin.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260822120000_add_tournament_custom_rounds.sql`:

```sql
alter table public.tournaments add column custom_rounds int;
```

- [ ] **Step 3: Add the creation-form field**

In `apps/organizer-web/app/tournaments/new/FormatFields.tsx`, find:

```tsx
      {format === 'up_and_down_the_river' && (
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Number of rounds (Up and Down the River only)
          </label>
          <input name="upAndDownRiverRounds" type="number" defaultValue={5} min={1} className={inputClass} />
        </div>
      )}
    </>
  );
}
```

Replace with:

```tsx
      {format === 'up_and_down_the_river' && (
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Number of rounds (Up and Down the River only)
          </label>
          <input name="upAndDownRiverRounds" type="number" defaultValue={5} min={1} className={inputClass} />
        </div>
      )}
      {format === 'custom' && (
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Number of rounds (Custom Tournament only)
          </label>
          <input name="customRounds" type="number" defaultValue={5} min={1} className={inputClass} />
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Wire `createTournament` to store it**

In `apps/organizer-web/app/tournaments/new/actions.ts`, find:

```typescript
  const upAndDownRiverRounds =
    format === 'up_and_down_the_river' ? Number(formData.get('upAndDownRiverRounds')) : null;

  const { data: tournament, error } = await supabase
    .from('tournaments')
    .insert({
      name,
      date,
      max_players: maxPlayers,
      target_score: targetScore,
      win_by: winBy,
      format,
      organizer_id: organizer.id,
      venue_id: venueId,
      timeslot,
      popcorn_rounds: popcornRounds,
      gauntlet_rounds: gauntletRounds,
      claim_the_throne_rounds: claimTheThroneRounds,
      up_and_down_the_river_rounds: upAndDownRiverRounds,
    })
```

Replace with:

```typescript
  const upAndDownRiverRounds =
    format === 'up_and_down_the_river' ? Number(formData.get('upAndDownRiverRounds')) : null;
  const customRounds = format === 'custom' ? Number(formData.get('customRounds')) : null;

  const { data: tournament, error } = await supabase
    .from('tournaments')
    .insert({
      name,
      date,
      max_players: maxPlayers,
      target_score: targetScore,
      win_by: winBy,
      format,
      organizer_id: organizer.id,
      venue_id: venueId,
      timeslot,
      popcorn_rounds: popcornRounds,
      gauntlet_rounds: gauntletRounds,
      claim_the_throne_rounds: claimTheThroneRounds,
      up_and_down_the_river_rounds: upAndDownRiverRounds,
      custom_rounds: customRounds,
    })
```

- [ ] **Step 5: Run the build to verify no TypeScript errors**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/organizer-web/lib/tournament/formats.ts apps/organizer-web/app/tournaments/new/FormatFields.tsx apps/organizer-web/app/tournaments/new/actions.ts supabase/migrations/20260822120000_add_tournament_custom_rounds.sql
git commit -m "feat: add Custom Tournament format value and custom_rounds column"
```

---

### Task 2: Extend completion logic for the `custom` format

**Files:**
- Modify: `apps/organizer-web/lib/tournament/completion.ts`
- Test: `apps/organizer-web/lib/tournament/completion.test.ts`
- Modify: `apps/organizer-web/app/tournaments/[id]/matches/actions.ts`

**Interfaces:**
- Consumes: format value `'custom'` and column `custom_rounds` (Task 1).
- Produces: `isTournamentComplete('custom', teamCount, matches,
  targetRounds)` now participates in the same round-count-gated branch as
  `gauntlet`/`claim_the_throne`/`up_and_down_the_river`/`league_playoffs`.
  `enterScore`'s `targetRounds` ternary gains a `format === 'custom'`
  branch that reads `tournament.custom_rounds` (defaulting to 5).

- [ ] **Step 1: Write the failing tests**

In `apps/organizer-web/lib/tournament/completion.test.ts`, find:

```typescript
  it('returns true for up_and_down_the_river once the target round is reached and all matches are complete', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2', round: 1 },
      { stage: 'league', status: 'complete', teamBId: 't4', round: 2 },
    ];
    expect(isTournamentComplete('up_and_down_the_river', 4, matches, 2)).toBe(true);
  });
});
```

Replace with:

```typescript
  it('returns true for up_and_down_the_river once the target round is reached and all matches are complete', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2', round: 1 },
      { stage: 'league', status: 'complete', teamBId: 't4', round: 2 },
    ];
    expect(isTournamentComplete('up_and_down_the_river', 4, matches, 2)).toBe(true);
  });

  it('returns false for custom when fewer rounds than the target have been played', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2', round: 1 },
    ];
    expect(isTournamentComplete('custom', 4, matches, 5)).toBe(false);
  });

  it('returns false for custom when the target round exists but its matches are not all complete', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2', round: 1 },
      { stage: 'league', status: 'pending', teamBId: 't4', round: 2 },
    ];
    expect(isTournamentComplete('custom', 4, matches, 2)).toBe(false);
  });

  it('returns true for custom once the target round is reached and all matches are complete', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2', round: 1 },
      { stage: 'league', status: 'complete', teamBId: 't4', round: 2 },
    ];
    expect(isTournamentComplete('custom', 4, matches, 2)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/organizer-web && npx vitest run lib/tournament/completion.test.ts`
Expected: FAIL — the 3 new `custom` tests fail because `isTournamentComplete`
doesn't yet gate on round count for `format === 'custom'` (it falls through
to the generic `allComplete` return, which is `true` after just the first
match in the first new test's setup... actually with only 1 complete real
match and no pending ones, `allComplete` is `true`, so the first new test
("fewer rounds than target") is the one that fails, expecting `false` but
getting `true`).

- [ ] **Step 3: Implement**

In `apps/organizer-web/lib/tournament/completion.ts`, find:

```typescript
  if (
    format === 'gauntlet' ||
    format === 'claim_the_throne' ||
    format === 'up_and_down_the_river' ||
    format === 'league_playoffs'
  ) {
```

Replace with:

```typescript
  if (
    format === 'gauntlet' ||
    format === 'claim_the_throne' ||
    format === 'up_and_down_the_river' ||
    format === 'league_playoffs' ||
    format === 'custom'
  ) {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/organizer-web && npx vitest run lib/tournament/completion.test.ts`
Expected: PASS — all tests in the file green, including the 3 new `custom`
tests.

- [ ] **Step 5: Wire `enterScore`'s `targetRounds` computation**

In `apps/organizer-web/app/tournaments/[id]/matches/actions.ts`, find:

```typescript
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select(
      'format, gauntlet_rounds, claim_the_throne_rounds, up_and_down_the_river_rounds, league_playoffs_rounds, completed_at, results_unlocked_at'
    )
    .eq('id', tournamentId)
    .single();
```

Replace with:

```typescript
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select(
      'format, gauntlet_rounds, claim_the_throne_rounds, up_and_down_the_river_rounds, league_playoffs_rounds, custom_rounds, completed_at, results_unlocked_at'
    )
    .eq('id', tournamentId)
    .single();
```

Then find:

```typescript
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
```

Replace with:

```typescript
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
            : tournament?.format === 'custom'
              ? (tournament?.custom_rounds ?? 5)
              : undefined;
```

- [ ] **Step 6: Run the full test suite and build**

Run: `cd apps/organizer-web && npm test && npm run build`
Expected: all tests pass (existing suite + 3 new `custom` completion
tests); build succeeds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add apps/organizer-web/lib/tournament/completion.ts apps/organizer-web/lib/tournament/completion.test.ts apps/organizer-web/app/tournaments/[id]/matches/actions.ts
git commit -m "feat: gate custom tournament completion on target round count"
```

---

### Task 3: Add the `addCustomMatch` action and the Bracket page's "Add Match" form

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`

**Interfaces:**
- Produces: `addCustomMatch(tournamentId: string, formData: FormData):
  Promise<void>`, exported from `bracket/actions.ts`. Its only caller (the
  new "Add Match" form) is wired in this same task, per this project's
  established rule that a new server action and its only caller land
  together.
- Consumes: `canEditScoreValue` (already computed in `page.tsx`) gates
  visibility of the new form — matches must be addable while the
  tournament is in progress, and stop being addable once complete unless
  editing is unlocked, mirroring how the existing "Save Teams" form is
  gated by `canEditTeamsValue`.

This is a presentational/behavioral change to a page with no dedicated
test file, per this project's established convention for `bracket/
actions.ts` and `bracket/page.tsx` (neither has one today). Correctness is
verified by the build passing and by manual regression in Task 4.

- [ ] **Step 1: Add the `addCustomMatch` action**

In `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`, find:

```typescript
export async function unlockTournamentResults(tournamentId: string) {
```

Replace with:

```typescript
export async function addCustomMatch(tournamentId: string, formData: FormData) {
  const { supabase } = await requireOrganizer();

  const roundRaw = formData.get('round');
  const round = typeof roundRaw === 'string' ? Number(roundRaw) : NaN;

  if (!Number.isFinite(round) || round < 1) {
    throw new Error('Round must be a positive number');
  }

  const teamAId = formData.get('teamAId');
  const teamBId = formData.get('teamBId');

  if (typeof teamAId !== 'string' || typeof teamBId !== 'string' || !teamAId || !teamBId) {
    throw new Error('Both teams must be selected');
  }

  if (teamAId === teamBId) {
    throw new Error('Team A and Team B must be different teams');
  }

  const { data: validTeams, error: teamsError } = await supabase
    .from('teams')
    .select('id')
    .eq('tournament_id', tournamentId)
    .in('id', [teamAId, teamBId]);

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  const validIds = new Set((validTeams ?? []).map((t) => t.id));
  if (!validIds.has(teamAId) || !validIds.has(teamBId)) {
    throw new Error('Selected teams must belong to this tournament');
  }

  const { error } = await supabase.from('matches').insert({
    tournament_id: tournamentId,
    round,
    stage: 'league' as const,
    team_a_id: teamAId,
    team_b_id: teamBId,
    status: 'pending' as const,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}

export async function unlockTournamentResults(tournamentId: string) {
```

- [ ] **Step 2: Import it and the `custom_rounds` column on the Bracket page**

In `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`, find:

```typescript
import { generateBracket, generatePopcornBracket, advanceGauntletRound, advanceClaimTheThroneRound, advanceUpAndDownRiverRound, generateLeaguePlayoffsBracket, regenerateLeaguePlayoffsBracket, generateSemifinalMatches, generateFinalMatch, skipToFinalMatch, updateMatchTeams, unlockTournamentResults, lockTournamentResults } from './actions';
```

Replace with:

```typescript
import { generateBracket, generatePopcornBracket, advanceGauntletRound, advanceClaimTheThroneRound, advanceUpAndDownRiverRound, generateLeaguePlayoffsBracket, regenerateLeaguePlayoffsBracket, generateSemifinalMatches, generateFinalMatch, skipToFinalMatch, updateMatchTeams, addCustomMatch, unlockTournamentResults, lockTournamentResults } from './actions';
```

Then find:

```typescript
  const { data: tournament } = await supabase
    .from('tournaments')
    .select(
      'name, date, timeslot, format, popcorn_rounds, gauntlet_rounds, claim_the_throne_rounds, up_and_down_the_river_rounds, league_playoffs_rounds, completed_at, results_unlocked_at, venues(name)'
    )
    .eq('id', id)
    .single();
```

Replace with:

```typescript
  const { data: tournament } = await supabase
    .from('tournaments')
    .select(
      'name, date, timeslot, format, popcorn_rounds, gauntlet_rounds, claim_the_throne_rounds, up_and_down_the_river_rounds, league_playoffs_rounds, custom_rounds, completed_at, results_unlocked_at, venues(name)'
    )
    .eq('id', id)
    .single();
```

- [ ] **Step 3: Add the `isCustom` flag and include it in `isSupported`**

Find:

```typescript
  const isUpAndDownRiver = format === 'up_and_down_the_river';
  const isSupported =
    isRoundRobin ||
    isLeaguePlayoffs ||
    isDoubleHeader ||
    isPopcorn ||
    isGauntlet ||
    isClaimTheThrone ||
    isUpAndDownRiver;
```

Replace with:

```typescript
  const isUpAndDownRiver = format === 'up_and_down_the_river';
  const isCustom = format === 'custom';
  const isSupported =
    isRoundRobin ||
    isLeaguePlayoffs ||
    isDoubleHeader ||
    isPopcorn ||
    isGauntlet ||
    isClaimTheThrone ||
    isUpAndDownRiver ||
    isCustom;
```

- [ ] **Step 4: Bind the action to this tournament's id**

Find:

```typescript
  const skipToFinalMatchWithId = skipToFinalMatch.bind(null, id);
  const unlockTournamentResultsWithId = unlockTournamentResults.bind(null, id);
```

Replace with:

```typescript
  const skipToFinalMatchWithId = skipToFinalMatch.bind(null, id);
  const addCustomMatchWithId = addCustomMatch.bind(null, id);
  const unlockTournamentResultsWithId = unlockTournamentResults.bind(null, id);
```

- [ ] **Step 5: Render the "Add Match" form**

Find:

```tsx
      {hasLeagueMatches && (
        <div className="space-y-4 mb-6">
          {Array.from(roundsFor(leagueMatches).entries()).map(([round, roundMatches]) => (
```

Replace with:

```tsx
      {isCustom && canEditScoreValue && (
        <form action={addCustomMatchWithId} className={`${cardClass} mb-6`}>
          <h2 className="text-sm font-bold text-teal-700 uppercase tracking-wide mb-3">
            Add Match
          </h2>
          {teamCount < 2 ? (
            <p className="text-sm text-red-700">
              Need at least 2 teams before you can add a match — go back and pair more teams
              first.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Round</label>
                <input
                  name="round"
                  type="number"
                  defaultValue={1}
                  min={1}
                  required
                  className={`${inputClass} w-20`}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Team A</label>
                <select name="teamAId" defaultValue="" required className={inputClass}>
                  <option value="" disabled>
                    Select team
                  </option>
                  {(teams ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {teamById.get(t.id)}
                    </option>
                  ))}
                </select>
              </div>
              <span className="text-slate-400 font-bold pb-2">vs</span>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Team B</label>
                <select name="teamBId" defaultValue="" required className={inputClass}>
                  <option value="" disabled>
                    Select team
                  </option>
                  {(teams ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {teamById.get(t.id)}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className={accentButtonClass}>
                Add Match
              </button>
            </div>
          )}
        </form>
      )}

      {hasLeagueMatches && (
        <div className="space-y-4 mb-6">
          {Array.from(roundsFor(leagueMatches).entries()).map(([round, roundMatches]) => (
```

- [ ] **Step 6: Run the build to verify no TypeScript errors**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 7: Run the full test suite**

Run: `cd apps/organizer-web && npm test`
Expected: all existing tests still pass (this task adds no new automated
tests, per the established convention for these two files).

- [ ] **Step 8: Commit**

```bash
git add apps/organizer-web/app/tournaments/[id]/bracket/actions.ts apps/organizer-web/app/tournaments/[id]/bracket/page.tsx
git commit -m "feat: let organizers add matches manually for the Custom Tournament format"
```

---

### Task 4: Push, verify CI, manual regression

**Files:** none (verification-only task).

**Note:** this feature's migration (`supabase/migrations/20260822120000_add_tournament_custom_rounds.sql`,
created in Task 1) still needs to be applied to the live database. That is
done by the controller session directly (via a transient Supabase
Management API token the user provides in chat, never reused, revoked
afterward) — it is not a subagent-dispatched step.

- [ ] **Step 1: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 2: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 3: Manual regression**

- Create a new tournament with format "Custom Tournament", leaving Number
  of rounds blank. Confirm it's created and that navigating to its Bracket
  page shows "Custom Tournament isn't available yet" nowhere (it should be
  fully supported) — no other format's create flow changed.
- On the Roster/Teams pages, pair at least 2 teams (same as any other
  fixed-team format).
- On the Bracket page, confirm an "Add Match" form appears with a Round
  number input and two team selects. Add a match to Round 1, then another
  to Round 1, then one to Round 2. Confirm all three appear correctly
  grouped by round below the form, matching the existing match-list
  rendering used by every other format.
- Enter a score for one match via the existing score-entry form on that
  match — confirm it saves and marks the match complete, exactly as it
  does for other formats.
- With all matches scored, confirm the tournament only becomes "complete"
  once every match up to the tournament's target round count is scored
  (matching the Gauntlet/Claim the Throne behavior) — not just once
  whatever matches currently exist are all scored.
- Confirm the Results, Roster, and Standings pages render this
  tournament's matches/standings correctly without any code changes
  needed there.
- Confirm the existing "Save Teams" reassignment form still works on a
  Custom match once the tournament is complete and unlocked.
- Regression-check one other existing format end-to-end (e.g. generate a
  Gauntlet round and score it) to confirm nothing about the shared
  Bracket page broke.

Clean up any disposable test data used for this check afterward.
