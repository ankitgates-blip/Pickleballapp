# Organizer Management from Upcoming Matches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Upcoming Matches cards take the signed-in organizer to the Roster page (where they can manage players) instead of the public share page, and add the ability to edit a tournament's Location and Timeslot from that same page.

**Architecture:** A one-line link-target change on the dashboard, plus a new server action and a small edit form added to the existing Roster page. The already-built `CopyLinkButton` component (from the Standings page) is reused as-is so the public link is still reachable.

**Tech Stack:** Same as prior work — Next.js (App Router, TypeScript), Supabase JS client.

## Global Constraints

- The "Tournament Details" edit card (Location + Timeslot) and the dashboard link change both only apply while `completed_at is null` — a completed tournament's dashboard card still goes to Results, unaffected.
- Only Location and Timeslot are editable; Name and Date are not touched by this feature.
- Design reference: [docs/superpowers/specs/2026-07-11-organizer-manage-upcoming-design.md](../specs/2026-07-11-organizer-manage-upcoming-design.md).

---

### Task 1: Dashboard — Upcoming Matches links to Roster

**Files:**
- Modify: `apps/organizer-web/app/tournaments/page.tsx`

- [ ] **Step 1: Change the link target and label**

In `apps/organizer-web/app/tournaments/page.tsx`, inside the `upcoming.map((t) => { ... })` block, change:

```typescript jsx
                  <Link
                    href={`/t/${t.id}`}
                    className={`${vibrantCardClass} block hover:-translate-y-0.5 transition-transform`}
                  >
```

to:

```typescript jsx
                  <Link
                    href={`/tournaments/${t.id}/roster`}
                    className={`${vibrantCardClass} block hover:-translate-y-0.5 transition-transform`}
                  >
```

And change:

```typescript jsx
                    <div className="text-xs font-bold text-teal-700 mt-2">
                      View who&apos;s playing →
                    </div>
```

to:

```typescript jsx
                    <div className="text-xs font-bold text-teal-700 mt-2">
                      Manage tournament →
                    </div>
```

No other changes to this file — Recently Completed's card already links to `/tournaments/{id}/results` and is untouched.

- [ ] **Step 2: Verify the build compiles**

```bash
cd apps/organizer-web && npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Manual verification in browser**

Go to `/tournaments`. Click an Upcoming Matches card and confirm it now opens the Roster page (`/tournaments/{id}/roster`), not the public `/t/{id}` page. Confirm Recently Completed cards still open Results as before.

- [ ] **Step 4: Commit**

```bash
git add apps/organizer-web/app/tournaments/page.tsx
git commit -m "Link Upcoming Matches cards to Roster instead of the public page"
```

---

### Task 2: Roster page — copy-link button + editable Tournament Details

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/roster/actions.ts`
- Modify: `apps/organizer-web/app/tournaments/[id]/roster/page.tsx`

**Interfaces:**
- Consumes: `CopyLinkButton` from `../standings/CopyLinkButton` (existing, unchanged); `TIME_SLOTS` from `@/lib/tournament/timeslots` (existing).
- Produces: `updateTournamentDetails(tournamentId: string, formData: FormData)` server action.

- [ ] **Step 1: Add the `updateTournamentDetails` action**

In `apps/organizer-web/app/tournaments/[id]/roster/actions.ts`, add this new export at the end of the file:

```typescript
export async function updateTournamentDetails(tournamentId: string, formData: FormData) {
  const { supabase } = await requireOrganizer();

  const venueId = formData.get('venueId') as string;
  const timeslot = formData.get('timeslot') as string;

  const { error } = await supabase
    .from('tournaments')
    .update({ venue_id: venueId, timeslot })
    .eq('id', tournamentId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/roster`);
  revalidatePath('/tournaments');
}
```

(`revalidatePath` and `requireOrganizer` are already imported at the top of this file — no new imports needed.)

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
import { TIME_SLOTS } from '@/lib/tournament/timeslots';
import CopyLinkButton from '../standings/CopyLinkButton';
import {
  startAddPlayers,
  confirmAddPlayers,
  addExistingPeople,
  removePlayer,
  updateTournamentDetails,
} from './actions';

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
    .select('completed_at, venue_id, timeslot')
    .eq('id', id)
    .single();

  const isCompleted = Boolean(tournament?.completed_at);

  const { data: venues } = await supabase.from('venues').select('id, name').order('name');

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
  const updateTournamentDetailsWithId = updateTournamentDetails.bind(null, id);

  return (
    <OrganizerShell organizerName={organizer.name}>
      <TournamentNav tournamentId={id} current="roster" />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Roster</h1>
        <CopyLinkButton tournamentId={id} />
      </div>

      {!isCompleted && (
        <div className={`${cardClass} mb-6`}>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Tournament Details</h2>
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
        </div>
      )}

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

Note what changed: the tournament query now also selects `venue_id, timeslot`; a new `venues` query feeds the Location dropdown; the page header becomes a flex row with the existing `CopyLinkButton` (imported from the Standings page's folder, unchanged) next to the title; a new "Tournament Details" card (gated on `!isCompleted`, like every other edit control on this page) sits above "Add Existing Players", with Location and Timeslot selects pre-filled from the current values and a Save button wired to the new `updateTournamentDetails` action.

- [ ] **Step 3: Verify the build compiles**

```bash
cd apps/organizer-web && npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Manual verification in browser**

Open the Roster page for an upcoming tournament. Confirm a "Copy public link" button appears next to the "Roster" title, and a new "Tournament Details" card shows Location and Timeslot pre-filled with the tournament's current values. Change both and click Save; confirm the page reloads with the new values persisted (reflected in the dropdowns, and on the `/tournaments` dashboard card). Then open a completed tournament's Roster page and confirm the "Tournament Details" card does not appear (read-only, consistent with the rest of the page).

- [ ] **Step 5: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/roster"
git commit -m "Add editable Location/Timeslot and public-link button to Roster"
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

From the dashboard, click into an upcoming tournament and confirm you land on Roster with full add/remove/edit-details controls. Change its Location and Timeslot, save, and confirm the dashboard card immediately reflects the new values. Use the "Copy public link" button and confirm the copied link still opens the correct public `/t/{id}` page in a separate check. Finally, confirm a completed tournament's dashboard card still goes to Results (unchanged) and its Roster page (if visited directly) shows no edit controls.
