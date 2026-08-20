# League + Playoffs Full-Schedule Generation & Regenerate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** League + Playoffs generates its entire schedule (up to the configured round count) in one action instead of one round at a time, and gains a "Regenerate All Rounds" option for when the team roster changes mid-tournament.

**Architecture:** Two server actions replace one (`generateLeaguePlayoffsBracket` for the initial generate, `regenerateLeaguePlayoffsBracket` for rebuilding after a roster change), a new Client Component (`RegenerateLeagueRoundsButton`) follows the existing `CancelTournamentButton` confirm+`useTransition` pattern, and the Bracket page's League + Playoffs UI collapses from a two-state round-by-round flow to a single generate button plus a conditional regenerate button.

**Tech Stack:** Next.js App Router Server Actions, Supabase Postgres.

## Global Constraints

- Scope is League + Playoffs only — Gauntlet, Claim the Throne, and Up and Down the River are untouched (their round-by-round generation is adaptive, not a limitation to fix).
- `regenerateLeaguePlayoffsBracket` must refuse (throw) server-side if any `stage in ('semifinal', 'final')` match already exists — this is the authoritative safety check, not just a UI-level hide.
- `regenerateLeaguePlayoffsBracket` deletes only `stage = 'league'` matches, never touches other stages.
- The regenerate button skips the confirmation dialog when zero League matches are `status = 'complete'` (nothing to lose); otherwise shows a `confirm()` naming that scored matches will be permanently lost, matching `CancelTournamentButton.tsx`'s existing wording style.
- Score entry / round grouping on the Bracket page is unaffected — only the generation trigger(s) change.

---

### Task 1: `RegenerateLeagueRoundsButton` component

**Files:**
- Create: `apps/organizer-web/app/tournaments/[id]/bracket/RegenerateLeagueRoundsButton.tsx`

**Interfaces:**
- Produces: `RegenerateLeagueRoundsButton({ regenerateAction: () => Promise<void>; hasScoredMatches: boolean })` — a default export, consumed by Task 3's page wiring. `regenerateAction` is a generically-typed zero-arg async callback (the bound server action), matching `CancelTournamentButton.tsx`'s existing `cancelAction` prop shape — this component has no dependency on Task 2's action existing yet.

This task is independent of Task 2 (the server actions) — it only needs the *shape* of a bound server action, not the real one, so it can be built and committed on its own with no coupling risk.

- [ ] **Step 1: Create the component**

Create `apps/organizer-web/app/tournaments/[id]/bracket/RegenerateLeagueRoundsButton.tsx`:

```tsx
'use client';

import { useTransition } from 'react';
import { accentButtonClass } from '@/app/components/ui';

export default function RegenerateLeagueRoundsButton({
  regenerateAction,
  hasScoredMatches,
}: {
  regenerateAction: () => Promise<void>;
  hasScoredMatches: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    if (hasScoredMatches) {
      const confirmed = confirm(
        'Regenerate all rounds? This will permanently delete every League match and score for this tournament and rebuild the schedule from the current teams. This cannot be undone.'
      );
      if (!confirmed) return;
    }
    startTransition(() => {
      regenerateAction();
    });
  };

  return (
    <button type="button" onClick={handleClick} disabled={isPending} className={accentButtonClass}>
      {isPending ? 'Regenerating…' : '🔄 Regenerate All Rounds'}
    </button>
  );
}
```

This mirrors `apps/organizer-web/app/tournaments/CancelTournamentButton.tsx`'s exact
structure (`useTransition` + a native `confirm()` gate before calling the
bound action) — the only difference is the `confirm()` is conditional on
`hasScoredMatches` rather than always shown.

- [ ] **Step 2: Run the build**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no TypeScript or ESLint errors (this is a
new, currently-unused file — nothing imports it yet, so it cannot break
any other route).

- [ ] **Step 3: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/RegenerateLeagueRoundsButton.tsx"
git commit -m "feat: add RegenerateLeagueRoundsButton component"
```

---

### Task 2: Replace `advanceLeaguePlayoffsRound` with full-generation and regenerate actions, and wire them into the Bracket page

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`

