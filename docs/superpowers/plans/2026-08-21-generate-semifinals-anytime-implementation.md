# Generate Semifinals From Any Point Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let "Generate Semifinals" work at any point in a League +
Playoffs tournament (4+ teams, no semis/final yet) — not only after
every league round is scored — seeding pairings from whatever standings
exist at that moment, with the same partial-data fallback and
duplicate-match guard already shipped for "Skip Semifinals — Go to
Final."

**Architecture:** `generateSemifinalMatches` (in
`apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`) is changed
to mirror `skipToFinalMatch` exactly: add the existence-check guard,
fetch the tournament's teams, and pass standings through the existing
`fillStandingsGaps` before generating pairings. The Bracket page's
`showGenerateSemifinals` condition drops its `allLeagueComplete`
requirement, making it identical to the already-shipped
`showSkipToFinal`, so the render block's copy simplifies (both buttons
always show together once the gate is met).

**Tech Stack:** Next.js Server Actions, Supabase, Vitest.

## Global Constraints

- "Generate Semifinals" new gate: `isLeaguePlayoffs &&
  semifinalMatches.length === 0 && !hasFinalMatch && teamCount >= 4` —
  identical to "Skip Semifinals — Go to Final"'s existing gate.
- `generateSemifinalMatches` must reject (server-side) if a Semifinal or
  Final match already exists for the tournament — same guard shape as
  `skipToFinalMatch`.
- `generateSemifinalMatches` must work correctly with 0 league matches
  played, reusing the existing `fillStandingsGaps(standings, teamIds)`
  from `@/lib/tournament/playoffs`.
- No confirmation dialog, no minimum-rounds-played threshold.
- Unplayed league rounds are left untouched — no auto-cancellation, no
  deletion.
- No database migration.

---

### Task 1: Mirror `skipToFinalMatch`'s guard and partial-data fallback in `generateSemifinalMatches`

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`

**Interfaces:**
- Consumes: `fillStandingsGaps` from `@/lib/tournament/playoffs` (already
  imported in this file, used by `skipToFinalMatch`).

This task has no new pure logic — it applies the exact same two changes
`skipToFinalMatch` already has, to the neighboring `generateSemifinalMatches`
function. Per this project's established convention, `actions.ts` in this
directory is not directly unit-tested; correctness is verified by the
build passing and by manual regression in Task 3.

- [ ] **Step 1: Add the existence guard and the teams/fillStandingsGaps fallback**

In `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`, find this
exact block (the full body of `generateSemifinalMatches`, from its
opening line through the `generateSemifinals` call):

```typescript
export async function generateSemifinalMatches(tournamentId: string) {
  const { supabase } = await requireOrganizer();

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
  const pairings = generateSemifinals(standings.slice(0, 4));
```

Replace with:

```typescript
export async function generateSemifinalMatches(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { count: existingPlayoffMatches, error: existingError } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .in('stage', ['semifinal', 'final']);

  if (existingError) {
    throw new Error(existingError.message);
  }

  if ((existingPlayoffMatches ?? 0) > 0) {
    throw new Error('Semifinals or a final already exist for this tournament.');
  }

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
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

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
  const pairings = generateSemifinals(completeStandings.slice(0, 4));
```

(Everything after this point — the `matches` insert, its error check, and
`revalidatePath` — is unchanged and not part of this find/replace.)

- [ ] **Step 2: Run the build**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/actions.ts"
git commit -m "feat: generate semifinals from partial or zero league data"
```

---

### Task 2: Drop the league-completeness requirement on the Bracket page

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`

**Interfaces:**
- Consumes: `showGenerateSemifinals`, `showSkipToFinal` (existing page
  state, being changed by this task).

- [ ] **Step 1: Make the two gates identical**

Find:

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

Replace with:

```typescript
  const showGenerateSemifinals =
    isLeaguePlayoffs &&
    semifinalMatches.length === 0 &&
    !hasFinalMatch &&
    teamCount >= 4;
  const showSkipToFinal = showGenerateSemifinals;
  const showGenerateFinal = isLeaguePlayoffs && allSemifinalComplete && !hasFinalMatch;
```

(This restores `showSkipToFinal = showGenerateSemifinals` as a direct
alias — the same shape it had before the "Skip-to-Final Available
Anytime" feature decoupled them. Now that `showGenerateSemifinals` no
longer requires `allLeagueComplete`, aliasing is correct again: both
buttons genuinely share one condition.)

- [ ] **Step 2: Simplify the render block's copy**

Find:

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

Replace with:

```tsx
      {showSkipToFinal && (
        <div className={`${cardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            {allLeagueComplete
              ? "League complete. Generate the semifinals from the top 4 teams, or skip straight to the final if you're short on time."
              : "Short on time? You don't have to finish every round — generate the semifinals from the top 4 teams by current standings, or skip straight to the final with the top 2."}
          </p>
          <div className="flex items-center justify-center gap-3">
            <form action={generateSemifinalMatchesWithId}>
              <button type="submit" className={accentButtonClass}>
                Generate Semifinals
              </button>
            </form>
            <form action={skipToFinalMatchWithId}>
              <button type="submit" className={outlineButtonClass}>
                Skip Semifinals — Go to Final
              </button>
            </form>
          </div>
        </div>
      )}
```

(Both buttons now render unconditionally inside the outer
`{showSkipToFinal && (...)}` block, since `showGenerateSemifinals` and
`showSkipToFinal` are the same value again — no inner conditional needed
around the "Generate Semifinals" form. The copy still distinguishes
league-complete vs. partial standings for the organizer's information,
now checking `allLeagueComplete` directly rather than the no-longer-
distinguishing `showGenerateSemifinals`.)

- [ ] **Step 3: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 179 tests pass
(this task adds no new tests — `fillStandingsGaps` and its 4 tests
already exist from the prior feature).

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/page.tsx"
git commit -m "feat: show Generate Semifinals at any point in the league stage"
```

---

### Task 3: Push, verify CI, manual regression

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

- On a League + Playoffs tournament with 4+ teams, generate the full
  round-robin schedule (e.g. 6 rounds) but score only some of the
  rounds (e.g. through Round 5, leaving Round 6 unplayed). Open the
  Bracket page. Confirm BOTH "Generate Semifinals" and "Skip Semifinals
  — Go to Final" are visible, with the partial-standings copy variant.
- Click "Generate Semifinals". Confirm 2 Semifinal matches are created,
  pairing the top 4 teams by the standings as they stood after Round 5
  — not blocked by Round 6 being unplayed.
- Confirm Round 6's matches are still visible on the Bracket page,
  untouched (still pending, not deleted or marked complete).
- Confirm both "Generate Semifinals" and "Skip Semifinals" now
  disappear (mutual exclusivity with the Semifinal stage holds).
- On a fresh League + Playoffs tournament with 4+ teams and the
  schedule generated but ZERO matches scored, confirm "Generate
  Semifinals" is visible immediately (before any round is played) and
  clicking it succeeds without error, producing a Semifinal pairing.
- On a different tournament, complete the entire league and confirm
  both buttons still show with the "league complete" copy variant, and
  that the existing playoff flow (Generate Semifinals → complete both →
  Generate Final) still works exactly as before.

Clean up any disposable test data used for this check afterward.
