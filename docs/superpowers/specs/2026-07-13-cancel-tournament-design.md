# Cancel Tournament (Upcoming Matches) — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Let an organizer cancel an entire tournament ("match event") directly from
the "Upcoming Matches" section of the dashboard.

## Scope decisions (resolved via brainstorming, 2026-07-13)

- **Cancel = hard delete.** Cancelling permanently deletes the tournament
  row. The existing schema already has `on delete cascade` from
  `players`, `teams`, and `matches` to `tournaments` (see
  `supabase/migrations/20260708150259_init_schema.sql:26-52`), so deleting
  the tournament automatically removes its roster, teams, and matches —
  no new migration needed. This mirrors the existing "Remove Player"
  feature's hard-delete pattern (`removePlayer` in
  `apps/organizer-web/app/tournaments/[id]/roster/actions.ts:106-117`).
- **RLS already permits this.** The `tournaments_delete_own` policy
  (`supabase/migrations/20260708150259_init_schema.sql:115-118`) already
  restricts deletes to the owning organizer — no new policy needed.
- **Confirmation:** a native browser `confirm()` dialog before the delete
  fires, naming the tournament and warning it's permanent.
- **Placement:** only on "Upcoming Matches" cards on the dashboard
  (`apps/organizer-web/app/tournaments/page.tsx`) — not on "Recently
  Completed" cards, since those tournaments are already finished and
  "cancel" doesn't apply to them.
- **Available regardless of partial progress:** a tournament with some
  matches already scored can still be cancelled — no special-casing for
  partially-played events. Keeps the feature simple (YAGNI); if this
  turns out to be a problem in practice, it's a follow-up.

## Implementation

### New server action

New file `apps/organizer-web/app/tournaments/actions.ts`:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';

export async function cancelTournament(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { error } = await supabase.from('tournaments').delete().eq('id', tournamentId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/tournaments');
}
```

This follows the exact same shape as `removePlayer` — no organizer-id
filter in the query itself, since RLS already enforces ownership.

### New client component

New file `apps/organizer-web/app/tournaments/CancelTournamentButton.tsx`
(mirrors the existing `CopyLinkButton` client-component pattern):

```typescript
'use client';

import { useTransition } from 'react';

export default function CancelTournamentButton({
  tournamentName,
  cancelAction,
}: {
  tournamentName: string;
  cancelAction: () => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    const confirmed = confirm(
      `Cancel "${tournamentName}"? This will permanently delete it and all its players, teams, and matches. This cannot be undone.`
    );
    if (!confirmed) return;
    startTransition(() => {
      cancelAction();
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-xs font-bold text-red-600 hover:text-red-700 disabled:opacity-50"
    >
      {isPending ? 'Cancelling…' : '✕ Cancel'}
    </button>
  );
}
```

### Dashboard card restructure

`apps/organizer-web/app/tournaments/page.tsx`'s Upcoming Matches card is
currently a single `<Link>` wrapping the entire card (badge, title, meta
row, and the "Manage tournament →" label all inside one anchor). Adding a
separate Cancel button requires it not be nested inside that anchor
(invalid HTML — no interactive elements inside an anchor).

Change the outer element from `<Link>` to `<div>`, keep the badge/title/
meta content unchanged, and replace the bottom "Manage tournament →" line
with a flex row containing the link (now scoped to just that text) and
the new Cancel button:

Current (for reference):

```tsx
<Link
  href={`/tournaments/${t.id}/roster`}
  className={`${vibrantCardClass} block hover:-translate-y-0.5 transition-transform`}
>
  <span className="absolute top-0 right-0 ...">{...badge...}</span>
  <div className="font-extrabold text-base text-slate-900 mb-1.5">
    🏆 {t.name}
  </div>
  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
    ...meta...
  </div>
  <div className="text-xs font-bold text-teal-700 mt-2">
    Manage tournament →
  </div>
</Link>
```

New:

```tsx
<div className={vibrantCardClass}>
  <span className="absolute top-0 right-0 ...">{...badge...}</span>
  <div className="font-extrabold text-base text-slate-900 mb-1.5">
    🏆 {t.name}
  </div>
  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
    ...meta...
  </div>
  <div className="flex items-center justify-between mt-2">
    <Link href={`/tournaments/${t.id}/roster`} className="text-xs font-bold text-teal-700 hover:underline">
      Manage tournament →
    </Link>
    <CancelTournamentButton
      tournamentName={t.name}
      cancelAction={cancelTournament.bind(null, t.id)}
    />
  </div>
</div>
```

The `hover:-translate-y-0.5 transition-transform` hover-lift effect is
dropped since the whole card is no longer a single clickable target.

`cancelTournament` is imported from the new
`apps/organizer-web/app/tournaments/actions.ts` and bound per-tournament,
matching the existing `enterScore.bind(null, id, m.id)` pattern already
used in `apps/organizer-web/app/tournaments/[id]/matches/page.tsx:67`.

## Out of scope

- No Cancel option on "Recently Completed" cards.
- No soft-cancel / "Cancelled" status or dashboard section.
- No confirmation beyond the single `confirm()` dialog (no type-to-confirm
  flow).
- No changes to the roster page, matches page, or any other
  per-tournament page — cancelling is only exposed from the dashboard's
  Upcoming Matches list, per the original request.
- If another browser tab is open on a roster/matches/standings page for a
  tournament that gets cancelled elsewhere, it will show the existing
  "Tournament not found" fallback on next navigation/reload (already
  implemented on every per-tournament page) — no new handling needed.