**Interfaces:**
- Consumes: `RegenerateLeagueRoundsButton` (Task 1).
- Produces: `generateLeaguePlayoffsBracket(tournamentId: string, formData?: FormData): Promise<void>`,
  `regenerateLeaguePlayoffsBracket(tournamentId: string): Promise<void>` — both server
  actions, replacing the removed `advanceLeaguePlayoffsRound`.

This task touches `actions.ts` and `page.tsx` together deliberately:
`page.tsx` is the only importer of `advanceLeaguePlayoffsRound`, so removing
it there without updating `page.tsx` in the same commit would leave the
build broken (a named import that no longer exists is a real TypeScript
error, unlike the untyped-Supabase-field situations seen in earlier
features). Do the `actions.ts` edit first (Step 1), then the `page.tsx`
edits (Steps 2-6), then build once at the end (Step 7).

- [ ] **Step 1: Replace `advanceLeaguePlayoffsRound` in `actions.ts`**

In `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`, find the
entire function (from its `export async function advanceLeaguePlayoffsRound`
line through its closing `}` before `function pairKey`):

```typescript
export async function advanceLeaguePlayoffsRound(tournamentId: string, formData?: FormData) {
  const { supabase } = await requireOrganizer();

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id')
    .eq('tournament_id', tournamentId)
    .order('id', { ascending: true });

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  if (!teams || teams.length < 2) {
    throw new Error('Need at least 2 teams to generate a bracket');
  }

  const { data: existingMatches, error: existingMatchesError } = await supabase
    .from('matches')
    .select('round')
    .eq('tournament_id', tournamentId)
    .eq('stage', 'league');

  if (existingMatchesError) {
    throw new Error(existingMatchesError.message);
  }

  const currentRound =
    existingMatches && existingMatches.length > 0
      ? Math.max(...existingMatches.map((m) => m.round))
      : 0;

  const teamCount = teams.length;
  const fullRounds = teamCount % 2 === 0 ? teamCount - 1 : teamCount;

  let targetRounds: number;

  if (currentRound === 0) {
    const rawRounds = formData?.get('rounds');
    const requested =
      typeof rawRounds === 'string' && rawRounds.trim() !== '' ? Number(rawRounds) : NaN;
    targetRounds = Number.isFinite(requested)
      ? Math.max(1, Math.min(fullRounds, Math.floor(requested)))
      : fullRounds;

    const { error: updateError } = await supabase
      .from('tournaments')
      .update({ league_playoffs_rounds: targetRounds })
      .eq('id', tournamentId);

    if (updateError) {
      throw new Error(updateError.message);
    }
  } else {
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('league_playoffs_rounds')
      .eq('id', tournamentId)
      .single();

    if (tournamentError) {
      throw new Error(tournamentError.message);
    }

    targetRounds = tournament?.league_playoffs_rounds ?? fullRounds;
  }

  const nextRound = currentRound + 1;

  if (nextRound > targetRounds) {
    return;
  }

  const pairings = generateRoundRobin(teams.map((t) => t.id)).filter(
    (p) => p.round === nextRound
  );

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
```

Replace it with these two functions:

