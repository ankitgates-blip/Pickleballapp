# Paddle Brand Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Paddle Brand" dropdown to Player Profile Editing, following the exact same pattern already established for handedness/playing style.

**Architecture:** One new nullable `people.paddle_brand` column, one new option constant, one more optional field on the existing `updatePersonProfile` action, one more `<select>` in the existing edit form, and one more entry in the existing `profileSummaryParts` computation (which already flows automatically into the Player Stats PDF).

**Tech Stack:** Next.js App Router Server Actions, Supabase Postgres.

## Global Constraints

- `people.paddle_brand` is nullable — optional field, same as the other three.
- Option validity enforced at the application layer, not a DB constraint — same convention as `handedness`/`playing_style`.
- No PDF-specific code changes — the Player Stats PDF already renders whatever `profileSummary` contains.

---

### Task 1: Migration — add `paddle_brand` to `people`

**Files:**
- Create: `supabase/migrations/20260819190000_add_people_paddle_brand.sql`

**Interfaces:**
- Produces: `people.paddle_brand text` — consumed by Task 2's action and Task 3's page.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260819190000_add_people_paddle_brand.sql`:

```sql
alter table public.people add column paddle_brand text;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260819190000_add_people_paddle_brand.sql
git commit -m "feat: add paddle_brand migration"
```

Note: not applied to the live database in this task — that happens in Task 4.

---

### Task 2: `PADDLE_BRAND_OPTIONS` constant + action field

**Files:**
- Modify: `apps/organizer-web/lib/people/profileOptions.ts`
- Modify: `apps/organizer-web/app/people/[id]/actions.ts`

**Interfaces:**
- Produces: `PADDLE_BRAND_OPTIONS` (same `{value, label}[]` shape as the other 3 constants), and `updatePersonProfile` writing `paddle_brand` — both consumed by Task 3's page.

- [ ] **Step 1: Append the option constant**

In `apps/organizer-web/lib/people/profileOptions.ts`, find:

```typescript
export const STRENGTH_OPTIONS = [
  { value: 'power', label: 'Power' },
  { value: 'consistency', label: 'Consistency' },
  { value: 'net_play', label: 'Net Play' },
  { value: 'serve', label: 'Serve' },
  { value: 'footwork', label: 'Footwork' },
  { value: 'strategy', label: 'Strategy' },
] as const;
```

Replace with:

```typescript
export const STRENGTH_OPTIONS = [
  { value: 'power', label: 'Power' },
  { value: 'consistency', label: 'Consistency' },
  { value: 'net_play', label: 'Net Play' },
  { value: 'serve', label: 'Serve' },
  { value: 'footwork', label: 'Footwork' },
  { value: 'strategy', label: 'Strategy' },
] as const;

export const PADDLE_BRAND_OPTIONS = [
  { value: 'selkirk_boomstick', label: 'Selkirk Boomstick' },
  { value: 'selkirk_omni', label: 'Selkirk Omni' },
  { value: 'joola_perseus_4_5', label: 'Joola Perseus 4/5' },
  { value: 'joola_agassi', label: 'Joola Agassi' },
  { value: 'bread_and_butter', label: 'Bread and Butter' },
  { value: 'rpm', label: 'RPM' },
] as const;
```

- [ ] **Step 2: Add the field to `updatePersonProfile`**

In `apps/organizer-web/app/people/[id]/actions.ts`, find:

```typescript
  const handedness = (formData.get('handedness') as string) || null;
  const playingStyle = (formData.get('playingStyle') as string) || null;
  const strengths = formData.getAll('strengths') as string[];

  const { error } = await supabase
    .from('people')
    .update({ name, age, handedness, playing_style: playingStyle, strengths })
    .eq('id', personId);
```

Replace with:

```typescript
  const handedness = (formData.get('handedness') as string) || null;
  const playingStyle = (formData.get('playingStyle') as string) || null;
  const paddleBrand = (formData.get('paddleBrand') as string) || null;
  const strengths = formData.getAll('strengths') as string[];

  const { error } = await supabase
    .from('people')
    .update({ name, age, handedness, playing_style: playingStyle, paddle_brand: paddleBrand, strengths })
    .eq('id', personId);
