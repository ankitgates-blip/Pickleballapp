# Editable League Names & League Playoffs Sit-Out Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organizers can rename a league inline from the Results page, and League + Playoffs shows "Sitting out: TeamName" instead of "TeamName vs BYE" for the team without an opponent in an odd-team-count round.

**Architecture:** Two independent changes. (1) A new Server Action (`renameTournament`) plus a small client component (`EditableTournamentName`) that toggles between a static heading and an inline text input, wired into the Results page in place of the static `<h1>`. (2) A one-branch conditional added to the bracket page's existing bye-row rendering, gated on the already-in-scope `isLeaguePlayoffs` flag.

**Tech Stack:** Next.js Server Actions (Supabase), React client components, TypeScript.

## Global Constraints

- No database migration needed — `tournaments.name` already exists (`text not null`), and the existing `tournaments_update_own` RLS policy already permits an organizer to update any column on their own tournament rows.
- Renaming is not gated on `completed_at`/`results_unlocked_at` — it must remain editable in every tournament state.
- The sit-out display change applies **only** to `league_playoffs` — Round Robin and Double Header must keep showing "TeamName vs BYE" unchanged, even though they share the identical underlying bye-row data.
- `'use server'` action files, `page.tsx` files, and client components have zero test coverage anywhere in this codebase, by established convention (confirmed across every prior feature this session). Do not add test files for `results/actions.ts`, `results/EditableTournamentName.tsx`, `results/page.tsx`, or `bracket/page.tsx` — verify via `npm run build` (typecheck) + `npm test` (regression) only, plus manual verification in the running app.
- Test command: `npm test` (Vitest) from `apps/organizer-web`. Build/typecheck: `npm run build` from `apps/organizer-web`.

---

### Task 1: Editable league name

**Files:**
- Create: `apps/organizer-web/app/tournaments/[id]/results/actions.ts`
- Create: `apps/organizer-web/app/tournaments/[id]/results/EditableTournamentName.tsx`
- Modify: `apps/organizer-web/app/tournaments/[id]/results/page.tsx`

**Interfaces:**
- Produces: `renameTournament(tournamentId: string, formData: FormData): Promise<{ name: string }>` (Server Action), `EditableTournamentName` component with props `{ tournamentId: string; initialName: string; renameAction: (tournamentId: string, formData: FormData) => Promise<{ name: string }> }`.

- [ ] **Step 1: Create the Server Action**

Create `apps/organizer-web/app/tournaments/[id]/results/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';

export async function renameTournament(
  tournamentId: string,
  formData: FormData
): Promise<{ name: string }> {
  const { supabase } = await requireOrganizer();

  const rawName = (formData.get('name') as string | null)?.trim();
  if (!rawName) {
    throw new Error('League name cannot be empty.');
  }

  const { data, error } = await supabase
    .from('tournaments')
    .update({ name: rawName })
    .eq('id', tournamentId)
    .select('name')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to rename league.');
  }

  revalidatePath(`/tournaments/${tournamentId}/results`);
  revalidatePath(`/t/${tournamentId}`);

  return { name: data.name };
}
```

- [ ] **Step 2: Create the client component**

Create `apps/organizer-web/app/tournaments/[id]/results/EditableTournamentName.tsx`:

```tsx
'use client';

import { useState } from 'react';

export default function EditableTournamentName({
  tournamentId,
  initialName,
  renameAction,
}: {
  tournamentId: string;
  initialName: string;
  renameAction: (tournamentId: string, formData: FormData) => Promise<{ name: string }>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (formData: FormData) => {
    setIsSaving(true);
    const result = await renameAction(tournamentId, formData);
    setName(result.name);
    setIsEditing(false);
    setIsSaving(false);
  };

  if (!isEditing) {
    return (
      <h1 className="mb-1">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="text-2xl font-bold text-slate-900 text-left hover:text-navy-mid transition-colors"
        >
          {name}
        </button>
      </h1>
    );
  }

  return (
    <h1 className="mb-1">
      <form action={handleSubmit}>
        <input
          name="name"
          type="text"
          defaultValue={name}
          autoFocus
          required
          disabled={isSaving}
          onBlur={(e) => e.currentTarget.form?.requestSubmit()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsEditing(false);
          }}
          className="text-2xl font-bold text-slate-900 border-b-2 border-navy-mid focus:outline-none bg-transparent w-full"
        />
      </form>
    </h1>
  );
}
```

- [ ] **Step 3: Wire it into the Results page**

`apps/organizer-web/app/tournaments/[id]/results/page.tsx` currently starts with these imports:

```ts
// apps/organizer-web/app/tournaments/[id]/results/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import {
  computeStandings,
  computeIndividualStandings,
  computeClaimTheThroneStandings,
} from '@/lib/tournament/standings';
import { formatLabel, usesIndividualStandings, isLadderFormat as isLadderFormatCheck } from '@/lib/tournament/formats';
import { timeslotLabel } from '@/lib/tournament/timeslots';
import { computeTournamentChampionName } from '@/lib/tournament/champion';
import {
  buildTeamStandingsRows,
  buildIndividualStandingsRows,
  buildLadderStandingsRows,
  buildMatchGroups,
} from '@/lib/tournament/resultsExport';
import type { ClaimTheThroneRoundResult, MatchResult, Team } from '@/lib/types';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass } from '@/app/components/ui';
import ShareResultsButton from './ShareResultsButton';
```

Add two new imports after the `ShareResultsButton` import:

```ts
import ShareResultsButton from './ShareResultsButton';
import EditableTournamentName from './EditableTournamentName';
import { renameTournament } from './actions';
```

Then change:

```tsx
      <h1 className="text-2xl font-bold text-slate-900 mb-1">{tournament.name}</h1>
```

to:

```tsx
      <EditableTournamentName tournamentId={id} initialName={tournament.name} renameAction={renameTournament} />
```

(`id` is already in scope — the page destructures `const { id } = await params;` earlier in the component.)

- [ ] **Step 4: Verify**

Run: `npm run build` (from `apps/organizer-web`) — expect a clean TypeScript build.
Run: `npm test` (from `apps/organizer-web`) — expect all existing tests still pass (none of these three files have tests of their own — see Global Constraints).

- [ ] **Step 5: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/results/actions.ts" "apps/organizer-web/app/tournaments/[id]/results/EditableTournamentName.tsx" "apps/organizer-web/app/tournaments/[id]/results/page.tsx"
git commit -m "feat: make league name editable inline on Results page"
```

---

### Task 2: League Playoffs sit-out display

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`

**Interfaces:** none — self-contained, uses the existing in-scope `isLeaguePlayoffs` const and `teamById` map.

- [ ] **Step 1: Branch the bye-row rendering on `isLeaguePlayoffs`**

Inside `renderMatchList`, the function currently starts:

```tsx
  const renderMatchList = (list: MatchRow[], isFinal: boolean = false) => (
    <ul className="space-y-2">
      {list.map((m) => {
        if (!m.team_b_id) {
          return (
            <li key={m.id} className="text-sm text-slate-800 flex items-center gap-2">
              <span className="font-semibold">{teamById.get(m.team_a_id!) ?? 'Bye'}</span>
              <span className="text-slate-400">vs</span>
              <span className="font-semibold">BYE</span>
            </li>
          );
        }
```

Change the `!m.team_b_id` block to:

```tsx
  const renderMatchList = (list: MatchRow[], isFinal: boolean = false) => (
    <ul className="space-y-2">
      {list.map((m) => {
        if (!m.team_b_id) {
          return isLeaguePlayoffs ? (
            <li key={m.id} className="text-sm text-slate-500 flex items-center gap-2">
              <span className="text-slate-400">Sitting out:</span>
              <span className="font-semibold text-slate-700">{teamById.get(m.team_a_id!) ?? 'Unknown'}</span>
            </li>
          ) : (
            <li key={m.id} className="text-sm text-slate-800 flex items-center gap-2">
              <span className="font-semibold">{teamById.get(m.team_a_id!) ?? 'Bye'}</span>
              <span className="text-slate-400">vs</span>
              <span className="font-semibold">BYE</span>
            </li>
          );
        }
```

(`isLeaguePlayoffs` is already declared earlier in this component as `const isLeaguePlayoffs = format === 'league_playoffs';` — no new import or variable needed. `renderMatchList` is a closure defined inside the page component, so it's already in scope.)

- [ ] **Step 2: Verify**

Run: `npm run build` (from `apps/organizer-web`) — expect a clean TypeScript build (this page has no test file — see Global Constraints).

- [ ] **Step 3: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/page.tsx"
git commit -m "feat: show sitting-out team instead of BYE for League Playoffs"
```

---

## After all tasks

Run the full suite once more from `apps/organizer-web`: `npm test && npm run build`. Then a live check with the dev server (`organizer-web` launch config, port 3000):
1. Open a tournament's Results page, click the league name, confirm it becomes an editable input, change it, press Enter, confirm it saves and the heading updates; repeat and confirm blur-to-save and Escape-to-cancel both work as expected.
2. Confirm the public share page (`/t/[id]`) reflects the renamed league (it revalidates on rename).
3. Open a League + Playoffs tournament with an odd team count, confirm the bye round shows "Sitting out: TeamName" instead of "vs BYE".
4. Open a Round Robin or Double Header tournament with an odd team count, confirm it still shows "TeamName vs BYE" unchanged.
