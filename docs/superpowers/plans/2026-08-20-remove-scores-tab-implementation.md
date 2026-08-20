# Remove Scores Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the redundant "Scores" tab/page — scores are already entered from the Bracket tab.

**Architecture:** Delete the Matches page, remove its nav entry and the Bracket page's link to it, and drop the now-pointless `revalidatePath` calls for the route being removed. `matches/actions.ts` (the shared `enterScore` action) stays untouched.

**Tech Stack:** Next.js App Router.

## Global Constraints

- `apps/organizer-web/app/tournaments/[id]/matches/actions.ts` is NOT deleted or modified except for removing its own dead `revalidatePath` call — `enterScore` stays fully functional, still imported directly by the Bracket page.
- No change to score-entry behavior itself.

---

### Task 1: Remove the Scores tab

**Files:**
- Delete: `apps/organizer-web/app/tournaments/[id]/matches/page.tsx`
- Modify: `apps/organizer-web/app/components/TournamentNav.tsx`
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`
- Modify: `apps/organizer-web/app/tournaments/[id]/matches/actions.ts`

- [ ] **Step 1: Delete the Matches page**

Delete `apps/organizer-web/app/tournaments/[id]/matches/page.tsx` entirely.

- [ ] **Step 2: Remove the nav entry**

In `apps/organizer-web/app/components/TournamentNav.tsx`, find:

```tsx
const steps = [
  { key: 'roster', label: 'Roster' },
  { key: 'teams', label: 'Teams' },
  { key: 'bracket', label: 'Bracket' },
  { key: 'matches', label: 'Scores' },
  { key: 'standings', label: 'Standings' },
  { key: 'results', label: 'Results' },
] as const;
```

Replace with:

```tsx
const steps = [
  { key: 'roster', label: 'Roster' },
  { key: 'teams', label: 'Teams' },
  { key: 'bracket', label: 'Bracket' },
  { key: 'standings', label: 'Standings' },
  { key: 'results', label: 'Results' },
] as const;
```

- [ ] **Step 3: Remove the "Enter scores →" link on the Bracket page**

In `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`, find:

```tsx
      {hasLeagueMatches && (
        <p className="mt-6 flex gap-4">
          <Link href={`/tournaments/${id}/matches`} className={linkClass}>
            Enter scores →
          </Link>
          <Link href={`/tournaments/${id}/standings`} className={linkClass}>
            View standings →
          </Link>
        </p>
```

Replace with:

```tsx
      {hasLeagueMatches && (
        <p className="mt-6 flex gap-4">
          <Link href={`/tournaments/${id}/standings`} className={linkClass}>
            View standings →
          </Link>
        </p>
```

- [ ] **Step 4: Drop the dead `revalidatePath` calls for `/matches`**

In `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`, these
two edits are independent of each other and can be applied in either
order — each find block below is the complete, uniquely-identifying
function body, so neither depends on the other having already landed.

Find:

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
```

Replace with:

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
}
```

Find:

```typescript
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

Replace with:

```typescript
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
}
```

In `apps/organizer-web/app/tournaments/[id]/matches/actions.ts`, find:

```typescript
  revalidatePath(`/tournaments/${tournamentId}/matches`);
  revalidatePath(`/tournaments/${tournamentId}/standings`);
  revalidatePath(`/tournaments/${tournamentId}/bracket`);
  revalidatePath('/tournaments');
}
```

Replace with:

```typescript
  revalidatePath(`/tournaments/${tournamentId}/standings`);
  revalidatePath(`/tournaments/${tournamentId}/bracket`);
  revalidatePath('/tournaments');
}
```

- [ ] **Step 5: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors (deleting the page
removes it from the route tree cleanly — nothing else imports
`matches/page.tsx`); all 163 tests pass — this task changes no tested
pure-function logic.

- [ ] **Step 6: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/matches/page.tsx" apps/organizer-web/app/components/TournamentNav.tsx "apps/organizer-web/app/tournaments/[id]/bracket/page.tsx" "apps/organizer-web/app/tournaments/[id]/bracket/actions.ts" "apps/organizer-web/app/tournaments/[id]/matches/actions.ts"
git commit -m "feat: remove the redundant Scores tab"
```

Note: `git add` on a deleted file stages the deletion — this is correct
and expected.

---

### Task 2: Push, verify CI, manual regression

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

- Open any tournament's nav bar — confirm "Scores" no longer appears
  (Roster / Teams / Bracket / Standings / Results only).
- On the Bracket page, confirm score entry still works exactly as before
  via each match's inline form.
- Confirm the "Enter scores →" link is gone from the bottom of the
  Bracket page; "View standings →" is still there.
- Navigate directly to `/tournaments/<id>/matches` in the browser —
  confirm it 404s (the page no longer exists) rather than crashing.

Clean up any disposable test data used for this check afterward.
