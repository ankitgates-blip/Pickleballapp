# Signature Shot Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text "Signature Shot" profile field with a multi-select of up to 4 skill badges (emoji + skill name + funny badge name), picked from a fixed 30-entry list.

**Architecture:** `people.signature_shot` changes from nullable `text` to `text[] not null default '{}'`, mirroring `strengths`. A new `SIGNATURE_SHOT_OPTIONS` constant holds all 30 badges. `updatePersonProfile` reads multiple checkbox values (like `strengths` already does) with a max-4 server-side check. The edit form, page display, and PDF export are all updated to work with an array of badges instead of one string.

**Tech Stack:** Next.js App Router Server Actions, Supabase Postgres, jsPDF (client-side).

## Global Constraints

- Row/column name stays `signature_shot` (now `text[]`) — no field rename.
- Badge `value` is the stored identifier (snake_case slug); `emoji`/`skillName`/`funnyName` are display-only, sourced from `SIGNATURE_SHOT_OPTIONS`.
- Max 4 badges, enforced server-side only (no live JS disabling): `updatePersonProfile` throws `Error('Choose at most 4 signature shot badges')` if more than 4 are submitted, before any DB call.
- No per-value whitelist validation against `SIGNATURE_SHOT_OPTIONS` — matches how `strengths` already works.
- Badge display format everywhere (page pills, PDF): `emoji SkillName — FunnyName`.
- Omitted entirely when a player has no badges selected — same omit-if-empty behavior as every other optional profile field.

---

### Task 1: Migration — `signature_shot` becomes `text[]`

**Files:**
- Create: `supabase/migrations/20260820170000_signature_shot_to_array.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260820170000_signature_shot_to_array.sql`:

```sql
alter table public.people
  alter column signature_shot type text[]
    using case when signature_shot is null then array[]::text[] else array[signature_shot] end,
  alter column signature_shot set default '{}',
  alter column signature_shot set not null;
```

Every existing player's `signature_shot` is currently `null` (0 non-null
rows across all 48 people), so the `case` branch that would preserve old
free text (`array[signature_shot]`) is unreachable today — but it's the
technically correct general-purpose conversion regardless of whether any
data existed.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260820170000_signature_shot_to_array.sql
git commit -m "feat: convert signature_shot to a badge array column"
```

Note: not applied to the live database in this task — that happens in Task 4.

---

### Task 2: Badge options list + server-side validation

**Files:**
- Modify: `apps/organizer-web/lib/people/profileOptions.ts`
- Modify: `apps/organizer-web/app/people/[id]/actions.ts`

**Interfaces:**
- Produces: `SIGNATURE_SHOT_OPTIONS: { value: string; emoji: string; skillName: string; funnyName: string }[]` (as const), consumed by Task 3's page and edit form.

- [ ] **Step 1: Add `SIGNATURE_SHOT_OPTIONS`**

At the end of `apps/organizer-web/lib/people/profileOptions.ts`, add:

```typescript

export const SIGNATURE_SHOT_OPTIONS = [
  { value: 'power_serve', emoji: '🚀', skillName: 'Power Serve', funnyName: 'Rocket Launcher' },
  { value: 'spin_serve', emoji: '🌀', skillName: 'Spin Serve', funnyName: 'Spin Doctor' },
  { value: 'nasty_backhand', emoji: '☠️', skillName: 'Nasty Backhand', funnyName: 'Backhand Bandit' },
  { value: 'forehand_drive', emoji: '💥', skillName: 'Forehand Drive', funnyName: 'Drive By' },
  { value: 'backhand_flick', emoji: '🪄', skillName: 'Backhand Flick', funnyName: 'Flick Wizard' },
  { value: 'forehand_flick', emoji: '🎯', skillName: 'Forehand Flick', funnyName: 'Flick & Furious' },
  { value: 'smash', emoji: '💣', skillName: 'Smash', funnyName: 'Smashmouth' },
  { value: 'dink', emoji: '🥷', skillName: 'Dink', funnyName: 'Dink & Disappear' },
  { value: 'soft_dink', emoji: '🧈', skillName: 'Soft Dink', funnyName: 'Butter Hands' },
  { value: 'speed_up', emoji: '⚡', skillName: 'Speed Up', funnyName: 'Speed Demon' },
  { value: 'drop_shot', emoji: '🎯', skillName: 'Drop Shot', funnyName: 'Drop Dead' },
  { value: 'lob', emoji: '✈️', skillName: 'Lob', funnyName: 'Lob Star' },
  { value: 'volley', emoji: '🔫', skillName: 'Volley', funnyName: 'Quick Draw' },
  { value: 'block', emoji: '🛡️', skillName: 'Block', funnyName: 'Nope Button' },
  { value: 'reset', emoji: '🧊', skillName: 'Reset', funnyName: 'Cool Operator' },
  { value: 'erne', emoji: '🦅', skillName: 'Erne', funnyName: 'Erne Airlines' },
  { value: 'atp', emoji: '🚪', skillName: 'ATP', funnyName: 'Wrong Side!' },
  { value: 'around_the_post', emoji: '🐍', skillName: 'Around-the-Post', funnyName: 'Sneaky Snake' },
  { value: 'kitchen_battle', emoji: '⚔️', skillName: 'Kitchen Battle', funnyName: 'Kitchen Warrior' },
  { value: 'third_shot_drop', emoji: '🎩', skillName: 'Third Shot Drop', funnyName: 'Drop Magician' },
  { value: 'third_shot_drive', emoji: '💥', skillName: 'Third Shot Drive', funnyName: 'Third Shot Thunder' },
  { value: 'fifth_shot', emoji: '🧙', skillName: 'Fifth Shot', funnyName: 'Reset Wizard' },
  { value: 'counter_attack', emoji: '🔄', skillName: 'Counter Attack', funnyName: 'Return to Sender' },
  { value: 'reaction_speed', emoji: '⚡', skillName: 'Reaction Speed', funnyName: 'Lightning Hands' },
  { value: 'hand_battle', emoji: '👊', skillName: 'Hand Battle', funnyName: 'Hand War Hero' },
  { value: 'placement', emoji: '🎯', skillName: 'Placement', funnyName: 'Pinpoint Pest' },
  { value: 'spin', emoji: '🌀', skillName: 'Spin', funnyName: 'Spin Cycle' },
  { value: 'fake_disguise', emoji: '🃏', skillName: 'Fake / Disguise', funnyName: 'Pickle Poker' },
  { value: 'shot_variety', emoji: '🎨', skillName: 'Shot Variety', funnyName: 'Shot Shapeshifter' },
  { value: 'net_play', emoji: '🕸️', skillName: 'Net Play', funnyName: 'Net Monster' },
] as const;
```

- [ ] **Step 2: Update `updatePersonProfile`'s `signatureShot` read**

In `apps/organizer-web/app/people/[id]/actions.ts`, find:

```typescript
  const paddleBrand = (formData.get('paddleBrand') as string) || null;
  const signatureShot = (formData.get('signatureShot') as string)?.trim() || null;
  const strengths = formData.getAll('strengths') as string[];
