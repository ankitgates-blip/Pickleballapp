# Player Profile Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the organizer edit a player's name and record handedness, age, playing style, and positive strengths from the Player Detail page (`/people/[id]`).

**Architecture:** Four new nullable columns on `people` (migration), a small constants file for the three fixed-option lists, a new `updatePersonProfile` server action, and a native `<details>`-based inline edit form on the Player Detail page — no new Client Component.

**Tech Stack:** Next.js App Router Server Actions, Supabase Postgres.

## Global Constraints

- All four new `people` columns are nullable except `strengths`, which defaults to an empty array — no Postgres enum/check constraint; option validity is enforced at the application layer via the constants file, matching this codebase's existing `tournaments.format` convention.
- The only required field on save is `name` — everything else is optional descriptive data.
- No new RLS policy is needed — `people_update_own` already scopes updates to the calling organizer's own rows.
- The edit form is a native `<details>/<summary>` disclosure with a single `<form>` — no new Client Component, no JavaScript-driven state.
- The read-only profile summary line only renders when at least one of the four attributes is set — never an empty/awkward line for a freshly-added player.

---

### Task 1: Migration — add profile columns to `people`

**Files:**
- Create: `supabase/migrations/20260819180000_add_people_profile_fields.sql`

**Interfaces:**
- Produces: `people.handedness text`, `people.age integer`, `people.playing_style text`, `people.strengths text[] not null default '{}'` — consumed by Task 2's action and Task 3's page.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260819180000_add_people_profile_fields.sql`:

```sql
alter table public.people add column handedness text;
alter table public.people add column age integer;
alter table public.people add column playing_style text;
alter table public.people add column strengths text[] not null default '{}';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260819180000_add_people_profile_fields.sql
git commit -m "feat: add people profile fields migration (handedness, age, playing_style, strengths)"
```

Note: this migration is not applied to the live database as part of this task — that happens in Task 4, using the Supabase Management API with a fresh, transient personal access token, matching how every prior migration in this project has been applied.

---

### Task 2: Profile option constants + `updatePersonProfile` server action

**Files:**
- Create: `apps/organizer-web/lib/people/profileOptions.ts`
- Create: `apps/organizer-web/app/people/[id]/actions.ts`

**Interfaces:**
- Produces:
  ```typescript
  // lib/people/profileOptions.ts
  export const HANDEDNESS_OPTIONS: readonly { value: string; label: string }[];
  export const PLAYING_STYLE_OPTIONS: readonly { value: string; label: string }[];
  export const STRENGTH_OPTIONS: readonly { value: string; label: string }[];

  // app/people/[id]/actions.ts
  export async function updatePersonProfile(personId: string, formData: FormData): Promise<void>;
  ```
  Both consumed by Task 3's page wiring.

- [ ] **Step 1: Create the option constants**

Create `apps/organizer-web/lib/people/profileOptions.ts`:

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

- [ ] **Step 2: Create the server action**

Create `apps/organizer-web/app/people/[id]/actions.ts`:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';

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

- [ ] **Step 3: Run the build to verify it compiles**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds. `updatePersonProfile` isn't wired into any page yet (Task 3 does that), so the build only confirms both new files type-check with no syntax errors. This will fail to type-check against the live Supabase schema types if those types haven't been regenerated — if the build fails specifically on `people.handedness`/`age`/`playing_style`/`strengths` being unknown columns, note this in your report; it's expected until the migration is applied and types regenerated (see Task 4), and is not a task defect.

- [ ] **Step 4: Run the full test suite**

Run: `cd apps/organizer-web && npm test`
Expected: all existing tests still pass — neither new file has pure-function logic to unit test (one is plain data, the other a server action), consistent with this codebase's convention.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/lib/people/profileOptions.ts "apps/organizer-web/app/people/[id]/actions.ts"
git commit -m "feat: add profile option constants and updatePersonProfile action"
```

---

### Task 3: Wire the edit form and read-only summary into the Player Detail page

**Files:**
- Modify: `apps/organizer-web/app/people/[id]/page.tsx`

**Interfaces:**
- Consumes: `HANDEDNESS_OPTIONS`, `PLAYING_STYLE_OPTIONS`, `STRENGTH_OPTIONS` from `@/lib/people/profileOptions` (Task 2); `updatePersonProfile` from `./actions` (Task 2); `inputClass`, `primaryButtonClass` from `@/app/components/ui` (already exist, not yet imported on this page).

- [ ] **Step 1: Add the new imports**

Find:

```tsx
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass, pillClass } from '@/app/components/ui';
```

Replace with:

```tsx
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass, pillClass, inputClass, primaryButtonClass } from '@/app/components/ui';
import { HANDEDNESS_OPTIONS, PLAYING_STYLE_OPTIONS, STRENGTH_OPTIONS } from '@/lib/people/profileOptions';
import { updatePersonProfile } from './actions';
```

- [ ] **Step 2: Widen the `person` query**

Find:

```tsx
  const { data: person } = await supabase
    .from('people')
    .select('id, name')
    .eq('id', id)
    .eq('organizer_id', organizer.id)
    .single();
```

Replace with:

```tsx
  const { data: person } = await supabase
    .from('people')
    .select('id, name, handedness, age, playing_style, strengths')
    .eq('id', id)
    .eq('organizer_id', organizer.id)
    .single();
```

- [ ] **Step 3: Compute the read-only profile summary and bind the action**

Find:

