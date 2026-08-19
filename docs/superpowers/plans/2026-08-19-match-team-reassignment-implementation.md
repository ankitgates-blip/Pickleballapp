# Match Team Reassignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the organizer reassign which two teams are on a match — completed or not — directly from the Bracket page, without resetting the match's score.

**Architecture:** A new server action, `updateMatchTeams`, updates `matches.team_a_id`/`team_b_id` for one match. The Bracket page's existing per-match `<details>` disclosure (which already holds an inline score-entry form) gains a second inline form: two `<select>` dropdowns listing every team in the tournament, bound to the new action.

**Tech Stack:** Next.js App Router Server Actions, Supabase Postgres.

## Global Constraints

- Reassigning a match's teams must NOT touch `score_a`, `score_b`, or `status` — only `team_a_id`/`team_b_id`.
- Team A and Team B must be different teams — reject if they're the same.
- Works on every match on the Bracket page (completed or not) — no restriction based on `status`.
- The reassignment form shows a non-blocking informational caption about downstream consequences (standings/seeding/later rounds not being recomputed) — it never gates or confirms the action.
- No restriction on which team can be picked beyond "A ≠ B" — no double-booking check against other matches in the same round.

---

### Task 1: `updateMatchTeams` server action

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`

**Interfaces:**
- Produces: `updateMatchTeams(tournamentId: string, matchId: string, formData: FormData): Promise<void>`, exported from `./actions`, consumed by Task 2's Bracket page.

- [ ] **Step 1: Add the action to the end of the file**

In `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`, find the last lines of the file:

```typescript
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

Add immediately after (keep everything above unchanged, this is a pure append):

```typescript

export async function updateMatchTeams(
  tournamentId: string,
  matchId: string,
  formData: FormData
) {
  const { supabase } = await requireOrganizer();
  const teamAId = formData.get('teamAId') as string;
  const teamBId = formData.get('teamBId') as string;

  if (teamAId === teamBId) {
    throw new Error('Team A and Team B must be different teams');
  }

  const { error } = await supabase
    .from('matches')
    .update({ team_a_id: teamAId, team_b_id: teamBId })
    .eq('id', matchId)
    .eq('tournament_id', tournamentId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}
```

- [ ] **Step 2: Run the build to verify it compiles**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds. This action isn't called from any page yet (Task 2 does that), so the build only confirms it type-checks and has no syntax errors.

- [ ] **Step 3: Run the full test suite**

Run: `cd apps/organizer-web && npm test`
Expected: all existing tests still pass — this is a new server action with no pure-function logic, consistent with this codebase's convention that server actions aren't unit-tested.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/actions.ts"
git commit -m "feat: add updateMatchTeams server action"
```

---

### Task 2: Wire the team-reassignment form into the Bracket page

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`

**Interfaces:**
- Consumes: `updateMatchTeams` from `./actions` (Task 1); the page's own existing `teams` (fetched at the top of the page, `{ id, player_1_id, player_2_id }[]`) and `teamById: Map<string, string>` variables, already in scope inside `renderMatchList`.

- [ ] **Step 1: Add `updateMatchTeams` to the existing action import**

Find:

```tsx
import { generateBracket, generatePopcornBracket, advanceGauntletRound, advanceClaimTheThroneRound, advanceUpAndDownRiverRound, advanceLeaguePlayoffsRound, generateSemifinalMatches, generateFinalMatch } from './actions';
```

Replace with:

```tsx
import { generateBracket, generatePopcornBracket, advanceGauntletRound, advanceClaimTheThroneRound, advanceUpAndDownRiverRound, advanceLeaguePlayoffsRound, generateSemifinalMatches, generateFinalMatch, updateMatchTeams } from './actions';
```

- [ ] **Step 2: Bind the new action alongside the existing score-entry bind**

Find:

```tsx
        const isComplete = m.status === 'complete';
        const teamAWon = isComplete && (m.score_a ?? 0) > (m.score_b ?? 0);
        const teamBWon = isComplete && (m.score_b ?? 0) > (m.score_a ?? 0);
        const enterScoreForMatch = enterScore.bind(null, id, m.id);
```

Replace with:

```tsx
        const isComplete = m.status === 'complete';
        const teamAWon = isComplete && (m.score_a ?? 0) > (m.score_b ?? 0);
        const teamBWon = isComplete && (m.score_b ?? 0) > (m.score_a ?? 0);
        const enterScoreForMatch = enterScore.bind(null, id, m.id);
        const updateMatchTeamsForMatch = updateMatchTeams.bind(null, id, m.id);
```

- [ ] **Step 3: Add the team-reassignment form after the existing score form, inside the same `<details>`**

Find:

```tsx
                <button type="submit" className={primaryButtonClass}>
                  Save
                </button>
              </form>
            </details>
          </li>
        );
      })}
    </ul>
  );
```

Replace with:

```tsx
                <button type="submit" className={primaryButtonClass}>
                  Save
                </button>
              </form>
              <div className="mt-3 pl-1">
                <p className="text-xs text-slate-400 mb-2">
                  Changing a match&apos;s teams doesn&apos;t recompute any standings, seeding, or
                  later rounds already generated from it — double-check anything downstream that
                  depended on this match.
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
            </details>
          </li>
        );
      })}
    </ul>
  );
```

- [ ] **Step 4: Run the build**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Run the full test suite**

Run: `cd apps/organizer-web && npm test`
Expected: all tests still pass — this task adds no new pure-function logic, consistent with this codebase's convention that pages aren't unit-tested.

- [ ] **Step 6: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/page.tsx"
git commit -m "feat: wire team-reassignment form into the Bracket page"
```

---

### Task 3: Push and verify CI + manual regression

**Files:** none (verification-only task).

- [ ] **Step 1: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 2: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 3: Manual regression**

No database migration is needed for this feature. On any tournament's Bracket page:

- Expand a match's disclosure and confirm the new "Team A / vs / Team B / Save Teams" row appears below the existing score form, with the informational caption above it.
- Confirm both dropdowns default to the match's current teams.
- Pick a different team for Team A, click Save Teams, and confirm the match now shows the new team (both in the summary line and in the dropdown's new default).
- Confirm this works on an already-completed match (with a recorded score) and that the score is unaffected by the team change.
- Try selecting the same team for both A and B and confirm it's rejected with a clear error (not silently applied).
- Confirm the score form's own behavior is completely unaffected (still saves scores correctly, independent of the new form).

This is the fix path for the PickleTurf Clash final (2026-08-18) whose recorded teams were wrong — once this ships, use it to correct that match to Ranjit & Ziad vs. Gautam & Daniel, 7-11.

Clean up any disposable test data used for this check afterward.