```

- [ ] **Step 3: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds (or fails only on unknown-column typing, same expected/benign caveat as the original Player Profile Editing plan — this codebase has no generated Supabase `Database` types, so this has never actually caused a failure in practice); all 148 tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/organizer-web/lib/people/profileOptions.ts "apps/organizer-web/app/people/[id]/actions.ts"
git commit -m "feat: add PADDLE_BRAND_OPTIONS and wire paddle_brand into updatePersonProfile"
```

---

### Task 3: Wire Paddle Brand into the Player Detail page

**Files:**
- Modify: `apps/organizer-web/app/people/[id]/page.tsx`

**Interfaces:**
- Consumes: `PADDLE_BRAND_OPTIONS` from `@/lib/people/profileOptions` (Task 2).

- [ ] **Step 1: Add the import and widen the `person` query**

Find:

```tsx
import { HANDEDNESS_OPTIONS, PLAYING_STYLE_OPTIONS, STRENGTH_OPTIONS } from '@/lib/people/profileOptions';
```

Replace with:

```tsx
import { HANDEDNESS_OPTIONS, PLAYING_STYLE_OPTIONS, STRENGTH_OPTIONS, PADDLE_BRAND_OPTIONS } from '@/lib/people/profileOptions';
```

Find:

```tsx
    .select('id, name, handedness, age, playing_style, strengths')
```

Replace with:

```tsx
    .select('id, name, handedness, age, playing_style, paddle_brand, strengths')
```

- [ ] **Step 2: Add paddle brand to the profile summary**

Find:

```tsx
    person.playing_style
      ? (PLAYING_STYLE_OPTIONS.find((s) => s.value === person.playing_style)?.label ?? null)
      : null,
    strengthLabels.length > 0 ? strengthLabels.join(', ') : null,
  ].filter((part): part is string => Boolean(part));
```

Replace with:

```tsx
    person.playing_style
      ? (PLAYING_STYLE_OPTIONS.find((s) => s.value === person.playing_style)?.label ?? null)
      : null,
    person.paddle_brand
      ? (PADDLE_BRAND_OPTIONS.find((p) => p.value === person.paddle_brand)?.label ?? null)
      : null,
    strengthLabels.length > 0 ? strengthLabels.join(', ') : null,
  ].filter((part): part is string => Boolean(part));
```

- [ ] **Step 3: Add the dropdown to the edit form**

Find:

```tsx
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
```

Replace with:

```tsx
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
            <label className="text-sm font-semibold text-slate-700">
              Paddle Brand
              <select name="paddleBrand" defaultValue={person.paddle_brand ?? ''} className={`${inputClass} mt-1`}>
                <option value="">Not set</option>
                {PADDLE_BRAND_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
```

- [ ] **Step 4: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 148 tests pass.

- [ ] **Step 5: Commit**

```bash
git add "apps/organizer-web/app/people/[id]/page.tsx"
git commit -m "feat: add Paddle Brand to the player profile edit form and summary"
```

---

### Task 4: Apply the migration, push, verify CI, manual regression

**Files:** none (verification-only task).

- [ ] **Step 1: Apply the migration to the live database**

Using a fresh, transient Supabase personal access token (never persisted to disk), apply Task 1's migration via the Supabase Management API's SQL execution endpoint. Verify afterward: `people.paddle_brand` exists, nullable, existing rows read `null`.

- [ ] **Step 2: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 3: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 4: Manual regression**

On a player's `/people/[id]` page:

- Open "Edit Profile", confirm a "Paddle Brand" dropdown appears with the 6 options plus "Not set".
- Select "Selkirk Boomstick", save, confirm the profile summary line now includes it (e.g. "Right-handed · Age 34 · All-Court · Selkirk Boomstick · Power, Serve").
- Re-open Edit Profile and confirm "Selkirk Boomstick" is pre-selected.
- Click "Share Stats" and confirm the paddle brand appears in the generated PDF's profile summary line too (no extra steps needed — it flows through automatically).

Clean up any disposable test data used for this check afterward.
