# Skip Semifinals in League + Playoffs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the organizer skip the Semifinal stage of a League + Playoffs
tournament and send the #1/#2 league-standings teams straight into the
Final.

**Architecture:** A new pure function `pickFinalists` (mirrors the existing
`generateSemifinals`) picks the top-2 standings teams. A new server action
`skipToFinalMatch` (mirrors the existing `generateFinalMatch`) computes
standings, calls `pickFinalists`, and inserts one `stage: 'final'` match
row. A new button on the Bracket page, gated identically to the existing
"Generate Semifinals" button, triggers it.

**Tech Stack:** Next.js Server Actions, Supabase, Vitest.

## Global Constraints

- The new button and the existing "Generate Semifinals" button share the
  exact same visibility gate: `isLeaguePlayoffs && allLeagueComplete &&
  semifinalMatches.length === 0 && !hasFinalMatch && teamCount >= 4`.
- No confirmation dialog, no team picker — always the #1/#2 standings
  teams, one click.
- No database migration — the `matches` table already supports
  `stage: 'final'` rows (used by the existing `generateFinalMatch`).
- The inserted match row must be `{ tournament_id, round: 1, stage:
  'final', team_a_id: <#1 team>, team_b_id: <#2 team>, status: 'pending'
  }` — the same shape `generateFinalMatch` already inserts.

---

### Task 1: `pickFinalists` pure function

**Files:**
- Modify: `apps/organizer-web/lib/tournament/playoffs.ts`
- Test: `apps/organizer-web/lib/tournament/playoffs.test.ts`

**Interfaces:**
- Consumes: `StandingsRow` type from `@/lib/types` (fields: `teamId`,
  `wins`, `losses`, `pointsFor`, `pointsAgainst` — already used by the
  existing `generateSemifinals` in this same file).
- Produces: `pickFinalists(standings: StandingsRow[]): { teamAId: string;
  teamBId: string }`, exported from `apps/organizer-web/lib/tournament/playoffs.ts`.
  Task 2 imports and calls this.

- [ ] **Step 1: Write the failing tests**

Open `apps/organizer-web/lib/tournament/playoffs.test.ts`. It already has
a `row(teamId)` helper and a `describe('generateSemifinals', ...)` block.
Add a new `describe` block below the existing one, in the same file:

```typescript
describe('pickFinalists', () => {
  it('pairs 1st vs 2nd', () => {
    const standings = [row('a'), row('b'), row('c'), row('d')];
    const result = pickFinalists(standings);
    expect(result).toEqual({ teamAId: 'a', teamBId: 'b' });
  });

  it('only uses the top 2 when more are passed', () => {
    const standings = [row('a'), row('b'), row('c'), row('d'), row('e')];
    const result = pickFinalists(standings);
    expect(result).toEqual({ teamAId: 'a', teamBId: 'b' });
  });

  it('throws when fewer than 2 teams are passed', () => {
    const standings = [row('a')];
    expect(() => pickFinalists(standings)).toThrow();
  });
});
```

Also update the top of the file to import the new function:

Find:
```typescript
import { generateSemifinals } from './playoffs';
```

Replace with:
```typescript
import { generateSemifinals, pickFinalists } from './playoffs';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/organizer-web && npx vitest run lib/tournament/playoffs.test.ts`
Expected: FAIL — `pickFinalists` is not exported from `./playoffs`.

- [ ] **Step 3: Implement `pickFinalists`**

In `apps/organizer-web/lib/tournament/playoffs.ts`, add this function
below the existing `generateSemifinals`:

```typescript
export function pickFinalists(
  standings: StandingsRow[]
): { teamAId: string; teamBId: string } {
  if (standings.length < 2) {
    throw new Error('Need at least 2 teams in standings to pick finalists');
  }

  const [first, second] = standings;

  return { teamAId: first.teamId, teamBId: second.teamId };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/organizer-web && npx vitest run lib/tournament/playoffs.test.ts`
Expected: PASS — all tests in the file green, including the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/lib/tournament/playoffs.ts apps/organizer-web/lib/tournament/playoffs.test.ts
git commit -m "feat: add pickFinalists pure function"
```

---

### Task 2: `skipToFinalMatch` server action

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`

