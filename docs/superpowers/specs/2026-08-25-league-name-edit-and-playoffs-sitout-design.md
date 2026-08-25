# Editable League Names & League Playoffs Sit-Out Display — Design

**Date:** 2026-08-25
**Status:** Approved for planning

Two small, independent changes, combined into one spec since both are low-complexity and unrelated in domain but not worth two separate SDD cycles.

## Part 1: Editable league names

### Problem

A league's name is set once, on the "New League" creation form, and can never be changed afterward — there is no settings/edit page anywhere in the app, and no tournament-update Server Action exists at all.

### Scope decision (resolved during brainstorming)

The edit control lives **inline on the Results page**, where the league name already renders as an `<h1>`. No new page or navigation tab.

### Architecture

**New Server Action** — `apps/organizer-web/app/tournaments/[id]/results/actions.ts` (new file):

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

No new migration: `tournaments.name` already exists (`text not null`), and the existing `tournaments_update_own` RLS policy already permits an organizer to update any column on their own tournament rows (no column-scoped grant to change). Trims and rejects empty — `createTournament`'s own name field has no such server-side check today; this is a small, additive hardening, not a behavior change to the existing creation flow. No length cap (unlike the public `joinLeague` form) — this is an organizer-only, already-authenticated action, matching the looser validation convention every other organizer-facing form in this app already uses (e.g. `createTournament` itself).

Renaming is **not** gated on `completed_at`/`results_unlocked_at` — it's metadata, not competitive data, so it stays editable in every tournament state.

**New client component** — `apps/organizer-web/app/tournaments/[id]/results/EditableTournamentName.tsx` (new file):

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

Click the name → it becomes a focused text input. Enter submits (native single-input form behavior — no extra code needed). Clicking/tabbing away (blur) also submits via `requestSubmit()`. Escape cancels without saving. The `<h1>` wrapper is kept in both states for heading semantics/SEO; only its interactive content changes.

**Results page wiring** — `apps/organizer-web/app/tournaments/[id]/results/page.tsx`: replace the static `<h1>{tournament.name}</h1>` with `<EditableTournamentName tournamentId={id} initialName={tournament.name} renameAction={renameTournament} />`, importing both the new component and the new action.

### Testing

`results/actions.ts`, `results/page.tsx`, and the new client component have no automated test coverage, by this codebase's established convention (confirmed repeatedly this session: `'use server'` files and `page.tsx`/client-component files have zero test coverage anywhere in this codebase — only pure `lib/tournament/*.ts` functions get Vitest tests). Verified via `npm run build` (typecheck) + `npm test` (regression) only, plus manual verification in the running app.

## Part 2: League Playoffs sit-out display

### Problem

When League + Playoffs has an odd team count, the shared round-robin generator produces a bye row for whichever team has no opponent that round. The organizer bracket page renders this as `"TeamName vs BYE"`, which reads as if a match was scheduled and skipped, rather than as the team simply sitting out that round.

### Scope decision (resolved during brainstorming)

Applies **only** to League + Playoffs, per explicit choice — Round Robin and Double Header (which share the identical bye mechanism) keep today's "vs BYE" text unchanged.

### Architecture

`apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`: in `renderMatchList`'s existing `!m.team_b_id` branch, add an `isLeaguePlayoffs` check (the const already exists earlier in this component: `const isLeaguePlayoffs = format === 'league_playoffs';`) and render differently for that one format:

```tsx
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

`teamById.get(m.team_a_id!)` already resolves to the "Alice / Bob"-style display name used everywhere else on this page — no new lookup or data needed, since League Playoffs' bye row already directly names the sitting-out team via `m.team_a_id` (unlike Popcorn/Gauntlet/Custom's existing "Sitting out: ..." banner, which has to *derive* sit-outs from player-level match absence because those formats don't have a single team explicitly marked idle).

### Testing

`bracket/page.tsx` has no automated test coverage, by established convention. Verified via `npm run build` + manual check: a League + Playoffs tournament with an odd team count shows "Sitting out: TeamName" for the bye round; a Round Robin or Double Header tournament with an odd team count still shows "TeamName vs BYE" unchanged.

## Out of scope

- Any length cap or additional validation on the league name beyond non-empty-after-trim.
- Extending the sit-out display change to Round Robin/Double Header (explicitly declined).
- Any change to the existing Popcorn/Gauntlet/Custom "Sitting out: {player names}" mechanism.
