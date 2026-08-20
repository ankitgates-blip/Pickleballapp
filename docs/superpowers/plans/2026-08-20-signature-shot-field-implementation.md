# Signature Shot Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free-text "Signature Shot" field to the player profile edit form, displayed as its own quoted line (not folded into the existing badge-style profile summary).

**Architecture:** One new nullable `people.signature_shot` text column, one more optional field on the existing `updatePersonProfile` action, one more text input in the existing edit form, and a new standalone display line.

**Tech Stack:** Next.js App Router Server Actions, Supabase Postgres.

## Global Constraints

- `people.signature_shot` is nullable, free text, no fixed options (unlike handedness/playing_style/paddle_brand).
- Displayed as its own line, separate from the `profileSummary` badge-style joined string — never appended into that string.
- No new RLS policy needed — `people_update_own` already covers this.

---

### Task 1: Migration — add `signature_shot` to `people`

**Files:**
- Create: `supabase/migrations/20260820120000_add_people_signature_shot.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260820120000_add_people_signature_shot.sql`:

```sql
alter table public.people add column signature_shot text;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260820120000_add_people_signature_shot.sql
git commit -m "feat: add signature_shot migration"
```

Note: not applied to the live database in this task — that happens in Task 3.

---

### Task 2: Wire `signatureShot` into the action and edit form

**Files:**
- Modify: `apps/organizer-web/app/people/[id]/actions.ts`
- Modify: `apps/organizer-web/app/people/[id]/page.tsx`

**Interfaces:**
- No new exports — `updatePersonProfile` keeps its exact signature, only its internals gain one more field.

- [ ] **Step 1: Add the field to `updatePersonProfile`**

In `apps/organizer-web/app/people/[id]/actions.ts`, find:

```typescript
  const paddleBrand = (formData.get('paddleBrand') as string) || null;
  const strengths = formData.getAll('strengths') as string[];

  const { error } = await supabase
    .from('people')
    .update({ name, age, handedness, playing_style: playingStyle, paddle_brand: paddleBrand, strengths })
    .eq('id', personId);
```

Replace with:

```typescript
  const paddleBrand = (formData.get('paddleBrand') as string) || null;
  const signatureShot = (formData.get('signatureShot') as string)?.trim() || null;
  const strengths = formData.getAll('strengths') as string[];

  const { error } = await supabase
    .from('people')
    .update({
      name,
      age,
      handedness,
      playing_style: playingStyle,
      paddle_brand: paddleBrand,
      signature_shot: signatureShot,
      strengths,
    })
    .eq('id', personId);
```

- [ ] **Step 2: Widen the `person` query**

In `apps/organizer-web/app/people/[id]/page.tsx`, find:

```tsx
  const { data: person } = await supabase
    .from('people')
    .select('id, name, handedness, age, playing_style, paddle_brand, strengths')
    .eq('id', id)
    .eq('organizer_id', organizer.id)
    .single();
```

Replace with:

```tsx
  const { data: person } = await supabase
    .from('people')
    .select('id, name, handedness, age, playing_style, paddle_brand, signature_shot, strengths')
    .eq('id', id)
    .eq('organizer_id', organizer.id)
    .single();
```

- [ ] **Step 3: Render the signature shot display line**

Find:

```tsx
      {profileSummary && <p className="text-sm text-slate-500 mb-6">{profileSummary}</p>}

      <div className="mb-6">
        <details>
```

Replace with:

```tsx
      {profileSummary && <p className="text-sm text-slate-500">{profileSummary}</p>}
      {person.signature_shot && (
        <p className="text-sm italic text-slate-500 mb-6">🎯 &quot;{person.signature_shot}&quot;</p>
      )}
      {!person.signature_shot && profileSummary && <div className="mb-6" />}

      <div className="mb-6">
        <details>
```

- [ ] **Step 4: Add the input to the edit form**

Find:

```tsx
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

Replace with:

```tsx
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
            <label className="text-sm font-semibold text-slate-700">
              Signature Shot
              <input
                type="text"
                name="signatureShot"
                defaultValue={person.signature_shot ?? ''}
                placeholder="e.g. Nasty backhand slam"
                className={`${inputClass} mt-1`}
              />
            </label>
            <fieldset>
```

- [ ] **Step 5: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 148 tests still pass — this task adds no new pure-function logic.

- [ ] **Step 6: Commit**

```bash
git add "apps/organizer-web/app/people/[id]/actions.ts" "apps/organizer-web/app/people/[id]/page.tsx"
git commit -m "feat: add Signature Shot field to player profile"
```

---

### Task 3: Apply the migration, push, verify CI, manual regression

**Files:** none (verification-only task).

- [ ] **Step 1: Apply the migration to the live database**

Using a fresh, transient Supabase personal access token (never persisted to disk), apply Task 1's migration via the Supabase Management API's SQL execution endpoint. Verify afterward: `people.signature_shot` exists, nullable, existing rows read `null`.

- [ ] **Step 2: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 3: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 4: Manual regression**

On a player's `/people/[id]` page:

- Open "Edit Profile", confirm a "Signature Shot" text input appears after "Paddle Brand", with the placeholder text.
- Type something like "Nasty backhand slam", save, confirm it now shows as its own quoted line (🎯 "Nasty backhand slam") below the badge-style profile summary line, NOT joined into that line.
- Re-open Edit Profile and confirm the text is pre-filled.
- Clear it and save, confirm the quoted line disappears entirely (not shown empty).
- Confirm the existing badge-style summary line (handedness/age/playing style/paddle brand/strengths) is unaffected by any of this.

Clean up any disposable test data used for this check afterward.