```typescript
export async function generateLeaguePlayoffsBracket(tournamentId: string, formData?: FormData) {
  const { supabase } = await requireOrganizer();

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id')
    .eq('tournament_id', tournamentId)
    .order('id', { ascending: true });

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  if (!teams || teams.length < 2) {
    throw new Error('Need at least 2 teams to generate a bracket');
  }

  const teamCount = teams.length;
  const fullRounds = teamCount % 2 === 0 ? teamCount - 1 : teamCount;

  const rawRounds = formData?.get('rounds');
  const requested =
    typeof rawRounds === 'string' && rawRounds.trim() !== '' ? Number(rawRounds) : NaN;
  const targetRounds = Number.isFinite(requested)
    ? Math.max(1, Math.min(fullRounds, Math.floor(requested)))
    : fullRounds;

  const { error: updateError } = await supabase
    .from('tournaments')
    .update({ league_playoffs_rounds: targetRounds })
    .eq('id', tournamentId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const pairings = generateRoundRobin(teams.map((t) => t.id)).filter(
    (p) => p.round <= targetRounds
  );

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

export async function regenerateLeaguePlayoffsBracket(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: playoffMatches, error: playoffError } = await supabase
    .from('matches')
    .select('stage')
    .eq('tournament_id', tournamentId)
    .in('stage', ['semifinal', 'final']);

  if (playoffError) {
    throw new Error(playoffError.message);
  }

  if (playoffMatches && playoffMatches.length > 0) {
    throw new Error('Playoffs have already started — cannot regenerate the League stage');
  }

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id')
    .eq('tournament_id', tournamentId)
    .order('id', { ascending: true });

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  if (!teams || teams.length < 2) {
    throw new Error('Need at least 2 teams to generate a bracket');
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('league_playoffs_rounds')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  const teamCount = teams.length;
  const fullRounds = teamCount % 2 === 0 ? teamCount - 1 : teamCount;
  const targetRounds = Math.max(
    1,
    Math.min(fullRounds, tournament?.league_playoffs_rounds ?? fullRounds)
  );

  const { error: deleteError } = await supabase
    .from('matches')
    .delete()
    .eq('tournament_id', tournamentId)
    .eq('stage', 'league');

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const { error: updateError } = await supabase
    .from('tournaments')
    .update({ league_playoffs_rounds: targetRounds })
    .eq('id', tournamentId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const pairings = generateRoundRobin(teams.map((t) => t.id)).filter(
    (p) => p.round <= targetRounds
  );

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
```

`generateRoundRobin` is already imported at the top of this file — no new
import needed for either function.

- [ ] **Step 2: Update the import line in `page.tsx`**

In `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`, find:

```tsx
import { generateBracket, generatePopcornBracket, advanceGauntletRound, advanceClaimTheThroneRound, advanceUpAndDownRiverRound, advanceLeaguePlayoffsRound, generateSemifinalMatches, generateFinalMatch, updateMatchTeams } from './actions';
```

Replace with:

```tsx
import { generateBracket, generatePopcornBracket, advanceGauntletRound, advanceClaimTheThroneRound, advanceUpAndDownRiverRound, generateLeaguePlayoffsBracket, regenerateLeaguePlayoffsBracket, generateSemifinalMatches, generateFinalMatch, updateMatchTeams } from './actions';
```

Find:

```tsx
import ShareScheduleButton from './ShareScheduleButton';
```

Replace with:

```tsx
import ShareScheduleButton from './ShareScheduleButton';
import RegenerateLeagueRoundsButton from './RegenerateLeagueRoundsButton';
```

- [ ] **Step 3: Update the action bindings**

Find:

```tsx
  const advanceLeaguePlayoffsRoundWithId = advanceLeaguePlayoffsRound.bind(null, id);
```

Replace with:

```tsx
  const generateLeaguePlayoffsBracketWithId = generateLeaguePlayoffsBracket.bind(null, id);
  const regenerateLeaguePlayoffsBracketWithId = regenerateLeaguePlayoffsBracket.bind(null, id);
```

- [ ] **Step 4: Simplify the League + Playoffs derived state**

Find:

```tsx
  const leaguePlayoffsFullRounds = teamCount % 2 === 0 ? teamCount - 1 : teamCount;
  const leaguePlayoffsRounds = tournament?.league_playoffs_rounds ?? leaguePlayoffsFullRounds;
  const currentLeaguePlayoffsRound =
    leagueMatches.length > 0 ? Math.max(...leagueMatches.map((m) => m.round)) : 0;
  const currentLeaguePlayoffsRoundMatches = leagueMatches.filter(
    (m) => m.round === currentLeaguePlayoffsRound
  );
  const currentLeaguePlayoffsRoundComplete =
    currentLeaguePlayoffsRoundMatches.length > 0 &&
    currentLeaguePlayoffsRoundMatches.every((m) => m.status === 'complete');
  const showGenerateNextLeaguePlayoffsRound =
    isLeaguePlayoffs &&
    hasLeagueMatches &&
    currentLeaguePlayoffsRoundComplete &&
    currentLeaguePlayoffsRound < leaguePlayoffsRounds;
  const leaguePlayoffsRoundsComplete = currentLeaguePlayoffsRound >= leaguePlayoffsRounds;

  const showGenerateSemifinals =
    isLeaguePlayoffs &&
    allLeagueComplete &&
    leaguePlayoffsRoundsComplete &&
    semifinalMatches.length === 0 &&
    teamCount >= 4;
  const showGenerateFinal = isLeaguePlayoffs && allSemifinalComplete && !hasFinalMatch;
```