```

Replace with:

```typescript
  const paddleBrand = (formData.get('paddleBrand') as string) || null;
  const signatureShot = formData.getAll('signatureShot') as string[];
  if (signatureShot.length > 4) {
    throw new Error('Choose at most 4 signature shot badges');
  }
  const strengths = formData.getAll('strengths') as string[];
```

The `.update({ ... signature_shot: signatureShot, ... })` call below this
needs no change — it already references the `signatureShot` variable by
name; only its runtime type changes (string → string[]), which matches
the new `text[]` column from Task 1.

- [ ] **Step 3: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors and all 156 tests
pass. The Supabase client has no generated `Database` types, so
`person.signature_shot` resolves to `any` at every call site — this means
`page.tsx` and `SharePlayerStatsButton.tsx` (still expecting the old
single-string shape at this point, since Task 3 hasn't run yet) will NOT
raise a type error from this task's change; the mismatch is a runtime
concern only, resolved once Task 3 wires the array shape through. If the
build fails for any other reason, stop and report.

- [ ] **Step 4: Commit**

```bash
git add apps/organizer-web/lib/people/profileOptions.ts "apps/organizer-web/app/people/[id]/actions.ts"
git commit -m "feat: add signature shot badge options and multi-select validation"
```

---

### Task 3: Wire badges into the edit form, page display, and PDF export

**Files:**
- Modify: `apps/organizer-web/app/people/[id]/page.tsx`
- Modify: `apps/organizer-web/app/people/[id]/SharePlayerStatsButton.tsx`

**Interfaces:**
- Consumes: `SIGNATURE_SHOT_OPTIONS` (Task 2).

This task touches both files together deliberately: `SharePlayerStatsButton`'s
`signatureShot` prop changes from `string | null` to `string[]`, and
`page.tsx` is its only caller — splitting them across commits would leave
the build broken in between. Do the `SharePlayerStatsButton.tsx` edits
first (Steps 1-2), then the `page.tsx` edits (Steps 3-7), then build once
at the end (Step 8).

- [ ] **Step 1: Update the `signatureShot` prop type**

In `apps/organizer-web/app/people/[id]/SharePlayerStatsButton.tsx`, find:

```tsx
  signatureShot: string | null;
```

Replace with:

```tsx
  signatureShot: string[];
```

- [ ] **Step 2: Update the PDF row construction for multiple badges**

Find:

```tsx
        signatureShot ? (['Signature Shot', signatureShot] as [string, string]) : null,
```

Replace with:

```tsx
        signatureShot.length > 0 ? (['Signature Shot', signatureShot.join(', ')] as [string, string]) : null,
