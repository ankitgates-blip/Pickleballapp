# PDF Profile Labeled Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reformat the player profile section of the PDF stats export from a single joined summary line into labeled `Label: Value` rows (Handedness, Age, Playing Style, Paddle Brand, Signature Shot, Strengths), each omitted when unset.

**Architecture:** `SharePlayerStatsButtonProps` swaps its single `profileSummary: string | null` prop for the six individual already-computed values; `page.tsx` extracts the label lookups it already performs into named variables and passes them through. The PDF rendering loop replaces the single `doc.text(profileSummary, ...)` call with a loop over the set fields.

**Tech Stack:** Next.js Server Components, jsPDF (client-side).

## Global Constraints

- Scope is the PDF export only — the on-page profile summary line (`{profileSummary && <p>...}` in `page.tsx`) is unaffected and must render byte-identical output to before.
- Row order: Handedness, Age, Playing Style, Paddle Brand, Signature Shot, Strengths.
- Any field not set for that player is omitted entirely — no "Not set" placeholder.
- The player's name stays as the existing bold heading line — no separate "Name:" row.
- This touches two files that must change together in one task: `SharePlayerStatsButtonProps` and its only caller in `page.tsx` are coupled by shared prop names/types, so splitting them across commits would leave the build broken in between.

---

### Task 1: Replace `profileSummary` with individual labeled fields

**Files:**
- Modify: `apps/organizer-web/app/people/[id]/page.tsx`
- Modify: `apps/organizer-web/app/people/[id]/SharePlayerStatsButton.tsx`

**Interfaces:**
- `SharePlayerStatsButtonProps` loses `profileSummary: string | null` and gains `handedness: string | null`, `age: number | null`, `playingStyle: string | null`, `paddleBrand: string | null`, `signatureShot: string | null`, `strengths: string[]`.

Do the `SharePlayerStatsButton.tsx` edits first (Steps 1-2), then the
`page.tsx` edits (Steps 3-4), then build once at the end (Step 5) — this
order doesn't change correctness (both files land in the same commit
either way) but keeps each edit's diff easy to reason about in isolation
before checking the pair compiles together.

- [ ] **Step 1: Update `SharePlayerStatsButtonProps` and the destructured params**

In `apps/organizer-web/app/people/[id]/SharePlayerStatsButton.tsx`, find:

```tsx
type SharePlayerStatsButtonProps = {
  personName: string;
  photoUrl: string | null;
  lastPlayedDate: string | null;
  starLabel: string;
  profileSummary: string | null;
  thisMonthGamesWon: number;
```

Replace with:

```tsx
type SharePlayerStatsButtonProps = {
  personName: string;
  photoUrl: string | null;
  lastPlayedDate: string | null;
  starLabel: string;
  handedness: string | null;
  age: number | null;
  playingStyle: string | null;
  paddleBrand: string | null;
  signatureShot: string | null;
  strengths: string[];
  thisMonthGamesWon: number;
```

Find:

```tsx
export default function SharePlayerStatsButton({
  personName,
  photoUrl,
  lastPlayedDate,
  starLabel,
  profileSummary,
  thisMonthGamesWon,
```

Replace with:

```tsx
export default function SharePlayerStatsButton({
  personName,
  photoUrl,
  lastPlayedDate,
  starLabel,
  handedness,
  age,
  playingStyle,
  paddleBrand,
  signatureShot,
  strengths,
  thisMonthGamesWon,
```

- [ ] **Step 2: Replace the PDF's summary line with labeled rows**

Find:

```tsx
      if (profileSummary) {
        doc.text(profileSummary, 14, y);
        y += 8;
      }
```

Replace with:

```tsx
      const profileRows: [string, string][] = [
        handedness ? (['Handedness', handedness] as [string, string]) : null,
        age !== null ? (['Age', String(age)] as [string, string]) : null,
        playingStyle ? (['Playing Style', playingStyle] as [string, string]) : null,
        paddleBrand ? (['Paddle Brand', paddleBrand] as [string, string]) : null,
        signatureShot ? (['Signature Shot', signatureShot] as [string, string]) : null,
        strengths.length > 0 ? (['Strengths', strengths.join(', ')] as [string, string]) : null,
      ].filter((row): row is [string, string] => row !== null);

      for (const [label, value] of profileRows) {
        doc.text(`${label}: ${value}`, 14, y);
        y += 6;
      }
```

The `y += 2;` line immediately following this block (before `ensureSpace(20)`)
is untouched — it still runs unconditionally, preserving the existing fixed
gap before "This Month" regardless of how many profile rows printed.

- [ ] **Step 3: Extract the label lookups in `page.tsx` into named variables**

In `apps/organizer-web/app/people/[id]/page.tsx`, find:

