# Skip-to-Final Available Anytime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Skip Semifinals — Go to Final" available at any point in a
League + Playoffs tournament (not only after the league stage fully
completes), picking the top 2 teams from current — possibly partial or
entirely unplayed — standings.

**Architecture:** A new pure function `fillStandingsGaps` (in the same
file as `pickFinalists`, from the prior feature) appends a 0-0 row for
any team missing from `computeStandings`'s output, so `pickFinalists`
always has enough rows to choose from. `skipToFinalMatch` fetches the
tournament's teams and calls the new function before picking finalists.
The Bracket page's `showSkipToFinal` condition is decoupled from
`showGenerateSemifinals` (which keeps its existing `allLeagueComplete`
requirement), and the render block is restructured so the "Skip
Semifinals" button can appear on its own before league play finishes.

**Tech Stack:** Next.js Server Actions, Supabase, Vitest.

## Global Constraints

- "Generate Semifinals" is unchanged — still requires `allLeagueComplete`.
- "Skip Semifinals — Go to Final" no longer requires `allLeagueComplete`.
  Its full gate becomes: `isLeaguePlayoffs && semifinalMatches.length ===
  0 && !hasFinalMatch && teamCount >= 4`.
- No confirmation dialog, no minimum matches-played threshold — the
  button must work even with zero league matches played, as long as 4+
  teams exist.
- Unplayed league matches are left untouched — no auto-cancellation, no
  deletion.
- No database migration.

---

### Task 1: `fillStandingsGaps` pure function

**Files:**
- Modify: `apps/organizer-web/lib/tournament/playoffs.ts`
- Test: `apps/organizer-web/lib/tournament/playoffs.test.ts`

**Interfaces:**
- Consumes: `StandingsRow` type from `@/lib/types` (same type already
  used by `generateSemifinals`/`pickFinalists` in this file).
- Produces: `fillStandingsGaps(standings: StandingsRow[], teamIds:
  string[]): StandingsRow[]`, exported from
  `apps/organizer-web/lib/tournament/playoffs.ts`. Task 2 imports and
  calls this, feeding its result into the existing `pickFinalists`.

- [ ] **Step 1: Write the failing tests**

Open `apps/organizer-web/lib/tournament/playoffs.test.ts`. It currently
ends with a `describe('pickFinalists', ...)` block. Add a new `describe`
block after it, in the same file:

```typescript
describe('fillStandingsGaps', () => {
  it('returns standings unchanged when every team already has a row', () => {
    const standings = [row('a'), row('b')];
    const result = fillStandingsGaps(standings, ['a', 'b']);
    expect(result).toEqual([row('a'), row('b')]);
  });

  it('appends a 0-0 row for teams missing from standings, in teamIds order', () => {
    const standings = [row('a')];
    const result = fillStandingsGaps(standings, ['a', 'b', 'c']);
    expect(result).toEqual([row('a'), row('b'), row('c')]);
  });

  it('handles empty standings (zero matches played)', () => {
    const result = fillStandingsGaps([], ['a', 'b', 'c', 'd']);
    expect(result).toEqual([row('a'), row('b'), row('c'), row('d')]);
  });

  it('does not duplicate a team that already has a real record', () => {
    const withRecord: StandingsRow = { teamId: 'a', wins: 3, losses: 1, pointsFor: 44, pointsAgainst: 20 };
    const result = fillStandingsGaps([withRecord], ['a', 'b']);
    expect(result).toEqual([withRecord, row('b')]);
  });
});
```

This test file's existing `row(teamId)` helper (returns a 0-0-0-0
`StandingsRow`) is reused as-is — no changes needed to it.

Also update the import at the top of the file:

Find:
```typescript
import { generateSemifinals, pickFinalists } from './playoffs';
```

Replace with:
```typescript
import { generateSemifinals, pickFinalists, fillStandingsGaps } from './playoffs';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/organizer-web && npx vitest run lib/tournament/playoffs.test.ts`
Expected: FAIL — `fillStandingsGaps` is not exported from `./playoffs`.

- [ ] **Step 3: Implement `fillStandingsGaps`**

In `apps/organizer-web/lib/tournament/playoffs.ts`, add this function
below the existing `pickFinalists`:

```typescript
export function fillStandingsGaps(
  standings: StandingsRow[],
  teamIds: string[]
): StandingsRow[] {
  const seen = new Set(standings.map((s) => s.teamId));
  const missing: StandingsRow[] = teamIds
    .filter((teamId) => !seen.has(teamId))
    .map((teamId) => ({ teamId, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }));

  return [...standings, ...missing];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/organizer-web && npx vitest run lib/tournament/playoffs.test.ts`
Expected: PASS — all tests in the file green, including the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/lib/tournament/playoffs.ts apps/organizer-web/lib/tournament/playoffs.test.ts
git commit -m "feat: add fillStandingsGaps pure function"
```

---

### Task 2: Use `fillStandingsGaps` in `skipToFinalMatch`

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`

**Interfaces:**
- Consumes: `fillStandingsGaps` from `@/lib/tournament/playoffs` (Task 1).