Replace with:

```tsx
  const leaguePlayoffsFullRounds = teamCount % 2 === 0 ? teamCount - 1 : teamCount;
  const leaguePlayoffsRounds = tournament?.league_playoffs_rounds ?? leaguePlayoffsFullRounds;
  const playoffsStarted = semifinalMatches.length > 0 || finalMatches.length > 0;
  const hasScoredLeagueMatches = leagueMatches.some((m) => m.status === 'complete');
  const showRegenerateLeaguePlayoffsRounds =
    isLeaguePlayoffs && hasLeagueMatches && !playoffsStarted;

  const showGenerateSemifinals =
    isLeaguePlayoffs &&
    allLeagueComplete &&
    semifinalMatches.length === 0 &&
    teamCount >= 4;
  const showGenerateFinal = isLeaguePlayoffs && allSemifinalComplete && !hasFinalMatch;
```

The removed variables (`currentLeaguePlayoffsRound`,
`currentLeaguePlayoffsRoundMatches`, `currentLeaguePlayoffsRoundComplete`,
`showGenerateNextLeaguePlayoffsRound`, `leaguePlayoffsRoundsComplete`)
tracked "which round is in progress" for the old round-by-round flow —
with full generation, the moment League matches exist, all rounds up to
`leaguePlayoffsRounds` already exist, so `leaguePlayoffsRoundsComplete`
was always true in that state and `showGenerateSemifinals` needs only
`allLeagueComplete` (every real match scored) to know playoffs are ready.

- [ ] **Step 5: Replace the two-state generation UI with one generate button**

Find:

```tsx
      {isSupported && !hasLeagueMatches && isLeaguePlayoffs && teamCount >= 2 && (
        <form
          action={advanceLeaguePlayoffsRoundWithId}
          className={`${cardClass} text-center mb-6`}
        >
          <p className="text-slate-600 mb-4">
            {teamCount} teams ready. Generate Round 1 of {leaguePlayoffsFullRounds}.
          </p>
          <div className="mb-4 max-w-[140px] mx-auto text-left">
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Number of rounds
            </label>
            <input
              name="rounds"
              type="number"
              defaultValue={leaguePlayoffsFullRounds}
              min={1}
              max={leaguePlayoffsFullRounds}
              className={inputClass}
            />
            <p className="text-xs text-slate-400 mt-1">
              Full round-robin is {leaguePlayoffsFullRounds}{' '}
              round{leaguePlayoffsFullRounds === 1 ? '' : 's'}.
            </p>
          </div>
          <button type="submit" className={accentButtonClass}>
            Generate Round 1
          </button>
        </form>
      )}

      {showGenerateNextLeaguePlayoffsRound && (
        <form
          action={advanceLeaguePlayoffsRoundWithId}
          className={`${cardClass} text-center mb-6`}
        >
          <p className="text-slate-600 mb-4">
            Round {currentLeaguePlayoffsRound} complete. Generate Round{' '}
            {currentLeaguePlayoffsRound + 1} of {leaguePlayoffsRounds}.
          </p>
          <button type="submit" className={accentButtonClass}>
            Generate Round {currentLeaguePlayoffsRound + 1}
          </button>
        </form>
      )}
```

Replace with:

```tsx
      {isSupported && !hasLeagueMatches && isLeaguePlayoffs && teamCount >= 2 && (
        <form
          action={generateLeaguePlayoffsBracketWithId}
          className={`${cardClass} text-center mb-6`}
        >
          <p className="text-slate-600 mb-4">
            {teamCount} teams ready. Generate the full League schedule.
          </p>
          <div className="mb-4 max-w-[140px] mx-auto text-left">
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Number of rounds
            </label>
            <input
              name="rounds"
              type="number"
              defaultValue={leaguePlayoffsFullRounds}
              min={1}
              max={leaguePlayoffsFullRounds}
              className={inputClass}
            />
            <p className="text-xs text-slate-400 mt-1">
              Full round-robin is {leaguePlayoffsFullRounds}{' '}
              round{leaguePlayoffsFullRounds === 1 ? '' : 's'}.
            </p>
          </div>
          <button type="submit" className={accentButtonClass}>
            Generate Full Schedule
          </button>
        </form>
      )}

      {showRegenerateLeaguePlayoffsRounds && (
        <div className={`${cardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            Team roster changed? Regenerate the full {leaguePlayoffsRounds}-round schedule from
            the current teams.
          </p>
          <RegenerateLeagueRoundsButton
            regenerateAction={regenerateLeaguePlayoffsBracketWithId}
            hasScoredMatches={hasScoredLeagueMatches}
          />
        </div>
      )}
```

- [ ] **Step 6: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors (the old
`advanceLeaguePlayoffsRound` import is gone from both files together, and
every reference to the removed derived-state variables is gone too); all
156 tests pass (this task changes no tested pure-function logic —
`generateRoundRobin` itself is untouched).

- [ ] **Step 7: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/actions.ts" "apps/organizer-web/app/tournaments/[id]/bracket/page.tsx"
git commit -m "feat: generate League + Playoffs full schedule and add Regenerate All Rounds"
```

---

### Task 3: Update the Teams page roster-change banner

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/teams/page.tsx`

- [ ] **Step 1: Reword the banner**

In `apps/organizer-web/app/tournaments/[id]/teams/page.tsx`, find:

```tsx
      {isLeaguePlayoffs && hasLeagueMatches && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-6">
          This tournament already has a generated schedule. Removing a team also deletes its
          existing matches and their scores, and any rounds generated from here on are
          recalculated from the new team list — so pairings may repeat or be skipped.
        </div>
      )}
```

Replace with:

```tsx
      {isLeaguePlayoffs && hasLeagueMatches && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-6">
          This tournament already has a generated schedule. Removing a team also deletes its
          existing matches and their scores. After changing teams, head to Bracket and use
          Regenerate All Rounds to rebuild a clean schedule from the current team list.
        </div>
      )}
```

This is a text-only change describing the new Task 2 behavior — no logic
change, and independent of Tasks 1-2 (this file imports nothing from
either).

- [ ] **Step 2: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 156 tests pass.

- [ ] **Step 3: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/teams/page.tsx"
git commit -m "docs: update Teams page banner for the new Regenerate All Rounds flow"
```

---

### Task 4: Push, verify CI, manual regression

**Files:** none (verification-only task). No database migration is
needed — `league_playoffs_rounds` already exists from an earlier feature,
and this task adds no new columns.

- [ ] **Step 1: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 2: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 3: Manual regression**

On a League + Playoffs tournament with no schedule generated yet:

- Confirm the Bracket page shows one "Generate Full Schedule" button (not
  "Generate Round 1") with the same rounds-count input as before.
- Click it — confirm ALL configured rounds' matches appear at once
  (not just Round 1), still grouped by round in the display below.
- Confirm a "Regenerate All Rounds" button now appears, and — since
  nothing is scored yet — clicking it regenerates immediately with no
  confirmation prompt.
- Enter a score for at least one match, then click "Regenerate All
  Rounds" again — confirm a browser confirmation dialog appears naming
  that scores will be lost; cancel it and confirm nothing changed.
  Confirm it again and confirm the schedule rebuilds.
- Go to the Teams page, remove a team and add a different one, confirm
  the reworded banner text appears, then go back to Bracket and use
  Regenerate All Rounds — confirm the new schedule reflects the updated
  team list.
- Play the League stage out to completion, generate Semifinals — confirm
  the "Regenerate All Rounds" button disappears once Semifinal matches
  exist.
- Confirm Gauntlet, Claim the Throne, and Up and Down the River
  tournaments are completely unaffected — still round-by-round as before.

Clean up any disposable test tournament/data used for this check
afterward.
