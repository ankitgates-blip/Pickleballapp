# Player Stats PDF Profile Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Include a player's profile details (handedness, age, playing style, strengths) in the Player Stats PDF, matching the on-page display.

**Architecture:** `SharePlayerStatsButton` gains a `profileSummary: string | null` prop, rendered as one extra line in the PDF right after the existing "Last played / star rating" line, omitted when null. The page passes through its already-computed `profileSummary` — no new computation.

**Tech Stack:** Next.js Server/Client Components, `jspdf`.

## Global Constraints

- No new computation — reuse the `profileSummary` value `/people/[id]/page.tsx` already computes for its own on-page display.
- The line is omitted entirely from the PDF when `profileSummary` is `null` (no attributes set), matching the on-page conditional.
- No change to the on-page display, to `personStatsExport.ts`, or to any other PDF section.

---

### Task 1: Add `profileSummary` to `SharePlayerStatsButton`

**Files:**
- Modify: `apps/organizer-web/app/people/[id]/SharePlayerStatsButton.tsx`

**Interfaces:**
- Produces: `SharePlayerStatsButtonProps` gains `profileSummary: string | null`, consumed by Task 2's page wiring.

- [ ] **Step 1: Add the prop to the type and destructuring**

Find:

```tsx
type SharePlayerStatsButtonProps = {
  personName: string;
  lastPlayedDate: string | null;
  starLabel: string;
  thisMonthGamesWon: number;
```

Replace with:

```tsx
type SharePlayerStatsButtonProps = {
  personName: string;
  lastPlayedDate: string | null;
  starLabel: string;
  profileSummary: string | null;
  thisMonthGamesWon: number;
```

Find:

```tsx
export default function SharePlayerStatsButton({
  personName,
  lastPlayedDate,
  starLabel,
  thisMonthGamesWon,
```

Replace with:

```tsx
export default function SharePlayerStatsButton({
  personName,
  lastPlayedDate,
  starLabel,
  profileSummary,
  thisMonthGamesWon,
```

- [ ] **Step 2: Render the line in the PDF, right after the existing summary line**

Find:

```tsx
      doc.setFontSize(10);
      doc.text(
        [lastPlayedDate ? `Last played: ${lastPlayedDate}` : 'No matches played yet', starLabel].join(' · '),
        14,
        y
      );
      y += 10;

      ensureSpace(20);
      doc.setFontSize(12);
      doc.text('This Month', 14, y);
```

Replace with:

```tsx
      doc.setFontSize(10);
      doc.text(
        [lastPlayedDate ? `Last played: ${lastPlayedDate}` : 'No matches played yet', starLabel].join(' · '),
        14,
        y
      );
      y += 8;

      if (profileSummary) {
        doc.text(profileSummary, 14, y);
        y += 8;
      }

      y += 2;

      ensureSpace(20);
      doc.setFontSize(12);
      doc.text('This Month', 14, y);
```

(This preserves the original layout exactly when `profileSummary` is `null` — `y += 8` then `y += 2` totals the same `y += 10` the code had before — and adds one extra line plus its own spacing when it's set.)

- [ ] **Step 3: Run the build to verify it compiles**

Run: `cd apps/organizer-web && npm run build`
Expected: build fails with a TypeScript error, since `profileSummary` is now a required prop but no call site provides it yet (Task 2 fixes this) — this is EXPECTED at this point in the plan, not a defect. If the error is anything other than a missing `profileSummary` prop at the `SharePlayerStatsButton` call site in `people/[id]/page.tsx`, treat that as a real problem to report.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/people/[id]/SharePlayerStatsButton.tsx"
git commit -m "feat: add profileSummary prop to SharePlayerStatsButton"
```

---

### Task 2: Pass `profileSummary` from the Player Detail page

**Files:**
- Modify: `apps/organizer-web/app/people/[id]/page.tsx`

**Interfaces:**
- Consumes: `SharePlayerStatsButton`'s widened `SharePlayerStatsButtonProps` from Task 1 (specifically the new `profileSummary` prop).

- [ ] **Step 1: Pass the already-computed `profileSummary` value to the button**

Find:

```tsx
        <SharePlayerStatsButton
          personName={person.name}
          lastPlayedDate={stats.lastPlayedDate}
          starLabel={starLabel}
          thisMonthGamesWon={thisMonth.gamesWon}
```

Replace with:

```tsx
        <SharePlayerStatsButton
          personName={person.name}
          lastPlayedDate={stats.lastPlayedDate}
          starLabel={starLabel}
          profileSummary={profileSummary}
          thisMonthGamesWon={thisMonth.gamesWon}
```

- [ ] **Step 2: Run the build**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no TypeScript errors — this confirms Task 1's now-required `profileSummary` prop is satisfied by the page's existing `profileSummary` variable (already computed by the "Player Profile Editing" feature, no new computation needed).

- [ ] **Step 3: Run the full test suite**

Run: `cd apps/organizer-web && npm test`
Expected: all tests still pass — this task adds no new pure-function logic.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/people/[id]/page.tsx"
git commit -m "feat: include profile details in the Player Stats PDF"
```

---

### Task 3: Push and verify CI + manual regression

**Files:** none (verification-only task).

- [ ] **Step 1: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 2: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 3: Manual regression**

No database migration is needed for this feature. On a player's `/people/[id]` page:

- For a player with profile details set (via the earlier Player Profile Editing feature): click "📤 Share Stats" and confirm the PDF shows the profile summary line (e.g. "Right-handed · Age 34 · All-Court · Power, Serve") directly below the "Last played / win rate" line, before "This Month".
- For a player with NO profile details set: confirm the PDF has no blank/awkward line where the profile summary would be — layout should look identical to before this feature shipped.
- Confirm every other section of the PDF (This Month, By Location, Trends, Head-to-Head, Match History) is unaffected.

Clean up any disposable test data used for this check afterward.