```tsx
  const strengthLabels = (person.strengths ?? []).map(
    (s: string) => STRENGTH_OPTIONS.find((o) => o.value === s)?.label ?? s
  );
  const profileSummaryParts = [
    person.handedness
      ? (HANDEDNESS_OPTIONS.find((h) => h.value === person.handedness)?.label ?? null)
      : null,
    person.age ? `Age ${person.age}` : null,
    person.playing_style
      ? (PLAYING_STYLE_OPTIONS.find((s) => s.value === person.playing_style)?.label ?? null)
      : null,
    person.paddle_brand
      ? (PADDLE_BRAND_OPTIONS.find((p) => p.value === person.paddle_brand)?.label ?? null)
      : null,
    strengthLabels.length > 0 ? strengthLabels.join(', ') : null,
  ].filter((part): part is string => Boolean(part));
  const profileSummary = profileSummaryParts.length > 0 ? profileSummaryParts.join(' · ') : null;
```

Replace with:

```tsx
  const strengthLabels = (person.strengths ?? []).map(
    (s: string) => STRENGTH_OPTIONS.find((o) => o.value === s)?.label ?? s
  );
  const handednessLabel = person.handedness
    ? (HANDEDNESS_OPTIONS.find((h) => h.value === person.handedness)?.label ?? null)
    : null;
  const playingStyleLabel = person.playing_style
    ? (PLAYING_STYLE_OPTIONS.find((s) => s.value === person.playing_style)?.label ?? null)
    : null;
  const paddleBrandLabel = person.paddle_brand
    ? (PADDLE_BRAND_OPTIONS.find((p) => p.value === person.paddle_brand)?.label ?? null)
    : null;
  const profileSummaryParts = [
    handednessLabel,
    person.age ? `Age ${person.age}` : null,
    playingStyleLabel,
    paddleBrandLabel,
    strengthLabels.length > 0 ? strengthLabels.join(', ') : null,
  ].filter((part): part is string => Boolean(part));
  const profileSummary = profileSummaryParts.length > 0 ? profileSummaryParts.join(' · ') : null;
```

This is a pure refactor — `profileSummary`'s computed value is byte-identical
to before for every input, since `handednessLabel`/`playingStyleLabel`/
`paddleBrandLabel` are the exact same expressions, just named. The on-page
`{profileSummary && <p>...}` render is untouched and unaffected.

- [ ] **Step 4: Pass the individual fields to `SharePlayerStatsButton`**

Find:

```tsx
        <SharePlayerStatsButton
          personName={person.name}
          photoUrl={person.photo_url}
          lastPlayedDate={stats.lastPlayedDate}
          starLabel={starLabel}
          profileSummary={profileSummary}
          thisMonthGamesWon={thisMonth.gamesWon}
```

Replace with:

```tsx
        <SharePlayerStatsButton
          personName={person.name}
          photoUrl={person.photo_url}
          lastPlayedDate={stats.lastPlayedDate}
          starLabel={starLabel}
          handedness={handednessLabel}
          age={person.age}
          playingStyle={playingStyleLabel}
          paddleBrand={paddleBrandLabel}
          signatureShot={person.signature_shot}
          strengths={strengthLabels}
          thisMonthGamesWon={thisMonth.gamesWon}
```

- [ ] **Step 5: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors (the `profileSummary`
prop is removed from both its definition and its only call site together,
and the 6 new props are supplied with matching types); all 156 tests still
pass — this task changes no tested pure-function logic.

- [ ] **Step 6: Commit**

```bash
git add "apps/organizer-web/app/people/[id]/page.tsx" "apps/organizer-web/app/people/[id]/SharePlayerStatsButton.tsx"
git commit -m "feat: reformat PDF player profile section as labeled rows"
```

---

### Task 2: Push, verify CI, manual regression

**Files:** none (verification-only task). No database migration is needed
— this task touches no schema.

- [ ] **Step 1: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 2: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 3: Manual regression**

On a player's `/people/[id]` page whose profile has at least Handedness,
Age, Playing Style, Paddle Brand, Signature Shot, and one Strength set:

- Confirm the on-page profile summary line (the single joined "Left-handed
  · Age 41 · ..." line above "Edit Profile") looks exactly as it did
  before — unchanged.
- Click "📤 Share Stats" and open the generated PDF — confirm the profile
  section now shows 6 separate lines, each `Label: Value`, in the order
  Handedness / Age / Playing Style / Paddle Brand / Signature Shot /
  Strengths, and that Signature Shot appears (previously it never did).
- On a player with only SOME fields set (e.g. just Age), confirm the PDF
  only shows that one row, with no "Not set" lines for the rest.
- On a player with NO profile fields set at all, confirm the PDF shows no
  profile rows and the layout right after "Last played" flows straight
  into "This Month" with the same small gap as before.

Clean up any disposable test data used for this check afterward.
