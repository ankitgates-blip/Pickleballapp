# Remove Player from Roster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an organizer remove a player from a tournament's roster at any point before the tournament completes, relying on the database's existing cascade behavior to clean up any team/matches that player was part of.

**Architecture:** One new server action (`removePlayer`) does a plain delete on the `players` table — the existing `ON DELETE CASCADE` foreign keys (already relied upon by the Teams page's "Remove Team" button) handle cleanup automatically. The Roster page is updated to show a "Remove" button per player and to hide all roster-editing controls (add/remove) once the tournament is completed.

**Tech Stack:** Same as prior work — Next.js (App Router, TypeScript), Supabase JS client, Vitest.

## Global Constraints

- Removal is available for every player regardless of team-pairing state, but only while `tournament.completed_at is null`. Once completed, the roster is fully read-only (no add or remove controls).
- No confirmation dialog before removing — matches the existing "Remove Team" button's plain-click UX.
- Design reference: [docs/superpowers/specs/2026-07-11-remove-player-from-roster-design.md](../specs/2026-07-11-remove-player-from-roster-design.md).

---

### Task 1: Round-robin round-count guarantee test

**Files:**
- Test: `apps/organizer-web/lib/tournament/roundRobin.test.ts`

**Interfaces:**
- Consumes: `generateRoundRobin(teamIds: string[])` from `./roundRobin` (existing, unchanged).

This is a characterization test: `generateRoundRobin` already produces the correct guarantee today (confirmed during brainstorming — not a bug), so this test locks in that behavior rather than driving new implementation.

- [ ] **Step 1: Write the test**

Add this test inside the existing `describe('generateRoundRobin', ...)` block in `apps/organizer-web/lib/tournament/roundRobin.test.ts`:

```typescript
  it('guarantees every team plays teamCount - 1 real matches (8 teams -> 7, 9 teams -> 8)', () => {
    const eightTeams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const eightPairings = generateRoundRobin(eightTeams);
    const eightRounds = new Set(eightPairings.map((p) => p.round)).size;
    expect(eightRounds).toBe(7);
    for (const team of eightTeams) {
      const realMatches = eightPairings.filter(
        (p) => p.teamBId !== null && (p.teamAId === team || p.teamBId === team)
      );
      expect(realMatches).toHaveLength(7);
    }

    const nineTeams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    const ninePairings = generateRoundRobin(nineTeams);
    for (const team of nineTeams) {
      const realMatches = ninePairings.filter(
        (p) => p.teamBId !== null && (p.teamAId === team || p.teamBId === team)
      );
      expect(realMatches).toHaveLength(8);
    }
  });
```

- [ ] **Step 2: Run the test to confirm it passes**

```bash
cd apps/organizer-web && npm test
```

Expected: PASS — all existing `roundRobin.test.ts` tests plus this new one are green (the underlying implementation is unchanged; this test documents and locks in behavior that already exists).

- [ ] **Step 3: Commit**

```bash
git add apps/organizer-web/lib/tournament/roundRobin.test.ts
git commit -m "Add round-robin round-count guarantee test"
```

---

### Task 2: Remove player action + Roster page UI

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/roster/actions.ts`
- Modify: `apps/organizer-web/app/tournaments/[id]/roster/page.tsx`

**Interfaces:**
- Produces: `removePlayer(tournamentId: string, playerId: string)` server action.

- [ ] **Step 1: Add the `removePlayer` action**

In `apps/organizer-web/app/tournaments/[id]/roster/actions.ts`, add this new export at the end of the file:

```typescript
export async function removePlayer(tournamentId: string, playerId: string) {
  const { supabase } = await requireOrganizer();

  const { error } = await supabase.from('players').delete().eq('id', playerId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/roster`);
  revalidatePath(`/tournaments/${tournamentId}/teams`);
}
```

(`revalidatePath` and `requireOrganizer` are already imported at the top of this file — no new imports needed. The `players` table's `ON DELETE CASCADE` foreign keys from `teams.player_1_id`/`player_2_id` automatically remove any team this player belonged to, and that team's own cascade removes any matches it was part of — the same mechanism the Teams page's `removeTeam` action already relies on.)

- [ ] **Step 2: Replace the Roster page**

Replace the full contents of `apps/organizer-web/app/tournaments/[id]/roster/page.tsx` with:

```typescript jsx
// apps/organizer-web/app/tournaments/[id]/roster/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass, primaryButtonClass, accentButtonClass, pillClass, linkClass } from '@/app/components/ui';
import { matchNamesToPeople } from '@/lib/people/matchNames';
import { startAddPlayers, confirmAddPlayers, addExistingPeople, removePlayer } from './actions';

export default async function RosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pendingNames?: string }>;
}) {
  const { id } = await params;
  const { pendingNames } = await searchParams;
  const { supabase, organizer } = await requireOrganizer();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('completed_at')
    .eq('id', id)
    .single();

  const isCompleted = Boolean(tournament?.completed_at);

  const { data: players } = await supabase
    .from('players')
    .select('id, name, person_id')
    .eq('tournament_id', id)
    .order('created_at', { ascending: true });

  const { data: allPeople } = await supabase
    .from('people')
    .select('id, name')
    .eq('organizer_id', organizer.id)
    .order('name', { ascending: true });

  const personIdsOnRoster = new Set(
    (players ?? []).map((p) => p.person_id).filter((personId): personId is string => Boolean(personId))
  );
  const availablePeople = (allPeople ?? []).filter((p) => !personIdsOnRoster.has(p.id));

  const nameCounts = new Map<string, number>();
  for (const p of players ?? []) {
    const key = p.name.trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const duplicateNames = new Set(
    (players ?? [])
      .map((p) => p.name)
      .filter((name) => (nameCounts.get(name.trim().toLowerCase()) ?? 0) > 1)
  );

  if (pendingNames) {
    const names = pendingNames
      .split('\n')
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    const { data: existingPeople } = await supabase
      .from('people')
      .select('id, name')
      .eq('organizer_id', organizer.id);

    const { matched, newNames } = matchNamesToPeople(names, existingPeople ?? []);
    const confirmAddPlayersWithId = confirmAddPlayers.bind(null, id);

    return (
      <OrganizerShell organizerName={organizer.name}>
        <TournamentNav tournamentId={id} current="roster" />
        <h1 className="text-2xl font-extrabold text-slate-900 mb-6">Review Roster Additions</h1>

        <div className={`${cardClass} mb-6`}>
          <h2 className="text-lg font-bold text-slate-900 mb-2">
            Matched to existing person ({matched.length})
          </h2>
          <ul className="flex flex-wrap gap-2 mb-4">
            {matched.map((m, i) => (
              <li key={i} className={`${pillClass} bg-teal-50 text-teal-800`}>
                {m.name}
              </li>
            ))}
            {matched.length === 0 && <li className="text-sm text-slate-400">None</li>}
          </ul>

          <h2 className="text-lg font-bold text-slate-900 mb-2">New people ({newNames.length})</h2>
          <ul className="flex flex-wrap gap-2 mb-4">
            {newNames.map((name, i) => (
              <li key={i} className={`${pillClass} bg-amber-50 text-amber-800`}>
                {name}
              </li>
            ))}
            {newNames.length === 0 && <li className="text-sm text-slate-400">None</li>}
          </ul>

          <form action={confirmAddPlayersWithId} className="flex items-center gap-4">
            <input type="hidden" name="names" value={pendingNames} />
            <button type="submit" className={accentButtonClass}>
              Confirm
            </button>
            <Link href={`/tournaments/${id}/roster`} className={linkClass}>
              Cancel
            </Link>
          </form>
        </div>
      </OrganizerShell>
    );
  }

  const startAddPlayersWithId = startAddPlayers.bind(null, id);
  const addExistingPeopleWithId = addExistingPeople.bind(null, id);

  return (
    <OrganizerShell organizerName={organizer.name}>
      <TournamentNav tournamentId={id} current="roster" />
      <h1 className="text-2xl font-extrabold text-slate-900 mb-6">Roster</h1>

      {!isCompleted && availablePeople.length > 0 && (
        <div className={`${cardClass} mb-6`}>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Add Existing Players</h2>
          <p className="text-sm text-slate-500 mb-3">
            Select players you've added before — no need to retype their names.
          </p>
          <form action={addExistingPeopleWithId} className="space-y-3">
            <div className="flex flex-wrap gap-3 max-h-48 overflow-y-auto">
              {availablePeople.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm cursor-pointer hover:border-teal-400"
                >
                  <input type="checkbox" name="personIds" value={p.id} className="accent-teal-600" />
                  {p.name}
                </label>
              ))}
            </div>
            <button type="submit" className={primaryButtonClass}>
              Add Selected
            </button>
          </form>
        </div>
      )}

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

      <div className={cardClass}>
        <h2 className="text-lg font-bold text-slate-900 mb-2">
          Players ({(players ?? []).length})
        </h2>
        {duplicateNames.size > 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            ⚠ Duplicate name(s) — double-check pairing later:{' '}
            {Array.from(duplicateNames).join(', ')}
          </p>
        )}
        <ul className="space-y-2">
          {(players ?? []).map((p) => {
            const removePlayerForPlayer = removePlayer.bind(null, id, p.id);
            return (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900"
              >
                <span>{p.name}</span>
                {!isCompleted && (
                  <form action={removePlayerForPlayer}>
                    <button
                      type="submit"
                      className="text-xs font-semibold text-teal-700 hover:text-red-600 transition-colors"
                    >
                      Remove
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="mt-6">
        <Link href={`/tournaments/${id}/teams`} className={linkClass}>
          Next: pair teams →
        </Link>
      </p>
    </OrganizerShell>
  );
}
```

Note what changed from the previous version: a `tournament` fetch (for `completed_at`) was added; the "Add Existing Players" and "Add New Players" cards are now gated behind `!isCompleted` (making the whole roster read-only once a tournament is done, per the design's "read-only" intent); the Players list changed from a flat pill display to row-per-player, each with a "Remove" button shown only when `!isCompleted`.

- [ ] **Step 3: Verify the build compiles**

```bash
cd apps/organizer-web && npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Manual verification in browser**

Open the Roster page for an upcoming (not completed) tournament with a few players. Confirm each player row now shows a "Remove" button; click one and confirm that player disappears from the list and (if they'd been paired into a team) their team also disappears from the Teams page. Then open the Roster page for a completed tournament and confirm no "Remove" buttons, and no "Add Existing Players"/"Add New Players" cards, appear — the roster is fully read-only.

- [ ] **Step 5: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/roster"
git commit -m "Add remove-player action and read-only completed roster"
```

---

### Task 3: Push and verify CI

**Files:** none (repo-level)

- [ ] **Step 1: Push to GitHub**

```bash
cd "C:\Users\ANKS\pickleball project"
git push
```

- [ ] **Step 2: Confirm CI passes**

Check the Actions tab on GitHub (or poll `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`) and confirm the latest run's `conclusion` is `success`.

- [ ] **Step 3: Full manual regression check**

On an upcoming tournament, add a few players, pair two of them into a team, then remove one of the paired players and confirm their team is gone from the Teams page and no orphaned matches remain. Separately confirm a completed tournament's Roster page is fully read-only, and that removing a never-paired player works cleanly (no team to cascade).