This task has no new pure logic of its own — it wires Task 1's function
into the existing `skipToFinalMatch` action, and fetches the one extra
piece of data (the tournament's team IDs) that function needs. Per this
project's established convention, `actions.ts` in this directory is not
directly unit-tested; correctness is verified by the build passing and
by manual regression in Task 4.

- [ ] **Step 1: Add the import**

In `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`, find:

```typescript
import { generateSemifinals, pickFinalists } from '@/lib/tournament/playoffs';
```

Replace with:

```typescript
import { generateSemifinals, pickFinalists, fillStandingsGaps } from '@/lib/tournament/playoffs';
```

- [ ] **Step 2: Fetch the tournament's teams and fill standings gaps**

In the same file, find this exact block inside `skipToFinalMatch`
(everything from the league-matches fetch through the `pickFinalists`
call):

```typescript
  const { data: leagueMatches, error: matchesError } = await supabase
    .from('matches')
    .select('team_a_id, team_b_id, score_a, score_b, status')
    .eq('tournament_id', tournamentId)
    .eq('stage', 'league')
    .order('round', { ascending: true });

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
```

Replace with:

```typescript
  const { data: leagueMatches, error: matchesError } = await supabase
    .from('matches')
    .select('team_a_id, team_b_id, score_a, score_b, status')
    .eq('tournament_id', tournamentId)
    .eq('stage', 'league')
    .order('round', { ascending: true });

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const { data: teamsData, error: teamsError } = await supabase
    .from('teams')
    .select('id')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true });

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  const matchResults: MatchResult[] = (leagueMatches ?? []).map((m) => ({
    teamAId: m.team_a_id!,
    teamBId: m.team_b_id,
    scoreA: m.score_a,
    scoreB: m.score_b,
    status: m.status as 'pending' | 'complete',
  }));

  const standings = computeStandings(matchResults);
  const teamIds = (teamsData ?? []).map((t) => t.id);
  const completeStandings = fillStandingsGaps(standings, teamIds);
  const { teamAId, teamBId } = pickFinalists(completeStandings);
```

- [ ] **Step 3: Run the build**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/actions.ts"
git commit -m "feat: pick finalists from partial or zero league data"
```

---

### Task 3: Decouple the Bracket page gate and copy

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`

**Interfaces:**
- Consumes: `showGenerateSemifinals`, `showSkipToFinal` (existing page
  state, being changed by this task).

- [ ] **Step 1: Decouple the two gate conditions**

Find:

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

Replace with:

```typescript
  const showGenerateSemifinals =
    isLeaguePlayoffs &&
    allLeagueComplete &&
    semifinalMatches.length === 0 &&
    !hasFinalMatch &&
    teamCount >= 4;
  const showSkipToFinal =
    isLeaguePlayoffs &&
    semifinalMatches.length === 0 &&
    !hasFinalMatch &&
    teamCount >= 4;
  const showGenerateFinal = isLeaguePlayoffs && allSemifinalComplete && !hasFinalMatch;
```

- [ ] **Step 2: Restructure the render block**

Find this exact block:

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

Replace with:

```tsx
      {showSkipToFinal && (
        <div className={`${cardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            {showGenerateSemifinals
              ? "League complete. Generate the semifinals from the top 4 teams, or skip straight to the final if you're short on time."
              : 'Short on time? Skip the semifinals and send the top 2 teams (by current standings) straight to the final.'}
          </p>
          <div className="flex items-center justify-center gap-3">
            {showGenerateSemifinals && (
              <form action={generateSemifinalMatchesWithId}>
                <button type="submit" className={accentButtonClass}>
                  Generate Semifinals
                </button>
              </form>
            )}
            <form action={skipToFinalMatchWithId}>
              <button type="submit" className={outlineButtonClass}>
                Skip Semifinals — Go to Final
              </button>
            </form>
          </div>
        </div>
      )}
```

- [ ] **Step 3: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 179 tests pass
(175 existing + 4 new `fillStandingsGaps` tests from Task 1).

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/page.tsx"
git commit -m "feat: show Skip Semifinals before league play completes"
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

- On a League + Playoffs tournament with 4+ teams and **zero** league
  matches scored yet, open the Bracket page. Confirm the **"Skip
  Semifinals — Go to Final"** button is visible on its own (no
  "Generate Semifinals" button, since the league isn't complete).
- Click it. Confirm a Final match is created pairing two of the teams
  (since no one has a real record yet, any 2 in the tournament's team
  order is correct — there's no "wrong" answer at 0 matches played).
- On a different League + Playoffs tournament, score **some but not
  all** league matches (a genuine partial standings scenario). Confirm
  "Skip Semifinals — Go to Final" is visible, "Generate Semifinals" is
  NOT. Click Skip and confirm the Final pairs the two teams currently
  leading the (partial) standings.
- On a third tournament, complete the ENTIRE league. Confirm BOTH
  buttons appear side by side again, with the original combined
  wording ("League complete. Generate the semifinals... or skip
  straight to the final...").
- Confirm unplayed league matches (in the partial-standings tournament)
  are still visible/untouched on the Bracket page after skipping — not
  deleted or marked complete.
- Confirm, in every case above, that after clicking Skip, both buttons
  disappear (mutual exclusivity still holds).

Clean up any disposable test data used for this check afterward.
