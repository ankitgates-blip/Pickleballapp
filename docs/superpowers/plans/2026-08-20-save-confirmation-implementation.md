# Save Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a brief "✓ Saved" confirmation next to the Save Profile, Upload/Remove photo, and match-score-entry buttons after a successful save.

**Architecture:** One new reusable Client Component, `SaveButton`, using React's `useFormStatus()` hook to detect its enclosing form's pending→success transition. No changes to any surrounding form or page structure — each usage just swaps its existing `<button type="submit">` for `<SaveButton>`.

**Tech Stack:** Next.js App Router, React 19 (`useFormStatus`).

## Global Constraints

- `SaveButton` takes `children` (button label), `pendingLabel` (shown while submitting), and `className` (preserves each usage's existing exact styling) as props — no other props.
- The "✓ Saved" text appears for 2 seconds after a successful submission, then disappears.
- No changes to any server action, any form's `action` prop, or any page's data-fetching logic — this is a pure UI swap.
- Each of the 3 wiring tasks (people/[id], bracket, matches) is independent of the other two — all three only depend on `SaveButton` existing (Task 1), not on each other.

---

### Task 1: `SaveButton` component

**Files:**
- Create: `apps/organizer-web/app/components/SaveButton.tsx`

**Interfaces:**
- Produces: `SaveButton({ children: React.ReactNode; pendingLabel: string; className: string })` —
  a default export, consumed by Tasks 2-4. Must be rendered as a direct
  (or nested) child of a `<form>` element — `useFormStatus()` reads the
  nearest ancestor form's pending state.

- [ ] **Step 1: Create the component**

Create `apps/organizer-web/app/components/SaveButton.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

export default function SaveButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  const [showSaved, setShowSaved] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    wasPending.current = pending;
  }, [pending]);

  return (
    <span className="inline-flex items-center gap-2">
      <button type="submit" disabled={pending} className={className}>
        {pending ? pendingLabel : children}
      </button>
      {showSaved && <span className="text-xs font-semibold text-green-600">✓ Saved</span>}
    </span>
  );
}
```

- [ ] **Step 2: Run the build**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no TypeScript or ESLint errors (this is a
new, currently-unused file — nothing imports it yet).

- [ ] **Step 3: Commit**

```bash
git add apps/organizer-web/app/components/SaveButton.tsx
git commit -m "feat: add SaveButton component"
```

---

### Task 2: Wire `SaveButton` into the Player Detail page

**Files:**
- Modify: `apps/organizer-web/app/people/[id]/page.tsx`

**Interfaces:**
- Consumes: `SaveButton` (Task 1).

- [ ] **Step 1: Add the import**

In `apps/organizer-web/app/people/[id]/page.tsx`, find:

```tsx
import PersonAvatar from '@/app/components/PersonAvatar';
```

Replace with:

```tsx
import PersonAvatar from '@/app/components/PersonAvatar';
import SaveButton from '@/app/components/SaveButton';
```

- [ ] **Step 2: Swap the "Upload" button**

Find:

```tsx
              <button type="submit" className={primaryButtonClass}>
                Upload
              </button>
```

Replace with:

```tsx
              <SaveButton className={primaryButtonClass} pendingLabel="Uploading…">
                Upload
              </SaveButton>
```

- [ ] **Step 3: Swap the "Remove photo" button**

Find:

```tsx
                <button type="submit" className="text-xs font-semibold text-red-600 hover:underline">
                  Remove photo
                </button>
```

Replace with:

```tsx
                <SaveButton
                  className="text-xs font-semibold text-red-600 hover:underline"
                  pendingLabel="Removing…"
                >
                  Remove photo
                </SaveButton>
```

- [ ] **Step 4: Swap the "Save Profile" button**

Find:

```tsx
            <button type="submit" className={primaryButtonClass}>
              Save Profile
            </button>
```

Replace with:

```tsx
            <SaveButton className={primaryButtonClass} pendingLabel="Saving…">
              Save Profile
            </SaveButton>
```

- [ ] **Step 5: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 156 tests pass —
this task adds no new pure-function logic.

- [ ] **Step 6: Commit**

```bash
git add "apps/organizer-web/app/people/[id]/page.tsx"
git commit -m "feat: show save confirmation on the Player Detail page"
```

---

### Task 3: Wire `SaveButton` into the Bracket page's score entry

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`

**Interfaces:**
- Consumes: `SaveButton` (Task 1).

- [ ] **Step 1: Add the import**

In `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`, find:

```tsx
import RegenerateLeagueRoundsButton from './RegenerateLeagueRoundsButton';
```

Replace with:

```tsx
import RegenerateLeagueRoundsButton from './RegenerateLeagueRoundsButton';
import SaveButton from '@/app/components/SaveButton';
```

- [ ] **Step 2: Swap the score-entry "Save" button**

Find:

```tsx
                <button type="submit" className={primaryButtonClass}>
                  Save
                </button>
              </form>
```

Replace with:

```tsx
                <SaveButton className={primaryButtonClass} pendingLabel="Saving…">
                  Save
                </SaveButton>
              </form>
```

- [ ] **Step 3: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 156 tests pass.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/page.tsx"
git commit -m "feat: show save confirmation on Bracket score entry"
```

---

### Task 4: Wire `SaveButton` into the Matches page's score entry

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/matches/page.tsx`

**Interfaces:**
- Consumes: `SaveButton` (Task 1).

- [ ] **Step 1: Add the import**

In `apps/organizer-web/app/tournaments/[id]/matches/page.tsx`, find:

```tsx
import { enterScore } from './actions';
```

Replace with:

```tsx
import { enterScore } from './actions';
import SaveButton from '@/app/components/SaveButton';
```

- [ ] **Step 2: Swap the score-entry "Save" button**

Find:

```tsx
                      <button type="submit" className={primaryButtonClass}>
                        Save
                      </button>
                    </form>
```

Replace with:

```tsx
                      <SaveButton className={primaryButtonClass} pendingLabel="Saving…">
                        Save
                      </SaveButton>
                    </form>
```

- [ ] **Step 3: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 156 tests pass.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/matches/page.tsx"
git commit -m "feat: show save confirmation on Matches page score entry"
```

---

### Task 5: Push, verify CI, manual regression

**Files:** none (verification-only task). No database migration is
needed — this task touches no schema.

- [ ] **Step 1: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 2: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 3: Manual regression**

- On a player's `/people/[id]` page: edit any field, click "Save
  Profile" — confirm "✓ Saved" appears next to the button briefly, then
  disappears after ~2 seconds.
- Upload a photo — confirm the same next to "Upload". Remove it —
  confirm the same next to "Remove photo".
- On the Bracket page, enter a score for one match — confirm "✓ Saved"
  appears next to THAT match's Save button only, not any other match's
  form on the same page.
- Same check on the Matches page.
- Confirm submitting a form with invalid data (e.g. triggering a
  thrown error) still shows the app's error page as before — no change
  to error-path behavior.

Clean up any disposable test data used for this check afterward.
