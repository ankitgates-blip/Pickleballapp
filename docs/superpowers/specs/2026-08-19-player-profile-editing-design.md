# Player Profile Editing — Design

Status: Approved, pending spec review before implementation plan.

This is Part 1 of 2 for the organizer's requested player-profile
capabilities. Part 2 (profile photo upload) is a separate, later spec
— it needs file-storage infrastructure this part doesn't touch.

## Goal

Let the organizer edit a player's name and record a handful of
descriptive attributes — handedness, age, playing style, and positive
strengths — from the Player Detail page (`/people/[id]`).

## Current state

`apps/organizer-web/app/people/[id]/page.tsx` fetches
`people: { id, name }` and renders it read-only. The `people` table
(`supabase/migrations/20260710134709_add_people.sql`) has only
`id, organizer_id, name, created_at` — no other attributes — and
already has an `update` RLS policy (`people_update_own`) scoping
updates to the calling organizer's own rows, so no new RLS policy is
needed for this feature.

## Design

### New `people` columns (migration)

```sql
alter table public.people add column handedness text;
alter table public.people add column age integer;
alter table public.people add column playing_style text;
alter table public.people add column strengths text[] not null default '{}';
```

All nullable except `strengths`, which defaults to an empty array —
matching this app's established convention (e.g. `tournaments.format`)
of a plain `text` column validated at the application layer rather
than a Postgres enum/check constraint, so adding or renaming an option
later is a one-line code change, not a migration.

### New constants: `lib/people/profileOptions.ts`

```typescript
export const HANDEDNESS_OPTIONS = [
  { value: 'left', label: 'Left-handed' },
  { value: 'right', label: 'Right-handed' },
] as const;

export const PLAYING_STYLE_OPTIONS = [
  { value: 'aggressive', label: 'Aggressive' },
  { value: 'defensive', label: 'Defensive' },
  { value: 'all_court', label: 'All-Court' },
  { value: 'power', label: 'Power' },
  { value: 'finesse', label: 'Finesse' },
] as const;

export const STRENGTH_OPTIONS = [
  { value: 'power', label: 'Power' },
  { value: 'consistency', label: 'Consistency' },
  { value: 'net_play', label: 'Net Play' },
  { value: 'serve', label: 'Serve' },
  { value: 'footwork', label: 'Footwork' },
  { value: 'strategy', label: 'Strategy' },
] as const;
```

Mirrors `lib/tournament/formats.ts`'s `TOURNAMENT_FORMATS` shape
(value/label pairs), the established pattern for this kind of
fixed-option list in this codebase.

### New server action: `updatePersonProfile`

`apps/organizer-web/app/people/[id]/actions.ts` (new file):

```typescript
export async function updatePersonProfile(personId: string, formData: FormData) {
  const { supabase } = await requireOrganizer();

  const name = (formData.get('name') as string)?.trim();
  if (!name) {
    throw new Error('Name is required');
  }

  const ageRaw = formData.get('age') as string;
  const age = ageRaw ? Number(ageRaw) : null;
  const handedness = (formData.get('handedness') as string) || null;
  const playingStyle = (formData.get('playingStyle') as string) || null;
  const strengths = formData.getAll('strengths') as string[];

  const { error } = await supabase
    .from('people')
    .update({ name, age, handedness, playing_style: playingStyle, strengths })
    .eq('id', personId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/people/${personId}`);
  revalidatePath('/people');
}
```

`formData.getAll('strengths')` natively collects every checked
`<input type="checkbox" name="strengths" value="...">` — no
JavaScript-driven multi-select needed.

### UI: inline edit form via native `<details>`

Following the same zero-JS disclosure pattern already used for the
Bracket page's inline score editing, `/people/[id]/page.tsx` gains an
"Edit Profile" `<details>/<summary>` block near the top (below the
header, above "This Month"), containing a single `<form
action={updatePersonProfileWithId}>` with:

- Name: text input, pre-filled with the current name
- Handedness: `<select>` built from `HANDEDNESS_OPTIONS`, with a
  blank/"Not set" option, pre-selected to the current value
- Age: number input, pre-filled if set
- Playing Style: `<select>` built from `PLAYING_STYLE_OPTIONS`, same
  blank-option pattern
- Strengths: one checkbox per `STRENGTH_OPTIONS` entry, pre-checked
  for whichever the person currently has
- Save button

No new Client Component — the whole page stays a Server Component.

### Read-only display

The existing header area gains a small summary line beneath the
current win-rate line, shown only for fields that are set (e.g. "Right
-handed · Age 34 · All-Court · Power, Serve") — omitted entirely if
none of the four attributes are set yet, so a freshly-added player
with no profile data doesn't show an empty/awkward line.

## Out of scope

- Profile photo upload — separate spec.
- Editing these fields from anywhere other than `/people/[id]`
  (e.g. during the Roster "add players" flow).
- The public `/p/[id]` player page — this covers the organizer-facing
  page only, consistent with the Player Stats PDF feature's scoping.
- Any validation beyond "name is required" (e.g. age range limits) —
  these are optional descriptive fields, not gated data.