```

- [ ] **Step 3: Widen the `profileOptions` import in `page.tsx`**

In `apps/organizer-web/app/people/[id]/page.tsx`, find:

```tsx
import { HANDEDNESS_OPTIONS, PLAYING_STYLE_OPTIONS, STRENGTH_OPTIONS, PADDLE_BRAND_OPTIONS } from '@/lib/people/profileOptions';
```

Replace with:

```tsx
import { HANDEDNESS_OPTIONS, PLAYING_STYLE_OPTIONS, STRENGTH_OPTIONS, PADDLE_BRAND_OPTIONS, SIGNATURE_SHOT_OPTIONS } from '@/lib/people/profileOptions';
```

- [ ] **Step 4: Compute the selected badges and their display labels**

Find:

```tsx
  const paddleBrandLabel = person.paddle_brand
    ? (PADDLE_BRAND_OPTIONS.find((p) => p.value === person.paddle_brand)?.label ?? null)
    : null;
  const profileSummaryParts = [
```

Replace with:

```tsx
  const paddleBrandLabel = person.paddle_brand
    ? (PADDLE_BRAND_OPTIONS.find((p) => p.value === person.paddle_brand)?.label ?? null)
    : null;
  const signatureShotBadges = (person.signature_shot ?? [])
    .map((v: string) => SIGNATURE_SHOT_OPTIONS.find((o) => o.value === v))
    .filter((b): b is (typeof SIGNATURE_SHOT_OPTIONS)[number] => Boolean(b));
  const signatureShotLabels = signatureShotBadges.map((b) => `${b.emoji} ${b.skillName} — ${b.funnyName}`);
  const profileSummaryParts = [
```

- [ ] **Step 5: Replace the italic-quote display with a row of pills**

Find:

```tsx
      {profileSummary && <p className="text-sm text-slate-500">{profileSummary}</p>}
      {person.signature_shot && (
        <p className="text-sm italic text-slate-500 mb-6">🎯 &quot;{person.signature_shot}&quot;</p>
      )}
      {!person.signature_shot && profileSummary && <div className="mb-6" />}
```

Replace with:

```tsx
      {profileSummary && <p className="text-sm text-slate-500">{profileSummary}</p>}
      {signatureShotBadges.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {signatureShotBadges.map((b) => (
            <span key={b.value} className={`${pillClass} bg-amber-50 text-amber-900`}>
              {b.emoji} {b.skillName} — {b.funnyName}
            </span>
          ))}
        </div>
      )}
      {signatureShotBadges.length === 0 && profileSummary && <div className="mb-6" />}
```

- [ ] **Step 6: Replace the free-text input with a checkbox fieldset**

Find:

```tsx
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
              <legend className="text-sm font-semibold text-slate-700 mb-1">Strengths</legend>
```

Replace with:

```tsx
            <fieldset>
              <legend className="text-sm font-semibold text-slate-700 mb-1">
                Signature Shot Badges (up to 4)
              </legend>
              <div className="flex flex-wrap gap-3">
                {SIGNATURE_SHOT_OPTIONS.map((b) => (
                  <label key={b.value} className="flex items-center gap-1.5 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      name="signatureShot"
                      value={b.value}
                      defaultChecked={(person.signature_shot ?? []).includes(b.value)}
                      className="accent-teal-600"
                    />
                    {b.emoji} {b.skillName} — {b.funnyName}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-semibold text-slate-700 mb-1">Strengths</legend>
```

- [ ] **Step 7: Pass the formatted labels to `SharePlayerStatsButton`**

Find:

```tsx
          signatureShot={person.signature_shot}
```

Replace with:

```tsx
          signatureShot={signatureShotLabels}
```

- [ ] **Step 8: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors (the `signatureShot`
prop is now `string[]` on both the component's declaration and its only
call site); all 156 tests pass.

- [ ] **Step 9: Commit**

```bash
git add "apps/organizer-web/app/people/[id]/page.tsx" "apps/organizer-web/app/people/[id]/SharePlayerStatsButton.tsx"
git commit -m "feat: wire signature shot badges into edit form, page display, and PDF"
```

---

### Task 4: Apply the migration, push, verify CI, manual regression

**Files:** none (verification-only task).

- [ ] **Step 1: Apply the migration to the live database**

Using a fresh, transient Supabase personal access token (never persisted
to disk), apply Task 1's migration via the Supabase Management API's SQL
execution endpoint. Verify afterward:
- `people.signature_shot` is `text[]`, `not null`, default `'{}'`.
- All existing rows read `{}` (empty array), not `null`.

- [ ] **Step 2: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 3: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 4: Manual regression**

On a player's `/people/[id]` page:

- Open "Edit Profile", confirm the old free-text Signature Shot input is
  gone, replaced by a "Signature Shot Badges (up to 4)" checkbox list with
  all 30 badges (emoji + skill name + funny name).
- Check exactly 4 boxes, Save — confirm the page now shows those 4 as
  pills below the profile summary line, each `emoji SkillName —
  FunnyName`.
- Re-open Edit Profile, confirm all 4 are still checked.
- Check a 5th box (5 total checked), Save — confirm a clear error appears
  and nothing was saved (still shows the previous 4 pills, not 5).
- Uncheck down to 0, Save — confirm the pill row disappears entirely.
- Click "📤 Share Stats" with some badges selected — confirm the PDF's
  "Signature Shot:" row lists all selected badges comma-joined with their
  emoji/skill/funny name.
- Confirm the existing Strengths fieldset and its behavior are completely
  unaffected.

Clean up any disposable test data used for this check afterward.