```tsx
  const starLabel = starRatingLabel(stats.winPercentage);
```

Replace with:

```tsx
  const starLabel = starRatingLabel(stats.winPercentage);

  const strengthLabels = (person.strengths ?? []).map(
    (s) => STRENGTH_OPTIONS.find((o) => o.value === s)?.label ?? s
  );
  const profileSummaryParts = [
    person.handedness
      ? (HANDEDNESS_OPTIONS.find((h) => h.value === person.handedness)?.label ?? null)
      : null,
    person.age ? `Age ${person.age}` : null,
    person.playing_style
      ? (PLAYING_STYLE_OPTIONS.find((s) => s.value === person.playing_style)?.label ?? null)
      : null,
    strengthLabels.length > 0 ? strengthLabels.join(', ') : null,
  ].filter((part): part is string => Boolean(part));
  const profileSummary = profileSummaryParts.length > 0 ? profileSummaryParts.join(' · ') : null;

  const updatePersonProfileWithId = updatePersonProfile.bind(null, person.id);
```

- [ ] **Step 4: Render the summary line and the edit form**

Find:

```tsx
      <p className="text-sm text-slate-500 mb-6">
        {stats.winPercentage !== null ? (
          <>
            Win rate: {stats.winPercentage}%{' '}
            <span className="text-green-600">
              {renderStars(starRating(stats.winPercentage))}
            </span>
          </>
        ) : (
          'No matches played yet'
        )}
      </p>

      <div className="mb-6">
        <SharePlayerStatsButton
```

Replace with:

```tsx
      <p className="text-sm text-slate-500">
        {stats.winPercentage !== null ? (
          <>
            Win rate: {stats.winPercentage}%{' '}
            <span className="text-green-600">
              {renderStars(starRating(stats.winPercentage))}
            </span>
          </>
        ) : (
          'No matches played yet'
        )}
      </p>
      {profileSummary && <p className="text-sm text-slate-500 mb-6">{profileSummary}</p>}

      <div className="mb-6">
        <details>
          <summary className="cursor-pointer text-sm font-bold text-teal-700 hover:text-teal-800 list-none mb-3">
            ✏️ Edit Profile
          </summary>
          <form action={updatePersonProfileWithId} className={`${cardClass} flex flex-col gap-3 max-w-md`}>
            <label className="text-sm font-semibold text-slate-700">
              Name
              <input
                type="text"
                name="name"
                defaultValue={person.name}
                required
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Handedness
              <select name="handedness" defaultValue={person.handedness ?? ''} className={`${inputClass} mt-1`}>
                <option value="">Not set</option>
                {HANDEDNESS_OPTIONS.map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Age
              <input
                type="number"
                name="age"
                defaultValue={person.age ?? ''}
                min={1}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Playing Style
              <select name="playingStyle" defaultValue={person.playing_style ?? ''} className={`${inputClass} mt-1`}>
                <option value="">Not set</option>
                {PLAYING_STYLE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend className="text-sm font-semibold text-slate-700 mb-1">Strengths</legend>
              <div className="flex flex-wrap gap-3">
                {STRENGTH_OPTIONS.map((s) => (
                  <label key={s.value} className="flex items-center gap-1.5 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      name="strengths"
                      value={s.value}
                      defaultChecked={(person.strengths ?? []).includes(s.value)}
                      className="accent-teal-600"
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <button type="submit" className={primaryButtonClass}>
              Save Profile
            </button>
          </form>
        </details>
      </div>

      <div className="mb-6">
        <SharePlayerStatsButton
```

- [ ] **Step 5: Run the build**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no TypeScript errors — this confirms the widened `person` select shape matches what the new code reads, and that `updatePersonProfileWithId`'s binding matches `updatePersonProfile`'s signature.

- [ ] **Step 6: Run the full test suite**

Run: `cd apps/organizer-web && npm test`
Expected: all tests still pass — this task adds no new pure-function logic (it's a Server Component composing existing pieces).

- [ ] **Step 7: Commit**

```bash
git add "apps/organizer-web/app/people/[id]/page.tsx"
git commit -m "feat: wire player profile edit form into the Player Detail page"
```

---

### Task 4: Apply the migration, push, verify CI, manual regression

**Files:** none (verification-only task).

- [ ] **Step 1: Apply the migration to the live database**

Using a fresh, transient Supabase personal access token (never persisted to disk), apply the migration from Task 1 via the Supabase Management API's SQL execution endpoint, same as every prior migration in this project. Verify afterward: `people.handedness`, `people.age`, `people.playing_style`, `people.strengths` all exist on the live table, with existing rows reading `strengths = '{}'` and the other three `null` (no backfill needed).

- [ ] **Step 2: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 3: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 4: Manual regression**

On any player's `/people/[id]` page:

- Confirm no profile summary line appears yet (fresh player, no attributes set).
- Click "✏️ Edit Profile", confirm the form expands with Name pre-filled and everything else blank/"Not set".
- Fill in a handedness, age, playing style, and check 2-3 strengths, then Save.
- Confirm the page now shows a summary line like "Right-handed · Age 34 · All-Court · Power, Serve" below the win-rate line.
- Re-open Edit Profile and confirm all fields (including the checked strengths) are correctly pre-filled with what was just saved.
- Change the name to something else, save, and confirm the page header and the `/people` list both reflect the new name.
- Try submitting with the Name field cleared and confirm it's rejected with a clear error (not silently saved as empty).

Clean up any disposable test data used for this check afterward.