**Interfaces:**
- Consumes: `pickFinalists` from `@/lib/tournament/playoffs` (Task 1);
  `computeStandings` from `@/lib/tournament/standings` (already imported
  in this file — confirm the import exists, it's used by
  `generateSemifinalMatches` a few lines above where you're adding this);
  `MatchResult` type from `@/lib/types` (already imported in this file).
- Produces: `skipToFinalMatch(tournamentId: string): Promise<void>`,
  exported from `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`.
  Task 3 imports and binds this to a form action, the same way it already
  binds `generateFinalMatch`.

This task has no new pure logic of its own — it's a thin action wrapper
around Task 1's function, mirroring the existing `generateFinalMatch` in
the same file. Per this project's established convention, server actions
in this file are not directly unit-tested (there is no test file for
`actions.ts` in this directory); correctness is verified by the build
passing and by manual regression in Task 4.

- [ ] **Step 1: Add the import**

In `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`, find:

```typescript
import { generateSemifinals } from '@/lib/tournament/playoffs';
```

Replace with:

```typescript
import { generateSemifinals, pickFinalists } from '@/lib/tournament/playoffs';
```

- [ ] **Step 2: Add the action**

In the same file, add this function immediately after the existing
`generateSemifinalMatches` function (right before `export async function
generateFinalMatch(tournamentId: string) {`):

```typescript
export async function skipToFinalMatch(tournamentId: string) {
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
  const { teamAId, teamBId } = pickFinalists(standings);

  const { error: insertError } = await supabase.from('matches').insert({
    tournament_id: tournamentId,
    round: 1,
    stage: 'final' as const,
    team_a_id: teamAId,
    team_b_id: teamBId,
    status: 'pending' as const,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}
```

- [ ] **Step 3: Run the build**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/actions.ts"
git commit -m "feat: add skipToFinalMatch server action"
```

---

### Task 3: Wire the button into the Bracket page

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`

**Interfaces:**
- Consumes: `skipToFinalMatch` from `./actions` (Task 2); `outlineButtonClass`
  from `@/app/components/ui` (already imported in this file, used
  elsewhere on the same page — see the existing `<button ... className={outlineButtonClass}>`
  around line 345).

- [ ] **Step 1: Add the import**

Find:

```typescript
import { generateBracket, generatePopcornBracket, advanceGauntletRound, advanceClaimTheThroneRound, advanceUpAndDownRiverRound, generateLeaguePlayoffsBracket, regenerateLeaguePlayoffsBracket, generateSemifinalMatches, generateFinalMatch, updateMatchTeams, unlockTournamentResults, lockTournamentResults } from './actions';
```

Replace with:

```typescript
import { generateBracket, generatePopcornBracket, advanceGauntletRound, advanceClaimTheThroneRound, advanceUpAndDownRiverRound, generateLeaguePlayoffsBracket, regenerateLeaguePlayoffsBracket, generateSemifinalMatches, generateFinalMatch, skipToFinalMatch, updateMatchTeams, unlockTournamentResults, lockTournamentResults } from './actions';
```

- [ ] **Step 2: Bind the action and add the gating condition**

Find:

```typescript
  const generateSemifinalMatchesWithId = generateSemifinalMatches.bind(null, id);
  const generateFinalMatchWithId = generateFinalMatch.bind(null, id);
```

Replace with:

```typescript
  const generateSemifinalMatchesWithId = generateSemifinalMatches.bind(null, id);
  const generateFinalMatchWithId = generateFinalMatch.bind(null, id);
  const skipToFinalMatchWithId = skipToFinalMatch.bind(null, id);
```

Find:

```typescript
  const showGenerateSemifinals =
    isLeaguePlayoffs &&
    allLeagueComplete &&
    semifinalMatches.length === 0 &&
    teamCount >= 4;
  const showGenerateFinal = isLeaguePlayoffs && allSemifinalComplete && !hasFinalMatch;
```

Replace with:

```typescript
  const showGenerateSemifinals =
    isLeaguePlayoffs &&
    allLeagueComplete &&
    semifinalMatches.length === 0 &&
    !hasFinalMatch &&
    teamCount >= 4;
  const showSkipToFinal = showGenerateSemifinals;
  const showGenerateFinal = isLeaguePlayoffs && allSemifinalComplete && !hasFinalMatch;
```

(This also adds `!hasFinalMatch` to `showGenerateSemifinals` itself, so
it exactly matches the gate documented in the spec — today it's
technically unreachable once a Final exists because a Final can't exist
without 2 complete Semifinals in the old flow, but with the new skip path
a Final can now exist with zero Semifinals, so this condition must be
explicit rather than implied.)

- [ ] **Step 3: Render the new button next to "Generate Semifinals"**

Find:

```tsx
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
```

Replace with:

```tsx
      {showGenerateSemifinals && (
        <div className={`${cardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            League complete. Generate the semifinals from the top 4 teams,
            or skip straight to the final if you're short on time.
          </p>
          <div className="flex items-center justify-center gap-3">
            <form action={generateSemifinalMatchesWithId}>
              <button type="submit" className={accentButtonClass}>
                Generate Semifinals
              </button>
            </form>
            {showSkipToFinal && (
              <form action={skipToFinalMatchWithId}>
                <button type="submit" className={outlineButtonClass}>
                  Skip Semifinals — Go to Final
                </button>
              </form>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 175 tests pass
(172 existing + 3 new `pickFinalists` tests from Task 1).

- [ ] **Step 5: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/page.tsx"
git commit -m "feat: show Skip Semifinals button on the Bracket page"
```

---

### Task 4: Push, verify CI, manual regression

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

- Create (or use) a League + Playoffs tournament with 4+ teams. Complete
  every league match.
- Confirm both **"Generate Semifinals"** and **"Skip Semifinals — Go to
  Final"** buttons appear side by side.
- Click **"Skip Semifinals — Go to Final"**. Confirm a Final match
  appears immediately, pairing the #1 and #2 teams shown in Standings —
  and no Semifinal matches were created.
- Confirm both buttons are now gone (neither "Generate Semifinals" nor
  "Skip Semifinals" should still show).
- Confirm "Regenerate All Rounds" (if it was visible before) is now gone
  too — a Final match exists, so the tournament is considered
  playoffs-started.
- Enter a score for the Final match and confirm the tournament completes
  (champion shown) exactly as it would via the normal Semifinal path.
- Separately, on a different League + Playoffs tournament (or by
  resetting/using a fresh one), click **"Generate Semifinals"** instead
  and confirm the **"Skip Semifinals"** button disappears immediately
  (the two paths remain mutually exclusive).

Clean up any disposable test data used for this check afterward.
