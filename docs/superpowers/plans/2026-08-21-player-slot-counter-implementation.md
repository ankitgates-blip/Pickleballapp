# Player Slot Counter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show "Players (N/max)" on the Roster page when a tournament
has an optional player cap set, and block adding more players past
that cap — enforced server-side, not just hidden in the UI.

**Architecture:** A new nullable `max_players` column on `tournaments`,
two new pure functions (`slotsRemaining`, `isRosterFull`) shared between
the Roster page's display/gating and the two player-insert actions'
server-side guards.

**Tech Stack:** Next.js Server Actions, Supabase, Vitest.

## Global Constraints

- `max_players` is nullable — `null` means no cap, and the tournament
  behaves exactly as it does today (no counter, no "full" state).
- Settable at tournament creation (optional field) and editable
  afterward from the Roster page's "Tournament Details" card.
- Enforced server-side in both `addExistingPeople` and
  `confirmAddPlayers` (the two actions that actually insert `players`
  rows) — a batch that would push the roster over the cap is rejected
  entirely, with an error stating how many slots are actually left.
  `startAddPlayers` (stages names for review, doesn't insert) is not
  itself guarded.
- When full: "Add Existing Players" and "Add New Players" sections are
  replaced with "All Slots Full — no more sign up." Removing a player
  is always available and re-opens a slot.

---

### Task 1: `slotsRemaining` / `isRosterFull` pure functions

**Files:**
- Create: `apps/organizer-web/lib/tournament/capacity.ts`
- Create: `apps/organizer-web/lib/tournament/capacity.test.ts`

**Interfaces:**
- Produces: `slotsRemaining(maxPlayers: number | null, currentCount: number): number | null`
  and `isRosterFull(maxPlayers: number | null, currentCount: number): boolean`,
  both exported from `apps/organizer-web/lib/tournament/capacity.ts`.
  Task 4 imports and calls these — `isRosterFull` on the Roster page for
  display/gating, `slotsRemaining` in `roster/actions.ts` for the
  server-side guard's error message.

- [ ] **Step 1: Write the failing tests**

Create `apps/organizer-web/lib/tournament/capacity.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { slotsRemaining, isRosterFull } from './capacity';

describe('slotsRemaining', () => {
  it('returns null when there is no cap', () => {
    expect(slotsRemaining(null, 5)).toBeNull();
  });

  it('returns the number of open slots', () => {
    expect(slotsRemaining(12, 11)).toBe(1);
  });

  it('never returns negative when the roster is over capacity', () => {
    expect(slotsRemaining(10, 14)).toBe(0);
  });

  it('returns the full cap when nobody has been added yet', () => {
    expect(slotsRemaining(12, 0)).toBe(12);
  });
});

describe('isRosterFull', () => {
  it('is never full when there is no cap', () => {
    expect(isRosterFull(null, 999)).toBe(false);
  });

  it('is full when the count equals the cap', () => {
    expect(isRosterFull(12, 12)).toBe(true);
  });

  it('is full when the count exceeds the cap', () => {
    expect(isRosterFull(10, 14)).toBe(true);
  });

  it('is not full when the count is below the cap', () => {
    expect(isRosterFull(12, 11)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/organizer-web && npx vitest run lib/tournament/capacity.test.ts`
Expected: FAIL — `./capacity` does not exist.

- [ ] **Step 3: Implement the two functions**

Create `apps/organizer-web/lib/tournament/capacity.ts`:

```typescript
export function slotsRemaining(maxPlayers: number | null, currentCount: number): number | null {
  if (maxPlayers === null) return null;
  return Math.max(0, maxPlayers - currentCount);
}

export function isRosterFull(maxPlayers: number | null, currentCount: number): boolean {
  if (maxPlayers === null) return false;
  return currentCount >= maxPlayers;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/organizer-web && npx vitest run lib/tournament/capacity.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/lib/tournament/capacity.ts apps/organizer-web/lib/tournament/capacity.test.ts
git commit -m "feat: add slotsRemaining and isRosterFull pure functions"
```

---

### Task 2: Migration and the "New Tournament" form field

**Files:**
- Create: `supabase/migrations/20260821130000_add_tournament_max_players.sql`
- Modify: `apps/organizer-web/app/tournaments/new/page.tsx`
- Modify: `apps/organizer-web/app/tournaments/new/actions.ts`

**Interfaces:** None consumed from Task 1 — this task only adds the
column and the creation-time input for it.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260821130000_add_tournament_max_players.sql`:

```sql
alter table public.tournaments add column max_players integer;
```

- [ ] **Step 2: Add the form field**

In `apps/organizer-web/app/tournaments/new/page.tsx`, find:

```tsx
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Date</label>
            <input name="date" type="date" required className={inputClass} />
          </div>
          <FormatFields />
```

Replace with:

```tsx
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Date</label>
            <input name="date" type="date" required className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Max players (optional)
            </label>
            <input
              name="maxPlayers"
              type="number"
              min={1}
              placeholder="Leave blank for no limit"
              className={inputClass}
            />
          </div>
          <FormatFields />
```

- [ ] **Step 3: Store it in `createTournament`**

In `apps/organizer-web/app/tournaments/new/actions.ts`, find:

```typescript
  const name = formData.get('name') as string;
  const date = formData.get('date') as string;
  const targetScore = Number(formData.get('targetScore'));
```

Replace with:

```typescript
  const name = formData.get('name') as string;
  const date = formData.get('date') as string;
  const maxPlayersRaw = formData.get('maxPlayers') as string;
  const maxPlayers = maxPlayersRaw ? Number(maxPlayersRaw) : null;
  const targetScore = Number(formData.get('targetScore'));
```

Then find:

```typescript
    .insert({
      name,
      date,
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

- [ ] **Step 4: Run the build**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no TypeScript errors. (The migration
itself is not applied to the live database by this step — Task 5
handles that.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260821130000_add_tournament_max_players.sql apps/organizer-web/app/tournaments/new/page.tsx apps/organizer-web/app/tournaments/new/actions.ts
git commit -m "feat: add optional max players field to tournament creation"
```

---

### Task 3: Editable max players on the Roster page's Tournament Details card

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/roster/page.tsx`
- Modify: `apps/organizer-web/app/tournaments/[id]/roster/actions.ts`

**Interfaces:** None consumed from earlier tasks — this task only
wires the existing "Tournament Details" edit form to also carry
`max_players`.

- [ ] **Step 1: Include `max_players` in the tournament query**

In `apps/organizer-web/app/tournaments/[id]/roster/page.tsx`, find:

```tsx
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name, date, format, completed_at, venue_id, timeslot, venues(name)')
    .eq('id', id)
    .single();
```

Replace with:

```tsx
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name, date, format, completed_at, venue_id, timeslot, max_players, venues(name)')
    .eq('id', id)
    .single();
```

- [ ] **Step 2: Add the field to the Tournament Details form**

In the same file, find:

```tsx
          <form action={updateTournamentDetailsWithId} className="flex flex-col sm:flex-row gap-3">
            <select
              name="venueId"
              required
              defaultValue={tournament?.venue_id ?? ''}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              {(venues ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <select
              name="timeslot"
              required
              defaultValue={tournament?.timeslot ?? ''}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              {TIME_SLOTS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <button type="submit" className={primaryButtonClass}>
              Save
            </button>
          </form>
```

Replace with:

```tsx
          <form action={updateTournamentDetailsWithId} className="flex flex-col sm:flex-row gap-3">
            <select
              name="venueId"
              required
              defaultValue={tournament?.venue_id ?? ''}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              {(venues ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <select
              name="timeslot"
              required
              defaultValue={tournament?.timeslot ?? ''}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              {TIME_SLOTS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <input
              name="maxPlayers"
              type="number"
              min={1}
              placeholder="Max players"
              defaultValue={tournament?.max_players ?? ''}
              className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
            <button type="submit" className={primaryButtonClass}>
              Save
            </button>
          </form>
```

- [ ] **Step 3: Store it in `updateTournamentDetails`**

In `apps/organizer-web/app/tournaments/[id]/roster/actions.ts`, find:

```typescript
export async function updateTournamentDetails(tournamentId: string, formData: FormData) {
  const { supabase } = await requireOrganizer();

  const venueId = formData.get('venueId') as string;
  const timeslot = formData.get('timeslot') as string;

  const { error } = await supabase
    .from('tournaments')
    .update({ venue_id: venueId, timeslot })
    .eq('id', tournamentId);
```

Replace with:

```typescript
export async function updateTournamentDetails(tournamentId: string, formData: FormData) {
  const { supabase } = await requireOrganizer();

  const venueId = formData.get('venueId') as string;
  const timeslot = formData.get('timeslot') as string;
  const maxPlayersRaw = formData.get('maxPlayers') as string;
  const maxPlayers = maxPlayersRaw ? Number(maxPlayersRaw) : null;

  const { error } = await supabase
    .from('tournaments')
    .update({ venue_id: venueId, timeslot, max_players: maxPlayers })
    .eq('id', tournamentId);
```

- [ ] **Step 4: Run the build**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/roster/page.tsx" "apps/organizer-web/app/tournaments/[id]/roster/actions.ts"
git commit -m "feat: make max players editable on the Roster page"
```

---

### Task 4: Display the counter, gate the add-player forms, guard the insert actions

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/roster/page.tsx`
- Modify: `apps/organizer-web/app/tournaments/[id]/roster/actions.ts`

**Interfaces:**
- Consumes: `isRosterFull`, `slotsRemaining` from `@/lib/tournament/capacity` (Task 1).

- [ ] **Step 1: Import `isRosterFull` and compute `rosterFull`**

In `apps/organizer-web/app/tournaments/[id]/roster/page.tsx`, find:

```tsx
import { buildRosterTeams, buildUnpairedPlayerNames } from '@/lib/tournament/rosterExport';
```

Replace with:

```tsx
import { buildRosterTeams, buildUnpairedPlayerNames } from '@/lib/tournament/rosterExport';
import { isRosterFull } from '@/lib/tournament/capacity';
```

Then find:

```tsx
  const { data: players } = await supabase
    .from('players')
    .select('id, name, person_id')
    .eq('tournament_id', id)
    .order('created_at', { ascending: true });
```

Replace with:

```tsx
  const { data: players } = await supabase
    .from('players')
    .select('id, name, person_id')
    .eq('tournament_id', id)
    .order('created_at', { ascending: true });

  const rosterFull = isRosterFull(tournament?.max_players ?? null, (players ?? []).length);
```

- [ ] **Step 2: Show the counter in the heading**

Find:

```tsx
      <div className={cardClass}>
        <h2 className="text-lg font-bold text-slate-900 mb-2">
          Players ({(players ?? []).length})
        </h2>
```

Replace with:

```tsx
      <div className={cardClass}>
        <h2 className="text-lg font-bold text-slate-900 mb-2">
          Players ({(players ?? []).length}
          {tournament?.max_players ? `/${tournament.max_players}` : ''})
        </h2>
```

- [ ] **Step 3: Gate "Add Existing Players" and replace "Add New Players" with the full message**

Find:

```tsx
      {!isCompleted && availablePeople.length > 0 && (
        <div className={`${cardClass} mb-6`}>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Add Existing Players</h2>
```

Replace with:

```tsx
      {!isCompleted && !rosterFull && availablePeople.length > 0 && (
        <div className={`${cardClass} mb-6`}>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Add Existing Players</h2>
```

Then find:

```tsx
      {!isCompleted && (
        <div className={`${cardClass} mb-6`}>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Add New Players</h2>
          <form action={startAddPlayersWithId} className="space-y-3">
            <textarea
              name="names"
              rows={8}
              placeholder="One player name per line"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
            <button type="submit" className={primaryButtonClass}>
              Add Players
            </button>
          </form>
        </div>
      )}
```

Replace with:

```tsx
      {!isCompleted && !rosterFull && (
        <div className={`${cardClass} mb-6`}>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Add New Players</h2>
          <form action={startAddPlayersWithId} className="space-y-3">
            <textarea
              name="names"
              rows={8}
              placeholder="One player name per line"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
            <button type="submit" className={primaryButtonClass}>
              Add Players
            </button>
          </form>
        </div>
      )}

      {!isCompleted && rosterFull && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-6 font-semibold">
          All Slots Full — no more sign up.
        </div>
      )}
```

- [ ] **Step 4: Guard `addExistingPeople` server-side**

In `apps/organizer-web/app/tournaments/[id]/roster/actions.ts`, find:

```typescript
import { matchNamesToPeople } from '@/lib/people/matchNames';
```

Replace with:

```typescript
import { matchNamesToPeople } from '@/lib/people/matchNames';
import { slotsRemaining } from '@/lib/tournament/capacity';
```

Then find:

```typescript
export async function addExistingPeople(tournamentId: string, formData: FormData) {
  const { supabase, organizer } = await requireOrganizer();

  const personIds = formData.getAll('personIds') as string[];
  if (personIds.length === 0) {
    redirect(`/tournaments/${tournamentId}/roster`);
  }

  const { data: people, error: peopleError } = await supabase
```

Replace with:

```typescript
export async function addExistingPeople(tournamentId: string, formData: FormData) {
  const { supabase, organizer } = await requireOrganizer();

  const personIds = formData.getAll('personIds') as string[];
  if (personIds.length === 0) {
    redirect(`/tournaments/${tournamentId}/roster`);
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('max_players')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  const { count: currentPlayerCount, error: countError } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);

  if (countError) {
    throw new Error(countError.message);
  }

  const remaining = slotsRemaining(tournament?.max_players ?? null, currentPlayerCount ?? 0);
  if (remaining !== null && personIds.length > remaining) {
    throw new Error(
      `Only ${remaining} slot${remaining === 1 ? '' : 's'} left — you tried to add ${personIds.length} players.`
    );
  }

  const { data: people, error: peopleError } = await supabase
```

- [ ] **Step 5: Guard `confirmAddPlayers` server-side**

In the same file, find:

```typescript
export async function confirmAddPlayers(tournamentId: string, formData: FormData) {
  const { supabase, organizer } = await requireOrganizer();

  const raw = formData.get('names') as string;
  const names = raw
    .split('\n')
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  if (names.length === 0) {
    redirect(`/tournaments/${tournamentId}/roster`);
  }

  const { data: existingPeople, error: peopleError } = await supabase
    .from('people')
    .select('id, name')
    .eq('organizer_id', organizer.id);

  if (peopleError) {
    throw new Error(peopleError.message);
  }

  const { matched, newNames } = matchNamesToPeople(names, existingPeople ?? []);
```

Replace with:

```typescript
export async function confirmAddPlayers(tournamentId: string, formData: FormData) {
  const { supabase, organizer } = await requireOrganizer();

  const raw = formData.get('names') as string;
  const names = raw
    .split('\n')
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  if (names.length === 0) {
    redirect(`/tournaments/${tournamentId}/roster`);
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('max_players')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  const { count: currentPlayerCount, error: countError } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);

  if (countError) {
    throw new Error(countError.message);
  }

  const remaining = slotsRemaining(tournament?.max_players ?? null, currentPlayerCount ?? 0);
  if (remaining !== null && names.length > remaining) {
    throw new Error(
      `Only ${remaining} slot${remaining === 1 ? '' : 's'} left — you tried to add ${names.length} players.`
    );
  }

  const { data: existingPeople, error: peopleError } = await supabase
    .from('people')
    .select('id, name')
    .eq('organizer_id', organizer.id);

  if (peopleError) {
    throw new Error(peopleError.message);
  }

  const { matched, newNames } = matchNamesToPeople(names, existingPeople ?? []);
```

- [ ] **Step 6: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 203 tests pass
(195 existing + 8 new `capacity.ts` tests from Task 1).

- [ ] **Step 7: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/roster/page.tsx" "apps/organizer-web/app/tournaments/[id]/roster/actions.ts"
git commit -m "feat: show slot counter and block adding players past capacity"
```

---

### Task 5: Push, apply migration, verify CI, manual regression

**Files:** none (verification-only task).

- [ ] **Step 1: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 2: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 3: Apply the migration to the live database**

Ask the user for a fresh Supabase Management API access token (never
reuse a token from an earlier session). Apply
`supabase/migrations/20260821130000_add_tournament_max_players.sql` via
the Management API's SQL execution endpoint, then verify the column
exists:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'tournaments' and column_name = 'max_players';
```

Expected: one row, `max_players`, `integer`, `YES` (nullable).

- [ ] **Step 4: Manual regression**

- Create a new tournament with "Max players" set to, say, 4. Confirm
  the Roster page shows "Players (0/4)".
- Add players one at a time (or in a batch) up to exactly 4. Confirm
  the heading updates to "Players (4/4)" and both "Add Existing
  Players" and "Add New Players" are replaced with "All Slots Full —
  no more sign up."
- Try adding more anyway by directly resubmitting a stale form (or
  just confirm via the UI that no add option remains) — the roster
  should not exceed 4.
- Remove one player. Confirm the count drops to "Players (3/4)" and
  the add-player forms reappear.
- Create a second tournament and leave "Max players" blank. Confirm
  its Roster page shows the plain "Players (N)" heading with no cap
  behavior at all, exactly as before this feature.
- On an existing tournament (created before this feature), confirm its
  Roster page still shows the plain "Players (N)" heading (its
  `max_players` is `null` from the migration's default) until the
  organizer explicitly sets a cap via "Tournament Details."
- Edit an existing tournament's "Tournament Details" card to set a max
  players value; confirm it takes effect immediately (counter appears,
  full-state triggers correctly if already at/over that number).

Clean up any disposable test data used for this check afterward.
